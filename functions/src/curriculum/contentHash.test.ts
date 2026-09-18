import { test } from "node:test";
import assert from "node:assert/strict";
import { diffStaleKidKeys, hashFamilyPackage, hashQuarterShape, hashWeekContent } from "./contentHash";
import type { ChildContentReference } from "../types";

test("hashWeekContent is deterministic for identical input", () => {
  const week = { title: "Harvest Math", rawContent: "## Week 1\n...", hours: { math: 4 } };
  assert.equal(hashWeekContent(week), hashWeekContent({ ...week }));
});

test("hashWeekContent changes when rawContent changes", () => {
  const a = hashWeekContent({ title: "Harvest Math", rawContent: "version A", hours: { math: 4 } });
  const b = hashWeekContent({ title: "Harvest Math", rawContent: "version B", hours: { math: 4 } });
  assert.notEqual(a, b);
});

test("hashWeekContent changes when hours change", () => {
  const a = hashWeekContent({ title: "T", rawContent: "same", hours: { math: 4 } });
  const b = hashWeekContent({ title: "T", rawContent: "same", hours: { math: 5 } });
  assert.notEqual(a, b);
});

test("hashWeekContent is independent of object key order", () => {
  const a = hashWeekContent({ title: "T", rawContent: "same", hours: { math: 4, science: 3 } });
  // Same logical value, keys inserted in a different order.
  const hoursReordered: Record<string, number> = {};
  hoursReordered.science = 3;
  hoursReordered.math = 4;
  const b = hashWeekContent({ rawContent: "same", title: "T", hours: hoursReordered });
  assert.equal(a, b);
});

test("hashQuarterShape ignores rawContent and hours (weekly-level material, not quarter-level)", () => {
  const weeksV1 = [
    { week: 1, title: "Harvest Math & Sorting", rawContent: "draft text", hours: { math: 4 } },
    { week: 2, title: "Preserving & Food Science", rawContent: "draft text 2", hours: { science: 4 } },
  ];
  const weeksV2 = [
    { week: 1, title: "Harvest Math & Sorting", rawContent: "COMPLETELY DIFFERENT", hours: { math: 999 } },
    { week: 2, title: "Preserving & Food Science", rawContent: "also different", hours: {} },
  ];
  assert.equal(hashQuarterShape(weeksV1), hashQuarterShape(weeksV2));
});

test("hashQuarterShape changes when a week's title changes", () => {
  const weeksV1 = [{ week: 1, title: "Harvest Math & Sorting" }];
  const weeksV2 = [{ week: 1, title: "Something Else Entirely" }];
  assert.notEqual(hashQuarterShape(weeksV1), hashQuarterShape(weeksV2));
});

test("hashQuarterShape changes when a week is added or removed", () => {
  const nineWeeks = Array.from({ length: 9 }, (_, i) => ({ week: i + 1, title: `Week ${i + 1}` }));
  const eightWeeks = nineWeeks.slice(0, 8);
  assert.notEqual(hashQuarterShape(nineWeeks), hashQuarterShape(eightWeeks));
});

test("hashQuarterShape is independent of input array order", () => {
  const inOrder = [
    { week: 1, title: "A" },
    { week: 2, title: "B" },
  ];
  const reversed = [
    { week: 2, title: "B" },
    { week: 1, title: "A" },
  ];
  assert.equal(hashQuarterShape(inOrder), hashQuarterShape(reversed));
});

// --- Family package hashing (build-order step 3.1) ---

const FAMILY_PACKAGE_V1: ChildContentReference[] = [
  { kidKey: "millaray", contentHash: "hash-millaray-v1" },
  { kidKey: "makaio", contentHash: "hash-makaio-v1" },
  { kidKey: "maizley", contentHash: "hash-maizley-v1" },
];

test("hashFamilyPackage is deterministic for identical input", () => {
  assert.equal(hashFamilyPackage(FAMILY_PACKAGE_V1), hashFamilyPackage([...FAMILY_PACKAGE_V1]));
});

test("hashFamilyPackage is independent of input array order (not tied to kid ordering)", () => {
  const reversed = [...FAMILY_PACKAGE_V1].reverse();
  assert.equal(hashFamilyPackage(FAMILY_PACKAGE_V1), hashFamilyPackage(reversed));
});

test("hashFamilyPackage changes when exactly one child's hash changes — one child's material change invalidates the whole family certification", () => {
  const oneChildChanged: ChildContentReference[] = [
    { kidKey: "millaray", contentHash: "hash-millaray-v2-EDITED" }, // only Millaray changed
    { kidKey: "makaio", contentHash: "hash-makaio-v1" },
    { kidKey: "maizley", contentHash: "hash-maizley-v1" },
  ];
  assert.notEqual(hashFamilyPackage(FAMILY_PACKAGE_V1), hashFamilyPackage(oneChildChanged));
});

