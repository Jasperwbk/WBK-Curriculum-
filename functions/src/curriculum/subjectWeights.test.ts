import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSubjectWeights } from "./subjectWeights";
import { Q1_FALL_WEEKLY_HOURS } from "./weeklyHours";
import { CORE_SUBJECTS, SPECIALTY_SUBJECTS } from "../types";

test("every core and specialty subject's weight sums to 1 within its own bucket", () => {
  const weights = computeSubjectWeights();
  const coreSum = CORE_SUBJECTS.reduce((sum, s) => sum + weights[s], 0);
  const specialtySum = SPECIALTY_SUBJECTS.reduce((sum, s) => sum + weights[s], 0);
  assert.ok(Math.abs(coreSum - 1) < 1e-9);
  assert.ok(Math.abs(specialtySum - 1) < 1e-9);
});

test("reading/language arts (5 hrs/week) outweighs the other 4-hr/week core subjects", () => {
  const weights = computeSubjectWeights();
  assert.ok(weights.reading_language_arts > weights.math);
  assert.ok(weights.reading_language_arts > weights.science);
  assert.ok(weights.reading_language_arts > weights.social_studies_history);
});

test("physical_education (build-order step 7): honestly zero weight, not a guessed number, since Q1_FALL_WEEKLY_HOURS assigns it no hours yet", () => {
  const weights = computeSubjectWeights();
  assert.equal(weights.physical_education, 0);
  // Not the "no data at all" fallback (an even split) — the specialty
  // bucket DOES have real data (bushcraft/homestead/nature/spiritual), so
  // PE's 0 is the real, honest "explicitly not weighted yet" outcome, not
  // an accidental even-split default.
  assert.notEqual(weights.physical_education, 1 / SPECIALTY_SUBJECTS.length);
});

test("PE having zero weight never distorts the other specialty subjects' shares — they're computed only against each other's real hours, unaffected by PE's absence", () => {
  const weights = computeSubjectWeights();
  // Pre-step-7 known values: bushcraft/homestead/nature = 3/11, spiritual = 2/11.
  assert.ok(Math.abs(weights.bushcraft_outdoor_skills - 3 / 11) < 1e-9);
  assert.ok(Math.abs(weights.homestead_skills - 3 / 11) < 1e-9);
  assert.ok(Math.abs(weights.nature_identification - 3 / 11) < 1e-9);
  assert.ok(Math.abs(weights.spiritual_cultural - 2 / 11) < 1e-9);
});

test("a bucket with genuinely zero total hours still falls back to an even split, unlike PE's honest zero within a non-empty bucket", () => {
  const weights = computeSubjectWeights([{ week: 1, hours: {} }]);
  for (const s of CORE_SUBJECTS) assert.ok(Math.abs(weights[s] - 1 / CORE_SUBJECTS.length) < 1e-9);
  for (const s of SPECIALTY_SUBJECTS) assert.ok(Math.abs(weights[s] - 1 / SPECIALTY_SUBJECTS.length) < 1e-9);
});

test("computeSubjectWeights still sums the real bundled Q1 weekly hours correctly across all 9 weeks", () => {
  const weights = computeSubjectWeights(Q1_FALL_WEEKLY_HOURS);
  assert.ok(Math.abs(weights.math - 4 / 17) < 1e-9);
});
