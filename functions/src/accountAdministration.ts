import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireCaller, requireOwner, requireSameFamily } from "./util/auth";
import type { UserProfile } from "./types";

/**
 * Owner-only family account administration (build-order step 11.2 —
 * Account Governance Addendum). Three callables:
 *
 *   getFamilyAccountAdministration — read the family's account roster,
 *     including live (never-stored) Firebase Auth metadata.
 *   resetFamilyMemberPassword — set a family member's Firebase Auth
 *     password to a new value the owner chooses. Never reads, returns, or
 *     stores the existing or new password anywhere but the Firebase Auth
 *     write itself.
 *   changeFamilyMemberEmail — change a family member's Firebase Auth
 *     LOGIN email. Never touches uid/familyId/studentId/
 *     presentationIdentityId/kidKey or any educational record — WBK
 *     identity is the stable uid/profile, never the email address.
 *
 * All three: requireCaller -> requireOwner (never requireTeacher — see
 * util/auth.ts's doc comment on why this is a genuinely separate gate) ->
 * requireSameFamily against the SERVER-FETCHED target profile, never a
 * client-supplied familyId/role/ownership claim. A manually-constructed
 * request from a teacher, a student, or targeting another family's uid
 * must fail here regardless of what a hidden-from-them UI would have
 * sent — see each function's own checks.
 */

async function loadTargetProfile(targetUid: string): Promise<UserProfile> {
  const snap = await getFirestore().collection("users").doc(targetUid).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No such account.");
  }
  return snap.data() as UserProfile;
}

/**
 * Firebase Auth errors are safe to relay (they never describe a password
 * or email's actual VALUE, only whether the input was structurally valid)
 * — mapped to a short, clean message rather than the raw SDK error text.
 * Exported (pure, no Firestore/Auth I/O) for direct unit-testability —
 * same pattern as every other guard extracted throughout this codebase.
 */
export function mapAuthError(err: unknown, fallback: string): never {
  const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: string }).code : undefined;
  const messages: Record<string, string> = {
    "auth/invalid-password": "Password does not meet Firebase's requirements (at least 6 characters).",
    "auth/weak-password": "Password does not meet Firebase's requirements (at least 6 characters).",
    "auth/invalid-email": "That is not a valid email address.",
    "auth/email-already-exists": "That email address is already in use by another account.",
    "auth/user-not-found": "No such Firebase Auth account.",
  };
  throw new HttpsError("invalid-argument", (code && messages[code]) || fallback);
}

interface GetFamilyAccountAdministrationResponse {
  members: {
    uid: string;
    displayName: string;
    role: UserProfile["role"];
    presentationIdentityId: UserProfile["presentationIdentityId"];
    systemRole: "owner" | "standard";
    email: string | null;
    emailVerified: boolean;
    disabled: boolean;
    createdAt: string | null;
    lastSignInAt: string | null;
  }[];
}

/**
 * The family's own account roster — display name, role, presentation
 * identity, and LIVE (fetched from Firebase Auth on every call, never
 * stored in Firestore) email/verification/creation metadata. Never
 * exposes a password, password hash, or auth token — the Admin SDK's
 * `getUser` does not return password hashes to begin with (Firebase
 * itself never exposes them, salted-hashed or otherwise, through this
 * API), so there is nothing here to accidentally leak.
 */
export const getFamilyAccountAdministration = onCall<Record<string, never>>(
  async (request): Promise<GetFamilyAccountAdministrationResponse> => {
    const caller = await requireCaller(request);
    requireOwner(caller);

    const db = getFirestore();
    const auth = getAuth();
    const familySnap = await db.collection("users").where("familyId", "==", caller.profile.familyId).get();

    const members = await Promise.all(
      familySnap.docs.map(async (doc) => {
        const profile = doc.data() as UserProfile;
        let authRecord;
        try {
          authRecord = await auth.getUser(doc.id);
        } catch {
          authRecord = null;
        }
        return {
          uid: doc.id,
          displayName: profile.displayName,
          role: profile.role,
          presentationIdentityId: profile.presentationIdentityId,
          systemRole: profile.systemRole === "owner" ? ("owner" as const) : ("standard" as const),
          email: authRecord?.email ?? null,
          emailVerified: authRecord?.emailVerified ?? false,
          disabled: authRecord?.disabled ?? false,
          createdAt: authRecord?.metadata.creationTime ?? null,
          lastSignInAt: authRecord?.metadata.lastSignInTime ?? null,
        };
      })
    );

    return { members };
  }
);

interface ResetFamilyMemberPasswordRequest {
  targetUid: string;
  newPassword: string;
}

export const resetFamilyMemberPassword = onCall<ResetFamilyMemberPasswordRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireOwner(caller);

  const targetUid = request.data?.targetUid;
  const newPassword = request.data?.newPassword;
  if (typeof targetUid !== "string" || targetUid.length === 0) {
    throw new HttpsError("invalid-argument", "targetUid is required.");
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new HttpsError("invalid-argument", "New password must be at least 8 characters.");
  }

  const target = await loadTargetProfile(targetUid);
  requireSameFamily(caller, target.familyId);

  try {
    await getAuth().updateUser(targetUid, { password: newPassword });
  } catch (err) {
    mapAuthError(err, "Could not reset that password.");
  }

  const now = Timestamp.now();
  await getFirestore()
    .collection("auditEvents")
    .doc()
    .set({
      kind: "accountAdministration",
      action: "passwordReset",
      proposalId: targetUid,
      familyId: caller.profile.familyId,
      actorUid: caller.uid,
      actorRole: caller.profile.role,
      at: now,
      // Never the password itself — only that a reset happened, by whom, for whom.
      summary: `Owner reset the Firebase Auth password for ${target.displayName}.`,
    });

  return { targetUid };
});

interface ChangeFamilyMemberEmailRequest {
  targetUid: string;
  newEmail: string;
}

export const changeFamilyMemberEmail = onCall<ChangeFamilyMemberEmailRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireOwner(caller);

  const targetUid = request.data?.targetUid;
  const newEmail = request.data?.newEmail;
  if (typeof targetUid !== "string" || targetUid.length === 0) {
    throw new HttpsError("invalid-argument", "targetUid is required.");
  }
  if (typeof newEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new HttpsError("invalid-argument", "That is not a valid email address.");
  }

  const target = await loadTargetProfile(targetUid);
  requireSameFamily(caller, target.familyId);

  // Changing the LOGIN email never touches uid, familyId, studentId,
  // presentationIdentityId, kidKey, or any educational record — none of
  // those are derived from email anywhere in this codebase (see
  // identity/presentationIdentity.ts's own doc comments on this point).
  // This call touches Firebase Auth ONLY; the users/{uid} Firestore doc
  // (and everything keyed off that uid) is untouched.
  try {
    await getAuth().updateUser(targetUid, { email: newEmail });
  } catch (err) {
    mapAuthError(err, "Could not change that email address.");
  }

  const now = Timestamp.now();
  await getFirestore()
    .collection("auditEvents")
    .doc()
    .set({
      kind: "accountAdministration",
      action: "emailChanged",
      proposalId: targetUid,
      familyId: caller.profile.familyId,
      actorUid: caller.uid,
      actorRole: caller.profile.role,
      at: now,
      // Never the old or new email address — only that a change happened.
      summary: `Owner changed the Firebase Auth login email for ${target.displayName}.`,
    });

  return { targetUid };
});
