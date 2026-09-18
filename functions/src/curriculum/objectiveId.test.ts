import { test } from "node:test";
import assert from "node:assert/strict";
import { buildObjectiveId, isValidObjectiveId, subjectAbbreviation, weekdayOrdinalBase } from "./objectiveId";
import { WEEK1_OBJECTIVES } from "./weeklyObjectives";

test("buildObjectiveId reproduces the existing hand-authored WEEK1_OBJECTIVES ids exactly", () => {
  // "Where existing curriculum already provides usable objective ids,
  // preserve them" falls out of using one shared formula, not a lookup
  // table — this is the core assertion that proves it.
  for (const kidKey of ["millaray", "makaio"] as const) {
    for (const objective of WEEK1_OBJECTIVES[kidKey]) {
      const parts = objective.id.split("-");
      const ordinal = Number(parts[parts.length - 1]);
      assert.equal(buildObjectiveId(kidKey, objective.week, objective.subject, ordinal), objective.id);
    }
  }
});

test("buildObjectiveId is deterministic — same inputs always produce the same id", () => {
  const a = buildObjectiveId("millaray", 3, "math", 2);
  const b = buildObjectiveId("millaray", 3, "math", 2);
  assert.equal(a, b);
});

test("buildObjectiveId never derives identity from any text/description — only structural inputs", () => {
  // There is no description parameter at all; two totally different
  // skill descriptions with the same (kid, week, subject, ordinal) must
  // produce the identical id, and a wording change elsewhere in the app
  // can never reach this function to alter it.
  const id1 = buildObjectiveId("makaio", 2, "science", 1);
  const id2 = buildObjectiveId("makaio", 2, "science", 1);
  assert.equal(id1, id2);
  assert.equal(id1, "makaio-w2-science-1");
});

test("subjectAbbreviation matches the abbreviations already embedded in WEEK1_OBJECTIVES ids", () => {
  assert.equal(subjectAbbreviation("reading_language_arts"), "rla");
  assert.equal(subjectAbbreviation("social_studies_history"), "ss");
  assert.equal(subjectAbbreviation("bushcraft_outdoor_skills"), "bushcraft");
});

test("isValidObjectiveId accepts every real WEEK1_OBJECTIVES id", () => {
  for (const kidKey of ["millaray", "makaio"] as const) {
    for (const objective of WEEK1_OBJECTIVES[kidKey]) {
      assert.equal(isValidObjectiveId(objective.id), true);
    }
  }
});

test("isValidObjectiveId rejects display text used as if it were an id", () => {
  assert.equal(isValidObjectiveId("Weigh produce to the nearest ounce"), false);
  assert.equal(isValidObjectiveId(""), false);
});

test("isValidObjectiveId rejects a garbage subject abbreviation even if the shape otherwise matches", () => {
  assert.equal(isValidObjectiveId("millaray-w1-notasubject-1"), false);
});

test("isValidObjectiveId rejects an unknown kidKey", () => {
  assert.equal(isValidObjectiveId("someoneelse-w1-math-1"), false);
});

test("weekdayOrdinalBase: Monday -> 1", () => {
  assert.equal(weekdayOrdinalBase("2026-09-21"), 1); // verified Monday
});

test("weekdayOrdinalBase: Sunday -> 7 (not 0)", () => {
  assert.equal(weekdayOrdinalBase("2026-09-20"), 7); // verified Sunday
});

test("weekdayOrdinalBase: regenerating the SAME date always recomputes the SAME base", () => {
  const a = weekdayOrdinalBase("2026-10-01");
  const b = weekdayOrdinalBase("2026-10-01");
  assert.equal(a, b);
});

test("weekdayOrdinalBase: two different days in the same week never collide", () => {
  const monday = weekdayOrdinalBase("2026-09-21");
  const wednesday = weekdayOrdinalBase("2026-09-23");
  assert.notEqual(monday, wednesday);
});
