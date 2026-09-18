import { Timestamp } from "firebase-admin/firestore";

export type Role = "teacher" | "student";

export type Location = "home" | "field" | "external";
// home    = on-property, counts toward the 400-hour home-core requirement
// field   = on-property but off-homestead-structure (e.g. a supervised
//           outing on your own land) — still counts as home for MO purposes
// external = off-property (tutor's location, music studio, sports practice)
//           — counts toward the 1,000-hour total and core/specialty totals,
//           but NOT toward the 400-home-core bucket

export type LogSource = "curriculum" | "extracurricular";

export type SubjectType = "core" | "specialty";

export type ExtracurricularType = "tutor" | "class" | "sport" | "award" | "other";

export const CORE_SUBJECTS = [
  "reading_language_arts",
  "math",
  "science",
  "social_studies_history",
] as const;

export const SPECIALTY_SUBJECTS = [
  "bushcraft_outdoor_skills",
  "homestead_skills",
  "nature_identification",
  "spiritual_cultural",
] as const;

export type CoreSubject = (typeof CORE_SUBJECTS)[number];
export type SpecialtySubject = (typeof SPECIALTY_SUBJECTS)[number];
export type Subject = CoreSubject | SpecialtySubject;

export interface SchoolYear {
  startDate: Timestamp;
  yearLengthDays: number; // default 365
  totalHoursTarget: number; // default 1000
  coreHoursTarget: number; // default 600
  homeCoreHoursTarget: number; // default 400
}

export interface Family {
  familyName: string;
  schoolYear: SchoolYear;
  memberIds: string[]; // all teacher + student accounts in the family
  /** Optional — see WeeklyCertificationSchedule. Undefined means use the default. */
  weeklyCertificationSchedule?: WeeklyCertificationSchedule;
}

export interface UserProfile {
  familyId: string;
  displayName: string;
  role: Role;
  characterMapping: string | null; // "Kira" | "Rhoe" | "Nova" | null for teachers
  gradeLabel: string | null; // students only
  assessmentBaseline: Record<string, string>; // subjectName -> free-text starting point
}

export interface LogEntry {
  familyId: string;
  userId: string;
  date: Timestamp;
  subject: Subject;
  subjectType: SubjectType;
  durationMinutes: number;
  location: Location;
  source: LogSource;
  extracurricularId?: string; // set when source === "extracurricular"
}

export interface ExtracurricularRecord {
  familyId: string;
  userId: string;
  type: ExtracurricularType;
  title: string;
  date: Timestamp;
  subjectTag: Subject | null;
  durationMinutes: number | null; // null for "award"
  notes: string;
  sourceFileUrl: string;
}

export interface TestRecord {
  familyId: string;
  userId: string;
  date: Timestamp;
  subject: Subject;
  score: string;
  imageUrl: string | null;
}

// --- Objective mastery tracking (learn_practice_test_alignment_standard_v2) ---
//
// Tracks the last up-to-3 check results per individual objective (not per
// subject/topic). 2-of-3 correct = mastered; otherwise the objective stays
// "in progress" and the next session must re-teach it (different framing,
// not a repeat) before a new objective is introduced in that subject. See
// curriculum/learn_practice_test_alignment_standard_v2.md.
export interface MasteryRecord {
  familyId: string;
  userId: string;
  objectiveId: string; // e.g. "MA-03", or a future retrofit objective id
  subject: Subject;
  skill: string; // short label, e.g. "multiplication", "wayfinding"
  recentResults: boolean[]; // oldest first, capped at the last 3
  mastered: boolean;
  masteredAt: Timestamp | null;
  // Stricter than "mastered" (2-of-3): every one of the last 3 checks was
  // correct with no struggle at all. This is the "too easy" signal — the
  // generator should respond by introducing a genuinely harder stretch
  // version of the skill, not just reviewing it or moving to the next
  // already-scheduled objective at the same difficulty.
  aced: boolean;
  acedAt: Timestamp | null;
  updatedAt: Timestamp;
}

// --- Placement test / printable check-in (Assessment 2.0) ---
//
// Millaray & Makaio: a one-time, teacher-administered, scored in-app
// placement test. Maizley: a non-scored printable checklist for Sarah to
// use directly — see curriculum/maizley_track_clarification.md.
export type PlacementKidKey = "millaray" | "makaio" | "maizley";

export type PlacementItemKind = "fixed" | "open" | "checklist" | "puzzle_level";