test("hashFamilyPackage distinguishes a child having no content (null) from having any real hash", () => {
  const withoutMaizley: ChildContentReference[] = [
    { kidKey: "millaray", contentHash: "hash-millaray-v1" },
    { kidKey: "makaio", contentHash: "hash-makaio-v1" },
    { kidKey: "maizley", contentHash: null },
  ];
  assert.notEqual(hashFamilyPackage(FAMILY_PACKAGE_V1), hashFamilyPackage(withoutMaizley));
});

test("hashFamilyPackage: cosmetic-only changes upstream (already excluded by hashWeekContent/hashQuarterShape) never reach here, so unchanged per-kid hashes never change the family hash", () => {
  // Simulates re-saving identical content under a different file name: the
  // per-kid hashes upstream are unaffected (contentHash.ts already proved
  // this for hashWeekContent/hashQuarterShape above), so the family hash
  // built from those same unchanged hashes must also be unchanged.
  const resavedSameContent: ChildContentReference[] = FAMILY_PACKAGE_V1.map((c) => ({ ...c }));
  assert.equal(hashFamilyPackage(FAMILY_PACKAGE_V1), hashFamilyPackage(resavedSameContent));
});

// --- Stale-kid diffing (build-order step 3.1) ---

test("diffStaleKidKeys returns empty when nothing changed", () => {
  assert.deepEqual(diffStaleKidKeys(FAMILY_PACKAGE_V1, [...FAMILY_PACKAGE_V1]), []);
});

test("diffStaleKidKeys names exactly the one child whose hash changed", () => {
  const current: ChildContentReference[] = [
    { kidKey: "millaray", contentHash: "hash-millaray-v1" },
    { kidKey: "makaio", contentHash: "hash-makaio-v2-EDITED" },
    { kidKey: "maizley", contentHash: "hash-maizley-v1" },
  ];
  assert.deepEqual(diffStaleKidKeys(current, FAMILY_PACKAGE_V1), ["makaio"]);
});

test("diffStaleKidKeys names multiple children when multiple changed", () => {
  const current: ChildContentReference[] = [
    { kidKey: "millaray", contentHash: "CHANGED" },
    { kidKey: "makaio", contentHash: "hash-makaio-v1" },
    { kidKey: "maizley", contentHash: "CHANGED" },
  ];
  const stale = diffStaleKidKeys(current, FAMILY_PACKAGE_V1).sort();
  assert.deepEqual(stale, ["maizley", "millaray"]);
});

test("diffStaleKidKeys treats a child gaining content (null -> a real hash) as a change", () => {
  const certifiedWithoutMaizley: ChildContentReference[] = [
    { kidKey: "millaray", contentHash: "hash-millaray-v1" },
    { kidKey: "makaio", contentHash: "hash-makaio-v1" },
    { kidKey: "maizley", contentHash: null },
  ];
  const currentWithMaizleyContent: ChildContentReference[] = [
    { kidKey: "millaray", contentHash: "hash-millaray-v1" },
    { kidKey: "makaio", contentHash: "hash-makaio-v1" },
    { kidKey: "maizley", contentHash: "hash-maizley-NEW" },
  ];
  assert.deepEqual(diffStaleKidKeys(currentWithMaizleyContent, certifiedWithoutMaizley), ["maizley"]);
});

test("bootstrap decision logic is idempotent: identical family content hashes to the same value twice in a row (skip), a real change never does (re-certify)", () => {
  // bootstrapExistingCertifications' actual skip/certify decision is just
  // "does the freshly computed family hash equal the latest certified
  // one" — this is that same equality check in isolation, run twice to
  // confirm it's stable (a second bootstrap pass over unchanged content
  // is always a no-op).
  const freshHash1 = hashFamilyPackage(FAMILY_PACKAGE_V1);
  const freshHash2 = hashFamilyPackage(FAMILY_PACKAGE_V1);
  assert.equal(freshHash1, freshHash2, "re-hashing identical content must be idempotent");

  const changedHash = hashFamilyPackage([
    { kidKey: "millaray", contentHash: "hash-millaray-v1" },
    { kidKey: "makaio", contentHash: "hash-makaio-v1" },
    { kidKey: "maizley", contentHash: "hash-maizley-CHANGED" },
  ]);
  assert.notEqual(freshHash1, changedHash, "a real content change must never be treated as a no-op");
});
