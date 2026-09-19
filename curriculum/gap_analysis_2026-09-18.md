# WBK Curriculum System — Implementation Gap Analysis
**Against the three specification documents dated 2026-09-18:**
`WBK_Curriculum_Master_Specification`, `WBK_Curriculum_Builder_Guide`,
`WBK_Q1_Fall_Consolidated`

**Baseline:** the actual deployed repository as of commit `8d3dbd2`
(`claude/new-session-h2hnan`), verified by direct inspection of the code
below, not from memory — per the spec's own instruction to Claude Code
(Q1 doc §11) to reconcile against real repo files rather than fabricate.

This is analysis only. Nothing in the application was changed to produce
this document.

---

## Status (updated 2026-09-18, after your go-ahead on steps 1–2)

You confirmed the §1.1 decision (Historical Figure Coloring fully
replaces the subject-ring rotation) and approved the revised 11-step
build order below (§6). Completed so far, each its own small increment,
built/tested/committed/pushed to `claude/new-session-h2hnan`, **not
deployed**:

- **Step 1 — done.** `colorSheetRotation.ts` retired from every runtime
  path (kept in git history, deprecation header added, nothing deletes
  it); `getDailySubjectAssignments` no longer called from `generatePlan`.
  `getSchoolDayIndex` (unrelated generic day-index math, still needed by
  `loadCurriculumContent.ts`) moved to its own `schoolCalendar.ts`.
  `historicalFigureSelector.ts` added — the type contract only (person,
  era, region, provenance, art-complexity band); no selection algorithm
  yet, that's step 8.
- **Step 2 — done.** `functions/src/approvals.ts`: `createProposal`/
  `approveProposal`/`rejectProposal`, backed by new `proposals/{id}` and
  `auditEvents/{id}` Firestore collections, per Builder Guide §21.
  Additive only — the three existing ad hoc review flows (day-plan save,
  extracurricular confirm, placement-submission review) are untouched and
  keep working as before. Migrating them onto this primitive is separate,
  later work, not bundled into step 2. First real consumer will be step 3
  (quarter/weekly certification).

- **Step 3 — superseded by step 3.1 below**, per your review: the original
  cut certified per-kid, independently. Never deployed, so no migration
  was needed to replace it.
- **Step 3.1 — done, awaiting your review.** Certification corrected to a
  FAMILY instructional-package boundary: one teacher action certifies the
  whole family's quarter/week at once (`FamilyQuarterCertification`/
  `FamilyWeeklyCertification`), while every child's own content hash stays
  independently identifiable inside `childContent[]` — a governance
  boundary only, not a content merge. A deterministic hash-of-hashes
  (`contentHash.ts#hashFamilyPackage`) means any one child's material
  changing invalidates the family certification, and `diffStaleKidKeys`
  names exactly which child(ren) caused it. Single-teacher certification
  preserved — no two-teacher requirement.

  Also fixed the "no content = no gate" gap: `certificationGate.ts` is now
  an explicit six-state machine (certified / blocked-uncertified /
  blocked-missing-with-"Curriculum Assistance Required" / explicit
  alternative-package / explicit non-instructional / not-yet-governed).
  The last two (D/E) are reachable ONLY through a new, explicit
  teacher-declared `DayDesignation` record (`designateDay` callable) —
  never inferred from a missing file, verified by a dedicated test.

  `bootstrapExistingCertifications` now creates family-level bootstrap
  records (still per-child hashes preserved inside); not executed against
  production. 34 unit tests (up from 19).

- **Step 3.2 — done, awaiting your review.** Corrected the last gap in
  3.1: "quarter never certified" was still being treated as "nothing to
  enforce yet" regardless of governance state, so a brand-new Q2 would
  silently generate ordinary plans without ever being certified. Replaced
  with an explicit, family-level `curriculumGovernance` mode
  (`"legacy"` | `"governed"`) that defaults to `"legacy"` whenever unset —
  deploying this code can never by itself change a family's behavior.
  `bootstrapExistingCertifications` is now also the sole, idempotent
  legacy→governed activation trigger. Under `"governed"`, a quarter with
  no certification (or a stale one) now blocks outright, before the gate
  even looks at the week. 43 unit tests (up from 34). See the full report
  delivered separately for the complete state machine and test coverage.
  Still does not implement step 4 (two-day-ahead generation, Jasper
  Morning Message, itinerary).

- **Step 4 — done, awaiting your review.** Two-day-ahead daily proposal
  pipeline on top of the certification foundation: `certified quarter ->
  certified week -> proposed day -> teacher review/edit -> teacher
  approval -> published student day`. New `ProposedDay` schema
  (`functions/src/proposedDays.ts`), per (family, student, date), reusing
  `dayPlans.ts`'s certification-gate decision rather than duplicating it —
  the existing freeform `dayPlans`/`generatePlan`/`PlanDayPage.tsx` flow
  (field trips, one-offs) is completely untouched. Configurable lead time
  (`Family.dayGenerationLeadDays`, default 2 — not hardcoded "48 hours").
  Idempotent regeneration (unchanged source → skip; changed source → new
  version, old one preserved; approved → never touched, even if forced).
  Jasper Morning Message per student (`{generated, edited?}`, original
  never discarded). Strict/Flexible itinerary mode (Claude suggests,
  teacher picks at approval). `DayDesignation` respected — non-
  instructional skips the Claude call entirely, alternative-package still
  generates but grounds on the designation instead of ordinary curriculum.
  New teacher UI (`ProposedDaysPage.tsx`) for generate/review/approve. 61
  unit tests (up from 43). Does not build step 5's block/objective engine,
  PE, Historical Figure Coloring, or Ask-a-Teacher. See the full report
  delivered separately for the complete lifecycle and test coverage.

- **Step 4.1 — done, awaiting your review.** Focused hardening pass on
  step 4, before step 5: two fixes plus one architectural decision
  record.

  Recorded the decision that `proposedDays` is now authoritative for
  governed WBK schooling (generation → review → approval → publication →
  historical record); `dayPlans` stays legacy/freeform for
  teacher-prompted one-offs, not migrated or synced — documented in both
  files' top comments. Renaming/retiring `dayPlans` is deferred.

  Fixed teacher-draft loss: a `ProposedDay` now carries a mutable
  `draft` sub-object (title/summary/planText/jasperMessageEdited/
  itineraryMode/revision/lastEditedByUid/lastEditedAt), seeded at
  generation, editable via a new `saveProposedDayDraft` callable while
  the proposal is unapproved. The original AI-generated fields are now
  documented as permanent and never touched again. Optimistic-concurrency
  protection (`checkDraftRevision`) guards both the draft save and
  `approveProposedDay` itself — the latter re-checks the revision inside
  its own transaction (not just a pre-check), so approval can never
  silently commit over a newer saved draft. Required widening
  `approvals.ts`'s `commit` callback to allow async, verified backward
  compatible with every existing synchronous caller.

  Replaced the old "+2 calendar days" generation target with a
  school-day-aware calculation (`instructionalCalendar.ts`): Mon–Fri
  instructional by default, explicit `DayDesignation` overrides win
  (non-instructional days don't consume a lead slot; alternative-package
  days do), exposed via a new read-only `getGenerationTargetDate`
  callable the UI now calls instead of computing the date itself.

  77 unit tests (up from 61). No Firestore rules/index changes needed —
  `draft` is a new field inside the already Cloud-Function-only
  `proposedDays` collection. `dayPlans.ts`/`PlanDayPage.tsx` untouched
  (doc-comment-only change to the former). See the full report delivered
  separately for the complete schema, lifecycle, and test coverage.

- **Step 5 — done, awaiting your review.** Replaced step 4's placeholder
  `LearningBlockSummary` with a real block/objective model
  (`LearningBlock` in `types.ts`): stable server-assigned objective ids
  (`curriculum/objectiveId.ts` — deterministic, date/structure-derived,
  never from display text; reuses `WEEK1_OBJECTIVES` catalog ids and real
  mastery-record ids wherever they already exist), instructional stages,
  required-vs-enrichment, same-day dependencies, a pure Strict/Flexible
  eligibility function (`blockEligibility.ts`), carry-forward provenance
  (`carryForward.ts` — deliberately only treats "in_progress" work as
  outstanding, never "not_started," since nothing writes real completion
  data yet), retrieval/remediation intent representation, and "Do Not Use
  for Assessment" governance flags (`blockAssessmentExclusions`/
  `dayAssessmentEligibility` on `ProposedDay`, set via a new
  `setAssessmentEligibility` callable — never erases completion/
  instructional time/historical record, only marks evidence ineligible
  for a future adaptive-mastery consumer).

  Generation now asks Claude for structured blocks (plain-text objective
  descriptions + stage/minutes/required/same-block dependencies only —
  never an id, never final ordering) and validates/defaults every field
  server-side (`blockValidation.ts`), dropping individual malformed
  entries and falling back to one minimal block if nothing survives —
  never publishes garbage AI output. Same immutable-original/current-draft
  split as every other generated field (`learningBlocks` top-level vs.
  `draft.learningBlocks`) — not yet block-editable via `saveProposedDayDraft`
  in this step (review UI only inspects). `ProposedDaysPage.tsx` now shows
  each block's title/subject/objectives/stage/minutes/required-enrichment/
  dependencies/locks/carry-forward, and a pre-existing display bug (an
  approved day's list summary was reading the frozen original instead of
  the actually-approved draft) was found and fixed in the same file.

  137 unit tests (up from 77). One new Firestore composite index
  (`proposedDays`: familyId/studentId/status/date desc, for the
  carry-forward lookup) — no rules changes, since every new field lives
  inside the already Cloud-Function-only `proposedDays` collection.
  `dayPlans.ts`'s `generatePlan` and `PlanDayPage.tsx` untouched beyond an
  additive `StudentContext` extension. See the full report delivered
  separately for the complete schema, validation, eligibility, and test
  coverage.

