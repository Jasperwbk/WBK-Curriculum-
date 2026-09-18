import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GENERATION_LEAD_DAYS, computeGenerationTargetDate, getGenerationLeadDays } from "./generationSchedule";
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

test("getGenerationLeadDays defaults to 2 when a family hasn't configured one", () => {
  assert.equal(getGenerationLeadDays(baseFamily), DEFAULT_GENERATION_LEAD_DAYS);
  assert.equal(getGenerationLeadDays(baseFamily), 2);
});

test("getGenerationLeadDays uses the family's configured value when set", () => {
  assert.equal(getGenerationLeadDays({ ...baseFamily, dayGenerationLeadDays: 5 }), 5);
});

test("getGenerationLeadDays falls back to the default for a non-positive configured value (defensive, not a hardcoded 48h assumption)", () => {
  assert.equal(getGenerationLeadDays({ ...baseFamily, dayGenerationLeadDays: 0 }), DEFAULT_GENERATION_LEAD_DAYS);
  assert.equal(getGenerationLeadDays({ ...baseFamily, dayGenerationLeadDays: -1 }), DEFAULT_GENERATION_LEAD_DAYS);
});

test("computeGenerationTargetDate adds calendar days correctly", () => {
  assert.equal(computeGenerationTargetDate(new Date(2026, 0, 1), 2), "2026-01-03");
});

test("computeGenerationTargetDate crosses a month boundary correctly", () => {
  assert.equal(computeGenerationTargetDate(new Date(2026, 0, 30), 2), "2026-02-01");
});

test("computeGenerationTargetDate crosses a year boundary correctly", () => {
  assert.equal(computeGenerationTargetDate(new Date(2026, 11, 30), 3), "2027-01-02");
});

test("computeGenerationTargetDate with 0 lead days returns today", () => {
  assert.equal(computeGenerationTargetDate(new Date(2026, 5, 15), 0), "2026-06-15");
});

test("computeGenerationTargetDate is stable regardless of the input Date's time-of-day component", () => {
  const morning = new Date(2026, 2, 10, 6, 0, 0);
  const night = new Date(2026, 2, 10, 23, 59, 59);
  assert.equal(computeGenerationTargetDate(morning, 2), computeGenerationTargetDate(night, 2));
});
