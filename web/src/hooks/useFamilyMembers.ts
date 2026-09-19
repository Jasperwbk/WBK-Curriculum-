import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { AnyFamilyMember } from "../lib/types";

/** Every account in the caller's family, either role — for the identity-assignment panel (build-order step 9). useFamilyStudents stays student-only for its existing callers. */
export function useFamilyMembers() {
  const { profile } = useAuth();
  const [members, setMembers] = useState<AnyFamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const q = query(collection(db, "users"), where("familyId", "==", profile.familyId));
    const snap = await getDocs(q);
    const rows: AnyFamilyMember[] = snap.docs.map((d) => ({
      uid: d.id,
      displayName: d.data().displayName,
      role: d.data().role,
      presentationIdentityId: d.data().presentationIdentityId ?? null,
    }));
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    setMembers(rows);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  return { members, loading, refetch: load };
}
