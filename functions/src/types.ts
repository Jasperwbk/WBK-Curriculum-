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
  /** Optional — see CurriculumGovernanceState. Undefined means "legacy" (pre-governance compatibility). */
  curriculumGovernance?: CurriculumGovernanceState;
  /** Optional — how many days ahead of the school date proposed days should target. Undefined means DEFAULT_GENERATION_LEAD_DAYS (2) — see generationSchedule.ts. Configurable rather than a hardcoded "48 hours" assumption. */
  dayGenerationLeadDays?: number;
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
  | "dayDesignation"
  | "dayPlanPublication"
  | "curriculumCorrection"
  | "learnerLevelAdaptation"
  | "hourApproval"
  | "calendarChange"
  | "extracurricular"
  | "placementSubmission"
  | "assessmentEligibilityChange";

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
// step 3, revised 3.1) ---
//
// Wraps the existing curriculumContent (Firestore) / bundled static Q1
// files with an explicit teacher-certification gate before generatePlan
// may ground a NEW day plan in it. Built on the approval primitive above —
// certifying a quarter or week IS approving a proposal of the matching
// kind; these two collections hold the resulting committed records.
//
// GOVERNANCE SCOPE (3.1): certification is a FAMILY-level instructional
// package boundary, not three independent per-kid certifications. One
// teacher action certifies "the family's Q1" or "the family's Q1 Week 3"
// as a whole; the curriculum content underneath stays fully individualized
// per student (Millaray/Makaio/Maizley each have their own content, own
// hash, own version, preserved inside childContent below for exact
// traceability). If any one child's material changes materially, the
// FAMILY certification goes stale and needs re-certifying — the
// certified *package* changed, even though the other two children's
// content didn't. This is a governance/package boundary only; it does not
// collapse the three children's curricula into identical content.
//
// No mutable "status" field: a record is an immutable, permanent statement
// that a specific family package hash was certified by a specific teacher
// at a specific time (never edited or deleted, so certification history is
// always fully preserved). Whether a certification is *currently valid*
// is computed on demand by comparing its familyContentHash against a
// freshly computed one (see contentHash.ts / certificationStatus.ts) — if
// they no longer match, some child's content changed materially since
// certification and the most recent record is simply stale, without
// needing to be mutated. A new certification is a new document. Per-kid
// hashes inside childContent make it possible to identify exactly which
// child's material caused that staleness.
export type CertificationSource = "reviewed" | "bootstrap";
// "reviewed"  — a teacher looked at this content and certified it directly.
// "bootstrap" — a teacher retroactively certified pre-existing content
//               (e.g. Q1, already live before this certification system
//               existed) via bootstrapExistingCertifications, so nothing
//               already working breaks the moment the gate goes live.
//               Still a real teacher action with a real uid/timestamp/audit
//               event — just honestly flagged as retroactive, not a
//               genuine line-by-line review.

/** One child's content identity within a family certification package — the per-student traceability layer. */
export interface ChildContentReference {
  kidKey: PlacementKidKey;
  /** null means this child had no curriculum content at all at certification time (not an error by itself — see certificationGate.ts for when that's actually a problem). */
  contentHash: string | null;
}

export interface FamilyQuarterCertification {
  familyId: string;
  quarter: Quarter;
  /** Per-kid quarter-shape hashes (contentHash.ts#hashQuarterShape) at certification time — exact traceability of what each child's shape was. */
  childContent: ChildContentReference[];
  /** Deterministic hash-of-hashes over childContent (contentHash.ts#hashFamilyPackage) — the family package's own version identity; changes if ANY child's hash changes. */
  familyContentHash: string;
  certifiedByUid: string;
  certifiedAt: Timestamp;
  source: CertificationSource;
}

export interface FamilyWeeklyCertification {
  familyId: string;
  quarter: Quarter;
  week: number;
  /** The FamilyQuarterCertification current at the moment this week was certified — a week can't be certified while its quarter isn't. */
  quarterCertificationId: string;
  /** Per-kid week-content hashes (contentHash.ts#hashWeekContent) at certification time. */
  childContent: ChildContentReference[];
  familyContentHash: string;
  certifiedByUid: string;
  certifiedAt: Timestamp;
  source: CertificationSource;
}

