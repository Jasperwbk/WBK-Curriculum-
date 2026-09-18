import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORICAL_FIGURE_CATALOG, Q1_FALL_WEEK_RELEVANCE_TAGS, getUpcomingContextTags } from "./historicalFigureCatalog";

// --- Catalog integrity ---

test("every figure has a stable, non-empty, unique id", () => {
  const ids = HISTORICAL_FIGURE_CATALOG.map((f) => f.id);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(new Set(ids).size, ids.length);
});

test("every figure's artwork is honestly unavailable/unverified — no fabricated asset references", () => {
  for (const figure of HISTORICAL_FIGURE_CATALOG) {
    assert.equal(figure.artwork.status, "unavailable");
    assert.equal(figure.artwork.rightsStatus, "unknown_unverified");
  }
});

test("historical-fact provenance is present and marked public domain for every figure", () => {
  for (const figure of HISTORICAL_FIGURE_CATALOG) {
    assert.ok(figure.provenance.sourceTitle.length > 0);
    assert.equal(figure.provenance.rightsStatus, "public_domain");
  }
});

test("every figure has at least one relevance tag and a non-empty bio/whyItMatters", () => {
  for (const figure of HISTORICAL_FIGURE_CATALOG) {
    assert.ok(figure.relevanceTags.length > 0);
    assert.ok(figure.briefBio.length > 0);
    assert.ok(figure.whyItMatters.length > 0);
  }
});

test("Indigenous/pre-colonial figures are representable in the catalog", () => {
  const indigenous = HISTORICAL_FIGURE_CATALOG.filter((f) => f.relevanceTags.includes("indigenous"));
  assert.ok(indigenous.length >= 2);
});

test("figures whose lives intersect American history from outside the modern U.S. are representable", () => {
  const outsideUs = HISTORICAL_FIGURE_CATALOG.filter((f) =>
    ["hf-lafayette", "hf-leif-erikson", "hf-columbus"].includes(f.id)
  );
  assert.equal(outsideUs.length, 3);
});

test("the catalog spans multiple distinct American-history eras, not just one", () => {
  const eras = new Set(HISTORICAL_FIGURE_CATALOG.map((f) => f.era));
  assert.ok(eras.size >= 5);
});

test("at least one figure is marked not toddler-appropriate, proving the filter has something real to filter", () => {
  assert.ok(HISTORICAL_FIGURE_CATALOG.some((f) => f.toddlerAppropriate === false));
});

test("most figures ARE toddler-appropriate — exclusion is the exception, not the rule", () => {
  const appropriate = HISTORICAL_FIGURE_CATALOG.filter((f) => f.toddlerAppropriate);
  assert.ok(appropriate.length > HISTORICAL_FIGURE_CATALOG.length / 2);
});

// --- getUpcomingContextTags ---

test("getUpcomingContextTags returns the union of the current and next week's tags", () => {
  const tags = getUpcomingContextTags(1);
  for (const t of Q1_FALL_WEEK_RELEVANCE_TAGS[1]) assert.ok(tags.includes(t));
  for (const t of Q1_FALL_WEEK_RELEVANCE_TAGS[2]) assert.ok(tags.includes(t));
});

test("getUpcomingContextTags returns [] for a null week — pure variety fallback, never a crash", () => {
  assert.deepEqual(getUpcomingContextTags(null), []);
});

test("getUpcomingContextTags handles the last week gracefully (no week 10 entry) without crashing or throwing", () => {
  const tags = getUpcomingContextTags(9);
  for (const t of Q1_FALL_WEEK_RELEVANCE_TAGS[9]) assert.ok(tags.includes(t));
});

test("getUpcomingContextTags de-duplicates overlapping tags between adjacent weeks", () => {
  const tags = getUpcomingContextTags(2, { 2: ["science"], 3: ["science", "agriculture"] });
  assert.deepEqual([...tags].sort(), ["agriculture", "science"]);
});
