# Roadmap notes — captured, not yet built

Ideas from conversations with the family, written down so they survive past
chat history and land in the right place when their turn in the build comes
up — not implemented yet, and not to be started opportunistically out of
sequence. Each note below says what was asked for and what it touches in
the existing build, so a future session can act on it without re-asking.

## 1. Categorized file upload for the teacher — BUILT

Built as the `/upload` page, with the answer to this section's original
open question ("does a category do anything beyond tagging?") landing on
yes for curriculum specifically: dropping in a new quarter's curriculum
file doesn't just file it away — it's parsed (client-side, deterministic,
no AI) into `curriculumContent/{familyId}_{kidKey}_{quarter}` and goes
live for day-plan generation immediately, no code change or deploy. This
was prompted directly by Jasper wanting Sarah to be able to run the whole
system independently if he's ever unavailable — "an easy button... drag
and drop the quarter data... and boom, it's done."

Two purpose-specific sections, per the original ask:
- **📚 Upload new quarter curriculum** — per-kid drop zones (Millaray/
  Makaio/Maizley), a quarter picker (Q1-Q4), a preview of exactly which
  weeks were found before anything is saved, then one publish button per
  kid. `web/src/lib/parseCurriculumMarkdown.ts` splits on the same
  `## Week N — Title` headings the Q1 files already use and pulls
  per-subject hours out of the table (summing same-subject rows within a
  week, e.g. Millaray's Weeks 5-9 local-history + government/economics
  split) — verified against the real Millaray Q1 file: all 9 weeks, all
  titles, correct hours including the split-strand weeks.
- **📎 Family documents** — the original "System/Curriculum/Generic"
  category idea, generalized a bit further (curriculum file / extracurricular
  record / photo / other) with a simple list of what's already there — "one
  little brain" for school documents, per the ask, though still just file
  storage + tagging here, no parsing (unlike the curriculum section above).

`functions/src/curriculum/loadCurriculumContent.ts` (renamed from the Q1-only
`loadQ1Content.ts`) now checks Firestore first for any quarter, falling back
to the original bundled Q1 files only when quarter is "q1" and nothing's
been uploaded there yet — so Q1 keeps working with zero migration, and Q2
onward is 100% upload-driven.

**Explicitly out of scope for this pass:** the dashboard's per-subject pace
weighting (`functions/src/curriculum/subjectWeights.ts`) still always uses
the static Q1 hours baseline for the whole year, not whatever's been
uploaded for the current quarter — touching that felt like a separate,
riskier change to make as a side effect of the upload feature rather than
bundled in. The parser already extracts per-subject hours per week
(`ParsedWeek.hours`) in anticipation of this, so wiring it in later is a
matter of reading `curriculumContent` in `computeDashboardData` rather than
building anything new — worth doing once there's an actual Q2 quarter live
to weight against.

## 2. Daily-plan continuity between days

When the curriculum-generation engine (Phase 2, not started) creates a
day's plan for a student, it should also write a small continuity record —
what was actually covered that day, and near-term goals — so the *next*
day's generation reads it and builds forward instead of repeating content
or losing the thread. The family specifically said this belongs with the
spec/planning material for the curriculum engine, not as a Phase 1
Firestore addition today. Functionally this means: whatever the Phase 2
generator turns out to be, it needs a per-student rolling "what's been
covered, what's next" state it reads before generating and updates after —
designed in from the start rather than bolted on once the engine is
stateless and already built.

Note: this is a different, more persistent thing than the `dayPlans`
collection added in this session — `dayPlans` is one teacher-drafted day at
a time with no memory of prior days; this is about an eventual generation
engine that chains days together.

