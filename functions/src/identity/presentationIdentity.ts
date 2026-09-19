import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireCaller, requireTeacher, requireSameFamily } from "../util/auth";
import type {
  PlacementKidKey,
  PresentationIdentityId,
  Role,
  StudentPresentationIdentityId,
  TeacherPresentationIdentityId,
  UserProfile,
} from "../types";

/**
 * The stable presentation-identity registry (build-order step 9, LOCKED
 * MODEL) — hand-authored, reviewed data, exactly like
 * curriculum/historicalFigureCatalog.ts, never inferred or generated at
 * runtime. `specialtyAreas` is presentation/labeling only (shown in a
 * teacher-facing UI, e.g. "Jasper — math, science, history, bushcraft,
 * first aid") — it plays no role in Ask-a-Teacher routing, which is always
 * teacher-controlled (see identity/helpRequests.ts).
 */
export interface PresentationIdentityInfo {
  id: PresentationIdentityId;
  role: Role;
  displayLabel: string;
  specialtyAreas?: string[];
  /** Set only for a student identity — the stable PlacementKidKey it corresponds to. */
  kidKey?: PlacementKidKey;
}

export const PRESENTATION_IDENTITIES: Record<PresentationIdentityId, PresentationIdentityInfo> = {
  jasper: {
    id: "jasper",
    role: "teacher",
    displayLabel: "Jasper",
    specialtyAreas: ["math", "science", "history", "bushcraft/outdoors", "first aid"],
  },
  celeste: {
    id: "celeste",
    role: "teacher",
    displayLabel: "Celeste",
    specialtyAreas: ["reading/language arts", "grammar", "home economics", "general instruction"],
  },
  kira: { id: "kira", role: "student", displayLabel: "Kira", kidKey: "millaray" },
  ro: { id: "ro", role: "student", displayLabel: "Ro", kidKey: "makaio" },
  nova: { id: "nova", role: "student", displayLabel: "Nova", kidKey: "maizley" },
};

export const TEACHER_PRESENTATION_IDENTITY_IDS: readonly TeacherPresentationIdentityId[] = ["jasper", "celeste"];
export const STUDENT_PRESENTATION_IDENTITY_IDS: readonly StudentPresentationIdentityId[] = ["kira", "ro", "nova"];

export function isPresentationIdentityId(value: unknown): value is PresentationIdentityId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRESENTATION_IDENTITIES, value);
}

/** The PlacementKidKey a student's stable presentation identity maps to — undefined for a teacher identity. Pure lookup, no inference. */
export function kidKeyForPresentationIdentity(id: PresentationIdentityId): PlacementKidKey | undefined {
  return PRESENTATION_IDENTITIES[id].kidKey;
}

/**
 * The ONLY way a student's PlacementKidKey is ever derived from a
 * UserProfile (build-order step 9.2 — replaces step 9.1's version, which
 * still fell back to display-name inference for a not-yet-bootstrapped
 * account; that fallback is now removed entirely per the locked policy:
 * an account missing a stable identity must be treated as requiring
 * setup, never identified by what its displayName happens to contain).
 *
 * A pure lookup: reads `profile.presentationIdentityId` ONLY — never
 * displayName, email, or any other name-shaped field. Returns null for a
 * teacher account, an account with no presentationIdentityId at all, or
 * any other unresolved case; every one of those is "setup required" and
 * must be handled identically by callers (see requireKidKeyForStudent
 * below for the throwing call-boundary guard most callers should use
 * instead of this raw lookup).
 */
export function resolveKidKeyForStudent(profile: UserProfile): PlacementKidKey | null {
  // isPresentationIdentityId guards against stale/corrupted Firestore data
  // (a value that was once valid but no longer matches the registry, or
  // was never valid at all) — without it, an invalid id would reach
  // kidKeyForPresentationIdentity's direct index lookup and throw, rather
  // than being treated as "setup required" like every other unresolved
  // case.
  if (!isPresentationIdentityId(profile.presentationIdentityId)) return null;
  return kidKeyForPresentationIdentity(profile.presentationIdentityId) ?? null;
}

/**
 * The call-boundary guard (build-order step 9.2, section 2: "throw the
 * appropriate controlled precondition error at call boundaries"). Use
 * this instead of resolveKidKeyForStudent wherever a STUDENT account's
 * kidKey is actually required to proceed (recording a placement test,
 * grounding day-plan generation in that student's curriculum) — it throws
 * a clear, actionable `failed-precondition` naming the account by its
 * displayName (for the teacher reading the error, not for identity
 * derivation) rather than silently proceeding or guessing. Never call
 * this for a profile that might legitimately be a non-student (a
 * teacher) — check `profile.role === "student"` first in that case, since
 * a teacher having no kidKey is expected, not an error.
 */
