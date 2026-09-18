import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GENERATION_LEAD_DAYS, getGenerationLeadDays } from "./generationSchedule";
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

test("getGenerationLeadDays falls back to the default for a non-positive configured value (defensive, not a hardcoded assumption)", () => {
  assert.equal(getGenerationLeadDays({ ...baseFamily, dayGenerationLeadDays: 0 }), DEFAULT_GENERATION_LEAD_DAYS);
  assert.equal(getGenerationLeadDays({ ...baseFamily, dayGenerationLeadDays: -1 }), DEFAULT_GENERATION_LEAD_DAYS);
});