// --- Explicit day designation (build-order step 3.1) ---
//
// generatePlan's certification gate must never *infer* that a day is an
// approved alternative-package or non-instructional (PTO/break) day merely
// because curriculum content happens to be absent — that has to be an
// explicit, teacher-declared fact, recorded here, or the gate defaults to
// treating missing-but-expected content as a real configuration problem
// (see certificationGate.ts). Scoped per family+date; kidKeys says which
// children it applies to (a field trip or break might not be every kid).
export type DayDesignationType = "alternativePackage" | "nonInstructional";

export interface DayDesignation {
  familyId: string;
  date: string; // ISO "YYYY-MM-DD", matches generatePlan's own date field
  kidKeys: PlacementKidKey[];
  type: DayDesignationType;
  /** What the alternative package is, or why the day is non-instructional — shown to the generator/teacher, never fabricated. */
  description: string;
  createdByUid: string;
  createdAt: Timestamp;
}

// --- Curriculum governance mode (build-order step 3.2) ---
//
// The certification gate's top-level switch — an EXPLICIT, family-level
// state, never inferred from whether any particular quarter happens to
// have a certification record. Two modes:
//
// "legacy"   — pre-governance compatibility. Existing behavior continues:
//              generatePlan grounds on content when it exists, nothing
//              blocks. This is the default whenever a family hasn't set
//              curriculumGovernance at all (Family.curriculumGovernance
//              undefined), so deploying this architecture never silently
//              flips a family into enforcement — see
//              getCurriculumGovernanceMode in curriculumGovernance.ts.
// "governed" — the full certification chain is enforced for EVERY quarter,
//              including one that's never been certified at all (a brand
//              new Q2, say) — "never certified" now blocks rather than
//              being treated as "nothing to enforce yet." Activated as a
//              deliberate side effect of a teacher running
//              bootstrapExistingCertifications (functions/src/
//              certification.ts) — never automatically, never merely
//              because code was deployed.
export type CurriculumGovernanceMode = "legacy" | "governed";

export interface CurriculumGovernanceState {
  mode: CurriculumGovernanceMode;
  /** Set only once, the moment mode first became "governed". */
  activatedByUid?: string;
  activatedAt?: Timestamp;
}

/**
 * Configurable deadlines for the weekly review/certify cadence. Still not
 * enforced by any automation as of build-order step 4 (there's no
 * background scheduler yet — see proposedDays.ts's doc comment on what
 * step 4 does and doesn't build); this makes the schedule data instead of
 * a hardcoded assumption, for whenever that automation exists. Falls back
 * to DEFAULT_WEEKLY_CERTIFICATION_SCHEDULE (Friday 17:00 review / Sunday
 * 20:00 certify) when a family hasn't set one.
 */
export interface WeeklyCertificationSchedule {
  /** 0 = Sunday .. 6 = Saturday. */
  reviewByDayOfWeek: number;
  reviewByTime: string; // "HH:mm", 24h local time
  certifyByDayOfWeek: number;
  certifyByTime: string;
}

// --- Two-day-ahead proposed days (Builder Guide §6-7, §21; build-order
// step 4) ---
//
// Extends the existing day-plan concept (dayPlans/{planId} — freeform,
// teacher-prompted, multi-student, still used unchanged for ad hoc days
// like field trips) with a second, parallel pipeline: one governed,
// per-student proposal per school date, generated ahead of time from
// certified content, reviewed/edited by a teacher, and only then
// approved/published. The two collections stay separate rather than
// cramming both shapes into one schema — see proposedDays.ts's doc
// comment for why.
//
// Like the certification records above, a ProposedDay is never mutated
// once written for a MATERIAL change — proposalVersion increments and a
// new doc is written instead, so every version that ever existed (and
// which one was actually approved) stays in history. The one thing that
// DOES mutate a doc in place is approval itself (status/approvedByUid/
// approvedAt/itineraryMode/jasperMessage.edited/content overrides) — that
// happens once, and an approved doc is never regenerated afterward.