export interface PlacementTestItem {
  id: string; // e.g. "MA-01", "MZ-07"
  subject: Subject;
  skill: string;
  question: string;
  kind: PlacementItemKind;
  correctAnswer?: string; // only set for "fixed" items (e.g. math)
}

export interface PlacementItemResult {
  itemId: string;
  // Fixed items: graded automatically against correctAnswer.
  // Open/checklist items: teacher's own judgment call, per the rubric notes.
  // Puzzle-level items (Maizley's MZ-07): a level string, not a boolean.
  answerText?: string;
  correct?: boolean | null;
  level?: string;
  notes?: string;
}

export interface PlacementTestRecord {
  familyId: string;
  userId: string;
  kidKey: PlacementKidKey;
  date: Timestamp;
  scored: boolean; // false for Maizley's printable-only check-in
  results: PlacementItemResult[];
  subjectBaselines: Partial<Record<Subject, string>>; // e.g. "5/7 correct (71%)"
}

// --- Self-service placement test submission (student takes it themselves) ---
//
// Several placement items (reading fluency, "explain your reasoning,"
// writing quality) genuinely need an adult's judgment call — a kid can type
// their own answer, but can't score their own reasoning. So a kid's own
// submission captures every answer and auto-grades the fixed/numeric items
// immediately (comparing to the known correctAnswer), but leaves "open"
// items unscored (`correct: null`) until a teacher reviews what the kid
// actually wrote and judges it — at which point the teacher's review
// finalizes into a real PlacementTestRecord via the existing
// submitPlacementTest path, and this submission is deleted.
export interface PlacementSubmissionItemResult {
  itemId: string;
  answerText: string;
  correct: boolean | null; // pre-graded for fixed items; null for open items awaiting review
}

export interface PlacementSubmission {
  familyId: string;
  userId: string;
  kidKey: "millaray" | "makaio"; // Maizley's track stays teacher/parent-administered, not self-service
  submittedAt: Timestamp;
  results: PlacementSubmissionItemResult[];
}

// --- Database-backed curriculum content (the "upload a new quarter"
// flow) ---
//
// Curriculum content used to live only in files bundled into the deployed
// function (Q1 only). This lets a teacher upload each new quarter directly
// from the web app — no code change or deploy required — by dropping in a
// file for each kid; it's parsed client-side (deterministic, not AI — the
// source format is consistent enough not to need it) and written straight
// here. generatePlan reads it at runtime, keyed by which quarter/week a
// plan's date falls in.
export type Quarter = "q1" | "q2" | "q3" | "q4";

export interface CurriculumWeekEntry {
  week: number;
  title: string;
  rawContent: string; // the week's full section, verbatim — this is what generatePlan reads
  hours: Partial<Record<Subject, number>>; // best-effort, parsed from the source table
}

export interface CurriculumContentDoc {
  familyId: string;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  weeks: CurriculumWeekEntry[];
  sourceFileName: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
}

// --- Ongoing weekly check-ins (continuous reassessment, per
// learn_practice_test_alignment_standard_v2.md) ---
//
// Each retrofit objective carries 1-2 quick, ungraded check questions,
// asked in the moment during the week's actual activity, not a separate
// quiz. Scoped to Millaray & Makaio (the scored mastery track) — see
// curriculum/q1_fall/*_retrofit.md.
export interface WeeklyObjective {
  id: string; // e.g. "millaray-w1-math-1"
  week: number;
  subject: Subject;
  skill: string; // the objective itself, e.g. "Weigh/record produce to the nearest oz/lb"
  checkQuestions: string[]; // asked aloud in the moment; rotate between them if 2+
}

export interface CheckInItemResult {
  objectiveId: string;
  correct: boolean;
}

export interface UploadRecord {
  familyId: string;
  uploadedBy: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: Timestamp;
  category: string;
}

// --- Generalized teacher-approval primitive (Builder Guide §21) ---
//
// One conceptual flow, reused wherever an AI or student-generated change
// needs a human in the loop before it's authoritative: proposal -> pending
// review -> teacher edit/approve/reject -> committed version -> audit
// event. Not yet adopted by the app's existing ad hoc versions of this
// pattern (day-plan save, extracurricular confirm, placement-submission
// review) — those keep working as they are for now. Its first real
// consumer is quarter/weekly certification (build-order step 3); see
// functions/src/approvals.ts for the helper functions that create,
// approve, and reject a Proposal.
export type ProposalKind =
  | "quarterCertification"
  | "weeklyCertification"
  | "dayPlanPublication"
  | "curriculumCorrection"
  | "learnerLevelAdaptation"
  | "hourApproval"
  | "calendarChange"
  | "extracurricular"
  | "placementSubmission";

