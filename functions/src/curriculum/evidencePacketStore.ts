import { getFirestore } from "firebase-admin/firestore";
import type { EndOfDayEvidencePacket, EvidenceBlockEntry } from "../types";

/**
 * Firestore access for EndOfDayEvidencePacket (build-order step 6) — kept
 * in its own module, separate from both evidencePackets.ts (the
 * callables) and proposedDays.ts, specifically to avoid a circular
 * import: evidencePackets.ts needs proposedDays.ts's getLatestProposedDay
 * (to open a packet against the source plan), and proposedDays.ts needs
 * this file's lookups (to feed carry-forward into the next generation) —
 * if either callables file imported the other directly, that would be
 * circular. Both are safe to import from here instead.
 */

/** Deterministic — a packet is teacher-authored once per (family, student, date), never AI-regenerated, so there's nothing to version; opening twice is naturally idempotent by construction. */
export function evidencePacketDocId(familyId: string, studentId: string, date: string): string {
  return `${familyId}_${studentId}_${date}`;
}

/** Exact point lookup, any status — used by evidencePackets.ts's callables (open/save/approve all act on one specific day). */
export async function getEvidencePacket(
  familyId: string,
  studentId: string,
  date: string
): Promise<{ id: string; record: EndOfDayEvidencePacket } | null> {
  const db = getFirestore();
  const id = evidencePacketDocId(familyId, studentId, date);
  const snap = await db.collection("evidencePackets").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, record: snap.data() as EndOfDayEvidencePacket };
}

/**
 * The most recent APPROVED packet strictly before `beforeDate` for this
 * student — used by proposedDays.ts's carry-forward lookup, mirroring
 * the same (familyId, studentId, status, date desc) query shape as
 * proposedDays.ts's own loadOutstandingCarryForward from step 5.
 */
export async function loadMostRecentApprovedEvidencePacketBefore(
  familyId: string,
  studentId: string,
  beforeDate: string
): Promise<{ id: string; record: EndOfDayEvidencePacket } | null> {
  const db = getFirestore();
  const snap = await db
    .collection("evidencePackets")
    .where("familyId", "==", familyId)
    .where("studentId", "==", studentId)
    .where("status", "==", "approved")
    .where("date", "<", beforeDate)
    .orderBy("date", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, record: doc.data() as EndOfDayEvidencePacket };
}

/**
 * Pure (build-order step 6, requirement 10 — "carry-forward becomes real
 * here"): once a day has actually been closed out, a required block that
 * is NOT "completed" and NOT "excused" is a real carry-forward candidate
 * — this now includes "not_started" (unlike step 5's
 * curriculum/carryForward.ts#computeOutstandingCarryForward, which only
 * ever sees ProposedDay's own blocks and deliberately excluded
 * not_started there, since nothing ever wrote anything else onto a
 * plan). An evidence packet is a genuine record of what actually
 * happened, so "never touched" here really does mean incomplete.
 * "excused" is excluded on purpose — a teacher explicitly deciding not
 * to hold a student to a block is exactly the "unless teacher explicitly
 * excuses/removes it" carve-out from the spec.
 */
export function computeCarryForwardFromPacket(blocks: readonly EvidenceBlockEntry[]): EvidenceBlockEntry[] {
  return blocks.filter(
    (b) => b.required && (b.completionState === "not_started" || b.completionState === "in_progress")
  );
}
