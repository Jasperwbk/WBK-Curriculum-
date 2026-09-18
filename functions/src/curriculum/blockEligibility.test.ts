import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEligibleBlocks } from "./blockEligibility";
import type { LearningBlock } from "../types";

function block(overrides: Partial<LearningBlock> & Pick<LearningBlock, "blockId" | "order">): LearningBlock {
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
    sourceQuarterCertificationId: null,
    sourceWeeklyCertificationId: null,
    ...overrides,
  };
}

test("Strict mode: only the first required block is eligible until earlier ones complete", () => {
  const blocks = [
    block({ blockId: "b1", order: 0 }),
    block({ blockId: "b2", order: 1 }),
    block({ blockId: "b3", order: 2 }),
  ];
  const result = computeEligibleBlocks(blocks, "strict");
  assert.deepEqual(
    result.map((r) => [r.blockId, r.eligible]),
    [
      ["b1", true],
      ["b2", false],
      ["b3", false],
    ]
  );
  assert.equal(result[1].reason, "not_next_in_strict_order");
});

test("Strict mode: completing b1 makes b2 (not b3) eligible next — real order enforcement, not just 'anything after a completed one'", () => {
  const blocks = [
    block({ blockId: "b1", order: 0, completionState: "completed" }),
    block({ blockId: "b2", order: 1 }),
    block({ blockId: "b3", order: 2 }),
  ];
  const result = computeEligibleBlocks(blocks, "strict");
  assert.equal(result.find((r) => r.blockId === "b1")?.eligible, false); // already_completed
  assert.equal(result.find((r) => r.blockId === "b1")?.reason, "already_completed");
  assert.equal(result.find((r) => r.blockId === "b2")?.eligible, true);
  assert.equal(result.find((r) => r.blockId === "b3")?.eligible, false);
});

test("Flexible mode: an unmet dependency still blocks eligibility even though ordering itself is relaxed", () => {
  const blocks = [
    block({ blockId: "b1", order: 0 }),
    block({ blockId: "b2", order: 1, dependsOn: [{ blockId: "b1" }] }),
    block({ blockId: "b3", order: 2 }), // no dependency — independent of b1/b2
  ];
  const result = computeEligibleBlocks(blocks, "flexible");
  assert.equal(result.find((r) => r.blockId === "b1")?.eligible, true);
  assert.equal(result.find((r) => r.blockId === "b2")?.eligible, false);
  assert.equal(result.find((r) => r.blockId === "b2")?.reason, "prerequisite_incomplete");
  // Flexible mode: b3 has no dependency and isn't next-in-order — it's
  // still eligible, unlike what strict mode would say.
  assert.equal(result.find((r) => r.blockId === "b3")?.eligible, true);
});

test("Flexible mode: once the dependency completes, the dependent block becomes eligible", () => {
  const blocks = [
    block({ blockId: "b1", order: 0, completionState: "completed" }),
    block({ blockId: "b2", order: 1, dependsOn: [{ blockId: "b1" }] }),
  ];
  const result = computeEligibleBlocks(blocks, "flexible");
  assert.equal(result.find((r) => r.blockId === "b2")?.eligible, true);
});

test("Teacher-locked block is never eligible in either mode, even with no dependencies at all", () => {
  const blocks = [block({ blockId: "b1", order: 0, teacherLocked: true })];
  assert.equal(computeEligibleBlocks(blocks, "flexible")[0].eligible, false);
  assert.equal(computeEligibleBlocks(blocks, "flexible")[0].reason, "teacher_locked");
  assert.equal(computeEligibleBlocks(blocks, "strict")[0].eligible, false);
});

test("Enrichment (required:false) is locked until ALL required blocks are complete", () => {
  const blocks = [
    block({ blockId: "req1", order: 0, required: true }),
    block({ blockId: "req2", order: 1, required: true }),
    block({ blockId: "enrich", order: 2, required: false }),
  ];
  const result = computeEligibleBlocks(blocks, "flexible");
  assert.equal(result.find((r) => r.blockId === "enrich")?.eligible, false);
  assert.equal(result.find((r) => r.blockId === "enrich")?.reason, "enrichment_locked_until_required_complete");
});

test("Early completion of all required work unlocks enrichment for THIS day, and never touches or references another day's data at all", () => {
  const blocks = [
    block({ blockId: "req1", order: 0, required: true, completionState: "completed" }),
    block({ blockId: "req2", order: 1, required: true, completionState: "completed" }),
    block({ blockId: "enrich", order: 2, required: false }),
  ];
  const result = computeEligibleBlocks(blocks, "flexible");
  assert.equal(result.find((r) => r.blockId === "enrich")?.eligible, true);
  // The function's signature takes only ONE day's block array — there is
  // no parameter through which a second day's blocks could ever be
  // reached or mutated, so "unlocks tomorrow's required work" is
  // structurally impossible, not just untested.
  assert.equal(computeEligibleBlocks.length, 2); // (blocks, itineraryMode) — no "next day" input exists
});

test("A day with zero required blocks treats enrichment as immediately eligible (vacuously all-required-complete)", () => {
  const blocks = [block({ blockId: "enrich", order: 0, required: false })];
  const result = computeEligibleBlocks(blocks, "flexible");
  assert.equal(result[0].eligible, true);
});
