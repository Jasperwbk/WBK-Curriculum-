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
 * `physical_education` is deliberately ABSENT from this table (build-order
 * step 7) — not an oversight. The 28 hrs/week figure below is Cory/Sarah's
 * own authored curriculum-planning number (q1_fall_curriculum_overview.md's
 * "Weekly hour budget"), explicitly designed to clear Missouri's ~27.8
 * hrs/week required pace with a small margin. Inspection for step 7 found
 * no PE/movement content already implicitly folded into any of these 8
 * subjects' real curriculum files — bushcraft's outdoor content is
 * survival/wayfinding skills, not exercise — so there is no existing time
 * to honestly reclassify, and there is no way to assign PE a real weekly-
 * hour figure without either (a) growing this authored weekly total, or
 * (b) shrinking one of the other 8 subjects' authored hours, both of which
 * are curriculum-content decisions, not coding decisions. Per the step 7
 * instruction, that decision is left to Cory/Sarah rather than invented
 * here — see the step 7 report. Until it's set, `computeSubjectWeights`
 * (subjectWeights.ts) correctly gives physical_education a weight of 0 via
 * its existing `totals[subject] ?? 0` fallback — no crash, no invented
 * number, just an honestly-zero pace target until a real one is decided.
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
