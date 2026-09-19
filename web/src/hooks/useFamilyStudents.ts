import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { FamilyMember } from "../lib/types";

export function useFamilyStudents() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      const q = query(
        collection(db, "users"),
        where("familyId", "==", profile.familyId),
        where("role", "==", "student")
      );
      const snap = await getDocs(q);
      const members: FamilyMember[] = snap.docs.map((d) => ({
        uid: d.id,
        displayName: d.data().displayName,
        characterMapping: d.data().characterMapping ?? null,
        gradeLabel: d.data().gradeLabel ?? null,
        presentationIdentityId: d.data().presentationIdentityId ?? null,
      }));
      members.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setStudents(members);
      setLoading(false);
    })();
  }, [profile]);

  return { students, loading };
}