export function requireKidKeyForStudent(profile: UserProfile): PlacementKidKey {
  const kidKey = resolveKidKeyForStudent(profile);
  if (!kidKey) {
    throw new HttpsError(
      "failed-precondition",
      `${profile.displayName}'s account needs a presentation identity assigned (see the Identities page) before this can proceed.`
    );
  }
  return kidKey;
}

/**
 * Pure precondition check factored out of the callable below so it's
 * directly unit-testable without Firestore (same pattern as
 * familySettings.ts#sanitizeClosingWords). Throws when a presentation
 * identity's fixed role doesn't match the target account's actual role —
 * e.g. assigning "jasper" (a teacher identity) to a student account.
 */
export function assertIdentityRoleMatchesAccount(identity: PresentationIdentityInfo, accountRole: Role): void {
  if (identity.role !== accountRole) {
    throw new HttpsError(
      "failed-precondition",
      `"${identity.displayLabel}" is a ${identity.role} identity and cannot be assigned to a ${accountRole} account.`
    );
  }
}

/**
 * Pure collision check: does some OTHER account in this family already
 * hold this identity? A stable-id comparison only — never name/email
 * inference. Factored out for direct unit-testability.
 */
export function findCollidingAssignment(
  existingAssignments: readonly { userId: string; presentationIdentityId: PresentationIdentityId }[],
  candidateUserId: string,
  candidateIdentityId: PresentationIdentityId
): string | null {
  const collision = existingAssignments.find(
    (a) => a.presentationIdentityId === candidateIdentityId && a.userId !== candidateUserId
  );
  return collision ? collision.userId : null;
}

interface AssignPresentationIdentityRequest {
  userId: string;
  presentationIdentityId: string;
}

/**
 * The one, explicit, teacher-initiated way a stable presentation identity
 * is ever attached to a real account (build-order step 9, section 4:
 * "teacher/admin initiated, deterministic, idempotent, auditable where
 * practical"). Never auto-run — nothing calls this on deploy or on any
 * schedule/trigger. Never infers the mapping from displayName, email, or
 * characterMapping — the caller (a teacher reviewing their own family's
 * roster) supplies both the target account and the identity explicitly,
 * and this only validates that choice (role compatibility, no collision
 * with another account already holding the same identity), it never
 * guesses one.
 *
 * Idempotent: re-assigning the same identity to the same account is a
 * no-op write of the same value, always safe to re-run.
 */
export const assignPresentationIdentity = onCall<AssignPresentationIdentityRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const userId = request.data?.userId;
  const presentationIdentityId = request.data?.presentationIdentityId;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new HttpsError("invalid-argument", "userId is required.");
  }
  if (!isPresentationIdentityId(presentationIdentityId)) {
    throw new HttpsError(
      "invalid-argument",
      `presentationIdentityId must be one of: ${Object.keys(PRESENTATION_IDENTITIES).join(", ")}.`
    );
  }

  const db = getFirestore();
  const targetRef = db.collection("users").doc(userId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "No such user.");
  }
  const target = targetSnap.data() as UserProfile;
  requireSameFamily(caller, target.familyId);

  const identity = PRESENTATION_IDENTITIES[presentationIdentityId];
  assertIdentityRoleMatchesAccount(identity, target.role);

  const collisions = await db
    .collection("users")
    .where("familyId", "==", caller.profile.familyId)
    .where("presentationIdentityId", "==", presentationIdentityId)
    .get();
  const existingAssignments = collisions.docs.map((doc) => ({
    userId: doc.id,
    presentationIdentityId: presentationIdentityId,
  }));
  if (findCollidingAssignment(existingAssignments, userId, presentationIdentityId)) {
    throw new HttpsError(
      "failed-precondition",
      `"${identity.displayLabel}" is already assigned to a different account in this family.`
    );
  }

  const now = Timestamp.now();
  await targetRef.update({ presentationIdentityId });
  await db.collection("auditEvents").doc().set({
    kind: "presentationIdentityAssignment",
    action: "assigned",
    proposalId: userId,
    familyId: caller.profile.familyId,
    actorUid: caller.uid,
    actorRole: caller.profile.role,
    at: now,
    summary: `Assigned presentation identity "${identity.displayLabel}" to ${target.displayName}`,
  });

  return { userId, presentationIdentityId };
});
