import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { requireCaller, requireTeacher, requireSameFamily } from "./util/auth";
import { createProposal, approveProposal } from "./approvals";
import { ALL_SUBJECTS, isValidSubject } from "./subjects";
import { getQuarterAndWeek } from "./curriculum/loadCurriculumContent";
import {
  getFamilyQuarterCertificationStatus,
  getFamilyWeeklyCertificationStatus,
} from "./curriculum/certificationStatus";
import { getCurriculumGovernanceMode } from "./curriculum/curriculumGovernance";
import { getDayDesignationsForDate } from "./curriculum/dayDesignation";
import { hashText } from "./curriculum/contentHash";
import { decideGenerationAction, isProposedDayStale } from "./curriculum/proposedDayLifecycle";
import { buildStudentContext, type StudentContext } from "./dayPlans";
import type {
  Family,
  ItineraryMode,
  JasperMessage,
  LearningBlockSummary,
  ProposedDay,
  ProposedDayType,
  UserProfile,
} from "./types";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * Two-day-ahead governed daily proposal pipeline (build-order step 4):
 *
 *   certified quarter -> certified week -> proposed day (this file)
 *   -> teacher review/edit -> teacher approval -> published student day
 *
 * A parallel system to the existing dayPlans/{planId} collection
 * (generatePlan/PlanDayPage.tsx), not a replacement of it — dayPlans stays
 * exactly as it is for freeform, teacher-prompted, often multi-kid days
 * (field trips, special one-offs). ProposedDay is a different shape for a
 * genuinely different job: one per (family, student, school date),
 * generated ahead of time FROM certified content rather than a teacher's
 * free-text prompt, carrying the version/traceability/approval metadata
 * the governed pipeline needs. Both reuse the same underlying pieces —
 * buildStudentContext (dayPlans.ts) for the identical per-student
 * certification-gate decision, the same Anthropic model, the same
 * approvals.ts primitive for the actual approve action — rather than
 * duplicating that logic twice.
 *
 * This step deliberately builds three separate layers, per the request:
 *   A. computeGenerationTargetDate / decideGenerationAction
 *      (generationSchedule.ts / proposedDayLifecycle.ts) — pure, no I/O.
 *   B. generateProposedDays (this file) — the callable/service that
 *      actually does it, invoked manually (by a teacher, from the UI)
 *      for now.
 *   C. Automatic scheduled invocation — NOT built. No Cloud Scheduler/
 *      cron job exists yet; generateProposedDays is just as valid to call
 *      from a future scheduled function as it is from a button today, but
 *      that trigger itself is out of scope for step 4.
 */

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

async function getLatestProposedDay(
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
  learningBlocks: LearningBlockSummary[];
}

/**
 * The one Claude call per student for an "ordinary" or "alternativePackage"
 * day — reuses the same context.contextLine grounding buildStudentContext
 * already produces for generatePlan, extended to also ask for the Jasper
 * Morning Message, a suggested itinerary mode, and a lightweight block
 * list (NOT the full step-5 block/objective engine — just enough for the
 * teacher to see the day's shape and for a later Strict/Flexible check).
 */
