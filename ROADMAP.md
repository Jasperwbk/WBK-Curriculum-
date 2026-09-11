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

## Sequencing

None of the above is scheduled. The family wants to build in proper order
rather than jumping around, so treat this file as input for whenever
Phase 2 (curriculum generation) planning actually starts, not a queue to
pull from early.
