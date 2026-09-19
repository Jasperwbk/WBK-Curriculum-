import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { buildPublishedDayProjection, publishedDayDocId } from "./publishedDay";
import { HISTORICAL_FIGURE_CATALOG } from "./historicalFigureCatalog";
import type { LearningBlock, ProposedDay, ProposedDayDraft } from "../types";

function block(overrides: Partial<LearningBlock> = {}): LearningBlock {
  return {
    blockId: "b1",
    studentId: "student-1",
    subject: "math",
    title: "Fractions",
    objectiveIds: ["millaray-w1-math-1"],
    stage: "teach_model",
    estimatedMinutes: 20,
    required: true,
    completionState: "not_started",
    dependsOn: [],
    teacherLocked: false,
    order: 0,
    sourceQuarterCertificationId: "qcert-1",
    sourceWeeklyCertificationId: "wcert-1",
    ...overrides,
  };
}

function draft(overrides: Partial<ProposedDayDraft> = {}): ProposedDayDraft {
  return {
    title: "Day title",
    summary: "Day summary",
    planText: "Full plan text",
    itineraryMode: "flexible",
    learningBlocks: [block()],
    historicalFigureClosing: null,
    revision: 0,
    lastEditedByUid: "teacher-1",
    lastEditedAt: Timestamp.now(),
    ...overrides,
  };
}

function proposedDay(overrides: Partial<ProposedDay> = {}): ProposedDay {
  return {
    familyId: "family-1",
    studentId: "student-1",
    date: "2026-09-21",
    quarter: "q1",
    week: 1,
    dayType: "ordinary",
    dayDesignationId: null,
    governanceModeAtGeneration: "governed",
    sourceQuarterCertificationId: "qcert-1",
    sourceWeeklyCertificationId: "wcert-1",
    sourceSignature: "cert:wcert-1",
    status: "approved",
    proposalVersion: 1,
    supersedesProposalId: null,
    generatedAt: Timestamp.now(),
    generatedByUid: "teacher-1",
    title: "Original title",
    summary: "Original summary",
    planText: "Original plan text",
    jasperMessage: { generated: "Good morning, generated!" },
    suggestedItineraryMode: "flexible",
    learningBlocks: [block()],
    historicalFigureClosing: null,
    carryForwardNotes: [],
    draft: draft(),
    itineraryMode: "flexible",
    approvedByUid: "teacher-1",
    approvedAt: Timestamp.now(),
    ...overrides,
  };
}

test("publishedDayDocId matches the same (family, student, date) formula as evidencePacketDocId/studentProgressDocId", () => {
  assert.equal(publishedDayDocId("family-1", "student-1", "2026-09-21"), "family-1_student-1_2026-09-21");
});

test("the projection uses draft content (the final, teacher-approved version), not the frozen top-level original", () => {
  const day = proposedDay();
  const published = buildPublishedDayProjection(day, "day-1", Timestamp.now());
  assert.equal(published.title, "Day title");
  assert.equal(published.summary, "Day summary");
  assert.equal(published.planText, "Full plan text");
});

test("jasperMessage resolves to the teacher's edit when present, otherwise the generated original, otherwise null", () => {
  const edited = buildPublishedDayProjection(
    proposedDay({ draft: draft({ jasperMessageEdited: "Edited message" }) }),
    "day-1",
    Timestamp.now()
  );
  assert.equal(edited.jasperMessage, "Edited message");

  const generatedOnly = buildPublishedDayProjection(proposedDay(), "day-1", Timestamp.now());
  assert.equal(generatedOnly.jasperMessage, "Good morning, generated!");

  const neither = buildPublishedDayProjection(
    proposedDay({ jasperMessage: null }),
    "day-1",
    Timestamp.now()
  );
  assert.equal(neither.jasperMessage, null);
});

test("the published day exposes only the allowed top-level fields — never governance metadata (generatedByUid, sourceQuarterCertificationId, sourceSignature, approvedByUid, supersedesProposalId, blockAssessmentExclusions, dayAssessmentEligibility)", () => {
  const published = buildPublishedDayProjection(proposedDay(), "day-1", Timestamp.now());
  assert.deepEqual(
    [...Object.keys(published)].sort(),
    [
      "date",
      "familyId",
      "historicalFigureClosing",
      "itineraryMode",
      "jasperMessage",
      "learningBlocks",
      "planText",
      "proposalVersion",
      "proposedDayId",
      "publishedAt",
      "studentId",
      "summary",
      "title",
    ]
  );
});

