import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateApprovedMinutesBySubject, hourLogDocId, NON_HOUR_BEARING_SUBJECTS } from "./evidenceHours";
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

// --- PE non-hour-bearing policy (build-order step 7, Cory's decision) ---

test("physical_education is in the locked NON_HOUR_BEARING_SUBJECTS set", () => {
  assert.equal(NON_HOUR_BEARING_SUBJECTS.has("physical_education"), true);
});

test("a fully-approved physical_education block never posts official instructional minutes, no matter how much time was approved", () => {
  const blocks = [block({ blockId: "b1", subject: "physical_education", approvedMinutes: 45, completionState: "completed" })];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), {});
});

test("existing academic/specialty subjects keep posting hours normally even when a PE block is mixed into the same day", () => {
  const blocks = [
    block({ blockId: "b1", subject: "physical_education", approvedMinutes: 15 }),
    block({ blockId: "b2", subject: "math", approvedMinutes: 40 }),
    block({ blockId: "b3", subject: "bushcraft_outdoor_skills", approvedMinutes: 30 }),
  ];
  assert.deepEqual(aggregateApprovedMinutesBySubject(blocks), { math: 40, bushcraft_outdoor_skills: 30 });
});

test("PE's non-hour-bearing exclusion never touches its own recorded completion state, reported/approved minutes, or evidence — only whether it posts to official hours", () => {
  const peBlock = block({
    blockId: "b1",
    subject: "physical_education",
    title: "Balance beam practice",
    completionState: "completed",
    reportedMinutes: 15,
    approvedMinutes: 15,
    objectiveEvidence: [
      {
        objectiveId: "pe-obj-1",
        demonstrationType: "physical_demonstration",
        outcome: "observed_strong",
        sourceType: "teacher_observation",
        assessmentEligible: true,
        recordedByUid: "teacher-1",
        recordedAt: undefined as never,
      },
    ],
  });
  // No official hours posted for it...
  assert.deepEqual(aggregateApprovedMinutesBySubject([peBlock]), {});
  // ...but every bit of its own history is fully intact, exactly as
  // recorded — "non-hour-bearing" only ever gates the `logs` projection,
  // never the packet's own record of what actually happened.
  assert.equal(peBlock.completionState, "completed");
  assert.equal(peBlock.reportedMinutes, 15);
  assert.equal(peBlock.approvedMinutes, 15);
  assert.equal(peBlock.objectiveEvidence.length, 1);
  // And that observation evidence is real, teacher-observation-based
  // demonstration evidence — usable for mastery like any other subject's,
  // no quiz involved, exactly as the policy requires.
  const draft: EvidencePacketDraft = {
    blocks: [peBlock],
    dayAssessmentEligible: true,
    revision: 0,
    lastEditedByUid: "teacher-1",
    lastEditedAt: undefined as never,
  };
  const masteryItems = selectMasteryEligibleItems(draft);
  assert.equal(masteryItems.length, 1);
  assert.equal(masteryItems[0].subject, "physical_education");
  assert.equal(masteryItems[0].correct, true);
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
