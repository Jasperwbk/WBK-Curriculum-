import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { isEvidenceEligibleForMastery, mapOutcomeToMasteryBoolean, selectMasteryEligibleItems } from "./evidenceMastery";
import type { EvidenceBlockEntry, EvidencePacketDraft, ObjectiveEvidenceItem } from "../types";

const NOW = Timestamp.fromDate(new Date("2026-09-21T12:00:00Z"));

function evidenceItem(overrides: Partial<ObjectiveEvidenceItem> & Pick<ObjectiveEvidenceItem, "objectiveId" | "outcome">): ObjectiveEvidenceItem {
  return {
    demonstrationType: "verbal_explanation",
    sourceType: "teacher_observation",
    assessmentEligible: true,
    recordedByUid: "teacher-1",
    recordedAt: NOW,
    ...overrides,
  };
}

function block(overrides: Partial<EvidenceBlockEntry> & Pick<EvidenceBlockEntry, "blockId">): EvidenceBlockEntry {
  return {
    subject: "math",
    title: "Weighing produce",
    required: true,
    objectiveIds: [],
    plannedMinutes: 20,
    reportedMinutes: 20,
    approvedMinutes: null,
    completionState: "completed",
    assessmentEligible: true,
    objectiveEvidence: [],
    sourceQuarterCertificationId: "qc-1",
    sourceWeeklyCertificationId: "wc-1",
    ...overrides,
  };
}

function draft(blocks: EvidenceBlockEntry[], dayAssessmentEligible = true): EvidencePacketDraft {
  return { blocks, dayAssessmentEligible, revision: 0, lastEditedByUid: "teacher-1", lastEditedAt: NOW };
}

// --- mapOutcomeToMasteryBoolean ---

test("correct/observed_strong map to true", () => {
  assert.equal(mapOutcomeToMasteryBoolean("correct"), true);
  assert.equal(mapOutcomeToMasteryBoolean("observed_strong"), true);
});

test("incorrect/observed_weak map to false", () => {
  assert.equal(mapOutcomeToMasteryBoolean("incorrect"), false);
  assert.equal(mapOutcomeToMasteryBoolean("observed_weak"), false);
});

test("partial/not_applicable map to null — preserved as evidence, but don't move the binary threshold", () => {
  assert.equal(mapOutcomeToMasteryBoolean("partial"), null);
  assert.equal(mapOutcomeToMasteryBoolean("not_applicable"), null);
});

// --- isEvidenceEligibleForMastery ---

test("all three levels must be eligible for evidence to reach mastery", () => {
  assert.equal(isEvidenceEligibleForMastery(true, true, true), true);
  assert.equal(isEvidenceEligibleForMastery(false, true, true), false);
  assert.equal(isEvidenceEligibleForMastery(true, false, true), false);
  assert.equal(isEvidenceEligibleForMastery(true, true, false), false);
});

// --- selectMasteryEligibleItems ---

test("an eligible, mappable item is selected with the block's subject/title as skill", () => {
  const b = block({
    blockId: "b1",
    subject: "math",
    title: "Weighing produce",
    objectiveIds: ["obj-1"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })],
  });
  const items = selectMasteryEligibleItems(draft([b]));
  assert.deepEqual(items, [{ objectiveId: "obj-1", subject: "math", skill: "Weighing produce", correct: true }]);
});

test("day-level exclusion removes the item entirely from selection", () => {
  const b = block({
    blockId: "b1",
    objectiveIds: ["obj-1"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })],
  });
  assert.deepEqual(selectMasteryEligibleItems(draft([b], false)), []);
});

test("block-level exclusion removes the item entirely from selection", () => {
  const b = block({
    blockId: "b1",
    assessmentEligible: false,
    objectiveIds: ["obj-1"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })],
  });
  assert.deepEqual(selectMasteryEligibleItems(draft([b])), []);
});

test("result-level exclusion removes only that item, not the whole block's other items", () => {
  const b = block({
    blockId: "b1",
    objectiveIds: ["obj-1", "obj-2"],
    objectiveEvidence: [
      evidenceItem({ objectiveId: "obj-1", outcome: "correct", assessmentEligible: false }),
      evidenceItem({ objectiveId: "obj-2", outcome: "correct", assessmentEligible: true }),
    ],
  });
  const items = selectMasteryEligibleItems(draft([b]));
  assert.equal(items.length, 1);
  assert.equal(items[0].objectiveId, "obj-2");
});

test("excluded evidence never enters the mastery window even mixed with eligible evidence across blocks", () => {
  const b1 = block({
    blockId: "b1",
    objectiveIds: ["obj-1"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })],
  });
  const b2 = block({
    blockId: "b2",
    assessmentEligible: false,
    objectiveIds: ["obj-2"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-2", outcome: "correct" })],
  });
  const items = selectMasteryEligibleItems(draft([b1, b2]));
  assert.equal(items.length, 1);
  assert.equal(items[0].objectiveId, "obj-1");
});

test("a 'partial' outcome is eligible but still doesn't produce a mastery item (not mappable)", () => {
  const b = block({
    blockId: "b1",
    objectiveIds: ["obj-1"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "partial" })],
  });
  assert.deepEqual(selectMasteryEligibleItems(draft([b])), []);
});

test("teacher-observation-sourced evidence (no AI quiz involved) produces a real eligible mastery item", () => {
  const b = block({
    blockId: "b1",
    objectiveIds: ["obj-1"],
    objectiveEvidence: [
      evidenceItem({
        objectiveId: "obj-1",
        outcome: "observed_strong",
        sourceType: "teacher_observation",
        demonstrationType: "physical_demonstration",
      }),
    ],
  });
  const items = selectMasteryEligibleItems(draft([b]));
  assert.equal(items.length, 1);
  assert.equal(items[0].correct, true);
});

test("Maizley-style demonstration evidence (pointing/matching/etc.) is representable and selectable the same as any other", () => {
  const b = block({
    blockId: "b1",
    objectiveIds: ["obj-1"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "observed_strong", demonstrationType: "pointing" })],
  });
  const items = selectMasteryEligibleItems(draft([b]));
  assert.equal(items.length, 1);
});
