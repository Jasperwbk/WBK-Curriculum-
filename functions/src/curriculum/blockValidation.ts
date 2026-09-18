import { isValidSubject } from "../subjects";
import { WEEK1_OBJECTIVES } from "./weeklyObjectives";
import { buildObjectiveId, weekdayOrdinalBase } from "./objectiveId";
import type {
  ActivityFormat,
  InstructionalStage,
  LearningBlock,
  PlacementKidKey,
  Quarter,
  RemediationIntent,
  RetrievalReason,
  Subject,
} from "../types";

/**
 * Deterministic, defensive validation/defaulting of the structured
 * learningBlocks Claude returns (build-order step 5, requirement 11) —
 * "generation creates a PROPOSAL; teacher authority remains final," and
 * this file is what stands between an arbitrary model JSON blob and a
 * document that actually gets written to Firestore. Never trusts:
 *  - an AI-supplied objectiveId (ids are always assigned here — see
 *    curriculum/objectiveId.ts — Claude only supplies plain-text
 *    objective DESCRIPTIONS, matching how it already writes block
 *    descriptions in step 4)
 *  - an AI-supplied ordering (order is always the block's position in
 *    the final validated array)
 *  - an AI-claimed stage/format/reason outside the known enums (falls
 *    back to a safe default rather than storing garbage)
 * A malformed or missing individual block is DROPPED, not kept — one bad
 * entry never corrupts the rest. If EVERY entry is unusable (or the
 * field wasn't a usable array at all), a single, deliberately minimal
 * fallback block is returned instead of publishing nothing or crashing
 * generation entirely — see FALLBACK_BLOCK.
 */

const VALID_STAGES: ReadonlySet<string> = new Set<InstructionalStage>([
  "warmup_retrieval",
  "teach_model",
  "guided_practice",
  "independent_practice",
  "assessment_check",
  "application_transfer",
  "reflection_metacognition",
  "enrichment",
]);

const VALID_RETRIEVAL_REASONS: ReadonlySet<string> = new Set<RetrievalReason>([
  "recent_retrieval",
  "spaced_revisit",
  "interleaved_practice",
  "delayed_retention_check",
]);

const VALID_ACTIVITY_FORMATS: ReadonlySet<string> = new Set<ActivityFormat>([
  "printable",
  "hands_on",
  "digital",
  "discussion",
]);

const MIN_MINUTES = 5;
const MAX_MINUTES = 120;
const DEFAULT_MINUTES = 20;
const MAX_OBJECTIVES_PER_BLOCK = 3;

export interface ObjectiveIdScope {
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
  date: string; // ISO "YYYY-MM-DD" — see weekdayOrdinalBase
}

export interface MasteryContext {
  masteredObjectiveIdsBySubject: Partial<Record<Subject, string[]>>;
  inProgressObjectiveIdsBySubject: Partial<Record<Subject, string[]>>;
}

export interface ValidateBlocksParams {
  raw: unknown; // whatever Claude's parsed JSON put at learningBlocks
  studentId: string;
  /** null when kidKey/quarterAndWeek couldn't resolve (e.g. date outside the school year) — objectiveIds are then always []; there's no stable scope to allocate into. */
  scope: ObjectiveIdScope | null;
  mastery: MasteryContext;
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
}

/** A deliberately minimal, always-valid block used only when nothing in the AI's response survives validation — never silently publishes malformed curriculum in its place. */
function fallbackBlock(params: ValidateBlocksParams): LearningBlock {
  return {
    blockId: "b1",
    studentId: params.studentId,
    subject: "reading_language_arts",
    title: "Today's Lesson",
    objectiveIds: [],
    stage: "teach_model",
    estimatedMinutes: 60,
    required: true,
    completionState: "not_started",
    dependsOn: [],
    teacherLocked: false,
    order: 0,
    sourceQuarterCertificationId: params.sourceQuarterCertificationId,
    sourceWeeklyCertificationId: params.sourceWeeklyCertificationId,
  };
}

interface RawRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : null;
}

function clampMinutes(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n));
}

function deriveRemediationIntent(
  stage: InstructionalStage,
  objectiveIds: readonly string[],
  inProgressIds: readonly string[]
): RemediationIntent {
  if (stage === "assessment_check") return "assessment";
  if (objectiveIds.some((id) => inProgressIds.includes(id))) return "remediation";
  if (stage === "warmup_retrieval") return "retrieval";
  return "initial_instruction";
}

/**
 * Assigns real objectiveIds for one block's objective descriptions.
 * Precedence:
 *   1. Retrieval-stage blocks reuse REAL existing ids from the student's
 *      mastery context for this subject (evidence lands against the
 *      objective it's actually retrieving) — falls through to (3) if
 *      nothing's tracked yet for this subject.
 *   2. A week-1 Millaray/Makaio catalog entry (WEEK1_OBJECTIVES) exists
 *      for this subject -> reuse its ids wholesale for this subject
 *      (coarse: not matched per individual description — see the doc
 *      comment on preserveExistingIds below).
 *   3. Otherwise, allocate fresh ids from the deterministic, date-derived
 *      ordinal base (curriculum/objectiveId.ts) — never derived from the
 *      description text itself.
 */
