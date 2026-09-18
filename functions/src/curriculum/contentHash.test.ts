import { test } from "node:test";
import assert from "node:assert/strict";
import { hashQuarterShape, hashWeekContent } from "./contentHash";

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
