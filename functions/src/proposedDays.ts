import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { requireCaller, requireTeacher, requireSameFamily } from "./util/auth";
import { createProposal, approveProposal } from "./approvals";
import { ALL_SUBJECTS } from "./subjects";
import { getQuarterAndWeek } from "./curriculum/loadCurriculumContent";
import {
  getFamilyQuarterCertificationStatus,
  getFamilyWeeklyCertificationStatus,
} from "./curriculum/certificationStatus";
import { getCurriculumGovernanceMode } from "./curriculum/curriculumGovernance";
import { getDayDesignationsForDate } from "./curriculum/dayDesignation";
import { hashText } from "./curriculum/contentHash";
import { checkDraftRevision, decideGenerationAction, isProposedDayStale } from "./curriculum/proposedDayLifecycle";
import { getGenerationLeadDays } from "./curriculum/generationSchedule";
import { computeInstructionalGenerationTargetDate } from "./curriculum/instructionalCalendar";
import { validateAndNormalizeBlocks, ensureMorningPhysicalEducationBlock, type ObjectiveIdScope } from "./curriculum/blockValidation";
import { computeOutstandingCarryForward, attachCarryForwardProvenance } from "./curriculum/carryForward";
import {
  computeCarryForwardFromPacket,
  loadMostRecentApprovedEvidencePacketBefore,
} from "./curriculum/evidencePacketStore";
import { HISTORICAL_FIGURE_CATALOG, getUpcomingContextTags } from "./curriculum/historicalFigureCatalog";
import { buildPublishedDayProjection, publishedDayDocId } from "./curriculum/publishedDay";
import {
  ART_COMPLEXITY_BAND_BY_KID,
  buildRecallQuestion,
  buildShowAndTellPrompt,
  selectHistoricalFigure,
} from "./curriculum/historicalFigureSelector";
import { buildStudentContext, type StudentContext } from "./dayPlans";
import type {
  AssessmentEligibility,
  Family,
  HistoricalFigureClosingPlan,
  ItineraryMode,
  JasperMessage,
  LearningBlock,
  ProposedDay,
  ProposedDayDraft,
  ProposedDayType,
  UserProfile,
} from "./types";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * Two-day-ahead governed daily proposal pipeline (build-order step 4,
 * hardened in step 4.1):
 *
 *   certified quarter -> certified week -> proposed day (this file)
 *   -> teacher review/edit (draft) -> teacher approval -> published
 *   student day -> historical approved-day record
 *
 * ARCHITECTURAL DECISION (step 4.1, recorded here per that instruction):
 * proposedDays is now the authoritative path for governed WBK schooling —
 * generation, teacher review, approval, publication, and the historical
 * approved-day record all live here going forward. The existing
 * dayPlans/{planId} collection (generatePlan/PlanDayPage.tsx) remains
 * available as a legacy/freeform planning tool — teacher-prompted,
 * often multi-student, no certification/versioning/approval metadata —
 * but it is NOT an equally-authoritative second school record. The two
 * are not synchronized with each other, automatically or otherwise, and
 * dayPlans was not migrated, narrowed, or rewritten in step 4.1: whether
 * it's eventually renamed, narrowed in scope, migrated into this system,
 * or retired is an explicit later decision, not implied by this one.
 * Both reuse the same underlying pieces where it matters — buildStudentContext
 * (dayPlans.ts) for the identical per-student certification-gate decision,
 * the same Anthropic model, the same approvals.ts primitive for the
 * actual approve action — rather than duplicating that logic twice; that
 * code-level reuse is independent of which collection is authoritative.
 *
 * This step deliberately builds three separate layers, per the request:
 *   A. computeInstructionalGenerationTargetDate / decideGenerationAction
 *      (instructionalCalendar.ts / proposedDayLifecycle.ts) — pure
 *      decision logic, no I/O (instructionalCalendar.ts's async wrapper
 *      is the one exception that must consult DayDesignation records).
 *   B. generateProposedDays (this file) — the callable/service that
 *      actually does it, invoked manually (by a teacher, from the UI)
 *      for now.
 *   C. Automatic scheduled invocation — NOT built. No Cloud Scheduler/
 *      cron job exists yet; generateProposedDays is just as valid to call
 *      from a future scheduled function as it is from a button today, but
 *      that trigger itself is out of scope for step 4/4.1.
 */

interface GetGenerationTargetDateRequest {
  familyId: string;
}

/**
 * Read-only: "what's the next instructional-day-aware target date for
 * this family, right now" — the family's configured lead time
 * (generationSchedule.ts) walked forward via instructionalCalendar.ts.
 * Used by the teacher UI to prefill its date picker's default (replacing
 * a plain +2-calendar-days client calculation from step 4, which couldn't
 * account for weekends or DayDesignations at all).
 */
export const getGenerationTargetDate = onCall<GetGenerationTargetDateRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);

  const db = getFirestore();
  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) {
    throw new HttpsError("failed-precondition", "No such family.");
  }
  const family = familySnap.data() as Family;
  const leadDays = getGenerationLeadDays(family);
  const date = await computeInstructionalGenerationTargetDate(familyId, new Date(), leadDays);
  return { date };
});

interface GenerateProposedDaysRequest {
  familyId: string;
  date: string; // ISO "YYYY-MM-DD"
  studentIds?: string[]; // defaults to every student in the family
  forceRegenerate?: boolean;
}

interface ProposedDayOutcome {
  studentId: string;
  action: "generated" | "regenerated" | "unchanged" | "blocked" | "skipped";
  proposedDayId: string | null;
  proposalVersion: number | null;
  reason?: string;
}

/** Exported for reuse by evidencePackets.ts (build-order step 6): opening a packet needs the same "latest version for this date" lookup, and since an approved ProposedDay is never superseded (see decideGenerationAction), its latest version IS the approved one. */
export async function getLatestProposedDay(
  familyId: string,
  studentId: string,
  date: string
): Promise<{ id: string; record: ProposedDay } | null> {
  const db = getFirestore();
  const snap = await db
    .collection("proposedDays")
    .where("familyId", "==", familyId)
    .where("studentId", "==", studentId)
    .where("date", "==", date)
    .orderBy("proposalVersion", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, record: doc.data() as ProposedDay };
}

