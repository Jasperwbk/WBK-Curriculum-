import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

export type ProposedDayStatus = "proposed" | "approved";
export type ProposedDayType = "ordinary" | "alternativePackage" | "nonInstructional";
export type ItineraryMode = "strict" | "flexible";

export interface JasperMessage {
  generated: string;
  edited?: string;
}

export interface LearningBlockSummary {
  subject: string;
  description: string;
}

export interface ProposedDay {
  id: string;
  familyId: string;
  studentId: string;
  date: string;
  quarter: string | null;
  week: number | null;
  dayType: ProposedDayType;
  dayDesignationId: string | null;
  status: ProposedDayStatus;
  proposalVersion: number;
  supersedesProposalId: string | null;
  generatedAt: Timestamp;
  title: string;
  summary: string;
  planText: string;
  jasperMessage: JasperMessage | null;
  suggestedItineraryMode: ItineraryMode | null;
  itineraryMode?: ItineraryMode;
  learningBlocks: LearningBlockSummary[];
  approvedByUid?: string;
  approvedAt?: Timestamp;
}

/** Every proposedDays doc for the family — every version, not just the latest, so history stays visible. */
export function useProposedDays() {
  const { profile } = useAuth();
  const [proposedDays, setProposedDays] = useState<ProposedDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, "proposedDays"),
      where("familyId", "==", profile.familyId),
      orderBy("date", "desc")
    );
    return onSnapshot(q, (snap) => {
      setProposedDays(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProposedDay, "id">) })));
      setLoading(false);
    });
  }, [profile]);

  return { proposedDays, loading };
}
