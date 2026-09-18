import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { mergeBlockEdits } from "./evidenceValidation";
import type { EvidenceBlockEntry } from "../types";

const NOW = Timestamp.fromDate(new Date("2026-09-21T12:00:00Z"));
const CALLER = "teacher-uid-1";

function sourceBlock(overrides: Partial<EvidenceBlockEntry> & Pick<EvidenceBlockEntry, "blockId">): EvidenceBlockEntry {
  return {
    subject: "math",
    title: "Weighing produce",
    required: true,
    objectiveIds: ["millaray-w1-math-1"],
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

function validEdit(blockId: string, overrides: Record<string, unknown> = {}) {
  return {
    blockId,
    completionState: "completed",
    reportedMinutes: 18,
    assessmentEligible: true,
    ...overrides,
  };
}

test("a well-formed edit merges cleanly, keeping authoritative fields from the source block", () => {
  const sources = [sourceBlock({ blockId: "b1" })];
  const result = mergeBlockEdits([validEdit("b1")], sources, CALLER, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.blocks[0].subject, "math");
    assert.equal(result.blocks[0].title, "Weighing produce");
    assert.equal(result.blocks[0].plannedMinutes, 20);
    assert.equal(result.blocks[0].reportedMinutes, 18);
    assert.equal(result.blocks[0].completionState, "completed");
  }
});

test("client-supplied identity-bearing fields (subject/title/objectiveIds/plannedMinutes/source ids) are NEVER trusted, even if the raw edit tries to override them", () => {
  const sources = [sourceBlock({ blockId: "b1", subject: "math", plannedMinutes: 20 })];
  const raw = [
    {
      ...validEdit("b1"),
      subject: "science", // attempted override — must be ignored
      plannedMinutes: 999, // attempted override — must be ignored
      objectiveIds: ["fake-id"], // attempted override — must be ignored
    },
  ];
  const result = mergeBlockEdits(raw, sources, CALLER, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.blocks[0].subject, "math");
    assert.equal(result.blocks[0].plannedMinutes, 20);
    assert.deepEqual(result.blocks[0].objectiveIds, ["millaray-w1-math-1"]);
  }
});

test("wrong number of block edits is rejected", () => {
  const sources = [sourceBlock({ blockId: "b1" }), sourceBlock({ blockId: "b2" })];
  const result = mergeBlockEdits([validEdit("b1")], sources, CALLER, NOW);
  assert.equal(result.ok, false);
});

test("an edit for an unknown blockId is rejected", () => {
  const sources = [sourceBlock({ blockId: "b1" })];
  const result = mergeBlockEdits([validEdit("does-not-exist")], sources, CALLER, NOW);
  assert.equal(result.ok, false);
});

test("a duplicate edit for the same blockId is rejected", () => {
  const sources = [sourceBlock({ blockId: "b1" }), sourceBlock({ blockId: "b2" })];
  const result = mergeBlockEdits([validEdit("b1"), validEdit("b1")], sources, CALLER, NOW);
  assert.equal(result.ok, false);
});

test("invalid completionState is rejected", () => {
  const sources = [sourceBlock({ blockId: "b1" })];
  const result = mergeBlockEdits([validEdit("b1", { completionState: "done" })], sources, CALLER, NOW);
  assert.equal(result.ok, false);
});

test("negative reportedMinutes is rejected", () => {
  const sources = [sourceBlock({ blockId: "b1" })];
  const result = mergeBlockEdits([validEdit("b1", { reportedMinutes: -5 })], sources, CALLER, NOW);
  assert.equal(result.ok, false);
});

test("an excessively large reportedMinutes is clamped, not rejected", () => {
  const sources = [sourceBlock({ blockId: "b1" })];
  const result = mergeBlockEdits([validEdit("b1", { reportedMinutes: 99999 })], sources, CALLER, NOW);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.blocks[0].reportedMinutes, 480);
});

test("reportedMinutes: null is accepted (nothing reported yet)", () => {
  const sources = [sourceBlock({ blockId: "b1" })];
  const result = mergeBlockEdits([validEdit("b1", { reportedMinutes: null })], sources, CALLER, NOW);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.blocks[0].reportedMinutes, null);
});

test("completionState 'excused' requires a non-empty excusedReason", () => {
  const sources = [sourceBlock({ blockId: "b1" })];
  const missing = mergeBlockEdits([validEdit("b1", { completionState: "excused" })], sources, CALLER, NOW);
  assert.equal(missing.ok, false);
  const blank = mergeBlockEdits([validEdit("b1", { completionState: "excused", excusedReason: "   " })], sources, CALLER, NOW);
  assert.equal(blank.ok, false);
  const ok = mergeBlockEdits(
    [validEdit("b1", { completionState: "excused", excusedReason: "Sick day" })],
    sources,
    CALLER,
    NOW
  );
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.blocks[0].excusedReason, "Sick day");
});

