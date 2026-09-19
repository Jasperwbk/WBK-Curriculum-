/**
 * Client-side mirror of functions/src/curriculum/blockEligibility.ts's
 * computeEligibleBlocks (build-order step 11, section 4) — same pure
 * "which blocks may this student start right now?" decision, ported
 * verbatim rather than re-derived, per the explicit instruction to reuse
 * the one eligibility engine rather than invent a second.
 *
 * functions/ and web/ are separate TS projects with no shared build, so
 * this is a manually-mirrored duplicate (same pattern as
 * lib/presentationIdentity.ts mirroring functions/src/identity/
 * presentationIdentity.ts). Unlike that mirror — a static data table that
 * a hardcoded-literal-equality test can lock in place — this is an
 * ALGORITHM, so there is no equivalent runtime parity proof available:
 * this repo has no web-side test runner (see lib/presentationIdentity.ts's
 * own comment and the step 9.1 report). The best available mitigation is
 * keeping this file byte-for-byte identical in logic to the functions-side
 * source, reviewed side by side, rather than a test asserting equality.
 *
 * Takes a PublishedLearningBlock (the student-safe projection — see
 * functions/src/curriculum/publishedDay.ts) merged with this student's own
 * live StudentBlockProgressState (see lib/studentProgress.ts's merge
 * helper) rather than the functions-side LearningBlock directly, since the
 * student client only ever has the published projection plus their own
 * progress record, never the teacher-only draft.
 */

export type ItineraryMode = "strict" | "flexible";
export type StudentBlockProgressState = "not_started" | "in_progress" | "completed";

export type EligibilityReason =
  | "eligible"
  | "already_completed"
  | "teacher_locked"
  | "prerequisite_incomplete"
  | "not_next_in_strict_order"
  | "enrichment_locked_until_required_complete";

export interface BlockEligibility {
  blockId: string;
  eligible: boolean;
  reason: EligibilityReason;
}

/** The minimal shape computeEligibleBlocks actually reads — a PublishedLearningBlock with its live completionState merged in. */
export interface EligibilityInputBlock {
  blockId: string;
  required: boolean;
  order: number;
  dependsOn: readonly { blockId: string }[];
  teacherLocked: boolean;
  completionState: StudentBlockProgressState;
}

export function computeEligibleBlocks(
  blocks: readonly EligibilityInputBlock[],
  itineraryMode: ItineraryMode
): BlockEligibility[] {
  const completed = new Set(blocks.filter((b) => b.completionState === "completed").map((b) => b.blockId));
  const requiredBlocks = blocks.filter((b) => b.required);
  // Early completion unlocks enrichment for THIS day only — there is no
  // code path here that reaches into another day's blocks, so it
  // structurally cannot unlock tomorrow's required work.
  const allRequiredComplete = requiredBlocks.length === 0 || requiredBlocks.every((b) => completed.has(b.blockId));
  const requiredInOrder = [...requiredBlocks].sort((a, b) => a.order - b.order);

  return blocks.map((block): BlockEligibility => {
    if (completed.has(block.blockId)) {
      return { blockId: block.blockId, eligible: false, reason: "already_completed" };
    }
    if (block.teacherLocked) {
      return { blockId: block.blockId, eligible: false, reason: "teacher_locked" };
    }
    const unmetDependency = block.dependsOn.find((dep) => !completed.has(dep.blockId));
    if (unmetDependency) {
      return { blockId: block.blockId, eligible: false, reason: "prerequisite_incomplete" };
    }

    if (!block.required) {
      return allRequiredComplete
        ? { blockId: block.blockId, eligible: true, reason: "eligible" }
        : { blockId: block.blockId, eligible: false, reason: "enrichment_locked_until_required_complete" };
    }

    if (itineraryMode === "strict") {
      const position = requiredInOrder.findIndex((b) => b.blockId === block.blockId);
      const earlierRequired = requiredInOrder.slice(0, position);
      const earlierAllComplete = earlierRequired.every((b) => completed.has(b.blockId));
      return earlierAllComplete
        ? { blockId: block.blockId, eligible: true, reason: "eligible" }
        : { blockId: block.blockId, eligible: false, reason: "not_next_in_strict_order" };
    }

    // Flexible + required + dependencies already satisfied: no ordering
    // constraint beyond that — the student may choose it now.
    return { blockId: block.blockId, eligible: true, reason: "eligible" };
  });
}