/** Satisfied structurally by both LearningBlock (step 5) and EvidenceBlockEntry (step 6) — whichever source loadOutstandingCarryForward actually used. */
interface OutstandingCarryForwardBlock {
  blockId: string;
  subject: import("./types").Subject;
  title: string;
  objectiveIds: string[];
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
}

interface OutstandingCarryForward {
  fromProposedDayId: string;
  fromDate: string;
  blocks: OutstandingCarryForwardBlock[];
}

/**
 * The real, step-6-authoritative signal: an approved EndOfDayEvidencePacket
 * for the most recent prior school day, if the teacher actually closed it
 * out — "what happened," not "what was planned." Falls back to step 5's
 * original signal (ProposedDay's own blocks, which only ever reports
 * "in_progress" and is effectively always empty in practice) only when no
 * packet exists yet for the prior day at all — e.g. the day was approved
 * but the teacher hasn't run closeout on it.
 */
async function loadOutstandingCarryForward(
  familyId: string,
  studentId: string,
  beforeDate: string
): Promise<OutstandingCarryForward | null> {
  const packetLookup = await loadMostRecentApprovedEvidencePacketBefore(familyId, studentId, beforeDate);
  if (packetLookup) {
    const outstanding = computeCarryForwardFromPacket(packetLookup.record.draft.blocks);
    if (outstanding.length === 0) return null; // closed out, and genuinely nothing outstanding
    return {
      fromProposedDayId: packetLookup.record.sourceProposedDayId,
      fromDate: packetLookup.record.date,
      blocks: outstanding,
    };
  }

  const db = getFirestore();
  const snap = await db
    .collection("proposedDays")
    .where("familyId", "==", familyId)
    .where("studentId", "==", studentId)
    .where("status", "==", "approved")
    .where("date", "<", beforeDate)
    .orderBy("date", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const record = doc.data() as ProposedDay;
  const outstanding = computeOutstandingCarryForward(record.draft.learningBlocks);
  if (outstanding.length === 0) return null;
  return { fromProposedDayId: doc.id, fromDate: record.date, blocks: outstanding };
}

function classifyDayType(context: StudentContext): ProposedDayType {
  if (context.gateOutcome === "alternative_package") return "alternativePackage";
  if (context.gateOutcome === "non_instructional") return "nonInstructional";
  return "ordinary"; // "certified" or "legacy_compatibility" — the two ordinary-grounding outcomes
}

/**
 * The idempotency comparison key for one student's context — see
 * ProposedDay.sourceSignature's doc comment in types.ts for the exact
 * precedence (designation > certification id > content hash > "none").
 */
function computeSourceSignature(context: StudentContext, dayType: ProposedDayType): string {
  if (dayType !== "ordinary") {
    return context.dayDesignationId ? `designation:${context.dayDesignationId}` : "none";
  }
  if (context.weeklyCertificationId) return `cert:${context.weeklyCertificationId}`;
  if (context.weekContent) return `content:${hashText(context.weekContent)}`;
  return "none";
}

interface DailyGenerationInputs {
  family: Family;
  quarterAndWeek: { quarter: import("./types").Quarter; week: number } | null;
}

async function loadDailyGenerationInputs(familyId: string, date: string): Promise<DailyGenerationInputs | null> {
  const db = getFirestore();
  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) return null;
  const family = familySnap.data() as Family;
  const schoolYearStart = family.schoolYear.startDate.toDate();
  const quarterAndWeek = getQuarterAndWeek(schoolYearStart, new Date(date));
  return { family, quarterAndWeek };
}

interface GeneratedContent {
  title: string;
  summary: string;
  planText: string;
  jasperMessage: string;
  suggestedItineraryMode: ItineraryMode;
  learningBlocks: LearningBlock[];
  historicalFigureClosing: HistoricalFigureClosingPlan | null;
}

/**
 * The one Claude call per student for an "ordinary" or "alternativePackage"
 * day — reuses the same context.contextLine grounding buildStudentContext
 * already produces for generatePlan, extended to also ask for the Jasper
 * Morning Message, a suggested itinerary mode, and a full structured block
 * list (build-order step 5). Claude proposes each block's plain-text
 * objective DESCRIPTIONS only — never an id, never this block's final
 * order, never a cross-block dependency by id — everything identity-
 * bearing is assigned server-side afterward by validateAndNormalizeBlocks
 * ("generation creates a PROPOSAL; teacher authority remains final," and
 * that includes never trusting arbitrary model JSON for anything an
 * evidence/mastery record will ever key off of).
 */