- **Step 6 — done, awaiting your review.** The authoritative COMPLETION
  path, parallel to `proposedDays.ts`'s authoritative PLANNING path — a
  new `evidencePackets/{familyId}_{studentId}_{date}` collection
  (deterministic id, teacher-authored once per day, never AI-regenerated)
  distinguishing what was planned from what actually happened. Core
  authority rule preserved throughout: a generated/approved `ProposedDay`
  is never mutated by closeout — it stays a pure plan forever; the packet
  is the real record of completion, actual minutes, and evidence.

  Lifecycle: `openEvidencePacket` (seeds block-level completion/minutes/
  evidence-eligibility from the approved plan, idempotent) ->
  `saveEvidencePacketDraft` (any number of times, same optimistic-
  concurrency `checkDraftRevision` reused directly from step 4.1) ->
  `approveEvidencePacket`/`approveEvidencePackets` (batch, per-student
  audit trail preserved), which freezes `reportedMinutes` into
  `approvedMinutes` in one transaction, then — as two independently
  idempotent post-approval passes guarded by `hoursPostedAt`/
  `masteryAppliedAt` — posts official instructional minutes to `logs`
  and applies eligible evidence to the existing, unchanged 2-of-3 mastery
  threshold (`mastery.ts` untouched).

  Planned/reported/approved minutes kept as three genuinely separate
  fields, never overwritten into each other. Four completion states
  (not_started/in_progress/completed/excused — "excused" carefully
  scoped: never carries forward, never implies minutes, never implies
  mastery evidence). Hours are independent of assessment-eligibility and
  completion state entirely (`evidenceHours.ts`) — a poor result never
  erases legitimate instructional time. "Do Not Use for Assessment" now
  actually gates the mastery pipeline at all three granularities (day/
  block/result — `evidenceMastery.ts`'s `isEvidenceEligibleForMastery`),
  richer `EvidenceOutcome`s (including Maizley-compatible non-written
  demonstration types) collapsing to the existing binary threshold only
  where unambiguous. Carry-forward made real: `not_started` now counts as
  outstanding once a day is actually closed out (`evidencePacketStore.ts
  #computeCarryForwardFromPacket`), with `proposedDays.ts`'s
  `loadOutstandingCarryForward` preferring this real signal over step 5's
  original (still-correct, now largely-superseded) ProposedDay-based one.

  Legacy hour compatibility: `dashboard.ts#getActualHoursToDate` is
  completely untouched — every pre-step-6 log and every ordinary manual
  log keeps counting exactly as before; `evidencePackets.ts` is the only
  thing that ever writes a `logs` doc from packet data, and only after
  teacher approval. Using both the manual and governed paths for the same
  school day is a documented, accepted double-counting risk, not
  algorithmically reconciled (would be a second governance layer on an
  already-working, unrelated flow).

  New teacher UI (`/closeout`, `EndOfDayClosingPage.tsx`) for per-block
  completion/minutes/notes/evidence entry and batch approval. Self-caught
  and fixed while touching `index.ts`: step 5's `setAssessmentEligibility`
  had been built and tested but never actually wired into the exports
  list, so it was never deployable until now.

  181 unit tests (up from 137). Two new Firestore composite indexes for
  `evidencePackets` (no rules changes to `logs`; one new teacher-only-read
  rule for `evidencePackets` itself). `dashboard.ts`, `mastery.ts`,
  `certificationGate.ts`, `certificationStatus.ts`, and `dayPlans.ts`
  remain byte-for-byte untouched. See the full report delivered
  separately for the complete schema, lifecycle, and test coverage.

- **Step 6.1 — done, awaiting your review.** Focused hardening pass on
  step 6, before step 7: authoritative-record double-counting risk plus
  recoverable post-approval processing.

  Governed vs. legacy hours: `LogEntry` gained an explicit `provenance`
  ("manual" | "extracurricular" | "governedEvidence") — absent means
  "manual" for full legacy compatibility, and `dashboard.ts`'s ONE
  official-hour calculation (now extracted into a pure, tested
  `curriculum/hourAggregation.ts#sumInstructionalMinutes`, behavior-
  preserving) never gates on it. Real duplicate prevention stays exactly
  where it already was — `evidenceHours.ts`'s deterministic
  `hourLogDocId` — since automatically excluding a manual log that
  happens to share a date+subject with a governed packet would require
  the "same date + same subject = duplicate" assumption the instruction
  explicitly forbade. Instead, `LogActivityPage.tsx` now checks (via the
  same deterministic `evidencePackets` doc id, never fuzzy text) whether
  an approved packet already covers the date/subject being logged, and
  shows a dismissible warning requiring an explicit "this is a separate
  activity" acknowledgment before saving anyway — prevention through
  friction, not a hard block, and never touching the actual calculation.

  Recoverable processing: `EndOfDayEvidencePacket` replaced its old
  `hoursPostedAt`/`masteryAppliedAt` timestamps with explicit
  `hoursProjection`/`masteryProjection` states (pending/applied/failed,
  with `lastAttemptAt`/`appliedAt`/a concise `error` — never a raw stack
  trace), and a new `appliedMasteryEvidenceIds` per-item guard. The
  approval boundary itself never moves — a packet stays approved even if
  a projection fails. A new teacher-authorized `reconcileEvidencePacket`
  callable retries whichever projection is stuck, sharing the exact same
  `runProjections` code path approval itself uses. Mastery idempotency
  received special attention per the instruction: a packet-level flag
  alone can't protect against a crash between individual mastery writes,
  so each objective-evidence item now has a deterministic
  `evidenceId` ("{blockId}:{index}"), applied one at a time with its id
  persisted immediately after each success — a retry can re-select only
  the genuinely not-yet-applied items, never one already recorded.
  `EndOfDayClosingPage.tsx` now shows "Hours: Applied/Needs retry" and
  "Mastery: Applied/Needs retry" with a Retry button, so a stuck
  projection is visible without inspecting Firestore.

  207 unit tests (up from 181). No Firestore rules/index changes — every
  new field lives inside the already Cloud-Function-only `evidencePackets`
  doc or the already-permitted `logs` write paths, and the one new client
  read (a deterministic point lookup for the logging-page warning) is
  already covered by the existing teacher-read rule on `evidencePackets`.
  `mastery.ts`, `certificationGate.ts`, `certificationStatus.ts`, and
  `dayPlans.ts` remain byte-for-byte untouched; `dashboard.ts` changed
  only by extracting its existing row-filter into a separately-tested
  pure function — no calculation behavior changed. See the full report
  delivered separately for the complete provenance/dedup rule and
  processing-state lifecycle.

- **Step 6.2 — done, awaiting your review.** One narrowly-scoped
  verification/hardening task on top of step 6.1, before step 7: mastery
  projection exactly-once application.

  The crash window step 6.1 was asked to re-verify turned out to be real,
  confirmed by direct inspection rather than assumed: step 6.1's
  `applyEligibleEvidenceToMastery` wrote the mastery record
  (`recordMasteryResult`) and then, as a SEPARATE later call, marked the
  item applied via `FieldValue.arrayUnion` on the packet doc — two
  independent Firestore operations with a genuine gap between them. A
  crash in that gap left the mastery effect landed but the marker not
  landed, so a retry would re-select and re-apply the same evidence item,
  double-counting it in the 2-of-3 window. An arrayUnion being atomic by
  itself never protected against this — the unsafe part was always the
  separation between the two writes, not either write individually.

  Fix: the old packet-level `appliedMasteryEvidenceIds` array is gone,
  replaced by a new collection, `masteryApplications/{packetId}_
  {evidenceId}` (deterministic id), that does both jobs the array used to
  attempt and one it couldn't — exactly-once guard AND historical
  traceability (which approved evidence item caused which mastery
  result). For each eligible item, `evidenceMastery.ts` now opens ONE
  Firestore transaction that reads the guard doc and the mastery record,
  and — only if the guard doc doesn't already exist — writes both the
  next mastery record and the guard/traceability doc together, in the
  same commit. Firestore's "all reads before all writes" transaction
  contract is satisfied, and the two writes now succeed or fail as one
  unit: there is no instant where the mastery effect has landed but the
  marker hasn't, because they're the same commit. Concurrent
  reconciliation attempts are also covered: Firestore's own optimistic-
  concurrency retry ensures only one of two racing transactions can
  observe the guard doc absent and commit; the other observes it present
  on retry and no-ops. `mastery.ts` gained a pure `buildNextMasteryRecord`
  (extracted from `recordMasteryResult`, which is now a thin wrapper
  around it, unused behavior-wise by its two existing non-transactional
  callers) so the new transactional path can fold a result into a record
  it already read inside its own transaction, rather than doing a second,
  independent read. The 2-of-3/aced threshold logic itself
  (`applyMasteryResult`) is untouched.

  18 new unit tests (up from 207 to 225): a first-ever `mastery.test.ts`
  covering the 2-of-3/aced threshold and `buildNextMasteryRecord`
  directly, plus a new `evidenceMastery.transactions.test.ts` built around
  a small, explicitly-labeled in-memory Firestore-transaction simulation
  (real optimistic-concurrency conflict-and-retry semantics, NOT the
  Firebase emulator — none is available in this sandbox) exercising the
  real `applyEligibleEvidenceToMastery` orchestration end to end: first
  application, retry-after-success, two crash-simulation variants, a
  genuinely concurrent double-invocation, two-items-one-objective, the
  full 2-of-3 threshold through the transactional path, and excluded
  evidence never entering mastery. True production crash/concurrency
  behavior remains not-integration-tested without a live emulator — see
  the full report for exactly what is and isn't covered.

  One new Firestore rule (`masteryApplications`, teacher/owner-read-only,
  same pattern as `masteryRecords`); no new composite index needed
  (single-field equality, auto-indexed, same as `masteryRecords`'s
  existing `userId` query). Hour handling, dashboard aggregation, and the
  manual-log warning are untouched. See the full report delivered
  separately for the crash-window analysis, atomicity guarantee, and
  complete test list.

- **Step 7 — done except one flagged decision, awaiting your review.**
  Physical Education as a first-class WBK curriculum component.

  Subject model: `physical_education` is now a real, canonical specialty
  subject (`types.ts`'s `SPECIALTY_SUBJECTS`, mirrored in
  `web/src/lib/subjects.ts`), with one human label ("Physical Education")
  and one objective-id abbreviation ("pe" — `curriculum/objectiveId.ts`).
  Audited every subject union/map in both apps; the only two EXHAUSTIVE
  `Record<Subject, ...>` maps in the whole codebase (`subjects.ts`'s
  labels, `objectiveId.ts`'s abbreviations, plus their web mirror) are the
  only places that needed a real edit — everything else (curriculum
  content parsing, day generation, block validation, evidence packets,
  hour aggregation, dashboard gauges, extracurricular tagging, the
  teacher UI's subject dropdowns) already iterates `CORE_SUBJECTS`/
  `SPECIALTY_SUBJECTS`/`ALL_SUBJECTS` generically and picked PE up for
  free, confirmed by a clean `tsc --noEmit` on both apps after the
  registry change (the compiler itself is what proves nothing hardcoded
  was missed).

  Morning PE/movement: the locked daily opening (Pledge -> PE/movement ->
  academic day) is now represented as a real, structural first block —
  `proposedDays.ts`'s generation prompt requires a `physical_education`
  block as `learningBlocks[0]` every instructional day, with real
  educational intent (movement skill/coordination/balance/endurance/
  mobility/body awareness/safe-exercise habits/teamwork), daily variety
  (a rotating list of appropriate categories), safety limits (no unsafe/
  max-effort prescriptions), and age differentiation from the student's
  own context (a young child gets pure play/gross-motor movement with no
  performance metrics; an older child may get a real skill/coordination
  objective and teacher-observed evidence). Never trusting the model to
  reliably comply (this file's own standing principle), a new pure
  `curriculum/blockValidation.ts#ensureMorningPhysicalEducationBlock`
  GUARANTEES the block exists: if the model's response has no PE block at
  all, one is inserted at index 0 and every other block is renamed
  (`b1`->`b2`, etc.) with `dependsOn` references remapped alongside it —
  a pure rename, never a reorder of existing blocks relative to each
  other, so the "only ever depends on a strictly earlier block" invariant
  is never disturbed. Deliberately does NOT force-reorder an
  existing-but-misplaced PE block (accepted, documented scope limit — see
  the full report).

  Evidence/mastery: PE blocks use the exact same step-6 evidence pipeline
  as every other subject — `evidenceHours.ts`/`evidenceMastery.ts` are
  fully subject-generic and needed zero changes. Teacher-observation/
  physical-demonstration evidence types already existed (added for
  Maizley's demonstration-based track) and already support "demonstrates
  balance sequence"-style PE evidence with no quiz required.

  **AUTHORITATIVE PE POLICY (Cory's decision, locking step 7 — no longer
  an open question):** PE is REQUIRED as part of the normal WBK school
  day, but is NON-HOUR-BEARING for Missouri instructional/compliance
  calculations. The canonical requirement stays exactly 28 hrs/week for
  Millaray/Makaio under the current Q1 model, unchanged; PE contributes 0
  instructional/compliance hours — permanently, by deliberate policy, not
  a placeholder. No hours are redistributed from another subject and the
  28-hour total is never increased. "Required for the daily routine" and
  "counts toward compliance hours" are explicitly independent dimensions
  — a required block can, and here does, carry zero compliance weight.

  This is now enforced programmatically at three points, not left as a
  weight=0 assumption anywhere: (1) `curriculum/evidenceHours.ts`'s new
  `NON_HOUR_BEARING_SUBJECTS` set — `aggregateApprovedMinutesBySubject`
  skips any `physical_education` block entirely, so it can never produce
  an official `logs` entry via the approved-evidence pipeline, no matter
  how much time was approved on the block; (2) `curriculum/
  blockValidation.ts`'s `normalizeOneBlock` now force-sets
  `required: true` for any `physical_education` block regardless of what
  the AI supplies, so a zero compliance weight can never be read as
  "optional"; (3) `weeklyHours.ts`'s `weekHours()` and its doc comments
  (plus `types.ts`'s `SPECIALTY_SUBJECTS` and `subjectWeights.ts`'s doc
  comments) now describe PE's absence/zero-weight as locked program
  policy rather than a pending decision. The teacher-facing purpose
  language in `proposedDays.ts`'s generation prompt was also rewritten to
  match: fitness/coordination/balance/sports/games/teamwork/outdoor
  activity/lifelong movement habits/fun, explicitly warned against turning
  PE into another worksheet-driven academic block just to justify its
  presence.

  Evidence/history are unaffected by the exclusion: a PE block's
  `completionState`, `reportedMinutes`/`approvedMinutes`, and
  `objectiveEvidence` (including teacher-observation/physical-
  demonstration evidence, still no quiz required) are recorded and
  preserved in the packet exactly like any other subject's — the
  non-hour-bearing rule gates only the hours PROJECTION, never the
  packet's own historical record of what happened or the mastery
  pipeline's ability to use that evidence.

  17 new unit tests since the prior report (225 -> 242): the original
  step 7 batch (PE objective-id abbreviation,
  `ensureMorningPhysicalEducationBlock` insert/rename/no-op behavior,
  `subjectWeights.test.ts`'s honest-zero-weight checks) plus this
  policy-lock batch — PE forced
  `required: true` even against an AI-supplied `false`; the 28 hrs/week
  total is unaffected and carries no `physical_education` entry;
  `NON_HOUR_BEARING_SUBJECTS` membership; a fully-approved PE block posts
  zero official hours; academic/specialty subjects keep posting normally
  alongside a PE block in the same day; and a combined test proving the
  exclusion never touches a PE block's own completion/minutes/evidence or
  its ability to feed the mastery pipeline. No Firestore rules/index
  changes. Not deployed.

- **Step 8 — done, awaiting your review.** Historical Figure Coloring —
  the daily closing system — replacing the retired subject-ring color-
  sheet rotation (`colorSheetRotation.ts`, confirmed still unwired from
  any runtime path, now with a regression test proving it).

  Data model: extended (not replaced) the step 1 contract from
  `curriculum/historicalFigureSelector.ts` — `HistoricalFigure` moved
  into `types.ts` (types.ts never imports from `curriculum/*`, matching
  every other domain's schema placement) and gained `whyItMatters`,
  `toddlerAppropriate`, and a separate `artwork` provenance object
  distinct from the historical-fact `provenance` (requirement 7:
  "historical facts and artwork provenance are separate concerns"). A new
  hand-authored `curriculum/historicalFigureCatalog.ts` seeds 20 REAL
  historical people spanning Indigenous/pre-colonial (Squanto, Pocahontas,
  Sequoyah, Sacagawea), colonial/Revolutionary (Franklin, Wheatley,
  Revere, Washington, Lafayette), early US/expansion (Jefferson, Madison,
  Johnny Appleseed), Civil War/Reconstruction (Lincoln, Tubman,
  Douglass), industrial/modern (Edison, the Wright brothers), and people
  outside the modern US intersecting American history (Lafayette, Leif
  Erikson, Columbus) — no fabricated people, no invented provenance.
  Every entry's artwork is honestly `unavailable`/`unknown_unverified` —
  no image pipeline exists, nothing is scraped or assumed reusable
  (requirements 6-7); `isArtworkApprovedForPrinting` is the one gate that
  would ever let a real asset through, and it hard-refuses an unknown/
  unverified rights status regardless of availability.

  DELIBERATE DECISION: no AI call is involved anywhere in this feature.
  Both the figure and the show-and-tell/recall prompt text are fully
  deterministic — the figure comes from a pure, seeded weighted-selection
  algorithm (`historicalFigureSelector.ts#selectHistoricalFigure`,
  `hashText(date+kidKey)` as the deterministic seed), and prompts are
  template text built from the catalog entry's own fields. This is a
  stricter reading of "the AI may draft an age-appropriate prompt" (a
  permission, not a requirement) chosen specifically to make the
  "don't fabricate people / don't let the AI invent provenance"
  instruction structurally impossible to violate, not just prompted
  against.

  Selection: locked hybrid strategy — variety (base weight) plus
  upcoming-context weighting (+2 per matching relevance tag, using a new
  `Q1_FALL_WEEK_RELEVANCE_TAGS` table for the current+next week's theme —
  real "upcoming," not just "current"), with anti-repetition sourced from
  the student's real approved-day history (`loadRecentHistoricalFigureIds`
  in `proposedDays.ts`, reusing the EXISTING `(familyId, studentId,
  status, date)` composite index — no new index needed). Never collapses
  to "always the one thematic match" (weighting only ever adds on top of
  the variety floor) and never crashes/empties the pool (falls back to
  the full catalog if every figure has recently been shown).

  Age differentiation: Maizley's pool is filtered to
  `toddlerAppropriate` figures (one catalog entry, Deborah Sampson, is
  marked false — her whole significance is tied to disguising herself
  for combat, too hard to simplify honestly); Millaray/Makaio can receive
  any figure. Show-and-tell/recall text is genuinely different per kid —
  Millaray gets era + application/connection reasoning, Makaio gets a
  clear one-line ask, Maizley gets point/match/name interaction with no
  open-ended "why" question — proven by direct string assertions in
  tests, not just by inspection.

  Day-plan integration: `physical_education`'s pattern, reused —
  `historicalFigureClosing: HistoricalFigureClosingPlan | null` lives on
  `ProposedDay` (frozen original) and `ProposedDayDraft` (current copy,
  not yet independently editable, same status as `learningBlocks`), `null`
  only for a nonInstructional day. The teacher sees the selected figure
  and generated prompts before approving (`ProposedDaysPage.tsx`'s new
  `HistoricalFigureClosingSummary`, alongside the existing `BlockList`).
  Approval freezes it exactly like everything else in `ProposedDay` — no
  new mechanism needed. Regenerating an unapproved proposal picks fresh
  (a real new version, per the existing lifecycle rules); an approved
  day's figure is never touched again by anything in this file.

  Evidence/retention: `EndOfDayEvidencePacket` gained
  `historicalFigureClosing?: HistoricalFigureClosingEvidence` (figureId
  seeded from the approved plan; `completed`/`retentionObservation`/
  `teacherNote`/`recordedByUid`/`recordedAt` filled in by the teacher). A
  new small, standalone callable, `recordHistoricalFigureRetention`
  (validated 1-10 integer via `evidenceValidation.ts#
  isValidRetentionObservation`), because this field lives outside
  `draft.blocks` entirely — same "editable only while open, frozen at
  approval" rule as every other packet field. DELIBERATELY never writes
  to `masteryRecords` or anything `evidenceMastery.ts` reads — a single
  1-10 score is preserved as its own kind of historical evidence, never
  auto-interpreted as mastered/not-mastered, exactly as required.

  Hours/compliance: Historical Figure Coloring was never modeled as a
  `Subject`/`LearningBlock` at all — it has no `approvedMinutes` field,
  so it structurally cannot reach `aggregateApprovedMinutesBySubject` or
  post an official `logs` entry, by construction rather than by an
  excluded-subjects list (PE's approach). No new compliance-hours policy
  question was created — nothing here touches the 28 hrs/week
  requirement, the dashboard, or `weeklyHours.ts` at all.

  The Kindred motto/prayer: per instruction, the exact wording was never
  invented. `Family.closingWords?: string` (new, optional, no default)
  is a plain family-authored setting, editable directly from
  `EndOfDayClosingPage.tsx`'s new `FamilyClosingWordsEditor` using the
  SAME teacher-write permission `families/{familyId}` already had — no
  new rule, no new callable. Shows "not set yet" rather than any
  placeholder text until a family actually fills it in.

  Privacy: no new collection was created and no new read rule was
  needed — `proposedDays`/`evidencePackets` were already teacher-only-
  read (no student-facing view of either exists yet at all), so a
  child's retention score/note was never exposed to siblings by
  construction, confirmed by re-reading `firestore.rules` rather than
  assumed.

  36 new unit tests (242 -> 278): catalog integrity (stable/unique ids,
  honest artwork/provenance, Indigenous and outside-modern-US
  representability, era diversity, toddler-flag mechanics),
  `getUpcomingContextTags`; `selectHistoricalFigure` (determinism,
  variety across many dates, anti-repetition with a full-pool fallback,
  upcoming-context weighting biasing without ever eliminating the
  alternative, Maizley's toddler filter with a full-pool fallback,
  sibling-shared-figure-with-differentiated-presentation); prompt-text
  differentiation across all three kids; the artwork-approval gate's
  four real states; and a regression test reading `proposedDays.ts`'s
  and `dayPlans.ts`'s own source to prove `colorSheetRotation` is never
  referenced. `isValidRetentionObservation`'s full boundary set. No
  Firestore rules/index changes. Not deployed.

- **Step 8.1 — done, awaiting your review.** Narrowly-scoped audit/
  correction of step 8's Historical Figure Coloring catalog and the new
  FamilyClosingWordsEditor's write path.

  Historical accuracy: Leif Erikson's entry originally said he "reached
  North America," dangerously ambiguous next to every U.S.-based entry's
  wording — corrected to name the actual, securely documented site,
  L'Anse aux Meadows in present-day Newfoundland and Labrador, CANADA,
  never the modern United States. Columbus's entry already correctly said
  "islands in the Caribbean" (no factual fix needed) but carried a
  "colonial" relevance tag that conflates his 1492 voyage with the actual
  English colonial period a century later — removed. Both entries'
  `whyItMatters` now explicitly states they never reached the modern
  U.S. while still explaining their real relevance to American-history
  study (the later chain of exploration/colonization the future U.S. is
  part of) — historical relevance kept distinct from geographic presence,
  per the audit's core distinction.

  Provenance honesty: every one of the 20 catalog entries previously
  claimed `sourceTitle: "General historical record (public domain
  facts)"` as though that label were itself a traceable source — an
  honest audit found this was a placeholder, not a citation, and that a
  person being real never proves their catalog entry has been verified.
  `HistoricalFigureProvenance` gained a required `verificationStatus:
  "unverified" | "verified"` field; all 20 entries are now honestly
  `"unverified"` (no web-research project was run to backfill real
  citations — out of scope for a focused correction — the honest fix is
  to say so). `HistoricalFigureClosingPlan` gained
  `sourceVerificationStatus`, copied from the selected figure at
  selection time, now visible in `ProposedDaysPage.tsx`'s teacher review
  summary rather than staying buried in backend-only data.

  Tag semantics: added an explicit doc comment on
  `Q1_FALL_WEEK_RELEVANCE_TAGS` distinguishing historical-relevance/theme
  tags from geographic-presence claims — no tag in the catalog implies
  U.S. territorial presence unless the person was actually there;
  geography claims belong only in `region`/`briefBio`/`whyItMatters`
  prose, stated explicitly, never inferred from a tag.

  `toddlerAppropriate` semantics: the field's doc comment (types.ts) was
  rewritten from "did their story involve combat" to the corrected
  meaning — "does an adequately simple, honest presentation exist using
  this record's brief context," independent of whether the adult story
  involved conflict. Re-auditing the catalog under the corrected test
  didn't change any boolean (George Washington: `true`, because "became
  the first president" is an honest simple alternate framing that needs
  no war discussion at all; Deborah Sampson: still `false`, because her
  *entire* recorded significance IS the disguise-to-enlist act with no
  alternate framing available) — but Sampson's inline comment was
  rewritten to reflect the real reasoning ("no adequate alternate
  framing exists"), not "combat is present."

  FamilyClosingWordsEditor governance: audited the direct client
  `updateDoc` this feature used against `families/{familyId}`. Teacher-
  only access was already correctly enforced (firestore.rules'
  `isTeacherInFamily` checks role, not just family — a student was never
  able to write it), but the write still exercised the family doc's
  blanket, field-unrestricted `allow write` rule. Fixed by narrowing:
  `firestore.rules`' `families/{familyId}` write is now `allow write: if
  false` (matching every other Cloud-Function-only collection), and a
  new dedicated callable, `familySettings.ts#updateFamilyClosingWords`
  (teacher-only via `requireTeacher`, no `familyId` parameter at all —
  always the caller's own family), is now the only way any Family field
  is written from client code. Its Firestore payload is built by a pure
  `buildClosingWordsUpdate` function whose return TYPE is the literal
  `{ closingWords: string }` — a compile-time guarantee, not just a
  runtime habit, that no other Family field can ever be smuggled through
  it. No wording was invented anywhere in this fix.

  21 new unit tests (278 -> 299): Columbus/Leif Erikson geographic-wording
  regression tests, historical-relevance-vs-geography tag tests,
  provenance-verification-state tests, a toddlerAppropriate-semantics
  test, `sanitizeClosingWords`/`buildClosingWordsUpdate` tests (including
  one proving the update payload can never carry a second key), and a
  first-ever `util/auth.test.ts` covering `requireTeacher`/
  `requireSameFamily`/`requireOwnerOrTeacher` directly — the actual
  mechanism behind "a student cannot modify family closing words," now
  genuinely tested rather than only structurally true. One rules change
  (`families/{familyId}` write narrowed to Cloud-Function-only); no new
  indexes. Not deployed.

- **Step 9 — done, awaiting your review.** Ask-a-Teacher + stable
  presentation identities.

  Audit first: confirmed `inferKidKey()` (`curriculum/placementTestItems.ts`)
  — display-name-substring inference — was the one production identity
  mechanism the spec targeted, with a single backend call site
  (`dayPlans.ts`'s `buildStudentContext`); found it duplicated client-side
  in `web/src/lib/placementTestItems.ts` with 7 call sites (StudentHomePage,
  StudentPlacementPage, CheckInPage x2, PlacementTestPage x2, UploadPage x2)
  — those are pre-existing, unrelated-feature UI logic (which self-service
  screens to show), left untouched as out of this step's scope; noted
  explicitly rather than silently expanded into. Confirmed `characterMapping`
  is cosmetic-only (never read for identity/security) and found/fixed a
  real naming drift: its doc comment said "Rhoe" (also present in
  `scripts/accounts.config.example.json`) where the locked model says "Ro"
  for Makaio. Located "Curriculum Assistance Required" as
  `certificationGate.ts`'s `blocked_missing` outcome — a system-level
  content-readiness gate on NEW plan generation, unrelated to a student's
  live help request; no competing-system conflict, so both coexist as
  designed without further reconciliation work.

  Stable identity model: `PresentationIdentityId` (`"jasper" | "celeste" |
  "kira" | "ro" | "nova"`) and `UserProfile.presentationIdentityId` added
  to `types.ts`; the registry (role, display label, specialty areas,
  per-student `PlacementKidKey`) lives in new
  `identity/presentationIdentity.ts`. Bootstrap is the new
  `assignPresentationIdentity` callable — teacher-initiated, deterministic
  (caller supplies both target account and identity explicitly, never
  inferred), idempotent (re-assigning the same value is a no-op), rejects a
  role mismatch or a collision with another account already holding the
  same identity, and writes an `auditEvents` record. Never auto-run.
  `seedAccounts.ts`'s `AccountConfig` gained an optional
  `presentationIdentityId` field (only written when a config explicitly
  names one, so re-running seed never clobbers an already-bootstrapped
  account) as the offline/config-driven path; the callable is the online
  path for retrofitting already-existing accounts. `dayPlans.ts` now calls
  `resolveKidKeyForStudent` (prefers `presentationIdentityId`, falls back to
  the legacy `inferKidKey` only when unset) instead of `inferKidKey`
  directly — existing un-bootstrapped accounts keep working exactly as
  before. Found and fixed a related latent gap while in this code:
  `submitPlacementTest`/`submitPlacementResponses` accepted a
  client-supplied `kidKey` with no check that it matched the target
  account — added `assertKidKeyMatchesTarget`, enforced only when the
  target's own kidKey is actually resolvable, so no currently-working
  account is newly blocked.

  Ask-a-Teacher: new `HelpRequest` model in `types.ts` (category, message,
  stable `reference` to proposedDayId/blockId/objectiveId — never
  duplicated curriculum content, status, escalationLevel, teacherNotes,
  createdBy/resolvedBy) and four callables in new
  `identity/helpRequests.ts`: `createHelpRequest` (student-self or
  teacher-assisted via the existing `requireOwnerOrTeacher`, always routes
  to `"celeste"` by default, canned per-category message when no text is
  typed — the Maizely-compatible no-typing flow), `respondToHelpRequest`,
  `escalateHelpRequest` (teacher-only, deliberate action, never automatic),
  and `resolveHelpRequest` (teacher-only, no owner fallback — a student can
  never self-resolve). All four write to the same `auditEvents` collection
  as the existing propose/approve/reject flow (widened `AuditEventKind`/
  `AuditEventAction` unions rather than forcing help requests through
  `approvals.ts`'s propose-then-commit state machine, which doesn't fit a
  ticket lifecycle). No AI call anywhere in this feature — deterministic
  structured routing only, verified by a source-scan test asserting no
  AI/model SDK reference in `helpRequests.ts`. `firestore.rules` gained a
  `helpRequests` collection (owner-or-teacher read, callable-only write);
  `firestore.indexes.json` gained two composite indexes for the teacher
  queue and a student's own history.

  Minimal UI: `AskForHelpWidget` (category buttons — clicking one submits
  immediately, no typing required for any category, with an optional
  "Something else" text box) embedded in the existing `StudentHomePage`;
  accepts an optional `reference` prop so a future LearningBlock "Ask for
  Help" action can pass the current day/block/objective without redesign.
  New `HelpRequestsPage` (teacher queue, grouped by escalation level,
  respond/resolve/escalate) and `IdentitySetupPage` (assigns
  presentationIdentityId per family member via a plain dropdown — never
  pre-selected from a name) at `/help-requests` and `/identity`.

  30 new unit tests (299 -> 329), all pure-logic (registry integrity,
  no-name/email-parsing guarantees, role-mismatch/collision preconditions,
  idempotent bootstrap, category validation, no-typing-flow message
  resolution, reference sanitization, deterministic Celeste-first routing,
  no-AI-SDK source scan) — the callables' own Firestore-integration paths
  (the actual write, the collision query, rule enforcement) are NOT
  integration-tested, same disclosed limitation as every other callable in
  this codebase (no Firebase emulator in this sandbox). One rules change
  (new `helpRequests` collection) and two new indexes. Not deployed.

- **Step 9.1 — done, awaiting your review.** Removed remaining web-side
  student identity inference.

  Found and removed the 7 web-side `inferKidKey()` (display-name-substring)
  call sites the step 9 report had flagged but deferred: StudentHomePage,
  StudentPlacementPage, CheckInPage (x2), PlacementTestPage (x2),
  UploadPage (x2). All now resolve a student's `PlacementKidKey` from their
  stable `presentationIdentityId` via one small, shared, typed helper —
  `lib/presentationIdentity.ts#kidKeyForPresentationIdentity` (extended
  with `STUDENT_PRESENTATION_TO_KID_KEY`, mirroring the functions-side
  registry) for teacher-facing pages selecting among multiple students, and
  a new `hooks/useStudentIdentity.ts` for the two student-facing pages
  resolving their OWN identity. Neither reads displayName, email,
  capitalization, or substring matching — only `presentationIdentityId`.
  `web/src/lib/placementTestItems.ts`'s `inferKidKey` function itself was
  deleted (not just deprecated) once confirmed unused; the catalog/type
  exports it shared the file with are untouched.

  Backward compatibility, done the way the spec asked (never silently
  fall back): a student-facing page with no bootstrapped identity now
  shows `StudentSetupRequiredNotice` ("Your school profile needs to be
  linked before this activity can start. Ask your teacher!") instead of
  the retired display-name guess. Teacher-facing pages (CheckIn,
  PlacementTest, Upload) list which family members still need identity
  setup, with a link to `/identity`, instead of silently omitting them —
  this is new UI added specifically for this step's requirement 4. The
  functions-side `inferKidKey` fallback inside `resolveKidKeyForStudent`
  (the backend compatibility path reviewed and accepted in step 9) was
  deliberately left untouched — this step's scope was explicitly
  "web-side," and that backend fallback is a separate, already-reviewed
  decision.

  Security: presentation identity stays presentation-only everywhere it
  was touched — no new authorization boundary was introduced, no
  capability/permission field was added to `PresentationIdentityInfo`, and
  every mutation still goes through the existing `requireOwnerOrTeacher`/
  `requireTeacher`/`assertKidKeyMatchesTarget` checks from step 9. Since
  teacher-facing pages derive `userId` from the already-fetched, already
  family-scoped `useFamilyStudents()` roster (never a free-typed or
  route-supplied id), a client can't select a sibling's identity by
  passing a different string — the same server-side cross-check from step
  9 still backstops every placement submission regardless.

  7 new unit tests (329 -> 336): `resolveKidKeyForStudent` misleading-
  displayName / no-email-field / not-yet-bootstrapped-fallback tests, a
  registry-parity test locking `web/src/lib/presentationIdentity.ts`'s
  duplicated mapping to the functions-side canonical one (the two packages
  have no shared build, so this is a mirror-plus-lock rather than a shared
  import — anticipated and pre-approved by this step's own instructions),
  and two source-scan tests proving zero remaining `inferKidKey(...)`
  callers under `web/src` and that the function itself no longer exists
  there. No web test runner exists in this repo (only `tsc`/`vite build`/
  `oxlint`), so the web-side hooks/components themselves are verified by
  typecheck + build + lint, not by executing them — same disclosed
  limitation as every other web file in this project.

  Full-repo search (`inferKidKey`, name/email substring patterns,
  Millaray/Kira, Makaio/Ro/Rhoe, Maizely/Nova) found zero remaining live
  identity-decision sites beyond the one already-reviewed backend
  fallback; every other hit is UI copy, registry label data, or historical
  doc/report text. No rules or index changes. Not deployed.

- **Step 9.2 — done, awaiting your review.** Removed the final backend
  display-name identity fallback.

  `resolveKidKeyForStudent` (`identity/presentationIdentity.ts`) no longer
  falls back to `inferKidKey(displayName)` for a not-yet-bootstrapped
  account — it's now a pure lookup of `presentationIdentityId` only,
  returning `null` for a missing, invalid/stale, or teacher-role id, with
  no exceptions. Its two real callers were both audited and updated:
  `dayPlans.ts#buildStudentContext` now calls a new throwing guard,
  `requireKidKeyForStudent`, whenever the target profile's `role` is
  `"student"` (a teacher profile still resolves to `null` harmlessly, as
  before — this was never inferred from their name either); a genuine
  student with no bootstrapped identity now gets a clear
  `failed-precondition` naming the account and pointing at the fix,
  instead of a silently ungrounded plan. `placementTest.ts`'s
  `assertKidKeyMatchesTarget` now calls the same guard unconditionally
  (every caller targets a real student, never a teacher) — a target
  lacking a bootstrapped identity is now refused outright rather than
  silently letting the client-supplied `kidKey` through unchecked, which
  was exactly the previously-permissive gap this cross-check exists to
  close.

  The backend `inferKidKey` function itself (`curriculum/
  placementTestItems.ts`) was deleted — its one remaining caller was the
  fallback just removed, and a full-repo audit (this step's own section
  3) confirmed no other backend helper derives student identity from
  displayName, email, or any other name-shaped field; every other
  `Millaray`/`Makaio`/`Maizely`/`Kira`/`Ro`/`Nova` hit in `functions/src`
  is a `PlacementKidKey` literal used as a stable `Record` key, or UI/
  prompt copy text, never an identity decision.

  A real bug surfaced by the new tests: `kidKeyForPresentationIdentity`
  indexes `PRESENTATION_IDENTITIES` directly by its argument, which throws
  a `TypeError` (rather than returning `undefined`) for a string that
  isn't one of the 5 registered ids — `resolveKidKeyForStudent` now guards
  with `isPresentationIdentityId` first, so a stale/corrupted
  `presentationIdentityId` value in Firestore resolves to `null` ("setup
  required") instead of crashing the caller.

  6 new/rewritten unit tests (336 -> 342): the old "not-yet-bootstrapped
  falls back to displayName" test (accurate for step 9, now obsolete) was
  replaced with tests proving the opposite for every realistic
  displayName, an invalid-id test (which caught the `TypeError` bug
  above), a teacher-identity-on-a-student-profile defensive case, and
  `requireKidKeyForStudent`'s throw/message-content/error-code tests, plus
  two source-scan tests (mirroring step 9.1's web-side ones) proving zero
  remaining `inferKidKey(...)` callers under `functions/src` and that the
  function no longer exists there. No rules/index changes — this step
  touched only resolution logic, not any collection shape. Not deployed.

- **Step 10 — done, awaiting your review.** Curriculum Quality Feedback
  Queue.

  Audit confirmed the exact hook point: `contentHash.ts#hashWeekContent`
  is already the SAME hash `certificationStatus.ts`'s
  `computeFamilyWeekContent` computes and compares for every student on
  every plan-generation call — no new hashing scheme was needed. New
  `CurriculumQualityIssue` model (`types.ts`): stable references only
  (studentId/proposedDayId/blockId/objectiveId/helpRequestId), a
  `contentVersion` (kidKey/quarter/week/contentHash/weeklyCertificationId
  — the narrowest stable reference, never the raw content), category (10
  controlled values), teacher-chosen severity (4 values, never
  AI-assigned — there is no AI call anywhere in this feature, verified by
  a source-scan test), status, and an embedded `quarantine` object kept
  structurally independent of `status` (section 9's "issue resolved" vs
  "quarantine released" are separate booleans, never coupled).

  New `curriculum/curriculumQuality.ts`: `resolveContentVersionReference`
  (server-derives the exact hash from either a `proposedDayId` — preferring
  its `sourceWeeklyCertificationId`'s own immutable historical hash — or a
  direct kidKey/quarter/week location; the client names a LOCATION, never
  a hash) and `findActiveQuarantineReason` (an exact 5-field equality match
  — familyId/kidKey/quarter/week/contentHash — against active quarantines).
  `certificationGate.ts` gained a 9th outcome, `blocked_quarantined`, via
  one new optional `quarantineReason` param (defaults to "no quarantine"
  when omitted, so all pre-existing tests/callers needed no changes) —
  checked after `dayDesignation` but before the legacy/governed split, so
  a quarantined exact version is blocked in BOTH modes. `dayPlans.ts`'s
  `buildStudentContext` computes the quarantine check by reusing the hash
  `familyWeekStatus` already computed (zero extra Firestore reads) and
  passes it into the gate — since `generateProposedDays` already wraps
  each student's `buildStudentContext` call in try/catch (built in step
  4), a quarantine block surfaces as a clean per-student skip with zero
  code changes needed there.

  New `curriculumQualityIssues.ts` callables, all teacher-only:
  `createQualityIssue` (optionally linking a help request's own
  reference/studentId — never auto-created from one, per section 6: "the
  teacher makes that determination"), `quarantineContentVersion`
  (idempotent; the exact version already attached to the issue, never a
  broader scope), `releaseQuarantine` (the only way a quarantine lifts;
  independent of resolution), `resolveQualityIssue` (7 controlled
  resolution actions; never touches `quarantine`), and
  `updateQualityIssueSeverity`. All write into the existing `auditEvents`
  collection (widened `AuditEventKind`/`AuditEventAction` unions, same
  pattern as steps 9/9.1). Approved-history guarantees (section 13) hold
  by construction — this feature's source never references `logs`,
  `evidencePackets`, or `masteryRecords`, and never writes to
  `proposedDays`/`familyWeeklyCertifications`, only reads them; proven by
  two source-scan tests rather than by trusting a design description.

  Teacher UI: new `CurriculumQualityPage` (`/quality`) — create issue
  (with optional day/block/objective pin or direct kid/quarter/week
  location), open/resolved list, quarantine/release/resolve/change-severity
  actions — and a "Flag as curriculum issue" mini-form added to each
  `HelpRequestsPage` card (section 6's worked example, wired for real: a
  teacher reading "the directions don't make sense" can explicitly promote
  it into a linked Quality issue). Firestore rules gained
  `curriculumQualityIssues` — teacher-only read with deliberately NO
  owner-read clause at all (section 12: students never browse this queue,
  unlike `helpRequests` which a student reads their own of). Three new
  composite indexes: two for the teacher queue view, one for the exact-hash
  quarantine lookup (familyId + quarantine.active +
  contentVersion.{kidKey,quarter,week,contentHash}).

  31 new unit tests (342 -> 373): controlled category/severity/resolution-
  action validation, the new `blocked_quarantined` gate outcome (blocks in
  both legacy and governed mode, loses to an explicit dayDesignation, never
  reachable without an explicit input — same discipline as the existing
  dayDesignation tests), quarantine/release preconditions
  (`assertHasQuarantinableContentVersion`, `isAlreadyQuarantined`,
  `assertQuarantineActive` — all extracted as pure guards specifically for
  this), sanitization (description/note/reference — helpRequestId is a
  kept reference key), structural proofs that resolving never releases a
  quarantine and releasing never resolves an issue (reading the actual
  callable source, not just asserting the design intent), the audit/
  teacher-only-mutation source-scan tests, and the approved-history/no-AI
  source-scan tests described above. The callables' own Firestore
  integration paths (the actual writes, the collision/quarantine queries,
  rule enforcement) are NOT integration-tested — same disclosed limitation
  as every callable in this codebase (no Firebase emulator in this
  sandbox). Not deployed.

- **Step 11 — done, awaiting your review.** Phase 1 family test readiness
  audit + minimum Student Today experience. Explicitly NOT production
  launch; deployment was not performed.

  Audit first (workflow trace, not assumed): confirmed the teacher path
  (certify → generate → review/edit → approve) and the closeout path
  (open packet → edit → approve) already work end to end from steps 4-6.
  The student path was confirmed to not exist at all — `StudentHomePage`
  only ever showed placement-test status; there was no way for a signed-in
  student to see their own approved day. The suspected blocker was
  confirmed exactly as described: `proposedDays` is (correctly)
  teacher-only in `firestore.rules`, with no owner-read clause, so a
  student could never have read their own day even once approved.

  Student-safe published-day projection: rather than widen `proposedDays`
  access (real leakage risk — drafts, superseded versions, sibling days,
  teacher-only governance fields all live in that one document), a new
  `publishedDays/{familyId}_{studentId}_{date}` collection
  (`curriculum/publishedDay.ts#buildPublishedDayProjection`) is written by
  `approveProposedDay` itself, in the SAME transaction that sets
  `status: "approved"`. Every field is explicitly constructed (never a
  spread of the source document), so a future field added to `ProposedDay`
  can't silently leak to students by default. `firestore.rules` gives
  `publishedDays` an owner-or-teacher read, `write: if false` (Cloud
  Function only). `proposedDays` itself is now documented as teacher-only
  *forever*, not "until a student view exists."

  Student progress: a new `studentBlockProgress/{familyId}_{studentId}_
  {date}` collection (owner-or-teacher read, `write: if false`) is the
  ONLY place a student's own not_started/in_progress/completed signal is
  ever written, via one new callable, `updateBlockProgress`
  (`studentProgress.ts`). It structurally cannot do any of the things
  students must never do: `isStudentBlockProgressState`
  (`curriculum/studentProgress.ts`) validates against exactly three
  values, deliberately excluding the real fourth packet state, "excused"
  — a student can never self-excuse, by type, not by convention. Identity/
  ownership/date are derived server-side from the referenced
  `proposedDays` document (admin SDK) — the client names a location
  (`proposedDayId`/`blockId`), never asserts `familyId`/`date` directly.
  Uses `requireOwnerOrTeacher` (a student may only ever act on themself)
  rather than a teacher-only guard, matching every other self-or-teacher
  callable in this codebase.

  Evidence packet connection (no second completion system): a student's
  write always lands in `studentBlockProgress`, and — only when a matching
  `EndOfDayEvidencePacket` already exists and is still `"open"` — is ALSO
  mirrored into that packet's `draft.blocks[blockId].completionState` in
  the same call, bumping `draft.revision` so a teacher's concurrently-open
  draft correctly detects the change via the existing optimistic-
  concurrency check rather than silently losing it. For the opposite
  ordering (teacher opens the packet after the school day already
  happened), `openEvidencePacket` now seeds each block's initial
  `completionState` from `studentBlockProgress` instead of hardcoding
  `"not_started"`. Every other packet field (reportedMinutes,
  objectiveEvidence, assessmentEligible, dayNotes) is provably untouched
  by this path — the teacher remains the sole authority over hours,
  evidence, and mastery at closeout.

  Strict/Flexible: reused `curriculum/blockEligibility.ts#
  computeEligibleBlocks` exactly as it already existed from step 5 — no
  second eligibility engine was built. Because a `LearningBlock`'s plan-
  time `completionState` never updates (confirmed by direct inspection: it
  stays `"not_started"` forever on both `proposedDays` and the new
  `publishedDays` projection), the Student Today page merges each block's
  live `studentBlockProgress` state onto a copy of the published blocks
  before calling eligibility — this could not be fed the raw published day
  directly. `computeEligibleBlocks` was mirrored verbatim into
  `web/src/lib/blockEligibility.ts` (same pattern as the step 9.1 identity
  registry mirror) since `functions/` and `web/` share no build; unlike
  that mirror, this is an algorithm, not static data, so there is no
  runtime parity proof available (no web test runner exists in this repo)
  — both copies carry a doc comment cross-referencing each other and must
  be kept identical by inspection when either changes.

  Student Today UI: `usePublishedDay`/`useStudentProgress`
  (`web/src/hooks/`) are realtime `onSnapshot` listeners on the two new
  doc-id-keyed collections (read-only — the only writer is the
  `updateBlockProgress` callable, never a direct client write). New
  `StudentTodaySection` (`web/src/components/`), wired into
  `StudentHomePage.tsx`, additively (existing placement-test content is
  untouched): Pledge cue (static ritual text — confirmed via ROADMAP.md
  §4b this is intentionally not per-day data), Jasper Morning Message,
  day summary + itinerary-mode explanation, a PE/movement reminder when
  today includes a `physical_education` block, each LearningBlock in
  approved order with subject/stage/estimated time/required-vs-enrichment/
  carry-forward indication/locked-reason text, Start/Mark done controls
  (only rendered when eligible), and a Historical Figure Coloring closing
  section. `AskForHelpWidget` gained a `compact` mode (collapsed to one
  small link, expanding to the identical category picker) so the EXISTING
  step 9 help-request path — not a new one — could be reused once per
  block, now carrying `{proposedDayId, blockId}` via its pre-existing
  `reference` prop.

  Historical Figure closing: never fabricates artwork. `artworkAvailable`
  is copied straight from the existing `isArtworkApprovedForPrinting` gate
  (step 8) — always `false` today, since no image pipeline exists — and
  the UI shows an honest "no printable page ready yet, that's okay" state
  rather than any placeholder image, while still surfacing the real
  show-and-tell/recall prompts so the discussion/retention activity works
  without printable art. A day with no closing planned (non-instructional)
  shows "No Historical Figure Coloring closing planned for today," never
  fabricated content.

  Curriculum readiness (content, not software): direct inspection of
  `curriculum/q1_fall/*.md` confirmed real, substantive Week 1–9 content
  for all three children (Millaray, Makaio, Maizely) in the exact table
  format `parseStaticCurriculumMarkdown` expects — Q1 is NOT placeholder
  for a family test. The separate `*_retrofit.md` files in the same
  directory are reference documents only; confirmed by source search they
  are never read by any runtime loader.

  Account readiness (code path, not live state): `scripts/seedAccounts.ts`
  / `accounts.config.example.json` correctly seed 2 teacher +
  3 student accounts with `familyId`/`role`/`presentationIdentityId` set
  for the 5 real people, idempotently, without ever inferring an identity
  from a name. This step did not and could not verify which accounts have
  actually been bootstrapped in the live deployed project — that requires
  checking the real Firestore data, not this sandbox.

  24 new unit tests (373 → 397): `publishedDay.test.ts` (doc-id format,
  draft-vs-frozen-original field sourcing, jasperMessage edited/generated/
  null resolution, an exact-key-set assertion on both the top-level
  projection and each block proving no governance metadata can leak,
  notes/activityFormat pass-through, carriedForward-as-plain-boolean,
  honest `artworkAvailable: false`, missing-catalog-figure graceful
  degradation), `curriculum/studentProgress.test.ts` (doc-id format,
  `isStudentBlockProgressState` accepting exactly the 3 valid values and
  rejecting `"excused"`/garbage, `toPacketCompletionState` passthrough),
  and `studentProgress.test.ts` (source-scan tests proving the callable
  uses `requireOwnerOrTeacher` not a teacher-only guard, never writes the
  literal `"excused"`, never touches reportedMinutes/objectiveEvidence/
  assessmentEligible/dayNotes, never calls createProposal/approveProposal,
  validates blockId against the day's real blocks, derives ownership from
  the server-fetched day rather than client-supplied fields, and only
  mirrors into an already-open packet). No new Firestore composite
  indexes — both new collections are read by deterministic doc-id lookup,
  never a `.where()` query. Two new Firestore rules
  (`publishedDays`/`studentBlockProgress`, both owner-or-teacher read,
  Cloud-Function-only write). The callables' own Firestore behavior (the
  actual transaction writes, rule enforcement) and the web-side
  eligibility mirror are NOT integration-tested — same disclosed
  limitation as every prior step (no Firebase emulator, no web test
  runner in this repo). Not deployed.

Next up: step 12 (Carousel Factoids), once you've reviewed step 11.

---

## 0. Executive summary

- The **compliance/pace skeleton and Q1 curriculum content** match the
  spec closely — hour table, subject IDs, mastery threshold, and the
  overall daily lesson shape are already correct and don't need rework.
- The spec introduces a **real governance layer** on top of what exists
  today — quarter certification, weekly certification, a formal
  proposal→approve→commit→audit pattern reused everywhere — none of which
  currently exists as its own concept. Individual pieces (day plans,
  placement submissions) already follow this pattern informally; nothing
  ties it together as one reusable primitive yet.
- **One direct conflict**, flagged below, needs your decision before any
  build order touches it.
- A second-tier of substantial new surface area — Jasper Morning Message,
  Historical Figure Coloring, Ask-a-Teacher (Celeste/Jasper), Carousel
  factoids, PE as a first-class subject, Strict/Flexible itinerary — is
  genuinely new, not a rework of something broken.

---

## 1. CONFLICT — RESOLVED 2026-09-18 (see Status above)

### 1.1 Daily color sheet: subject-ring rotation vs. Historical Figure Coloring

**Spec says** (Master Spec §18, Q1 doc §7, Builder Guide §14): the old
subject-matched daily color-sheet rotation is **superseded**. Current rule
should be an independent Historical Figure Coloring system — one
historical person per kid per day, broadly American-history-oriented
(including Indigenous/pre-colonial/colonial figures), variety +
upcoming-context weighted, child-specific art complexity, preserved
completed art. Explicitly: *"Do not restore the old stable subject-ring
picker as the current daily rule."*

**Repo has:** `functions/src/curriculum/colorSheetRotation.ts` — the exact
subject-ring picker the spec describes as superseded. It's not dead code —
it's live, wired directly into `generatePlan` (`functions/src/dayPlans.ts`
line 114, and rule #4 of the generation prompt explicitly instructs Claude
to use its output). Built and shipped last session, verified against the
project's own `10_daily_color_sheet_model.md` at the time.

**Why this is a real conflict, not just new work:** removing/replacing this
touches live, working, tested code (verified end-to-end against the actual
Q1 files, zero collisions across 40 school days) that's actively shaping
today's generated day plans. This isn't "add Historical Figure Coloring
alongside it" — the spec says the subject-ring rule specifically should
stop being the daily rule.

**Decision needed:** confirm you want Historical Figure Coloring to fully
replace the subject-ring rotation (not run alongside it), so I can retire
`colorSheetRotation.ts`'s role in `generatePlan` and design the new
historical-figure selection system in its place. Not started either way
until you say so.

---

## 2. ALREADY IMPLEMENTED

Confirmed by direct code inspection, not assumption:

| Spec requirement | Repo evidence |
|---|---|
| Subject/hour table (RLA 5, math 4, science 4, social studies 4, bushcraft 3, homestead 3, nature ID 3, spiritual/cultural 2; core 17h/specialty 11h/28h total) | `functions/src/curriculum/weeklyHours.ts` — exact match, verified this session |
| Compatibility core/specialty subject IDs | `functions/src/subjects.ts` / `types.ts` — exact match |
| Mastery signal: last-3, 2-of-3 = mastered | `functions/src/mastery.ts` `MASTERY_WINDOW=3`, `MASTERY_THRESHOLD=2` |
| "Weak objective → re-teach with different framing, don't just repeat" | `generatePlan` system prompt, rule #2 |
| "Interleaving increases mistakes — not regression" | `generatePlan` system prompt, explicit note |
| Pledge of Allegiance as fixed opener | `generatePlan` system prompt, rule #1 |
| Q1 begins immediately, placement is not a blocker | `submitPlacementTest`/`submitPlacementResponses` are independent of `generatePlan`; a plan generates with or without placement data |
| Objectives-first Q1 content (not topic-only) | `curriculum/q1_fall/*.md` — already objectives-first per-subject tables |
| Print-first / cursive / interactive-puzzle-over-filler philosophy | encoded in `generatePlan` system prompt rule #3, sourced from `builder_note_worksheet_style.md`/`printable_touchpoints.md` |
| Millaray's Weeks 5-9 government/economics strand alongside local history | present in `millaray_age10_q1_fall.md` and reflected in `weeklyHours.ts`'s comment about combined-strand hours |
| Maizely tracked for portfolio, not forced into the compliance/hour model | she's excluded from `weeklyHours.ts`, has her own non-scored `submitPrintableCheckIn` track |
| "Do not silently change a certified/published day" (basic form) | a saved `dayPlans/{planId}` doc is static once written — nothing today auto-mutates it. (Spec wants a richer state machine than this — see §3 below) |
| Superseded-material list (v1 alignment standard, old placement tests, old rule requiring placement before school starts) | already correctly treated as superseded in this repo — `learn_practice_test_alignment_standard_v2.md` and Assessment 2.0 are what's actually live |

---

## 3. PARTIALLY IMPLEMENTED — foundation exists, needs real expansion

This is the largest bucket. Each of these has working code today that the
spec's version builds on rather than replaces.

### 3.1 Daily lesson shape granularity
**Have:** warm-up retrieval → new teaching → mixed/interleaved practice →
retrieval close-out (`generatePlan` rule #2).
**Spec wants:** the same shape but more granular — Guided Practice and
Independent Attempt as distinct steps, explicit "actionable feedback" as
its own step, formal "evidence capture" as a step rather than an implicit
side effect.
**Gap:** prompt-level rewording/expansion, not new infrastructure.

### 3.2 Teacher approval as a reusable primitive
**Have (updated 2026-09-18):** the shared primitive now exists —
`functions/src/approvals.ts` (`createProposal`/`approveProposal`/
`rejectProposal`) backed by `proposals/{id}` and `auditEvents/{id}`. Two
independent ad hoc instances also still exist, unmigrated — day plans
(`generatePlan` drafts, teacher edits/saves) and placement tests
(`submitPlacementResponses` captures a kid's answers, teacher reviews open
items, `submitPlacementTest` finalizes).
**Spec wants** (Builder Guide §21): **one conceptual flow** — proposal →
pending review → edit/approve/reject → committed version → audit event —
reused for quarter plans, weekly certification, daily publication,
curriculum corrections, learner-level adaptation, hour approval, and
calendar changes.
**Remaining gap:** the two existing ad hoc flows aren't migrated onto the
new primitive yet (deliberately deferred, not urgent — they work fine as
is); it isn't applied yet to quarters, weeks, curriculum corrections, or
hour approval at all (those are §4 below, and step 3+ of the build order).

### 3.3 Curriculum content storage/versioning
**Have:** `curriculumContent/{familyId}_{kidKey}_{quarter}` Firestore docs,
written directly by the teacher's browser via a deterministic parser
(`/upload` page) — content is real and live, `generatePlan` reads it.
**Spec wants** (Builder Guide §3, §19): stable unit ID + version per unit,
prerequisites/dependencies as data, source provenance, rights/reproduction
status, teacher locks, and re-certification required after a material
change.
**Gap:** current `CurriculumWeekEntry` type only has `week`, `title`,
`rawContent`, `hours` — no versioning, no provenance/rights fields, no
prerequisite graph, no lock state, no re-certification trigger.

### 3.4 Mastery/evidence handling nuance
**Have:** per-objective rolling 2-of-3 mastery signal, `aced` (3-of-3)
escalation signal — actually *more* than the spec strictly asks for here,
not a gap.
**Spec additionally wants:** teacher-settable **"Do Not Use for
Assessment"** flag on evidence (preserves completion/hours while excluding
from the learner model), and triangulation across multiple
phrasings/contexts before a major adaptation.
**Gap:** no such flag exists on `MasteryRecord`/logs today; no
triangulation logic — every check currently feeds the mastery signal
directly and irreversibly.

### 3.5 Printable output
**Have:** the placement test has real print output (`window.print()` +
print-only CSS) — the only place actual paper output exists today.
**Spec wants:** printables generated per-lesson as a matter of course
(puzzles, matching, labeling, field journals, handwriting/cursive
practice) whenever paper materially helps.
**Gap:** `generatePlan`'s output is still plain text (`planText`) — no
worksheet/printable artifact is generated from a day plan itself yet.

### 3.6 Hours/pace vs. mastery separation
**Have:** `paceBalance` concept already exists in spirit
(`getBalance(actual, expected)` in `dashboard.ts`) — positive/negative
banking already matches the spec's formula exactly.
**Spec additionally wants:** an explicit approval gate on hours (logged ≠
official until a teacher approves), and single-canonical-activity-lineage
de-duplication across calendar/extracurricular/PE/field-trip/app sources.
**Gap:** today, a written `logs/` entry is immediately counted — there's
no pending-vs-approved state. Extracurricular ingestion already avoids
double-counting between itself and `logs/` specifically
(`confirmExtracurricular` links them via `extracurricularId`), but there's
no general cross-source de-duplication model.

---

## 4. NOT IMPLEMENTED — genuinely new work

- ~~**Quarter as a certified, versioned object**~~ — **done (step 3).**
  `quarterCertifications/{id}`, immutable hash-compared records, teacher
  uid/timestamp/source. Guardrail is enforced for `generatePlan` (won't
  ground a new plan in uncertified content); still not enforced anywhere
  that would stop building/using Q2 content before Q1 evidence is
  reviewed — that's a process/judgment call, not a code gate, and wasn't
  asked for in step 3.
- ~~**Weekly certification workflow**~~ — **done (step 3),** minus the
  deadline *enforcement* specifically. `weeklyCertifications/{id}` exists,
  gated behind a certified quarter, immutable hash-compared, teacher
  uid/timestamp/source. `WeeklyCertificationSchedule` (configurable
  Friday-review/Sunday-certify default) exists as data on `Family` but
  nothing acts on it yet — no automation enforces the deadline. That's
  intentionally deferred to step 4 (two-day-ahead generation is where a
  deadline would actually matter).
- ~~**Two-day-ahead automatic daily generation**~~ — **partially done
  (step 4).** `generateProposedDays` builds the deterministic lead-time
  calculation, the idempotent generate/regenerate/skip/block decision, and
  the callable/service itself — manually invoked (a teacher clicking
  "Generate," or a future scheduled trigger calling the same callable).
  The scheduled trigger itself (a Cloud Scheduler/cron job that calls it
  automatically) is NOT built — deliberately deferred, no background
  process exists yet.
- ~~**Jasper Morning Message**~~ — **done (step 4).** `ProposedDay.
  jasperMessage: {generated, edited?}`, one per student, generated
  alongside the rest of the proposed day; teacher can override at
  approval without losing the original.
- ~~**Strict vs. Flexible itinerary**~~ — **done at the data/publication
  level (step 4).** `ProposedDay.suggestedItineraryMode` (Claude's
  suggestion) and `.itineraryMode` (teacher's choice, set only at
  approval, reproducible historically). The actual dependency/eligibility
  ENGINE that would make "flexible" mean something beyond a stored label
  is step 5's block/objective work, not built yet — a saved day plan is
  still one `planText` blob, not discrete blocks.
- **Historical Figure Coloring** — new system entirely (see conflict §1.1
  for its relationship to the code it replaces).
- **Carousel factoids** — not implemented.
- **PE as a first-class subject/course** — not in `CORE_SUBJECTS`/
  `SPECIALTY_SUBJECTS` today; would need to be added without breaking
  existing hour math (the spec explicitly calls this out as a migration
  risk to avoid).
- **Ask-a-Teacher / Celeste+Jasper help escalation** — not implemented.
  This is a substantial expansion of the "site-navigation help assistant"
  idea already sitting in `ROADMAP.md` §7 (there, explicitly scoped to
  *navigation* help, not pedagogy) — the new spec is a materially bigger
  scope: real subject-matter help, an escalation chain, and a
  parent-notification fallback.
- **Presentation identity layer** (Jasper/Celeste/Kira/Rhoe/Nova as stable
  IDs) — not implemented. Related architectural note: the current
  `inferKidKey()` (used across placement tests, check-ins, color sheets,
  day-plan context) infers which kid is which **by parsing their display
  name string** ("Millaray"/"Makaio"/"Maizley"/"Maizely"). The spec's
  principle — *"Use stable IDs in software. Do not infer authority or
  identity from names"* — is arguably already mildly violated by this
  existing pattern. Not urgent to fix in isolation, but worth deciding
  whether introducing real presentation-identity IDs is also the moment to
  replace name-inference with a proper stable per-kid ID field.
- **Curriculum Quality Feedback Queue** (flag/quarantine a bad lesson
  version, target the same objective with alternative material) — not
  implemented.
- **Carry-forward / incomplete-work tracking** — day plans have no
  per-block completion state at all today (a plan is one text blob), so
  there's nothing yet to mark incomplete or carry forward.
- **Early-finish enrichment routing** — not implemented (follows from the
  above — no block-level completion state to detect "early finish" from).
- **End-of-day evidence packet + teacher batch approval** — logging today
  is per-entry and immediate, not assembled into a reviewable daily
  packet.
- **Governance: four-cycle release gate** — process, not code; not
  something to "implement" so much as a discipline to follow once real
  releases start happening at this system's scale.
- **Student privacy segmentation vs. shared sibling achievements** — moot
  today only because there's no sibling-facing UI yet (a student can only
  see their own placement status); becomes real work the moment any
  shared/sibling view is built.

---

## 5. DEFERRED — correctly out of scope right now

Matches the spec's own explicit deferral list (Master Spec §24) and
existing `ROADMAP.md` entries:

- Exact Kindred closing language (explicitly external/pending per spec)
- Elaborate rewards/token economy, Jobs Board
- Full family-history corpus, deep Blossom integration contracts
- Sibling apps (Kira/Ro/Nova-Sky-Guide/Code Green) — already deferred in
  `ROADMAP.md`, spec reaffirms WBK stays the authority when these connect
  later
- Native Android vs. PWA decision
- High-school transcript/credit formatting
- Long-term retention-score rubric, fine-grained calendar conflict rules,
  voice vendor details
- Mascot character art, teacher "Guide me" tutorial button — already
  correctly parked in `ROADMAP.md` §7, unaffected by this spec

---

## 6. Build order (approved 2026-09-18, revised from the original proposal)

Backbone-first: the school-day mechanics get built before secondary
presentation features. Each step is its own small, testable increment —
inspect affected code, smallest safe change, build/test, report back —
not one bundled implementation. Deployment always needs separate,
explicit approval regardless of local test results.

1. ~~**Resolve Historical Figure Coloring conflict**~~ — **done.** Subject-
   ring behavior retired; new historical-person selector contract
   established (types only, no selection logic yet).
2. ~~**Generalize the teacher-approval primitive**~~ — **done.**
   `functions/src/approvals.ts` + `proposals`/`auditEvents` collections.
3. ~~**Quarter + weekly certification**~~ — **done.** First real consumer
   of #2; see `functions/src/certification.ts`.
4. ~~**Two-day-ahead daily generation**~~ — **done**, including Jasper
   Morning Message and Strict/Flexible itinerary; see
   `functions/src/proposedDays.ts`.
5. ~~**Day plans upgraded to block/objective-level structure**~~ — **done**,
   including carry-forward, dependencies, retrieval/remediation, and "Do
   Not Use for Assessment"; see `functions/src/types.ts`'s `LearningBlock`
   and `functions/src/curriculum/{objectiveId,blockEligibility,
   carryForward,blockValidation}.ts`.
6. ~~**End-of-day evidence + hour approval**~~ — **done**, completed work
   flows back through teacher verification before becoming authoritative;
   see `functions/src/evidencePackets.ts` and `functions/src/curriculum/
   {evidencePacketStore,evidenceValidation,evidenceMastery,evidenceHours}.ts`.
7. **PE as a first-class component** — carefully migrated into the
   existing Q1 hour system without double-counting or breaking current
   compliance math.
8. **Historical Figure Coloring itself** — anti-repetition, contextual
   weighting, historical breadth, age-appropriate art complexity,
   preservation of completed work.
9. **Ask-a-Teacher escalation + stable student/presentation identities** —
   eliminating `inferKidKey()`-style name inference where practical.
10. **Curriculum Quality Feedback Queue.**
11. **Carousel factoids** — useful, but not required to make school
    operational; last.

Immediate green light was steps 1–2 (both done, this update). Steps 3+
wait for your review of 1–2 before starting.
