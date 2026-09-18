import type { Timestamp } from "firebase-admin/firestore";
import type {
  ArtifactReference,
  EvidenceBlockEntry,
  EvidenceDemonstrationType,
  EvidenceOutcome,
  EvidenceSourceType,
  ObjectiveEvidenceItem,
  PacketBlockCompletionState,
} from "../types";

/**
 * Validates/merges a teacher's submitted block edits onto a packet's
 * AUTHORITATIVE source blocks (build-order step 6) — the evidence
 * counterpart to curriculum/blockValidation.ts, except the input here is
 * direct teacher input rather than AI output, so the philosophy is
 * different: malformed AI output is silently defaulted/dropped (a
 * proposal, never trusted anyway); malformed TEACHER input is rejected
 * with a clear error, because the teacher is the one editing this and
 * deserves a real error rather than a silent correction.
 *
 * What's never accepted from the client, regardless of what it sends:
 * blockId, subject, title, required, objectiveIds, plannedMinutes,
 * sourceQuarterCertificationId, sourceWeeklyCertificationId, carryForward
 * — every one of these comes from `sourceBlocks` (the packet's own
 * authoritative record, seeded from the approved ProposedDay at packet-
 * creation time), never from request.data. Only a teacher's own
 * observations/minutes/completion/eligibility are ever client-writable.
 */

const VALID_COMPLETION_STATES: ReadonlySet<string> = new Set<PacketBlockCompletionState>([
  "not_started",
  "in_progress",
  "completed",
  "excused",
]);

const VALID_DEMONSTRATION_TYPES: ReadonlySet<string> = new Set<EvidenceDemonstrationType>([
  "written_response",
  "verbal_explanation",
  "tap_show_me",
  "matching",
  "pointing",
  "sorting",
  "naming",
  "physical_demonstration",
  "guided_play",
  "teacher_observation_only",
]);

const VALID_OUTCOMES: ReadonlySet<string> = new Set<EvidenceOutcome>([
  "correct",
  "incorrect",
  "partial",
  "observed_strong",
  "observed_weak",
  "not_applicable",
]);

const VALID_SOURCE_TYPES: ReadonlySet<string> = new Set<EvidenceSourceType>([
  "teacher_observation",
  "student_response",
  "worksheet",
  "app_activity",
  "field_activity",
  "project",
  "assessment",
]);

const VALID_ARTIFACT_KINDS: ReadonlySet<string> = new Set<ArtifactReference["kind"]>([
  "worksheet",
  "notebook_page",
  "drawing",
  "project",
  "field_observation",
  "app_activity",
  "photo",
  "other",
]);

const MAX_REPORTED_MINUTES = 480; // 8 hours — generous upper bound, catches obvious data-entry mistakes without being strict

export type MergeResult = { ok: true; blocks: EvidenceBlockEntry[] } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateArtifacts(raw: unknown, blockId: string, index: number): ArtifactReference[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return `Block "${blockId}" evidence item ${index}: artifacts must be an array.`;
  const artifacts: ArtifactReference[] = [];
  for (const [i, item] of raw.entries()) {
    if (!isRecord(item)) return `Block "${blockId}" evidence item ${index} artifact ${i}: must be an object.`;
    const kind = item.kind;
    if (typeof kind !== "string" || !VALID_ARTIFACT_KINDS.has(kind)) {
      return `Block "${blockId}" evidence item ${index} artifact ${i}: invalid kind "${String(kind)}".`;
    }
    const description = item.description;
    if (typeof description !== "string" || description.trim().length === 0) {
      return `Block "${blockId}" evidence item ${index} artifact ${i}: description is required.`;
    }
    const url = item.url;
    if (url !== undefined && typeof url !== "string") {
      return `Block "${blockId}" evidence item ${index} artifact ${i}: url must be a string.`;
    }
    artifacts.push({ kind: kind as ArtifactReference["kind"], description: description.trim(), ...(url ? { url } : {}) });
  }
  return artifacts;
}

