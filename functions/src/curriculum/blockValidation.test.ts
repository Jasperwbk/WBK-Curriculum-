import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureMorningPhysicalEducationBlock,
  validateAndNormalizeBlocks,
  type ObjectiveIdScope,
  type ValidateBlocksParams,
} from "./blockValidation";
import type { LearningBlock } from "../types";
import { weekdayOrdinalBase } from "./objectiveId";

const NON_CATALOG_SCOPE: ObjectiveIdScope = { kidKey: "millaray", quarter: "q1", week: 3, date: "2026-09-21" }; // Monday, week 3 -> no WEEK1_OBJECTIVES catalog entry
const CATALOG_SCOPE: ObjectiveIdScope = { kidKey: "millaray", quarter: "q1", week: 1, date: "2026-09-21" };

function baseParams(overrides: Partial<ValidateBlocksParams> = {}): ValidateBlocksParams {
  return {
    raw: [],
    studentId: "student-1",
    scope: NON_CATALOG_SCOPE,
    mastery: { masteredObjectiveIdsBySubject: {}, inProgressObjectiveIdsBySubject: {} },
    sourceQuarterCertificationId: "qc-1",
    sourceWeeklyCertificationId: "wc-1",
    ...overrides,
  };
}

// --- fallback / malformed-output rejection ---

test("empty array -> single fallback block, not an empty published day", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: [] }));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].blockId, "b1");
  assert.equal(blocks[0].required, true);
});

test("non-array raw value (e.g. Claude returned a string or omitted the field) -> fallback block, never a crash", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: "not an array" }));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].blockId, "b1");
});

test("every entry malformed (missing/invalid subject) -> fallback block, malformed curriculum is never silently published", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ raw: [{ subject: "not_a_real_subject", title: "x" }, { title: "no subject at all" }, "garbage"] })
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].blockId, "b1");
});

test("one malformed entry among valid ones is dropped, not the whole batch", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      raw: [
        { subject: "math", title: "Good block" },
        { subject: "not_a_subject", title: "Bad block" },
        { subject: "science", title: "Another good block" },
      ],
    })
  );
  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((b) => b.title),
    ["Good block", "Another good block"]
  );
  // Surviving blocks get clean sequential ids, not gaps from the dropped one.
  assert.deepEqual(
    blocks.map((b) => b.blockId),
    ["b1", "b2"]
  );
});

// --- deterministic defaulting for malformed individual fields ---

test("missing/garbage title defaults to a safe placeholder", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: [{ subject: "math" }] }));
  assert.equal(blocks[0].title, "Untitled block");
});

test("missing/invalid stage defaults to teach_model", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: [{ subject: "math", stage: "not_a_real_stage" }] }));
  assert.equal(blocks[0].stage, "teach_model");
});

test("missing/non-boolean required defaults to true (never silently downgrades core work to optional)", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: [{ subject: "math", required: "yes" }] }));
  assert.equal(blocks[0].required, true);
});

test("estimatedMinutes is clamped into [5, 120] and defaults to 20 when missing/invalid", () => {
  const [tooLow, tooHigh, missing, valid] = validateAndNormalizeBlocks(
    baseParams({
      raw: [
        { subject: "math", estimatedMinutes: -5 },
        { subject: "math", estimatedMinutes: 99999 },
        { subject: "math" },
        { subject: "math", estimatedMinutes: 45 },
      ],
    })
  );
  assert.equal(tooLow.estimatedMinutes, 5);
  assert.equal(tooHigh.estimatedMinutes, 120);
  assert.equal(missing.estimatedMinutes, 20);
  assert.equal(valid.estimatedMinutes, 45);
});

test("order is ALWAYS the block's final array position — an AI-claimed 'order' field is ignored entirely (there is no such input field at all)", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ raw: [{ subject: "math", title: "first" }, { subject: "science", title: "second" }] })
  );
  assert.equal(blocks[0].order, 0);
  assert.equal(blocks[1].order, 1);
});

test("invalid activityFormat/notes are dropped to undefined; valid ones are preserved", () => {
  const [bad, good] = validateAndNormalizeBlocks(
    baseParams({
      raw: [
        { subject: "math", activityFormat: "telepathy", notes: 12345 },
        { subject: "math", activityFormat: "printable", notes: "Use the worksheet packet" },
      ],
    })
  );
  assert.equal(bad.activityFormat, undefined);
  assert.equal(bad.notes, undefined);
  assert.equal(good.activityFormat, "printable");
  assert.equal(good.notes, "Use the worksheet packet");
});

// --- objectiveId assignment ---

test("scope null (date outside the school year) -> objectiveIds is always empty, never a garbage id", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ scope: null, raw: [{ subject: "math", objectiveDescriptions: ["Add fractions"] }] })
  );
  assert.deepEqual(blocks[0].objectiveIds, []);
});

