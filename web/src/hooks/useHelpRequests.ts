import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { HelpRequestDoc } from "../lib/types";

export interface HelpRequestRow extends HelpRequestDoc {
  id: string;
}

/** Every help request in the caller's family, newest first — for the teacher queue. Real-time, matches firestore.rules' isTeacherInFamily read clause. */
export function useFamilyHelpRequests(familyId: string | undefined) {
  const [requests, setRequests] = useState<HelpRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "helpRequests"),
      where("familyId", "==", familyId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as HelpRequestDoc) })));
      setLoading(false);
    });
  }, [familyId]);

  return { requests, loading };
}

/** One student's own help requests, newest first — matches firestore.rules' isOwner(studentId) read clause; never returns a sibling's requests. */
export function useMyHelpRequests(studentId: string | undefined) {
  const [requests, setRequests] = useState<HelpRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "helpRequests"),
      where("studentId", "==", studentId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as HelpRequestDoc) })));
      setLoading(false);
    });
  }, [studentId]);

  return { requests, loading };
}
