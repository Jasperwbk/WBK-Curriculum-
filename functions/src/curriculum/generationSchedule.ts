import type { Family } from "../types";

/**
 * Two-day-ahead generation's lead-time CONFIGURATION (build-order step 4,
 * revised 4.1 — see proposedDays.ts's top comment for the A/B/C split).
 * "Two days ahead" is the normal planning TARGET, not a hardcoded
 * architecture constant — configurable per family
 * (Family.dayGenerationLeadDays), defaulting to 2.
 *
 * As of step 4.1 this counts INSTRUCTIONAL days, not calendar days — see
 * instructionalCalendar.ts for the actual target-date calculation. This
 * file only holds the lead-day count itself; step 4's original calendar-
 * day computeGenerationTargetDate (never had a real caller — the UI's own
 * date-picker default was a separate, unwired calculation) has been
 * superseded by instructionalCalendar.ts's instructional-day-aware
 * version rather than kept alongside it.
 */

export const DEFAULT_GENERATION_LEAD_DAYS = 2;

export function getGenerationLeadDays(family: Family): number {
  const configured = family.dayGenerationLeadDays;
  return typeof configured === "number" && configured > 0 ? configured : DEFAULT_GENERATION_LEAD_DAYS;
}