**Why the day-or-two-ahead window matters (clarified after this was first
written down):** the whole point of the teacher seeing a day's content
before it reaches the kids is so she can review it properly — read the
teacher's notes, adjust or completely rewrite it if needed, and explicitly
approve or reject it before it goes out. Today's `dayPlans` flow already
satisfies this in spirit because the teacher is the one generating and
saving it by hand — there's no separate approval step because she's the
author. But once the real generator exists and starts producing days
automatically (rather than the teacher prompting it for a specific day),
it will need an actual review gate — something like a
draft/pending-review/approved-or-rejected state, not just save-equals-publish
— so the teacher keeps a real thumbs-up/thumbs-down before anything reaches
a student, even when she didn't personally write the prompt that generated
it.

## 3. Quarterly export / portfolio archive

On each new quarterly curriculum update, automatically zip and export, per
student: all the daily-generated content/records stored under their
profile, plus any transcripts. Almost certainly in service of the Missouri
portfolio-keeping expectations already referenced in
`curriculum/q1_fall/q1_fall_curriculum_overview.md`. Depends on #2 existing
first (there's nothing per-day to zip until daily generation produces and
stores something). Will need: a defined per-day storage shape per student,
a zip/export mechanism (a Cloud Function triggered manually or on a
quarter-boundary seems natural), and a delivery method (download link,
email, a Storage bucket the teacher can browse).

Two more pieces added to this idea since it was first written down:

- **A designated destination folder the teacher picks once, not every
  time.** The app should let the teacher choose a folder (once — with a way
  to change it later), remember that choice, and have every future
  quarterly export land there automatically without re-picking a
  destination each quarter. Open design question for whenever this gets
  built: "folder" could mean a folder on the teacher's own device (the
  browser's File System Access API can remember a directory handle, but
  that's local to one device/browser profile) or a folder in a connected
  cloud drive (e.g. Google Drive, reachable from any device — fits better
  given the whole point of this app is one account working across web and
  the future Android app). Leaning cloud-folder for that reason, but not
  decided.
- **A "view previous quarterlies" screen** that goes back to that same
  destination and lists past exports so they can be pulled up again later
  — explicitly called out as important for a homeschool audit, where being
  able to produce prior transcripts on demand matters. At minimum this
  means keeping a record (probably a Firestore doc per export: which
  quarter, which student(s), when it was created, and where it landed) even
  if the files themselves live in the external folder rather than in
  Firebase Storage.