export type ProposedDayStatus = "proposed" | "approved";

/** Whether a day grounds in ordinary certified curriculum or an explicit DayDesignation override — see dayDesignation.ts. Never inferred; see certificationGate.ts. */
export type ProposedDayType = "ordinary" | "alternativePackage" | "nonInstructional";

export type ItineraryMode = "strict" | "flexible";

/**
 * Jasper's per-child morning greeting. `generated` is set once, at
 * generation time, and never overwritten — a teacher's edit is stored
 * separately in `edited`, so the original AI draft is always recoverable.
 * The message actually shown to a student once published is `edited ??
 * generated`. null only for a "nonInstructional" day, which doesn't need
 * a greeting into a school day that isn't happening.
 */
export interface JasperMessage {
  generated: string;
  edited?: string;
}

// --- Block/objective-level day structure (Builder Guide's learning cycle;
// build-order step 5) ---
//
// Replaces step 4's placeholder LearningBlockSummary with a real
// instructional block model. The locked learning cycle (initial hypothesis
// -> objective -> teach/model -> guided practice -> independent attempt ->
// actionable feedback -> retrieval -> spaced/interleaved revisit ->
// delayed retention -> application/transfer -> reflection/metacognition ->
// evidence update -> confidence-weighted adaptation proposal -> teacher
// authority -> next learning cycle) plays out ACROSS MULTIPLE DAYS/blocks,
// not within a single one — a single block only needs to represent ONE
// stage of it. `stage` says which one; `dependsOn` and carry-forward (see
// below) are what let an objective's movement through the cycle span
// several proposed days.

export type InstructionalStage =
  | "warmup_retrieval"
  | "teach_model"
  | "guided_practice"
  | "independent_practice"
  | "assessment_check"
  | "application_transfer"
  | "reflection_metacognition"
  | "enrichment";

// "not_started"/"in_progress"/"completed" are the states a future block-
// completion recorder (step 6's end-of-day evidence packet) will actually
// write — nothing in step 5 writes anything but "not_started" at
// generation time. "carried_forward" is reserved for step 6 to mark a NEW
// day's block that itself already represents carried-forward work, kept
// distinct from ordinary not-yet-attempted work.
export type BlockCompletionState = "not_started" | "in_progress" | "completed" | "carried_forward";

/** Why a retrieval/warm-up block exists — represented so evidence isn't misread as regression (interleaving is expected to raise the error rate, on purpose). */
export type RetrievalReason =
  | "recent_retrieval"
  | "spaced_revisit"
  | "interleaved_practice"
  | "delayed_retention_check";

/** Distinguishes what KIND of evidence a block's check produces, for later evidence consumers — not itself a grade. */
export type RemediationIntent = "initial_instruction" | "retrieval" | "remediation" | "assessment";

export type ActivityFormat = "printable" | "hands_on" | "digital" | "discussion";

/** A prerequisite block within the SAME proposed day — see certificationGate.ts's "avoid a huge scheduling engine" spirit: cross-day dependencies are handled by carry-forward, not by dependency edges spanning days. */
export interface BlockDependency {
  blockId: string;
}

/**
 * Where a block's work came from a PRIOR day that didn't finish it —
 * requirement 6 (build-order step 5): incomplete required work stays
 * incomplete, is never auto-completed or erased, and may carry forward.
 * Deliberately conservative about what counts as "incomplete" — see
 * curriculum/carryForward.ts's doc comment for why only "in_progress"
 * (not "not_started") blocks are ever treated as outstanding.
 */
export interface CarryForwardProvenance {
  fromProposedDayId: string;
  fromDate: string; // ISO "YYYY-MM-DD"
  fromBlockId: string;
  reason: string;
}

