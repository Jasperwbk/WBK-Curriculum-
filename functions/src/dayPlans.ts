import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { requireCaller, requireTeacher } from "./util/auth";
import { ALL_SUBJECTS, subjectLabel } from "./subjects";
import { getMasteryRecordsForUser } from "./mastery";
import { getDailySubjectAssignments } from "./curriculum/colorSheetRotation";
import { getQuarterAndWeek, loadWeekContent } from "./curriculum/loadCurriculumContent";
import { inferKidKey } from "./curriculum/placementTestItems";
import type { Family, MasteryRecord, PlacementKidKey, Subject, UserProfile } from "./types";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Art-ability band per curriculum/10_daily_color_sheet_model.md — used only
// to tell Claude how much detail the day's color sheet should carry.
const BAND_BY_KID: Record<PlacementKidKey, string> = {
  millaray: "Band C (detailed scene, background allowed, ~15-20 min to color)",
  makaio: "Band B (one clear scene, 4-8 objects, some interior detail)",
  maizley: "Band A (2-4 giant objects, thick outlines, no background)",
};

interface GeneratePlanRequest {
  date: string; // ISO date the plan is for
  studentNames: string[]; // display names, for personalizing tone/content
  studentIds?: string[]; // optional — enables mastery-aware, color-sheet-aware generation
  prompt: string; // teacher's free-text description of the day
}

interface GeneratedPlan {
  title: string;
  summary: string;
  planText: string;
}

/**
 * Builds a per-student context block for the prompt: which objectives are
 * mastered vs. still in progress (per the 2-of-3 threshold in
 * learn_practice_test_alignment_standard_v2.md), the assessment baseline,
 * and today's featured subject + color sheet assignment (per
 * 10_daily_color_sheet_model.md). Falls back to a name-only line if the
 * student can't be resolved (unknown id, non-family-member, etc.) — the
 * generator still works with less context rather than failing outright.
 */
async function buildStudentContext(
  studentId: string,
  familyId: string,
  schoolYearStart: Date,
  planDate: Date
): Promise<string | null> {
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

  const kidKey = inferKidKey(profile.displayName);
  if (kidKey) {
    const quarterAndWeek = getQuarterAndWeek(schoolYearStart, planDate);
    const weekContent = quarterAndWeek
      ? await loadWeekContent(familyId, kidKey, quarterAndWeek.quarter, quarterAndWeek.week)
      : null;
    if (weekContent && quarterAndWeek) {
      lines.push(
        `  --- This week's actual curriculum content (${quarterAndWeek.quarter.toUpperCase()} Week ${quarterAndWeek.week}), ` +
          `verbatim from the real curriculum file. Base today's specific topics/objectives/activities on this ` +
          `— do not invent unrelated topics or substitute generic homeschool content: ---\n${weekContent}\n` +
          `  --- end of curriculum content ---`
      );
    }

    const assignments = getDailySubjectAssignments(schoolYearStart, planDate);
    const featuredSubject = assignments[kidKey];
    lines.push(
      `  Today's featured print subject + color sheet: ${subjectLabel(featuredSubject)}, ` +
        `drawn at ${BAND_BY_KID[kidKey]}. No other kid gets this subject as their color sheet today.`
    );
  }

  return lines.join("\n");
}

function formatObjectives(records: MasteryRecord[]): string {
  return records.map((r) => `${subjectLabel(r.subject)}/${r.skill}`).join(", ");
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
 * When studentIds is supplied, the plan is mastery-aware: it pulls each
 * named student's per-objective mastery state and assessment baseline
 * (learn_practice_test_alignment_standard_v2.md) and today's deterministic
 * color-sheet subject assignment (10_daily_color_sheet_model.md) into the
 * prompt, so a regular school day actually follows the warm-up/new-teaching/
 * interleaved-practice/retrieval-close-out shape and routes around whatever
 * each kid is still building. Without studentIds it still works, just with
 * less personalization — useful for a pure field-trip/fun day where none of
 * this applies anyway.
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
    if (ids.length > 0) {
      const db = getFirestore();
      const familyId = caller.profile.familyId;
      const familySnap = await db.collection("families").doc(familyId).get();
      if (familySnap.exists) {
        const family = familySnap.data() as Family;
        const schoolYearStart = family.schoolYear.startDate.toDate();
        const planDate = new Date(date);
        const contexts = await Promise.all(
          ids.map((id) => buildStudentContext(id, familyId, schoolYearStart, planDate))
        );
        const validContexts = contexts.filter((c): c is string => c !== null);
        if (validContexts.length > 0) {
          studentContextBlock = `\n\nPer-student context (use this to route around what each kid is still building, not just their name):\n${validContexts.join("\n")}`;
        }
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
        "4. If per-student context names a featured print subject + color sheet for a kid today, mention it " +
        "as their printable color sheet for the day (a black-line-art drawing they color after their " +
        "worksheet) — don't invent a different subject for it, and don't give two kids the same one.\n" +
        "5. If per-student context flags an objective as being aced easily (no struggle at all), don't just " +
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
