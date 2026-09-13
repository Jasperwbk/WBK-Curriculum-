# Learning Science & Daily-Structure Research — Framework Upgrade

Planning-phase resource doc. Pulls from ed-tech/adaptive-learning design, cognitive
psychology on pacing/practice, and what top homeschool programs actually do
day-to-day — then maps each finding onto a concrete change (or confirmation) to
what we've already built.

---
## 1. How computer programs do "ongoing, built-in" assessment

**What the research/industry shows:**
- Most serious adaptive-learning platforms (Khan Academy-style mastery paths,
  ALEKS, etc.) are a direct implementation of **Bloom's Mastery Learning**:
  break content into small units, follow each with an embedded formative check,
  and don't advance until a mastery threshold is met — if not met, loop back
  with remediation (easier explanation, more examples, or a review unit)
  before retrying.
- The two working parts are: (1) an **adaptation engine** that reads embedded
  assessment results and decides remedial-loop vs. advance vs. accelerate, and
  (2) **frequent, varied formative checks** embedded throughout — not one test
  at the end of a unit.
- Feedback that explains *why* an answer is right or wrong (not just
  right/wrong) is called out repeatedly as what makes the embedded checks
  actually teach, not just measure.

**What this means for us:** our `learn_practice_test_alignment_standard.md`
already has the right skeleton (objectives list shared by Learn/Practice/Test,
no repeat questions, rotate objectives). The piece it's missing for
*continuous* assessment (per the Ecosystem handoff v2) is a **mastery
threshold + remediation loop per objective** — right now Practice/Test pull
from the objectives list, but nothing says "if 2 of the last 3 checks on
Objective #2 were wrong, re-teach Objective #2 before moving to Objective #3."
That's the concrete gap to close in the standard, not something we need to
invent from scratch — it's a well-established pattern (Bloom, 1968; used in
every major adaptive platform since).

## 2. Retrieval practice / the testing effect

**What the research shows:**
- Actively recalling information (being asked, not re-reading) produces
  measurably better long-term retention than re-study — the "testing effect"
  — and this holds up specifically in **elementary-age children** (1st–8th
  grade), not just adults, including with real school-like materials (history
  texts, word lists, science concepts).
- Even a single retrieval attempt beats no testing at all. It doesn't need to
  be high-stakes or graded — low-stakes, frequent retrieval works.
- One 5th-grade classroom study found the *testing procedure* (retrieval)
  produced a clear benefit, while manipulating the *spacing interval* alone
  didn't show a significant added effect in that setting — suggesting the
  retrieval act itself is the bigger lever, spacing is a smaller multiplier
  on top of it.

**What this means for us:** every lesson — not just the weekly Test slot —
should end with at least one quick "tell me back" or answer-from-memory
moment, ungraded, before moving on. This is cheap to add and is the single
best-evidenced change available. It also validates something already in our
Q1 files: objectives like "read own writing aloud" or "explain in your own
words" are retrieval practice already — we should make sure **every** subject
has one of these per session, not just RLA.

## 3. Spacing / distributed practice

**What the research shows:**
- Spreading practice across multiple sessions over time beats massing it into
  one session — a very robust effect across ages, domains, and even very
  short intervals (seconds) up to long ones (weeks).
- As above, the effect is real but secondary to retrieval practice itself in
  at least one real-classroom (not lab) study with kids this age.

**What this means for us:** we don't need a complicated spaced-repetition
scheduler. The simplest implementation that captures most of the benefit:
each day's short warm-up pulls 1–2 objectives from **earlier in the week or
quarter**, not just today's topic. This is spacing + retrieval combined in
one cheap mechanism (see the Saxon model below, which does exactly this and
is one of the most proven homeschool implementations of it).

## 4. Interleaving (mixed vs. blocked practice)

**What the research shows:**
- Mixing problem types together (interleaving) produces **worse performance
  during practice** but **significantly better performance on delayed
  tests** than blocked practice (all-same-type-in-a-row) — shown repeatedly
  in math specifically, including with elementary-age kids (a 4th-grade
  prisms study found interleaved practice at 77% vs. blocked at 38% after 24
  hours; a 7th-grade study found similar gaps).
- Kids (and adults) consistently **misjudge** interleaved practice as less
  effective and less pleasant than blocked practice, even though it works
  better — this is a "desirable difficulty" (Bjork): it feels worse and
  performs worse *in the moment*, but produces stronger long-term learning.

**What this means for us:** this is worth flagging explicitly because it
will look like something is going wrong if we don't expect it — a kid doing
worse on mixed practice than they did on same-type drilling is the method
working, not failing. Once a kid has 2+ live objectives in a subject, worksheet
problem sets should mix types rather than group them (this is also already
the instinct behind the locked color-sheet **rotation** logic — we just need
to extend "don't repeat the same thing back to back" from drawings to actual
practice problems).

## 5. Desirable difficulties (Bjork) — the unifying idea

Retrieval practice, spacing, and interleaving are the three best-evidenced
members of a broader category Bjork calls "desirable difficulties" —
conditions that make practice *feel* harder and perform worse in the moment,
but produce stronger durable learning. The practical takeaway for us:
**don't optimize the daily worksheet for feeling smooth and easy** — a
lesson that goes perfectly on the first pass, every time, is a signal that
retention isn't being built, not a signal of success.

## 6. What "normal" looks like for daily homeschool hours

**What the research/field data shows:**
- HSLDA's research director (Steven Duvall) and multiple homeschool-hours
  guides converge on the same range: **elementary kids (grades 1–5) need
  roughly 2–3.5 focused hours/day** to match what a full public-school day
  covers, because one-on-one instruction skips classroom transitions,
  attendance, crowd management, and redundant repetition. Middle-school-age
  (11–14) moves to **3–4 hours**.
