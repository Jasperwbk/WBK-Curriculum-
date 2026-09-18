import type { ItineraryMode, LearningBlock } from "../types";

/**
 * Pure "which blocks may this student start right now?" decision
 * (build-order step 5, requirement 5) — no I/O, so the UI's eventual
 * question is answerable without a database (see blockEligibility.test.ts).
 * Deliberately NOT a scheduling/workflow engine: it takes one day's
 * already-generated block list and today's itinerary mode, and returns a
 * flat eligibility verdict per block. Nothing here writes anything or
 * decides what to generate next.
 *
 * Flexible mode still enforces every rule below except strict ordering —
 * "flexible" means the student may choose AMONG the eligible set, never
 * that required work, prerequisites, or teacher locks can be bypassed.
 */

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

export function computeEligibleBlocks(
  blocks: readonly LearningBlock[],
  itineraryMode: ItineraryMode
): BlockEligibility[] {
  const completed = new Set(blocks.filter((b) => b.completionState === "completed").map((b) => b.blockId));
  const requiredBlocks = blocks.filter((b) => b.required);
  // Early completion (requirement 7) unlocks enrichment for THIS day only —
  // there is no code path here that reaches into another day's blocks, so
  // it structurally cannot unlock tomorrow's required work.
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
