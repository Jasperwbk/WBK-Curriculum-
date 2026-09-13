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
project. **`curriculum/seasonal_curriculum_framework.md` has now arrived**,
confirming Q2 (Winter — survival skills & deep focus) as the next quarter's
theme, tied to winter solstice/Yule and to actual Missouri zone 6b/7a
garden-planning timing. Actual Q2 unit content itself (topics/objectives/
weekly hours) hasn't arrived yet — the framework only sets the theme and
structure, not the content. Same structure already proven out in
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

## 4. Printable worksheet format + color-sheet system — RESOLVED

`curriculum/builder_note_worksheet_style.md` and
`curriculum/printable_touchpoints.md` specify the worksheet side: default to
an interactive/puzzle format (maze, matching, word search, fill-in-the-scene)
rather than a bare problem list, with a per-subject fit table (math/science/
nature ID fit almost every day; bushcraft/homestead/spiritual-cultural
rarely need one at all) and age-banded complexity (Millaray can carry more
steps than Makaio; Maizley's "worksheet" is really just her color sheet).

**The coloring-page system has now arrived and is locked**, per
`curriculum/09_image_bank_and_color_agenda.md` and
`curriculum/10_daily_color_sheet_model.md`. Concrete mechanism:
- Each school day, each kid gets exactly **one featured subject** (one of
  the 8 standardized subject strings) + **one color sheet matching that
  subject**. No two kids share a subject or a picture on the same day.
- **Deterministic, collision-free daily assignment**: an 8-subject ring with
  fixed offsets — `Millaray = ring[d % 8]`, `Makaio = ring[(d+3) % 8]`,
  `Maizley = ring[(d+5) % 8]` (offsets 0/3/5 never collide on a ring of 8),
  where `d` is the school-day index within the quarter. Maizley gets nudged
  off a poor toddler fit (bushcraft/social-studies/spiritual-cultural as a
  *drawing*) to the nearest toddler-safe subject not already taken that day.
- **Art-ability bands** stand in for real art assessments until those are
  uploaded: Band A (Maizley) = 2-4 giant objects, no background, thick
  outlines; Band B (Makaio) = one clear scene, 4-8 objects, some interior
  detail; Band C (Millaray) = full detailed scene, finer lines, background
  allowed, still colorable in ~15-20 min. Rebuild band (not subject
  uniqueness) once real art-assessment data arrives — same
  assess-align-reprint pattern as curriculum retuning.
- Color sheets are **generated black line art**, not stock photos — no
  watermarked images, no color fill, no words inside the drawing. Each
  subject has a fixed object vocabulary to draw from (e.g. math → scale,
  tally, baskets of counted produce; bushcraft → clothing layers, fire lay,
  shelter frame, explicitly **no realistic knife for Maizley**).
- This is a separate printable from the subject worksheet but travels with
  it (same staple/folder); a shared pledge/date/weather header strip can
  wrap both, but the drawing itself is always unique per kid per day.

## 5. Video / third-party link tagging — unchanged, optional

Still an open idea (`ROADMAP.md` §6). A `resource_link:` tag mirroring
`field_app:` remains the likely simplest path once the embedding mechanism
itself gets designed. Not needed to keep building.

## 6. Initial placement test content — RESOLVED

**The track splits by kid**, per `curriculum/maizley_track_clarification.md`:

- **Millaray & Makaio** — real, scored, in-app placement test. Question
  content, answer key, and per-question scoring rubric are all in hand:
  `curriculum/assessments/millaray_assessment2_content.md` +
  `millaray_assessment2_rubric.md` (13 items) and
  `curriculum/assessments/makaio_assessment2_content.md` +
  `makaio_assessment2_rubric.md` (12 items), each tagged to subject/skill so
  a result scores into `assessmentBaseline` per subject rather than one lump
  number. Makaio's has no fraction item; otherwise the two are near-identical
  in structure, age-scaled.
- **Maizley (2.5) — no in-app test, no scoring, for now.** Per the track
  clarification file, she gets a printable worksheet + hands-on lesson plan
  for Sarah to teach directly instead — paper/parent-led, not app-scored.
  Content source is `curriculum/assessments/maizley_assessment2_content.md`
  + `maizley_assessment2_rubric.md` (7 checklist items) reused as worksheet
  content with the Y/N scoring column dropped; stays generic/toddler-level,
  not personalized off results. Revisit once she's old enough for the
  scored track (not scheduled).

**The three PDFs originally requested turned out to be mislabeled zip
archives, not valid PDFs** — `ten_year_old_assessment_2_0.pdf`,
`eight_year_old_assessment_2_0.pdf`, and `toddler_assessment_2_0.pdf` will
not open as PDFs on this end either. The `*_assessment2_content.md` files
above are the reliable text export of the same content and are what the
generator should actually build against; regenerating real PDFs (with the
compass-rose/cipher-art design assets) is optional polish, not a blocker.
Note: Makaio's source content still prints the old spelling "Macayo" in its
own title/answer-key header — flag for correction whenever a real PDF is
regenerated; this repo uses "Makaio" everywhere.

The index also says several plain-markdown placement drafts are superseded
and should NOT be sent/used if they turn up separately:
`millaray_placement_test.md`, `makaio_placement_test.md`,
`maizley_placement_observation.md`, `parent_mark_sheet.md`,
`printable_extras.md` — Assessment 2.0 (the content/rubric files above)
replaces all of those.

## 7. Daily routine: Pledge of Allegiance — unchanged

Still needed as a fixed opener before any subject content, every school day.

## Still outstanding — what's actually left

All of the previously-listed "send these next" files have now arrived and
are resolved: the three placement-test files (as reliable `.md` content,
since the source PDFs were broken), `seasonal_curriculum_framework.md`, and
the two color-sheet system files. What's left is smaller and mostly not
blocking:

- **Actual Q2 (Winter) unit content** — the seasonal framework sets the
  theme and structure, but no Q2 topics/objectives/weekly-hours content has
  arrived yet (see §2). This is the next real content dependency, not a
  missing spec.
- **Real placement-test PDFs** (optional/cosmetic) — the three source PDFs
  are unusable, but the `.md` content files are a complete substitute for
  building against. Only needed if/when someone wants a nicer-looking
  printed page than plain markdown-to-PDF gives.
- **Wolf Blossom Kronicles character art** (Kira/Rhoe/Nova + Jasper's
  narrator character) — referenced in `seasonal_curriculum_framework.md` as
  planned pop-up guides on printables, but the art files themselves haven't
  been uploaded. Not blocking Q1/Q2 content, only the character-guide
  polish layer.
- **Real art-assessment data** for the color-sheet bands (grip, line-staying,
  stamina, etc.) — not sent, and not expected soon; age-band defaults in
  `10_daily_color_sheet_model.md` are explicitly meant to be used until this
  arrives, so this isn't something to wait on.
- The "research docket (00-11)" mentioned in the curriculum project's own
  index as "already in the project, still current" remains unclarified —
  worth asking about only if it turns out to contain anything not already
  covered by the files already received.

**Already resolved, for the record:** the "Ecosystem_handoff" naming
ambiguity — `curriculum/curriculum_handoff_notes.md` (v3) explicitly states
it IS that document, so a same-named file in the curriculum project's own
index is a stale/duplicate reference, not a separate thing to chase down.