test("fresh allocation: a non-catalogued week gets deterministic, date-derived, non-text-based ids", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ raw: [{ subject: "math", objectiveDescriptions: ["Add fractions"] }] })
  );
  const base = weekdayOrdinalBase(NON_CATALOG_SCOPE.date) * 10;
  assert.deepEqual(blocks[0].objectiveIds, [`millaray-w3-math-${base + 1}`]);
});

test("fresh allocation increments per-subject across multiple blocks in one generation call", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      raw: [
        { subject: "math", objectiveDescriptions: ["Add fractions"] },
        { subject: "math", objectiveDescriptions: ["Subtract fractions"] },
      ],
    })
  );
  const base = weekdayOrdinalBase(NON_CATALOG_SCOPE.date) * 10;
  assert.deepEqual(blocks[0].objectiveIds, [`millaray-w3-math-${base + 1}`]);
  assert.deepEqual(blocks[1].objectiveIds, [`millaray-w3-math-${base + 2}`]);
});

test("catalog reuse: a week-1 Millaray math block reuses the real WEEK1_OBJECTIVES ids for math", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ scope: CATALOG_SCOPE, raw: [{ subject: "math", objectiveDescriptions: ["Weigh produce"] }] })
  );
  assert.deepEqual(blocks[0].objectiveIds, ["millaray-w1-math-1", "millaray-w1-math-2", "millaray-w1-math-3"]);
});

test("retrieval blocks reuse REAL existing ids from mastery context rather than allocating new ones", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      mastery: {
        masteredObjectiveIdsBySubject: { math: ["millaray-w1-math-1", "millaray-w1-math-2"] },
        inProgressObjectiveIdsBySubject: {},
      },
      raw: [{ subject: "math", stage: "warmup_retrieval", objectiveDescriptions: ["Review weighing"] }],
    })
  );
  assert.deepEqual(blocks[0].objectiveIds, ["millaray-w1-math-1"]);
});

test("retrieval block with nothing tracked yet in mastery falls through to fresh allocation instead of an empty id list", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ raw: [{ subject: "math", stage: "warmup_retrieval", objectiveDescriptions: ["Review weighing"] }] })
  );
  assert.equal(blocks[0].objectiveIds.length, 1);
});

test("objectiveDescriptions is capped at 3 objectives per block", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      raw: [{ subject: "math", objectiveDescriptions: ["a", "b", "c", "d", "e"] }],
    })
  );
  assert.equal(blocks[0].objectiveIds.length, 3);
});

// --- retrievalReason / remediationIntent ---

test("retrievalReason defaults to recent_retrieval for a warmup_retrieval block with no valid reason given", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: [{ subject: "math", stage: "warmup_retrieval" }] }));
  assert.equal(blocks[0].retrievalReason, "recent_retrieval");
});

test("retrievalReason is never set on a non-retrieval-stage block, even if the AI supplied one", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ raw: [{ subject: "math", stage: "teach_model", retrievalReason: "spaced_revisit" }] })
  );
  assert.equal(blocks[0].retrievalReason, undefined);
});

test("a valid AI-supplied retrievalReason is honored", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ raw: [{ subject: "math", stage: "warmup_retrieval", retrievalReason: "spaced_revisit" }] })
  );
  assert.equal(blocks[0].retrievalReason, "spaced_revisit");
});

test("remediationIntent: assessment_check stage always gets 'assessment'", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: [{ subject: "math", stage: "assessment_check" }] }));
  assert.equal(blocks[0].remediationIntent, "assessment");
});

test("remediationIntent: a block whose objective overlaps the student's in-progress set gets 'remediation'", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      scope: CATALOG_SCOPE,
      mastery: {
        masteredObjectiveIdsBySubject: {},
        inProgressObjectiveIdsBySubject: { math: ["millaray-w1-math-1"] },
      },
      raw: [{ subject: "math", stage: "teach_model", objectiveDescriptions: ["Weigh produce"] }],
    })
  );
  // Catalog reuse returns all 3 math ids for the subject, including millaray-w1-math-1.
  assert.equal(blocks[0].remediationIntent, "remediation");
});

test("remediationIntent: warmup_retrieval with no in-progress overlap gets 'retrieval'", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      mastery: {
        masteredObjectiveIdsBySubject: { math: ["millaray-w1-math-1"] },
        inProgressObjectiveIdsBySubject: {},
      },
      raw: [{ subject: "math", stage: "warmup_retrieval" }],
    })
  );
  assert.equal(blocks[0].remediationIntent, "retrieval");
});

test("remediationIntent: an ordinary teach_model block with no in-progress overlap gets 'initial_instruction'", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ raw: [{ subject: "math", stage: "teach_model" }] }));
  assert.equal(blocks[0].remediationIntent, "initial_instruction");
});

