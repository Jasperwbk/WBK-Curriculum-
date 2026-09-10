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
