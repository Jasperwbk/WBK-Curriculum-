import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Runs from the compiled lib/dayPlans.test.js — resolve back to the
// TypeScript source (rootDir src -> outDir lib, structure preserved).
const SOURCE_PATH = join(__dirname, "..", "src", "dayPlans.ts");

function extractExport(source: string, exportName: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  if (start === -1) throw new Error(`${exportName} not found in source`);
  const rest = source.slice(start + exportName.length);
  const boundaries = ["\nexport const ", "\nexport interface ", "\ninterface ", "\nfunction "]
    .map((marker) => rest.indexOf(marker))
    .filter((i) => i !== -1);
  const end = boundaries.length > 0 ? Math.min(...boundaries) : rest.length;
  return rest.slice(0, end);
}

function readSource(): string {
  return readFileSync(SOURCE_PATH, "utf8");
}

// --- publishDayPlan (build-order step 11.1 — "Connect Plan-a-Day to
// Student Today") ---

test("publishDayPlan is teacher-only", () => {
  const body = extractExport(readSource(), "publishDayPlan");
  assert.match(body, /requireTeacher\(caller\)/);
});

test("publishDayPlan validates date as a strict YYYY-MM-DD string, studentIds as a non-empty array, and title/planText as non-empty strings", () => {
  const body = extractExport(readSource(), "publishDayPlan");
  assert.match(body, /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(body, /studentIds\.length === 0/);
  assert.match(body, /title\.trim\(\)\.length === 0/);
  assert.match(body, /planText\.trim\(\)\.length === 0/);
});

test("publishDayPlan verifies every selected student belongs to the caller's own family and has role \"student\" before writing anything — never trusts client-supplied studentIds", () => {
  const body = extractExport(readSource(), "publishDayPlan");
  assert.match(body, /targetProfile\.familyId !== familyId \|\| targetProfile\.role !== "student"/);
});

test("publishDayPlan writes to publishedDays via the shared publishedDayDocId formula, once per selected student", () => {
  const body = extractExport(readSource(), "publishDayPlan");
  assert.match(body, /for \(const studentId of uniqueStudentIds\)/);
  assert.match(body, /publishedDayDocId\(familyId, studentId, date\)/);
  assert.match(body, /buildFreeformPublishedDayProjection\(/);
});

test("publishDayPlan never writes to the legacy dayPlans collection — that stays the web client's own responsibility", () => {
  const body = extractExport(readSource(), "publishDayPlan");
  assert.doesNotMatch(body, /collection\("dayPlans"\)/);
});

test("publishDayPlan reconciles (deletes) this same plan's previously-published docs that no longer match the current date/studentIds", () => {
  const body = extractExport(readSource(), "publishDayPlan");
  assert.match(body, /where\("sourcePlanId", "==", dayPlanId\)/);
  assert.match(body, /stillWanted = data\.date === date && uniqueStudentIds\.includes\(data\.studentId\)/);
  assert.match(body, /batch\.delete\(doc\.ref\)/);
});

// --- unpublishDayPlan ---

test("unpublishDayPlan is teacher-only and deletes every publishedDays doc sourced from the given dayPlanId", () => {
  const body = extractExport(readSource(), "unpublishDayPlan");
  assert.match(body, /requireTeacher\(caller\)/);
  assert.match(body, /where\("sourcePlanId", "==", dayPlanId\)/);
  assert.match(body, /batch\.delete\(doc\.ref\)/);
});

// --- generatePlan diagnostic wiring ---

test("generatePlan classifies a failed Anthropic call via classifyAnthropicError rather than a bare generic throw, and keeps the user-facing message unchanged", () => {
  const body = extractExport(readSource(), "generatePlan");
  assert.match(body, /classifyAnthropicError\(err\)/);
  assert.match(body, /"Couldn't generate a plan\. Try again\."/);
});

test("generatePlan's diagnostic technical messages never reference anthropicApiKey.value() — the raw key must never reach a thrown error", () => {
  const body = extractExport(readSource(), "generatePlan");
  // Every throwDiagnosticError call's technicalMessage argument is a
  // literal string or err.message — none of them touch the key material.
  assert.doesNotMatch(body, /throwDiagnosticError\([^)]*anthropicApiKey/s);
});
