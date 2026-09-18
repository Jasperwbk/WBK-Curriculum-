import { getFirestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { AuditEvent, Proposal, ProposalKind, Role } from "./types";

/**
 * Generalized teacher-approval primitive (Builder Guide §21): proposal ->
 * pending review -> teacher edit/approve/reject -> committed version ->
 * audit event. A shared `proposals/{id}` + `auditEvents/{id}` pair of
 * collections, plus these three helpers, that any feature-specific
 * callable can build on rather than inventing its own ad hoc review state
 * (as day-plan save, extracurricular confirm, and placement-submission
 * review each currently do independently).
 *
 * This module only manages the proposal's own lifecycle and audit trail.
 * The actual domain-specific committed document(s) — a certified quarter,
 * a published day plan, whatever — are written by the caller-supplied
 * `commit()` callback in approveProposal, inside the same transaction, so
 * the status flip and the real write either both happen or neither does.
 */

interface CreateProposalParams<T> {
  kind: ProposalKind;
  familyId: string;
  targetUserId?: string;
  proposedByUid: string;
  proposedByRole: Role;
  payload: T;
}

export async function createProposal<T>(
  params: CreateProposalParams<T>
): Promise<{ proposalId: string }> {
  const db = getFirestore();
  const proposalRef = db.collection("proposals").doc();
  const auditRef = db.collection("auditEvents").doc();
  const now = Timestamp.now();

  const proposal: Proposal<T> = {
    kind: params.kind,
    familyId: params.familyId,
    targetUserId: params.targetUserId ?? null,
    status: "pending",
    payload: params.payload,
    proposedByUid: params.proposedByUid,
    proposedByRole: params.proposedByRole,
    proposedAt: now,
  };
  const audit: AuditEvent = {
    kind: params.kind,
    action: "proposed",
    proposalId: proposalRef.id,
    familyId: params.familyId,
    actorUid: params.proposedByUid,
    actorRole: params.proposedByRole,
    at: now,
    summary: `Proposed ${params.kind}`,
  };

  await db.runTransaction(async (tx) => {
    tx.set(proposalRef, proposal);
    tx.set(auditRef, audit);
  });

  return { proposalId: proposalRef.id };
}

interface ApproveProposalParams<T> {
  proposalId: string;
  reviewerUid: string;
  /** Present only when the teacher edited the payload before approving. */
  editedPayload?: T;
  /**
   * Writes whatever committed document(s) this proposal kind produces.
   * Runs inside the same transaction as the status update — do any reads
   * this needs before any writes (Firestore transactions require all
   * reads before all writes), since the proposal doc itself is already
   * read before this is called. May be async (e.g. a fresh tx.get() of
   * its own target document, to re-verify a concurrency check right
   * before writing) — it's awaited by the caller either way, so a plain
   * synchronous commit works exactly as before.
   */
  commit: (tx: Transaction, payload: T) => void | Promise<void>;
}

/** Approves a pending proposal: commits its payload and marks it approved, atomically. */
export async function approveProposal<T>(params: ApproveProposalParams<T>): Promise<void> {
  const db = getFirestore();
  const proposalRef = db.collection("proposals").doc(params.proposalId);
  const auditRef = db.collection("auditEvents").doc();
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(proposalRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "No such proposal.");
    }
    const proposal = snap.data() as Proposal<T>;
    if (proposal.status !== "pending") {
      throw new HttpsError("failed-precondition", `Proposal is already ${proposal.status}.`);
    }

    const wasEdited = params.editedPayload !== undefined;
    const finalPayload = wasEdited ? (params.editedPayload as T) : proposal.payload;
    await params.commit(tx, finalPayload);

    tx.update(proposalRef, {
      status: "approved",
      reviewedByUid: params.reviewerUid,
      reviewedAt: now,
    });
    const audit: AuditEvent = {
      kind: proposal.kind,
      action: "approved",
      proposalId: params.proposalId,
      familyId: proposal.familyId,
      actorUid: params.reviewerUid,
      actorRole: "teacher",
      at: now,
      summary: wasEdited
        ? `Approved ${proposal.kind} (edited before approval)`
        : `Approved ${proposal.kind}`,
    };
    tx.set(auditRef, audit);
  });
}

interface RejectProposalParams {
  proposalId: string;
  reviewerUid: string;
  reason?: string;
}

/** Rejects a pending proposal — no committed document is ever written. */
export async function rejectProposal(params: RejectProposalParams): Promise<void> {
  const db = getFirestore();
  const proposalRef = db.collection("proposals").doc(params.proposalId);
  const auditRef = db.collection("auditEvents").doc();
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(proposalRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "No such proposal.");
    }
    const proposal = snap.data() as Proposal<unknown>;
    if (proposal.status !== "pending") {
      throw new HttpsError("failed-precondition", `Proposal is already ${proposal.status}.`);
    }

    tx.update(proposalRef, {
      status: "rejected",
      reviewedByUid: params.reviewerUid,
      reviewedAt: now,
    });
    const audit: AuditEvent = {
      kind: proposal.kind,
      action: "rejected",
      proposalId: params.proposalId,
      familyId: proposal.familyId,
      actorUid: params.reviewerUid,
      actorRole: "teacher",
      at: now,
      summary: params.reason ? `Rejected ${proposal.kind}: ${params.reason}` : `Rejected ${proposal.kind}`,
    };
    tx.set(auditRef, audit);
  });
}
