import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStaticCurriculumMarkdown } from "./parseStaticCurriculumMarkdown";

test("parses a minimal synthetic week correctly", () => {
  const text = [
    "## Week 1 — Harvest Math & Sorting",
    "",
    "| Subject | Topic | Objectives | Activity | Hrs |",
    "|---|---|---|---|---|",
    "| math | Measurement | Weigh produce | Weigh-and-log | 4 |",
    "| reading_language_arts | Journaling | Write an entry | Daily journal | 5 |",
    "",
    "## Week 2 — Preserving & Food Science",
    "",
    "| Subject | Topic | Objectives | Activity | Hrs |",
    "|---|---|---|---|---|",
    "| science | Fermentation | Explain the process | Canning session | 4 |",
  ].join("\n");

  const weeks = parseStaticCurriculumMarkdown(text);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].week, 1);
  assert.equal(weeks[0].title, "Harvest Math & Sorting");
  assert.match(weeks[0].rawContent, /^## Week 1/);
  assert.ok(!weeks[0].rawContent.includes("Week 2"));
  assert.deepEqual(weeks[0].hours, { math: 4, reading_language_arts: 5 });
  assert.equal(weeks[1].week, 2);
  assert.deepEqual(weeks[1].hours, { science: 4 });
});

test("sums two rows for the same subject in one week (e.g. a two-strand week)", () => {
  const text = [
    "## Week 5 — Animal Signs & Tracking",
    "",
    "| Subject | Topic | Objectives | Activity | Hrs |",
    "|---|---|---|---|---|",
    "| social_studies_history | Local history | Learn local history | Reading | 2 |",
    "| social_studies_history | Government strand | Learn about government | Discussion | 2 |",
  ].join("\n");

  const weeks = parseStaticCurriculumMarkdown(text);
  assert.equal(weeks.length, 1);
  assert.deepEqual(weeks[0].hours, { social_studies_history: 4 });
});

test("ignores unrecognized subject names and non-numeric hours", () => {
  const text = [
    "## Week 1 — Test",
    "",
    "| Subject | Topic | Objectives | Activity | Hrs |",
    "|---|---|---|---|---|",
    "| not_a_real_subject | X | Y | Z | 4 |",
    "| math | X | Y | Z | n/a |",
  ].join("\n");

  const weeks = parseStaticCurriculumMarkdown(text);
  assert.deepEqual(weeks[0].hours, {});
});

test("returns weeks sorted by week number regardless of source order", () => {
  const text = ["## Week 3 — C", "content C", "## Week 1 — A", "content A", "## Week 2 — B", "content B"].join(
    "\n"
  );
  const weeks = parseStaticCurriculumMarkdown(text);
  assert.deepEqual(
    weeks.map((w) => w.week),
    [1, 2, 3]
  );
});

test("parses the real bundled Millaray Q1 file end to end (9 weeks, known Week 1 hours)", () => {
  let text: string;
  try {
    text = readFileSync(
      join(__dirname, "..", "curriculum-data", "millaray_age10_q1_fall.md"),
      "utf8"
    );
  } catch {
    // The bundled copy only exists after `npm run build` has run
    // copy-curriculum-data.js — skip gracefully rather than fail if this
    // test somehow runs before that step.
    console.warn("Skipping: lib/curriculum-data not populated yet (run npm run build first).");
    return;
  }

  const weeks = parseStaticCurriculumMarkdown(text);
  assert.equal(weeks.length, 9);
  assert.deepEqual(
    weeks.map((w) => w.week),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
  assert.equal(weeks[0].title, "Harvest Math & Sorting");
  assert.deepEqual(weeks[0].hours, {
    reading_language_arts: 5,
    math: 4,
    science: 4,
    social_studies_history: 4,
    bushcraft_outdoor_skills: 3,
    homestead_skills: 3,
    nature_identification: 3,
    spiritual_cultural: 2,
  });

  // Weeks 5-9 carry Millaray's two-strand social_studies_history rows
  // (local-history + government/economics) — confirms the same summing
  // behavior the web parser was fixed to do earlier this session still
  // holds in this backend copy.
  const week5 = weeks.find((w) => w.week === 5)!;
  assert.ok((week5.hours.social_studies_history ?? 0) >= 4);
});
