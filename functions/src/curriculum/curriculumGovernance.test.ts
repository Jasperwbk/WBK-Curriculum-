import { test } from "node:test";
import assert from "node:assert/strict";
import { getCurriculumGovernanceMode, shouldActivateGovernance } from "./curriculumGovernance";
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

test("defaults to legacy when a family has never set curriculumGovernance at all", () => {
  assert.equal(getCurriculumGovernanceMode(baseFamily), "legacy");
});

test("returns governed only when explicitly recorded, never inferred", () => {
  const governedFamily: Family = {
    ...baseFamily,
    curriculumGovernance: { mode: "governed", activatedByUid: "teacher-1", activatedAt: undefined },
  };
  assert.equal(getCurriculumGovernanceMode(governedFamily), "governed");
});

test("stays legacy even if explicitly recorded as legacy (not just absent)", () => {
  const explicitLegacyFamily: Family = {
    ...baseFamily,
    curriculumGovernance: { mode: "legacy" },
  };
  assert.equal(getCurriculumGovernanceMode(explicitLegacyFamily), "legacy");
});

test("shouldActivateGovernance: transitions legacy -> governed", () => {
  assert.equal(shouldActivateGovernance("legacy"), true);
});

test("shouldActivateGovernance: is a no-op once already governed (idempotent, deterministic on repeat bootstrap calls)", () => {
  assert.equal(shouldActivateGovernance("governed"), false);
  // Calling it again with the same input is stable — not a stateful toggle.
  assert.equal(shouldActivateGovernance("governed"), false);
});
