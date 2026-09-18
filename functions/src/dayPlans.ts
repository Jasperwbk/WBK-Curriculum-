import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { requireCaller, requireTeacher } from "./util/auth";
import { ALL_SUBJECTS, subjectLabel } from "./subjects";
import { getMasteryRecordsForUser } from "./mastery";
import { getQuarterAndWeek, loadWeekContent } from "./curriculum/loadCurriculumContent";
import {
  getFamilyQuarterCertificationStatus,
  getFamilyWeeklyCertificationStatus,
  type FamilyQuarterStatusResult,
  type FamilyWeekStatusResult,
} from "./curriculum/certificationStatus";
import { evaluateCertificationGate, type CertificationGateOutcome } from "./curriculum/certificationGate";
import { getCurriculumGovernanceMode } from "./curriculum/curriculumGovernance";
import {
  getDayDesignationsForDate,
  findDesignationForKid,
  type DayDesignationLookup,
} from "./curriculum/dayDesignation";
import { inferKidKey } from "./curriculum/placementTestItems";
import type {
  CurriculumGovernanceMode,
  DayDesignationType,
  Family,
  MasteryRecord,
  PlacementKidKey,
  Quarter,
  Subject,
  UserProfile,
} from "./types";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

interface GeneratePlanRequest {
  date: string; // ISO date the plan is for
  studentNames: string[]; // display names, for personalizing tone/content
  studentIds?: string[]; // optional — enables mastery-aware, color-sheet-aware generation
  prompt: string; // teacher's free-text description of the day
}

/** The shape Claude is asked to return — certifications (below) is added separately, not by Claude. */
interface GeneratedPlan {
  title: string;
  summary: string;
  planText: string;
}

/**
 * Exported for reuse by proposedDays.ts (build-order step 4): the
 * two-day-ahead governed pipeline needs the exact same per-student
 * gate/grounding decision generatePlan already makes — reusing this
 * function rather than re-implementing the gate check keeps the two
 * pipelines from ever silently disagreeing about what's allowed. Every
 * field below is additive to what generatePlan itself reads
 * (contextLine/weeklyCertificationId) — its own behavior is unchanged.
 */
export interface StudentContext {
  contextLine: string;
  /** The FamilyWeeklyCertification this context's curriculum-content grounding was based on, when there was one. */
  weeklyCertificationId: string | null;
  /** The FamilyQuarterCertification current at generation time, when there was one. */
  quarterCertificationId: string | null;
  kidKey: PlacementKidKey | null;
  quarterAndWeek: { quarter: Quarter; week: number } | null;
  /** null only when kidKey or quarterAndWeek couldn't resolve at all (nothing to gate). */
  gateOutcome: CertificationGateOutcome | null;
  dayDesignationId: string | null;
  dayDesignationType: DayDesignationType | null;
  dayDesignationDescription: string | null;
  /** The raw week content text used for grounding, when the gate allowed it (certified or legacy). */
  weekContent: string | null;
  /**
   * Real, already-assigned objectiveIds (mastered + aced), grouped by
   * subject — build-order step 5: a retrieval/warm-up block reuses one of
   * THESE real ids rather than inventing a new one, so retrieval evidence
   * actually lands against the same objective it's retrieving. See
   * curriculum/blockValidation.ts.
   */
  masteredObjectiveIdsBySubject: Partial<Record<Subject, string[]>>;
  /** Real objectiveIds currently "still building" (not yet mastered), grouped by subject — used to default a block's remediationIntent to "remediation" rather than "initial_instruction". */
  inProgressObjectiveIdsBySubject: Partial<Record<Subject, string[]>>;
}

/**
 * Builds a per-student context block for the prompt: which objectives are
 * mastered vs. still in progress (per the 2-of-3 threshold in
 * learn_practice_test_alignment_standard_v2.md) and the assessment
 * baseline. Falls back to a name-only line if the
 * student can't be resolved (unknown id, non-family-member, etc.) — the
 * generator still works with less context rather than failing outright.
 *
 * Certification gate (build-order step 3, revised 3.1/3.2 — see
 * certificationGate.ts for the full state machine): governanceMode,
 * quarterAndWeek, familyQuarterStatus, and familyWeekStatus are all
 * resolved ONCE by the caller (they don't vary per student — the family
 * package governs every kid together), and dayDesignations is this date's
 * full list of explicit teacher overrides, also fetched once. Throws
 * failed-precondition when the gate blocks — content exists but
 * uncertified/stale, content is unexpectedly missing in a governed
 * quarter, or (3.2) the quarter itself isn't currently certified at all
 * under "governed" mode — rather than silently proceeding.
 */
