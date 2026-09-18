import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

export type EvidencePacketStatus = "open" | "approved";
export type PacketBlockCompletionState = "not_started" | "in_progress" | "completed" | "excused";
export type EvidenceSourceType =
  | "teacher_observation"
  | "student_response"
  | "worksheet"
  | "app_activity"
  | "field_activity"
  | "project"
  | "assessment";
export type EvidenceDemonstrationType =
  | "written_response"
  | "verbal_explanation"
  | "tap_show_me"
  | "matching"
  | "pointing"
  | "sorting"
  | "naming"
  | "physical_demonstration"
  | "guided_play"
  | "teacher_observation_only";
export type EvidenceOutcome = "correct" | "incorrect" | "partial" | "observed_strong" | "observed_weak" | "not_applicable";

export interface ArtifactReference {
  kind: "worksheet" | "notebook_page" | "drawing" | "project" | "field_observation" | "app_activity" | "photo" | "other";
  description: string;
  url?: string;
}

export interface ObjectiveEvidenceItem {
  objectiveId: string;
  demonstrationType: EvidenceDemonstrationType;
  outcome: EvidenceOutcome;
  sourceType: EvidenceSourceType;
  observation?: string;
  assessmentEligible: boolean;
  recordedByUid: string;
  recordedAt: Timestamp;
  artifacts?: ArtifactReference[];
}

export interface EvidenceBlockEntry {
  blockId: string;
  subject: string;
  title: string;
  required: boolean;
  objectiveIds: string[];
  plannedMinutes: number;
  reportedMinutes: number | null;
  approvedMinutes: number | null;
  completionState: PacketBlockCompletionState;
  excusedReason?: string;
  notes?: string;
  assessmentEligible: boolean;
  objectiveEvidence: ObjectiveEvidenceItem[];
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
  carryForward?: { fromProposedDayId: string; fromDate: string; fromBlockId: string; reason: string };
}

export interface EvidencePacketDraft {
  blocks: EvidenceBlockEntry[];
  dayAssessmentEligible: boolean;
  dayNotes?: string;
  revision: number;
  lastEditedByUid: string;
  lastEditedAt: Timestamp;
}

export interface EvidencePacket {
  id: string;
  familyId: string;
  studentId: string;
  date: string;
  sourceProposedDayId: string;
  sourceProposalVersion: number;
  status: EvidencePacketStatus;
  createdAt: Timestamp;
  createdByUid: string;
  draft: EvidencePacketDraft;
  approvedByUid?: string;
  approvedAt?: Timestamp;
  hoursPostedAt?: Timestamp;
  masteryAppliedAt?: Timestamp;
}

/** Every evidencePackets doc for the family, newest date first. */
export function useEvidencePackets() {
  const { profile } = useAuth();
  const [packets, setPackets] = useState<EvidencePacket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, "evidencePackets"), where("familyId", "==", profile.familyId), orderBy("date", "desc"));
    return onSnapshot(q, (snap) => {
      setPackets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvidencePacket, "id">) })));
      setLoading(false);
    });
  }, [profile]);

  return { packets, loading };
}
