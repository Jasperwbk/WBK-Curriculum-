import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { requireCaller, requireTeacher, requireSameFamily, type CallerContext } from "./util/auth";
import { createProposal, approveProposal } from "./approvals";
import { getSubjectType } from "./subjects";
import { getLatestProposedDay } from "./proposedDays";
import { evidencePacketDocId, getEvidencePacket } from "./curriculum/evidencePacketStore";
import { mergeBlockEdits } from "./curriculum/evidenceValidation";
import { checkDraftRevision } from "./curriculum/proposedDayLifecycle";
import { aggregateApprovedMinutesBySubject } from "./curriculum/evidenceHours";
import { applyEligibleEvidenceToMastery } from "./curriculum/evidenceMastery";
import type { EndOfDayEvidencePacket, EvidenceBlockEntry, LogEntry } from "./types";

/**
 * End-of-day evidence / completion / actual instructional hours
 * (build-order step 6) — the authoritative COMPLETION path, parallel to
 * proposedDays.ts's authoritative PLANNING path. See types.ts's
 * EndOfDayEvidencePacket doc comment for the full CORE AUTHORITY RULE
 * (a plan is never evidence merely because it was scheduled) and why
 * ProposedDay itself is never mutated by anything in this file.
 *
 * Lifecycle: openEvidencePacket (seed from an approved ProposedDay) ->
 * saveEvidencePacketDraft (any number of times, teacher records
 * completion/minutes/notes/evidence) -> approveEvidencePacket, which
 * atomically freezes the packet AND then (as two separate, individually
 * idempotent, best-effort side effects) posts official instructional
 * minutes to `logs` and applies eligible evidence to the mastery model.
 *
 * LEGACY HOUR COMPATIBILITY (requirement 5): this file is the ONLY thing
 * that ever writes a `logs` doc from packet data, and it only ever does
 * so AFTER a teacher has approved the packet — "only teacher-approved
 * actual instructional time becomes official" for this governed path.
 * The pre-existing manual/freeform logging flow (LogActivityPage ->
 * direct client write to `logs`, per firestore.rules) is completely
 * untouched: it keeps counting immediately, exactly as it always has,
 * and every log written before step 6 keeps counting under that same
 * rule forever — dashboard.ts#getActualHoursToDate is not changed at
 * all, so nothing "suddenly disappears" from a family's totals. A
 * teacher is expected to use ONE OR THE OTHER path for a given school
 * day; using both for the same day is a real, documented double-counting
 * risk this step does not attempt to reconcile automatically (see the
 * step 6 report's "conflicts/decisions discovered") — building that
 * reconciliation would be a second governance layer on top of an
 * already-working, unrelated legacy flow, which is exactly the kind of
 * unnecessary replacement of working compliance math the spec asks to
 * avoid.
 */

function hourLogDocId(packetId: string, subject: string): string {
  return `evidence_${packetId}_${subject}`;
}

interface OpenEvidencePacketRequest {
  familyId: string;
  studentId: string;
  date: string; // ISO "YYYY-MM-DD"
}

/**
 * Idempotent: if a packet already exists for this (family, student,
 * date) — open or approved — it's simply returned, never recreated or
 * overwritten. Can only be opened against an APPROVED ProposedDay (a
 * plan the teacher has already committed to); there's nothing to close
 * out for a proposal still in review.
 */
export const openEvidencePacket = onCall<OpenEvidencePacketRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId, studentId, date } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "studentId is required.");
  }
  if (!date || typeof date !== "string" || Number.isNaN(new Date(date).getTime())) {
    throw new HttpsError("invalid-argument", "A valid date is required.");
  }

  const existing = await getEvidencePacket(familyId, studentId, date);
  if (existing) {
    return { packetId: existing.id, created: false };
  }

  const latest = await getLatestProposedDay(familyId, studentId, date);
  if (!latest || latest.record.status !== "approved") {
    throw new HttpsError(
      "failed-precondition",
      "There is no approved proposed day for this student/date — closeout requires an approved plan."
    );
  }
  const plan = latest.record;

  const now = Timestamp.now();
  const blocks: EvidenceBlockEntry[] = plan.draft.learningBlocks.map((block) => ({
    blockId: block.blockId,
    subject: block.subject,
    title: block.title,
    required: block.required,
    objectiveIds: block.objectiveIds,
    plannedMinutes: block.estimatedMinutes,
    reportedMinutes: null,
    approvedMinutes: null,
    completionState: "not_started",
    assessmentEligible: plan.blockAssessmentExclusions?.[block.blockId]?.eligible ?? true,
    objectiveEvidence: [],
    sourceQuarterCertificationId: block.sourceQuarterCertificationId,
    sourceWeeklyCertificationId: block.sourceWeeklyCertificationId,
    ...(block.carryForward ? { carryForward: block.carryForward } : {}),
  }));

  const packet: EndOfDayEvidencePacket = {
    familyId,
    studentId,
    date,
    sourceProposedDayId: latest.id,
    sourceProposalVersion: plan.proposalVersion,
    status: "open",
    createdAt: now,
    createdByUid: caller.uid,
    draft: {
      blocks,
      dayAssessmentEligible: plan.dayAssessmentEligibility?.eligible ?? true,
      revision: 0,
      lastEditedByUid: caller.uid,
      lastEditedAt: now,
    },
  };

  const db = getFirestore();
  const id = evidencePacketDocId(familyId, studentId, date);
  const ref = db.collection("evidencePackets").doc(id);
  // Transactional create-if-absent — closes the race between the
  // getEvidencePacket check above and this write (two teachers opening
  // the same day's packet at once must not stomp on each other).
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return; // someone else opened it in the meantime — fine, idempotent
    tx.set(ref, packet);
  });

  return { packetId: id, created: true };
});

