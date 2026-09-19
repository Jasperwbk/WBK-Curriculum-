import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

/**
 * Owner-only family account administration (build-order step 11.2). Every
 * callable here is server-side gated by requireOwner — this hook and its
 * page are a convenience for hiding the UI from non-owners, never the
 * actual security boundary (see functions/src/accountAdministration.ts).
 */
export interface FamilyAccountMember {
  uid: string;
  displayName: string;
  role: "teacher" | "student";
  presentationIdentityId: string | null;
  systemRole: "owner" | "standard";
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

const getFamilyAccountAdministrationFn = httpsCallable<Record<string, never>, { members: FamilyAccountMember[] }>(
  functions,
  "getFamilyAccountAdministration"
);

export const resetFamilyMemberPasswordFn = httpsCallable<
  { targetUid: string; newPassword: string },
  { targetUid: string }
>(functions, "resetFamilyMemberPassword");

export const changeFamilyMemberEmailFn = httpsCallable<{ targetUid: string; newEmail: string }, { targetUid: string }>(
  functions,
  "changeFamilyMemberEmail"
);

export function useFamilyAccountAdministration() {
  const [members, setMembers] = useState<FamilyAccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFamilyAccountAdministrationFn({});
      setMembers(res.data.members);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't load the account roster.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { members, loading, error, refresh };
}
