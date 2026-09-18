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

// --- Provenance verification state (build-order step 8.1 correction) ---
// A real person's identity being real never means the catalog entry has
// been verified against a specific source — see types.ts's
// ProvenanceVerificationStatus doc comment. This catalog was
// hand-authored from general knowledge, not a cited source packet, so
// every entry must honestly say so rather than claiming a verified
// status it hasn't earned.

test("every figure's provenance is honestly marked unverified — being a real person is not the same as being source-verified", () => {
  for (const figure of HISTORICAL_FIGURE_CATALOG) {
    assert.equal(figure.provenance.verificationStatus, "unverified");
  }
});

test("no entry's sourceTitle claims to BE a specific citable source — the placeholder label from step 8 is gone", () => {
  for (const figure of HISTORICAL_FIGURE_CATALOG) {
    assert.doesNotMatch(figure.provenance.sourceTitle, /^General historical record \(public domain facts\)$/);
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

test("toddlerAppropriate is documented as 'a simple presentation exists', not 'a peaceful life' (build-order step 8.1): George Washington (a military/presidential figure) is still true, because an honest non-military framing exists for him", () => {
  const washington = HISTORICAL_FIGURE_CATALOG.find((f) => f.id === "hf-george-washington");
  assert.equal(washington?.toddlerAppropriate, true);
});

// --- Geographic accuracy (build-order step 8.1 correction) ---

test("Columbus's record never claims he reached the present-day continental/mainland United States, and positively states where he actually went", () => {
  const columbus = HISTORICAL_FIGURE_CATALOG.find((f) => f.id === "hf-columbus");
  assert.ok(columbus);
  const allText = `${columbus!.region} ${columbus!.briefBio} ${columbus!.whyItMatters}`;
  // No affirmative claim of arrival in the U.S. — the only mention of
  // "United States" (if any) must be in a NEGATING phrase ("never...").
  assert.doesNotMatch(allText, /reached (?:the )?(?:mainland (?:of )?(?:the )?)?(?:present-day )?United States/i);
  assert.doesNotMatch(allText, /set foot in (?:the )?United States/i);
  // Positively states where he actually went.
  assert.match(allText, /Caribbean/);
});

test("Leif Erikson's record specifies the actual documented site (Newfoundland/Labrador, Canada) and never claims arrival in the modern United States", () => {
  const leif = HISTORICAL_FIGURE_CATALOG.find((f) => f.id === "hf-leif-erikson");
  assert.ok(leif);
  const allText = `${leif!.region} ${leif!.briefBio} ${leif!.whyItMatters}`;
  assert.doesNotMatch(allText, /reached (?:the )?(?:mainland (?:of )?(?:the )?)?(?:present-day )?United States/i);
  assert.doesNotMatch(allText, /set foot in (?:the )?United States/i);
  assert.match(allText, /Newfoundland/);
});

test("historical relevance is distinct from geographic presence: Columbus and Leif Erikson are both catalog entries relevant to American-history study despite never having been in the modern U.S. — their relevanceTags never claim otherwise", () => {
  const columbus = HISTORICAL_FIGURE_CATALOG.find((f) => f.id === "hf-columbus")!;
  const leif = HISTORICAL_FIGURE_CATALOG.find((f) => f.id === "hf-leif-erikson")!;
  // Neither carries a tag reserved for actual U.S.-territory eras/settings.
  for (const tag of ["early_us", "colonial", "civil_war", "expansion"]) {
    assert.ok(!columbus.relevanceTags.includes(tag), `Columbus should not carry "${tag}"`);
    assert.ok(!leif.relevanceTags.includes(tag), `Leif Erikson should not carry "${tag}"`);
  }
  // Both still carry a real historical-relevance tag.
  assert.ok(columbus.relevanceTags.includes("exploration"));
  assert.ok(leif.relevanceTags.includes("exploration"));
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
