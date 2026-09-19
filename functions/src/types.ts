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

/**
 * Explicit creation-path classification (build-order step 6.1) —
 * distinct from LogSource (what KIND of content it is) and orthogonal to
 * it: this is about WHERE/HOW the record was created and how much to
 * trust it as already-deduplicated. Absent on a log entry means
 * "manual" for compatibility — every log written before this field
 * existed, and every ordinary LogActivityPage entry, continues to count
 * exactly as it always has (see dashboard.ts's
 * curriculum/hourAggregation.ts, which never gates on this field at
 * all — it's for classification/auditing, not for excluding anything).
 */
export type LogProvenance = "manual" | "extracurricular" | "governedEvidence";

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
  /**
   * Added build-order step 7 — PE as a first-class WBK curriculum
   * component, not folded into another subject or left as generic
   * unclassified activity. A specialty subject (not core): it isn't one
   * of Missouri's four core-hours subjects and was never part of the
   * 400-hour home-core requirement, exactly like bushcraft/homestead/
   * nature/spiritual above.
   *
   * LOCKED POLICY (Cory's decision, finalizing step 7): PE is REQUIRED as
   * part of the normal school day but NON-HOUR-BEARING for Missouri
   * instructional/compliance calculations — it contributes zero
   * official instructional hours, permanently, by deliberate school
   * policy, not a placeholder pending a future number. See
   * curriculum/weeklyHours.ts's doc comment (why it has no weekly-hour
   * figure and never will) and curriculum/evidenceHours.ts's
   * NON_HOUR_BEARING_SUBJECTS (the explicit programmatic enforcement —
   * PE never posts an official `logs` entry, regardless of any
   * approvedMinutes recorded on its block). "Required" and "hour-bearing"
   * are deliberately independent: required-ness lives entirely in each
   * block's own `required` field (server-forced true for
   * physical_education in blockValidation.ts) and is never inferred from,
   * or affected by, this subject's zero compliance weight.
   */
  "physical_education",
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
  /**
   * The family's own closing motto/prayer/Kindred words (build-order step
   * 8) — the LAST step of the locked daily closing sequence, after
   * Historical Figure Coloring/stretching/reflection. Deliberately a
   * plain, family-authored string with NO default and NO AI-generated
   * fallback: the exact wording was explicitly not supplied at spec time
   * and must never be invented (see curriculum/gap_analysis's "Kindred
   * closing language" deferral). Undefined/empty means the closing UI
   * shows nothing here yet rather than fabricating placeholder text —
   * teacher-writable directly (same `families/{familyId}` write rule as
   * every other family setting).
   */
  closingWords?: string;
}

export interface UserProfile {
  familyId: string;
  displayName: string;
  role: Role;
  // "Kira" | "Ro" | "Nova" | null — set only for STUDENT accounts by the
  // seed script; always null for teachers. Purely a cosmetic display label
  // (shown in parentheses next to a student's name) — never read for
  // identity/security logic anywhere in the codebase. Superseded for that
  // purpose by presentationIdentityId below (build-order step 9); kept
  // as-is for backward compatibility with existing display code and
  // existing account records, which this step does not touch.
  characterMapping: string | null;
  gradeLabel: string | null; // students only
  assessmentBaseline: Record<string, string>; // subjectName -> free-text starting point
  /**
   * Stable presentation-identity ID (build-order step 9) — see
   * identity/presentationIdentity.ts for the full registry and locked
   * mapping (Cory -> "jasper", Sarah -> "celeste", Millaray -> "kira",
   * Makaio -> "ro", Maizely -> "nova"). Set only by the explicit,
   * teacher-initiated assignPresentationIdentity callable — never inferred
   * from displayName, email, or characterMapping, and never auto-migrated.
   * `null` (the default for every account created before this field
   * existed, and for any new account until a teacher explicitly assigns
   * one) means "not yet bootstrapped" — every consumer of this field must
   * handle that case explicitly rather than assuming it's always set.
   *
   * PRESENTATION ONLY: this field is never authoritative for security or
   * authorization. Every callable continues to derive authority from the
   * authenticated uid, `familyId`, and `role` exactly as before — see
   * util/auth.ts, unchanged by this step.
   */
  presentationIdentityId: PresentationIdentityId | null;
}

