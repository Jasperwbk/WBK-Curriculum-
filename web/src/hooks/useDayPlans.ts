import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

export interface DayPlan {
  id: string;
  date: Timestamp;
  studentIds: string[];
  title: string;
  summary: string;
  planText: string;
  prompt: string;
}

export function useDayPlans() {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "dayPlans"),
      where("familyId", "==", profile.familyId),
      orderBy("date", "desc")
    );
    return onSnapshot(q, (snap) => {
      setPlans(
        snap.docs.map((d) => ({
          id: d.id,
          date: d.data().date as Timestamp,
          studentIds: (d.data().studentIds as string[]) ?? [],
          title: d.data().title as string,
          summary: d.data().summary as string,
          planText: d.data().planText as string,
          prompt: d.data().prompt as string,
        }))
      );
      setLoading(false);
    });
  }, [profile]);

  return { plans, loading };
}
