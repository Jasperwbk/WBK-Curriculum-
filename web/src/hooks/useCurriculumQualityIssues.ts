import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CurriculumQualityIssueDoc } from "../lib/types";

export interface CurriculumQualityIssueRow extends CurriculumQualityIssueDoc {
  id: string;
}

/** Every curriculum quality issue in the caller's family, newest first — teacher-only, matches firestore.rules' isTeacherInFamily read clause (no owner-read clause exists for this collection at all; students never read it). */
export function useFamilyQualityIssues(familyId: string | undefined) {
  const [issues, setIssues] = useState<CurriculumQualityIssueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) {
      setIssues([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "curriculumQualityIssues"),
      where("familyId", "==", familyId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...(d.data() as CurriculumQualityIssueDoc) })));
      setLoading(false);
    });
  }, [familyId]);

  return { issues, loading };
}
