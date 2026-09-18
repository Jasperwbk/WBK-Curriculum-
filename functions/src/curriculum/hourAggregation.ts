import type { Location } from "../types";

/**
 * Pure extraction of dashboard.ts#getActualHoursToDate's row-inclusion
 * decision (build-order step 6.1) — behavior-preserving, not a new
 * dedup algorithm. Kept separate so the "one deterministic official-hour
 * calculation" the spec asks for is directly unit-testable without a
 * Firestore emulator.
 *
 * DELIBERATELY does not gate on LogEntry.provenance in any way — a
 * legacy/unclassified log, a "manual" log, an "extracurricular" log, and
 * a "governedEvidence" log all count identically here. This is a
 * conscious decision, not an oversight: automatically excluding a
 * manual log because it shares a date+subject with a governed evidence
 * packet would require exactly the "same date + same subject means
 * duplicate" assumption the spec explicitly forbids (a homeschool day
 * can legitimately have more than one math activity). Where a governed
 * packet's own hours must never be posted twice, that's already handled
 * upstream, deterministically, by evidenceHours.ts#hourLogDocId — by the
 * time a row reaches this function, it's exactly one already-decided
 * instructional-minutes fact, governed or not. Real prevention of
 * accidental double-LOGGING happens earlier, at write time (see
 * LogActivityPage.tsx's governed-day warning), not here.
 */
export interface HourCountableLog {
  familyId: string;
  location: Location;
  durationMinutes: number;
}

export interface SumInstructionalMinutesOptions {
  locations?: readonly Location[];
}

export function sumInstructionalMinutes(
  logs: readonly HourCountableLog[],
  familyId: string,
  opts: SumInstructionalMinutesOptions = {}
): number {
  let total = 0;
  for (const log of logs) {
    if (log.familyId !== familyId) continue; // defense in depth — matches the pre-existing check
    if (opts.locations && !opts.locations.includes(log.location)) continue;
    total += log.durationMinutes ?? 0;
  }
  return total;
}