export async function buildStudentContext(
  studentId: string,
  familyId: string,
  governanceMode: CurriculumGovernanceMode,
  quarterAndWeek: { quarter: Quarter; week: number } | null,
  familyQuarterStatus: FamilyQuarterStatusResult | null,
  familyWeekStatus: FamilyWeekStatusResult | null,
  dayDesignations: DayDesignationLookup[]
): Promise<StudentContext | null> {
  const db = getFirestore();
  const snap = await db.collection("users").doc(studentId).get();
  if (!snap.exists) return null;
  const profile = snap.data() as UserProfile;
  if (profile.familyId !== familyId) return null;

  const records = await getMasteryRecordsForUser(studentId);
  // "Aced" (3-for-3, no struggle at all) is a stricter subset of "mastered"
  // (2-of-3) — split it out so acing-it-easily gets a harder follow-up
  // instead of blending into ordinary warm-up review material.
  const aced = records.filter((r) => r.aced);
  const masteredNotAced = records.filter((r) => r.mastered && !r.aced);
  const inProgress = records.filter((r) => !r.mastered);

  const lines: string[] = [`${profile.displayName}:`];

  if (masteredNotAced.length > 0) {
    lines.push(`  Mastered (good warm-up/retrieval material): ${formatObjectives(masteredNotAced)}`);
  }
  if (aced.length > 0) {
    lines.push(
      `  Acing these easily, no struggle at all (3-for-3 correct) — don't just review at this level, ` +
        `give a genuinely harder stretch version of the skill: ${formatObjectives(aced)}`
    );
  }
  if (inProgress.length > 0) {
    lines.push(
      `  Still building — needs re-teaching with a genuinely different framing before new ` +
        `objectives stack on top in that subject: ${formatObjectives(inProgress)}`
    );
  }

  const masteredObjectiveIdsBySubject = groupObjectiveIdsBySubject([...masteredNotAced, ...aced]);
  const inProgressObjectiveIdsBySubject = groupObjectiveIdsBySubject(inProgress);

  const subjectsReadyToExceedGradeLevel = subjectsWhereEveryTrackedObjectiveIsAced(records);
  if (subjectsReadyToExceedGradeLevel.length > 0) {
    lines.push(
      `  Acing everything currently tracked in ${subjectsReadyToExceedGradeLevel.map(subjectLabel).join(", ")} — ` +
        `don't plateau at grade-level review here; introduce above-grade-level material or a genuine stretch goal.`
    );
  }
  const baselineEntries = Object.entries(profile.assessmentBaseline ?? {});
  if (baselineEntries.length > 0) {
    lines.push(
      `  Assessment baseline: ${baselineEntries
        .map(([subject, note]) => `${subjectLabel(subject)} — ${note}`)
        .join("; ")}`
    );
  }

  let weeklyCertificationId: string | null = null;
  let gateOutcome: CertificationGateOutcome | null = null;
  let dayDesignationId: string | null = null;
  let dayDesignationType: DayDesignationType | null = null;
  let dayDesignationDescription: string | null = null;
  let usedWeekContent: string | null = null;
  const kidKey = inferKidKey(profile.displayName);
  if (kidKey && quarterAndWeek) {
    const weekContent = await loadWeekContent(familyId, kidKey, quarterAndWeek.quarter, quarterAndWeek.week);
    const designation = findDesignationForKid(dayDesignations, kidKey);

    const gate = evaluateCertificationGate({
      governanceMode,
      quarterStatus: familyQuarterStatus?.status ?? "neverCertified",
      hasContent: weekContent !== null,
      familyWeekStatus: familyWeekStatus?.status ?? "neverCertified",
      staleKidKeys: familyWeekStatus?.staleKidKeys ?? [],
      dayDesignation: designation,
      kidKey,
      quarter: quarterAndWeek.quarter,
      week: quarterAndWeek.week,
    });
    gateOutcome = gate.outcome;

    if (!gate.allow) {
      throw new HttpsError("failed-precondition", gate.reason);
    }

    if (gate.outcome === "alternative_package" || gate.outcome === "non_instructional") {
      const label = gate.outcome === "alternative_package" ? "an approved alternative package" : "an approved non-instructional day";
      lines.push(`  --- Today is explicitly designated as ${label} for ${profile.displayName}: ${gate.description} ---`);
      dayDesignationId = designation?.id ?? null;
      dayDesignationType = designation?.type ?? null;
      dayDesignationDescription = designation?.description ?? null;
      // Deliberately does not use weekContent even if some exists — an
      // explicit designation overrides ordinary curriculum grounding for
      // this date, it doesn't add to it.
    } else if (weekContent) {
      // Reaches here only for "certified" or "legacy_compatibility" —
      // every "blocked_*" outcome already threw above. Legacy mode grounds
      // on whatever content exists exactly like pre-certification behavior
      // (nothing is enforced under "legacy"); only "certified" has an
      // actual certification record to attribute it to.
      if (gate.outcome === "certified") {
        weeklyCertificationId = familyWeekStatus?.latest?.id ?? null;
      }
      usedWeekContent = weekContent;
      lines.push(
        `  --- This week's actual curriculum content (${quarterAndWeek.quarter.toUpperCase()} Week ${quarterAndWeek.week}), ` +
          `verbatim from the real curriculum file. Base today's specific topics/objectives/activities on this ` +
          `— do not invent unrelated topics or substitute generic homeschool content: ---\n${weekContent}\n` +
          `  --- end of curriculum content ---`
      );
    }
  }

  return {
    contextLine: lines.join("\n"),
    weeklyCertificationId,
    quarterCertificationId: familyQuarterStatus?.latest?.id ?? null,
    kidKey,
    quarterAndWeek,
    gateOutcome,
    dayDesignationId,
    dayDesignationType,
    dayDesignationDescription,
    weekContent: usedWeekContent,
    masteredObjectiveIdsBySubject,
    inProgressObjectiveIdsBySubject,
  };
}

