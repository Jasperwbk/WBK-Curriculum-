# Handoff Notes — What the Homeschool Ecosystem Needs From the Curriculum Build

**Purpose of this file:** Drop this into the curriculum project so it knows what shape its output needs to land in. The App Builder project has already speced the backend (accounts, hour tracking, dashboard) and the app suite (Rhoe Field Scout live, more subject apps planned). This file is the bridge — it doesn't dictate curriculum content or philosophy, only the structural shape the content needs to arrive in so it plugs in without rework.

---

## 1. The core structural requirement: objectives-first, not topic-first

Every unit/lesson in the curriculum should ultimately break down to a short list of **3–5 concrete, testable learning objectives** — not just a topic label. This is a locked standard on the App Builder side (`learn_practice_test_alignment_standard.md`) because Learn, Practice, and Test content all read from the same objectives list to stay aligned with each other and avoid repeat/off-topic questions.

You don't need to build this structure by hand for every unit — the app-side engine can still AI-generate objectives from a topic label as a fallback. But wherever real curriculum content exists (a specific lesson you've written, a specific skill sequence), structuring it as **topic → 3-5 objectives → supporting content** means it drops straight in with zero conversion work later.

## 2. Subject naming — use these exact values

The backend's hour-tracking schema is built around these standardized subject strings. Whatever you build, tag it with one of these so logging/dashboard gauges connect correctly:

**Core** (counts toward Missouri's 600-hour core / 400-hour home-core requirement):
`reading_language_arts`, `math`, `science`, `social_studies_history`

**Specialty** (counts toward the 1,000-hour total only):
`bushcraft_outdoor_skills`, `homestead_skills`, `nature_identification`, `spiritual_cultural`

## 3. Per-kid tagging

Each unit/lesson, wherever possible, should note:
- **Which kid(s) it's built for** — Millaray/Kira, Makaio/Rhoe, Maizely/Nova, or "any" — since assessment baselines (not grade levels) drive what each kid gets assigned
- **Season** — fall/winter/spring/summer, since the whole curriculum is seasonally anchored and the ecosystem's dashboard/planning will eventually be season-aware too

## 4. App/field-integration tags (optional, but valuable if you have it)

If a unit or objective naturally connects to hands-on outdoor work — especially anything that overlaps with an existing or planned WBK subject app (rock/fossil ID, plant/mushroom ID, etc.) — a simple tag noting that connection (e.g. `field_app: rock_mineral_id`) will let the backend later auto-route context-aware plans (e.g. "camping near water this weekend" → auto-pulls the matching field task). Not required for Phase 1/2 to function, but free value if it's easy to note as you build.

## 5. What NOT to worry about from the curriculum side

- No need to build accounts, logins, hour tracking, or dashboards — that's already speced and lives in the App Builder project
- No need to build the actual Learn/Practice/Test generation logic — that's an engine on the app side that will consume whatever curriculum content exists
- No need to match a specific file format — markdown, PDF, or plain notes are all fine; structure matters more than format

## 6. Where this connects on the receiving end

When curriculum content is ready, it becomes the source material for **Phase 2 (curriculum engine)** of the ecosystem build — replacing or supplementing the AI-freeform generation with your real, tailored content, exactly as described in the alignment standard's "Step 6 — Curriculum integration" section.
