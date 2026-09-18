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

// --- Block/objective-level day structure (build-order step 5) — mirrors
// functions/src/types.ts's LearningBlock; see that file for the full
// design doc comments (immutable-original vs. draft split, why
// completionState/teacherLocked are placeholders step 5 never writes
// anything but "not_started"/false to, why assessment-eligibility flags
// live outside this shape entirely). ---
export type InstructionalStage =
  | "warmup_retrieval"
  | "teach_model"
  | "guided_practice"
  | "independent_practice"
  | "assessment_check"
  | "application_transfer"
  | "reflection_metacognition"
  | "enrichment";

export type BlockCompletionState = "not_started" | "in_progress" | "completed" | "carried_forward";
export type RetrievalReason = "recent_retrieval" | "spaced_revisit" | "interleaved_practice" | "delayed_retention_check";
export type RemediationIntent = "initial_instruction" | "retrieval" | "remediation" | "assessment";
export type ActivityFormat = "printable" | "hands_on" | "digital" | "discussion";

export interface BlockDependency {
  blockId: string;
}

export interface CarryForwardProvenance {
  fromProposedDayId: string;
  fromDate: string;
  fromBlockId: string;
  reason: string;
}

export interface AssessmentEligibility {
  eligible: boolean;
  excludedByUid?: string;
  excludedAt?: Timestamp;
  excludedReason?: string;
}

export interface LearningBlock {
  blockId: string;
  studentId: string;
  subject: string;
  title: string;
  objectiveIds: string[];
  stage: InstructionalStage;
  estimatedMinutes: number;
  required: boolean;
  completionState: BlockCompletionState;
  dependsOn: BlockDependency[];
  teacherLocked: boolean;
  order: number;
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
  carryForward?: CarryForwardProvenance;
  retrievalReason?: RetrievalReason;
  remediationIntent?: RemediationIntent;
  activityFormat?: ActivityFormat;
  notes?: string;
}

export interface ProposedDayDraft {
  title: string;
  summary: string;
  planText: string;
  jasperMessageEdited?: string;
  itineraryMode: ItineraryMode;
  learningBlocks: LearningBlock[];
  revision: number;
  lastEditedByUid: string;
  lastEditedAt: Timestamp;
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
  /** Original AI-generated content — never overwritten. The teacher's current working copy is `draft` below. */
  title: string;
  summary: string;
  planText: string;
  jasperMessage: JasperMessage | null;
  suggestedItineraryMode: ItineraryMode | null;
  learningBlocks: LearningBlock[];
  carryForwardNotes: string[];
  /** The teacher's review copy — current from generation through approval AND beyond (this is the array to display, even for an approved/historical day — see ProposedDaysPage.tsx). See saveProposedDayDraft/approveProposedDay. */
  draft: ProposedDayDraft;
  itineraryMode?: ItineraryMode;
  approvedByUid?: string;
  approvedAt?: Timestamp;
  /** "Do Not Use for Assessment" governance flags (step 5) — independent of draft/approval; absent always means eligible. */
  blockAssessmentExclusions?: Record<string, AssessmentEligibility>;
  dayAssessmentEligibility?: AssessmentEligibility;
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