function validateObjectiveEvidence(
  raw: unknown,
  block: EvidenceBlockEntry,
  callerUid: string,
  now: Timestamp
): ObjectiveEvidenceItem[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return `Block "${block.blockId}": objectiveEvidence must be an array.`;

  const items: ObjectiveEvidenceItem[] = [];
  for (const [index, rawItem] of raw.entries()) {
    if (!isRecord(rawItem)) return `Block "${block.blockId}" evidence item ${index}: must be an object.`;

    const objectiveId = rawItem.objectiveId;
    if (typeof objectiveId !== "string" || !block.objectiveIds.includes(objectiveId)) {
      return `Block "${block.blockId}" evidence item ${index}: objectiveId "${String(objectiveId)}" is not one of this block's objectives.`;
    }
    const demonstrationType = rawItem.demonstrationType;
    if (typeof demonstrationType !== "string" || !VALID_DEMONSTRATION_TYPES.has(demonstrationType)) {
      return `Block "${block.blockId}" evidence item ${index}: invalid demonstrationType.`;
    }
    const outcome = rawItem.outcome;
    if (typeof outcome !== "string" || !VALID_OUTCOMES.has(outcome)) {
      return `Block "${block.blockId}" evidence item ${index}: invalid outcome.`;
    }
    const sourceType = rawItem.sourceType;
    if (typeof sourceType !== "string" || !VALID_SOURCE_TYPES.has(sourceType)) {
      return `Block "${block.blockId}" evidence item ${index}: invalid sourceType.`;
    }
    const observation = rawItem.observation;
    if (observation !== undefined && typeof observation !== "string") {
      return `Block "${block.blockId}" evidence item ${index}: observation must be a string.`;
    }
    const assessmentEligible = rawItem.assessmentEligible;
    if (typeof assessmentEligible !== "boolean") {
      return `Block "${block.blockId}" evidence item ${index}: assessmentEligible is required.`;
    }
    const artifacts = validateArtifacts(rawItem.artifacts, block.blockId, index);
    if (typeof artifacts === "string") return artifacts;

    items.push({
      objectiveId,
      demonstrationType: demonstrationType as EvidenceDemonstrationType,
      outcome: outcome as EvidenceOutcome,
      sourceType: sourceType as EvidenceSourceType,
      ...(observation && observation.trim() ? { observation: observation.trim() } : {}),
      assessmentEligible,
      // Never trusted from the client — always the actual caller, always "now".
      recordedByUid: callerUid,
      recordedAt: now,
      ...(artifacts.length > 0 ? { artifacts } : {}),
    });
  }
  return items;
}

