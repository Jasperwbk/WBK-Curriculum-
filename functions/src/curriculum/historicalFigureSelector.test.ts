import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildRecallQuestion,
  buildShowAndTellPrompt,
  isArtworkApprovedForPrinting,
  selectHistoricalFigure,
  type SelectHistoricalFigureParams,
} from "./historicalFigureSelector";
import type { HistoricalFigure } from "../types";

function figure(overrides: Partial<HistoricalFigure> & Pick<HistoricalFigure, "id">): HistoricalFigure {
  return {
    name: "Test Figure",
    era: "Some era",
    region: "Some region",
    briefBio: "A brief, child-safe bio.",
    whyItMatters: "Why this person matters.",
    relevanceTags: [],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
    ...overrides,
  };
}

function baseParams(overrides: Partial<SelectHistoricalFigureParams> = {}): SelectHistoricalFigureParams {
  return {
    catalog: [figure({ id: "a" }), figure({ id: "b" })],
    kidKey: "millaray",
    date: "2026-09-21",
    recentFigureIds: [],
    contextTags: [],
    ...overrides,
  };
}

function manyDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= n; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String(((Math.floor(i / 28) % 12) + 1)).padStart(2, "0");
    dates.push(`2026-${month}-${day}`);
  }
  return dates;
}

// --- selectHistoricalFigure: core behavior ---

test("empty catalog returns null rather than crashing", () => {
  assert.equal(selectHistoricalFigure(baseParams({ catalog: [] })), null);
});

test("selection is fully deterministic — identical inputs always produce the identical figure", () => {
  const params = baseParams();
  const a = selectHistoricalFigure(params);
  const b = selectHistoricalFigure(params);
  assert.equal(a?.figure.id, b?.figure.id);
});

test("stable historical figure ids: the returned figure's id always matches a real catalog entry, never invented", () => {
  const result = selectHistoricalFigure(baseParams());
  const ids = baseParams().catalog.map((f) => f.id);
  assert.ok(ids.includes(result!.figure.id));
});

test("variety: across many different dates, more than one figure in a small catalog actually gets selected (never the same one every single day)", () => {
  const catalog = [figure({ id: "a" }), figure({ id: "b" }), figure({ id: "c" })];
  const seen = new Set(manyDates(60).map((date) => selectHistoricalFigure(baseParams({ catalog, date }))!.figure.id));
  assert.ok(seen.size > 1);
});

// --- anti-repetition ---

test("a recently-shown figure is excluded from selection whenever an alternative exists", () => {
  const catalog = [figure({ id: "a" }), figure({ id: "b" })];
  for (const date of manyDates(30)) {
    const result = selectHistoricalFigure(baseParams({ catalog, date, recentFigureIds: ["a"] }));
    assert.equal(result?.figure.id, "b");
  }
});

test("excluding every catalog figure as 'recent' never empties the pool — a real repeat is returned rather than null", () => {
  const catalog = [figure({ id: "a" }), figure({ id: "b" })];
  const result = selectHistoricalFigure(baseParams({ catalog, recentFigureIds: ["a", "b"] }));
  assert.ok(result !== null);
  assert.ok(["a", "b"].includes(result!.figure.id));
});

// --- upcoming-context weighting ---

test("upcoming-context weighting: a figure whose tags match the current context is selected noticeably more often, but never exclusively", () => {
  const catalog = [
    figure({ id: "matched", relevanceTags: ["harvest"] }),
    figure({ id: "unmatched", relevanceTags: ["unrelated_theme"] }),
  ];
  const dates = manyDates(150);
  const counts = { matched: 0, unmatched: 0 };
  for (const date of dates) {
    const result = selectHistoricalFigure(baseParams({ catalog, date, contextTags: ["harvest"] }))!;
    counts[result.figure.id as "matched" | "unmatched"]++;
  }
  // Never reduced to "always pick whoever matches the lesson" — the
  // unmatched figure must still surface sometimes...
  assert.ok(counts.unmatched > 0);
  // ...but the matched one, carrying real weight, comes up meaningfully more.
  assert.ok(counts.matched > counts.unmatched);
});

test("with no context tags at all, weighting has nothing to bias toward — pure variety only", () => {
  const catalog = [figure({ id: "a", relevanceTags: ["harvest"] }), figure({ id: "b", relevanceTags: ["invention"] })];
  const seen = new Set(manyDates(40).map((date) => selectHistoricalFigure(baseParams({ catalog, date, contextTags: [] }))!.figure.id));
  assert.equal(seen.size, 2);
});

// --- toddler (Maizley) filtering ---

