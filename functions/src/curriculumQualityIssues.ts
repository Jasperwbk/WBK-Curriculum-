import { getFirestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireCaller, requireTeacher, requireSameFamily } from "./util/auth";
import {
  isCurriculumQualityIssueCategory,
  isCurriculumQualityIssueSeverity,
  isCurriculumQualityResolutionAction,
  resolveContentVersionReference,
} from "./curriculum/curriculumQuality";
import type {
  CurriculumQualityIssue,
  CurriculumQualityIssueReference,
  HelpRequest,
  Role,
  UserProfile,
} from "./types";

/**
 * Curriculum Quality Feedback Queue (build-order step 10) — for suspected
 * DEFECTS in curriculum content itself, structurally separate from
 * Ask-a-Teacher (identity/helpRequests.ts) and from certificationGate.ts's
 * "Curriculum Assistance Required" blocked_missing state (absent content,
 * not defective content). Teacher-only end to end: creation, quarantine,
 * resolution, and release are all requireTeacher-gated callables — see
 * firestore.rules' curriculumQualityIssues block for why students can
 * never read this collection at all (section 12: they surface problems
 * through Ask-a-Teacher; a teacher decides whether a quality record gets
 * created — never automatic).
 */

const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_NOTE_LENGTH = 2000;

export function sanitizeDescription(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "description must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new HttpsError("invalid-argument", "description must not be empty.");
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new HttpsError("invalid-argument", `description is too long (${MAX_DESCRIPTION_LENGTH} character max).`);
  }
  return trimmed;
}

export function sanitizeOptionalNote(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "note must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new HttpsError("invalid-argument", `note is too long (${MAX_NOTE_LENGTH} character max).`);
  }
  return trimmed;
}

/** Only the 5 known reference keys are ever kept — never a client-supplied familyId, and never raw curriculum content. */
export function sanitizeReference(raw: unknown): CurriculumQualityIssueReference {
  if (typeof raw !== "object" || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const reference: CurriculumQualityIssueReference = {};
  for (const key of ["studentId", "proposedDayId", "blockId", "objectiveId", "helpRequestId"] as const) {
    if (typeof input[key] === "string" && (input[key] as string).length > 0) {
      reference[key] = input[key] as string;
    }
  }
  return reference;
}

async function writeAuditEvent(params: {
  action: "created" | "quarantined" | "quarantineReleased" | "resolved" | "severityChanged";
  issueId: string;
  familyId: string;
  actorUid: string;
  actorRole: Role;
  summary: string;
}): Promise<void> {
  await getFirestore().collection("auditEvents").doc().set({
    kind: "curriculumQualityIssue",
    action: params.action,
    proposalId: params.issueId,
    familyId: params.familyId,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    at: Timestamp.now(),
    summary: params.summary,
  });
}

async function loadIssueForFamily(
  tx: Transaction,
  issueId: string,
  callerFamilyId: string
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: CurriculumQualityIssue }> {
  const ref = getFirestore().collection("curriculumQualityIssues").doc(issueId);
  const snap = await tx.get(ref);
  if (!snap.exists) {
    throw new HttpsError("not-found", "No such curriculum quality issue.");
  }
  const data = snap.data() as CurriculumQualityIssue;
  if (data.familyId !== callerFamilyId) {
    throw new HttpsError("permission-denied", "That issue belongs to a different family.");
  }
  return { ref, data };
}

interface CreateQualityIssueRequest {
  category: string;
  severity: string;
  description: string;
  reference?: unknown;
  contentLocation?: { kidKey?: unknown; quarter?: unknown; week?: unknown };
}

/**
 * Raises a new curriculum quality issue. Teacher-only — this is never
 * created automatically from a student's help request (section 6: "the
 * teacher makes that determination"); a teacher who decides a help
 * request actually reveals a curriculum defect calls this explicitly,
 * optionally passing `reference.helpRequestId` to link the two records
 * (never merging or converting the help request itself).
 */
export const createQualityIssue = onCall<CreateQualityIssueRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);
  const familyId = caller.profile.familyId;

  const category = request.data?.category;
  const severity = request.data?.severity;
  if (!isCurriculumQualityIssueCategory(category)) {
    throw new HttpsError("invalid-argument", "category is invalid.");
  }
  if (!isCurriculumQualityIssueSeverity(severity)) {
    throw new HttpsError("invalid-argument", "severity is invalid.");
  }
  const description = sanitizeDescription(request.data?.description);
  const reference = sanitizeReference(request.data?.reference);

  const db = getFirestore();

  // A referenced help request is never mutated or auto-converted — only
  // read, and only to borrow its own reference/studentId when the
  // teacher's call didn't already specify them (section 6's "leads into"
  // workflow).
  if (reference.helpRequestId) {
    const helpSnap = await db.collection("helpRequests").doc(reference.helpRequestId).get();
    if (!helpSnap.exists) {
      throw new HttpsError("not-found", "No such help request.");
    }
    const helpRequest = helpSnap.data() as HelpRequest;
    requireSameFamily(caller, helpRequest.familyId);
    reference.studentId ??= helpRequest.studentId;
    reference.proposedDayId ??= helpRequest.reference.proposedDayId;
    reference.blockId ??= helpRequest.reference.blockId;
    reference.objectiveId ??= helpRequest.reference.objectiveId;
  }

  if (reference.studentId) {
    const studentSnap = await db.collection("users").doc(reference.studentId).get();
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "No such student.");
    }
    requireSameFamily(caller, (studentSnap.data() as UserProfile).familyId);
  }

  const contentVersion = await resolveContentVersionReference({
    familyId,
    proposedDayId: reference.proposedDayId,
    contentLocation: request.data?.contentLocation,
  });

  const now = Timestamp.now();
  const issue: CurriculumQualityIssue = {
    familyId,
    reporterUid: caller.uid,
    reference,
    contentVersion,
    category,
    severity,
    description,
    status: "open",
    createdAt: now,
    updatedAt: now,
    quarantine: null,
  };
  const ref = await db.collection("curriculumQualityIssues").add(issue);

  await writeAuditEvent({
    action: "created",
    issueId: ref.id,
    familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: `Curriculum quality issue raised (${category}, ${severity})`,
  });

  return { issueId: ref.id, contentVersion };
});

