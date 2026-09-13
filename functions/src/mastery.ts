import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { MasteryRecord, Subject } from "./types";

/**
 * Per-objective mastery threshold, per
 * curriculum/learn_practice_test_alignment_standard_v2.md: track the last
 * 3 check results; 2 of 3 correct = mastered. Fewer than 3 recorded results
 * is never "mastered" yet — a placement test only seeds a baseline data
 * point, it doesn't declare mastery off one answer.
 */
const MASTERY_WINDOW = 3;
const MASTERY_THRESHOLD = 2;

/** Pure: folds one new result into an objective's running record. */
export function applyMasteryResult(
  recentResults: readonly boolean[],
  correct: boolean
): { recentResults: boolean[]; mastered: boolean } {
  const updated = [...recentResults, correct].slice(-MASTERY_WINDOW);
  const mastered =
    updated.length >= MASTERY_WINDOW &&
    updated.filter(Boolean).length >= MASTERY_THRESHOLD;
  return { recentResults: updated, mastered };
}

function masteryDocId(userId: string, objectiveId: string): string {
  return `${userId}_${objectiveId}`;
}

/**
 * Records one check result against an objective, creating the
 * masteryRecords/{userId}_{objectiveId} doc if it doesn't exist yet.
 * Used both by placement-test intake (seeds the first data point) and,
 * eventually, by the daily continuous-reassessment check-in loop.
 */
export async function recordMasteryResult(params: {
  familyId: string;
  userId: string;
  objectiveId: string;
  subject: Subject;
  skill: string;
  correct: boolean;
}): Promise<MasteryRecord> {
  const db = getFirestore();
  const ref = db.collection("masteryRecords").doc(masteryDocId(params.userId, params.objectiveId));
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() as MasteryRecord) : null;

  const { recentResults, mastered } = applyMasteryResult(
    existing?.recentResults ?? [],
    params.correct
  );
  const now = Timestamp.now();
  const record: MasteryRecord = {
    familyId: params.familyId,
    userId: params.userId,
    objectiveId: params.objectiveId,
    subject: params.subject,
    skill: params.skill,
    recentResults,
    mastered,
    masteredAt: mastered ? (existing?.masteredAt ?? now) : null,
    updatedAt: now,
  };
  await ref.set(record);
  return record;
}

/** All mastery records for one student, for feeding the day-plan generator. */
export async function getMasteryRecordsForUser(userId: string): Promise<MasteryRecord[]> {
  const db = getFirestore();
  const snap = await db.collection("masteryRecords").where("userId", "==", userId).get();
  return snap.docs.map((d) => d.data() as MasteryRecord);
}