// --- Stable presentation identities (build-order step 9) ---
//
// Real people and presentation identities are deliberately separate
// concepts. A presentation identity is a stable, lowercase, never-reused
// identifier for how a family member is PRESENTED in the app's own voice
// (Jasper's Morning Message, the Historical-Figure-Coloring host, teacher
// labels, Ask-a-Teacher routing) — it carries no security meaning by
// itself. See identity/presentationIdentity.ts for the registry (role,
// display label, specialty areas, and — for a student identity — which
// PlacementKidKey it corresponds to) and assignPresentationIdentity
// (identity/presentationIdentity.ts) for the only way this is ever set.
export type TeacherPresentationIdentityId = "jasper" | "celeste";
export type StudentPresentationIdentityId = "kira" | "ro" | "nova";
export type PresentationIdentityId = TeacherPresentationIdentityId | StudentPresentationIdentityId;

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
  /**
   * Set only on a log written by evidencePackets.ts's approval flow
   * (build-order step 6) — the one governed path from an approved
   * EndOfDayEvidencePacket to official instructional minutes. Absent on
   * every pre-step-6 record and on every ordinary manually-logged entry
   * (LogActivityPage) — both keep counting toward dashboard/compliance
   * totals exactly as before; this field is provenance only, getActualHoursToDate
   * (dashboard.ts) does not filter on it. See evidencePackets.ts's top
   * comment for the full legacy-compatibility rule.
   */
  evidencePacketId?: string;
  /**
   * Explicit classification (build-order step 6.1) — absent means
   * "manual" (legacy compatibility: nothing before this field existed
   * has it, and it still counts). Never used to exclude a record from
   * dashboard.ts's totals — see LogProvenance's doc comment and
   * curriculum/hourAggregation.ts.
   */
  provenance?: LogProvenance;
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

/**
 * Non-Proposal event families that write into the SAME `auditEvents`
 * collection as the propose/approve/reject flow above (build-order step 9,
 * section 14: "use the existing audit architecture where practical rather
 * than creating a second unrelated audit system"; step 10 extends the same
 * reasoning to the Quality Feedback Queue's lifecycle). Deliberately NOT
 * routed through createProposal/approveProposal/rejectProposal
 * (approvals.ts) — none of these is a "propose a payload, get it
 * reviewed, commit or reject it" decision, so forcing them through that
 * state machine would distort it rather than reuse it. What IS reused:
 * the one collection, the one record shape, and the same family-scoped
 * read rule.
 */
export type AuditEventKind =
  | ProposalKind
  | "presentationIdentityAssignment"
  | "helpRequest"
  | "curriculumQualityIssue";
export type AuditEventAction =
  | AuditAction
  | "assigned"
  | "created"
  | "responded"
  | "escalated"
  | "resolved"
  | "severityChanged"
  | "quarantined"
  | "quarantineReleased";