interface QuarantineContentVersionRequest {
  issueId: string;
}

/**
 * Precondition for quarantineContentVersion, factored out for direct
 * unit-testability (same pattern as identity/presentationIdentity.ts's
 * assertIdentityRoleMatchesAccount). Throws when the issue has no content
 * version to quarantine at all — a quarantine can never apply to a
 * broader subject/objective/quarter than the one exact version an issue
 * was actually raised against.
 */
export function assertHasQuarantinableContentVersion(
  issue: Pick<CurriculumQualityIssue, "contentVersion">
): void {
  if (!issue.contentVersion) {
    throw new HttpsError(
      "failed-precondition",
      "This issue has no specific content version to quarantine — it wasn't raised against a specific day/quarter/week."
    );
  }
}

/** True when quarantining would be a no-op (already active) — quarantineContentVersion is idempotent because of this check. */
export function isAlreadyQuarantined(issue: Pick<CurriculumQualityIssue, "quarantine">): boolean {
  return issue.quarantine?.active === true;
}

/**
 * Quarantines the EXACT content version already attached to an existing
 * issue (build-order step 10, section 7) — never a broader subject/
 * objective/quarter scope. Idempotent: quarantining an already-quarantined
 * issue is a harmless no-op. Independent of `status` — see
 * resolveQualityIssue/releaseQuarantine's doc comments for why the two
 * are kept structurally separate.
 */
export const quarantineContentVersion = onCall<QuarantineContentVersionRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const issueId = request.data?.issueId;
  if (typeof issueId !== "string" || issueId.length === 0) {
    throw new HttpsError("invalid-argument", "issueId is required.");
  }

  const db = getFirestore();
  let alreadyActive = false;
  await db.runTransaction(async (tx) => {
    const { ref, data } = await loadIssueForFamily(tx, issueId, caller.profile.familyId);
    assertHasQuarantinableContentVersion(data);
    if (isAlreadyQuarantined(data)) {
      alreadyActive = true;
      return;
    }
    const now = Timestamp.now();
    tx.update(ref, {
      quarantine: { active: true, quarantinedByUid: caller.uid, quarantinedAt: now },
      updatedAt: now,
    });
  });

  if (!alreadyActive) {
    await writeAuditEvent({
      action: "quarantined",
      issueId,
      familyId: caller.profile.familyId,
      actorUid: caller.uid,
      actorRole: caller.profile.role,
      summary: "Curriculum content version quarantined",
    });
  }

  return { issueId };
});