interface SaveEvidencePacketDraftRequest {
  packetId: string;
  expectedRevision: number;
  dayAssessmentEligible: boolean;
  dayNotes?: string;
  blocks: unknown;
}

/**
 * Same optimistic-concurrency shape as proposedDays.ts's
 * saveProposedDayDraft (checkDraftRevision, reused directly — it was
 * never ProposedDay-specific). Batch-friendly by design: the client
 * composes edits to every block locally and submits the whole set in one
 * call, matching requirement 14/15's "efficient, batch-style review."
 */
export const saveEvidencePacketDraft = onCall<SaveEvidencePacketDraftRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { packetId, expectedRevision, dayAssessmentEligible, dayNotes, blocks } = request.data ?? {};
  if (!packetId || typeof packetId !== "string") {
    throw new HttpsError("invalid-argument", "packetId is required.");
  }
  if (typeof expectedRevision !== "number" || expectedRevision < 0) {
    throw new HttpsError("invalid-argument", "expectedRevision is required.");
  }
  if (typeof dayAssessmentEligible !== "boolean") {
    throw new HttpsError("invalid-argument", "dayAssessmentEligible is required.");
  }
  if (dayNotes !== undefined && typeof dayNotes !== "string") {
    throw new HttpsError("invalid-argument", "dayNotes must be a string.");
  }

  const db = getFirestore();
  const ref = db.collection("evidencePackets").doc(packetId);
  const preSnap = await ref.get();
  if (!preSnap.exists) {
    throw new HttpsError("not-found", "No such evidence packet.");
  }
  const preDoc = preSnap.data() as EndOfDayEvidencePacket;
  requireSameFamily(caller, preDoc.familyId);
  if (preDoc.status !== "open") {
    throw new HttpsError("failed-precondition", "This packet is already approved — it can no longer be edited.");
  }

  let newRevision = -1;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "No such evidence packet.");
    }
    const doc = snap.data() as EndOfDayEvidencePacket;
    if (doc.status !== "open") {
      throw new HttpsError("failed-precondition", "This packet is already approved — it can no longer be edited.");
    }
    const revisionCheck = checkDraftRevision(doc.draft.revision, expectedRevision);
    if (!revisionCheck.ok) {
      throw new HttpsError(
        "failed-precondition",
        `Someone else saved changes since you last loaded this packet (current revision ` +
          `${revisionCheck.currentRevision}, expected ${expectedRevision}). Refresh and review the latest before saving again.`
      );
    }

    const now = Timestamp.now();
    const merged = mergeBlockEdits(blocks, doc.draft.blocks, caller.uid, now);
    if (!merged.ok) {
      throw new HttpsError("invalid-argument", merged.error);
    }

    newRevision = revisionCheck.nextRevision;
    tx.update(ref, {
      draft: {
        blocks: merged.blocks,
        dayAssessmentEligible,
        ...(dayNotes && dayNotes.trim() ? { dayNotes: dayNotes.trim() } : {}),
        revision: newRevision,
        lastEditedByUid: caller.uid,
        lastEditedAt: now,
      },
    });
  });

  return { revision: newRevision };
});

interface ApproveEvidencePacketPayload {
  packetId: string;
  familyId: string;
  studentId: string;
  expectedRevision: number;
}

/**
 * Freezes the packet (status -> approved, every block's approvedMinutes
 * set from its current reportedMinutes, never touched again) inside one
 * transaction — then, as two separate best-effort passes AFTER that
 * transaction has committed, posts official hours and applies eligible
 * evidence to mastery. Each pass is individually guarded by its own
 * `*PostedAt`/`*AppliedAt` timestamp so a retried call can never double-
 * post hours or double-apply mastery (requirement: "official hour
 * posting is idempotent").
 */