export interface AuditEvent {
  kind: AuditEventKind;
  action: AuditEventAction;
  /** The proposal id for a Proposal-kind event; the assigned account's uid for "presentationIdentityAssignment"; the help request's or quality issue's doc id otherwise. Always the primary subject of the event either way. */
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

// --- Historical Figure Coloring (build-order step 1 contract; selection
// logic and day-plan/evidence wiring is step 8) ---
//
// A short daily CLOSING activity, not a history lesson: one real
// historical person, a coloring page, brief show-and-tell/recall, and a
// teacher-observed retention note. Supersedes the retired subject-ring
// color-sheet rotation (curriculum/colorSheetRotation.ts) — independent
// of subject/hours entirely (see below), never tied to a LearningBlock.
//
// These types were originally defined directly in
// curriculum/historicalFigureSelector.ts (step 1); moved here in step 8
// alongside every other domain's schema (LearningBlock, EvidenceBlockEntry,
// etc.) so ProposedDay/EndOfDayEvidencePacket below can reference them —
// types.ts is the dependency root and never imports from curriculum/*.
// historicalFigureSelector.ts still holds the actual selection/generation
// LOGIC that operates on these shapes, importing them back from here like
// every other curriculum/*.ts file does.

/** Whether a printable art asset for a figure actually exists yet — never assumed true. */
export type ArtworkAvailabilityStatus = "available" | "unavailable";

/**
 * Rights status for ARTWORK specifically — deliberately separate from a
 * figure's historical-fact `provenance` below (build-order step 8,
 * requirement 7: "historical facts and artwork provenance are separate
 * concerns"). `"unknown_unverified"` is the safe default whenever rights
 * haven't been explicitly confirmed — see
 * historicalFigureSelector.ts#isArtworkApprovedForPrinting, which treats
 * this status as never-printable regardless of `status` above.
 */
export type ArtworkRightsStatus = "public_domain" | "licensed" | "family_owned" | "generated_owned" | "unknown_unverified";

export interface HistoricalFigureArtwork {
  status: ArtworkAvailabilityStatus;
  rightsStatus: ArtworkRightsStatus;
  sourceTitle?: string;
  urlOrFileRef?: string;
  allowedUseNotes?: string;
}

/**
 * Whether a HistoricalFigure's biographical facts have actually been
 * traced to a specific, checkable source — build-order step 8.1
 * correction. Step 8's original catalog gave every entry
 * `sourceTitle: "General historical record (public domain facts)"`,
 * which is a real person's real facts but NOT a traceable source
 * packet — an honest audit found that structurally claiming
 * "provenance" while the content underneath is unverified general
 * knowledge is exactly the "claims provenance without adequate source
 * material" problem the instruction called out. A real person's
 * identity being real does NOT make the content verified — those are
 * two separate claims. `"unverified"` is therefore the correct default
 * for a hand-authored catalog built from general knowledge rather than a
 * cited source packet; `"verified"` is reserved for an entry that has
 * actually been checked against a specific, named, checkable source
 * (recorded in `sourceTitle`/`urlOrFileRef`/etc.), which no entry is yet.
 */
export type ProvenanceVerificationStatus = "unverified" | "verified";

/** Source/rights discipline for the historical FACTS (name/era/bio) — never for artwork, see HistoricalFigureArtwork above. */
export interface HistoricalFigureProvenance {
  sourceTitle: string;
  authorOrInstitution?: string;
  urlOrFileRef?: string;
  retrievedOrVersionDate?: string;
  rightsStatus: string;
  allowedUseNotes?: string;
  verificationStatus: ProvenanceVerificationStatus;
}

/**
 * A real historical person available for the coloring/show-and-tell
 * feature — hand-authored in curriculum/historicalFigureCatalog.ts, never
 * invented by an AI call at generation time (build-order step 8,
 * requirement: "do not let the AI invent source provenance" / "do not
 * fabricate historical people"). Selection and prompt text are both
 * deterministic, template-based functions over this catalog — see
 * historicalFigureSelector.ts's doc comment for why no AI call is made
 * for this feature at all.
 */
export interface HistoricalFigure {
  /** Stable ID — never reuse after a figure is retired from the pool. */
  id: string;
  name: string;
  era: string;
  /** e.g. "Indigenous / pre-colonial", "Colonial America", "U.S. 19th century". */
  region: string;
  /** Concise, child-safe — a sentence or two, never a full biography. */
  briefBio: string;
  /** Concise — why this person is worth a child's exposure/familiarity. */
  whyItMatters: string;
  /** Curriculum tie-ins (subjects, week themes) used for upcoming-context selection weighting. */
  relevanceTags: string[];
  /**
   * Whether this figure is a safe pick for Maizley's AUTOMATIC selection
   * pool (see historicalFigureSelector.ts's toddler filter) — this only
   * ever REMOVES a figure from her pool, never adds written-work
   * complexity for her when true (presentation still adapts by age
   * regardless).
   *
   * CORRECTED SEMANTIC (build-order step 8.1 — the original doc comment
   * conflated this with "did this person's adult story involve
   * combat/war," which is neither necessary nor sufficient): this means
   * "does an adequately simple, honest, non-graphic presentation of this
   * person exist using the brief context already on this record" —
   * NOT "did this person live a peaceful life." A figure whose defining
   * act was violent can still be `true` if an honest, simple ALTERNATE
   * framing exists for them (e.g. George Washington: "became the first
   * president" stands on its own without discussing the war at all).
   * Conversely, a figure with no combat in their story at all could in
   * principle be `false` if their only real significance requires a
   * concept too abstract or nuanced to introduce honestly at 2.5 — this
   * catalog doesn't currently have such a case, but the field is defined
   * to allow for one rather than assuming "no violence = automatically
   * fine." See historicalFigureCatalog.ts's per-entry comments for the
   * actual reasoning behind each `false`.
   */
  toddlerAppropriate: boolean;
  provenance: HistoricalFigureProvenance;
  artwork: HistoricalFigureArtwork;
}

/** Art-ability band per kid — how much line-art detail their coloring page should carry. Carried over from the retired color-sheet system's BAND_BY_KID. */
export const ART_COMPLEXITY_BAND_BY_KID: Record<PlacementKidKey, string> = {
  millaray: "Band C (detailed scene, background allowed, ~15-20 min to color)",
  makaio: "Band B (one clear scene, 4-8 objects, some interior detail)",
  maizley: "Band A (2-4 giant objects, thick outlines, no background)",
};

/**
 * One kid's featured historical figure for one school day — planning-time
 * content, generated once and frozen exactly like `jasperMessage`
 * (immutable original on ProposedDay, current copy in
 * ProposedDayDraft, never silently replaced once approved — see
 * proposedDays.ts). `null` only for a "nonInstructional" day (no closing
 * routine happens at all).
 */
export interface HistoricalFigureClosingPlan {
  figureId: string;
  /** Why this figure was chosen today (variety/relevance reasoning), for teacher review before approval. */
  selectionReason: string;
  artComplexityBand: string;
  /** Deterministic, template-based, age-differentiated — see historicalFigureSelector.ts. Examples only, not required hardcoded wording. */
  showAndTellPrompt: string;
  recallQuestion: string;
  /**
   * Copied from the selected HistoricalFigure's provenance at selection
   * time (build-order step 8.1) so the teacher review UI can show it
   * without the web app needing access to the backend catalog — never
   * silently "verified" just because the person is real; see
   * types.ts's ProvenanceVerificationStatus doc comment.
   */
  sourceVerificationStatus: ProvenanceVerificationStatus;
}

/**
 * The teacher-recorded EVIDENCE side of the day's Historical Figure
 * Closing — lives on EndOfDayEvidencePacket, seeded (figureId only) from
 * the approved ProposedDay's HistoricalFigureClosingPlan at packet-open
 * time, exactly like EvidenceBlockEntry copies its plan fields from
 * LearningBlock. `retentionObservation`/`teacherNote` are the only
 * fields a teacher ever writes here (recordHistoricalFigureRetention,
 * evidencePackets.ts), while the packet is still "open" — frozen forever
 * once approved, same rule as every other packet field.
 *
 * DELIBERATELY separate from the 2-of-3 objective mastery system
 * (build-order step 8, requirement 10): a single 1-10 observation is
 * preserved historically as its own kind of evidence, never auto-mapped
 * to "mastered"/"not mastered" — nothing in evidenceMastery.ts reads this
 * field, and nothing here writes to masteryRecords. A future step could
 * define an explicit mapped-objective/evidence policy to bridge the two;
 * until then they stay independent on purpose.
 */
export interface HistoricalFigureClosingEvidence {
  figureId: string;
  /** Whether the closing routine actually happened for this figure — distinct from whether it's been scored yet. */
  completed: boolean;
  /** 1-10 teacher-observed retention/demonstration rating; null until recorded. See curriculum/evidenceValidation.ts#isValidRetentionObservation. */
  retentionObservation: number | null;
  teacherNote?: string;
  /** Optional — a photo of the physically-completed coloring page, when the family chooses to preserve one. Reuses the existing generic ArtifactReference rather than a competing artwork-history model. */
  preservedArtwork?: ArtifactReference;
  recordedByUid?: string;
  recordedAt?: Timestamp;
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
   * The day's Historical Figure Coloring closing activity (build-order
   * step 8) — generated deterministically alongside everything else
   * above, same immutable-original/current-draft split (see
   * ProposedDayDraft.historicalFigureClosing). `null` only for a
   * "nonInstructional" day; present for both "ordinary" and
   * "alternativePackage" days, since the closing routine is part of the
   * normal school day regardless of what the academic content looks like
   * today. Independent of `learningBlocks`/`Subject` entirely — never
   * hour-bearing, never a LearningBlock, so it cannot affect instructional
   * hour totals or the 28 hrs/week requirement by construction (see
   * curriculum/historicalFigureSelector.ts's doc comment).
   */
  historicalFigureClosing: HistoricalFigureClosingPlan | null;
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
  /** Current copy of ProposedDay.historicalFigureClosing — same "seeded, not yet independently editable via saveProposedDayDraft" status as learningBlocks above. */
  historicalFigureClosing: HistoricalFigureClosingPlan | null;
  /** 0 for the seeded, never-actually-edited copy created at generation time; increments by 1 on each saveProposedDayDraft call. */
  revision: number;
  lastEditedByUid: string;
  lastEditedAt: Timestamp;
}

// --- End-of-day evidence / completion / actual instructional time
// (Builder Guide; build-order step 6) ---
//
// CORE AUTHORITY RULE: a generated/approved ProposedDay is a PLAN. It
// never becomes evidence merely because it was scheduled — completion,
// actual minutes, and objective evidence all live here instead, in a
// wholly separate collection (evidencePackets), keyed back to the source
// ProposedDay/block/objective for full traceability. ProposedDay itself
// is never mutated by closeout — its LearningBlock.completionState stays
// "not_started" forever, exactly as step 5 left it; this collection is
// what actually tracks "what happened." AI may organize/summarize/
// propose evidence (a future step, not built here); it never certifies
// that learning occurred — every packet requires a real teacher approval
// before anything in it can affect mastery or official hours.

export type EvidencePacketStatus = "open" | "approved";

/**
 * "not_started"/"in_progress"/"completed" are the real states a block
 * moves through during the day. "excused" is a fourth, carefully-scoped
 * state (build-order step 6, requirement 3): a REQUIRED block the
 * teacher has explicitly decided NOT to hold the student to today (for a
 * good reason — captured in excusedReason, always required when this
 * state is set). Its effect: excused work does NOT become a carry-
 * forward candidate (unlike not_started/in_progress), does NOT produce
 * mastery evidence (no objectiveEvidence is expected against it), and
 * does NOT imply any minutes were spent (reportedMinutes is whatever the
 * teacher actually reports, typically 0/unset) — but it is NOT the same
 * as "completed": nothing was demonstrated, so it must never be treated
 * as evidence that the objective was learned.
 */
export type PacketBlockCompletionState = "not_started" | "in_progress" | "completed" | "excused";

/** Who/what produced a piece of evidence — WBK remains the authority interpreting it regardless of source (build-order step 6, requirement 18: apps are identifiable but not yet integrated). */
export type EvidenceSourceType =
  | "teacher_observation"
  | "student_response"
  | "worksheet"
  | "app_activity"
  | "field_activity"
  | "project"
  | "assessment";

/** How the objective was actually demonstrated — deliberately includes Maizley's non-written demonstration modes alongside ordinary written/verbal ones; nothing here forces a written test. */
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

/**
 * "correct"/"incorrect" are the ordinary right/wrong outcomes; "observed_strong"/
 * "observed_weak" are their non-binary-check equivalents for a teacher's
 * firsthand judgment call ("she clearly has this" / "still shaky") where
 * there's no single right-answer check to grade. "partial" and
 * "not_applicable" are preserved as real evidence but deliberately do
 * NOT feed the existing binary 2-of-3 mastery threshold — see
 * curriculum/evidenceMastery.ts's mapOutcomeToMasteryBoolean and its doc
 * comment on this exact boundary.
 */
export type EvidenceOutcome = "correct" | "incorrect" | "partial" | "observed_strong" | "observed_weak" | "not_applicable";

/**
 * Typed reference/metadata only (build-order step 6, requirement 13) —
 * deliberately NOT a media-storage system. `url` is optional and only
 * ever set when a file already exists somewhere (e.g. the existing
 * uploads/Storage flow) — routine schoolwork never requires a photo.
 */
export interface ArtifactReference {
  kind: "worksheet" | "notebook_page" | "drawing" | "project" | "field_observation" | "app_activity" | "photo" | "other";
  description: string;
  url?: string;
}

/**
 * One piece of evidence toward one objective. `assessmentEligible` is
 * this item's OWN "Do Not Use for Assessment" flag — the finest of the
 * three granularities (result/block/day; see EvidenceBlockEntry.assessmentEligible
 * and EvidencePacketDraft.dayAssessmentEligible). `recordedByUid`/
 * `recordedAt` are always server-set from the calling teacher, never
 * trusted from client input.
 */
export interface ObjectiveEvidenceItem {
  objectiveId: string;
  demonstrationType: EvidenceDemonstrationType;
  outcome: EvidenceOutcome;
  sourceType: EvidenceSourceType;
  /** Free-text teacher observation, e.g. "explained regrouping correctly aloud, no prompting." Legitimate evidence on its own — no AI-generated quiz result is required for this item to exist. */
  observation?: string;
  assessmentEligible: boolean;
  recordedByUid: string;
  recordedAt: Timestamp;
  artifacts?: ArtifactReference[];
}

/**
 * One block's closeout record. `blockId`/`subject`/`title`/`required`/
 * `objectiveIds`/`plannedMinutes`/`sourceQuarterCertificationId`/
 * `sourceWeeklyCertificationId`/`carryForward` are all copied from the
 * source ProposedDay's approved LearningBlock at packet-creation time and
 * NEVER accepted from client input on save (evidenceValidation.ts) —
 * only a teacher's own observations/minutes/completion/eligibility are
 * ever client-writable. `plannedMinutes` (the plan's estimate),
 * `reportedMinutes` (what the teacher reports actually happened, editable
 * while the packet is open), and `approvedMinutes` (frozen, set ONCE at
 * approval from whatever reportedMinutes was at that moment) are three
 * deliberately separate fields — see build-order step 6, requirement 4:
 * "do not overwrite one with another."
 */
export interface EvidenceBlockEntry {
  blockId: string;
  subject: Subject;
  title: string;
  required: boolean;
  objectiveIds: string[];
  plannedMinutes: number;
  reportedMinutes: number | null;
  /** null until the packet is approved; then frozen forever at whatever reportedMinutes was. */
  approvedMinutes: number | null;
  completionState: PacketBlockCompletionState;
  /** Required and non-empty whenever completionState is "excused" — see that type's doc comment. */
  excusedReason?: string;
  notes?: string;
  /** This block's own "Do Not Use for Assessment" flag, independent of dayAssessmentEligible and each evidence item's own flag — all three are combined (see evidenceMastery.ts#isEvidenceEligibleForMastery). Seeded from the source ProposedDay's blockAssessmentExclusions when present. */
  assessmentEligible: boolean;
  objectiveEvidence: ObjectiveEvidenceItem[];
  sourceQuarterCertificationId: string | null;
  sourceWeeklyCertificationId: string | null;
  /** Preserved from the source block when IT was itself a carried-forward block — carry-forward provenance survives another generation, not just one hop. */
  carryForward?: CarryForwardProvenance;
}

export interface EvidencePacketDraft {
  blocks: EvidenceBlockEntry[];
  /** Whole-day "Do Not Use for Assessment" — seeded from the source ProposedDay's dayAssessmentEligibility when present, editable here independently afterward. */
  dayAssessmentEligible: boolean;
  dayNotes?: string;
  /** 0 for the seeded, never-actually-edited copy created at packet open; increments by 1 on each saveEvidencePacketDraft call. Same optimistic-concurrency pattern as ProposedDayDraft.revision (checkDraftRevision). */
  revision: number;
  lastEditedByUid: string;
  lastEditedAt: Timestamp;
}

// --- Post-approval projection state (build-order step 6.1) ---
//
// An approved packet is authoritative the instant it's approved — that
// boundary never moves. But turning it into official hours and mastery
// evidence are separate, independently-fallible DOWNSTREAM projections,
// and step 6 originally only tracked "done or not done" (a bare
// timestamp), with no way to represent or surface "attempted and
// failed." This makes that explicit, so a teacher never has to inspect
// Firestore to discover a stuck packet.
export type ProjectionStatus = "pending" | "applied" | "failed";

export interface ProjectionState {
  status: ProjectionStatus;
  lastAttemptAt: Timestamp;
  /** Set only when status becomes "applied" — never touched again after that (a projection that has succeeded is never re-run; see curriculum/evidenceProjection.ts#needsProjection). */
  appliedAt?: Timestamp;
  /** A concise message only (curriculum/evidenceProjection.ts#summarizeError truncates and never stores a raw stack trace or any secret) — present only when status is "failed". */
  error?: string;
}

/**
 * One per (family, student, date) — deliberately a DETERMINISTIC doc id
 * (`${familyId}_${studentId}_${date}`, see curriculum/evidencePacketStore.ts)
 * rather than an auto-id/version-number scheme like ProposedDay: a packet
 * is teacher-authored once per day, never AI-regenerated, so there's
 * nothing to "supersede." Immutable once approved — `draft` is the
 * single mutable "current" object while status is "open", frozen (no
 * longer editable) once approved, exactly like ProposedDayDraft. Later
 * correction of an approved packet is explicitly OUT OF SCOPE for step 6
 * — this model is intentionally immutable-once-approved, with the
 * correction path reserved (see the step 6 report's "conflicts/decisions
 * discovered") rather than built now.
 */
export interface EndOfDayEvidencePacket {
  familyId: string;
  studentId: string;
  date: string; // ISO "YYYY-MM-DD"
  /** The APPROVED ProposedDay this packet closes out — a packet can only ever be opened against an approved plan, never a still-pending proposal. */
  sourceProposedDayId: string;
  sourceProposalVersion: number;
  status: EvidencePacketStatus;
  createdAt: Timestamp;
  createdByUid: string;
  draft: EvidencePacketDraft;
  approvedByUid?: string;
  approvedAt?: Timestamp;
  /**
   * Set once, after approval, by the post-approval side-effect pass that
   * posts official instructional minutes to `logs` (evidenceHours.ts) —
   * guards against re-running that pass and double-posting if a retried
   * call somehow lands between the approval transaction committing and
   * the side-effect pass finishing (build-order step 6, requirement:
   * "official hour posting is idempotent").
   */
  /**
   * Independent, explicit processing state for each post-approval
   * projection (build-order step 6.1 — replaces step 6's plain
   * hoursPostedAt/masteryAppliedAt timestamps, which couldn't represent
   * "attempted and failed" at all). The approval boundary itself
   * (status/approvedByUid/approvedAt above) never changes once set —
   * an approved packet stays approved even if a projection fails; only
   * these two fields track whether its DOWNSTREAM effects have actually
   * landed. See curriculum/evidenceProjection.ts.
   */
  hoursProjection: ProjectionState;
  masteryProjection: ProjectionState;
  /**
   * Seeded at packet-open time from the source ProposedDay's
   * `historicalFigureClosing` (figureId only — `null` when that day had
   * none, e.g. a day generated before this field existed, or one with no
   * closing routine). Undefined only for a packet opened before this
   * field existed at all (legacy compatibility) — never written back to
   * `undefined` afterward. See evidencePackets.ts#openEvidencePacket and
   * evidencePackets.ts#recordHistoricalFigureRetention.
   */
  historicalFigureClosing?: HistoricalFigureClosingEvidence | null;
}

/**
 * One per (evidence packet, objective-evidence item) that has actually been
 * applied to a mastery record — deterministic id `${packetId}_${evidenceId}`
 * (see curriculum/evidenceMastery.ts#masteryApplicationDocId). Written in the
 * SAME transaction as the masteryRecords update it caused (step 6.2 — this
 * replaces step 6.1's `appliedMasteryEvidenceIds` array, which was updated
 * via a SEPARATE, non-atomic write after recordMasteryResult and so left a
 * real crash window between "mastery record updated" and "marked applied").
 * This one collection now serves BOTH jobs: the exactly-once idempotency
 * guard (existence of the doc = already applied, checked inside the same
 * transaction that would otherwise re-apply it) and the historical record of
 * which approved evidence item caused which mastery effect. Deliberately
 * minimal — no evidence content/observation text, just the identifiers
 * needed to answer "which evidence caused this."
 */
export interface MasteryApplicationRecord {
  packetId: string;
  evidenceId: string;
  objectiveId: string;
  subject: Subject;
  userId: string;
  familyId: string;
  correct: boolean;
  appliedAt: Timestamp;
}

// --- Ask-a-Teacher help requests (build-order step 9) ---
//
// A structured student -> Celeste -> Jasper escalation path, NOT an
// unrestricted AI tutor chat and NOT a chat/social feed. A small controlled
// set of request categories (age-appropriate, no typing required) so even
// Maizely can raise her hand. References the student's current work by
// stable id rather than duplicating any curriculum content into the
// request. See identity/helpRequests.ts for the callables that create,
// respond to, resolve, and escalate a request, and for how this relates to
// certificationGate.ts's "Curriculum Assistance Required" (blocked_missing)
// state — that is a separate, system-level content-readiness gate on NEW
// plan generation, not a live student help request; the two are unrelated
// and coexist without conflict.
export type HelpRequestCategory =
  | "dont_understand"
  | "directions_unclear"
  | "think_content_is_wrong"
  | "cannot_complete"
  | "need_teacher"
  | "other";

export type HelpRequestStatus = "open" | "resolved";

/** Who currently owns this request. Default routing is always "celeste" — escalation to "jasper" is a deliberate teacher action, never inferred from category or AI guesswork. */
export type HelpRequestEscalationLevel = "celeste" | "jasper";

/**
 * Stable references to what the student was working on, so the teacher has
 * enough context without the request duplicating any curriculum content.
 * All optional — a request can be raised with no specific reference at all
 * (e.g. a general "I need my teacher").
 */
export interface HelpRequestReference {
  proposedDayId?: string;
  blockId?: string;
  objectiveId?: string;
}

/**
 * One teacher note/response on a request — an array so a back-and-forth
 * (first-level response, then an escalation note) stays fully visible
 * rather than overwriting a single field. Never editable/deletable by a
 * student (see firestore.rules' `helpRequests` — callable-write-only).
 */
export interface HelpRequestTeacherNote {
  note: string;
  byUid: string;
  byRole: Role;
  at: Timestamp;
}

export interface HelpRequest {
  familyId: string;
  studentId: string;
  category: HelpRequestCategory;
  /**
   * The student's own words when they can/did type one, OR a canonical
   * category label filled in server-side when absent (the no-typing path —
   * required for Maizely, available to anyone). Never fabricated beyond
   * that fixed per-category label; never an AI-authored summary.
   */
  message: string;
  reference: HelpRequestReference;
  status: HelpRequestStatus;
  escalationLevel: HelpRequestEscalationLevel;
  createdAt: Timestamp;
  /** The student's own uid for a self-raised request, or the assisting teacher's uid for a teacher-assisted request (Maizely's flow) — see createHelpRequest. */
  createdByUid: string;
  resolvedAt?: Timestamp;
  resolvedByUid?: string;
  teacherNotes: HelpRequestTeacherNote[];
}

// --- Curriculum Quality Feedback Queue (build-order step 10) ---
//
// A structurally SEPARATE concern from Ask-a-Teacher (a student needing
// help with correct material) and from certificationGate.ts's "Curriculum
// Assistance Required" blocked_missing state (content that's simply
// ABSENT). This is for suspected DEFECTS in curriculum content that
// exists — a factual error, broken activity, bad answer key, unsafe
// instruction, etc. Teacher authority is final: nothing here is ever
// created automatically from a student's help request, and no AI ever
// assigns an authoritative severity — see curriculumQualityIssues.ts.
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

/**
 * Teacher-chosen/confirmed only — never AI-assigned (spec section 5). A
 * safety-related category (unsafe_instruction, age_inappropriate) may be
 * surfaced prominently in the UI, but the stored severity is always
 * whatever the teacher selected, never inferred from the category.
 */
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

/**
 * Stable references to what the issue concerns — never a full curriculum
 * document. `helpRequestId` is set when a teacher deliberately promoted a
 * student's Ask-a-Teacher request into a curriculum-defect determination
 * (spec section 6) — that promotion is always an explicit, separate
 * teacher action (createQualityIssue), never automatic.
 */
export interface CurriculumQualityIssueReference {
  studentId?: string;
  proposedDayId?: string;
  blockId?: string;
  objectiveId?: string;
  helpRequestId?: string;
}

/**
 * The exact, narrowest stable content version an issue/quarantine
 * concerns — a per-kid, per-week content hash (contentHash.ts#
 * hashWeekContent), the SAME hash the certification system already
 * computes and compares, never a new hashing scheme and never the raw
 * content itself. `weeklyCertificationId` is traceability only (which
 * certification record this hash was captured from, when one exists) —
 * the match key for quarantine enforcement is always `contentHash`
 * itself, so a quarantine only ever blocks the EXACT flagged version,
 * never a corrected one that replaces it, and never an entire subject/
 * objective/quarter.
 */
export interface CurriculumContentVersionReference {
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
  contentHash: string;
  weeklyCertificationId: string | null;
}

/**
 * A quarantine is state on its issue, not a separate record — this is
 * what keeps "issue resolved" and "quarantine released" conceptually
 * (and structurally) independent (spec section 9): resolving an issue
 * never flips `active` to false, and releasing a quarantine never changes
 * `status`. `active: false` with a `releasedAt` is a released quarantine,
 * preserved for history, exactly like an approved Proposal is never
 * deleted.
 */
export interface CurriculumQuarantine {
  active: boolean;
  quarantinedByUid: string;
  quarantinedAt: Timestamp;
  releasedByUid?: string;
  releasedAt?: Timestamp;
  releaseNote?: string;
}

export interface CurriculumQualityIssue {
  familyId: string;
  reporterUid: string;
  reference: CurriculumQualityIssueReference;
  /** null when this issue doesn't concern a specific content version (e.g. a general process complaint) — such an issue can never be quarantined, only resolved. */
  contentVersion: CurriculumContentVersionReference | null;
  category: CurriculumQualityIssueCategory;
  severity: CurriculumQualityIssueSeverity;
  description: string;
  status: CurriculumQualityIssueStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedByUid?: string;
  resolutionAction?: CurriculumQualityResolutionAction;
  resolutionNote?: string;
  quarantine: CurriculumQuarantine | null;
}

// --- Student-safe published day (build-order step 11 — Phase 1 family
// test readiness) ---
//
// `proposedDays` stays exactly as teacher-only as it always has been — a
// student is never granted read access to it (section 2's audit
// requirement: never unapproved proposals, superseded drafts, teacher-
// only draft content, an edited-before-approval original, a sibling's
// day, or teacher notes/governance metadata). Instead, `approveProposedDay`
// (proposedDays.ts) writes ONE narrow, explicitly-chosen projection into
// this SEPARATE collection, in the SAME transaction as approval itself —
// see curriculum/publishedDay.ts#buildPublishedDayProjection for exactly
// which fields are copied and why each one is safe. A student's Firestore
// rule then only ever needs `isOwner(resource.data.studentId)` against
// THIS narrow collection, never against `proposedDays` itself.
//
// Deterministic id (`${familyId}_${studentId}_${date}`, same formula as
// evidencePacketStore.ts#evidencePacketDocId) — one per school day,
// written once at approval and never mutated afterward (an approved
// ProposedDay is never regenerated — see proposedDays.ts's doc comment —
// so there is nothing for this projection to be re-derived from later).

/** The one piece of live state a PublishedLearningBlock carries that isn't frozen at approval — see studentProgress.ts. Deliberately excludes "excused," a teacher-only concept a student can never set (section 5). */
export type StudentBlockProgressState = "not_started" | "in_progress" | "completed";

export interface PublishedLearningBlock {
  blockId: string;
  subject: Subject;
  title: string;
  stage: InstructionalStage;
  estimatedMinutes: number;
  required: boolean;
  order: number;
  dependsOn: BlockDependency[];
  teacherLocked: boolean;
  activityFormat?: ActivityFormat;
  /** Free-text directions/description, when the plan included any — never fabricated when absent. */
  notes?: string;
  /** True when this block's work carried forward from an earlier day — shown to the student as a plain indicator, never the internal fromProposedDayId reference (see CarryForwardProvenance). */
  carriedForward: boolean;
  carryForwardReason?: string;
}

/**
 * Age-appropriate, student-facing Historical Figure Closing content —
 * denormalized from HistoricalFigureCatalog at publish time (the catalog
 * itself is static, hand-authored, public-domain content, exactly like
 * ART_COMPLEXITY_BAND_BY_KID already being copied onto
 * HistoricalFigureClosingPlan at selection time — see that type's doc
 * comment) so the student client never needs backend catalog access.
 * `artworkAvailable` is always the honest, current
 * isArtworkApprovedForPrinting result (build-order step 8/11) — never
 * assumed true; every entry today has none, and the UI must say so rather
 * than pretend or fabricate an image (section 7).
 */
export interface PublishedHistoricalFigureClosing {
  figureId: string;
  name: string;
  era: string;
  briefBio: string;
  whyItMatters: string;
  artComplexityBand: string;
  showAndTellPrompt: string;
  recallQuestion: string;
  artworkAvailable: boolean;
}

export interface PublishedDay {
  familyId: string;
  studentId: string;
  date: string; // ISO "YYYY-MM-DD"
  proposedDayId: string;
  proposalVersion: number;
  itineraryMode: ItineraryMode;
  title: string;
  summary: string;
  planText: string;
  /** Resolved (edited ?? generated) — the student only ever sees the one final message, never both originals. */
  jasperMessage: string | null;
  learningBlocks: PublishedLearningBlock[];
  historicalFigureClosing: PublishedHistoricalFigureClosing | null;
  publishedAt: Timestamp;
}

// --- Student progress (build-order step 11) ---
//
// The smallest safe mechanism for a student's OWN activity to reach the
// teacher's closeout as a starting point (section 5/6) without a second,
// disconnected completion system: `updateBlockProgress` (studentProgress.ts)
// writes here, AND — when an EndOfDayEvidencePacket already exists and is
// still "open" for that day — mirrors the same state into that packet's
// `draft.blocks[blockId].completionState` at the same time, touching
// NOTHING else on the packet (never reportedMinutes, objectiveEvidence,
// assessmentEligible, or any teacher note/observation). When no packet
// exists yet, `openEvidencePacket` (evidencePackets.ts) seeds each block's
// initial completionState from this record instead of hardcoding
// "not_started" — either ordering ends at the same place: the teacher's
// closeout starts from what the student actually did.
export interface StudentBlockProgressEntry {
  state: StudentBlockProgressState;
  updatedAt: Timestamp;
}

export interface StudentDayProgress {
  familyId: string;
  studentId: string;
  date: string;
  /** Which approved day this progress belongs to — a defensive cross-check, not a security boundary (see studentProgress.ts#assertProgressMatchesPublishedDay). */
  proposedDayId: string;
  blocks: Record<string, StudentBlockProgressEntry>;
  updatedAt: Timestamp;
}
