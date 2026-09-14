import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireCaller, requireTeacher } from "./util/auth";
import { recordMasteryResult } from "./mastery";
import { WEEK1_OBJECTIVES } from "./curriculum/weeklyObjectives";
import type { CheckInItemResult, UserProfile } from "./types";

interface SubmitCheckInRequest {
  userId: string;
  kidKey: "millaray" | "makaio";
  results: CheckInItemResult[];
}

/**
 * Records ongoing weekly check-in results (the continuous-reassessment
 * loop from learn_practice_test_alignment_standard_v2.md) against
 * masteryRecords — the same mechanism the placement test seeds, kept
 * updated week to week instead of frozen at its initial baseline.
 * generatePlan already reads masteryRecords, so this is what actually
 * keeps its mastered/still-building context current over time.
 */
export const submitCheckIn = onCall<SubmitCheckInRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { userId, kidKey, results } = request.data ?? {};
  if (!userId || typeof userId !== "string") {
    throw new HttpsError("invalid-argument", "userId is required.");
  }
  if (kidKey !== "millaray" && kidKey !== "makaio") {
    throw new HttpsError("invalid-argument", 'kidKey must be "millaray" or "makaio".');
  }
  if (!Array.isArray(results) || results.length === 0) {
    throw new HttpsError("invalid-argument", "results is required.");
  }

  const familyId = caller.profile.familyId;
  const db = getFirestore();
  const targetSnap = await db.collection("users").doc(userId).get();
  if (!targetSnap.exists || (targetSnap.data() as UserProfile).familyId !== familyId) {
    throw new HttpsError("invalid-argument", "userId does not belong to this family.");
  }

  const catalog = WEEK1_OBJECTIVES[kidKey];
  const catalogById = new Map(catalog.map((o) => [o.id, o]));

  const updated = await Promise.all(
    results.map(async (result) => {
      const objective = catalogById.get(result?.objectiveId);
      if (!objective) {
        throw new HttpsError(
          "invalid-argument",
          `Unknown objective id "${result?.objectiveId}" for ${kidKey}.`
        );
      }
      const record = await recordMasteryResult({
        familyId,
        userId,
        objectiveId: objective.id,
        subject: objective.subject,
        skill: objective.skill,
        correct: result.correct === true,
      });
      return { objectiveId: objective.id, mastered: record.mastered, aced: record.aced };
    })
  );

  return { updated };
});
