import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateApprovedMinutesBySubject, hourLogDocId } from "./evidenceHours";
import { selectMasteryEligibleItems } from "./evidenceMastery";
import type { EvidenceBlockEntry, EvidencePacketDraft } from "../types";

function block(overrides: Partial<EvidenceBlockEntry> & Pick<EvidenceBlockEntry, "blockId">): EvidenceBlockEntry {
  return {
    subject: "math",
    title: "Block",
    required: true,
    objectiveIds: [],
    plannedMinutes: 20,
    reportedMinutes: 20,
    approvedMinutes: 20,
    completionState: "completed",
    assessmentEligible: true,
    objectiveEvidence: [],
    sourceQuarterCertificationId: "qc-1",
    sourceWeeklyCertificationId: "wc-1",
    ...overrides,
  };
}

test("planned minutes are NOT what gets summed — only approvedMinutes counts", () => {
  const blocks = [block({ blockId: "b1", plannedMinutes: 999, reportedMinutes: 999, approvedMinutes: 15 })];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), { math: 15 });
});

test("a block with approvedMinutes still null (never approved) contributes nothing", () => {
  const blocks = [block({ blockId: "b1", approvedMinutes: null })];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), {});
});

test("two blocks in the same subject sum together", () => {
  const blocks = [
    block({ blockId: "b1", subject: "math", approvedMinutes: 20 }),
    block({ blockId: "b2", subject: "math", approvedMinutes: 15 }),
  ];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), { math: 35 });
});

test("blocks in different subjects are kept separate", () => {
  const blocks = [
    block({ blockId: "b1", subject: "math", approvedMinutes: 20 }),
    block({ blockId: "b2", subject: "science", approvedMinutes: 25 }),
  ];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), { math: 20, science: 25 });
});

test("hours are independent of assessmentEligible — an excluded block's approved minutes still count", () => {
  const blocks = [block({ blockId: "b1", assessmentEligible: false, approvedMinutes: 20 })];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), { math: 20 });
});

test("hours are independent of completionState — an excused block with genuinely-reported minutes still counts if approved", () => {
  const blocks = [block({ blockId: "b1", completionState: "excused", approvedMinutes: 5 })];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), { math: 5 });
});

test("a block with zero or negative approved minutes contributes nothing (and never produces a zero-value subject entry)", () => {
  const blocks = [block({ blockId: "b1", approvedMinutes: 0 })];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), {});
});

test("compliance vs. mastery: a completed block with a weak/incorrect evidence outcome still keeps its full completion state and approved minutes — poor assessment never erases legitimate instructional time", () => {
  const weakBlock = block({
    blockId: "b1",
    completionState: "completed",
    approvedMinutes: 45,
    objectiveEvidence: [
      {
        objectiveId: "obj-1",
        demonstrationType: "written_response",
        outcome: "incorrect",
        sourceType: "worksheet",
        assessmentEligible: true,
        recordedByUid: "teacher-1",
        recordedAt: undefined as never, // irrelevant to this test — only completion/hours are under test
      },
    ],
  });
  // Hours: unaffected by the poor outcome — still the full 45 minutes.
  assert.deepEqual(aggregateApprovedMinutesBySubject([weakBlock]), { math: 45 });
  // Completion: still "completed" — the weak result is mastery evidence, not an undo of completion.
  assert.equal(weakBlock.completionState, "completed");
  // Mastery: the weak evidence IS still selected (it's not excluded), it just maps to a negative signal — this is the correct, separate dimension, not a contradiction.
  const draft: EvidencePacketDraft = {
    blocks: [weakBlock],
    dayAssessmentEligible: true,
    revision: 0,
    lastEditedByUid: "teacher-1",
    lastEditedAt: undefined as never,
  };
  const masteryItems = selectMasteryEligibleItems(draft);
  assert.equal(masteryItems.length, 1);
  assert.equal(masteryItems[0].correct, false);
});

// --- hourLogDocId: hour-posting idempotency (build-order step 6.1) ---

test("hourLogDocId is deterministic — the same packet+subject always produces the same doc id, so a retry overwrites rather than duplicates", () => {
  const a = hourLogDocId("packet-1", "math");
  const b = hourLogDocId("packet-1", "math");
  assert.equal(a, b);
});

test("hourLogDocId differs across subjects for the same packet, and across packets for the same subject — no cross-contamination", () => {
  const base = hourLogDocId("packet-1", "math");
  assert.notEqual(hourLogDocId("packet-1", "science"), base);
  assert.notEqual(hourLogDocId("packet-2", "math"), base);
});