test("each published learning block exposes only the allowed fields — never sourceQuarterCertificationId/sourceWeeklyCertificationId/studentId/completionState (the plan-time placeholder, not live progress)", () => {
  const published = buildPublishedDayProjection(proposedDay(), "day-1", Timestamp.now());
  const publishedBlock = published.learningBlocks[0];
  assert.deepEqual(
    [...Object.keys(publishedBlock)].sort(),
    ["blockId", "carriedForward", "dependsOn", "estimatedMinutes", "order", "required", "stage", "subject", "teacherLocked", "title"]
  );
});

test("a block's own notes/activityFormat pass through when present, and are simply absent (never fabricated) when not", () => {
  const withNotes = buildPublishedDayProjection(
    proposedDay({ draft: draft({ learningBlocks: [block({ notes: "Use the blue worksheet.", activityFormat: "printable" })] }) }),
    "day-1",
    Timestamp.now()
  );
  assert.equal(withNotes.learningBlocks[0].notes, "Use the blue worksheet.");
  assert.equal(withNotes.learningBlocks[0].activityFormat, "printable");

  const without = buildPublishedDayProjection(proposedDay(), "day-1", Timestamp.now());
  assert.equal("notes" in without.learningBlocks[0], false);
  assert.equal("activityFormat" in without.learningBlocks[0], false);
});

test("carriedForward is a plain boolean derived from presence, never the internal fromProposedDayId reference", () => {
  const carried = buildPublishedDayProjection(
    proposedDay({
      draft: draft({
        learningBlocks: [
          block({
            carryForward: { fromProposedDayId: "internal-day-id", fromDate: "2026-09-18", fromBlockId: "b0", reason: "Ran out of time yesterday." },
          }),
        ],
      }),
    }),
    "day-1",
    Timestamp.now()
  );
  assert.equal(carried.learningBlocks[0].carriedForward, true);
  assert.equal(carried.learningBlocks[0].carryForwardReason, "Ran out of time yesterday.");
  assert.equal("fromProposedDayId" in carried.learningBlocks[0], false);

  const notCarried = buildPublishedDayProjection(proposedDay(), "day-1", Timestamp.now());
  assert.equal(notCarried.learningBlocks[0].carriedForward, false);
});

test("historicalFigureClosing is null when the day has no closing routine (e.g. non-instructional)", () => {
  const published = buildPublishedDayProjection(proposedDay(), "day-1", Timestamp.now());
  assert.equal(published.historicalFigureClosing, null);
});

test("historicalFigureClosing honestly reports artworkAvailable — every current catalog entry has no approved printable art, so this is always false, never fabricated as true", () => {
  const figure = HISTORICAL_FIGURE_CATALOG[0];
  const published = buildPublishedDayProjection(
    proposedDay({
      draft: draft({
        historicalFigureClosing: {
          figureId: figure.id,
          selectionReason: "Ties to this week's theme.",
          artComplexityBand: "Band B",
          showAndTellPrompt: "Tell us one thing about them.",
          recallQuestion: "What did they do?",
          sourceVerificationStatus: "unverified",
        },
      }),
    }),
    "day-1",
    Timestamp.now()
  );
  assert.ok(published.historicalFigureClosing);
  assert.equal(published.historicalFigureClosing!.figureId, figure.id);
  assert.equal(published.historicalFigureClosing!.name, figure.name);
  assert.equal(published.historicalFigureClosing!.artworkAvailable, false);
  // Never exposes teacher-only selectionReason or sourceVerificationStatus internals.
  assert.equal("selectionReason" in published.historicalFigureClosing!, false);
});

test("a closing plan referencing a figureId no longer in the catalog degrades to null rather than throwing or fabricating a figure", () => {
  const published = buildPublishedDayProjection(
    proposedDay({
      draft: draft({
        historicalFigureClosing: {
          figureId: "hf-does-not-exist",
          selectionReason: "n/a",
          artComplexityBand: "Band B",
          showAndTellPrompt: "n/a",
          recallQuestion: "n/a",
          sourceVerificationStatus: "unverified",
        },
      }),
    }),
    "day-1",
    Timestamp.now()
  );
  assert.equal(published.historicalFigureClosing, null);
});
