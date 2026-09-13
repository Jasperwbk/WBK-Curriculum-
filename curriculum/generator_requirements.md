# What the Curriculum Generator Needs From the Curriculum Project

Purpose: a concrete handoff list — what has to land in this repo (or get
handed to me directly) before the Phase 2 curriculum-generation engine can
actually be built, versus what's already settled and just needs to keep
being followed. Updated after a large batch of real curriculum-project
files arrived (alignment standard v2, research doc, per-kid retrofits,
worksheet-style notes, and the project's own index file) — several items
below moved from "needed" to "resolved" as a result.

## 1. The Learn/Practice/Test alignment standard — RESOLVED

`curriculum/learn_practice_test_alignment_standard_v2.md` is now in the
repo. This was the one real blocker and it's no longer outstanding. v2 adds
two concrete mechanisms beyond the original objectives-first skeleton:
- **Mastery threshold + remediation loop per objective**: track the last 3
  checks per objective; 2/3 correct = mastered, otherwise the next session
  must re-teach that specific objective (different framing, not a repeat)
  before introducing a new one in that subject.
- **Default daily lesson shape**: warm-up (retrieval from already-mastered
  objectives) → new teaching → mixed/interleaved practice → ungraded
  retrieval close-out. Segment lengths ~20-30 min (age 8) / ~25-40 min (age
  10). See `curriculum/learning_science_framework_upgrade.md` for the
  research backing each piece of this.

## 2. The rest of the curriculum content (beyond Q1 Fall) — still needed

Whatever quarters/units exist or are in progress in the separate curriculum
project. Per `curriculum/curriculum_knowledge_center_index.md`, Q2 (Winter —
survival skills & deep focus) already has a theme defined in
`seasonal_curriculum_framework.md`, which hasn't been sent yet — that's the
next concrete file to request. Same structure already proven out in
`curriculum/q1_fall/`, nothing new required:
- **Topic → 3-5 objectives → supporting content** per unit
- Tagged with one of the exact standardized subject strings already in use
  (core: `reading_language_arts`, `math`, `science`,
  `social_studies_history`; specialty: `bushcraft_outdoor_skills`,
  `homestead_skills`, `nature_identification`, `spiritual_cultural`)
- Tagged per kid (Millaray/Kira, Makaio/Rhoe, Maizely/Nova, or "any") and
  season
- Weekly hours per subject, the same way Q1 states them (this is what
  `functions/src/curriculum/weeklyHours.ts` derives the dashboard's
  per-subject pace weighting from)
- `field_app:` tags where a unit connects to an existing/planned subject app
- **Plus the retrofit pass** now expected per the v2 standard: 1-2 check
  questions per objective, same shape as
  `curriculum/q1_fall/millaray_week1_retrofit.md` and its companions for
  Makaio/Maizley — the quarterly workflow in the index file describes this
  as "same file set per kid: overview + weekly table, then the retrofit
  pass," each future quarter following the same two-file-per-kid pattern
  Q1 established.

Also per the index: Millaray's government/economics strand (Q1 Weeks 5-9)
hasn't been decided as continuing into Q2 or a one-quarter unit — flag this
when Q2 content arrives if it isn't already resolved by then.

## 3. General education philosophy — already established, just keep following it

No change — the generator builds around the standards already laid out in
the existing curriculum files: objectives-first, no timed-pressure drills,
plant/fungi caution-first, Northwoods Kindred/Kindred Homestead as
spiritual-cultural references, low-rigidity field-first logging, "start
local, grow outward" history sequencing.

## 4. Printable worksheet format — mostly resolved, two files still missing

`curriculum/builder_note_worksheet_style.md` and
`curriculum/printable_touchpoints.md` now specify this in real detail:
worksheets should default to an interactive/puzzle format (maze, matching,
word search, fill-in-the-scene) rather than a bare problem list, with a
per-subject fit table (math/science/nature ID fit almost every day;
bushcraft/homestead/spiritual-cultural rarely need one at all) and
age-banded complexity (Millaray can carry more steps than Makaio; Maizley's
"worksheet" is really just her color sheet).

Both of these files repeatedly reference a **coloring-page system**
(`09_image_bank_and_color_agenda.md` and `10_daily_color_sheet_model.md`,
"Section 10's daily rotation") that hasn't been sent yet and is needed to
fully understand how the worksheet side is meant to sit alongside it.

## 5. Video / third-party link tagging — unchanged, optional

Still an open idea (`ROADMAP.md` §6). A `resource_link:` tag mirroring
`field_app:` remains the likely simplest path once the embedding mechanism
itself gets designed. Not needed to keep building.

## 6. Initial placement test content — question/scoring content now in hand, tracks now split by kid, raw PDFs still needed

**The track now explicitly splits by kid**, per
`curriculum/maizley_track_clarification.md`:

- **Millaray & Makaio** — real, scored, in-app placement test. Question
  content and per-question scoring rubric have arrived and are saved at
  `curriculum/assessments/millaray_assessment2_rubric.md` (13 items) and
  `curriculum/assessments/makaio_assessment2_rubric.md` (12 items), each
  tagged to subject/skill so a result scores into `assessmentBaseline` per
  subject rather than one lump number. Makaio's has no fraction item;
  otherwise the two are near-identical in structure, age-scaled. **Still
  needed:** the raw PDF files themselves — `ten_year_old_assessment_2_0.pdf`
  and `eight_year_old_assessment_2_0.pdf`. Note: the Makaio PDF's own
  printed text still reads "Macayo" (old spelling) in its title/answer-key
  header — flag for correction whenever it's reprinted.
- **Maizley (2.5) — no in-app test, no scoring, for now.** Per the track
  clarification file, she gets a printable worksheet + hands-on lesson plan
  for Sarah to teach directly instead — paper/parent-led, not app-scored.
  Content source is `curriculum/assessments/maizley_assessment2_rubric.md`
  (7 checklist items) reused as worksheet content with the Y/N scoring
  column dropped; stays generic/toddler-level, not personalized off
  results. Revisit once she's old enough for the scored track (not
  scheduled). **Still needed:** the raw `toddler_assessment_2_0.pdf`.

