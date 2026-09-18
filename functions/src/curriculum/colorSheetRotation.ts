import type { PlacementKidKey, Subject } from "../types";
import { getSchoolDayIndex } from "./schoolCalendar";

/**
 * RETIRED — no longer called from generatePlan or any other runtime path
 * (as of the 2026-09-18 curriculum specification). The subject-matched
 * color-sheet rotation described here and in
 * curriculum/10_daily_color_sheet_model.md is explicitly superseded by
 * Historical Figure Coloring (see curriculum/gap_analysis_2026-09-18.md
 * §1 and functions/src/curriculum/historicalFigureSelector.ts). This file
 * is kept, unused, so the exact prior behavior stays in git history and
 * available for rollback — do not re-wire it into generatePlan without an
 * explicit decision to reverse the supersession.
 */
const RING: readonly Subject[] = [
  "math",
  "science",
  "nature_identification",
  "reading_language_arts",
  "homestead_skills",
  "social_studies_history",
  "bushcraft_outdoor_skills",
  "spiritual_cultural",
];

// Offsets 0 / 3 / 5 on a ring of 8 never collide.
const OFFSETS: Record<PlacementKidKey, number> = {
  millaray: 0,
  makaio: 3,
  maizley: 5,
};

// If Maizley's ring pick is a poor toddler fit as a *drawing*, nudge her to
// the nearest toddler-safe subject the other two don't already have that day.
const MAIZLEY_UNSAFE_SUBJECTS: ReadonlySet<Subject> = new Set([
  "bushcraft_outdoor_skills",
  "social_studies_history",
  "spiritual_cultural",
]);
const MAIZLEY_SAFE_FALLBACKS: readonly Subject[] = [
  "nature_identification",
  "math",
  "science",
  "homestead_skills",
  "reading_language_arts",
];

export type DailySubjectAssignments = Record<PlacementKidKey, Subject>;

/** Each kid's featured subject (and therefore color-sheet subject) for one school day. */
export function getDailySubjectAssignments(
  schoolYearStart: Date,
  date: Date
): DailySubjectAssignments {
  const d = getSchoolDayIndex(schoolYearStart, date);

  const millaray = RING[(d + OFFSETS.millaray) % RING.length];
  const makaio = RING[(d + OFFSETS.makaio) % RING.length];
  let maizley = RING[(d + OFFSETS.maizley) % RING.length];

  if (MAIZLEY_UNSAFE_SUBJECTS.has(maizley)) {
    const takenByOthers = new Set<Subject>([millaray, makaio]);
    const fallback = MAIZLEY_SAFE_FALLBACKS.find((s) => !takenByOthers.has(s));
    if (fallback) maizley = fallback;
  }

  return { millaray, makaio, maizley };
}