/**
 * "Do Not Use for Assessment" (requirement 10). Default (field absent) is
 * eligible — exclusion is always an explicit teacher action
 * (setAssessmentEligibility, proposedDays.ts), never inferred. Excluding a
 * block/day from assessment must never erase completion, instructional
 * time, historical record, or student work — it only marks that evidence
 * as not to be used by a future adaptive mastery model. Nothing in step 5
 * actually feeds block-level evidence into masteryRecords yet (no path
 * does that today — see mastery.ts, unchanged), so this is the foundation
 * a future evidence consumer will check, not a live enforcement point yet.
 */
export interface AssessmentEligibility {
  eligible: boolean;
  excludedByUid?: string;
  excludedAt?: Timestamp;
  excludedReason?: string;
}

/**
 * One instructional block within a proposed day. Content fields (title,
 * subject, objectiveIds, stage, estimatedMinutes, required, dependsOn,
 * order, carryForward, retrievalReason, remediationIntent,
 * activityFormat, notes) live in both ProposedDay.learningBlocks
 * (permanent AI-generated original) and ProposedDay.draft.learningBlocks
 * (current, editable pre-approval, frozen at approval) — same immutable-
 * original/current-draft split as the rest of ProposedDay, see
 * ProposedDayDraft's doc comment.
 *
 * completionState and teacherLocked are placeholders a future step
 * actually writes (step 5 always generates "not_started"/false) — kept on
 * the block itself since they're content-adjacent (what stage of the
 * cycle this block is in), unlike assessment-eligibility exclusions,
 * which are governance flags that must stay mutable even on an approved/
 * historical day and so live in their own top-level fields on ProposedDay
 * (blockAssessmentExclusions/dayAssessmentEligibility) instead of inside
 * this object — see proposedDays.ts's setAssessmentEligibility.
 */
export interface LearningBlock {
  blockId: string; // stable within this ProposedDay only — "b1", "b2", ...
  studentId: string;
  subject: Subject;
  title: string;
  /** Server-assigned only — never trusts an AI-supplied id. See curriculum/objectiveId.ts. */
  objectiveIds: string[];
  stage: InstructionalStage;
  estimatedMinutes: number;
  /** false = enrichment — see requirement 7: finishing required work early unlocks enrichment, never tomorrow's required curriculum. */
  required: boolean;
  completionState: BlockCompletionState;
  dependsOn: BlockDependency[];
  teacherLocked: boolean;
  /** Position within this day's block list — the ordering Strict mode enforces. Always the block's index in the validated array; never trusts an AI-claimed order. */
  order: number;
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
  carryForward?: CarryForwardProvenance;
  retrievalReason?: RetrievalReason;
  remediationIntent?: RemediationIntent;
  activityFormat?: ActivityFormat;
  notes?: string;
}

export interface ProposedDay {
  familyId: string;
  studentId: string;
  date: string; // ISO "YYYY-MM-DD"
  quarter: Quarter | null; // null when the date falls outside the school year entirely
  week: number | null;

  dayType: ProposedDayType;
  /** Set only when dayType is alternativePackage/nonInstructional. */
  dayDesignationId: string | null;

  // --- Source/version traceability (so it's always possible to tell
  // exactly what certified version a proposal was generated from) ---
  governanceModeAtGeneration: CurriculumGovernanceMode;
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
  /**
   * The idempotency comparison key — see proposedDayLifecycle.ts. A
   * certification id when one exists ("cert:<id>"), a content hash when
   * generation grounded on legacy-mode content with no certification
   * ("content:<hash>"), a designation id when dayType isn't "ordinary"
   * ("designation:<id>"), or "none" when there was nothing to ground on
   * at all. Comparing this value across calls is how generateProposedDays
   * decides whether regeneration is actually needed.
   */
  sourceSignature: string;

  status: ProposedDayStatus;
  /** 1 the first time this (familyId, studentId, date) is ever generated, incrementing on each regeneration. */
  proposalVersion: number;
  /** The previous version's doc id, when this version supersedes one — null for proposalVersion 1. */
  supersedesProposalId: string | null;

