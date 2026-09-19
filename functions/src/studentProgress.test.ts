import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Runs from the compiled lib/studentProgress.test.js — resolve back to the
// TypeScript source (rootDir src -> outDir lib, structure preserved) so
// these assertions inspect the real callable, not a description of it.
const SOURCE_PATH = join(__dirname, "..", "src", "studentProgress.ts");

// Scopes assertions to the callable's actual body, not its doc comment
// (which necessarily discusses "excused"/reportedMinutes/etc. by name to
// explain what the function deliberately does NOT do).
function extractCallableBody(source: string): string {
  const start = source.indexOf("export const updateBlockProgress");
  if (start === -1) throw new Error("updateBlockProgress not found in source");
  return source.slice(start);
}

function readCallableBody(): string {
  return extractCallableBody(readFileSync(SOURCE_PATH, "utf8"));
}

test("updateBlockProgress authorizes with requireOwnerOrTeacher, never a teacher-only guard — a student may act on themselves", () => {
  const body = readCallableBody();
  assert.match(body, /requireOwnerOrTeacher\(caller, studentId\)/);
  assert.doesNotMatch(body, /requireTeacher\(/);
});

test("updateBlockProgress never writes the literal \"excused\" — a student can never self-excuse work", () => {
  const body = readCallableBody();
  assert.doesNotMatch(body, /"excused"/);
});

test("updateBlockProgress validates state via isStudentBlockProgressState, the guard that structurally excludes \"excused\"", () => {
  const body = readCallableBody();
  assert.match(body, /isStudentBlockProgressState\(state\)/);
});

test("updateBlockProgress never touches reportedMinutes, objectiveEvidence, assessmentEligible, or dayNotes on the evidence packet — completionState is the only field it may change", () => {
  const body = readCallableBody();
  assert.doesNotMatch(body, /reportedMinutes/);
  assert.doesNotMatch(body, /objectiveEvidence/);
  assert.doesNotMatch(body, /assessmentEligible/);
  assert.doesNotMatch(body, /dayNotes/);
});

test("updateBlockProgress never calls createProposal or approveProposal — it can never approve instructional hours or evidence", () => {
  const body = readCallableBody();
  assert.doesNotMatch(body, /createProposal/);
  assert.doesNotMatch(body, /approveProposal/);
});

test("updateBlockProgress validates blockId against the day's own learningBlocks before writing anything", () => {
  const body = readCallableBody();
  assert.match(body, /day\.draft\.learningBlocks\.some\(\(b\) => b\.blockId === blockId\)/);
});

test("updateBlockProgress derives familyId/date/studentId ownership from the server-fetched ProposedDay, never trusting client-supplied family or date fields", () => {
  const body = readCallableBody();
  assert.match(body, /db\.collection\("proposedDays"\)\.doc\(proposedDayId\)\.get\(\)/);
  assert.doesNotMatch(body, /request\.data\?\.familyId/);
  assert.doesNotMatch(body, /request\.data\?\.date/);
});

test("updateBlockProgress rejects a day belonging to a different family, a mismatched studentId, and a non-approved day", () => {
  const body = readCallableBody();
  assert.match(body, /day\.familyId !== caller\.profile\.familyId/);
  assert.match(body, /day\.studentId !== studentId/);
  assert.match(body, /day\.status !== "approved"/);
});

test("updateBlockProgress only mirrors into an evidence packet that is already open, and leaves a non-open or absent packet untouched", () => {
  const body = readCallableBody();
  assert.match(body, /if \(!snap\.exists\) return;/);
  assert.match(body, /packet\.status !== "open"/);
});
