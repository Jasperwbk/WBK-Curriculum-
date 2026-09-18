import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { MasteryRecord, Subject } from "./types";

/**
 * Per-objective mastery threshold, per
 * curriculum/learn_practice_test_alignment_standard_v2.md: track the last
 * 3 check results; 2 of 3 correct = mastered. Fewer than 3 recorded results
 * is never "mastered" yet — a placement test only seeds a baseline data
 * point, it doesn't declare mastery off one answer.
 *
 * "Aced" is a stricter, separate signal on top of mastery: all 3 of the
 * last checks correct, not just 2. Mastery alone just means "stop
 * re-teaching this, it's solid" — aced means "this wasn't even a
 * struggle," which is the trigger to probe harder rather than just move on
 * to whatever's next at the same difficulty (ROADMAP.md §4, "detect
 * too easy and probe upward").
 */
const MASTERY_WINDOW = 3;
const MASTERY_THRESHOLD = 2;

/** Pure: folds one new result into an objective's running record. */
export function applyMasteryResult(
  recentResults: readonly boolean[],
  correct: boolean
): { recentResults: boolean[]; mastered: boolean; aced: boolean } {
  const updated = [...recentResults, correct].slice(-MASTERY_WINDOW);
  const mastered =
    updated.length >= MASTERY_WINDOW &&
    updated.filter(Boolean).length >= MASTERY_THRESHOLD;
  const aced = updated.length >= MASTERY_WINDOW && updated.every(Boolean);
  return { recentResults: updated, mastered, aced };
}

/** Exported so callers needing the deterministic doc id directly (e.g. a
 * transactional mastery-application path) don't have to duplicate this. */
export function masteryRecordDocId(userId: string, objectiveId: string): string {
  return `${userId}_${objectiveId}`;
}

export interface RecordMasteryResultParams {
  familyId: string;
  userId: string;
  objectiveId: string;
  subject: Subject;
  skill: string;
  correct: boolean;
}

/**
 * Pure: folds one new result into a full MasteryRecord, given whatever
 * record (if any) already exists. Extracted from recordMasteryResult so a
 * transactional caller can build the next record from a value it read
 * inside its own transaction, rather than this function doing its own
 * independent (non-transactional) read.
 */
export function buildNextMasteryRecord(
  existing: MasteryRecord | null,
  params: RecordMasteryResultParams,
  now: Timestamp
): MasteryRecord {
  const { recentResults, mastered, aced } = applyMasteryResult(
    existing?.recentResults ?? [],
    params.correct
  );
  return {
    familyId: params.familyId,
    userId: params.userId,
    objectiveId: params.objectiveId,
    subject: params.subject,
    skill: params.skill,
    recentResults,
    mastered,
    masteredAt: mastered ? (existing?.masteredAt ?? now) : null,
    aced,
    acedAt: aced ? (existing?.acedAt ?? now) : null,
    updatedAt: now,
  };
}

/**
 * Records one check result against an objective, creating the
 * masteryRecords/{userId}_{objectiveId} doc if it doesn't exist yet.
 * Used both by placement-test intake (seeds the first data point) and,
 * eventually, by the daily continuous-reassessment check-in loop.
 */
export async function recordMasteryResult(params: RecordMasteryResultParams): Promise<MasteryRecord> {
  const db = getFirestore();
  const ref = db.collection("masteryRecords").doc(masteryRecordDocId(params.userId, params.objectiveId));
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() as MasteryRecord) : null;
  const record = buildNextMasteryRecord(existing, params, Timestamp.now());
  await ref.set(record);
  return record;
}

/** All mastery records for one student, for feeding the day-plan generator. */
export async function getMasteryRecordsForUser(userId: string): Promise<MasteryRecord[]> {
  const db = getFirestore();
  const snap = await db.collection("masteryRecords").where("userId", "==", userId).get();
  return snap.docs.map((d) => d.data() as MasteryRecord);
}
