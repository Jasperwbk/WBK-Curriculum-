import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { recordMasteryResult } from "../mastery";
import type { EndOfDayEvidencePacket, EvidencePacketDraft, EvidenceOutcome, Subject } from "../types";

/**
 * Bridges approved, eligible evidence into the EXISTING mastery model
 * (build-order step 6, requirement 9; hardened in step 6.1) —
 * mastery.ts's applyMasteryResult/recordMasteryResult (2-of-last-3 ->
 * mastered, 3-of-3 -> aced) are UNCHANGED by this file; this only
 * decides WHICH evidence items are even allowed to reach them, how a
 * richer outcome collapses into the boolean that function has always
 * taken, and — as of 6.1 — how a RETRY can never apply the same item
 * twice.
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

/**
 * A deterministic identity for one objectiveEvidence entry, stable
 * across every retry: the block's own id plus that item's position
 * within the block's objectiveEvidence array. Safe to recompute from
 * scratch every time (never persisted separately from the packet) —
 * once a packet is approved, `draft.blocks`/`objectiveEvidence` never
 * change again (saveEvidencePacketDraft refuses once status !== "open"),
 * so this identity is permanently stable from that point on, which is
 * the only point it's ever actually used (mastery is applied only after
 * approval).
 */
export function evidenceItemId(blockId: string, indexWithinBlock: number): string {
  return `${blockId}:${indexWithinBlock}`;
}

export interface MasteryEligibleItem {
  evidenceId: string;
  objectiveId: string;
  subject: Subject;
  skill: string;
  correct: boolean;
}

/**
 * Pure selection over an entire packet draft — every eligible, mappable
 * objectiveEvidence item across every block that hasn't already been
 * applied, ready to feed recordMasteryResult. `skill` uses the owning
 * block's title as a reasonable short label (the same role
 * WEEK1_OBJECTIVES.skill already plays) since not every objectiveId has
 * a hand-authored catalog entry to pull one from — see
 * curriculum/objectiveId.ts.
 *
 * `alreadyApplied` is the idempotency guard (build-order step 6.1,
 * requirement: "each approved evidence item can influence mastery at
 * most once"): a packet-level status flag alone can't protect against a
 * crash between individual mastery writes, so each item's own
 * evidenceItemId is checked here, individually, every time this is
 * called — including on a retry after a partial failure.
 */
export function selectMasteryEligibleItems(
  draft: EvidencePacketDraft,
  alreadyApplied: ReadonlySet<string> = new Set()
): MasteryEligibleItem[] {
  const items: MasteryEligibleItem[] = [];
  for (const block of draft.blocks) {
    block.objectiveEvidence.forEach((evidence, index) => {
      const evidenceId = evidenceItemId(block.blockId, index);
      if (alreadyApplied.has(evidenceId)) return;
      if (!isEvidenceEligibleForMastery(draft.dayAssessmentEligible, block.assessmentEligible, evidence.assessmentEligible)) {
        return;
      }
      const correct = mapOutcomeToMasteryBoolean(evidence.outcome);
      if (correct === null) return;
      items.push({ evidenceId, objectiveId: evidence.objectiveId, subject: block.subject, skill: block.title, correct });
    });
  }
  return items;
}

/**
 * I/O wrapper — applies eligible, not-yet-applied items one at a time,
 * re-reading the packet's `appliedMasteryEvidenceIds` fresh before each
 * one and persisting that item's id (via arrayUnion) IMMEDIATELY after
 * its recordMasteryResult call succeeds, before moving to the next. This
 * is what actually closes the crash window step 6 left open: if the
 * process dies after item 2 of 5, items 1-2 are durably marked applied
 * and will never be re-applied by a later retry — only items 3-5 remain
 * pending. Sequential by design (not Promise.all) — this packet has at
 * most a handful of blocks/evidence items, so the extra round trips are
 * irrelevant at this scale, and sequencing is what makes the "mark
 * immediately after success" guarantee meaningful.
 *
 * Not unit-tested itself (thin orchestration over the already-tested
 * pure selectMasteryEligibleItems plus already-existing Firestore
 * reads/writes); see the step 6.1 report's "not integration-tested"
 * section. The idempotency PROPERTY it depends on — that the same
 * evidenceId is never selected twice once recorded as applied — is
 * fully covered by selectMasteryEligibleItems's own tests.
 */
export async function applyEligibleEvidenceToMastery(
  ref: DocumentReference,
  familyId: string,
  studentId: string,
  draft: EvidencePacketDraft
): Promise<void> {
  for (;;) {
    const snap = await ref.get();
    const packet = snap.data() as EndOfDayEvidencePacket;
    const applied = new Set(packet.appliedMasteryEvidenceIds ?? []);
    const remaining = selectMasteryEligibleItems(draft, applied);
    if (remaining.length === 0) return;

    const item = remaining[0];
    await recordMasteryResult({
      familyId,
      userId: studentId,
      objectiveId: item.objectiveId,
      subject: item.subject,
      skill: item.skill,
      correct: item.correct,
    });
    // arrayUnion is atomic and idempotent at the Firestore level — safe
    // even if a concurrent reconcile call is racing this one, unlike a
    // plain replace built from the locally-read `applied` set.
    await ref.update({
      appliedMasteryEvidenceIds: FieldValue.arrayUnion(item.evidenceId),
    });
  }
}
