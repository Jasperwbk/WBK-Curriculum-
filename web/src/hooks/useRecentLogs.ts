import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Subject, Location } from "../lib/subjects";

export interface LogEntry {
  id: string;
  date: Timestamp;
  subject: Subject;
  durationMinutes: number;
  location: Location;
}

export function useRecentLogs(studentId: string, take = 10) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "logs"),
      where("userId", "==", studentId),
      orderBy("date", "desc")
    );
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.slice(0, take).map((d) => ({
        id: d.id,
        date: d.data().date as Timestamp,
        subject: d.data().subject as Subject,
        durationMinutes: d.data().durationMinutes as number,
        location: d.data().location as Location,
      }));
      setLogs(rows);
      setLoading(false);
    });
  }, [studentId, take]);

  return { logs, loading };
}
