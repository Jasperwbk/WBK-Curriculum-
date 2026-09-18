import type { LearningBlock } from "../types";

/**
 * Pure carry-forward logic (build-order step 5, requirement 6; made
 * authoritative in step 6, requirement 10): incomplete required work
 * stays incomplete, is never auto-completed or erased, and MAY carry
 * forward into a future proposed day. Kept separate from proposedDays.ts's
 * Firestore I/O so both the "what counts as outstanding" and "how do we
 * tag a new block with where it came from" decisions are unit-testable
 * without a database (see carryForward.test.ts).
 *
 * computeOutstandingCarryForward below reads ProposedDay's own
 * LearningBlock[] — deliberately only "in_progress" counts, NOT
 * "not_started", because nothing ever writes real completion onto a
 * ProposedDay (build-order step 5's design: a plan is never mutated by
 * closeout — see types.ts's EndOfDayEvidencePacket doc comment). This
 * function's real replacement, once a day has actually been closed out,
 * is curriculum/evidencePacketStore.ts#computeCarryForwardFromPacket,
 * which DOES treat "not_started" as outstanding too (an evidence packet
 * is a genuine record of what happened, so "never touched" really does
 * mean incomplete there) — proposedDays.ts's loadOutstandingCarryForward
 * prefers that signal when an approved packet exists, falling back to
 * this function only when it doesn't (e.g. a day was approved but never
 * closed out yet).
 */
export function computeOutstandingCarryForward(blocks: readonly LearningBlock[]): LearningBlock[] {
  return blocks.filter((b) => b.required && b.completionState === "in_progress");
}

/** The minimal shape attachCarryForwardProvenance actually needs from an "outstanding" item — both LearningBlock and (step 6) EvidenceBlockEntry satisfy this structurally, so either can be passed as `outstanding` without an adapter. */
export interface CarryForwardSource {
  blockId: string;
  objectiveIds: readonly string[];
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
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
  outstanding: readonly CarryForwardSource[],
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
