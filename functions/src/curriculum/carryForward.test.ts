import { test } from "node:test";
import assert from "node:assert/strict";
import { attachCarryForwardProvenance, computeOutstandingCarryForward } from "./carryForward";
import type { LearningBlock } from "../types";

function block(overrides: Partial<LearningBlock> & Pick<LearningBlock, "blockId">): LearningBlock {
  return {
    studentId: "student-1",
    subject: "math",
    title: "Block",
    objectiveIds: [],
    stage: "teach_model",
    estimatedMinutes: 20,
    required: true,
    completionState: "not_started",
    dependsOn: [],
    teacherLocked: false,
    order: 0,
    sourceQuarterCertificationId: "qc-1",
    sourceWeeklyCertificationId: "wc-1",
    ...overrides,
  };
}

test("computeOutstandingCarryForward: a required, in_progress block IS outstanding", () => {
  const blocks = [block({ blockId: "b1", required: true, completionState: "in_progress" })];
  const outstanding = computeOutstandingCarryForward(blocks);
  assert.equal(outstanding.length, 1);
  assert.equal(outstanding[0].blockId, "b1");
});

test("computeOutstandingCarryForward: 'not_started' is deliberately NEVER treated as outstanding", () => {
  // Nothing in step 5 (or step 4/4.1) writes anything but not_started at
  // generation time — treating it as outstanding would flag every
  // required block from every approved day, forever, which is wrong.
  const blocks = [block({ blockId: "b1", required: true, completionState: "not_started" })];
  assert.deepEqual(computeOutstandingCarryForward(blocks), []);
});

test("computeOutstandingCarryForward: a completed block is never outstanding", () => {
  const blocks = [block({ blockId: "b1", required: true, completionState: "completed" })];
  assert.deepEqual(computeOutstandingCarryForward(blocks), []);
});

test("computeOutstandingCarryForward: enrichment (required:false) is never outstanding, even if in_progress", () => {
  const blocks = [block({ blockId: "b1", required: false, completionState: "in_progress" })];
  assert.deepEqual(computeOutstandingCarryForward(blocks), []);
});

test("computeOutstandingCarryForward: an empty block list is safely empty", () => {
  assert.deepEqual(computeOutstandingCarryForward([]), []);
});

test("attachCarryForwardProvenance: a new block sharing an objectiveId with an outstanding block gets tagged", () => {
  const outstanding = [
    block({ blockId: "old-1", objectiveIds: ["millaray-w1-math-1"], completionState: "in_progress" }),
  ];
  const newBlocks = [block({ blockId: "new-1", objectiveIds: ["millaray-w1-math-1"] })];
  const tagged = attachCarryForwardProvenance(newBlocks, outstanding, "day-abc", "2026-09-14");
  assert.equal(tagged[0].carryForward?.fromProposedDayId, "day-abc");
  assert.equal(tagged[0].carryForward?.fromDate, "2026-09-14");
  assert.equal(tagged[0].carryForward?.fromBlockId, "old-1");
});

test("attachCarryForwardProvenance: tagging preserves the CARRIED block's original source certification, not today's", () => {
  const outstanding = [
    block({
      blockId: "old-1",
      objectiveIds: ["millaray-w1-math-1"],
      sourceQuarterCertificationId: "OLD-QC",
      sourceWeeklyCertificationId: "OLD-WC",
    }),
  ];
  const newBlocks = [
    block({
      blockId: "new-1",
      objectiveIds: ["millaray-w1-math-1"],
      sourceQuarterCertificationId: "NEW-QC",
      sourceWeeklyCertificationId: "NEW-WC",
    }),
  ];
  const tagged = attachCarryForwardProvenance(newBlocks, outstanding, "day-abc", "2026-09-14");
  assert.equal(tagged[0].sourceQuarterCertificationId, "OLD-QC");
  assert.equal(tagged[0].sourceWeeklyCertificationId, "OLD-WC");
});

test("attachCarryForwardProvenance: a block with no matching objectiveId is returned completely unchanged", () => {
  const outstanding = [block({ blockId: "old-1", objectiveIds: ["millaray-w1-math-1"] })];
  const newBlocks = [block({ blockId: "new-1", objectiveIds: ["millaray-w1-science-1"] })];
  const tagged = attachCarryForwardProvenance(newBlocks, outstanding, "day-abc", "2026-09-14");
  assert.deepEqual(tagged[0], newBlocks[0]);
  assert.equal(tagged[0].carryForward, undefined);
});

test("attachCarryForwardProvenance: never mutates completion/required/title fields on the new block — only source ids + carryForward", () => {
  const outstanding = [block({ blockId: "old-1", objectiveIds: ["id-1"] })];
  const newBlocks = [block({ blockId: "new-1", objectiveIds: ["id-1"], title: "Independent Practice", required: true })];
  const tagged = attachCarryForwardProvenance(newBlocks, outstanding, "day-abc", "2026-09-14");
  assert.equal(tagged[0].title, "Independent Practice");
  assert.equal(tagged[0].required, true);
  assert.equal(tagged[0].blockId, "new-1"); // identity is never touched either
});

test("attachCarryForwardProvenance: an empty outstanding list leaves every new block untouched", () => {
  const newBlocks = [block({ blockId: "new-1" })];
  const tagged = attachCarryForwardProvenance(newBlocks, [], "day-abc", "2026-09-14");
  assert.deepEqual(tagged, newBlocks);
});

test("attachCarryForwardProvenance never mutates the OLD (outstanding) block's own completionState — it stays whatever it was, never auto-completed", () => {
  const outstanding = [block({ blockId: "old-1", objectiveIds: ["id-1"], completionState: "in_progress" })];
  const newBlocks = [block({ blockId: "new-1", objectiveIds: ["id-1"] })];
  attachCarryForwardProvenance(newBlocks, outstanding, "day-abc", "2026-09-14");
  assert.equal(outstanding[0].completionState, "in_progress");
});
