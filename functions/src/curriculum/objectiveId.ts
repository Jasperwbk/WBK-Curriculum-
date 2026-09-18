import type { PlacementKidKey, Subject } from "../types";

/**
 * Objective-ID strategy (build-order step 5, requirement 2): a stable
 * identifier that is NEVER derived from display text (a wording edit must
 * never change an objective's identity — masteryRecords/{userId}_
 * {objectiveId} keys off this exact string). Composed purely from
 * structural facts — which kid, which week, which subject, which ordinal
 * — never from the skill's own description.
 *
 * This is the SAME formula curriculum/weeklyObjectives.ts's hand-authored
 * WEEK1_OBJECTIVES catalog already uses (e.g. "millaray-w1-math-1") — so
 * "where existing curriculum already provides usable objective IDs,
 * preserve them" falls out of using one shared formula rather than a
 * separate lookup table: an id computed here for (millaray, week 1, math,
 * ordinal 1) IS "millaray-w1-math-1", byte for byte.
 */

const SUBJECT_ABBREVIATIONS: Record<Subject, string> = {
  reading_language_arts: "rla",
  math: "math",
  science: "science",
  social_studies_history: "ss",
  bushcraft_outdoor_skills: "bushcraft",
  homestead_skills: "homestead",
  nature_identification: "nature",
  spiritual_cultural: "spiritual",
  physical_education: "pe",
};

const ABBREVIATION_TO_SUBJECT: Record<string, Subject> = Object.fromEntries(
  Object.entries(SUBJECT_ABBREVIATIONS).map(([subject, abbr]) => [abbr, subject as Subject])
);

export function subjectAbbreviation(subject: Subject): string {
  return SUBJECT_ABBREVIATIONS[subject];
}

export function buildObjectiveId(kidKey: PlacementKidKey, week: number, subject: Subject, ordinal: number): string {
  return `${kidKey}-w${week}-${SUBJECT_ABBREVIATIONS[subject]}-${ordinal}`;
}

const OBJECTIVE_ID_PATTERN = /^(millaray|makaio|maizley)-w(\d+)-([a-z]+)-(\d+)$/;

/** Structural shape check only — does not confirm the id was ever actually allocated, just that it COULD have been (matches the deterministic formula). */
export function isValidObjectiveId(value: string): boolean {
  const match = OBJECTIVE_ID_PATTERN.exec(value);
  if (!match) return false;
  return match[3] in ABBREVIATION_TO_SUBJECT;
}

/**
 * ISO weekday (1=Mon .. 7=Sun) of an ISO "YYYY-MM-DD" date string — the
 * deterministic, content-independent base used for allocating fresh
 * objective ordinals at generation time (see proposedDays.ts /
 * blockValidation.ts). Using the calendar date rather than a per-call
 * counter means: (a) two different days within the same week can never
 * collide (different weekday numbers), and (b) regenerating the SAME date
 * recomputes the SAME base every time, so ids are stable across
 * regeneration without needing any persisted counter or new Firestore
 * collection. Known limitation: it does NOT deduplicate the same
 * conceptual objective being introduced as "new" on two DIFFERENT dates
 * within an uncatalogued week — see curriculum/blockValidation.ts's doc
 * comment, and the Step 5 report's "conflicts/decisions discovered".
 */
export function weekdayOrdinalBase(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const jsDay = d.getUTCDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay;
}
