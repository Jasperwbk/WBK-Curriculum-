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

Next up: step 7, only once you've reviewed step 6.

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