The index also says several plain-markdown placement drafts are superseded
and should NOT be sent/used if they turn up separately:
`millaray_placement_test.md`, `makaio_placement_test.md`,
`maizley_placement_observation.md`, `parent_mark_sheet.md`,
`printable_extras.md` — Assessment 2.0 (the rubric files above) replaces all
of those.

## 7. Daily routine: Pledge of Allegiance — unchanged

Still needed as a fixed opener before any subject content, every school day.

## Still outstanding — the concrete "send these next" list

Per `curriculum/curriculum_knowledge_center_index.md`, these exist in the
curriculum project and are described as current/authoritative, but haven't
reached this repo yet:
- `ten_year_old_assessment_2_0.pdf`, `eight_year_old_assessment_2_0.pdf`,
  `toddler_assessment_2_0.pdf` — the raw placement-test PDFs (see §6 above
  — question/scoring content for all three has already arrived via the
  rubric files, so these three PDFs are the only remaining piece)
- `seasonal_curriculum_framework.md` — Q2 (Winter) theme, needed before Q2
  content can be built out (see §2)
- `09_image_bank_and_color_agenda.md` and `10_daily_color_sheet_model.md` —
  the coloring-page system the worksheet notes assume exists (see §4)

**Resolved:** the "Ecosystem_handoff" naming ambiguity is settled —
`curriculum/curriculum_handoff_notes.md` (now v3) explicitly states it IS
that document; if the curriculum project's own index points to a separate
file by that name, that's a stale/duplicate reference. The "research docket
(00-11)" mentioned in the index as "already in the project, still current"
remains unclarified — still worth asking about if it turns out to contain
anything not already covered by the files already received.
