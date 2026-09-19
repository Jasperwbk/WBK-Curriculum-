import type { Timestamp } from "firebase-admin/firestore";
import { HISTORICAL_FIGURE_CATALOG } from "./historicalFigureCatalog";
import { isArtworkApprovedForPrinting } from "./historicalFigureSelector";
import type { ProposedDay, PublishedDay, PublishedHistoricalFigureClosing, PublishedLearningBlock } from "../types";

/**
 * Student-safe published-day projection (build-order step 11, section 2) —
 * the ONE place that decides exactly which fields of an approved
 * ProposedDay a student is ever allowed to see. Deliberately explicit
 * field-by-field construction rather than a spread/pick of the source
 * object, so adding a new, possibly-sensitive field to ProposedDay in a
 * future step can never silently leak into this projection — it has to be
 * added here on purpose.
 *
 * Built from `approvedDay.draft` (the current/final content — by
 * approval time this already incorporates any teacher edit), never the
 * frozen top-level originals except where draft doesn't carry the
 * equivalent value (jasperMessage). Never includes: sourceQuarterCertificationId/
 * sourceWeeklyCertificationId (governance metadata), dayNotes/teacher
 * observations (don't exist at this stage anyway — those are
 * evidence-packet-only), generatedByUid/approvedByUid, blockAssessmentExclusions/
 * dayAssessmentEligibility (a teacher-only concern — see setAssessmentEligibility),
 * or supersedesProposalId/proposalVersion history beyond the one final version.
 */
export function buildPublishedDayProjection(
  approvedDay: ProposedDay,
  proposedDayId: string,
  approvedAt: Timestamp
): PublishedDay {
  const learningBlocks: PublishedLearningBlock[] = approvedDay.draft.learningBlocks.map((block) => ({
    blockId: block.blockId,
    subject: block.subject,
    title: block.title,
    stage: block.stage,
    estimatedMinutes: block.estimatedMinutes,
    required: block.required,
    order: block.order,
    dependsOn: block.dependsOn,
    teacherLocked: block.teacherLocked,
    ...(block.activityFormat ? { activityFormat: block.activityFormat } : {}),
    ...(block.notes ? { notes: block.notes } : {}),
    carriedForward: block.carryForward !== undefined,
    ...(block.carryForward?.reason ? { carryForwardReason: block.carryForward.reason } : {}),
  }));

  const closingPlan = approvedDay.draft.historicalFigureClosing;
  let historicalFigureClosing: PublishedHistoricalFigureClosing | null = null;
  if (closingPlan) {
    const figure = HISTORICAL_FIGURE_CATALOG.find((f) => f.id === closingPlan.figureId);
    // A missing catalog entry (id retired/renamed since generation) is
    // honestly represented as "no closing today" rather than a crash or a
    // fabricated figure — this should not happen in practice since figure
    // ids are never reused (see HistoricalFigure's doc comment), but a
    // published projection must never throw.
    if (figure) {
      historicalFigureClosing = {
        figureId: figure.id,
        name: figure.name,
        era: figure.era,
        briefBio: figure.briefBio,
        whyItMatters: figure.whyItMatters,
        artComplexityBand: closingPlan.artComplexityBand,
        showAndTellPrompt: closingPlan.showAndTellPrompt,
        recallQuestion: closingPlan.recallQuestion,
        artworkAvailable: isArtworkApprovedForPrinting(figure.artwork),
      };
    }
  }

  return {
    familyId: approvedDay.familyId,
    studentId: approvedDay.studentId,
    date: approvedDay.date,
    proposedDayId,
    proposalVersion: approvedDay.proposalVersion,
    itineraryMode: approvedDay.draft.itineraryMode,
    title: approvedDay.draft.title,
    summary: approvedDay.draft.summary,
    planText: approvedDay.draft.planText,
    jasperMessage: approvedDay.draft.jasperMessageEdited ?? approvedDay.jasperMessage?.generated ?? null,
    learningBlocks,
    historicalFigureClosing,
    publishedAt: approvedAt,
  };
}

/** Deterministic — one published projection per (family, student, date), same formula as evidencePacketStore.ts#evidencePacketDocId and identical id shape, so both collections key identically off a school day. */
export function publishedDayDocId(familyId: string, studentId: string, date: string): string {
  return `${familyId}_${studentId}_${date}`;
}