function formatObjectives(records: MasteryRecord[]): string {
  return records.map((r) => `${subjectLabel(r.subject)}/${r.skill}`).join(", ");
}

function groupObjectiveIdsBySubject(records: MasteryRecord[]): Partial<Record<Subject, string[]>> {
  const bySubject: Partial<Record<Subject, string[]>> = {};
  for (const r of records) {
    const list = bySubject[r.subject] ?? [];
    list.push(r.objectiveId);
    bySubject[r.subject] = list;
  }
  return bySubject;
}

/**
 * A subject only counts as "ready to exceed grade-level" once every single
 * objective currently tracked for it is aced — one still-building or
 * merely-mastered objective in the mix means there's still real work to do
 * at the current level first (the "close gaps before going further"
 * ordering from ROADMAP.md §4).
 */
function subjectsWhereEveryTrackedObjectiveIsAced(records: MasteryRecord[]): Subject[] {
  const bySubject = new Map<Subject, MasteryRecord[]>();
  for (const r of records) {
    const list = bySubject.get(r.subject) ?? [];
    list.push(r);
    bySubject.set(r.subject, list);
  }
  return [...bySubject.entries()]
    .filter(([, recs]) => recs.every((r) => r.aced))
    .map(([subject]) => subject);
}

/**
 * Generates a draft day plan from the teacher's free-text description —
 * anything from an ordinary school day to "Friday we're camping at X, light
 * on the education, more on fun." Nothing is written to Firestore here; the
 * teacher reviews/edits the result in the UI and saves it themselves
 * (mirrors the human-in-the-loop pattern already used for extracurricular
 * ingestion), which becomes the dayPlans/{planId} doc students only see on
 * or after its date.
 *
 * dayPlans is a LEGACY/FREEFORM planning tool, kept available for
 * teacher-prompted one-offs (field trips, special days) — it is explicitly
 * NOT the authoritative governed school record as of build-order step 4.1.
 * That role belongs to proposedDays/{proposedDayId} (proposedDays.ts):
 * generation -> teacher review -> approval -> publication -> historical
 * record, grounded in certified content rather than a free-text prompt.
 * The two collections are not synchronized, automatically or otherwise;
 * see proposedDays.ts's top comment for the full decision.
 *
 * When studentIds is supplied, the plan is mastery-aware: it pulls each
 * named student's per-objective mastery state and assessment baseline
 * (learn_practice_test_alignment_standard_v2.md) into the prompt, so a
 * regular school day actually follows the warm-up/new-teaching/
 * interleaved-practice/retrieval-close-out shape and routes around whatever
 * each kid is still building. Without studentIds it still works, just with
 * less personalization — useful for a pure field-trip/fun day where none of
 * this applies anyway.
 *
 * Curriculum-content grounding is gated by the family's certification
 * status (build-order step 3, revised 3.1 — certificationGate.ts): a
 * governed quarter/week with expected-but-uncertified or unexpectedly
 * missing content blocks generation outright rather than silently
 * degrading, unless an explicit DayDesignation says the date is an
 * approved alternative-package or non-instructional day.
 *
 * Does not yet assign a Historical Figure Coloring pick (build-order step 8
 * — see functions/src/curriculum/historicalFigureSelector.ts); the prior
 * subject-ring color-sheet assignment that used to fill this role has been
 * retired (curriculum/gap_analysis_2026-09-18.md §1).
 */
