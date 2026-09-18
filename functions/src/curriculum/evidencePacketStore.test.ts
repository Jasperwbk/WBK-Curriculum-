import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCarryForwardFromPacket, evidencePacketDocId } from "./evidencePacketStore";
import type { EvidenceBlockEntry } from "../types";

function entry(overrides: Partial<EvidenceBlockEntry> & Pick<EvidenceBlockEntry, "blockId">): EvidenceBlockEntry {
  return {
    subject: "math",
    title: "Block",
    required: true,
    objectiveIds: [],
    plannedMinutes: 20,
    reportedMinutes: null,
    approvedMinutes: null,
    completionState: "not_started",
    assessmentEligible: true,
    objectiveEvidence: [],
    sourceQuarterCertificationId: "qc-1",
    sourceWeeklyCertificationId: "wc-1",
    ...overrides,
  };
}

test("evidencePacketDocId is deterministic for the same inputs", () => {
  const a = evidencePacketDocId("fam-1", "stu-1", "2026-09-21");
  const b = evidencePacketDocId("fam-1", "stu-1", "2026-09-21");
  assert.equal(a, b);
});

test("evidencePacketDocId differs when any one input differs", () => {
  const base = evidencePacketDocId("fam-1", "stu-1", "2026-09-21");
  assert.notEqual(evidencePacketDocId("fam-2", "stu-1", "2026-09-21"), base);
  assert.notEqual(evidencePacketDocId("fam-1", "stu-2", "2026-09-21"), base);
  assert.notEqual(evidencePacketDocId("fam-1", "stu-1", "2026-09-22"), base);
});

test("required not_started becomes a carry-forward candidate after approved closeout", () => {
  const blocks = [entry({ blockId: "b1", required: true, completionState: "not_started" })];
  const outstanding = computeCarryForwardFromPacket(blocks);
  assert.equal(outstanding.length, 1);
  assert.equal(outstanding[0].blockId, "b1");
});

test("required in_progress becomes a carry-forward candidate", () => {
  const blocks = [entry({ blockId: "b1", required: true, completionState: "in_progress" })];
  assert.equal(computeCarryForwardFromPacket(blocks).length, 1);
});

test("a completed required block does NOT become a carry-forward candidate", () => {
  const blocks = [entry({ blockId: "b1", required: true, completionState: "completed" })];
  assert.deepEqual(computeCarryForwardFromPacket(blocks), []);
});

test("a teacher-excused required block does NOT become a carry-forward candidate", () => {
  const blocks = [
    entry({ blockId: "b1", required: true, completionState: "excused", excusedReason: "Sick day, doctor visit" }),
  ];
  assert.deepEqual(computeCarryForwardFromPacket(blocks), []);
});

test("enrichment (required:false) never carries forward, regardless of completion state", () => {
  const blocks = [entry({ blockId: "b1", required: false, completionState: "not_started" })];
  assert.deepEqual(computeCarryForwardFromPacket(blocks), []);
});

test("a mix of blocks returns only the genuinely outstanding ones", () => {
  const blocks = [
    entry({ blockId: "done", required: true, completionState: "completed" }),
    entry({ blockId: "excused", required: true, completionState: "excused" }),
    entry({ blockId: "todo", required: true, completionState: "not_started" }),
    entry({ blockId: "partial", required: true, completionState: "in_progress" }),
    entry({ blockId: "bonus", required: false, completionState: "not_started" }),
  ];
  const outstanding = computeCarryForwardFromPacket(blocks).map((b) => b.blockId);
  assert.deepEqual(outstanding.sort(), ["partial", "todo"]);
});