async function approveOnePacket(caller: CallerContext, packetId: string, expectedRevision: number): Promise<void> {
  const db = getFirestore();
  const ref = db.collection("evidencePackets").doc(packetId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No such evidence packet.");
  }
  const doc = snap.data() as EndOfDayEvidencePacket;
  requireSameFamily(caller, doc.familyId);

  if (doc.status === "approved") {
    // Already approved — safe to treat as a no-op UNLESS the side
    // effects haven't finished yet (a prior call's transaction committed
    // but the process died before the posting passes ran). Fall through
    // to the idempotent posting passes below rather than erroring, so a
    // retried approve call always converges.
  } else {
    const { proposalId } = await createProposal<ApproveEvidencePacketPayload>({
      // "hourApproval" has existed in the ProposalKind union since build-
      // order step 2 (Builder Guide §21) but had no real consumer until
      // now — this packet approval, the point where reported minutes
      // become official instructional hours, is exactly what it was
      // reserved for.
      kind: "hourApproval",
      familyId: doc.familyId,
      targetUserId: doc.studentId,
      proposedByUid: caller.uid,
      proposedByRole: "teacher",
      payload: { packetId, familyId: doc.familyId, studentId: doc.studentId, expectedRevision },
    });

    await approveProposal<ApproveEvidencePacketPayload>({
      proposalId,
      reviewerUid: caller.uid,
      commit: async (tx) => {
        const freshSnap = await tx.get(ref);
        const freshDoc = freshSnap.data() as EndOfDayEvidencePacket;
        if (freshDoc.status === "approved") return; // race with another approve call — nothing left to freeze
        const revisionCheck = checkDraftRevision(freshDoc.draft.revision, expectedRevision);
        if (!revisionCheck.ok) {
          throw new HttpsError(
            "failed-precondition",
            `A newer draft (revision ${revisionCheck.currentRevision}) was saved since you loaded this packet — ` +
              `review it before approving.`
          );
        }
        const frozenBlocks = freshDoc.draft.blocks.map((b) => ({ ...b, approvedMinutes: b.reportedMinutes ?? 0 }));
        tx.update(ref, {
          status: "approved",
          approvedByUid: caller.uid,
          approvedAt: Timestamp.now(),
          "draft.blocks": frozenBlocks,
        });
      },
    });
  }

  // --- Post-approval side effects: each independently idempotent. ---
  const postSnap = await ref.get();
  const approved = postSnap.data() as EndOfDayEvidencePacket;

  if (!approved.hoursPostedAt) {
    const bySubject = aggregateApprovedMinutesBySubject(approved.draft.blocks);
    const batch = db.batch();
    for (const [subject, minutes] of Object.entries(bySubject)) {
      const log: LogEntry = {
        familyId: approved.familyId,
        userId: approved.studentId,
        date: Timestamp.fromDate(new Date(approved.date)),
        subject: subject as LogEntry["subject"],
        subjectType: getSubjectType(subject),
        durationMinutes: minutes as number,
        location: "home",
        source: "curriculum",
        evidencePacketId: packetId,
      };
      batch.set(db.collection("logs").doc(hourLogDocId(packetId, subject)), log);
    }
    batch.update(ref, { hoursPostedAt: Timestamp.now() });
    await batch.commit();
  }

  const masterySnap = await ref.get();
  const forMastery = masterySnap.data() as EndOfDayEvidencePacket;
  if (!forMastery.masteryAppliedAt) {
    await applyEligibleEvidenceToMastery(forMastery.familyId, forMastery.studentId, forMastery.draft);
    await ref.update({ masteryAppliedAt: Timestamp.now() });
  }
}

interface ApproveEvidencePacketRequest {
  packetId: string;
  expectedRevision: number;
}

export const approveEvidencePacket = onCall<ApproveEvidencePacketRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { packetId, expectedRevision } = request.data ?? {};
  if (!packetId || typeof packetId !== "string") {
    throw new HttpsError("invalid-argument", "packetId is required.");
  }
  if (typeof expectedRevision !== "number" || expectedRevision < 0) {
    throw new HttpsError("invalid-argument", "expectedRevision is required.");
  }

  await approveOnePacket(caller, packetId, expectedRevision);
  return { packetId };
});

interface ApproveEvidencePacketsRequest {
  packets: { packetId: string; expectedRevision: number }[];
}

interface ApproveEvidencePacketsResultItem {
  packetId: string;
  ok: boolean;
  error?: string;
}

/**
 * Batch approval (requirement 15) — efficient for a teacher closing out
 * several children's packets at once, WITHOUT sacrificing per-student
 * auditability: each packet still goes through its own
 * createProposal/approveProposal pair (its own proposalId, its own audit
 * event), just invoked in one network round trip. One packet's failure
 * (a stale revision, e.g.) never blocks the others from approving.
 */
export const approveEvidencePackets = onCall<ApproveEvidencePacketsRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { packets } = request.data ?? {};
  if (!Array.isArray(packets) || packets.length === 0) {
    throw new HttpsError("invalid-argument", "packets is required and must be non-empty.");
  }

  const results: ApproveEvidencePacketsResultItem[] = await Promise.all(
    packets.map(async (p): Promise<ApproveEvidencePacketsResultItem> => {
      if (!p || typeof p.packetId !== "string" || typeof p.expectedRevision !== "number") {
        return { packetId: String(p?.packetId ?? "unknown"), ok: false, error: "Malformed packet entry." };
      }
      try {
        await approveOnePacket(caller, p.packetId, p.expectedRevision);
        return { packetId: p.packetId, ok: true };
      } catch (err) {
        const message = err instanceof HttpsError ? err.message : "Could not approve this packet.";
        return { packetId: p.packetId, ok: false, error: message };
      }
    })
  );

  return { results };
});
