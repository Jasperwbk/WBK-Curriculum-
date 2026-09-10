import { CORE_SUBJECTS, SPECIALTY_SUBJECTS, type Subject } from "../types";
import { Q1_FALL_WEEKLY_HOURS, type WeeklySubjectHours } from "./weeklyHours";

/**
 * Derives, for each subject, its share (0-1) of its own bucket's
 * (core or specialty) total curriculum hours — summed across every
 * recorded week rather than split evenly. Reading/language arts runs
 * 5 hrs/week against 4 for the other three core subjects in the actual
 * curriculum, so it comes out with a larger share than math/science/
 * social studies; the specialty subjects split similarly unevenly
 * (spiritual/cultural runs lighter than the other three).
 *
 * Falls back to an even split within a bucket only if that bucket has no
 * recorded hours at all (e.g. a newly-added subject with no curriculum
 * data yet) — real curriculum data always wins when it exists.
 */
export function computeSubjectWeights(
  weeks: readonly WeeklySubjectHours[] = Q1_FALL_WEEKLY_HOURS
): Record<Subject, number> {
  const totals = sumHoursBySubject(weeks);
  const coreBucketTotal = sumBucket(CORE_SUBJECTS, totals);
  const specialtyBucketTotal = sumBucket(SPECIALTY_SUBJECTS, totals);

  const weights = {} as Record<Subject, number>;
  for (const subject of CORE_SUBJECTS) {
    weights[subject] =
      coreBucketTotal > 0
        ? (totals[subject] ?? 0) / coreBucketTotal
        : 1 / CORE_SUBJECTS.length;
  }
  for (const subject of SPECIALTY_SUBJECTS) {
    weights[subject] =
      specialtyBucketTotal > 0
        ? (totals[subject] ?? 0) / specialtyBucketTotal
        : 1 / SPECIALTY_SUBJECTS.length;
  }
  return weights;
}

function sumHoursBySubject(
  weeks: readonly WeeklySubjectHours[]
): Partial<Record<Subject, number>> {
  const totals: Partial<Record<Subject, number>> = {};
  for (const week of weeks) {
    for (const [subject, hrs] of Object.entries(week.hours) as [Subject, number][]) {
      totals[subject] = (totals[subject] ?? 0) + hrs;
    }
  }
  return totals;
}

function sumBucket(
  subjects: readonly Subject[],
  totals: Partial<Record<Subject, number>>
): number {
  return subjects.reduce((sum, subject) => sum + (totals[subject] ?? 0), 0);
}