export type ProposalStatus = "pending" | "approved" | "rejected";

export interface Proposal<T = unknown> {
  kind: ProposalKind;
  familyId: string;
  /** The student this proposal concerns, when it concerns just one. */
  targetUserId: string | null;
  status: ProposalStatus;
  /** Whatever domain-specific fields this proposal kind carries — see the
   *  commit() callback of the flow that produced it for the real shape. */
  payload: T;
  proposedByUid: string;
  proposedByRole: Role;
  proposedAt: Timestamp;
  reviewedByUid?: string;
  reviewedAt?: Timestamp;
}

export type AuditAction = "proposed" | "approved" | "rejected";

export interface AuditEvent {
  kind: ProposalKind;
  action: AuditAction;
  proposalId: string;
  /** Duplicated from the proposal (rather than looked up) so rules can scope reads by family without an extra fetch. */
  familyId: string;
  actorUid: string;
  actorRole: Role;
  at: Timestamp;
  summary: string;
}

// --- Quarter + weekly certification (Builder Guide §4-5, §21; build-order
// step 3) ---
//
// Wraps the existing curriculumContent (Firestore) / bundled static Q1
// files with an explicit teacher-certification gate before generatePlan
// may ground a NEW day plan in it. Built on the approval primitive above —
// certifying a quarter or week IS approving a proposal of the matching
// kind; these two collections hold the resulting committed records.
//
// Scoped per (familyId, kidKey, quarter[, week]) rather than per family —
// that's the actual granularity curriculum content is stored and uploaded
// at today (one curriculumContent doc per kid per quarter), so certifying
// "Millaray's Q1" and "Makaio's Q1" are genuinely separate acts.
//
// No mutable "status" field: a record is an immutable, permanent statement
// that a specific content hash was certified by a specific teacher at a
// specific time (never edited or deleted, so certification history is
// always fully preserved). Whether a certification is *currently valid*
// is computed on demand by comparing its certifiedContentHash against the
// current content's hash (see contentHash.ts / certificationStatus.ts) —
// if they no longer match, the content changed materially since
// certification and the most recent record is simply stale, without
// needing to be mutated. A new certification is a new document.
export type CertificationSource = "reviewed" | "bootstrap";
// "reviewed"  — a teacher looked at this content and certified it directly.
// "bootstrap" — a teacher retroactively certified pre-existing content
//               (e.g. Q1, already live before this certification system
//               existed) via bootstrapExistingCertifications, so nothing
//               already working breaks the moment the gate goes live.
//               Still a real teacher action with a real uid/timestamp/audit
//               event — just honestly flagged as retroactive, not a
//               genuine line-by-line review.

export interface QuarterCertification {
  familyId: string;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  /** Hash of the quarter's shape only (week numbers + titles) — see
   *  contentHash.ts#hashQuarterShape. Deliberately excludes each week's
   *  rawContent/hours, which are certified independently at the weekly
   *  level, so refining one week's prose doesn't force re-certifying the
   *  whole quarter. */
  certifiedContentHash: string;
  certifiedByUid: string;
  certifiedAt: Timestamp;
  source: CertificationSource;
}

export interface WeeklyCertification {
  familyId: string;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
  /** The QuarterCertification current at the moment this week was
   *  certified — a week can't be certified while its quarter isn't. */
  quarterCertificationId: string;
  /** Hash of this week's actual material content — see
   *  contentHash.ts#hashWeekContent. */
  certifiedContentHash: string;
  certifiedByUid: string;
  certifiedAt: Timestamp;
  source: CertificationSource;
}

/**
 * Configurable deadlines for the weekly review/certify cadence (not yet
 * enforced by any automation — that arrives with build-order step 4's
 * two-day-ahead generation; this just makes the schedule data instead of
 * a hardcoded assumption). Falls back to
 * DEFAULT_WEEKLY_CERTIFICATION_SCHEDULE (Friday 17:00 review / Sunday
 * 20:00 certify) when a family hasn't set one.
 */
export interface WeeklyCertificationSchedule {
  /** 0 = Sunday .. 6 = Saturday. */
  reviewByDayOfWeek: number;
  reviewByTime: string; // "HH:mm", 24h local time
  certifyByDayOfWeek: number;
  certifyByTime: string;
}