- Multiple sources independently cite the same finding: 3rd/4th graders can
  do "as little as 2–3 hours daily... and make the same progress as
  public-school students... in a full school day."
- A **4.5 hr/day** target (your number) sits comfortably above what's
  strictly needed for Millaray (10, upper-elementary/entering middle-school
  band) and Makaio (8, elementary) — meaning there's real slack in that
  window for core + specialty + the slower, field-first teaching style
  already locked into this family's approach, without needing to compress
  everything into a tight block.

**What this means for us:** our existing 28 hrs/week (~5.6 hrs/day) split
was built purely off Missouri's *legal* hour math, not off what's
pedagogically necessary. Both can be true at once — the legal hours are
satisfied by counting real field/homestead teaching (which this family
already does and logs after the fact), while the **focused, seated core
instruction** inside that day can be the shorter, research-backed 2.5–4
hours, with the rest being genuine hands-on/specialty time that's
instructional but not desk-bound. A 4.5-hour day comfortably covers focused
core (matching research) plus meaningful specialty time, without forcing an
artificially long "school day" feel.

## 7. What the best homeschool programs actually do daily — two models worth stealing from

### Saxon Math — the field's most proven "spiral" daily structure
Every lesson follows the same three-part shape:
1. **Warm-up** — mental math / quick review of previously learned facts
   (Saxon's "meeting book" for younger grades covers calendar/number
   skills daily).
2. **New concept** — one small new idea, taught in increments, with guided
   examples.
3. **Mixed practice set** — a problem set combining the new concept with
   cumulative review of everything learned so far (this *is* spacing +
   interleaving, built directly into the daily worksheet).

This is the single closest real-world match to what the Ecosystem handoff is
asking for ("checkable in small increments," continuous reassessment) and
it's been running successfully in homeschools for 40+ years. Reviewers are
split on whether kids *enjoy* it (many don't — see the desirable-difficulty
note above), but its retention outcomes are consistently cited as its
strength.

### Charlotte Mason — the model behind our existing narration-style objectives
- **Short lessons**: 15–20 min for grades 1–3, 20–30 min for grades 4–6,
  scaling up with age. Attention is treated as a trainable habit, not a
  fixed trait — short, focused, no-phone-no-distraction lessons beat long
  ones even when total content is the same.
- **Narration over worksheets** for humanities/reading: "tell me what you
  heard/read" as the primary comprehension check, especially before ~age 10;
  written narration takes over gradually after that.
- **Nature study** as the default science method for younger kids — direct
  observation and journaling rather than textbook-first.
- No formal lessons before age 6 — matches our existing Maizley design
  (observation/play, no worksheet cadence) exactly; nothing to change there.

**What this means for us:** our Q1 files already lean Charlotte-Mason-ish for
RLA/history (journaling, retell-in-own-words, nature walks) — that's
validated, keep it. The concrete adjustment: cap individual lesson segments
to roughly **20–30 min for Makaio, 25–40 min for Millaray**, rather than
treating each subject's whole daily hour allotment as one unbroken block —
several short focused segments across the day beat one long one.

---
## Combined daily template this points toward (draft, not yet applied to Q1 files)

**Per core subject session (Millaray/Makaio):**
1. Warm-up (5–10 min): 2–3 quick retrieval questions pulled from *prior*
   objectives this week/quarter, not today's new material.
2. New teaching (15–30 min, age-scaled): today's objective(s), Learn phase.
3. Mixed practice (10–20 min): today's objective + 1–2 older ones,
   interleaved once more than one objective is live — expect it to feel
   harder than blocked drill; that's working as intended.
4. One retrieval/narration close-out: explain-back or answer-from-memory,
   ungraded, before moving on.

**Specialty subjects (bushcraft/homestead/nature ID/spiritual-cultural):**
Stay closer to the existing field-first, hands-on model — these don't need
the same warm-up/mixed-practice structure since they're already
experiential and get logged after the fact.

**Maizley:** unchanged — observation/play, no lesson-segment structure needed.

**Weekly total:** the existing 28 hrs/week Q1 pace stays as the *legal hour*
target (unchanged — it already clears Missouri's requirement). This section
only reshapes how the core-subject hours inside that total are structured
day-to-day, not how many there are.

---
## Open items for the alignment-standard update (not yet written)
- Add an explicit mastery-threshold + remediation-loop rule per objective
  (Section 1 above) to `learn_practice_test_alignment_standard.md`.
- Add the warm-up/mixed-practice/retrieval-close-out daily shape as the
  default lesson template the engine builds toward.
- Flag interleaving as expected-to-feel-harder in whatever
  parent-facing notes exist, so it doesn't read as the system malfunctioning.

## Sources (for reference, not for re-citation to the kids)
- Bloom, B. S. (1968) — Learning for Mastery / mastery learning
- Roediger & Karpicke (2006) and related — testing effect / retrieval practice
- Karpicke & Roediger (2007) — spacing of retrieval attempts
- Rowland (2014); Adesope et al. (2017) — retrieval practice meta-analyses
- Rohrer & Taylor (2007, 2010) — interleaved vs. blocked math practice
- Bjork & Bjork (2011, 2020) — desirable difficulties
- HSLDA / Steven Duvall (2024) — homeschool instructional-hour research
- Saxon Math methodology (Houghton Mifflin Harcourt; multiple curriculum
  reviews)
- Charlotte Mason method (Simply Charlotte Mason; AmblesideOnline)