test("a valid objectiveEvidence item is accepted, and recordedByUid/recordedAt are always server-set, never from the client", () => {
  const sources = [sourceBlock({ blockId: "b1", objectiveIds: ["obj-1"] })];
  const raw = [
    validEdit("b1", {
      objectiveEvidence: [
        {
          objectiveId: "obj-1",
          demonstrationType: "verbal_explanation",
          outcome: "correct",
          sourceType: "teacher_observation",
          observation: "Explained the concept clearly, no prompting.",
          assessmentEligible: true,
          recordedByUid: "someone-else", // attempted spoof — must be ignored
          recordedAt: "2020-01-01", // attempted spoof — must be ignored
        },
      ],
    }),
  ];
  const result = mergeBlockEdits(raw, sources, CALLER, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    const item = result.blocks[0].objectiveEvidence[0];
    assert.equal(item.recordedByUid, CALLER);
    assert.equal(item.recordedAt, NOW);
    assert.equal(item.outcome, "correct");
  }
});

test("an objectiveEvidence item referencing an objectiveId not on the block is rejected", () => {
  const sources = [sourceBlock({ blockId: "b1", objectiveIds: ["obj-1"] })];
  const raw = [
    validEdit("b1", {
      objectiveEvidence: [
        {
          objectiveId: "not-this-blocks-objective",
          demonstrationType: "verbal_explanation",
          outcome: "correct",
          sourceType: "teacher_observation",
          assessmentEligible: true,
        },
      ],
    }),
  ];
  const result = mergeBlockEdits(raw, sources, CALLER, NOW);
  assert.equal(result.ok, false);
});

test("Maizley-style demonstration types (pointing/matching/sorting/naming/physical_demonstration/guided_play) are all representable, no written test required", () => {
  const sources = [sourceBlock({ blockId: "b1", objectiveIds: ["obj-1"] })];
  for (const demonstrationType of ["pointing", "matching", "sorting", "naming", "physical_demonstration", "guided_play"]) {
    const result = mergeBlockEdits(
      [
        validEdit("b1", {
          objectiveEvidence: [
            {
              objectiveId: "obj-1",
              demonstrationType,
              outcome: "observed_strong",
              sourceType: "teacher_observation",
              assessmentEligible: true,
            },
          ],
        }),
      ],
      sources,
      CALLER,
      NOW
    );
    assert.equal(result.ok, true, `expected ${demonstrationType} to be valid`);
  }
});

test("an artifact reference is optional but validated when present", () => {
  const sources = [sourceBlock({ blockId: "b1", objectiveIds: ["obj-1"] })];
  const badArtifact = mergeBlockEdits(
    [
      validEdit("b1", {
        objectiveEvidence: [
          {
            objectiveId: "obj-1",
            demonstrationType: "written_response",
            outcome: "correct",
            sourceType: "worksheet",
            assessmentEligible: true,
            artifacts: [{ kind: "not_a_real_kind", description: "x" }],
          },
        ],
      }),
    ],
    sources,
    CALLER,
    NOW
  );
  assert.equal(badArtifact.ok, false);

  const goodArtifact = mergeBlockEdits(
    [
      validEdit("b1", {
        objectiveEvidence: [
          {
            objectiveId: "obj-1",
            demonstrationType: "written_response",
            outcome: "correct",
            sourceType: "worksheet",
            assessmentEligible: true,
            artifacts: [{ kind: "worksheet", description: "Fractions worksheet page 3" }],
          },
        ],
      }),
    ],
    sources,
    CALLER,
    NOW
  );
  assert.equal(goodArtifact.ok, true);
});

test("a photo/artifact is never required for routine schoolwork — omitting artifacts entirely is valid", () => {
  const sources = [sourceBlock({ blockId: "b1", objectiveIds: ["obj-1"] })];
  const result = mergeBlockEdits(
    [
      validEdit("b1", {
        objectiveEvidence: [
          {
            objectiveId: "obj-1",
            demonstrationType: "verbal_explanation",
            outcome: "correct",
            sourceType: "teacher_observation",
            assessmentEligible: true,
          },
        ],
      }),
    ],
    sources,
    CALLER,
    NOW
  );
  assert.equal(result.ok, true);
});
