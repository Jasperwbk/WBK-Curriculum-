import type { LearningBlock } from "../types";

/**
 * Pure carry-forward logic (build-order step 5, requirement 6): incomplete
 * required work stays incomplete, is never auto-completed or erased, and
 * MAY carry forward into a future proposed day. Kept separate from
 * proposedDays.ts's Firestore I/O so both the "what counts as outstanding"
 * and "how do we tag a new block with where it came from" decisions are
 * unit-testable without a database (see carryForward.test.ts).
 *
 * Deliberately only "in_progress" (started but not finished) counts as
 * outstanding — NOT "not_started". Nothing in step 5 (or step 4/4.1) ever
 * writes anything but "not_started" to a block's completionState (there is
 * no student "day of" execution UI yet, so nothing ever records that a
 * block was actually attempted) — treating "not_started" as "incomplete,
 * please carry forward" would mean EVERY required block from every
 * approved day gets flagged forever, which is actively wrong, not just
 * unused. "in_progress" only starts being written once step 6's
 * end-of-day evidence packet exists, at which point this function starts
 * doing real work; until then it always returns an empty array, which is
 * the correct, safe behavior today — see the step 5 report.
 */
export function computeOutstandingCarryForward(blocks: readonly LearningBlock[]): LearningBlock[] {
  return blocks.filter((b) => b.required && b.completionState === "in_progress");
}

/**
 * Tags any of a newly-generated day's blocks whose objectiveIds overlap an
 * outstanding block's objectiveIds with that block's carry-forward
 * provenance — pure matching by shared objective identity, never by text
 * similarity. A block with no overlap is returned unchanged. Preserves the
 * carried block's ORIGINAL source certification ids (not today's), since
 * the work being carried is traceable to when it was actually assigned,
 * not to today's certification.
 */
export function attachCarryForwardProvenance(
  newBlocks: readonly LearningBlock[],
  outstanding: readonly LearningBlock[],
  fromProposedDayId: string,
  fromDate: string
): LearningBlock[] {
  if (outstanding.length === 0) return [...newBlocks];
  return newBlocks.map((block) => {
    const match = outstanding.find((o) => o.objectiveIds.some((id) => block.objectiveIds.includes(id)));
    if (!match) return block;
    return {
      ...block,
      sourceQuarterCertificationId: match.sourceQuarterCertificationId,
      sourceWeeklyCertificationId: match.sourceWeeklyCertificationId,
      carryForward: {
        fromProposedDayId,
        fromDate,
        fromBlockId: match.blockId,
        reason: `Carried forward — not completed on ${fromDate}.`,
      },
    };
  });
}
