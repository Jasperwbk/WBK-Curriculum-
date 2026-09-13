# Handoff Notes — What the Homeschool Ecosystem Needs From the Curriculum Build
**(v3 — this IS the "Ecosystem_handoff" document referenced by the curriculum project's own index. If their index points to a separate file by that name, that's a duplicate/stale reference — this file is the current, authoritative one.)**

**Purpose of this file:** Drop this into the curriculum project so it knows what shape its output needs to land in, and what's already real on the other end. Phase 1 (accounts, permissions, hour tracking, the teacher dashboard) is built and deployed on Firebase, and Q1 Fall curriculum for all three kids is already live in it as the real content source. This file is the bridge — it doesn't dictate curriculum content or philosophy, only the structural shape the content needs so it plugs in without rework, and it tracks exactly what's been sent vs. still outstanding.

---

## 0. What's already built and running (context, not a request)

- **Backend:** Firebase project `wbk-curriculum-8163d` — accounts for Jasper, Sarah, and all three kids; a teacher dashboard showing hour-pace gauges (green/yellow/red) weighted by real per-subject hour data pulled from Q1 files; an hour/test logging schema; an extracurricular-activity ingestion flow.
- **Curriculum already ingested:** Millaray's, Makaio's, and Maizely's Q1 Fall files (9 weeks each) are the live weighting source for the dashboard's per-subject hour targets right now.
- **Already received from the curriculum side:** `learn_practice_test_alignment_standard_v2.md`, its research doc, per-kid retrofits, and a worksheet-style note — these resolved a real blocker and are confirmed in hand.
- **In progress:** the web app UI itself (activity logging + teacher dashboard view).

## 1. The core structural requirement: objectives-first, not topic-first

Every unit/lesson breaks down to 3–5 concrete, testable learning objectives, not just a topic label. Q1 files already follow this correctly — keep building this way for every future quarter.

## 2. Subject naming — use these exact values, nothing else

**Core** (counts toward Missouri's 600-hour core / 400-hour home-core requirement):
`reading_language_arts`, `math`, `science`, `social_studies_history`

**Specialty** (counts toward the 1,000-hour total only):
`bushcraft_outdoor_skills`, `homestead_skills`, `nature_identification`, `spiritual_cultural`

## 3. Per-kid and per-season tagging

Every unit: which kid (Millaray/Kira, Makaio/Rhoe, Maizely/Nova, or "any") and which season (fall/winter/spring/summer).

## 4. Weekly hours per subject — required, not optional

State weekly hours per subject the same way Q1 does (e.g. "Reading/Language Arts: 5 hrs, Math: 4 hrs..."). This is the actual input to the dashboard's pace-weighting math — vague or missing hours breaks the weighting for that quarter.

## 5. Assessment model: placement test + continuous daily reassessment

Each kid takes a one-time baseline assessment before daily curriculum generation starts for them, but the track differs by kid:

- **Millaray & Makaio** — a real, scored in-app placement test. The three actual test files (`ten_year_old_assessment_2_0.pdf`, `eight_year_old_assessment_2_0.pdf`) plus a per-question scoring rubric with subject/skill tags are now in hand (`millaray_assessment2_rubric.md`, `makaio_assessment2_rubric.md` — 13 and 12 items respectively, mostly open-ended reasoning + a handful of fixed-answer math items). From there, small assessment-style check-in questions are woven continuously into daily lesson/practice work (not a separate recurring test event), and that data adjusts what gets generated the next day.
- **Maizley (2.5)** — **no in-app placement test and no scoring right now.** Instead: a printable worksheet + a basic hands-on lesson plan for Sarah to teach directly, paper and parent-led, not app-tracked. Content source is `maizley_assessment2_rubric.md` (7 checklist items — following directions, shapes/colors, matching, a hands-on puzzle) reused as worksheet/lesson content with the Y/N-style scoring column dropped entirely. Her worksheet stays generic/toddler-level, not personalized off results, since there's no scoring loop feeding it yet. Revisit once she's old enough for the app-based track (not scheduled) — see `maizley_track_clarification.md`.

**Still needed for Millaray/Makaio's placement tests specifically:**
- The two actual PDF files themselves: `ten_year_old_assessment_2_0.pdf`, `eight_year_old_assessment_2_0.pdf` (question/scoring content is now in hand via the rubric files above — the raw PDFs are the last missing piece)
- Note: `eight_year_old_assessment_2_0.pdf` (Makaio's) prints the old spelling "Macayo" in its own title/answer-key text — flag for reprint with the corrected spelling whenever the PDF is regenerated

**For Maizley's checklist specifically:**
- The raw PDF `toddler_assessment_2_0.pdf` itself (checklist content is in hand via `maizley_assessment2_rubric.md`)

## 6. Daily routine opener — fixed requirement

Every school day opens with the Pledge of Allegiance, independent of whatever subject content follows that day.

## 7. Printable worksheets — cursive-focused, paper as the primary workspace

Most of a kid's actual work happens on paper, not on a screen — digital output is meant to guide (like a teacher presenting), not be where the work gets done. Cursive fluency is an explicit goal, not incidental — worksheets should build toward it. Send actual worksheet/handwriting template formats if you have them; otherwise describe what a given unit's printable should contain and the app will produce the printable document itself.

**Two specific files still needed to see the system already referenced as locked:**
- `09_image_bank_and_color_agenda.md`
- `10_daily_color_sheet_model.md`

## 8. Tagging conventions

- `field_app:` — tag any unit connecting to an existing/planned subject app (rock/mineral ID, etc.)
- `resource_link:` — tag any unit that should point to a specific video or outside resource. Optional, include only if already on hand.

## 9. Still outstanding — send these specifically, by name

- `ten_year_old_assessment_2_0.pdf`, `eight_year_old_assessment_2_0.pdf`, `toddler_assessment_2_0.pdf` — the raw PDF files themselves (their question/scoring content has already arrived via the three rubric files, so these are the last piece for section 5)
- `seasonal_curriculum_framework.md` — needed before Q2 (Winter) content can be built on the receiving end, since the curriculum index says Q2's theme is already defined in this file
- `09_image_bank_and_color_agenda.md` and `10_daily_color_sheet_model.md`

## 10. What NOT to worry about from the curriculum side

- Accounts, logins, hour-tracking math, dashboards — already built
- The placement-test or continuous-reassessment engine logic itself — that's the app side's job; the curriculum side provides content structured so it's checkable in small pieces
- Designing the printable docket's visual format — just flag where printables belong and what they should contain
- File format — markdown, plain text, PDF, whatever's natural to produce

## 11. Where this connects on the receiving end

All of the above is live input to the app's lesson-generation engine (Phase 2, currently being built). Silence or "nothing needs to be sent" from the curriculum side is not correct at any point — this project is actively waiting on the items in section 9 to move past Q1.