interface ReleaseQuarantineRequest {
  issueId: string;
  note?: string;
}

/**
 * Precondition for releaseQuarantine, factored out for direct
 * unit-testability. Throws when the issue has no active quarantine to
 * release — there is nothing to "explicitly release" on an issue that
 * was never quarantined, or whose quarantine was already released.
 */
export function assertQuarantineActive(issue: Pick<CurriculumQualityIssue, "quarantine">): void {
  if (!issue.quarantine?.active) {
    throw new HttpsError("failed-precondition", "This issue is not currently quarantined.");
  }
}

/**
 * Explicitly lifts a quarantine — the ONLY way a previously-quarantined
 * exact content version becomes selectable for a new day again (a
 * corrected version with a DIFFERENT hash was never blocked in the first
 * place; this is for "the same content, on reflection, is fine after
 * all"). Independent of the issue's resolution `status` — see section 9:
 * resolving an issue never releases its quarantine, and releasing a
 * quarantine never resolves its issue.
 */
export const releaseQuarantine = onCall<ReleaseQuarantineRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const issueId = request.data?.issueId;
  if (typeof issueId !== "string" || issueId.length === 0) {
    throw new HttpsError("invalid-argument", "issueId is required.");
  }
  const note = sanitizeOptionalNote(request.data?.note);

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const { ref, data } = await loadIssueForFamily(tx, issueId, caller.profile.familyId);
    assertQuarantineActive(data);
    const now = Timestamp.now();
    tx.update(ref, {
      "quarantine.active": false,
      "quarantine.releasedByUid": caller.uid,
      "quarantine.releasedAt": now,
      ...(note ? { "quarantine.releaseNote": note } : {}),
      updatedAt: now,
    });
  });

  await writeAuditEvent({
    action: "quarantineReleased",
    issueId,
    familyId: caller.profile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: "Curriculum quarantine explicitly released",
  });

  return { issueId };
});

interface ResolveQualityIssueRequest {
  issueId: string;
  action: string;
  note?: string;
}

/**
 * Marks an issue resolved with an explicit resolution action (section 9).
 * Never touches `quarantine` — a resolved issue whose content is still
 * quarantined stays quarantined until releaseQuarantine is called
 * separately and deliberately.
 */
export const resolveQualityIssue = onCall<ResolveQualityIssueRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const issueId = request.data?.issueId;
  if (typeof issueId !== "string" || issueId.length === 0) {
    throw new HttpsError("invalid-argument", "issueId is required.");
  }
  const action = request.data?.action;
  if (!isCurriculumQualityResolutionAction(action)) {
    throw new HttpsError("invalid-argument", "action is invalid.");
  }
  const note = sanitizeOptionalNote(request.data?.note);

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const { ref } = await loadIssueForFamily(tx, issueId, caller.profile.familyId);
    const now = Timestamp.now();
    tx.update(ref, {
      status: "resolved",
      resolvedAt: now,
      resolvedByUid: caller.uid,
      resolutionAction: action,
      ...(note ? { resolutionNote: note } : {}),
      updatedAt: now,
    });
  });

  await writeAuditEvent({
    action: "resolved",
    issueId,
    familyId: caller.profile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: `Curriculum quality issue resolved (${action})`,
  });

  return { issueId };
});

interface UpdateQualityIssueSeverityRequest {
  issueId: string;
  severity: string;
}

/** Lets a teacher revise severity after further review (section 10: "severity changed if supported"). Never AI-assigned — this callable only accepts and validates an explicit teacher choice. */
export const updateQualityIssueSeverity = onCall<UpdateQualityIssueSeverityRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const issueId = request.data?.issueId;
  if (typeof issueId !== "string" || issueId.length === 0) {
    throw new HttpsError("invalid-argument", "issueId is required.");
  }
  const severity = request.data?.severity;
  if (!isCurriculumQualityIssueSeverity(severity)) {
    throw new HttpsError("invalid-argument", "severity is invalid.");
  }

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const { ref } = await loadIssueForFamily(tx, issueId, caller.profile.familyId);
    tx.update(ref, { severity, updatedAt: Timestamp.now() });
  });

  await writeAuditEvent({
    action: "severityChanged",
    issueId,
    familyId: caller.profile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: `Curriculum quality issue severity changed to ${severity}`,
  });

  return { issueId, severity };
});
