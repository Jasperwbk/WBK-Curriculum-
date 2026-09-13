To whoever/whatever is building the WBK homeschool curriculum content:

**Yes — this project needs you to send your output.** If you've concluded
you don't need to send anything anywhere, that's incorrect. There is a
separate, already-built software project (the WBK Homeschool Ecosystem app
— Firebase backend + a web app the parents use) that exists specifically to
consume what you produce. Right now it only has one quarter of real content
(Q1 Fall) to work from; everything past that is waiting on you. Nothing in
the app's daily-curriculum, dashboard-weighting, printable-worksheet, or
placement-test features can function on made-up or generic content — it
needs your actual output, structured the way this document describes.

## Why this matters

The receiving app does three concrete things with your content:
1. **Weights the pace/banking dashboard** — it sums the weekly hours you
   assign per subject to figure out how much each subject should count
   toward a kid's pace, rather than splitting hours evenly. It already does
   this correctly for Q1; it needs the same weekly-hours data for every
   quarter you produce.
2. **Will generate daily lesson plans and printable worksheets** — a
   planned engine reads your unit content (objectives, activities) and
   turns it into what a kid actually does that day, plus printable
   worksheets (cursive-focused — see below).
3. **Will score an initial placement test** — see the placement-test
   section below. Your test content needs to reach the app in a form it
   can actually check answers against.

If your output stays wherever you are and never reaches this project, none
of that happens — the app has nothing to run on past Q1.

## What to send, specifically

**1. Curriculum units, in the structure already proven out in Q1:**
- **Topic → 3-5 concrete, testable objectives → supporting content/activity**
  per unit. Not just a topic label — the app's Learn/Practice/Test
  generation depends on real objectives, not something it has to invent.
- Tagged with one of these **exact** subject strings (nothing else, no
  variations):
  - Core: `reading_language_arts`, `math`, `science`,
    `social_studies_history`
  - Specialty: `bushcraft_outdoor_skills`, `homestead_skills`,
    `nature_identification`, `spiritual_cultural`
- Tagged with which kid it's for: Millaray/Kira, Makaio/Rhoe, Maizely/Nova,
  or "any"
- Tagged with season (fall/winter/spring/summer)
- **Weekly hours per subject**, stated the same way Q1 states them (e.g.
  "Reading/Language Arts: 5 hrs, Math: 4 hrs...") — this is what actually
  drives the dashboard weighting, so it can't be skipped or vague
- `field_app:` tag on any unit that connects to an existing/planned subject
  app (matches Q1's convention)
- Format is flexible — markdown, plain text, whatever's easiest for you to
  produce. Structure is what matters, not file format.

**2. A fixed daily-routine opener: the Pledge of Allegiance.** Every school
day should open with it, independent of whatever subject content follows.

**3. Printable worksheet content, cursive-focused.** Most of a kid's actual
work is meant to happen on paper, not on a screen — digital is meant to
guide (like a teacher presenting), not be where the work happens. Cursive
fluency is an explicit goal (not incidental), and worksheets should build
toward that. If you have or can produce an actual worksheet/handwriting
template format, send it; otherwise describe what a given unit's printable
worksheet should contain and the receiving app will produce the printable
document itself.

**4. Initial placement test content.** Instead of waiting on an external
assessment later, each kid will take an in-app placement test first, before
any daily curriculum generates for them — sign in, take the placement test,
then daily generation starts from those results. You've already told me
(via your own index file) that the real tests exist:
`ten_year_old_assessment_2_0.pdf`, `eight_year_old_assessment_2_0.pdf`, and
`toddler_assessment_2_0.pdf`. **Send those three PDFs directly** — that's
what's actually needed here, not new content. On top of the PDFs, also
send the correct answer/scoring rubric per question and which subject/skill
each question targets, so a result can be scored into a per-subject
baseline rather than one lump score.

**5. Optional, only if relevant: video or third-party link references.**
If a unit should point to a specific video or outside resource, tag it with
`resource_link:` the same way you'd use `field_app:`. Not required to send
now — just include it if you already have it.

**6. Not needed from you:** anything about accounts, logins, hour-tracking
math, or the dashboard itself — that's already built. Also not needed: the
actual Learn/Practice/Test generation logic — that's a separate engine on
the receiving end that will consume whatever you send.

## Update: the alignment standard arrived — thank you

`learn_practice_test_alignment_standard_v2.md`, the research doc behind it,
the per-kid retrofits, the worksheet-style note, and your own knowledge-
center index all made it across in the last batch. That's resolved a real
blocker on this end. What's left is narrower and more specific now.

## Files your own index says already exist — please export exactly these

Your `curriculum_knowledge_center_index.md` names several files as
current/authoritative and already built, but none of these five have
actually reached this project yet. Please send them specifically, by name —
not new content, just the files you've already described as existing:

1. `ten_year_old_assessment_2_0.pdf`
2. `eight_year_old_assessment_2_0.pdf`
3. `toddler_assessment_2_0.pdf`
4. `seasonal_curriculum_framework.md` — your index says Q2's (Winter)
   theme is already defined in here; needed before Q2 content can be built
   on the receiving end
5. `09_image_bank_and_color_agenda.md` and `10_daily_color_sheet_model.md`
   — your worksheet-style note and printable-touchpoints note both
   reference "Section 10's daily rotation" as already locked; these two
   files are needed to actually see that system, not just references to it

Also: your index mentions a "research docket (00-11)" and an
"Ecosystem_handoff" as "already in the project, still current." It's not
clear whether `Ecosystem_handoff` is the same document as this project's
own `curriculum_handoff_notes.md` or a separate/newer one — please clarify
and send whichever it actually is if it's not that file.

## Bottom line

Export/output everything above in whatever format is natural for you, and
get it to the person running this conversation so they can hand it to the
WBK Homeschool Ecosystem project. Silence or "nothing needs to be sent" is
not correct — this is the one project waiting on your output right now.