export const generatePlan = onCall<GeneratePlanRequest>(
  { secrets: [anthropicApiKey] },
  async (request) => {
    const caller = await requireCaller(request);
    requireTeacher(caller);

    const { date, studentNames, studentIds, prompt } = request.data ?? {};
    if (!date || typeof date !== "string" || Number.isNaN(new Date(date).getTime())) {
      throw new HttpsError("invalid-argument", "A valid date is required.");
    }
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new HttpsError("invalid-argument", "A description of the day is required.");
    }
    if (prompt.length > 4000) {
      throw new HttpsError("invalid-argument", "Description is too long (4,000 character max).");
    }
    const names = Array.isArray(studentNames) ? studentNames.filter((n) => typeof n === "string") : [];
    const ids = Array.isArray(studentIds) ? studentIds.filter((id) => typeof id === "string") : [];

    let studentContextBlock = "";
    const certifications: { studentId: string; weeklyCertificationId: string }[] = [];
    if (ids.length > 0) {
      const db = getFirestore();
      const familyId = caller.profile.familyId;
      const familySnap = await db.collection("families").doc(familyId).get();
      if (familySnap.exists) {
        const family = familySnap.data() as Family;
        const schoolYearStart = family.schoolYear.startDate.toDate();
        const planDate = new Date(date);
        const governanceMode = getCurriculumGovernanceMode(family);

        // Resolved ONCE, not per student: the family's governance mode,
        // quarter/week certification status, and this date's explicit
        // teacher overrides all govern every kid's package together, not
        // independently (build-order step 3.1/3.2 — see
        // certificationGate.ts).
        const quarterAndWeek = getQuarterAndWeek(schoolYearStart, planDate);
        const [familyQuarterStatus, familyWeekStatus, dayDesignations] = await Promise.all([
          quarterAndWeek ? getFamilyQuarterCertificationStatus(familyId, quarterAndWeek.quarter) : Promise.resolve(null),
          quarterAndWeek
            ? getFamilyWeeklyCertificationStatus(familyId, quarterAndWeek.quarter, quarterAndWeek.week)
            : Promise.resolve(null),
          getDayDesignationsForDate(familyId, date),
        ]);

        const contexts = await Promise.all(
          ids.map((id) =>
            buildStudentContext(
              id,
              familyId,
              governanceMode,
              quarterAndWeek,
              familyQuarterStatus,
              familyWeekStatus,
              dayDesignations
            )
          )
        );
        const validContexts = contexts.filter((c): c is StudentContext => c !== null);
        if (validContexts.length > 0) {
          studentContextBlock = `\n\nPer-student context (use this to route around what each kid is still building, not just their name):\n${validContexts.map((c) => c.contextLine).join("\n")}`;
        }
        contexts.forEach((context, i) => {
          if (context?.weeklyCertificationId) {
            certifications.push({ studentId: ids[i], weeklyCertificationId: context.weeklyCertificationId });
          }
        });
      }
    }

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1800,
      system:
        "You write a single day's homeschool plan for a family, from the teacher's own description of " +
        "the day. The description might be an ordinary school day, or something special like a field trip, " +
        "trip, or holiday — match your tone and educational weight to what the teacher actually asked for " +
        "(e.g. 'light on the education, more on fun' means keep it short, playful, and low-pressure; a " +
        "request for a regular focused day means a fuller plan). Where it fits naturally, weave in 1-3 " +
        `concrete learning objectives and mention one of these standardized subjects if relevant: ${ALL_SUBJECTS.join(", ")}. ` +
        "Include a short, optional worksheet or reflection-question idea only if it fits the day's tone — " +
        "skip it for a pure-fun day.\n\n" +
        "If per-student context below includes a block of 'this week's actual curriculum content,' that " +
        "content is authoritative — it's the real, already-written curriculum for that kid's current week, " +
        "not a suggestion. Base the day's actual topics, objectives, and activities on it directly rather " +
        "than inventing your own unrelated topic, even a plausible-sounding one. Only fall back on your own " +
        "general knowledge when no such block is present (e.g. the date falls outside the currently-written " +
        "curriculum) or the teacher's own description explicitly asks for something different (a field trip, " +
        "a sick day, etc. overrides the week's regular content for that one day).\n\n" +
        "For a regular school day (not a pure field-trip/fun day), follow these standing rules:\n" +
        "1. Open with the Pledge of Allegiance as a fixed first step, independent of whatever subject " +
        "content follows.\n" +
        "2. Shape each kid's academic block as: a short warm-up of retrieval questions from material " +
        "they've already mastered (not today's new material) -> new teaching -> mixed/interleaved practice " +
        "(today's objective plus 1-2 older mastered ones once there are 2+ live) -> a short, ungraded " +
        "retrieval close-out. If per-student context below lists objectives 'still building,' the day's new " +
        "teaching for that subject should re-teach that specific objective with a genuinely different framing " +
        "or example before introducing anything new in that subject — don't just move on because the week's " +
        "theme is moving on.\n" +
        "3. The actual practice/work should be mostly physical — real printable worksheets the kids do by " +
        "hand, favoring interactive/puzzle formats (maze, matching, word search, fill-in-the-scene) over a " +
        "bare problem list, plus a cursive handwriting component where it fits naturally. Digital/on-screen " +
        "content stays in a guidance role, like a teacher presenting, not where the actual work happens.\n" +
        "4. If per-student context flags an objective as being aced easily (no struggle at all), don't just " +
        "repeat it or fold it into ordinary review — give a genuinely harder stretch version of that specific " +
        "skill today, so acing something too easily gets detected and probed further rather than just marked " +
        "done. If a whole subject is flagged as 'ready to exceed grade-level,' don't plateau at grade-level " +
        "review in that subject — introduce real above-grade-level material or a stretch goal there. The " +
        "overall goal is closing whatever gaps a kid currently has first, then continuing to push them past " +
        "typical grade-level expectations once caught up, not capping out once they're merely 'on level.'\n" +
        "Interleaved/mixed practice is expected to produce more wrong answers and feel harder than blocked " +
        "drilling — note that in the plan as the method working as intended, not a sign of falling behind, " +
        "if it comes up.\n\n" +
        "Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape: " +
        '{"title": string (short, e.g. "Camping Trip: Nature & Fire Safety"), ' +
        '"summary": string (one sentence), ' +
        '"planText": string (the full plan, plain text with blank lines between sections, ' +
        "no markdown headers)}.",
      messages: [
        {
          role: "user",
          content:
            `Date: ${date}\n` +
            (names.length > 0 ? `Kids involved: ${names.join(", ")}\n` : "") +
            `Teacher's description: ${prompt}` +
            studentContextBlock,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new HttpsError("internal", "Claude returned no parseable text.");
    }

    let parsed: GeneratedPlan;
    try {
      parsed = JSON.parse(extractJson(textBlock.text));
    } catch {
      throw new HttpsError("internal", "Could not parse Claude's response as JSON.");
    }

    return {
      title: typeof parsed.title === "string" ? parsed.title : "Day plan",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      planText: typeof parsed.planText === "string" ? parsed.planText : "",
      certifications,
    };
  }
);

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in response.");
  }
  return text.slice(start, end + 1);
}
