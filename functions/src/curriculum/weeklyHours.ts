import type { Subject } from "../types";

export interface WeeklySubjectHours {
  week: number;
  hours: Partial<Record<Subject, number>>;
}

/**
 * Per-subject weekly instructional hours, transcribed directly from the
 * "Hrs" column of the Q1 (Fall) curriculum week tables — see
 * curriculum/q1_fall/millaray_age10_q1_fall.md and
 * curriculum/q1_fall/makaio_age8_q1_fall.md. Millaray's and Makaio's
 * weekly budgets are identical (per q1_fall_curriculum_overview.md's
 * "Weekly hour budget" section); where a subject has two strands in one
 * week (e.g. Millaray's social_studies_history splits into a local-history
 * track and a government/economics track from Week 5 on), the hours are
 * combined into that subject's single weekly total, matching the source
 * tables.
 *
 * Maizley's Q1 file has no "Hrs" column and no hour targets (she's below
 * Missouri's compulsory attendance age), so she isn't represented here —
 * per-subject dashboard weighting only applies to school-age kids.
 *
 * Add each new quarter's weekly hours here as that curriculum is written;
 * computeSubjectWeights() sums across whatever weeks are present.
 */
export const Q1_FALL_WEEKLY_HOURS: readonly WeeklySubjectHours[] = [
  { week: 1, hours: weekHours() },
  { week: 2, hours: weekHours() },
  { week: 3, hours: weekHours() },
  { week: 4, hours: weekHours() },
  { week: 5, hours: weekHours() },
  { week: 6, hours: weekHours() },
  { week: 7, hours: weekHours() },
  { week: 8, hours: weekHours() },
  { week: 9, hours: weekHours() },
];

/**
 * `physical_education` is PERMANENTLY, DELIBERATELY absent from this
 * table — LOCKED PROGRAM POLICY (Cory's decision, finalizing build-order
 * step 7), not a placeholder awaiting a future number. PE is required as
 * part of the normal school day (see proposedDays.ts/blockValidation.ts)
 * but explicitly non-hour-bearing for Missouri instructional/compliance
 * purposes — regular movement, fitness, coordination, and play, not
 * another subject competing for hour-bank credit.
 *
 * The canonical instructional requirement stays exactly 28 hrs/week
 * across these 8 subjects, unchanged — PE is never added on top of it and
 * never carves hours out of any of the 8 below. `computeSubjectWeights`
 * (subjectWeights.ts) gives physical_education a pace-gauge weight of 0
 * via its existing `totals[subject] ?? 0` fallback, which is exactly
 * correct here: not a crash, not a guess, the intended permanent value.
 * The actual enforcement that PE minutes never become official
 * instructional hours lives in evidenceHours.ts's
 * NON_HOUR_BEARING_SUBJECTS — this file's silence on PE is necessary but
 * not sufficient on its own, which is why that separate, explicit gate
 * exists rather than relying on a zero weight alone.
 */
function weekHours(): Partial<Record<Subject, number>> {
  return {
    reading_language_arts: 5,
    math: 4,
    science: 4,
    social_studies_history: 4,
    bushcraft_outdoor_skills: 3,
    homestead_skills: 3,
    nature_identification: 3,
    spiritual_cultural: 2,
  };
}
