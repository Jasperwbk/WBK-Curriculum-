# 10_daily_color_sheet_model.md

# Daily Color Sheet — assignment model (locked)

This is **not** random clip-art. Each printed school day, **each kid gets exactly one subject** from that day's curriculum print-out, and **one color sheet that matches that subject**. The three kids **never share a subject or a sheet** on the same day, so they can show different work at day's end.

Art-assessment uploads come later. Until then, use the **age / default art-ability bands** below. When art samples are uploaded, rebuild complexity the same way curriculum rebuilds after placement: assess → align → reprint.

---

## Daily rule (non-negotiable)

For a given calendar school day:

| Kid | Gets |
|---|---|
| Millaray / Kira (10) | 1 unique **subject** + 1 color sheet of **that** subject, drawn at **Band C** |
| Makaio / Rhoe (8) | 1 unique **subject** + 1 color sheet of **that** subject, drawn at **Band B** |
| Maizley / Nova (2.5) | 1 unique **subject** + 1 color sheet of **that** subject, drawn at **Band A** |

- Subject_A ≠ Subject_B ≠ Subject_C that day.
- Color sheet content is generated **from the assigned subject + the current Q1 week theme**. Not a generic "fall fun" page unless that *is* the subject (nature / harvest).
- The color sheet is a **separate printable** from the subject worksheet, but they travel together (same staple or same folder).
- Pledge / agenda header can still be shared as a tiny strip. The **coloring picture is unique**.

---

## Art-ability bands (defaults until art assessment exists)

### Band A — Maizley (2.5) — large-motor / scribble
- 2–4 **giant** objects only
- Extremely thick outlines
- No overlapping, no background scene, no tiny parts, no words to color in
- Huge closed shapes; almost no interior lines
- Objects she can name (pumpkin, apple, leaf, jar, sun, cloud)
- Success = she colored *on* the page, not staying in lines

### Band B — Makaio (8) — controlled coloring, simple scene
- One clear main subject drawing (not a collage of stickers)
- Medium line weight
- Some interior detail (leaf veins, jar ridges) but big color-in regions
- 4–8 objects max
- No dense adult mandala / no tiny hatch
- Scene should be *readable* as the subject (plant parts, tracks, a tool)

### Band C — Millaray (10) — detailed scene
- Full scene tied to the subject (e.g. harvest measuring table, not "a pumpkin")
- Finer lines, still printable in black ink
- Background allowed (table, garden, sky)
- Still colorable in one sitting (~15–20 min), not a poster-size adult book
- Can include blank charts/rulers as *pictures*, not problems to solve on the color sheet (practice stays on the worksheet)

**Do not** give all three kids the same line-art scaled up/down. Complexity and *subject* both change.

---

## Subject pool (exact strings)

Core: `reading_language_arts`, `math`, `science`, `social_studies_history`
Specialty: `bushcraft_outdoor_skills`, `homestead_skills`, `nature_identification`, `spiritual_cultural`

"One subject from school" = **one of these eight**, the one that kid is carrying as their **featured print subject** that day. Other subjects can still happen in the field; only one gets the paired color sheet.

Toddler featured subject is still tagged with a real string (usually `nature_identification`, `math` sorting, `science` sensory, `reading_language_arts` picture-book, or `homestead_skills` helper) so the dashboard can log it. Never assign her a dense civics or knife-safety *color sheet*.

---

## Collision-free rotation (Q1)

Use a **stable daily picker** so Claude does not randomly collide.

Let `d` = school-day index in the quarter (Week 1 Monday = 0, then +1 each instructional day).

**Offset the three kids on the 8-subject ring:**

```
ring = [
  math,
  science,
  nature_identification,
  reading_language_arts,
  homestead_skills,
  social_studies_history,
  bushcraft_outdoor_skills,
  spiritual_cultural
]

Millaray_subject = ring[ d % 8 ]
Makaio_subject   = ring[ (d + 3) % 8 ]
Maizley_subject  = ring[ (d + 5) % 8 ]
```

Offsets 0 / 3 / 5 never collide on a ring of 8.

Then **nudge Maizley** if her pick is a poor toddler fit:
- If assigned `bushcraft_outdoor_skills` or `social_studies_history` or `spiritual_cultural` as a *drawing*, swap her to the nearest toddler-safe pick among {`nature_identification`, `math`, `science`, `homestead_skills`, `reading_language_arts`} that **the other two do not already have that day**.

**Tie to the Q1 week theme** in the *picture*, not by forcing all three onto the week's "main" subject (that would collide).

Worked `d=0` (Week 1 first school day) from the formula, with toddler nudge:

| Kid | Subject | Picture |
|---|---|---|
| Millaray | math | harvest scale + produce (Band C) |
| Makaio | reading_language_arts | harvest journal / picture-book scene (Band B) |
| Maizley | nature_identification *(nudged from social_studies)* | giant pumpkin + apple + leaf (Band A) |

Example files on disk use a **different legal split** for the same week (math / science / nature) so Claude can see three subject-coordinated pictures. Either split is valid if the three subjects differ.

---

## What the picture must contain (by subject, Q1 harvest-flavored)

Use week theme as the *setting*. Subject decides the *objects*.

| Subject | Q1-fall objects to draw |
|---|---|
| math | scale, tally, baskets of counted produce, measuring cup, ruler |
| science | plant parts, spoilage jar (look-don't-eat), seed-to-plant, clouds |
| reading_language_arts | open journal, pencil, picture book, labeled seed packet as a *drawing* |
| social_studies_history | simple map outline, Osage garden, Hartville courthouse *simplified*, not battle gore |
| homestead_skills | jars, lids, garden tools, coop, stacked stores |
| bushcraft_outdoor_skills | layers of clothes, fire lay (no flames licking a person), shelter frame — **not** a realistic knife for Maizley |
| nature_identification | leaf, track, mushroom **with a "look only" style** (no eating), tree |
| spiritual_cultural | harvest table, simple candle, wreath — **no invented ritual diagrams** |

---

## Art assessment (later upload — fields only)

When samples arrive, score lightly and retune **band**, not subject uniqueness:

- Grip (fist / digital / tripod)
- Stays in lines (no / sometimes / mostly)
- Smallest region she/he will color
- Minutes of coloring stamina
- Can handle overlapping shapes? (y/n)

Map:
- Fist + no line-staying → stay Band A even if age 8
- Strong control + asks for "harder pictures" → bump one band

Until those files exist, **age band is the model**. Do not wait.

---

## Generation constraints for whoever draws the sheet (Claude / image model)

1. Black line art, white background, no gray fill, no color, no watermark, no words inside the picture (name/date live in the header outside the drawing).
2. One page, landscape or letter, big enough for crayons.
3. Must be identifiable as THAT day's subject at a glance.
4. Three files named like: `{kid}_{yyyymmdd}_{subject}.jpg`
5. Never output the same prompt for two kids.

---

## Example files (Week 1, three different subjects, three bands)

| File | Kid | Subject | Band |
|---|---|---|---|
| `images/color_sheet/examples/millaray_w1_math_harvest.jpg` | Millaray | math | C |
| `images/color_sheet/examples/makaio_w1_science_plant.jpg` | Makaio | science | B |
| `images/color_sheet/examples/maizley_w1_nature_harvest.jpg` | Maizley | nature_identification | A |

These are **models** of complexity + subject pairing. Claude should generate a new trio each school day, not reprint these three forever.

---
*Extracted verbatim from the Q1 research docket (`wolf_blossom_q1_research_docket`) as a standalone file, per Claude Code's request to see this system directly rather than only by reference.*