async function generateOrdinaryDayContent(params: {
  apiKey: string;
  date: string;
  studentId: string;
  studentName: string;
  context: StudentContext;
  dayType: ProposedDayType;
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
  outstandingCarryForward: OutstandingCarryForward | null;
  recentHistoricalFigureIds: readonly string[];
}): Promise<GeneratedContent> {
  const client = new Anthropic({ apiKey: params.apiKey });

  const alternativeNote =
    params.dayType === "alternativePackage"
      ? "\n\nToday is an explicitly approved ALTERNATIVE PACKAGE day for this student (see the per-student context " +
        "below) — build the day around that description, not ordinary weekly curriculum, the same way a field " +
        "trip would override the week's regular content."
      : "";

  const carryForwardNote =
    params.outstandingCarryForward && params.outstandingCarryForward.blocks.length > 0
      ? "\n\nThe following required work was started but not finished on the prior school day. Rebalance today's " +
        "plan around it rather than ignoring it — it does not need to be redone from scratch, but it needs a " +
        `real place in today's blocks: ${params.outstandingCarryForward.blocks.map((b) => `${b.subject} — ${b.title}`).join("; ")}.`
      : "";

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2400,
    system:
      "You write ONE student's proposed school day, roughly two days ahead of when it's needed, for a teacher " +
      "to review and approve before it's ever shown to the student. This is a governed, curriculum-grounded day " +
      "— not a freeform request. Where per-student context below includes a block of 'this week's actual " +
      "curriculum content,' that content is authoritative and must ground the day's actual topics/objectives/" +
      "activities directly, not just inform tone.\n\n" +
      "Standing rules for the day itself:\n" +
      "1. Open with the Pledge of Allegiance as a fixed first step.\n" +
      "2. Shape the academic block as: a short warm-up of retrieval questions from material already mastered " +
      "(not today's new material) -> new teaching -> mixed/interleaved practice (today's objective plus 1-2 " +
      "older mastered ones once there are 2+ live) -> a short, ungraded retrieval close-out. If the context " +
      "lists objectives 'still building,' re-teach that specific objective with a genuinely different framing " +
      "(not the identical activity that didn't work) before introducing anything new in that subject.\n" +
      "3. The actual practice/work should be mostly physical — real printable worksheets, favoring interactive/" +
      "puzzle formats over a bare problem list, plus a cursive handwriting component where it fits naturally. " +
      "For a student on the demonstration-based track (context will say so), favor tap/show-me, matching, " +
      "pointing, sorting, naming, physical demonstration, or guided play over any written-test format.\n" +
      "4. If context flags an objective as aced easily, give a genuinely harder stretch version rather than " +
      "just reviewing at the same level; if a whole subject is 'ready to exceed grade-level,' introduce real " +
      "above-grade-level material rather than plateauing.\n" +
      "5. Also write a Jasper Morning Message: Jasper is like the head teacher of a small, close-knit " +
      "homeschool, personally greeting this one student before school — warm, lightly playful, encouraging, " +
      "aware of what they're doing today. ONE paragraph, about 1-1.5 minutes if read aloud. It may include: " +
      "'Good morning,' a brief personal greeting, today's major itinerary highlights, an interesting project, " +
      "an upcoming approved trip/event if relevant, a brief expectation or encouragement, and a reminder to " +
      "begin with the Pledge. It must NOT be a lesson explanation, a long justification of why subjects " +
      "matter, a motivational essay, an assessment report, or a generic corporate AI greeting.\n" +
      "6. Suggest an itinerary mode: 'strict' if the day's blocks genuinely depend on a fixed order (e.g. a " +
      "new concept must be taught before the practice that uses it), 'flexible' if the student could " +
      "reasonably choose which block to start with today.\n" +
      "7. Break the day into learning blocks — each one stage of the learning cycle (a warm-up/retrieval block, " +
      "a teach/model block, guided practice, independent practice, an assessment/check, application/transfer, " +
      "reflection, or enrichment). A chain like teach -> guided practice -> independent attempt -> check for " +
      "the SAME objective should be separate blocks in dependsOnIndex order, each one depending on the index of " +
      "the block right before it in that chain. Mark a block required:false only for genuine enrichment/" +
      "extension work, never for core instruction. State 1-3 short objective phrases per block in " +
      "objectiveDescriptions (plain skill descriptions, e.g. \"Convert oz to lb\" — not an id).\n" +
      "8. The locked daily opening, in order, is: the Pledge (rule 1) -> required PE/movement -> the rest of the " +
      "academic day. Make the VERY FIRST entry in learningBlocks a \"physical_education\" block representing " +
      "this morning movement time — include one every single day, never fold it into the Jasper Morning Message " +
      "or skip it, and always set its required to true (PE is REQUIRED as part of the normal school day — this " +
      "is a fixed program policy, never enrichment/optional, and never something to omit or downgrade just " +
      "because it doesn't count toward instructional hours — see below). " +
      "IMPORTANT PROGRAM POLICY: PE is required but explicitly NON-HOUR-BEARING for Missouri instructional/" +
      "compliance calculations — it contributes zero official instructional hours by deliberate, permanent " +
      "school policy, not an oversight. Never treat this as a reason to skip it, shrink it into an afterthought, " +
      "or pad its estimatedMinutes to try to make it 'count' — it doesn't, by design, and that's fine. " +
      "PE should emphasize regular physical movement, fitness, coordination, balance, sports and games, " +
      "teamwork, outdoor activity, age-appropriate physical skills, healthy lifelong movement habits, and fun. " +
      "Do NOT turn it into another academic class merely to justify its presence — it may have a simple " +
      "movement/skill objective and a teacher observation, but it should generally feel active and enjoyable, " +
      "not worksheet- or test-driven. Vary the specific activity meaningfully day to day rather than repeating " +
      "the same thing — draw from things like stretching/mobility, calisthenics, walking, running, balance/" +
      "coordination, outdoor movement, games, sports, skill practice, family movement, or age-appropriate " +
      "bodyweight strength work — never just \"go outside for 20 minutes\" with no purpose at all, and never an " +
      "unsafe or max-effort exercise prescription. Match it to this specific student's age/stage as shown in " +
      "their context below: a young child not yet at formal instructional objectives should get pure play/" +
      "gross-motor movement with zero performance metrics or graded skill checks; an older child's may " +
      "reasonably include a simple skill/coordination/endurance objective and a teacher-observed demonstration " +
      "(never a quiz). Siblings may do the same family movement activity together in substance — describe it " +
      "that way if it fits — each still gets their own independent block/record regardless. estimatedMinutes " +
      "should be realistic for a morning movement block (typically 10-20 minutes), and any stage except " +
      "warmup_retrieval fits it better than that one (it isn't retrieval of academic material).\n" +
      alternativeNote +
      carryForwardNote +
      "\n\nRespond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape: " +
      '{"title": string, "summary": string (one sentence), "planText": string (plain text, blank lines between ' +
      'sections, no markdown headers), "jasperMessage": string, "suggestedItineraryMode": "strict" | "flexible", ' +
      '"learningBlocks": [{' +
      `"subject": one of [${ALL_SUBJECTS.join(", ")}], ` +
      '"title": string, ' +
      '"objectiveDescriptions": string[] (1-3 short skill phrases), ' +
      '"stage": one of ["warmup_retrieval","teach_model","guided_practice","independent_practice",' +
      '"assessment_check","application_transfer","reflection_metacognition","enrichment"], ' +
      '"estimatedMinutes": number, ' +
      '"required": boolean, ' +
      '"dependsOnIndex": number[] (indices of EARLIER items in this same array this block depends on), ' +
      '"retrievalReason": one of ["recent_retrieval","spaced_revisit","interleaved_practice",' +
      '"delayed_retention_check"] or null (only meaningful when stage is "warmup_retrieval"), ' +
      '"activityFormat": one of ["printable","hands_on","digital","discussion"] or null, ' +
      '"notes": string or null' +
      "}] (2-6 items)}.",
    messages: [
      {
        role: "user",
        content: `Date: ${params.date}\nStudent: ${params.studentName}\n\nPer-student context:\n${params.context.contextLine}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new HttpsError("internal", "Claude returned no parseable text.");
  }

  let parsed: Partial<GeneratedContent> & { learningBlocks?: unknown };
  try {
    const start = textBlock.text.indexOf("{");
    const end = textBlock.text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found in response.");
    parsed = JSON.parse(textBlock.text.slice(start, end + 1));
  } catch {
    throw new HttpsError("internal", "Could not parse Claude's response as JSON.");
  }

  const scope: ObjectiveIdScope | null =
    params.context.kidKey && params.context.quarterAndWeek
      ? {
          kidKey: params.context.kidKey,
          quarter: params.context.quarterAndWeek.quarter,
          week: params.context.quarterAndWeek.week,
          date: params.date,
        }
      : null;

  let learningBlocks = validateAndNormalizeBlocks({
    raw: parsed.learningBlocks,
    studentId: params.studentId,
    scope,
    mastery: {
      masteredObjectiveIdsBySubject: params.context.masteredObjectiveIdsBySubject,
      inProgressObjectiveIdsBySubject: params.context.inProgressObjectiveIdsBySubject,
    },
    sourceQuarterCertificationId: params.sourceQuarterCertificationId,
    sourceWeeklyCertificationId: params.sourceWeeklyCertificationId,
  });

  if (params.outstandingCarryForward && params.outstandingCarryForward.blocks.length > 0) {
    learningBlocks = attachCarryForwardProvenance(
      learningBlocks,
      params.outstandingCarryForward.blocks,
      params.outstandingCarryForward.fromProposedDayId,
      params.outstandingCarryForward.fromDate
    );
  }

  // Build-order step 7: the model is asked (rule 8 above) to always
  // include a physical_education block, but this is the actual guarantee
  // — never trust the model to reliably comply, exactly like every other
  // structural guarantee in this file. A no-op when one is already present.
  learningBlocks = ensureMorningPhysicalEducationBlock(
    learningBlocks,
    params.studentId,
    params.sourceQuarterCertificationId,
    params.sourceWeeklyCertificationId
  );

  // Build-order step 8: Historical Figure Coloring closing activity —
  // fully deterministic (see historicalFigureSelector.ts's doc comment
  // on why no AI call is involved), computed independently of whatever
  // Claude returned above. Never tied to a LearningBlock/Subject, so it
  // can never affect instructional hours or the 28 hrs/week requirement.
  const historicalFigureClosing = buildHistoricalFigureClosing(params);

  return {
    title: typeof parsed.title === "string" ? parsed.title : "Proposed day",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    planText: typeof parsed.planText === "string" ? parsed.planText : "",
    jasperMessage: typeof parsed.jasperMessage === "string" ? parsed.jasperMessage : "",
    suggestedItineraryMode: parsed.suggestedItineraryMode === "strict" ? "strict" : "flexible",
    learningBlocks,
    historicalFigureClosing,
  };
}

/**
 * Selects today's historical figure and builds the age-differentiated
 * closing prompts, or returns null when there's no resolvable kidKey
 * (e.g. a student whose display name doesn't match any PlacementKidKey —
 * same defensive posture as every other kidKey-dependent feature in this
 * file: degrade to "not available" rather than guessing).
 */
function buildHistoricalFigureClosing(params: {
  date: string;
  context: StudentContext;
  recentHistoricalFigureIds: readonly string[];
}): HistoricalFigureClosingPlan | null {
  const { kidKey, quarterAndWeek } = params.context;
  if (!kidKey) return null;

  const contextTags = getUpcomingContextTags(quarterAndWeek?.week ?? null);
  const selection = selectHistoricalFigure({
    catalog: HISTORICAL_FIGURE_CATALOG,
    kidKey,
    date: params.date,
    recentFigureIds: params.recentHistoricalFigureIds,
    contextTags,
  });
  if (!selection) return null;

  return {
    figureId: selection.figure.id,
    selectionReason: selection.selectionReason,
    artComplexityBand: ART_COMPLEXITY_BAND_BY_KID[kidKey],
    showAndTellPrompt: buildShowAndTellPrompt(selection.figure, kidKey),
    recallQuestion: buildRecallQuestion(selection.figure, kidKey),
    // Copied so the teacher review UI can show it without needing access
    // to the backend catalog (build-order step 8.1) — never silently
    // "verified" just because the person is real.
    sourceVerificationStatus: selection.figure.provenance.verificationStatus,
  };
}

/**
 * Every figureId this student has actually had on a recent APPROVED day
 * — the anti-repetition signal (build-order step 8). Only approved days
 * count as real history a kid experienced; an unapproved/superseded
 * proposal never happened, so it never constrains a later pick. Reuses
 * the existing (familyId, studentId, status, date) composite index
 * (proposedDays.ts's other queries already rely on it) — no new index
 * needed. `limit` bounds both the query cost and how far back "recent"
 * looks; 15 is comfortably larger than a school week without scanning a
 * whole quarter's history on every generation call.
 */
async function loadRecentHistoricalFigureIds(familyId: string, studentId: string, limit = 15): Promise<string[]> {
  const db = getFirestore();
  const snap = await db
    .collection("proposedDays")
    .where("familyId", "==", familyId)
    .where("studentId", "==", studentId)
    .where("status", "==", "approved")
    .orderBy("date", "desc")
    .limit(limit)
    .get();
  return snap.docs
    .map((d) => (d.data() as ProposedDay).historicalFigureClosing?.figureId)
    .filter((id): id is string => typeof id === "string");
}

/**
 * The whole two-day-ahead pipeline for one date, across one or more
 * students at once (matching how a teacher actually works — reviewing
 * "tomorrow's" proposals for the whole family together). Manually
 * invoked; see this file's top doc comment for the A/B/C split. Never
 * invents fallback curriculum when the certification gate blocks — a
 * blocked student's failure is caught and reported per-student rather
 * than failing the whole batch, so one kid's uncertified week doesn't
 * stop siblings whose weeks ARE certified from getting a proposal.
 */
export const generateProposedDays = onCall<GenerateProposedDaysRequest>({ secrets: [anthropicApiKey] }, async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId, date, studentIds, forceRegenerate } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);
  if (!date || typeof date !== "string" || Number.isNaN(new Date(date).getTime())) {
    throw new HttpsError("invalid-argument", "A valid date is required.");
  }

  const inputs = await loadDailyGenerationInputs(familyId, date);
  if (!inputs) {
    throw new HttpsError("failed-precondition", "No such family.");
  }
  const { family, quarterAndWeek } = inputs;
  const governanceMode = getCurriculumGovernanceMode(family);

  const db = getFirestore();
  let targetStudentIds: string[];
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    targetStudentIds = studentIds.filter((id) => typeof id === "string");
  } else {
    const studentsSnap = await db
      .collection("users")
      .where("familyId", "==", familyId)
      .where("role", "==", "student")
      .get();
    targetStudentIds = studentsSnap.docs.map((d) => d.id);
  }

  // Resolved ONCE for the whole date, not per student — same pattern as
  // generatePlan (dayPlans.ts): the family package governs every kid
  // together.
  const [familyQuarterStatus, familyWeekStatus, dayDesignations] = await Promise.all([
    quarterAndWeek ? getFamilyQuarterCertificationStatus(familyId, quarterAndWeek.quarter) : Promise.resolve(null),
    quarterAndWeek
      ? getFamilyWeeklyCertificationStatus(familyId, quarterAndWeek.quarter, quarterAndWeek.week)
      : Promise.resolve(null),
    getDayDesignationsForDate(familyId, date),
  ]);

  const results = await Promise.all(
    targetStudentIds.map(
      // The whole per-student body is wrapped in one try/catch — a
      // certification-gate block, a Claude/API failure, a malformed
      // response, or any other error for ONE student must never crash the
      // batch and lose the other students' results (Promise.all rejects
      // as a whole on any unhandled rejection otherwise).
      async (studentId): Promise<ProposedDayOutcome> => {
        try {
          const context = await buildStudentContext(
            studentId,
            familyId,
            governanceMode,
            quarterAndWeek,
            familyQuarterStatus,
            familyWeekStatus,
            dayDesignations
          );
          if (!context) {
            return {
              studentId,
              action: "skipped",
              proposedDayId: null,
              proposalVersion: null,
              reason: "Not a student in this family.",
            };
          }

          const dayType = classifyDayType(context);
          const currentSourceSignature = computeSourceSignature(context, dayType);
          const existingLookup = await getLatestProposedDay(familyId, studentId, date);
          const existing = existingLookup
            ? {
                id: existingLookup.id,
                status: existingLookup.record.status,
                sourceSignature: existingLookup.record.sourceSignature,
                proposalVersion: existingLookup.record.proposalVersion,
              }
            : null;

          const decision = decideGenerationAction({
            existing,
            currentSourceSignature,
            forceRegenerate: forceRegenerate === true,
          });

          if (decision.action === "blocked") {
            return {
              studentId,
              action: "blocked",
              proposedDayId: decision.existingId,
              proposalVersion: existing?.proposalVersion ?? null,
              reason: "Already approved/published — never silently regenerated.",
            };
          }
          if (decision.action === "skip") {
            return {
              studentId,
              action: "unchanged",
              proposedDayId: decision.existingId,
              proposalVersion: existing?.proposalVersion ?? null,
            };
          }

          // "generate" or "regenerate" from here.
          let generated: GeneratedContent;
          let outstandingCarryForward: OutstandingCarryForward | null = null;
          if (dayType === "nonInstructional") {
            generated = {
              title: "No School",
              summary: context.dayDesignationDescription ?? "Approved non-instructional day.",
              planText: "",
              jasperMessage: "",
              suggestedItineraryMode: "flexible",
              learningBlocks: [],
              historicalFigureClosing: null,
            };
          } else {
            outstandingCarryForward = await loadOutstandingCarryForward(familyId, studentId, date);
            const [studentSnap, recentHistoricalFigureIds] = await Promise.all([
              db.collection("users").doc(studentId).get(),
              loadRecentHistoricalFigureIds(familyId, studentId),
            ]);
            const studentName = (studentSnap.data() as UserProfile | undefined)?.displayName ?? "the student";
            generated = await generateOrdinaryDayContent({
              apiKey: anthropicApiKey.value(),
              date,
              studentId,
              studentName,
              context,
              dayType,
              sourceQuarterCertificationId: context.quarterCertificationId,
              sourceWeeklyCertificationId: context.weeklyCertificationId,
              outstandingCarryForward,
              recentHistoricalFigureIds,
            });
          }

          const ref = db.collection("proposedDays").doc();
          const generatedAt = Timestamp.now();
          const doc: ProposedDay = {
            familyId,
            studentId,
            date,
            quarter: quarterAndWeek?.quarter ?? null,
            week: quarterAndWeek?.week ?? null,
            dayType,
            dayDesignationId: context.dayDesignationId,
            governanceModeAtGeneration: governanceMode,
            sourceQuarterCertificationId: context.quarterCertificationId,
            sourceWeeklyCertificationId: context.weeklyCertificationId,
            sourceSignature: currentSourceSignature,
            status: "proposed",
            proposalVersion: decision.nextVersion,
            supersedesProposalId: decision.supersedesProposalId,
            generatedAt,
            generatedByUid: caller.uid,
            title: generated.title,
            summary: generated.summary,
            planText: generated.planText,
            jasperMessage: dayType === "nonInstructional" ? null : ({ generated: generated.jasperMessage } as JasperMessage),
            suggestedItineraryMode: dayType === "nonInstructional" ? null : generated.suggestedItineraryMode,
            learningBlocks: generated.learningBlocks,
            historicalFigureClosing: generated.historicalFigureClosing,
            carryForwardNotes: outstandingCarryForward
              ? [
                  `Carrying forward ${outstandingCarryForward.blocks.length} incomplete required item(s) from ` +
                    `${outstandingCarryForward.fromDate}: ${outstandingCarryForward.blocks.map((b) => b.title).join("; ")}.`,
                ]
              : [],
            // Seeded as an exact copy of the generated values — revision 0
            // means "never actually edited by a teacher yet." See
            // types.ts's ProposedDayDraft doc comment.
            draft: {
              title: generated.title,
              summary: generated.summary,
              planText: generated.planText,
              itineraryMode: generated.suggestedItineraryMode ?? "flexible",
              learningBlocks: generated.learningBlocks,
              historicalFigureClosing: generated.historicalFigureClosing,
              revision: 0,
              lastEditedByUid: caller.uid,
              lastEditedAt: generatedAt,
            },
          };
          await ref.set(doc);

          return {
            studentId,
            action: decision.action === "generate" ? "generated" : "regenerated",
            proposedDayId: ref.id,
            proposalVersion: decision.nextVersion,
          };
        } catch (err) {
          const reason = err instanceof HttpsError ? err.message : "Could not generate a proposal for this student.";
          return { studentId, action: "skipped", proposedDayId: null, proposalVersion: null, reason };
        }
      }
    )
  );

  return { results };
});

interface CheckProposedDayStalenessRequest {
  proposedDayId: string;
}

/**
 * Read-only, no Claude call, no writes — lets the teacher UI show
 * "requires regeneration" on an unapproved proposal without triggering
 * one. Safe to call on every page load.
 */
export const checkProposedDayStaleness = onCall<CheckProposedDayStalenessRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { proposedDayId } = request.data ?? {};
  if (!proposedDayId || typeof proposedDayId !== "string") {
    throw new HttpsError("invalid-argument", "proposedDayId is required.");
  }

  const db = getFirestore();
  const snap = await db.collection("proposedDays").doc(proposedDayId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No such proposed day.");
  }
  const doc = snap.data() as ProposedDay;
  requireSameFamily(caller, doc.familyId);

  return { isStale: await checkStalenessInternal(doc) };
});

interface SaveProposedDayDraftRequest {
  proposedDayId: string;
  expectedRevision: number;
  title: string;
  summary: string;
  planText: string;
  jasperMessageEdited?: string;
  itineraryMode: ItineraryMode;
}

/**
 * Preserves the teacher's in-progress review edits across navigating away
 * and coming back (build-order step 4.1 — the gap step 4 originally left:
 * edits were lost if the teacher didn't approve before leaving). Never
 * touches the doc's original generated title/summary/planText/
 * jasperMessage.generated — only the separate `draft` sub-object. Requires
 * a Cloud Function write (this callable) rather than opening direct
 * client writes to proposedDays, same trust model as every other
 * governance collection here.
 *
 * Optimistic concurrency: the caller supplies `expectedRevision` — the
 * draft revision it believes is currently saved (whatever it last read).
 * If a newer revision is already saved (e.g. the other teacher account
 * saved a change in the meantime), this is rejected with a clear message
 * rather than silently overwriting it. Checked and written inside one
 * transaction so two simultaneous saves can't both "win".
 */
export const saveProposedDayDraft = onCall<SaveProposedDayDraftRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { proposedDayId, expectedRevision, title, summary, planText, jasperMessageEdited, itineraryMode } =
    request.data ?? {};
  if (!proposedDayId || typeof proposedDayId !== "string") {
    throw new HttpsError("invalid-argument", "proposedDayId is required.");
  }
  if (typeof expectedRevision !== "number" || expectedRevision < 0) {
    throw new HttpsError("invalid-argument", "expectedRevision is required.");
  }
  if (typeof title !== "string" || typeof summary !== "string" || typeof planText !== "string") {
    throw new HttpsError("invalid-argument", "title, summary, and planText are required strings.");
  }
  if (itineraryMode !== "strict" && itineraryMode !== "flexible") {
    throw new HttpsError("invalid-argument", 'itineraryMode must be "strict" or "flexible".');
  }

  const db = getFirestore();
  const ref = db.collection("proposedDays").doc(proposedDayId);

  // Family/status/latest-version checks up front, with clear messages,
  // before the transactional revision check below.
  const preSnap = await ref.get();
  if (!preSnap.exists) {
    throw new HttpsError("not-found", "No such proposed day.");
  }
  const preDoc = preSnap.data() as ProposedDay;
  requireSameFamily(caller, preDoc.familyId);
  if (preDoc.status !== "proposed") {
    throw new HttpsError("failed-precondition", "This day is already approved — drafts can no longer be edited.");
  }
  const latest = await getLatestProposedDay(preDoc.familyId, preDoc.studentId, preDoc.date);
  if (!latest || latest.id !== proposedDayId) {
    throw new HttpsError(
      "failed-precondition",
      "A newer proposal exists for this student/date — review that one instead of an older version."
    );
  }

  let newRevision = -1;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "No such proposed day.");
    }
    const doc = snap.data() as ProposedDay;
    if (doc.status !== "proposed") {
      throw new HttpsError("failed-precondition", "This day is already approved — drafts can no longer be edited.");
    }
    const revisionCheck = checkDraftRevision(doc.draft.revision, expectedRevision);
    if (!revisionCheck.ok) {
      throw new HttpsError(
        "failed-precondition",
        `Someone else saved changes since you last loaded this proposal (current revision ` +
          `${revisionCheck.currentRevision}, expected ${expectedRevision}). Refresh and review the latest draft ` +
          `before saving again.`
      );
    }
    newRevision = revisionCheck.nextRevision;
    const newDraft: ProposedDayDraft = {
      title,
      summary,
      planText,
      ...(jasperMessageEdited !== undefined ? { jasperMessageEdited } : {}),
      itineraryMode,
      // Not yet editable via this callable (build-order step 5 only asks
      // the review UI to inspect structured blocks, not edit them) —
      // carried through unchanged from whatever's currently saved, same
      // as every other field this call doesn't take as a parameter.
      learningBlocks: doc.draft.learningBlocks,
      // Likewise not yet independently editable (build-order step 8) —
      // carried through unchanged, same reasoning as learningBlocks above.
      historicalFigureClosing: doc.draft.historicalFigureClosing,
      revision: newRevision,
      lastEditedByUid: caller.uid,
      lastEditedAt: Timestamp.now(),
    };
    tx.update(ref, { draft: newDraft });
  });

  return { revision: newRevision };
});

interface ApproveProposedDayRequest {
  proposedDayId: string;
  expectedRevision: number;
}

interface ApproveProposedDayPayload {
  familyId: string;
  proposedDayId: string;
  studentId: string;
  date: string;
  expectedRevision: number;
}

/**
 * Generate Proposal -> Review -> Edit -> Select Strict/Flexible -> Edit
 * Jasper Message if desired -> Save Draft (any number of times) -> Approve
 * -> Publish. Approves the CURRENT SAVED DRAFT (build-order step 4.1) —
 * not ad hoc content passed to this call — so there's exactly one place
 * ("draft") that ever holds "what will actually be published," whether
 * the teacher edited anything or not (a draft always exists, seeded at
 * generation). Refuses to approve a proposal that's gone stale since it
 * was generated (requirement 8 from step 4) — the teacher regenerates
 * first. Either authorized teacher may approve, alone.
 *
 * `expectedRevision` protects against approving a stale browser copy: if
 * the draft the caller last saw isn't the one currently saved (e.g. the
 * other teacher account saved a newer edit after this browser loaded the
 * review screen but before clicking Approve), this is rejected — verified
 * with a fresh read INSIDE the same transaction that commits the
 * approval, not just a pre-check, so a save landing in that exact window
 * can't slip through.
 */
export const approveProposedDay = onCall<ApproveProposedDayRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { proposedDayId, expectedRevision } = request.data ?? {};
  if (!proposedDayId || typeof proposedDayId !== "string") {
    throw new HttpsError("invalid-argument", "proposedDayId is required.");
  }
  if (typeof expectedRevision !== "number" || expectedRevision < 0) {
    throw new HttpsError("invalid-argument", "expectedRevision is required.");
  }

  const db = getFirestore();
  const ref = db.collection("proposedDays").doc(proposedDayId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No such proposed day.");
  }
  const doc = snap.data() as ProposedDay;
  requireSameFamily(caller, doc.familyId);

  if (doc.status === "approved") {
    throw new HttpsError("failed-precondition", "This day is already approved and published — nothing to do.");
  }

  const latest = await getLatestProposedDay(doc.familyId, doc.studentId, doc.date);
  if (!latest || latest.id !== proposedDayId) {
    throw new HttpsError(
      "failed-precondition",
      "A newer proposal exists for this student/date — review that one instead of an older version."
    );
  }

  const staleness = await checkStalenessInternal(doc);
  if (staleness) {
    throw new HttpsError(
      "failed-precondition",
      "This proposal's source content has changed since it was generated — regenerate it before approving."
    );
  }

  const { proposalId } = await createProposal<ApproveProposedDayPayload>({
    kind: "dayPlanPublication",
    familyId: doc.familyId,
    targetUserId: doc.studentId,
    proposedByUid: caller.uid,
    proposedByRole: "teacher",
    payload: { familyId: doc.familyId, proposedDayId, studentId: doc.studentId, date: doc.date, expectedRevision },
  });

  await approveProposal<ApproveProposedDayPayload>({
    proposalId,
    reviewerUid: caller.uid,
    commit: async (tx) => {
      // Fresh read, INSIDE this transaction — a second read before any
      // writes is fine (approveProposal already read the Proposal doc
      // first) — so a draft saved in the gap between our pre-check above
      // and this commit actually running can't be silently approved over.
      const freshSnap = await tx.get(ref);
      const freshDoc = freshSnap.data() as ProposedDay;
      const revisionCheck = checkDraftRevision(freshDoc.draft.revision, expectedRevision);
      if (!revisionCheck.ok) {
        throw new HttpsError(
          "failed-precondition",
          `A newer draft (revision ${revisionCheck.currentRevision}) was saved since you loaded this proposal — ` +
            `review it before approving.`
        );
      }
      const approvedAt = Timestamp.now();
      tx.update(ref, {
        status: "approved",
        approvedByUid: caller.uid,
        approvedAt,
        itineraryMode: freshDoc.draft.itineraryMode,
      });

      // Student-safe published projection (build-order step 11, section
      // 2) — written in the SAME transaction as approval itself, from the
      // exact freshDoc/approvedAt that just became authoritative, so the
      // two can never disagree or exist in only one of the two
      // collections. See curriculum/publishedDay.ts's doc comment for
      // exactly which fields this does and does not copy.
      const publishedRef = db
        .collection("publishedDays")
        .doc(publishedDayDocId(freshDoc.familyId, freshDoc.studentId, freshDoc.date));
      tx.set(publishedRef, buildPublishedDayProjection(freshDoc, proposedDayId, approvedAt));
    },
  });

  return { proposedDayId };
});

/** Shared by checkProposedDayStaleness and approveProposedDay's pre-approval check. */
async function checkStalenessInternal(doc: ProposedDay): Promise<boolean> {
  if (doc.status === "approved") return false; // preserved historically, never "stale" — see isProposedDayStale
  const inputs = await loadDailyGenerationInputs(doc.familyId, doc.date);
  if (!inputs) return false;
  const { family, quarterAndWeek } = inputs;
  const governanceMode = getCurriculumGovernanceMode(family);
  const [familyQuarterStatus, familyWeekStatus, dayDesignations] = await Promise.all([
    quarterAndWeek ? getFamilyQuarterCertificationStatus(doc.familyId, quarterAndWeek.quarter) : Promise.resolve(null),
    quarterAndWeek
      ? getFamilyWeeklyCertificationStatus(doc.familyId, quarterAndWeek.quarter, quarterAndWeek.week)
      : Promise.resolve(null),
    getDayDesignationsForDate(doc.familyId, doc.date),
  ]);

  let context: StudentContext | null;
  try {
    context = await buildStudentContext(
      doc.studentId,
      doc.familyId,
      governanceMode,
      quarterAndWeek,
      familyQuarterStatus,
      familyWeekStatus,
      dayDesignations
    );
  } catch {
    return true;
  }
  if (!context) return false;

  const currentSourceSignature = computeSourceSignature(context, classifyDayType(context));
  return isProposedDayStale({ status: doc.status, sourceSignature: doc.sourceSignature, currentSourceSignature });
}

interface SetAssessmentEligibilityRequest {
  proposedDayId: string;
  /** Omitted = applies to the WHOLE day; a real blockId = just that one block. */
  blockId?: string;
  eligible: boolean;
  reason?: string;
}

interface AssessmentEligibilityPayload {
  proposedDayId: string;
  blockId: string | null;
  eligible: boolean;
  reason: string | null;
}

/**
 * "Do Not Use for Assessment" (build-order step 5, requirement 10). A
 * single, immediate teacher action — not a propose-then-separately-
 * approve review cycle (there's nothing to review; it's the teacher's own
 * direct governance call, the same shape as designateDay) — but still
 * routed through createProposal/approveProposal back-to-back so it gets
 * the same permanent audit-trail entry every other governance action
 * gets, rather than inventing a new ad hoc pattern for just this one.
 *
 * Works on a proposed OR approved day — evidence-eligibility is
 * orthogonal to the draft/approval lifecycle, so it deliberately does
 * NOT touch draft.revision or require an expectedRevision: flagging a
 * block doesn't invalidate whatever a teacher is mid-editing, and doesn't
 * require re-approval. Never erases completion, instructional time, the
 * historical record, or student work — it only ever writes the exclusion
 * flag itself (blockAssessmentExclusions / dayAssessmentEligibility),
 * alongside every other field on the document, untouched.
 */
export const setAssessmentEligibility = onCall<SetAssessmentEligibilityRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { proposedDayId, blockId, eligible, reason } = request.data ?? {};
  if (!proposedDayId || typeof proposedDayId !== "string") {
    throw new HttpsError("invalid-argument", "proposedDayId is required.");
  }
  if (typeof eligible !== "boolean") {
    throw new HttpsError("invalid-argument", "eligible is required.");
  }
  if (blockId !== undefined && (typeof blockId !== "string" || blockId.trim().length === 0)) {
    throw new HttpsError("invalid-argument", "blockId, when provided, must be a non-empty string.");
  }
  if (reason !== undefined && typeof reason !== "string") {
    throw new HttpsError("invalid-argument", "reason, when provided, must be a string.");
  }

  const db = getFirestore();
  const ref = db.collection("proposedDays").doc(proposedDayId);
  const preSnap = await ref.get();
  if (!preSnap.exists) {
    throw new HttpsError("not-found", "No such proposed day.");
  }
  const preDoc = preSnap.data() as ProposedDay;
  requireSameFamily(caller, preDoc.familyId);
  if (blockId && !preDoc.learningBlocks.some((b) => b.blockId === blockId)) {
    throw new HttpsError("invalid-argument", `No such block "${blockId}" on this proposed day.`);
  }

  const { proposalId } = await createProposal<AssessmentEligibilityPayload>({
    kind: "assessmentEligibilityChange",
    familyId: preDoc.familyId,
    targetUserId: preDoc.studentId,
    proposedByUid: caller.uid,
    proposedByRole: "teacher",
    payload: { proposedDayId, blockId: blockId ?? null, eligible, reason: reason ?? null },
  });

  await approveProposal<AssessmentEligibilityPayload>({
    proposalId,
    reviewerUid: caller.uid,
    commit: async (tx, payload) => {
      // Fresh read INSIDE the transaction — two teachers flagging
      // DIFFERENT blocks at nearly the same moment must not have one
      // overwrite the other's entry in the shared exclusions map, which a
      // pre-transaction read (preDoc, captured before createProposal even
      // ran) could not protect against.
      const freshSnap = await tx.get(ref);
      const freshDoc = freshSnap.data() as ProposedDay;
      const flag: AssessmentEligibility = payload.eligible
        ? { eligible: true }
        : {
            eligible: false,
            excludedByUid: caller.uid,
            excludedAt: Timestamp.now(),
            ...(payload.reason ? { excludedReason: payload.reason } : {}),
          };
      if (payload.blockId) {
        const exclusions = { ...(freshDoc.blockAssessmentExclusions ?? {}), [payload.blockId]: flag };
        tx.update(ref, { blockAssessmentExclusions: exclusions });
      } else {
        tx.update(ref, { dayAssessmentEligibility: flag });
      }
    },
  });

  return { proposedDayId, blockId: blockId ?? null, eligible };
});
