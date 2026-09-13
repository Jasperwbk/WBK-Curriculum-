import type { PlacementKidKey, Subject } from "../types";

/**
 * Locked daily color-sheet assignment model — see
 * curriculum/10_daily_color_sheet_model.md. Each school day, each kid gets
 * exactly one featured subject (and a color sheet matching it); the three
 * kids never share a subject the same day. Deterministic so Claude never
 * has to "randomly" pick and risk a collision.
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

/**
 * School-day index within the quarter: 0 on the school year's start date
 * (assumed a school day), incrementing once per weekday thereafter.
 * Weekends never count, matching "Week 1 Monday = 0, then +1 each
 * instructional day" from the color-sheet model.
 */
export function getSchoolDayIndex(schoolYearStart: Date, date: Date): number {
  const start = stripTime(schoolYearStart);
  const target = stripTime(date);
  if (target < start) return 0;

  let count = -1;
  const cursor = new Date(start);
  while (cursor <= target) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(count, 0);
}

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

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
