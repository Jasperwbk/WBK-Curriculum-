import { useEffect, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import type { StudentBlockProgressState } from "../lib/blockEligibility";

/**
 * Client-side mirror of functions/src/types.ts's StudentDayProgress
 * (build-order step 11, section 5) — a student's own "not started / in
 * progress / completed" signal per block. Read-only here: the only writer
 * is the `updateBlockProgress` callable wrapped below, never a direct
 * Firestore write (firestore.rules sets `allow write: if false` on
 * `studentBlockProgress` for exactly this reason — identity/ownership are
 * derived server-side from the referenced ProposedDay, not trusted from
 * the client).
 */
export interface StudentBlockProgressEntry {
  state: StudentBlockProgressState;
  updatedAt: Timestamp;
}

export interface StudentDayProgress {
  familyId: string;
  studentId: string;
  date: string;
  proposedDayId: string;
  blocks: Record<string, StudentBlockProgressEntry>;
  updatedAt: Timestamp;
}

/** Same (family, student, date) doc-id formula as usePublishedDay.ts#publishedDayDocId. */
export function studentProgressDocId(familyId: string, studentId: string, date: string): string {
  return `${familyId}_${studentId}_${date}`;
}

export function useStudentProgress(familyId: string | undefined, studentId: string | undefined, date: string) {
  const [progress, setProgress] = useState<StudentDayProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId || !studentId) {
      setProgress(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, "studentBlockProgress", studentProgressDocId(familyId, studentId, date));
    return onSnapshot(ref, (snap) => {
      setProgress(snap.exists() ? (snap.data() as StudentDayProgress) : null);
      setLoading(false);
    });
  }, [familyId, studentId, date]);

  return { progress, loading };
}

export const updateBlockProgressFn = httpsCallable<
  { studentId: string; proposedDayId: string; blockId: string; state: StudentBlockProgressState },
  { studentId: string; blockId: string; state: StudentBlockProgressState }
>(functions, "updateBlockProgress");
