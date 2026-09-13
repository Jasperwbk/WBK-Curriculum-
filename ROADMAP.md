# Roadmap notes — captured, not yet built

Ideas from conversations with the family, written down so they survive past
chat history and land in the right place when their turn in the build comes
up — not implemented yet, and not to be started opportunistically out of
sequence. Each note below says what was asked for and what it touches in
the existing build, so a future session can act on it without re-asking.

## 1. Categorized file upload for the teacher

Right now `uploads/{uploadId}` already has a `category` field in the Phase 1
schema, but there's no UI at all for uploads yet. The ask: don't build one
generic "Upload file" button — build a few purpose-specific drop
zones/buttons so the backend already knows what a file is for the moment
it's dropped, without needing new code for each new file that comes in.
Requested categories (exact set still open):
- **System / webpage update** — files related to updating the app/system
  itself
- **Curriculum update** — content files like the ones already in
  `curriculum/` (the Q1 markdown files)
- **Generic / misc** — a catch-all for anything that doesn't fit the above

Open question for whenever this gets built: does a category do anything
beyond tagging + storage location (e.g. should a "curriculum update" upload
trigger some automatic processing), or is routing/tagging the whole job?

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
quarter's theme comes from `seasonal_curriculum_framework.md` (not sent
yet — Q2 is Winter/survival skills per the index); the alignment standard
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
  string-matched. Still missing: the two raw PDF files themselves
  (`ten_year_old_assessment_2_0.pdf`, `eight_year_old_assessment_2_0.pdf`) —
  content is in hand, only the source PDFs aren't. Note Makaio's PDF prints
  the old spelling "Macayo" in its own title/answer-key text; flag for
  reprint whenever regenerated.
- **Maizley (2.5) — no in-app test, no scoring, for now.** Per
  `curriculum/maizley_track_clarification.md`, she gets a **printable
  worksheet + a basic hands-on lesson plan** for Sarah to teach directly —
  paper and parent-led, not app-tracked, not personalized off results (there's
  no scoring loop feeding it). Content source is
  `curriculum/assessments/maizley_assessment2_rubric.md` (7 checklist items,
  MZ-01–MZ-07 — one-step/two-step directions, body vocabulary, shape/color
  recognition, matching, a hands-on puzzle logged by help-level not
  pass/fail) reused as worksheet/lesson content with the Y/N-style scoring
  column dropped. Revisit once she's old enough for the app-based track —
  not scheduled. Still missing: the raw `toddler_assessment_2_0.pdf` itself.

What's needed on the build side once the raw PDFs arrive for Millaray/Makaio:
a way to ingest that content and score it into `assessmentBaseline` directly.
Same underlying schema-granularity issue as above applies here too — and
it's an open question whether this placement test is its own new thing or an
extension of `tests/{testId}`, since a one-time/per-quarter placement test
is different in kind from a routine weekly/biweekly test. For Maizley, the
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
her color sheet). Both files repeatedly reference a coloring-page system
(`09_image_bank_and_color_agenda.md`, `10_daily_color_sheet_model.md`) not
sent yet — needed to see how the worksheet side is meant to coexist with
it.

## 6. Embedding video / third-party links in curriculum content

Open idea, mechanism not decided: the family wants a way to work videos
and/or third-party links into curriculum content as interactive/clickable
elements — whether that's the teacher including them when building/
uploading curriculum on the back end, or some other integration path.
Flagged explicitly as a "just a note, don't know how yet" item — needs real
design thought whenever it's picked up (how such a link gets attached to a
unit/objective, how it renders in the student view, whether it's teacher-
supplied only or something the generator can also suggest).

## Sequencing

None of the above is scheduled. The family wants to build in proper order
rather than jumping around, so treat this file as input for whenever
Phase 2 (curriculum generation) planning actually starts, not a queue to
pull from early.
