import { recordMasteryResult } from "../mastery";
import type { EvidencePacketDraft, EvidenceOutcome, Subject } from "../types";

/**
 * Bridges approved, eligible evidence into the EXISTING mastery model
 * (build-order step 6, requirement 9) — mastery.ts's applyMasteryResult/
 * recordMasteryResult (2-of-last-3 -> mastered, 3-of-3 -> aced) are
 * UNCHANGED by this file; this only decides WHICH evidence items are
 * even allowed to reach them, and how a richer outcome collapses into
 * the boolean that function has always taken.
 */

/**
 * The existing mastery threshold only understands right/wrong. A richer
 * EvidenceOutcome collapses to that boolean when the result is
 * unambiguous; "partial" and "not_applicable" are preserved as real,
 * visible evidence in the packet, but deliberately do NOT move mastery
 * either way in this step — richer partial-credit mastery math is
 * exactly the kind of "current architecture cannot safely support this
 * yet" boundary the spec asks to document rather than force-fit.
 */
export function mapOutcomeToMasteryBoolean(outcome: EvidenceOutcome): boolean | null {
  switch (outcome) {
    case "correct":
    case "observed_strong":
      return true;
    case "incorrect":
    case "observed_weak":
      return false;
    default:
      return null; // "partial" | "not_applicable"
  }
}

/**
 * The three independent "Do Not Use for Assessment" granularities
 * (build-order step 6, requirement 7) combine with a simple AND — ALL
 * three must allow it for one piece of evidence to ever reach the
 * adaptive mastery window. Excluding at any level (day/block/result)
 * never erases the evidence itself; it only ever gates THIS function.
 */
export function isEvidenceEligibleForMastery(dayEligible: boolean, blockEligible: boolean, itemEligible: boolean): boolean {
  return dayEligible && blockEligible && itemEligible;
}

export interface MasteryEligibleItem {
  objectiveId: string;
  subject: Subject;
  skill: string;
  correct: boolean;
}

/**
 * Pure selection over an entire packet draft — every eligible, mappable
 * objectiveEvidence item across every block, ready to feed
 * recordMasteryResult. `skill` uses the owning block's title as a
 * reasonable short label (the same role WEEK1_OBJECTIVES.skill already
 * plays) since not every objectiveId has a hand-authored catalog entry
 * to pull one from — see curriculum/objectiveId.ts.
 */
export function selectMasteryEligibleItems(draft: EvidencePacketDraft): MasteryEligibleItem[] {
  const items: MasteryEligibleItem[] = [];
  for (const block of draft.blocks) {
    for (const evidence of block.objectiveEvidence) {
      if (!isEvidenceEligibleForMastery(draft.dayAssessmentEligible, block.assessmentEligible, evidence.assessmentEligible)) {
        continue;
      }
      const correct = mapOutcomeToMasteryBoolean(evidence.outcome);
      if (correct === null) continue;
      items.push({ objectiveId: evidence.objectiveId, subject: block.subject, skill: block.title, correct });
    }
  }
  return items;
}

/**
 * I/O wrapper — applies every eligible item from selectMasteryEligibleItems
 * via the existing, unchanged recordMasteryResult. Not unit-tested itself
 * (it's a thin loop over an already-tested pure selection plus an
 * already-existing, previously-verified Firestore write); see the step 6
 * report's "not integration-tested" section.
 */
export async function applyEligibleEvidenceToMastery(
  familyId: string,
  studentId: string,
  draft: EvidencePacketDraft
): Promise<void> {
  const items = selectMasteryEligibleItems(draft);
  await Promise.all(
    items.map((item) =>
      recordMasteryResult({
        familyId,
        userId: studentId,
        objectiveId: item.objectiveId,
        subject: item.subject,
        skill: item.skill,
        correct: item.correct,
      })
    )
  );
}
