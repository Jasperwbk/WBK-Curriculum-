import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WEEKLY_CERTIFICATION_SCHEDULE, getWeeklyCertificationSchedule } from "./certificationSchedule";
import type { Family } from "../types";

const baseFamily: Family = {
  familyName: "Test Family",
  schoolYear: {
    startDate: { toDate: () => new Date() } as unknown as Family["schoolYear"]["startDate"],
    yearLengthDays: 365,
    totalHoursTarget: 1000,
    coreHoursTarget: 600,
    homeCoreHoursTarget: 400,
  },
  memberIds: [],
};

test("falls back to the default schedule when the family hasn't set one", () => {
  const schedule = getWeeklyCertificationSchedule(baseFamily);
  assert.deepEqual(schedule, DEFAULT_WEEKLY_CERTIFICATION_SCHEDULE);
});

test("uses the family's configured schedule when set, not the default", () => {
  const custom = { reviewByDayOfWeek: 4, reviewByTime: "12:00", certifyByDayOfWeek: 6, certifyByTime: "09:00" };
  const schedule = getWeeklyCertificationSchedule({ ...baseFamily, weeklyCertificationSchedule: custom });
  assert.deepEqual(schedule, custom);
});
