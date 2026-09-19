import { getFirestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireCaller, requireOwnerOrTeacher, requireSameFamily, requireTeacher } from "../util/auth";
import type {
  HelpRequest,
  HelpRequestCategory,
  HelpRequestReference,
  HelpRequestTeacherNote,
  UserProfile,
} from "../types";

/**
 * Ask-a-Teacher: student -> Celeste -> Jasper escalation (build-order step
 * 9). This is a structured help/escalation mechanism, NOT an unrestricted
 * AI tutor chat and NOT a chat/social feed — every category is fixed, every
 * routing decision is deterministic, and nothing here calls an AI model at
 * all. See types.ts's HelpRequest doc comment for how this relates to
 * certificationGate.ts's "Curriculum Assistance Required" (blocked_missing)
 * state: that's a separate, system-level content-readiness gate on NEW
 * plan generation, unrelated to a student's live help request.
 */

const MAX_MESSAGE_LENGTH = 500;
const MAX_NOTE_LENGTH = 2000;

/** A canned, age-appropriate message per category — this is what makes the no-typing flow possible (required for Maizely, available to anyone). Never AI-authored. */
const CANONICAL_MESSAGE_BY_CATEGORY: Record<HelpRequestCategory, string> = {
  dont_understand: "I don't understand this.",
  directions_unclear: "The directions don't make sense.",
  think_content_is_wrong: "I think something is wrong here.",
  cannot_complete: "I can't complete this.",
  need_teacher: "I need my teacher.",
  other: "I need help.",
};

const HELP_REQUEST_CATEGORIES: readonly HelpRequestCategory[] = [
  "dont_understand",
  "directions_unclear",
  "think_content_is_wrong",
  "cannot_complete",
  "need_teacher",
  "other",
];

export function isHelpRequestCategory(value: unknown): value is HelpRequestCategory {
  return typeof value === "string" && (HELP_REQUEST_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The ONE routing decision made at creation time — always "celeste",
 * regardless of category, student, or anything else (spec section 8:
 * "Do NOT automatically route based solely on AI guesses about subject
 * difficulty" / section 9: "prefer deterministic structured routing").
 * Pulled out as its own function (rather than an inline literal in
 * createHelpRequest below) so this exact guarantee is independently
 * unit-testable and impossible to accidentally vary per-category later
 * without a test failing.
 */
export function defaultEscalationLevel(): "celeste" {
  return "celeste";
}

/**
 * Resolves the message actually stored on the request — the student's own
 * trimmed words when they typed something real, otherwise the fixed
 * per-category label. Pure and directly testable: this is the entire
 * no-typing-required guarantee in one function.
 */
export function resolveHelpRequestMessage(category: HelpRequestCategory, rawMessage: unknown): string {
  if (typeof rawMessage === "string") {
    const trimmed = rawMessage.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        throw new HttpsError("invalid-argument", `message is too long (${MAX_MESSAGE_LENGTH} character max).`);
      }
      return trimmed;
    }
  }
  return CANONICAL_MESSAGE_BY_CATEGORY[category];
}

/** Only the three known reference keys are ever kept — anything else on the input object is silently dropped, never stored. */
export function sanitizeHelpRequestReference(raw: unknown): HelpRequestReference {
  if (typeof raw !== "object" || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const reference: HelpRequestReference = {};
  if (typeof input.proposedDayId === "string" && input.proposedDayId.length > 0) {
    reference.proposedDayId = input.proposedDayId;
  }
  if (typeof input.blockId === "string" && input.blockId.length > 0) {
    reference.blockId = input.blockId;
  }
  if (typeof input.objectiveId === "string" && input.objectiveId.length > 0) {
    reference.objectiveId = input.objectiveId;
  }
  return reference;
}

function sanitizeNote(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "note must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new HttpsError("invalid-argument", "note must not be empty.");
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new HttpsError("invalid-argument", `note is too long (${MAX_NOTE_LENGTH} character max).`);
  }
  return trimmed;
}

async function loadHelpRequestForFamily(
  tx: Transaction,
  helpRequestId: string,
  callerFamilyId: string
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: HelpRequest }> {
  const ref = getFirestore().collection("helpRequests").doc(helpRequestId);
  const snap = await tx.get(ref);
  if (!snap.exists) {
    throw new HttpsError("not-found", "No such help request.");
  }
  const data = snap.data() as HelpRequest;
  if (data.familyId !== callerFamilyId) {
    throw new HttpsError("permission-denied", "That request belongs to a different family.");
  }
  return { ref, data };
}

async function writeAuditEvent(params: {
  action: "created" | "responded" | "escalated" | "resolved";
  helpRequestId: string;
  familyId: string;
  actorUid: string;
  actorRole: UserProfile["role"];
  summary: string;
}): Promise<void> {
  await getFirestore().collection("auditEvents").doc().set({
    kind: "helpRequest",
    action: params.action,
    proposalId: params.helpRequestId,
    familyId: params.familyId,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    at: Timestamp.now(),
    summary: params.summary,
  });
}

interface CreateHelpRequestRequest {
  studentId: string;
  category: string;
  message?: string;
  reference?: unknown;
}

/**
 * Raises a new help request. Callable by the student themselves (self-
 * serve) OR a teacher on the student's behalf (Maizely's teacher-assisted,
 * no-typing flow) — reuses requireOwnerOrTeacher exactly as every other
 * self-or-teacher callable in this codebase does, rather than inventing a
 * new authorization check. Always routes to "celeste" by default — never
 * inferred from category, never AI-guessed (section 8/9 of the spec).
 */
export const createHelpRequest = onCall<CreateHelpRequestRequest>(async (request) => {
  const caller = await requireCaller(request);

  const studentId = request.data?.studentId;
  const category = request.data?.category;
  if (typeof studentId !== "string" || studentId.length === 0) {
    throw new HttpsError("invalid-argument", "studentId is required.");
  }
  requireOwnerOrTeacher(caller, studentId);
  if (!isHelpRequestCategory(category)) {
    throw new HttpsError(
      "invalid-argument",
      `category must be one of: ${HELP_REQUEST_CATEGORIES.join(", ")}.`
    );
  }

  const db = getFirestore();
  const studentSnap = await db.collection("users").doc(studentId).get();
  if (!studentSnap.exists) {
    throw new HttpsError("not-found", "No such student.");
  }
  const studentProfile = studentSnap.data() as UserProfile;
  requireSameFamily(caller, studentProfile.familyId);
  if (studentProfile.role !== "student") {
    throw new HttpsError("failed-precondition", "Help requests may only be raised for a student account.");
  }

  const message = resolveHelpRequestMessage(category, request.data?.message);
  const reference = sanitizeHelpRequestReference(request.data?.reference);

  const now = Timestamp.now();
  const helpRequest: HelpRequest = {
    familyId: studentProfile.familyId,
    studentId,
    category,
    message,
    reference,
    status: "open",
    escalationLevel: defaultEscalationLevel(),
    createdAt: now,
    createdByUid: caller.uid,
    teacherNotes: [],
  };
  const ref = await db.collection("helpRequests").add(helpRequest);

  await writeAuditEvent({
    action: "created",
    helpRequestId: ref.id,
    familyId: studentProfile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: `Help request raised for ${studentProfile.displayName} (${category})`,
  });

  return { helpRequestId: ref.id, message, escalationLevel: helpRequest.escalationLevel };
});

interface RespondToHelpRequestRequest {
  helpRequestId: string;
  note: string;
}

/** Adds a teacher note to a request without changing its status/escalation — the ordinary "I saw this, here's what to do" response. Teacher-only, family-scoped. */
export const respondToHelpRequest = onCall<RespondToHelpRequestRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const helpRequestId = request.data?.helpRequestId;
  if (typeof helpRequestId !== "string" || helpRequestId.length === 0) {
    throw new HttpsError("invalid-argument", "helpRequestId is required.");
  }
  const note = sanitizeNote(request.data?.note);

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const { ref, data } = await loadHelpRequestForFamily(tx, helpRequestId, caller.profile.familyId);
    const teacherNote: HelpRequestTeacherNote = {
      note,
      byUid: caller.uid,
      byRole: caller.profile.role,
      at: Timestamp.now(),
    };
    tx.update(ref, { teacherNotes: [...data.teacherNotes, teacherNote] });
  });

  await writeAuditEvent({
    action: "responded",
    helpRequestId,
    familyId: caller.profile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: "Teacher responded to a help request",
  });

  return { helpRequestId };
});