function assignObjectiveIds(
  descriptions: readonly string[],
  subject: Subject,
  stage: InstructionalStage,
  scope: ObjectiveIdScope | null,
  mastery: MasteryContext,
  freshOrdinalCounters: Map<Subject, number>
): string[] {
  if (descriptions.length === 0 || !scope) return [];

  if (stage === "warmup_retrieval") {
    const pool = mastery.masteredObjectiveIdsBySubject[subject] ?? [];
    if (pool.length > 0) {
      return pool.slice(0, Math.min(descriptions.length, pool.length));
    }
  }

  // Coarse catalog reuse: only the one week/kidKey combination that
  // currently has a hand-authored catalog (weeklyObjectives.ts's own doc
  // comment: "Week 1 only, deliberately... prove the mechanism before
  // transcribing the other 8 weeks"). Tags the block with the catalog's
  // FULL objective set for this subject rather than trying to fuzzy-match
  // which specific one(s) the AI's description text refers to — safer
  // than guessing, and still satisfies "preserve existing ids" exactly.
  if ((scope.kidKey === "millaray" || scope.kidKey === "makaio") && scope.week === 1) {
    const catalogIds = WEEK1_OBJECTIVES[scope.kidKey].filter((o) => o.subject === subject).map((o) => o.id);
    if (catalogIds.length > 0) return catalogIds;
  }

  const base = weekdayOrdinalBase(scope.date) * 10;
  const startAt = freshOrdinalCounters.get(subject) ?? 0;
  const ids = descriptions
    .slice(0, MAX_OBJECTIVES_PER_BLOCK)
    .map((_, i) => buildObjectiveId(scope.kidKey, scope.week, subject, base + startAt + i + 1));
  freshOrdinalCounters.set(subject, startAt + ids.length);
  return ids;
}

interface NormalizedDraft {
  rawIndex: number;
  dependsOnIndex: number[];
  block: Omit<LearningBlock, "blockId" | "order" | "dependsOn">;
}

function normalizeOneBlock(
  raw: unknown,
  rawIndex: number,
  params: ValidateBlocksParams,
  freshOrdinalCounters: Map<Subject, number>
): NormalizedDraft | null {
  const record = asRecord(raw);
  if (!record) return null;

  const subject = record.subject;
  if (typeof subject !== "string" || !isValidSubject(subject)) return null;

  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : "Untitled block";
  const stage: InstructionalStage =
    typeof record.stage === "string" && VALID_STAGES.has(record.stage) ? (record.stage as InstructionalStage) : "teach_model";
  const estimatedMinutes = clampMinutes(record.estimatedMinutes);
  const required = typeof record.required === "boolean" ? record.required : true;
  const activityFormat: ActivityFormat | undefined =
    typeof record.activityFormat === "string" && VALID_ACTIVITY_FORMATS.has(record.activityFormat)
      ? (record.activityFormat as ActivityFormat)
      : undefined;
  const notes = typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : undefined;

  const descriptions = Array.isArray(record.objectiveDescriptions)
    ? record.objectiveDescriptions.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];
  const objectiveIds = assignObjectiveIds(descriptions, subject, stage, params.scope, params.mastery, freshOrdinalCounters);

  let retrievalReason: RetrievalReason | undefined;
  if (stage === "warmup_retrieval") {
    retrievalReason =
      typeof record.retrievalReason === "string" && VALID_RETRIEVAL_REASONS.has(record.retrievalReason)
        ? (record.retrievalReason as RetrievalReason)
        : "recent_retrieval";
  }

  const inProgressIds = params.mastery.inProgressObjectiveIdsBySubject[subject] ?? [];
  const remediationIntent = deriveRemediationIntent(stage, objectiveIds, inProgressIds);

  const dependsOnIndex = Array.isArray(record.dependsOnIndex)
    ? record.dependsOnIndex.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < rawIndex)
    : [];

  return {
    rawIndex,
    dependsOnIndex,
    block: {
      studentId: params.studentId,
      subject,
      title,
      objectiveIds,
      stage,
      estimatedMinutes,
      required,
      completionState: "not_started",
      teacherLocked: false,
      sourceQuarterCertificationId: params.sourceQuarterCertificationId,
      sourceWeeklyCertificationId: params.sourceWeeklyCertificationId,
      ...(retrievalReason ? { retrievalReason } : {}),
      remediationIntent,
      ...(activityFormat ? { activityFormat } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

export function validateAndNormalizeBlocks(params: ValidateBlocksParams): LearningBlock[] {
  const rawArray = Array.isArray(params.raw) ? params.raw : [];
  const freshOrdinalCounters = new Map<Subject, number>();

  const normalized = rawArray
    .map((raw, i) => normalizeOneBlock(raw, i, params, freshOrdinalCounters))
    .filter((n): n is NormalizedDraft => n !== null);

  if (normalized.length === 0) {
    return [fallbackBlock(params)];
  }

  const rawIndexToBlockId = new Map<number, string>();
  normalized.forEach((n, finalIndex) => {
    rawIndexToBlockId.set(n.rawIndex, `b${finalIndex + 1}`);
  });

  return normalized.map((n, finalIndex) => {
    const blockId = rawIndexToBlockId.get(n.rawIndex) as string;
    const dependsOn = n.dependsOnIndex
      .map((rawIdx) => rawIndexToBlockId.get(rawIdx))
      .filter((id): id is string => id !== undefined && id !== blockId)
      .map((id) => ({ blockId: id }));
    return { ...n.block, blockId, order: finalIndex, dependsOn };
  });
}
