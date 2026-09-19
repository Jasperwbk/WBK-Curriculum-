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
  /** Stable presentation-identity id (build-order step 9.1) — the authoritative source for this student's PlacementKidKey; see lib/presentationIdentity.ts. null until a teacher has run assignPresentationIdentity for this account. */
  presentationIdentityId: string | null;
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

// --- Curriculum Quality Feedback Queue (build-order step 10) — mirrors
// functions/src/types.ts's CurriculumQualityIssue family; teacher/admin
// only, never fetched or shown to a student (see the queue page). ---
export type CurriculumQualityIssueCategory =
  | "factual_error"
  | "unclear_directions"
  | "broken_activity"
  | "incorrect_answer_key"
  | "age_inappropriate"
  | "unsafe_instruction"
  | "source_problem"
  | "broken_resource"
  | "duplicate_or_conflicting"
  | "other";

export type CurriculumQualityIssueSeverity = "low" | "medium" | "high" | "critical";
export type CurriculumQualityIssueStatus = "open" | "resolved";

export type CurriculumQualityResolutionAction =
  | "corrected_content"
  | "replaced_resource"
  | "clarified_directions"
  | "source_verified"
  | "false_alarm"
  | "accepted_as_is"
  | "other";

export interface CurriculumQualityIssueReference {
  studentId?: string;
  proposedDayId?: string;
  blockId?: string;
  objectiveId?: string;
  helpRequestId?: string;
}

export interface CurriculumContentVersionReference {
  kidKey: string;
  quarter: string;
  week: number;
  contentHash: string;
  weeklyCertificationId: string | null;
}

export interface CurriculumQuarantine {
  active: boolean;
  quarantinedByUid: string;
  quarantinedAt: { seconds: number; nanoseconds: number };
  releasedByUid?: string;
  releasedAt?: { seconds: number; nanoseconds: number };
  releaseNote?: string;
}

export interface CurriculumQualityIssueDoc {
  familyId: string;
  reporterUid: string;
  reference: CurriculumQualityIssueReference;
  contentVersion: CurriculumContentVersionReference | null;
  category: CurriculumQualityIssueCategory;
  severity: CurriculumQualityIssueSeverity;
  description: string;
  status: CurriculumQualityIssueStatus;
  createdAt: { seconds: number; nanoseconds: number };
  updatedAt: { seconds: number; nanoseconds: number };
  resolvedAt?: { seconds: number; nanoseconds: number };
  resolvedByUid?: string;
  resolutionAction?: CurriculumQualityResolutionAction;
  resolutionNote?: string;
  quarantine: CurriculumQuarantine | null;
}
