import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { requireCaller, requireTeacher } from "./util/auth";
import { recordMasteryResult } from "./mastery";
import { PLACEMENT_TEST_ITEMS } from "./curriculum/placementTestItems";
import type {
  PlacementItemResult,
  PlacementKidKey,
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
  await loadTarget(familyId, userId);

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