async function generateOrdinaryDayContent(params: {
  apiKey: string;
  date: string;
  studentName: string;
  context: StudentContext;
  dayType: ProposedDayType;
}): Promise<GeneratedContent> {
  const client = new Anthropic({ apiKey: params.apiKey });

  const alternativeNote =
    params.dayType === "alternativePackage"
      ? "\n\nToday is an explicitly approved ALTERNATIVE PACKAGE day for this student (see the per-student context " +
        "below) — build the day around that description, not ordinary weekly curriculum, the same way a field " +
        "trip would override the week's regular content."
      : "";

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1800,
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
      "before introducing anything new in that subject.\n" +
      "3. The actual practice/work should be mostly physical — real printable worksheets, favoring interactive/" +
      "puzzle formats over a bare problem list, plus a cursive handwriting component where it fits naturally.\n" +
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
      "7. List the day's learning blocks as short (subject, one-line description) pairs — a lightweight " +
      "summary only, not full lesson content (that's already in planText).\n" +
      alternativeNote +
      "\n\nRespond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape: " +
      '{"title": string, "summary": string (one sentence), "planText": string (plain text, blank lines between ' +
      'sections, no markdown headers), "jasperMessage": string, "suggestedItineraryMode": "strict" | "flexible", ' +
      `"learningBlocks": [{"subject": one of [${ALL_SUBJECTS.join(", ")}], "description": string}] (1-4 items)}.`,
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

  let parsed: Partial<GeneratedContent>;
  try {
    const start = textBlock.text.indexOf("{");
    const end = textBlock.text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found in response.");
    parsed = JSON.parse(textBlock.text.slice(start, end + 1));
  } catch {
    throw new HttpsError("internal", "Could not parse Claude's response as JSON.");
  }

  const learningBlocks: LearningBlockSummary[] = Array.isArray(parsed.learningBlocks)
    ? (parsed.learningBlocks as unknown[]).flatMap((raw): LearningBlockSummary[] => {
        if (!raw || typeof raw !== "object") return [];
        const subject = (raw as { subject?: unknown }).subject;
        const description = (raw as { description?: unknown }).description;
        if (typeof subject !== "string" || !isValidSubject(subject) || typeof description !== "string") return [];
        return [{ subject, description }];
      })
    : [];

  return {
    title: typeof parsed.title === "string" ? parsed.title : "Proposed day",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    planText: typeof parsed.planText === "string" ? parsed.planText : "",
    jasperMessage: typeof parsed.jasperMessage === "string" ? parsed.jasperMessage : "",
    suggestedItineraryMode: parsed.suggestedItineraryMode === "strict" ? "strict" : "flexible",
    learningBlocks,
  };
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
          if (dayType === "nonInstructional") {
            generated = {
              title: "No School",
              summary: context.dayDesignationDescription ?? "Approved non-instructional day.",
              planText: "",
              jasperMessage: "",
              suggestedItineraryMode: "flexible",
              learningBlocks: [],
            };
          } else {
            const studentSnap = await db.collection("users").doc(studentId).get();
            const studentName = (studentSnap.data() as UserProfile | undefined)?.displayName ?? "the student";
            generated = await generateOrdinaryDayContent({
              apiKey: anthropicApiKey.value(),
              date,
              studentName,
              context,
              dayType,
            });
          }

          const ref = db.collection("proposedDays").doc();
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
            generatedAt: Timestamp.now(),
            generatedByUid: caller.uid,
            title: generated.title,
            summary: generated.summary,
            planText: generated.planText,
            jasperMessage: dayType === "nonInstructional" ? null : ({ generated: generated.jasperMessage } as JasperMessage),
            suggestedItineraryMode: dayType === "nonInstructional" ? null : generated.suggestedItineraryMode,
            learningBlocks: generated.learningBlocks,
            carryForwardNotes: [],
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

interface ApproveProposedDayRequest {
  proposedDayId: string;
  itineraryMode: ItineraryMode;
  jasperMessageOverride?: string;
  titleOverride?: string;
  summaryOverride?: string;
  planTextOverride?: string;
}

interface ApproveProposedDayPayload {
  familyId: string;
  proposedDayId: string;
  studentId: string;
  date: string;
}

/**
 * Generate Proposal -> Review -> Edit -> Select Strict/Flexible -> Edit
 * Jasper Message if desired -> Approve -> Publish, all as one deliberate
 * teacher action (the edits are supplied as this call's own overrides
 * rather than persisted through a separate mid-review write — see this
 * file's top comment and proposedDays firestore.rules for why: keeps
 * proposedDays entirely Cloud-Function-write-only, like every other
 * governance collection here, with no separate "editable while pending"
 * write path to secure). Refuses to approve a proposal that's gone stale
 * since it was generated (requirement 8) — the teacher regenerates first.
 * Either authorized teacher may approve, alone.
 */
export const approveProposedDay = onCall<ApproveProposedDayRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { proposedDayId, itineraryMode, jasperMessageOverride, titleOverride, summaryOverride, planTextOverride } =
    request.data ?? {};
  if (!proposedDayId || typeof proposedDayId !== "string") {
    throw new HttpsError("invalid-argument", "proposedDayId is required.");
  }
  if (itineraryMode !== "strict" && itineraryMode !== "flexible") {
    throw new HttpsError("invalid-argument", 'itineraryMode must be "strict" or "flexible".');
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
    payload: { familyId: doc.familyId, proposedDayId, studentId: doc.studentId, date: doc.date },
  });

  await approveProposal<ApproveProposedDayPayload>({
    proposalId,
    reviewerUid: caller.uid,
    commit: (tx) => {
      const jasperMessage: JasperMessage | null = doc.jasperMessage
        ? { generated: doc.jasperMessage.generated, ...(jasperMessageOverride ? { edited: jasperMessageOverride } : {}) }
        : null;
      tx.update(ref, {
        status: "approved",
        approvedByUid: caller.uid,
        approvedAt: Timestamp.now(),
        itineraryMode,
        jasperMessage,
        ...(titleOverride ? { title: titleOverride } : {}),
        ...(summaryOverride ? { summary: summaryOverride } : {}),
        ...(planTextOverride ? { planText: planTextOverride } : {}),
      });
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
