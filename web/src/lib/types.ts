import type { Subject } from "./subjects";
import type { GaugeStatus } from "../components/Gauge";

export interface GaugeData {
  label: string;
  expectedHours: number;
  actualHours: number;
  balanceHours: number;
  status: GaugeStatus;
}

export interface DashboardData {
  asOf: string;
  total: GaugeData;
  core: GaugeData;
  homeCore: GaugeData;
  subjects: Record<Subject, GaugeData>;
  assessmentBaseline: Record<string, string>;
}

export interface FamilyMember {
  uid: string;
  displayName: string;
  characterMapping: string | null;
  gradeLabel: string | null;
}

/** A family member of EITHER role, for the identity-assignment panel (build-order step 9) — useFamilyStudents above stays student-only for its existing callers. */
export interface AnyFamilyMember {
  uid: string;
  displayName: string;
  role: "teacher" | "student";
  presentationIdentityId: string | null;
}

// --- Ask-a-Teacher help requests (build-order step 9) — mirrors
// functions/src/types.ts's HelpRequest family; see that file's doc
// comments for the full design rationale. ---
export type HelpRequestCategory =
  | "dont_understand"
  | "directions_unclear"
  | "think_content_is_wrong"
  | "cannot_complete"
  | "need_teacher"
  | "other";

export type HelpRequestStatus = "open" | "resolved";
export type HelpRequestEscalationLevel = "celeste" | "jasper";

export interface HelpRequestReference {
  proposedDayId?: string;
  blockId?: string;
  objectiveId?: string;
}

export interface HelpRequestTeacherNote {
  note: string;
  byUid: string;
  byRole: "teacher" | "student";
  at: { seconds: number; nanoseconds: number };
}

export interface HelpRequestDoc {
  familyId: string;
  studentId: string;
  category: HelpRequestCategory;
  message: string;
  reference: HelpRequestReference;
  status: HelpRequestStatus;
  escalationLevel: HelpRequestEscalationLevel;
  createdAt: { seconds: number; nanoseconds: number };
  createdByUid: string;
  resolvedAt?: { seconds: number; nanoseconds: number };
  resolvedByUid?: string;
  teacherNotes: HelpRequestTeacherNote[];
}
