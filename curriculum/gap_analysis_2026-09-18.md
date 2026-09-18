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

Next up: step 3 (quarter + weekly certification objects), only once
you've reviewed steps 1–2.

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

- **Quarter as a certified, versioned object** — no `Quarter`/certification
  collection exists at all. Nothing today prevents building/using Q2
  content before Q1 evidence is reviewed (not a conflict — just an
  unenforced guardrail).
- **Weekly certification workflow** — no concept of a weekly proposal, no
  Friday-review/Sunday-certify deadline logic, no per-teacher
  certification identity/timestamp record.
- **Two-day-ahead automatic daily generation** — today `generatePlan` only
  runs when a teacher manually triggers it for a chosen date; there's no
  background process keeping the next ~2 days pre-generated.
- **Jasper Morning Message** — no such field or generation step exists on
  `dayPlans` today.
- **Strict vs. Flexible itinerary** — no such concept; a saved day plan is
  just prose text today, not a set of discrete, orderable, lockable
  blocks.
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
3. **Quarter + weekly certification** — first real consumer of #2.
4. **Two-day-ahead daily generation**, including Jasper Morning Message and
   Strict/Flexible itinerary.
5. **Day plans upgraded to block/objective-level structure**, including
   carry-forward, dependencies, retrieval/remediation, and "Do Not Use for
   Assessment."
6. **End-of-day evidence + hour approval** — completed work flows back
   through teacher verification before becoming authoritative.
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
