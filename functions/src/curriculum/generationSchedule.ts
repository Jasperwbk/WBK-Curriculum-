import type { Family } from "../types";

/**
 * Two-day-ahead generation's lead-time calculation (build-order step 4,
 * part A of the deterministic/callable/scheduled-invocation split — see
 * proposedDays.ts). "Two days ahead" is the normal planning TARGET, not a
 * hardcoded architecture constant — configurable per family
 * (Family.dayGenerationLeadDays), defaulting to 2.
 */

export const DEFAULT_GENERATION_LEAD_DAYS = 2;

export function getGenerationLeadDays(family: Family): number {
  const configured = family.dayGenerationLeadDays;
  return typeof configured === "number" && configured > 0 ? configured : DEFAULT_GENERATION_LEAD_DAYS;
}

/**
 * The school date generation should currently target: `today + leadDays`
 * calendar days, as an ISO "YYYY-MM-DD" string. Deliberately calendar
 * days, not school days — "approximately two days ahead" is the spec's
 * own phrasing, and weekend-skipping logic isn't asked for; a target date
 * that lands on a weekend just means there's nothing to generate for
 * it once the actual generation step checks the school calendar.
 */
export function computeGenerationTargetDate(today: Date, leadDays: number): string {
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  target.setDate(target.getDate() + leadDays);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
