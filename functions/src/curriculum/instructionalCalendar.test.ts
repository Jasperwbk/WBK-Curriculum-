import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INSTRUCTIONAL_WEEKDAYS,
  advanceInstructionalDays,
  formatIsoDate,
  isInstructionalDay,
} from "./instructionalCalendar";
import type { DayDesignationType } from "../types";

// --- isInstructionalDay (pure decision) ---

test("isInstructionalDay: Monday-Friday are instructional by default, Saturday/Sunday are not", () => {
  assert.equal(isInstructionalDay(0, null), false); // Sunday
  assert.equal(isInstructionalDay(1, null), true); // Monday
  assert.equal(isInstructionalDay(2, null), true); // Tuesday
  assert.equal(isInstructionalDay(3, null), true); // Wednesday
  assert.equal(isInstructionalDay(4, null), true); // Thursday
  assert.equal(isInstructionalDay(5, null), true); // Friday
  assert.equal(isInstructionalDay(6, null), false); // Saturday
});

test("isInstructionalDay: an explicit nonInstructional designation overrides an otherwise-instructional weekday", () => {
  assert.equal(isInstructionalDay(1, "nonInstructional"), false); // Monday, marked off
});

test("isInstructionalDay: an explicit alternativePackage designation counts as instructional even on a weekend", () => {
  assert.equal(isInstructionalDay(6, "alternativePackage"), true); // Saturday field trip still counts
});

test("isInstructionalDay: accepts a custom weekdayDefaults override (forward-compat seam for future family calendars)", () => {
  const allSevenDaysInstructional = [true, true, true, true, true, true, true] as const;
  assert.equal(isInstructionalDay(0, null, allSevenDaysInstructional), true); // Sunday, under the custom calendar
});

// --- advanceInstructionalDays (pure walker) ---

function noDesignations(): DayDesignationType | null {
  return null;
}

test("Thursday + 2 instructional days = the following Monday (default Mon-Fri calendar)", () => {
  const thursday = new Date(2026, 0, 15); // Jan 15, 2026 is a Thursday
  assert.equal(thursday.getDay(), 4);
  const result = advanceInstructionalDays(thursday, 2, noDesignations);
  assert.equal(formatIsoDate(result), "2026-01-19"); // the following Monday
  assert.equal(result.getDay(), 1);
});

test("Friday + 2 instructional days = the following Tuesday (default Mon-Fri calendar)", () => {
  const friday = new Date(2026, 0, 16); // Jan 16, 2026 is a Friday
  assert.equal(friday.getDay(), 5);
  const result = advanceInstructionalDays(friday, 2, noDesignations);
  assert.equal(formatIsoDate(result), "2026-01-20"); // the following Tuesday
  assert.equal(result.getDay(), 2);
});

test("weekends never consume a lead slot", () => {
  const saturday = new Date(2026, 0, 17); // Saturday
  assert.equal(saturday.getDay(), 6);
  // 1 instructional day from Saturday should be Monday (Sunday doesn't count).
  const result = advanceInstructionalDays(saturday, 1, noDesignations);
  assert.equal(formatIsoDate(result), "2026-01-19");
});

test("an explicit non-instructional weekday is skipped, pushing the target out by one more day", () => {
  const thursday = new Date(2026, 0, 15); // Thursday
  const mondayIso = "2026-01-19";
  const designationTypeForDate = (date: Date): DayDesignationType | null =>
    formatIsoDate(date) === mondayIso ? "nonInstructional" : null;
  const result = advanceInstructionalDays(thursday, 2, designationTypeForDate);
  // Without the override this would be Monday (see test above) — with
  // Monday knocked out, the 2nd instructional day becomes Tuesday.
  assert.equal(formatIsoDate(result), "2026-01-20");
});

test("an alternative-package instructional day still counts toward the lead (matches the otherwise-instructional default here, confirming the override path itself works)", () => {
  const thursday = new Date(2026, 0, 15); // Thursday
  const mondayIso = "2026-01-19";
  const designationTypeForDate = (date: Date): DayDesignationType | null =>
    formatIsoDate(date) === mondayIso ? "alternativePackage" : null;
  const result = advanceInstructionalDays(thursday, 2, designationTypeForDate);
  assert.equal(formatIsoDate(result), "2026-01-19"); // Monday, same as the unmodified default case
});

test("an alternative-package day on a normally-non-instructional weekend upgrades it to count", () => {
  // Start on a Thursday and designate the FOLLOWING Saturday (not Monday)
  // as an alternative-package day — the walk should count Friday (1),
  // then Saturday (2, only because of the override), landing there.
  const thursday = new Date(2026, 0, 15); // Thursday
  const saturdayIso = "2026-01-17";
  const designationTypeForDate = (date: Date): DayDesignationType | null =>
    formatIsoDate(date) === saturdayIso ? "alternativePackage" : null;
  const result = advanceInstructionalDays(thursday, 2, designationTypeForDate);
  assert.equal(formatIsoDate(result), saturdayIso);
});

test("configurable lead-day counts still work (not hardcoded to 2)", () => {
  const monday = new Date(2026, 0, 12); // Monday
  const result5 = advanceInstructionalDays(monday, 5, noDesignations);
  // Mon(start) -> Tue(1) Wed(2) Thu(3) Fri(4) [weekend skipped] Mon(5)
  assert.equal(formatIsoDate(result5), "2026-01-19");
});

test("month boundary behavior", () => {
  const jan29 = new Date(2026, 0, 29); // Thursday, Jan 29 2026
  assert.equal(jan29.getDay(), 4);
  const result = advanceInstructionalDays(jan29, 2, noDesignations);
  assert.equal(formatIsoDate(result), "2026-02-02"); // crosses into February
});

test("year boundary behavior", () => {
  const dec30 = new Date(2026, 11, 30); // Wednesday, Dec 30 2026
  assert.equal(dec30.getDay(), 3);
  const result = advanceInstructionalDays(dec30, 2, noDesignations);
  assert.equal(formatIsoDate(result), "2027-01-01"); // Thu Dec 31 (1), Fri Jan 1 (2)
});

test("deterministic regardless of the input Date's time-of-day component", () => {
  const morning = new Date(2026, 0, 15, 6, 0, 0);
  const night = new Date(2026, 0, 15, 23, 59, 59);
  const a = advanceInstructionalDays(morning, 2, noDesignations);
  const b = advanceInstructionalDays(night, 2, noDesignations);
  assert.equal(formatIsoDate(a), formatIsoDate(b));
});

test("throws rather than looping forever if the designation data makes every day non-instructional", () => {
  assert.throws(() => advanceInstructionalDays(new Date(2026, 0, 1), 1, () => "nonInstructional"));
});

test("DEFAULT_INSTRUCTIONAL_WEEKDAYS matches the documented Mon-Fri default exactly", () => {
  assert.deepEqual(DEFAULT_INSTRUCTIONAL_WEEKDAYS, [false, true, true, true, true, true, false]);
});
