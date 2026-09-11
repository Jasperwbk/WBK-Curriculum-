# What the Curriculum Generator Needs From the Curriculum Project

Purpose: a concrete handoff list — what has to land in this repo (or get
handed to me directly) before the Phase 2 curriculum-generation engine can
actually be built, versus what's already settled and just needs to keep
being followed. Assessments are explicitly **not** on this list — those
come later as a separate upload once printer access/testing happens, and
the generator will be built to accept that whenever it arrives rather than
waiting on it now. Until then, it works from the same generic,
age-appropriate starting points the Q1 curriculum already uses.

## 1. The Learn/Practice/Test alignment standard (the one real blocker)

`curriculum/curriculum_handoff_notes.md` and
`curriculum/q1_fall/q1_fall_curriculum_overview.md` both reference a
`learn_practice_test_alignment_standard.md` as the locked structural
standard for how Learn/Practice/Test content has to stay aligned with each
other. It's referenced by name only — the actual document has never been
provided. This is the one genuine blocker: without it, a generator would
have to invent its own alignment rules instead of building to the one
already established elsewhere (sounds like it comes out of the "Odin
Skald" project mentioned in the handoff notes). Please provide the actual
file.

## 2. The rest of the curriculum content (beyond Q1 Fall)

Whatever quarters/units exist or are in progress in the separate curriculum
project — Q2, Q3, Q4, or however it's organized. Same structure already
proven out in `curriculum/q1_fall/`, nothing new required:
- **Topic → 3-5 objectives → supporting content** per unit (the locked
  standard from the alignment doc above)
- Tagged with one of the exact standardized subject strings already in use
  (core: `reading_language_arts`, `math`, `science`,
  `social_studies_history`; specialty: `bushcraft_outdoor_skills`,
  `homestead_skills`, `nature_identification`, `spiritual_cultural`)
- Tagged per kid (Millaray/Kira, Makaio/Rhoe, Maizely/Nova, or "any") and
  season
- Weekly hours per subject, the same way Q1 states them (this is what
  `functions/src/curriculum/weeklyHours.ts` derives the dashboard's
  per-subject pace weighting from — see that file and
  `functions/src/curriculum/subjectWeights.ts`)
- `field_app:` tags where a unit connects to an existing/planned subject
  app, same convention as Q1
- Format is flexible (markdown, plain text, whatever's easiest to produce)
  — structure matters more than file format, per the original handoff
  notes

## 3. General education philosophy — already established, just keep following it

Nothing new needed here — the generator will build around the standards
already laid out in the existing curriculum files rather than asking for
more:
- Objectives-first, not topic-first
- Don't do the kid's practice work for them; no timed-pressure drills
- Plant/fungi content always separates safe vs. dangerous look-alikes,
  caution-first
- Northwoods Kindred / Kindred Homestead as the reference sources for
  seasonal and spiritual-cultural content
- Low-rigidity, field-first logging — hours get logged as they actually
  happen, not forced into a fixed daily block
- "Start local, grow outward" for history (Osage → Webster County →
  Missouri → wider country)
- Everything explicitly built as a reasonable generic starting point until
  real assessment data comes in, then re-tuned — not benchmarked against a
  public-school grade level

## 4. Printable worksheet format/template preferences (optional — sensible defaults otherwise)

New requirement since the original handoff notes: most of a day's actual
work should be physical (printed), not on-screen — see `ROADMAP.md` §5.
Specifically: cursive fluency is an explicit goal, and calligraphy comes
later. If there's a preferred worksheet template, paper size, or an
existing cursive-practice format already in use (e.g. traceable letter
models), provide it or point to it — otherwise the generator will produce
reasonable printable worksheets from scratch and this can be refined once
real output exists to react to.

## 5. Video / third-party link tagging (optional, for later)

If curriculum content is going to reference specific videos or outside
links per unit (see `ROADMAP.md` §6 — mechanism still undecided), a
`resource_link:` style tag on the relevant unit, same pattern as
`field_app:`, would be the simplest way to carry that through once the
embedding mechanism itself gets designed. Not needed to start building.

## Not needed yet

- **Assessment results.** Explicitly deferred — will arrive later as an
  upload once testing happens. The generator should be built so that
  filling in `assessmentBaseline` per student later refines its output,
  not so it's blocked without that data now.
