# WBK App Builder — Learn / Practice / Test Alignment Standard (v2)

**v2 changes:** added a mastery-threshold + remediation loop per objective
(Section on Continuous Assessment), and a default daily lesson template
(Section on Daily Shape). Everything from v1 (objectives-first, shared list,
no-repeat questions, toddler exception) is unchanged below.

---

## The core rule
**Learn, Practice, and Test must share one real artifact: a short list of
learning objectives — not just a topic label.** Backward design: decide what
the learner should walk away able to do, then build instruction and
assessment to match.

## Required flow for every topic

**Step 1 — Generate the objectives list** (once per topic). 3–5 concrete,
testable objectives, stored in session state.

**Step 2 — Teach to the objectives list** (Learn phase). Lesson covers
exactly those objectives, nothing outside them.

**Step 3 — Generate questions FROM the objectives list** (Practice + Test).
Every question call gets the objectives list, not just the topic name.
Practice = smaller set, hints allowed. Test = larger set, no hints, scored.

**Step 4 — Prevent repeats.** Track questions/objectives already asked this
session; rotate rather than free-sample (spacing the same objective across
different questions, not massing it).

**Step 5 — Toddler exception.** Tap-to-identify, matching, "show me" instead
of a formal quiz.

## Continuous assessment — mastery threshold + remediation loop (NEW)

This is what makes assessment "continuous" instead of a one-time placement
test followed by nothing. Applies per objective, not per topic.

1. **Track a running record per objective**, not just per topic: last N
   check results (recommend N=3) for each individual objective in the
   objectives list.
2. **Mastery threshold:** 2 of the last 3 checks correct = objective marked
   mastered. Below that = objective stays "in progress."
3. **Remediation loop:** if an objective drops below threshold, the next
   session must re-teach that specific objective (a short re-explanation,
   different framing or example than the first pass — not the identical
   lesson repeated) before any new objective is introduced in that subject.
   Do not let the kid advance past a not-yet-mastered objective just because
   the week's theme is moving on.
3a. **Feedback on every check** should say *why* an answer is right or
    wrong, not just mark it — this is what makes the check teach, not just
    measure.
4. **Mastered objectives don't disappear** — they re-enter rotation later as
   warm-up/review material (see Daily Shape below), which is what keeps
   "mastered" durable instead of a one-time pass.
5. **Rebuild rule stays as-is** from the placement-test process: a cluster of
   low results across a whole subject (not just one objective) is a signal
   to drop that subject's difficulty a notch, not to loop the same objective
   forever.

## Daily lesson shape (NEW — default template, age-scaled)

Applies to core subjects for kids past the toddler exception. Segment
lengths: ~20–30 min per segment for age 8, ~25–40 min for age 10 — several
short focused segments across the day, not one long block.

1. **Warm-up (5–10 min):** 2–3 quick retrieval questions pulled from
   *already-mastered* objectives from earlier in the week/quarter — not
   today's new material. This is the spacing + retrieval mechanism.
2. **New teaching:** today's objective(s), Learn phase as in Step 2.
3. **Mixed practice:** today's objective plus 1–2 earlier ones, **interleaved**
   (mixed order, not grouped by type) once more than one objective is live
   for that subject.
4. **Retrieval close-out:** one ungraded "explain it back" or
   answer-from-memory moment before ending the session — every subject, not
   just RLA.

**Expected side effect:** interleaved practice (step 3) will produce more
wrong answers and feel harder than blocked drilling of one type at a time.
That is the method working, not a sign to simplify back to blocked practice
— note this for parent-facing summaries so it doesn't read as a regression.

## Implementation checklist (updated)
- [ ] Topic selection generates an objectives list first, stored in session state
- [ ] Learn generation receives and teaches to that exact list
- [ ] Practice/Test calls receive the objectives list, not just the topic label
- [ ] Each question call receives prior questions/objectives already used
- [ ] Question generator rotates across objectives rather than resampling freely
- [ ] Toddler tier uses non-quiz assessment style
- [ ] **Per-objective running record (last 3 checks) is tracked, not just per-topic**
- [ ] **Mastery threshold (2/3) gates advancement; below it triggers remediation**
- [ ] **Remediation re-teaches with a different framing, not a repeat of the same lesson**
- [ ] **Daily sessions default to warm-up → new teaching → mixed practice → retrieval close-out**
- [ ] **Warm-up pulls from mastered objectives for spacing; mixed practice interleaves once 2+ objectives are live**
- [ ] Objectives list and question source are structured so real curriculum content can replace AI-generated ones without a rebuild

## Grounding references
- Backward Design — Wiggins & McTighe
- Gagné's Events of Instruction
- Bloom (1968) — Learning for Mastery
- Roediger & Karpicke; Rowland (2014); Adesope et al. (2017) — retrieval practice
- Rohrer & Taylor (2007, 2010) — interleaved vs. blocked practice
- Bjork & Bjork (2011, 2020) — desirable difficulties
