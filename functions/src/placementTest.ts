import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { requireCaller, requireOwnerOrTeacher, requireTeacher } from "./util/auth";
import { recordMasteryResult } from "./mastery";
import { PLACEMENT_TEST_ITEMS } from "./curriculum/placementTestItems";
import { requireKidKeyForStudent } from "./identity/presentationIdentity";
import type {
  PlacementItemResult,
  PlacementKidKey,
  PlacementSubmission,
  PlacementSubmissionItemResult,
  PlacementTestRecord,
  Subject,
  UserProfile,
} from "./types";

async function loadTarget(familyId: string, userId: string): Promise<UserProfile> {
  const db = getFirestore();
  const snap = await db.collection("users").doc(userId).get();
  if (!snap.exists) {
    throw new HttpsError("invalid-argument", "No such student.");
  }
  const profile = snap.data() as UserProfile;
  if (profile.familyId !== familyId) {
    throw new HttpsError("invalid-argument", "userId does not belong to this family.");
  }
  return profile;
}

/**
 * Defensive cross-check (build-order step 9 finding, section 16: "do not
 * trust client-supplied studentId... derive authoritative identity from
 * authenticated records") — `kidKey` was previously accepted from the
 * client with no check that it actually matches the target account, which
 * could score a placement test against the wrong catalog/objective-id
 * namespace while writing results under the wrong userId.
 *
 * Tightened in build-order step 9.2: a target with no bootstrapped
 * presentation identity is no longer silently permitted through (that
 * would have meant trusting the client-supplied kidKey unchecked for
 * exactly the accounts most in need of the check) — requireKidKeyForStudent
 * throws a clear, actionable error instead, naming the account and
 * pointing at the fix (assign its identity), never falling back to a
 * display-name guess.
 */
function assertKidKeyMatchesTarget(target: UserProfile, kidKey: PlacementKidKey): void {
  const resolved = requireKidKeyForStudent(target);
  if (resolved !== kidKey) {
    throw new HttpsError(
      "invalid-argument",
      `kidKey "${kidKey}" does not match this student's own identity ("${resolved}").`
    );
  }
}

function parseDate(date: string | undefined): Timestamp {
  if (!date) return Timestamp.now();
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpsError("invalid-argument", "date must be a valid ISO date.");
  }
  return Timestamp.fromDate(parsed);
}

interface SubmitPlacementTestRequest {
  userId: string;
  kidKey: "millaray" | "makaio";
  date?: string;
  results: PlacementItemResult[];
}

/**
 * Millaray & Makaio's one-time, teacher-administered, scored placement
 * test (Assessment 2.0). The teacher proctors the actual paper/verbal test
 * and enters results here; fixed-answer math items are graded the same as
 * anything else — the teacher supplies `correct` for every item, since even
 * the "fixed" items are read off a physical answer sheet, not typed live.
 *
 * Writes: a placementTests/{id} audit record, one masteryRecords update per
 * item (seeding the first data point per objective), and a per-subject
 * baseline summary into users/{userId}.assessmentBaseline.
 */
export const submitPlacementTest = onCall<SubmitPlacementTestRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { userId, kidKey, date, results } = request.data ?? {};
  if (!userId || typeof userId !== "string") {
    throw new HttpsError("invalid-argument", "userId is required.");
  }
  if (kidKey !== "millaray" && kidKey !== "makaio") {
    throw new HttpsError(
      "invalid-argument",
      'kidKey must be "millaray" or "makaio" — Maizley uses submitPrintableCheckIn instead.'
    );
  }
  if (!Array.isArray(results) || results.length === 0) {
    throw new HttpsError("invalid-argument", "results is required.");
  }

  const familyId = caller.profile.familyId;
  const target = await loadTarget(familyId, userId);
  assertKidKeyMatchesTarget(target, kidKey);

  const catalog = PLACEMENT_TEST_ITEMS[kidKey];
  const catalogById = new Map(catalog.map((i) => [i.id, i]));

  const validatedResults: PlacementItemResult[] = [];
  const subjectTotals = new Map<Subject, { correct: number; total: number }>();

  for (const result of results) {
    const catalogItem = catalogById.get(result?.itemId);
    if (!catalogItem) {
      throw new HttpsError("invalid-argument", `Unknown item id "${result?.itemId}" for ${kidKey}.`);
    }
    const correct = result.correct === true;
    validatedResults.push({
      itemId: catalogItem.id,
      correct,
      answerText: typeof result.answerText === "string" ? result.answerText : undefined,
      notes: typeof result.notes === "string" ? result.notes : undefined,
    });

    const totals = subjectTotals.get(catalogItem.subject) ?? { correct: 0, total: 0 };
    totals.total += 1;
    if (correct) totals.correct += 1;
    subjectTotals.set(catalogItem.subject, totals);
  }

  await Promise.all(
    validatedResults.map((result) => {
      const catalogItem = catalogById.get(result.itemId)!;
      return recordMasteryResult({
        familyId,
        userId,
        objectiveId: catalogItem.id,
        subject: catalogItem.subject,
        skill: catalogItem.skill,
        correct: result.correct === true,
      });
    })
  );

  const subjectBaselines: Partial<Record<Subject, string>> = {};
  const db = getFirestore();
  const updatePayload: Record<string, string> = {};
  for (const [subject, totals] of subjectTotals.entries()) {
    const pct = Math.round((totals.correct / totals.total) * 100);
    const summary = `${totals.correct}/${totals.total} correct (${pct}%) — placement test`;
    subjectBaselines[subject] = summary;
    updatePayload[`assessmentBaseline.${subject}`] = summary;
  }
  if (Object.keys(updatePayload).length > 0) {
    await db.collection("users").doc(userId).update(updatePayload);
  }

  const record: PlacementTestRecord = {
    familyId,
    userId,
    kidKey: kidKey as PlacementKidKey,
    date: parseDate(date),
    scored: true,
    results: validatedResults,
    subjectBaselines,
  };
  const ref = await db.collection("placementTests").add(record);

  return { placementTestId: ref.id, subjectBaselines };
});