test("Maizley never receives a figure marked toddlerAppropriate: false, across many dates", () => {
  const catalog = [figure({ id: "safe", toddlerAppropriate: true }), figure({ id: "not-safe", toddlerAppropriate: false })];
  for (const date of manyDates(40)) {
    const result = selectHistoricalFigure(baseParams({ catalog, kidKey: "maizley", date, recentFigureIds: [] }));
    assert.equal(result?.figure.id, "safe");
  }
});

test("Millaray and Makaio CAN receive a figure marked toddlerAppropriate: false — the exclusion is Maizley-specific", () => {
  const catalog = [figure({ id: "not-safe", toddlerAppropriate: false })];
  const millaray = selectHistoricalFigure(baseParams({ catalog, kidKey: "millaray" }));
  const makaio = selectHistoricalFigure(baseParams({ catalog, kidKey: "makaio" }));
  assert.equal(millaray?.figure.id, "not-safe");
  assert.equal(makaio?.figure.id, "not-safe");
});

test("if EVERY figure is toddler-inappropriate, Maizley still gets a real selection rather than null (falls back to the full pool)", () => {
  const catalog = [figure({ id: "a", toddlerAppropriate: false }), figure({ id: "b", toddlerAppropriate: false })];
  const result = selectHistoricalFigure(baseParams({ catalog, kidKey: "maizley" }));
  assert.ok(result !== null);
});

// --- sibling-shared figure, child-specific presentation ---

test("the SAME figure can be selected for different kids on the same date (sibling-shared), each still getting their own record downstream", () => {
  const catalog = [figure({ id: "shared", toddlerAppropriate: true })];
  const millaray = selectHistoricalFigure(baseParams({ catalog, kidKey: "millaray" }));
  const makaio = selectHistoricalFigure(baseParams({ catalog, kidKey: "makaio" }));
  const maizley = selectHistoricalFigure(baseParams({ catalog, kidKey: "maizley" }));
  assert.equal(millaray?.figure.id, "shared");
  assert.equal(makaio?.figure.id, "shared");
  assert.equal(maizley?.figure.id, "shared");
});

test("Millaray/Makaio/Maizley get genuinely different presentation text for the same figure", () => {
  const f = figure({ id: "shared", name: "Sacagawea", era: "Early 1800s" });
  const millarayPrompt = buildShowAndTellPrompt(f, "millaray");
  const makaioPrompt = buildShowAndTellPrompt(f, "makaio");
  const maizleyPrompt = buildShowAndTellPrompt(f, "maizley");
  assert.notEqual(millarayPrompt, makaioPrompt);
  assert.notEqual(makaioPrompt, maizleyPrompt);
  assert.notEqual(millarayPrompt, maizleyPrompt);

  const millarayRecall = buildRecallQuestion(f, "millaray");
  const makaioRecall = buildRecallQuestion(f, "makaio");
  const maizleyRecall = buildRecallQuestion(f, "maizley");
  assert.notEqual(millarayRecall, makaioRecall);
  assert.notEqual(millarayRecall, maizleyRecall);

  // Millaray gets the strongest recall/application ask (era + application/connection reasoning) — the most detail.
  assert.match(millarayRecall, /connect/i);
  // Maizley's is recognition/matching, never an open-ended "why" essay prompt.
  assert.doesNotMatch(maizleyRecall, /why/i);
  assert.match(maizleyRecall, /match|point/i);
});

// --- artwork provenance gate ---

test("unavailable artwork is never approved for printing, regardless of rights status", () => {
  assert.equal(isArtworkApprovedForPrinting({ status: "unavailable", rightsStatus: "public_domain" }), false);
});

test("unknown/unverified rights are never approved for printing, even if an asset exists", () => {
  assert.equal(isArtworkApprovedForPrinting({ status: "available", rightsStatus: "unknown_unverified" }), false);
});

test("available + a real rights status (public domain, licensed, family-owned, generated/owned) IS approved for printing", () => {
  for (const rightsStatus of ["public_domain", "licensed", "family_owned", "generated_owned"] as const) {
    assert.equal(isArtworkApprovedForPrinting({ status: "available", rightsStatus }), true);
  }
});

test("every catalog-seeded HistoricalFigureArtwork in this file's own test fixtures degrades honestly by default (unavailable/unknown)", () => {
  assert.equal(isArtworkApprovedForPrinting(figure({ id: "x" }).artwork), false);
});

// --- regression: the retired subject-ring picker must never come back ---

test("proposedDays.ts never references the retired colorSheetRotation module — the old subject-ring picker stays absent from runtime generation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "src", "proposedDays.ts"), "utf8");
  assert.doesNotMatch(source, /colorSheetRotation/);
});

test("dayPlans.ts (the other day-generation path) also never references colorSheetRotation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "src", "dayPlans.ts"), "utf8");
  assert.doesNotMatch(source, /colorSheetRotation/);
});
