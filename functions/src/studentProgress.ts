import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireCaller, requireOwnerOrTeacher } from "./util/auth";
import { isStudentBlockProgressState, studentProgressDocId, toPacketCompletionState } from "./curriculum/studentProgress";
import { evidencePacketDocId } from "./curriculum/evidencePacketStore";
import type { EndOfDayEvidencePacket, ProposedDay, StudentDayProgress } from "./types";

/**
 * Student progress (build-order step 11, sections 5/6): the ONLY way a
 * student's own block-completion signal is ever written. Never approves
 * hours, never touches evidence/mastery/assessment-eligibility, never
 * self-excuses (isStudentBlockProgressState structurally excludes
 * "excused" — see curriculum/studentProgress.ts), and never lets a
 * student act on anyone but themselves (requireOwnerOrTeacher — a teacher
 * may act on any student in their family, mirroring every other
 * self-or-teacher callable in this codebase; a student may only ever pass
 * their own uid).
 *
 * Authoritative identity/ownership is derived server-side from the
 * referenced ProposedDay record itself (admin SDK, bypasses rules) — the
 * client names a location (proposedDayId/blockId), never asserts
 * familyId/date/ownership directly. Writes into TWO places, both
 * idempotent and both structurally incapable of touching teacher-only
 * fields:
 *
 *   1. `studentBlockProgress/{family}_{student}_{date}` — always. This is
 *      what `openEvidencePacket` (evidencePackets.ts) later seeds a fresh
 *      packet's initial completionState from, for the common ordering
 *      (school day happens, THEN the teacher opens the packet that
 *      evening).
 *   2. The matching EndOfDayEvidencePacket's `draft.blocks[blockId]
 *      .completionState`, ONLY when a packet already exists and is still
 *      "open" — for the less common ordering (a teacher opened the packet
 *      ahead of time). Uses the exact same optimistic-concurrency
 *      revision bump as saveEvidencePacketDraft, so a teacher's
 *      concurrently-loaded draft correctly detects the change rather than
 *      silently losing it, instead of writing around that mechanism.
 *      Every other field on the packet (reportedMinutes, objectiveEvidence,
 *      assessmentEligible, notes) is left byte-for-byte untouched — a
 *      student's write can only ever change completionState.
 */

interface UpdateBlockProgressRequest {
  studentId: string;
  proposedDayId: string;
  blockId: string;
  state: string;
}

export const updateBlockProgress = onCall<UpdateBlockProgressRequest>(async (request) => {
  const caller = await requireCaller(request);

  const studentId = request.data?.studentId;
  if (typeof studentId !== "string" || studentId.length === 0) {
    throw new HttpsError("invalid-argument", "studentId is required.");
  }
  requireOwnerOrTeacher(caller, studentId);

  const proposedDayId = request.data?.proposedDayId;
  const blockId = request.data?.blockId;
  const state = request.data?.state;
  if (typeof proposedDayId !== "string" || proposedDayId.length === 0) {
    throw new HttpsError("invalid-argument", "proposedDayId is required.");
  }
  if (typeof blockId !== "string" || blockId.length === 0) {
    throw new HttpsError("invalid-argument", "blockId is required.");
  }
  if (!isStudentBlockProgressState(state)) {
    throw new HttpsError("invalid-argument", 'state must be one of: "not_started", "in_progress", "completed".');
  }

  const db = getFirestore();
  const daySnap = await db.collection("proposedDays").doc(proposedDayId).get();
  if (!daySnap.exists) {
    throw new HttpsError("not-found", "No such proposed day.");
  }
  const day = daySnap.data() as ProposedDay;
  if (day.familyId !== caller.profile.familyId) {
    throw new HttpsError("permission-denied", "That day belongs to a different family.");
  }
  if (day.studentId !== studentId) {
    throw new HttpsError("invalid-argument", "That day does not belong to this student.");
  }
  if (day.status !== "approved") {
    throw new HttpsError("failed-precondition", "Progress can only be recorded against an approved day.");
  }
  if (!day.draft.learningBlocks.some((b) => b.blockId === blockId)) {
    throw new HttpsError("invalid-argument", `No such block "${blockId}" on this day.`);
  }

  const now = Timestamp.now();
  const progressRef = db
    .collection("studentBlockProgress")
    .doc(studentProgressDocId(day.familyId, studentId, day.date));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(progressRef);
    const existing = snap.exists ? (snap.data() as StudentDayProgress) : null;
    const progress: StudentDayProgress = {
      familyId: day.familyId,
      studentId,
      date: day.date,
      proposedDayId,
      blocks: { ...(existing?.blocks ?? {}), [blockId]: { state, updatedAt: now } },
      updatedAt: now,
    };
    tx.set(progressRef, progress);
  });

  // Mirror into an already-open packet, if one exists — the packet is the
  // teacher's editable working copy once opened, so a student's later
  // update while it's open should still show up there rather than only in
  // studentBlockProgress (which openEvidencePacket only ever reads at
  // OPEN time, not afterward).
  const packetRef = db.collection("evidencePackets").doc(evidencePacketDocId(day.familyId, studentId, day.date));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(packetRef);
    if (!snap.exists) return;
    const packet = snap.data() as EndOfDayEvidencePacket;
    if (packet.status !== "open") return;
    const blockIndex = packet.draft.blocks.findIndex((b) => b.blockId === blockId);
    if (blockIndex === -1) return;

    // Bumps the revision counter (this transaction's own fresh read makes
    // that safe without a client-supplied expectedRevision to compare
    // against) so a teacher's concurrently-loaded saveEvidencePacketDraft
    // call correctly detects the change via its own optimistic-concurrency
    // check, instead of silently overwriting or being overwritten.
    const nextBlocks = packet.draft.blocks.map((b, i) =>
      i === blockIndex ? { ...b, completionState: toPacketCompletionState(state) } : b
    );
    tx.update(packetRef, {
      "draft.blocks": nextBlocks,
      "draft.revision": packet.draft.revision + 1,
      "draft.lastEditedByUid": caller.uid,
      "draft.lastEditedAt": now,
    });
  });

  return { studentId, blockId, state };
});