interface SubmitPrintableCheckInRequest {
  userId: string;
  date?: string;
  results: PlacementItemResult[];
}

/**
 * Maizley's non-scored printable check-in (see
 * curriculum/maizley_track_clarification.md). Just a logged snapshot for
 * the record — no assessmentBaseline or masteryRecords writes, since there's
 * no scoring loop feeding anything off of it yet.
 */
export const submitPrintableCheckIn = onCall<SubmitPrintableCheckInRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { userId, date, results } = request.data ?? {};
  if (!userId || typeof userId !== "string") {
    throw new HttpsError("invalid-argument", "userId is required.");
  }
  if (!Array.isArray(results) || results.length === 0) {
    throw new HttpsError("invalid-argument", "results is required.");
  }

  const familyId = caller.profile.familyId;
  await loadTarget(familyId, userId);

  const catalog = PLACEMENT_TEST_ITEMS.maizley;
  const catalogById = new Map(catalog.map((i) => [i.id, i]));

  const validatedResults: PlacementItemResult[] = results.map((result) => {
    const catalogItem = catalogById.get(result?.itemId);
    if (!catalogItem) {
      throw new HttpsError("invalid-argument", `Unknown item id "${result?.itemId}" for maizley.`);
    }
    return {
      itemId: catalogItem.id,
      correct: typeof result.correct === "boolean" ? result.correct : null,
      level: typeof result.level === "string" ? result.level : undefined,
      notes: typeof result.notes === "string" ? result.notes : undefined,
    };
  });

  const db = getFirestore();
  const record: PlacementTestRecord = {
    familyId,
    userId,
    kidKey: "maizley",
    date: parseDate(date),
    scored: false,
    results: validatedResults,
    subjectBaselines: {},
  };
  const ref = await db.collection("placementTests").add(record);

  return { placementTestId: ref.id };
});

interface SubmitPlacementResponsesRequest {
  userId: string;
  kidKey: "millaray" | "makaio";
  results: { itemId: string; answerText: string }[];
}

/**
 * A kid takes their own placement test, typing an answer to every item.
 * Fixed/numeric items (math) are graded immediately against the known
 * correct answer. Open items (reading fluency, reasoning, writing quality)
 * can't be meaningfully self-graded, so they're captured as typed and left
 * unscored (`correct: null`) for a teacher to review afterward — see
 * PlacementSubmission. Self-service: the caller must be the kid themselves
 * (or a teacher submitting on their behalf), never another student.
 * Maizley's track stays teacher/parent-administered — not self-service.
 */
export const submitPlacementResponses = onCall<SubmitPlacementResponsesRequest>(async (request) => {
  const caller = await requireCaller(request);

  const { userId, kidKey, results } = request.data ?? {};
  if (!userId || typeof userId !== "string") {
    throw new HttpsError("invalid-argument", "userId is required.");
  }
  requireOwnerOrTeacher(caller, userId);
  if (kidKey !== "millaray" && kidKey !== "makaio") {
    throw new HttpsError("invalid-argument", 'kidKey must be "millaray" or "makaio".');
  }
  if (!Array.isArray(results) || results.length === 0) {
    throw new HttpsError("invalid-argument", "results is required.");
  }

  const familyId = caller.profile.familyId;
  const target = await loadTarget(familyId, userId);
  assertKidKeyMatchesTarget(target, kidKey);

  const catalog = PLACEMENT_TEST_ITEMS[kidKey];
  const catalogById = new Map(catalog.map((i) => [i.id, i]));

  const validatedResults: PlacementSubmissionItemResult[] = results.map((result) => {
    const catalogItem = catalogById.get(result?.itemId);
    if (!catalogItem) {
      throw new HttpsError("invalid-argument", `Unknown item id "${result?.itemId}" for ${kidKey}.`);
    }
    const answerText = typeof result.answerText === "string" ? result.answerText.trim() : "";
    const correct =
      catalogItem.kind === "fixed" && catalogItem.correctAnswer
        ? normalizeAnswer(answerText) === normalizeAnswer(catalogItem.correctAnswer)
        : null;
    return { itemId: catalogItem.id, answerText, correct };
  });

  const db = getFirestore();
  const submission: PlacementSubmission = {
    familyId,
    userId,
    kidKey: kidKey as "millaray" | "makaio",
    submittedAt: Timestamp.now(),
    results: validatedResults,
  };
  const ref = await db.collection("placementSubmissions").add(submission);

  return { submissionId: ref.id };
});

/**
 * Loose match for fixed-answer items so formatting differences ("$8" vs
 * "8", "3/8 pie left" vs "3/8") don't get marked wrong — strips currency
 * symbols and common trailing unit words, lowercases, collapses
 * whitespace. A genuinely wrong numeric answer still won't match; the
 * teacher review screen shows the kid's raw answer either way, so an
 * imperfect auto-grade is always easy to catch and override.
 */
function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[$,]/g, "")
    .replace(/\b(pie|left|lb|lbs|oz|dollars?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
