import type { DayDesignationType } from "../types";
import { getDayDesignationsForDate, type DayDesignationLookup } from "./dayDesignation";

/**
 * Deterministic school-calendar abstraction (build-order step 4.1):
 * "starting from this date, what is the Nth upcoming instructional day?"
 * Corrects step 4's original lead-time calculation, which used plain
 * calendar days — "two days ahead" now means two upcoming INSTRUCTIONAL-
 * day transitions, not +48 hours or +2 calendar days.
 *
 * Two layers, matching this codebase's established pattern:
 *   - isInstructionalDay / advanceInstructionalDays below are PURE — no
 *     I/O — and take an already-resolved designation answer (or a
 *     synchronous callback that supplies one), so the actual walking
 *     algorithm is fully unit-testable without a database.
 *   - computeInstructionalGenerationTargetDate is the async wrapper that
 *     does the real work: fetching DayDesignation records for each
 *     candidate date and feeding the same isInstructionalDay decision.
 */

/** Index 0 = Sunday .. 6 = Saturday. Monday-Friday instructional by default. */
export type WeekdayInstructionalDefaults = readonly boolean[];

export const DEFAULT_INSTRUCTIONAL_WEEKDAYS: WeekdayInstructionalDefaults = [
  false, // Sunday
  true, // Monday
  true, // Tuesday
  true, // Wednesday
  true, // Thursday
  true, // Friday
  false, // Saturday
];

/**
 * Pure decision for one date: an explicit DayDesignation always wins over
 * the weekday default — "nonInstructional" never counts (even on an
 * otherwise-instructional weekday), "alternativePackage" always counts
 * (even on an otherwise-non-instructional weekend) — falling back to the
 * weekday default only when there's no designation at all.
 * `weekdayDefaults` is accepted (rather than hardcoded) so a future
 * family-level custom calendar can be threaded through without changing
 * this function's logic or callers — no such family field exists yet,
 * this is just the seam for it.
 */
export function isInstructionalDay(
  dayOfWeek: number,
  designationType: DayDesignationType | null,
  weekdayDefaults: WeekdayInstructionalDefaults = DEFAULT_INSTRUCTIONAL_WEEKDAYS
): boolean {
  if (designationType === "nonInstructional") return false;
  if (designationType === "alternativePackage") return true;
  return weekdayDefaults[dayOfWeek];
}

const SAFETY_BOUND_CALENDAR_DAYS = 60;

/**
 * Pure walker: advances from `start` (exclusive) one calendar day at a
 * time, counting days where `designationTypeForDate(date)` combined with
 * the weekday default says "instructional," stopping at the `count`th
 * one. `designationTypeForDate` is a plain synchronous function here —
 * tests supply a fixed lookup table; computeInstructionalGenerationTargetDate
 * below supplies one backed by pre-fetched Firestore data for real use.
 * Bounded to SAFETY_BOUND_CALENDAR_DAYS calendar days so a pathological
 * config (e.g. every day marked non-instructional) fails loudly rather
 * than looping forever.
 */
export function advanceInstructionalDays(
  start: Date,
  count: number,
  designationTypeForDate: (date: Date) => DayDesignationType | null,
  weekdayDefaults: WeekdayInstructionalDefaults = DEFAULT_INSTRUCTIONAL_WEEKDAYS
): Date {
  if (count < 1) {
    throw new Error("advanceInstructionalDays: count must be at least 1.");
  }
  let found = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let safety = 0;
  while (found < count) {
    cursor.setDate(cursor.getDate() + 1);
    if (isInstructionalDay(cursor.getDay(), designationTypeForDate(cursor), weekdayDefaults)) {
      found++;
    }
    safety++;
    if (safety > SAFETY_BOUND_CALENDAR_DAYS) {
      throw new Error(
        `advanceInstructionalDays: exceeded ${SAFETY_BOUND_CALENDAR_DAYS} calendar days without finding ${count} instructional day(s) — check the designation data or weekday defaults.`
      );
    }
  }
  return cursor;
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * For this specific target-date estimate ONLY — not the actual per-kid
 * certification gate, which remains fully accurate per student — a
 * DayDesignation is treated as applying to the whole family regardless of
 * its exact kidKeys: any nonInstructional designation on a date makes
 * that date non-instructional for lead-time purposes, and (failing that)
 * any alternativePackage designation makes it count as instructional.
 * This is a deliberate simplification for estimating "the next
 * instructional day to target," documented here and in the step 4.1
 * report — the real generation gate in dayPlans.ts/proposedDays.ts always
 * evaluates each student's own designations exactly, independent of this.
 */
function familyWideDesignationType(designations: readonly DayDesignationLookup[]): DayDesignationType | null {
  if (designations.some((d) => d.record.type === "nonInstructional")) return "nonInstructional";
  if (designations.some((d) => d.record.type === "alternativePackage")) return "alternativePackage";
  return null;
}

/**
 * The real, I/O-backed target-date calculation: walks forward from
 * `startDate`, fetching this family's DayDesignations for each candidate
 * date, until `leadInstructionalDays` instructional days have been found.
 * Sequential (one Firestore query per candidate day) rather than
 * batched — the lead count is small (2 by default) and the safety bound
 * caps total candidates at 60, so this stays cheap.
 */
export async function computeInstructionalGenerationTargetDate(
  familyId: string,
  startDate: Date,
  leadInstructionalDays: number
): Promise<string> {
  if (leadInstructionalDays < 1) {
    throw new Error("computeInstructionalGenerationTargetDate: leadInstructionalDays must be at least 1.");
  }
  let found = 0;
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  let safety = 0;
  while (found < leadInstructionalDays) {
    cursor.setDate(cursor.getDate() + 1);
    const dateStr = formatIsoDate(cursor);
    const designations = await getDayDesignationsForDate(familyId, dateStr);
    const designationType = familyWideDesignationType(designations);
    if (isInstructionalDay(cursor.getDay(), designationType)) {
      found++;
    }
    safety++;
    if (safety > SAFETY_BOUND_CALENDAR_DAYS) {
      throw new Error(
        `computeInstructionalGenerationTargetDate: exceeded ${SAFETY_BOUND_CALENDAR_DAYS} calendar days without finding ${leadInstructionalDays} instructional day(s).`
      );
    }
  }
  return formatIsoDate(cursor);
}