function mergeOneBlock(
  raw: unknown,
  sourceBlock: EvidenceBlockEntry,
  callerUid: string,
  now: Timestamp
): EvidenceBlockEntry | string {
  if (!isRecord(raw)) return `Block "${sourceBlock.blockId}": edit must be an object.`;

  const completionState = raw.completionState;
  if (typeof completionState !== "string" || !VALID_COMPLETION_STATES.has(completionState)) {
    return `Block "${sourceBlock.blockId}": invalid completionState.`;
  }

  const reportedMinutesRaw = raw.reportedMinutes;
  let reportedMinutes: number | null;
  if (reportedMinutesRaw === null) {
    reportedMinutes = null;
  } else if (typeof reportedMinutesRaw === "number" && Number.isFinite(reportedMinutesRaw)) {
    if (reportedMinutesRaw < 0) return `Block "${sourceBlock.blockId}": reportedMinutes cannot be negative.`;
    reportedMinutes = Math.min(MAX_REPORTED_MINUTES, Math.round(reportedMinutesRaw));
  } else {
    return `Block "${sourceBlock.blockId}": reportedMinutes must be a number or null.`;
  }

  const assessmentEligible = raw.assessmentEligible;
  if (typeof assessmentEligible !== "boolean") {
    return `Block "${sourceBlock.blockId}": assessmentEligible is required.`;
  }

  let excusedReason: string | undefined;
  if (completionState === "excused") {
    const rawReason = raw.excusedReason;
    if (typeof rawReason !== "string" || rawReason.trim().length === 0) {
      return `Block "${sourceBlock.blockId}": excusedReason is required when completionState is "excused".`;
    }
    excusedReason = rawReason.trim();
  }

  const notesRaw = raw.notes;
  if (notesRaw !== undefined && typeof notesRaw !== "string") {
    return `Block "${sourceBlock.blockId}": notes must be a string.`;
  }
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : undefined;

  const objectiveEvidence = validateObjectiveEvidence(raw.objectiveEvidence, sourceBlock, callerUid, now);
  if (typeof objectiveEvidence === "string") return objectiveEvidence;

  return {
    // Authoritative — copied from the source block, never from `raw`.
    blockId: sourceBlock.blockId,
    subject: sourceBlock.subject,
    title: sourceBlock.title,
    required: sourceBlock.required,
    objectiveIds: sourceBlock.objectiveIds,
    plannedMinutes: sourceBlock.plannedMinutes,
    sourceQuarterCertificationId: sourceBlock.sourceQuarterCertificationId,
    sourceWeeklyCertificationId: sourceBlock.sourceWeeklyCertificationId,
    ...(sourceBlock.carryForward ? { carryForward: sourceBlock.carryForward } : {}),
    // Teacher-editable.
    reportedMinutes,
    approvedMinutes: sourceBlock.approvedMinutes, // untouched by a draft save — only approval ever sets this
    completionState: completionState as PacketBlockCompletionState,
    ...(excusedReason ? { excusedReason } : {}),
    ...(notes ? { notes } : {}),
    assessmentEligible,
    objectiveEvidence,
  };
}

/**
 * The client must submit exactly one edit per existing block, matched by
 * blockId — this is teacher input round-tripping a form the server
 * itself populated, so an exact match is expected and a mismatch (wrong
 * count, unknown id, a block missing) is rejected rather than silently
 * reconciled.
 */
export function mergeBlockEdits(
  raw: unknown,
  sourceBlocks: readonly EvidenceBlockEntry[],
  callerUid: string,
  now: Timestamp
): MergeResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "blocks must be an array." };
  }
  if (raw.length !== sourceBlocks.length) {
    return {
      ok: false,
      error: `Expected edits for all ${sourceBlocks.length} block(s), got ${raw.length}.`,
    };
  }

  const byBlockId = new Map(sourceBlocks.map((b) => [b.blockId, b]));
  const seen = new Set<string>();
  const merged: EvidenceBlockEntry[] = [];

  for (const rawEdit of raw) {
    const blockId = isRecord(rawEdit) ? rawEdit.blockId : undefined;
    if (typeof blockId !== "string" || !byBlockId.has(blockId)) {
      return { ok: false, error: `Unknown or missing blockId "${String(blockId)}".` };
    }
    if (seen.has(blockId)) {
      return { ok: false, error: `Duplicate edit for block "${blockId}".` };
    }
    seen.add(blockId);

    const result = mergeOneBlock(rawEdit, byBlockId.get(blockId) as EvidenceBlockEntry, callerUid, now);
    if (typeof result === "string") {
      return { ok: false, error: result };
    }
    merged.push(result);
  }

  return { ok: true, blocks: merged };
}

/**
 * Validates a teacher-submitted Historical Figure Coloring retention
 * observation (build-order step 8, requirement 10) — a 1-10 integer,
 * same "reject with a clear error, don't silently default" philosophy as
 * the rest of this file (a real teacher input, not AI output). Pure and
 * standalone since this field lives outside `EvidenceBlockEntry`
 * entirely — see types.ts's HistoricalFigureClosingEvidence.
 */
export function isValidRetentionObservation(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}
