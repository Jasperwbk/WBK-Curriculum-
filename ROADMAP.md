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

## 4. Adaptive assessment feeding the daily generator

Weekly/biweekly tests should include specific questions that double as an
ongoing informal placement assessment, not just a grade. Results should
feed back into the curriculum-generation engine so it adjusts upcoming
daily plans automatically per subject per student — e.g. notice one kid
needs more support on fractions in math while doing fine elsewhere, and
another is solid on fractions but weak on grammar — and have the generator
approach the weak spot from a different angle next time, not just repeat
the same explanation louder.

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
dedicated critical-thinking questions, not just subject recall. The family
is building the actual question content in the separate curriculum builder
(see `curriculum/generator_requirements.md` §6); what's needed on the build
side is a way to ingest that content and score it into
`assessmentBaseline` directly. Same underlying schema-granularity issue as
above applies here too — and it's an open question whether this placement
test is its own new thing or an extension of `tests/{testId}`, since a
one-time/per-quarter placement test is different in kind from a routine
weekly/biweekly test.

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