interface EscalateHelpRequestRequest {
  helpRequestId: string;
  note?: string;
}

/**
 * Moves a request to Jasper's level — always a deliberate teacher action
 * (section 8: never automatic, never based on an AI guess about subject
 * difficulty or a timer). Idempotent: escalating an already-escalated
 * request is a harmless no-op re-write of the same level.
 */
export const escalateHelpRequest = onCall<EscalateHelpRequestRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const helpRequestId = request.data?.helpRequestId;
  if (typeof helpRequestId !== "string" || helpRequestId.length === 0) {
    throw new HttpsError("invalid-argument", "helpRequestId is required.");
  }
  const rawNote = request.data?.note;
  const note = typeof rawNote === "string" && rawNote.trim().length > 0 ? sanitizeNote(rawNote) : null;

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const { ref, data } = await loadHelpRequestForFamily(tx, helpRequestId, caller.profile.familyId);
    if (data.status === "resolved") {
      throw new HttpsError("failed-precondition", "Cannot escalate a resolved request.");
    }
    const teacherNotes = note
      ? [...data.teacherNotes, { note, byUid: caller.uid, byRole: caller.profile.role, at: Timestamp.now() }]
      : data.teacherNotes;
    tx.update(ref, { escalationLevel: "jasper", teacherNotes });
  });

  await writeAuditEvent({
    action: "escalated",
    helpRequestId,
    familyId: caller.profile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: "Help request escalated to Jasper",
  });

  return { helpRequestId };
});

interface ResolveHelpRequestRequest {
  helpRequestId: string;
  note?: string;
}

/**
 * Marks a request resolved. Teacher-only — requireTeacher alone, with no
 * owner-based fallback, so a student can never mark their own request
 * resolved (section 12: "students cannot mark themselves resolved
 * administratively").
 */
export const resolveHelpRequest = onCall<ResolveHelpRequestRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const helpRequestId = request.data?.helpRequestId;
  if (typeof helpRequestId !== "string" || helpRequestId.length === 0) {
    throw new HttpsError("invalid-argument", "helpRequestId is required.");
  }
  const rawNote = request.data?.note;
  const note = typeof rawNote === "string" && rawNote.trim().length > 0 ? sanitizeNote(rawNote) : null;

  const db = getFirestore();
  const now = Timestamp.now();
  await db.runTransaction(async (tx) => {
    const { ref, data } = await loadHelpRequestForFamily(tx, helpRequestId, caller.profile.familyId);
    const teacherNotes = note
      ? [...data.teacherNotes, { note, byUid: caller.uid, byRole: caller.profile.role, at: now }]
      : data.teacherNotes;
    tx.update(ref, {
      status: "resolved",
      resolvedAt: now,
      resolvedByUid: caller.uid,
      teacherNotes,
    });
  });

  await writeAuditEvent({
    action: "resolved",
    helpRequestId,
    familyId: caller.profile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    summary: "Help request resolved",
  });

  return { helpRequestId };
});
