import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { buildNextMasteryRecord, masteryRecordDocId } from "../mastery";
import type {
  EvidenceOutcome,
  EvidencePacketDraft,
  MasteryApplicationRecord,
  MasteryRecord,
  Subject,
} from "../types";

/**
 * Bridges approved, eligible evidence into the EXISTING mastery model
 * (build-order step 6, requirement 9; hardened in step 6.1, hardened again
 * in step 6.2) — mastery.ts's applyMasteryResult/buildNextMasteryRecord
 * (2-of-last-3 -> mastered, 3-of-3 -> aced) are UNCHANGED by this file;
 * this only decides WHICH evidence items are even allowed to reach them,
 * how a richer outcome collapses into the boolean that function has
 * always taken, and how a retry (or a concurrent retry) can never apply
 * the same item twice.
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
 * applied, ready to feed the mastery model. `skill` uses the owning
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
 * called — including on a retry after a partial failure. As of step 6.2
 * the caller (applyEligibleEvidenceToMastery) sources this set from the
 * masteryApplications collection rather than a packet-level array field —
 * this function itself is unaware of that change.
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

/** Deterministic id for the masteryApplications guard/traceability doc — see types.ts's MasteryApplicationRecord. */
export function masteryApplicationDocId(packetId: string, evidenceId: string): string {
  return `${packetId}_${evidenceId}`;
}

/**
 * Every evidenceId already applied for this packet, per the
 * masteryApplications collection (the exactly-once guard as of step
 * 6.2 — see that collection's doc comment in types.ts for why the prior
 * packet-level `appliedMasteryEvidenceIds` array was insufficient).
 * Firestore auto-indexes this single-field equality query; no composite
 * index is needed.
 */
export async function loadAppliedEvidenceIds(db: Firestore, packetId: string): Promise<Set<string>> {
  const snap = await db.collection("masteryApplications").where("packetId", "==", packetId).get();
  return new Set(snap.docs.map((d) => (d.data() as MasteryApplicationRecord).evidenceId));
}

/**
 * I/O wrapper — applies eligible, not-yet-applied items one at a time.
 *
 * STEP 6.2 FIX: step 6.1's version called `recordMasteryResult` (a write
 * to masteryRecords) and then, as a SEPARATE, later `ref.update` call,
 * marked the item applied via `FieldValue.arrayUnion` on the packet doc.
 * Those are two independent Firestore operations — a process crash
 * between them left the mastery record updated but the idempotency
 * marker not updated, so a subsequent retry/reconciliation would
 * re-select and re-apply the very same evidence item, double-counting it
 * in the 2-of-3 mastery window. An arrayUnion being atomic/idempotent
 * *by itself* never protected against that: the crash window was between
 * the TWO writes, not inside either one.
 *
 * The fix: for each eligible item, open ONE Firestore transaction that
 * reads the masteryApplications guard doc (`masteryApplicationDocId`) and
 * the masteryRecords doc, then — only if the guard doc doesn't already
 * exist — writes BOTH the next mastery record and the guard/traceability
 * doc together, in the same commit. Firestore transactions require all
 * reads before all writes, which this satisfies; the two writes commit
 * atomically (both land, or neither does), which closes the crash window
 * completely: there is no instant in time where the mastery effect has
 * landed but the marker hasn't, because they're the same commit.
 *
 * The guard doc's existence check inside the transaction (rather than
 * only in the `loadAppliedEvidenceIds` set computed before the loop) is
 * also what makes concurrent reconciliation attempts safe: if two calls
 * race for the same item, Firestore's optimistic-concurrency retry
 * ensures only one of them observes the guard doc absent and commits;
 * the other's transaction re-runs, observes it now present, and no-ops.
 * Firestore itself is the source of the "at most once" guarantee here,
 * not any client-side locking.
 *
 * `db` is taken from `ref.firestore` (the packet's own DocumentReference)
 * rather than a fresh top-level `getFirestore()` call, specifically so a
 * test can pass a fake DocumentReference backed by a fake Firestore and
 * exercise this real orchestration logic without a live emulator.
 */
export async function applyEligibleEvidenceToMastery(
  ref: DocumentReference,
  familyId: string,
  studentId: string,
  packetId: string,
  draft: EvidencePacketDraft
): Promise<void> {
  const db = ref.firestore;

  for (;;) {
    const applied = await loadAppliedEvidenceIds(db, packetId);
    const remaining = selectMasteryEligibleItems(draft, applied);
    if (remaining.length === 0) return;

    const item = remaining[0];
    const applicationRef = db.collection("masteryApplications").doc(masteryApplicationDocId(packetId, item.evidenceId));
    const masteryRef = db.collection("masteryRecords").doc(masteryRecordDocId(studentId, item.objectiveId));

    await db.runTransaction(async (tx) => {
      // All reads before all writes, per Firestore's transaction contract.
      const [applicationSnap, masterySnap] = await Promise.all([tx.get(applicationRef), tx.get(masteryRef)]);
      if (applicationSnap.exists) {
        // Already applied — by an earlier attempt, or by a concurrent
        // reconcile call that won the race. No-op: the outer loop will
        // see it in `applied` on its next pass and move on.
        return;
      }
      const existing = masterySnap.exists ? (masterySnap.data() as MasteryRecord) : null;
      const now = Timestamp.now();
      const nextRecord = buildNextMasteryRecord(
        existing,
        { familyId, userId: studentId, objectiveId: item.objectiveId, subject: item.subject, skill: item.skill, correct: item.correct },
        now
      );
      const applicationRecord: MasteryApplicationRecord = {
        packetId,
        evidenceId: item.evidenceId,
        objectiveId: item.objectiveId,
        subject: item.subject,
        userId: studentId,
        familyId,
        correct: item.correct,
        appliedAt: now,
      };
      tx.set(masteryRef, nextRecord);
      tx.set(applicationRef, applicationRecord);
    });
  }
}