  generatedAt: Timestamp;
  generatedByUid: string;

  // --- Original AI-generated content — set once at generation, NEVER
  // overwritten afterward (build-order step 4.1: "do not overwrite/
  // destroy the generated source"). The teacher's current working copy
  // lives entirely in `draft` below; these fields exist purely as the
  // permanent original for reference/audit. ---
  title: string;
  summary: string;
  planText: string;
  /** null only for a "nonInstructional" day. Only ever has `.generated` — a teacher's edit lives in draft.jasperMessageEdited, never written back here. */
  jasperMessage: JasperMessage | null;
  /** Claude's suggestion at generation time. */
  suggestedItineraryMode: ItineraryMode | null;
  learningBlocks: LearningBlock[];
  /**
   * Carry-forward/incomplete-work notes from the prior school day, when
   * available — human-readable summary; see curriculum/carryForward.ts
   * for the actual per-block provenance (LearningBlock.carryForward).
   * Empty whenever there was nothing outstanding to carry (which, until a
   * future step actually records block completion, is effectively
   * always — see carryForward.ts's doc comment on why "not_started" is
   * deliberately never treated as outstanding).
   */
  carryForwardNotes: string[];

  // --- Assessment-eligibility governance (build-order step 5, requirement
  // 10: "Do Not Use for Assessment"). Deliberately NOT inside
  // learningBlocks/draft.learningBlocks — these must stay mutable even on
  // an approved/historical day (a teacher can flag or un-flag evidence at
  // any time), which would conflict with the "content is frozen once
  // approved" rule those arrays otherwise follow. Written only by
  // setAssessmentEligibility (proposedDays.ts). Absent/undefined always
  // means eligible — exclusion is only ever an explicit teacher action. ---
  /** Keyed by LearningBlock.blockId. Only entries with eligible: false are ever really necessary here, but a re-included block is written back as {eligible:true} rather than deleted, so who re-included it and when stays visible if ever needed. */
  blockAssessmentExclusions?: Record<string, AssessmentEligibility>;
  /** Whole-day exclusion — independent of any individual block's flag. */
  dayAssessmentEligibility?: AssessmentEligibility;

  /**
   * The teacher's current review copy (build-order step 4.1) — the single
   * source of truth for "what's actually current" from generation through
   * approval and beyond. Seeded from the generated values above at
   * generation time (so it always exists, even before any teacher touches
   * it), mutated only by saveProposedDayDraft while status is "proposed",
   * and simply left as-is (no longer editable) once approved — its
   * content at that moment IS the final approved/published version. See
   * proposedDays.ts for the optimistic-concurrency (revision) protection.
   */
  draft: ProposedDayDraft;

  // --- Set only once approved (undefined before that) — a small summary
  // of the approval itself; the actual final content is draft above. ---
  itineraryMode?: ItineraryMode;
  approvedByUid?: string;
  approvedAt?: Timestamp;
}

export interface ProposedDayDraft {
  title: string;
  summary: string;
  planText: string;
  /** The teacher's edited Jasper text, distinct from jasperMessage.generated — undefined until a teacher actually changes it from the generated text. */
  jasperMessageEdited?: string;
  itineraryMode: ItineraryMode;
  /**
   * Seeded as a copy of the generated learningBlocks at generation time.
   * Not yet editable via saveProposedDayDraft (build-order step 5 only
   * asks the review UI to INSPECT structured blocks, not edit them) —
   * kept here anyway for the same reason draft mirrors every other
   * generated field: so a future step that DOES add block editing
   * doesn't need another schema change, and so this array is (like the
   * rest of draft) still "the current copy" that becomes the final
   * approved/published one, not the frozen original.
   */
  learningBlocks: LearningBlock[];
  /** 0 for the seeded, never-actually-edited copy created at generation time; increments by 1 on each saveProposedDayDraft call. */
  revision: number;
  lastEditedByUid: string;
  lastEditedAt: Timestamp;
}
