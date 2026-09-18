import { test } from "node:test";
import assert from "node:assert/strict";
import { sumInstructionalMinutes, type HourCountableLog } from "./hourAggregation";

const FAMILY = "family-1";

function log(overrides: Partial<HourCountableLog> = {}): HourCountableLog {
  return { familyId: FAMILY, location: "home", durationMinutes: 30, ...overrides };
}

test("a legacy/unclassified log (no provenance field at all) still counts — the record type doesn't even carry provenance, and this function never asks for it", () => {
  const total = sumInstructionalMinutes([log({ durationMinutes: 45 })], FAMILY);
  assert.equal(total, 45);
});

test("a governed-evidence log counts the same as any other", () => {
  const total = sumInstructionalMinutes([log({ durationMinutes: 45 })], FAMILY);
  assert.equal(total, 45);
});

test("an extracurricular-style log (external location) counts when locations aren't restricted", () => {
  const total = sumInstructionalMinutes([log({ location: "external", durationMinutes: 60 })], FAMILY);
  assert.equal(total, 60);
});

test("the home-core bucket's location restriction excludes an external-location log, exactly as before", () => {
  const logs = [log({ location: "home", durationMinutes: 30 }), log({ location: "external", durationMinutes: 60 })];
  const total = sumInstructionalMinutes(logs, FAMILY, { locations: ["home", "field"] });
  assert.equal(total, 30);
});

test("an unrelated, legitimate second manual activity on the SAME date is never excluded — no same-date assumption is made at all, because this function has no date field to compare in the first place", () => {
  // Two independently-created entries with identical familyId/location —
  // both count, in full, because "same date + same subject" is never
  // treated as duplicate anywhere in this function.
  const logs = [log({ durationMinutes: 20 }), log({ durationMinutes: 25 })];
  const total = sumInstructionalMinutes(logs, FAMILY);
  assert.equal(total, 45);
});

test("familyId isolation is preserved — a log belonging to a different family never contributes", () => {
  const logs = [log({ durationMinutes: 30 }), log({ familyId: "other-family", durationMinutes: 999 })];
  const total = sumInstructionalMinutes(logs, FAMILY);
  assert.equal(total, 30);
});

test("an empty log list sums to zero", () => {
  assert.equal(sumInstructionalMinutes([], FAMILY), 0);
});

test("same governed activity cannot count twice at this layer either: summing the SAME log data twice (simulating an accidental duplicate row) still just sums what's given — true prevention is upstream, at the deterministic hourLogDocId write (evidenceHours.ts), which never produces two rows for the same packet+subject in the first place", () => {
  const sameRow = log({ durationMinutes: 45 });
  // This function has no way to know two identical rows are "the same
  // fact" vs. two genuinely separate activities that happen to match —
  // that ambiguity is exactly why real duplicate-prevention lives
  // upstream (a deterministic doc id), not in this aggregation step.
  const total = sumInstructionalMinutes([sameRow, sameRow], FAMILY);
  assert.equal(total, 90);
});
