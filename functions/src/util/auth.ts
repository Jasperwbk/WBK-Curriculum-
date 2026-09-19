import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { UserProfile } from "../types";

export interface CallerContext {
  uid: string;
  profile: UserProfile;
}

/**
 * Loads the caller's users/{uid} doc and throws HttpsError if they're not
 * signed in or have no profile. Every callable in this codebase is
 * teacher-or-owner gated, so this is the single place that lookup happens.
 */
export async function requireCaller(request: CallableRequest): Promise<CallerContext> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const snap = await getFirestore().collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "No user profile found for this account.");
  }
  return { uid, profile: snap.data() as UserProfile };
}

export function requireTeacher(caller: CallerContext): void {
  if (caller.profile.role !== "teacher") {
    throw new HttpsError("permission-denied", "Only teachers may perform this action.");
  }
}

/** Teachers may act on anyone in their family; students may only act on themselves. */
export function requireOwnerOrTeacher(caller: CallerContext, targetUserId: string): void {
  const isSelf = caller.uid === targetUserId;
  if (!isSelf && caller.profile.role !== "teacher") {
    throw new HttpsError(
      "permission-denied",
      "You may only access your own records."
    );
  }
}

export function requireSameFamily(caller: CallerContext, familyId: string): void {
  if (caller.profile.familyId !== familyId) {
    throw new HttpsError("permission-denied", "That record belongs to a different family.");
  }
}

/**
 * Pure predicate factored out for direct unit-testability (build-order
 * step 11.2, Account Governance Addendum). Named distinctly from
 * firestore.rules' `isOwner(userId)` (which means "the caller IS this
 * uid" — a completely different concept) to avoid confusing the two.
 * Reads ONLY `profile.systemRole` — never displayName, email, or
 * presentationIdentityId. `undefined`/`"standard"` both mean "no owner
 * authority," the safe default for every account until the seed/
 * bootstrap script explicitly sets `"owner"`.
 */
export function isSystemOwner(profile: UserProfile): boolean {
  return profile.systemRole === "owner";
}

/**
 * The gate for genuinely system-sensitive account administration only
 * (resetting a family member's Firebase Auth password, changing a login
 * email, viewing the family account roster) — NOT a replacement for
 * requireTeacher. Every ordinary educational operation (certification,
 * proposed-day approval, evidence/hours/mastery, help requests, curriculum
 * quality) stays exactly requireTeacher-gated; Sarah (role: "teacher",
 * systemRole absent) must keep passing every one of those unchanged.
 *
 * Requires role === "teacher" IN ADDITION TO systemRole === "owner" —
 * defense-in-depth matching the addendum's own model ("Owner ... Teacher"
 * is one person, never a student): a bootstrap config mistake that ever
 * set systemRole "owner" on a student account must still not grant
 * account-administration authority. Caught by this file's own tests.
 */
export function requireOwner(caller: CallerContext): void {
  if (caller.profile.role !== "teacher" || !isSystemOwner(caller.profile)) {
    throw new HttpsError("permission-denied", "Only the family's system owner may perform this action.");
  }
}