**The quarter-to-quarter workflow this feeds is now spec'd**, in
`curriculum/curriculum_knowledge_center_index.md`: when a new assessment
printout comes back, read it **per objective, not per subject** (matching
the mastery-tracking granularity from §4 below); objectives that came back
solid become warm-up/review material in the new quarter, objectives still
shaky get re-taught before new ones stack on top (same remediation-loop
logic as mid-quarter, just applied at the quarter boundary); the new
quarter's theme comes from `curriculum/seasonal_curriculum_framework.md`
(now in the repo — confirms Q2 is Winter/survival skills & deep focus,
anchored to the winter solstice/Yule and actual zone 6b/7a garden-planning
timing; actual Q2 unit content itself hasn't arrived yet, only the theme);
the alignment standard
itself doesn't change quarter to quarter, only the objectives content does.
This is "retune, don't rebuild" — worth keeping in mind for whatever the
export/archive step actually packages up, since it implies the exported
per-quarter record should be structured around objectives-and-their-mastery-
status, not just raw daily logs.

## 4. Adaptive assessment feeding the daily generator — mechanism now concrete

Originally written as a vague "results should feed back somehow." That's no
longer vague: `curriculum/learn_practice_test_alignment_standard_v2.md`
specifies the actual mechanism, already validated against real learning-
science research in `curriculum/learning_science_framework_upgrade.md`
(Bloom's mastery learning, the testing effect, spacing, interleaving —
sources cited there):
- **Per-objective running record**: last 3 check results tracked per
  individual objective, not per topic/subject.
- **Mastery threshold**: 2 of 3 correct = mastered; below that = "in
  progress."
- **Remediation loop**: an objective below threshold gets re-taught (a
  genuinely different framing/example, not the same lesson repeated) before
  any new objective is introduced in that subject — the engine isn't
  allowed to move on just because the week's theme is moving on.
- **Rebuild rule**: a cluster of low results across a whole subject (not
  just one objective) signals dropping that subject's difficulty a notch,
  not looping the same objective forever.
- Every check's feedback should say *why* an answer is right or wrong, not
  just mark it — that's what makes the check teach, not just measure.
- Per-kid retrofit examples showing this applied to real Q1 content:
  `curriculum/q1_fall/millaray_week1_retrofit.md` (+ weeks 2-9),
  `makaio_weeks1-9_retrofit.md`, `maizley_weeks1-9_retrofit.md` (hers uses a
  softer Y/N-per-objective style with no mastery gate, matching her
  existing "participation over mastery" design).

**Update — the mechanism is now built and live, scoped to Week 1 as a
pilot.** `functions/src/mastery.ts` implements the 2-of-3 threshold as a
pure, tested function; `functions/src/curriculum/weeklyObjectives.ts`
transcribes Millaray's and Makaio's Week 1 retrofit objectives + check
questions (46 total); a new `submitCheckIn` callable and a "Weekly
check-in" page let the teacher mark each objective got-it/needs-work in the
moment, which updates `masteryRecords` — the same collection `generatePlan`
already reads for its mastered/still-building context. Week 1 only, on
purpose: `millaray_week1_retrofit.md` itself frames Week 1 as a pilot
("if this shape works for you, I'll carry it through Weeks 2-9"), so this
proves the mechanism end to end before transcribing the other 8 weeks per
kid — that transcription (weeks 2-9, both kids) is the concrete next step
once this pilot has actually been used for a week or two. Maizley stays
off this mechanism entirely for now, per her track's no-mastery-gate design
— her Week 1-9 checks remain informal/paper rather than app-tracked.

**Confirmed direction, plus two refinements — now built**, from a
conversation walking through how placement/check-ins should actually work
day to day:
- **The gradual-difficulty-increase shape is confirmed as the right one** —
  gate on mastery, introduce harder material once a kid demonstrates it,
  same as already built. Keep building it this way.
- **Detect "too easy" and probe upward — built.** `masteryRecords` now
  tracks a second, stricter signal alongside "mastered": `aced` (3-for-3
  correct, not just 2-of-3 — see `functions/src/mastery.ts`). A single miss
  immediately drops it back out, so it only ever reflects a genuine
  no-struggle streak, not a lucky run mixed with a miss. `generatePlan`
  reads this: an aced objective gets told to serve a genuinely harder
  stretch version of that skill instead of review, and once *every*
  currently-tracked objective in a subject is aced, the whole subject gets
  flagged to push into above-grade-level material rather than keep cycling
  grade-level review. The Weekly Check-in page shows a "🚀 Acing it" badge
  the moment it triggers, distinct from the plain "● Mastered" badge.
- **Two-phase goal, explicitly stated and now reflected in the generator's
  prompt:** close whatever gaps a kid currently has relative to their own
  age/grade level first (expected, since there's no established curriculum
  history yet); once caught up — every tracked objective in a subject
  aced — keep pushing past typical grade-level expectations there rather
  than plateauing, per the above. Not "solved" in any deep sense (there's
  no authored above-grade-level content bank; it leans on Claude to
  generate genuinely harder material on the fly from the prompt
  instruction), but the detection + escalation signal itself is real and
  live, not just a design note anymore.

**Placement test print/export — built.** The Placement Test page now has a
"Print blank copy" button per selected kid, rendering a clean, ink-friendly
paper version (plain question list + blank answer lines/checkboxes, no app
chrome or scoring UI) via the browser's own print dialog — no more manually
retyping the test into a separate document to hand it to a kid on paper.

**A real correctness gap, now fixed: `generatePlan` wasn't actually reading
the real curriculum content.** Caught by direct question ("does Claude have
the data he's supposed to build from, or is he just generating randomly?")
— the honest answer at the time was the latter. The generator had the
pedagogical *rules* (pledge, daily shape, mastery routing) and short
mastery-record skill labels, but never the actual authored Q1 week content
sitting in `curriculum/q1_fall/{kid}_q1_fall.md` — so on any day without a
detailed teacher prompt, it was filling that gap with plausible-sounding
general knowledge instead of the real curriculum. Fixed:
`functions/src/curriculum/loadQ1Content.ts` extracts the correct week's
actual topic/objective/activity table (verbatim) for a kid from those
files, keyed off the plan's date via the same school-day-index math the
color-sheet rotation already uses; `generatePlan`'s prompt now states that
block is authoritative when present and must ground the day's real topics,
not just inform tone. The source files are copied into the deployed
function at build time (`functions/scripts/copy-curriculum-data.js`, wired
into `npm run build`) since `firebase deploy` only uploads `functions/`,
not the repo-level `curriculum/` folder — verified end to end against the
real compiled output (correct week extraction, no bleed into the next
week's heading, correct null outside Q1's 9 weeks). Scoped to Q1 only, same
as everything else here — Q2+ content will need the same treatment once
it's written.

This still needs one specific per-kid example: notice one kid needs more
support on fractions in math while doing fine elsewhere, and another is
solid on fractions but weak on grammar — that's exactly what the
per-objective mastery tracking above is meant to catch and route around,
now that the tracking mechanism itself is spec'd rather than aspirational.

Flagging a real schema gap this will hit: the current `tests/{testId}`
schema (`functions/src/types.ts`) only stores one holistic `score: string`
per test. Genuine per-skill adaptive feedback will need something more
granular than that — per-question or per-objective results tagged to a
skill, not just an overall score — so the test schema will likely need to
grow before this can work, not just the generator.

**Plan changed on the starting point specifically:** rather than waiting on
an external assessment upload to seed `assessmentBaseline` (the original
plan), each kid will take an **in-app initial placement test** — grade-level
basics across all standardized subjects, a random/varied question mix, and
dedicated critical-thinking questions, not just subject recall. **Update —
the track now explicitly splits by kid, per `curriculum/maizley_track_clarification.md`:**

- **Millaray & Makaio** — the real, scored, in-app placement test track,
  unchanged from the plan above. The question content and per-question
  scoring rubric are now fully in hand: `curriculum/assessments/millaray_assessment2_rubric.md`
  (13 items, MA-01–MA-13) and `curriculum/assessments/makaio_assessment2_rubric.md`
  (12 items, MK-01–MK-12), each tagged to a subject/skill so a result scores
  into `assessmentBaseline` per subject rather than one lump number. Only
  the fixed-numeric-answer math items (addition/subtraction/multiplication/
  money/fractions) have a single correct answer; everything else (reading
  retelling, descriptive writing, Missouri knowledge, nature ID, mechanical
  reasoning, the bucket logic puzzle, wayfinding, the Wilderwood Cipher) is
  open-ended and needs to be scored for reasoning/explanation quality, not
  string-matched. **The three source PDFs turned out to be mislabeled zip
  archives, not valid PDFs** — this is now fully resolved rather than
  waiting: `curriculum/assessments/millaray_assessment2_content.md` and
  `makaio_assessment2_content.md` are the reliable text export (same
  questions + answer key) and are what the generator should build against.
  A real designed PDF (compass-rose motif, cipher art) is optional visual
  polish, not a blocker. Note Makaio's source content still prints the old
  spelling "Macayo" in its own title/answer-key text; this repo uses
  "Makaio" everywhere — flag for correction whenever a real PDF is made.
- **Maizley (2.5) — no in-app test, no scoring, for now.** Per
  `curriculum/maizley_track_clarification.md`, she gets a **printable
  worksheet + a basic hands-on lesson plan** for Sarah to teach directly —
  paper and parent-led, not app-tracked, not personalized off results (there's
  no scoring loop feeding it). Content source is
  `curriculum/assessments/maizley_assessment2_content.md` (7 checklist items,
  MZ-01–MZ-07 — one-step/two-step directions, body vocabulary, shape/color
  recognition, matching, a hands-on puzzle logged by help-level not
  pass/fail) reused as worksheet/lesson content with the Y/N-style scoring
  column dropped. Revisit once she's old enough for the app-based track —
  not scheduled. Her source PDF was equally broken; the content file is the
  reliable version here too.

What's needed on the build side now: a way to ingest the Millaray/Makaio
content and score it into `assessmentBaseline` directly. Same underlying
schema-granularity issue as above applies here too — and it's an open
question whether this placement test is its own new thing or an extension
of `tests/{testId}`, since a one-time/per-quarter placement test is
different in kind from a routine weekly/biweekly test. For Maizley, the
build-side need is different in kind: a printable-generation path, not a
scoring/ingestion one.

**Daily lesson shape is also now spec'd** (v2 standard, "Daily Shape"
section): warm-up (5-10 min, retrieval questions from already-mastered
objectives, not today's material) → new teaching → mixed/interleaved
practice (today's objective + 1-2 older ones once 2+ are live) → ungraded
retrieval close-out. Interleaved practice is *expected* to produce more
wrong answers and feel harder than blocked drilling — that's the method
working, not regressing, and should be noted as such in any parent-facing
summary so it doesn't read as the system malfunctioning.

## 4b. Daily routine: Pledge of Allegiance

New, small, but explicit: the Pledge of Allegiance should open every school
day as a fixed routine element, not tied to any one subject — the same way
`spiritual_cultural` content already carries family rituals (harvest blót,
Winter Nights) elsewhere in the Q1 curriculum. Whatever ends up generating
or structuring a day needs to treat this as a standing first step.

## 5. Mostly-physical output, cursive as a priority

Digital should be the *guidance* layer — like a teacher presenting slides —
not where the actual work happens. When the generator produces a day's
content, it needs to produce real printable worksheets the kids do by hand,
not just on-screen text. Specific priorities called out:
- **Cursive fluency is an explicit goal**, not incidental handwriting
  practice — the family wants the kids to actually become fluent in
  cursive, so printable content should build toward that deliberately.
- **Calligraphy** is a planned skill for later, as they get older (the
  family already has calligraphy kits) — not needed now, but worth knowing
  the physical-writing thread is meant to extend that far.
- The actual practice/work should be **mostly physical (printed
  worksheets) or interactive through the family's own apps** — named
  explicitly: Nova, Kira, and Rhoe (the existing/planned per-kid subject
  apps — Rhoe Field Scout is already live per the original spec), plus
  "WBK Survival," also called "Code Green." Digital screens in the
  curriculum itself should stay in the instructional/guidance role, not
  become the medium the kids actually work in.

This has real implications for whatever generates curriculum content later:
it can't just emit text for a screen — it needs an actual printable-document
output (PDF worksheets), and cursive/handwriting practice should be a
recognized category of that output, not an afterthought.

**Update — worksheet style is now specified, not just "make it physical":**
`curriculum/builder_note_worksheet_style.md` and
`curriculum/printable_touchpoints.md` give real detail. Default to
interactive/puzzle formats (maze, matching columns, word search,
fill-in-the-scene) rather than a bare problem list — the reference point
given was dollar-bin/activity-book style workbooks, which is what these
three kids actually engage with, not drill sheets. Straight drill is a
fallback only (e.g. a spelling quiz), not the default. Per-subject fit
varies a lot: math/science/nature ID fit a worksheet almost every day;
bushcraft/homestead/spiritual-cultural rarely should have one at all (these
are hands-on/demonstrated skills — a worksheet substitutes for doing it,
which defeats the point). Age-scales down in complexity from Millaray
(more steps/detail) to Makaio (shorter) to Maizley (no real worksheet, just
her color sheet).

**Update — the color-sheet system referenced above has now arrived and is
locked**, per `curriculum/09_image_bank_and_color_agenda.md` and
`curriculum/10_daily_color_sheet_model.md`:
- Each school day, each kid gets **one featured subject** (one of the 8
  standardized subject strings) and **one color sheet matching that
  subject** — generated black line art, not a stock photo or generic
  clip-art. No two kids share a subject or a picture the same day.
- Daily assignment is **deterministic, not random**, so the three don't
  collide: an 8-item subject ring with fixed per-kid offsets (`Millaray =
  ring[d % 8]`, `Makaio = ring[(d+3) % 8]`, `Maizley = ring[(d+5) % 8]`,
  `d` = school-day index in the quarter). Maizley gets nudged off a poor
  toddler fit (bushcraft/social-studies/spiritual-cultural as a drawing) to
  the nearest toddler-safe subject the other two don't already have.
  Example nudge already worked out for Week 1 Day 1: Millaray→math,
  Makaio→reading_language_arts, Maizley→nature_identification (nudged off
  social_studies).
- **Art-ability bands stand in for real art assessments** until those are
  uploaded — Band A (Maizley): 2-4 giant objects, thick outlines, no
  background; Band B (Makaio): one clear scene, 4-8 objects; Band C
  (Millaray): full detailed scene, background allowed, still colorable in
  ~15-20 min. When real art-sample data eventually arrives (grip,
  line-staying, stamina, etc.), rebuild *band* the same assess-align-reprint
  way curriculum rebuilds after placement — subject uniqueness never
  changes, only complexity.
- Per-subject drawing content is fixed to keep it recognizable and
  age-appropriate (e.g. no realistic knife for Maizley even under
  bushcraft; no invented ritual diagrams under spiritual-cultural; no
  battle gore under social-studies). The color sheet is a separate printable
  from the day's worksheet but travels with it.

## 6. Embedding video / third-party links in curriculum content

Open idea, mechanism not decided: the family wants a way to work videos
and/or third-party links into curriculum content as interactive/clickable
elements — whether that's the teacher including them when building/
uploading curriculum on the back end, or some other integration path.
Flagged explicitly as a "just a note, don't know how yet" item — needs real
design thought whenever it's picked up (how such a link gets attached to a
unit/objective, how it renders in the student view, whether it's teacher-
supplied only or something the generator can also suggest).

## 7. Student view: distinct per-login theme, mascot guide, and in-app help assistants

Explicitly flagged as "hold for later" — not scheduled, and confirmed the
student view is still just the placeholder screen behind a student login
today (`web/src/pages/StudentPlaceholderPage.tsx`). Three related ideas to
build whenever this gets picked up:

- **The student view should look and feel distinctly different per login**,
  not a re-skinned version of the teacher dashboard — fun and kid-engaging
  rather than a productivity-tool look. Jasper will supply the actual
  character/imagery to build it around, so don't invent placeholder mascot
  art in the meantime.
- **A mascot character acts as an in-app guide/tutor presence** for the
  student view — likely one of the existing Wolf Blossom Kronicles
  characters already referenced elsewhere in this repo (Kira for Millaray,
  Rhoe for Makaio, Nova for Maizley — see
  `curriculum/seasonal_curriculum_framework.md`), walking a kid through
  their day rather than a bare list of tasks. Character art still needs to
  be uploaded before this can be built (same still-outstanding item already
  tracked in `curriculum/generator_requirements.md`).
- **A "Guide me" / tutorial button on teacher accounts** — separate from the
  student-side mascot — that walks Sarah/Jasper through what a screen does
  and where to go next, for whenever the app has grown past what's
  self-explanatory at a glance.
- **A basic integrated LLM assistant on the student side** — explicitly
  scoped as *site navigation/how-to-use-this-app help*, not a curriculum
  tutor answering academic questions ("where do I find today's worksheet,"
  not "explain fractions to me"). Keep this distinction in mind if/when
  designing it — it's a much smaller, narrower assistant than the
  curriculum-generation engine itself, closer to an in-app help chat than
  an AI tutor.

## Sequencing

None of the above is scheduled. The family wants to build in proper order
rather than jumping around, so treat this file as input for whenever
Phase 2 (curriculum generation) planning actually starts, not a queue to
pull from early.