// --- dependsOn translation ---

test("dependsOnIndex is translated into real blockIds pointing at EARLIER surviving blocks", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      raw: [
        { subject: "math", title: "teach" },
        { subject: "math", title: "practice", dependsOnIndex: [0] },
      ],
    })
  );
  assert.deepEqual(blocks[1].dependsOn, [{ blockId: "b1" }]);
});

test("a dependsOnIndex pointing at a DROPPED (malformed) earlier entry is silently omitted, not left dangling", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      raw: [
        { subject: "not_a_subject", title: "will be dropped" },
        { subject: "math", title: "practice", dependsOnIndex: [0] },
      ],
    })
  );
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].dependsOn, []);
});

test("a dependsOnIndex pointing at itself or a LATER index is ignored (only earlier raw indices are ever accepted)", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({
      raw: [
        { subject: "math", title: "first", dependsOnIndex: [0, 1] }, // self (0) and forward (1) both invalid
        { subject: "math", title: "second" },
      ],
    })
  );
  assert.deepEqual(blocks[0].dependsOn, []);
});

// --- traceability ---

test("every generated block carries the source certification ids passed in", () => {
  const blocks = validateAndNormalizeBlocks(
    baseParams({ sourceQuarterCertificationId: "qc-99", sourceWeeklyCertificationId: "wc-99", raw: [{ subject: "math" }] })
  );
  assert.equal(blocks[0].sourceQuarterCertificationId, "qc-99");
  assert.equal(blocks[0].sourceWeeklyCertificationId, "wc-99");
});

test("every generated block starts not_started, not teacher-locked, and studentId-tagged", () => {
  const blocks = validateAndNormalizeBlocks(baseParams({ studentId: "kid-42", raw: [{ subject: "math" }] }));
  assert.equal(blocks[0].completionState, "not_started");
  assert.equal(blocks[0].teacherLocked, false);
  assert.equal(blocks[0].studentId, "kid-42");
});

// --- ensureMorningPhysicalEducationBlock (build-order step 7) ---

function block(overrides: Partial<LearningBlock> & Pick<LearningBlock, "blockId" | "order">): LearningBlock {
  return {
    studentId: "student-1",
    subject: "math",
    title: "A block",
    objectiveIds: [],
    stage: "teach_model",
    estimatedMinutes: 20,
    required: true,
    completionState: "not_started",
    dependsOn: [],
    teacherLocked: false,
    sourceQuarterCertificationId: "qc-1",
    sourceWeeklyCertificationId: "wc-1",
    ...overrides,
  };
}

test("a day with no physical_education block gets one prepended at index 0", () => {
  const original = [block({ blockId: "b1", order: 0 })];
  const result = ensureMorningPhysicalEducationBlock(original, "student-1", "qc-1", "wc-1");
  assert.equal(result.length, 2);
  assert.equal(result[0].subject, "physical_education");
  assert.equal(result[0].blockId, "b1");
  assert.equal(result[0].order, 0);
  assert.equal(result[0].required, true);
});

test("inserting the default PE block renames every existing block and remaps its dependsOn references", () => {
  const original = [
    block({ blockId: "b1", order: 0, title: "teach" }),
    block({ blockId: "b2", order: 1, title: "practice", dependsOn: [{ blockId: "b1" }] }),
  ];
  const result = ensureMorningPhysicalEducationBlock(original, "student-1", "qc-1", "wc-1");
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((b) => [b.blockId, b.order, b.title]),
    [
      ["b1", 0, "Morning Movement"],
      ["b2", 1, "teach"],
      ["b3", 2, "practice"],
    ]
  );
  // The renamed "practice" block's dependency, originally pointing at the
  // old b1 ("teach"), now correctly points at its new id b2 — never at the
  // newly-inserted PE block, and never left dangling on the stale id.
  assert.deepEqual(result[2].dependsOn, [{ blockId: "b2" }]);
});

test("a day that already has a physical_education block anywhere is left completely unchanged", () => {
  const original = [
    block({ blockId: "b1", order: 0, title: "teach" }),
    block({ blockId: "b2", order: 1, subject: "physical_education", title: "Balance practice" }),
  ];
  const result = ensureMorningPhysicalEducationBlock(original, "student-1", "qc-1", "wc-1");
  assert.deepEqual(result, original);
});

test("the synthesized default PE block is marked required and carries the source certification ids passed in", () => {
  const result = ensureMorningPhysicalEducationBlock([], "student-9", "qc-42", "wc-42");
  assert.equal(result.length, 1);
  assert.equal(result[0].required, true);
  assert.equal(result[0].studentId, "student-9");
  assert.equal(result[0].sourceQuarterCertificationId, "qc-42");
  assert.equal(result[0].sourceWeeklyCertificationId, "wc-42");
});
