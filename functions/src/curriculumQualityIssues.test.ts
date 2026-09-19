import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpsError } from "firebase-functions/v2/https";
import {
  assertHasQuarantinableContentVersion,
  assertQuarantineActive,
  isAlreadyQuarantined,
  sanitizeDescription,
  sanitizeOptionalNote,
  sanitizeReference,
} from "./curriculumQualityIssues";

// Runs from the compiled lib/curriculumQualityIssues.test.js — resolve
// back to the TypeScript source (rootDir src -> outDir lib, structure
// preserved) rather than inspecting compiled output.
const SOURCE_PATH = join(__dirname, "..", "src", "curriculumQualityIssues.ts");

// --- description/note sanitization ---

test("a normal description is trimmed and accepted", () => {
  assert.equal(sanitizeDescription("  The answer key for MA-03 says 25, should be 15.  "), "The answer key for MA-03 says 25, should be 15.");
});

test("an empty or non-string description is rejected", () => {
  assert.throws(() => sanitizeDescription(""), HttpsError);
  assert.throws(() => sanitizeDescription("   "), HttpsError);
  assert.throws(() => sanitizeDescription(null), HttpsError);
  assert.throws(() => sanitizeDescription(undefined), HttpsError);
  assert.throws(() => sanitizeDescription(42), HttpsError);
});

test("an excessively long description is rejected rather than silently truncated", () => {
  assert.throws(() => sanitizeDescription("a".repeat(4001)), HttpsError);
});

test("an optional note is trimmed when present, and undefined when absent/blank — never a fixed placeholder", () => {
  assert.equal(sanitizeOptionalNote(undefined), undefined);
  assert.equal(sanitizeOptionalNote(null), undefined);
  assert.equal(sanitizeOptionalNote("   "), undefined);
  assert.equal(sanitizeOptionalNote("  looks fine now  "), "looks fine now");
});

test("an excessively long note is rejected", () => {
  assert.throws(() => sanitizeOptionalNote("a".repeat(2001)), HttpsError);
});

// --- reference sanitization: stable references only, help request can be
// referenced (spec section 6/14), never raw curriculum content ---

test("sanitizeReference keeps only the 5 known keys, including helpRequestId", () => {
  const reference = sanitizeReference({
    studentId: "student-1",
    proposedDayId: "day-1",
    blockId: "b2",
    objectiveId: "MA-03",
    helpRequestId: "help-1",
    curriculumText: "the whole lesson, verbatim — must never be copied in",
    familyId: "attacker-supplied-family",
  });
  assert.deepEqual(reference, {
    studentId: "student-1",
    proposedDayId: "day-1",
    blockId: "b2",
    objectiveId: "MA-03",
    helpRequestId: "help-1",
  });
});

test("sanitizeReference never throws on garbage input and returns {} for none/empty", () => {
  for (const garbage of [null, undefined, "not an object", 42, ["day-1"], {}]) {
    assert.deepEqual(sanitizeReference(garbage), {});
  }
});

// --- quarantine preconditions (exact-version quarantine, spec section 7) ---

test("an issue with no contentVersion cannot be quarantined", () => {
  assert.throws(() => assertHasQuarantinableContentVersion({ contentVersion: null }), HttpsError);
});

test("an issue WITH a contentVersion can be quarantined without throwing", () => {
  const contentVersion = { kidKey: "millaray" as const, quarter: "q1" as const, week: 3, contentHash: "abc123", weeklyCertificationId: null };
  assert.doesNotThrow(() => assertHasQuarantinableContentVersion({ contentVersion }));
});

test("isAlreadyQuarantined is false when quarantine is null or inactive, true only when active", () => {
  assert.equal(isAlreadyQuarantined({ quarantine: null }), false);
  assert.equal(
    isAlreadyQuarantined({ quarantine: { active: false, quarantinedByUid: "u1", quarantinedAt: {} as never } }),
    false
  );
  assert.equal(
    isAlreadyQuarantined({ quarantine: { active: true, quarantinedByUid: "u1", quarantinedAt: {} as never } }),
    true
  );
});

// --- explicit quarantine release (spec section 9/14) ---

test("releasing a quarantine that was never active (null, or already released) is rejected", () => {
  assert.throws(() => assertQuarantineActive({ quarantine: null }), HttpsError);
  assert.throws(
    () => assertQuarantineActive({ quarantine: { active: false, quarantinedByUid: "u1", quarantinedAt: {} as never } }),
    HttpsError
  );
});

test("releasing an active quarantine is accepted", () => {
  assert.doesNotThrow(() =>
    assertQuarantineActive({ quarantine: { active: true, quarantinedByUid: "u1", quarantinedAt: {} as never } })
  );
});

// --- resolution and quarantine-release are structurally independent
// (spec section 9: "keep issue resolved and quarantine released
// conceptually separate") — proven by reading the actual callable source:
// resolveQualityIssue's body never touches any quarantine field, and
// releaseQuarantine's body never touches status/resolution fields. ---

function extractFunctionSource(source: string, exportName: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  assert.ok(start >= 0, `could not find export const ${exportName}`);
  // Grab up to the next top-level "export const"/"export function" (or EOF) — good enough for these small, single-callable-per-block files.
  const rest = source.slice(start + exportName.length);
  const nextExportIdx = rest.search(/\nexport (const|function|\{)/);
  return nextExportIdx === -1 ? rest : rest.slice(0, nextExportIdx);
}

test("resolveQualityIssue's implementation never writes any quarantine field — resolving an issue never releases its quarantine", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const fn = extractFunctionSource(source, "resolveQualityIssue");
  assert.doesNotMatch(fn, /quarantine/i);
});

test("releaseQuarantine's implementation never writes status/resolvedAt/resolutionAction — releasing a quarantine never resolves its issue", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const fn = extractFunctionSource(source, "releaseQuarantine");
  assert.doesNotMatch(fn, /\bstatus:\s*"resolved"/);
  assert.doesNotMatch(fn, /resolvedAt/);
  assert.doesNotMatch(fn, /resolutionAction/);
});

// --- audit lifecycle (spec section 10/14): every mutation writes an
// auditEvents record, reusing the existing collection rather than a new
// one, matching identity/helpRequests.ts's step-9 pattern. ---

test("every mutating callable writes an audit event via the shared writeAuditEvent helper into the SAME auditEvents collection helpRequests.ts already uses", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  assert.match(source, /collection\("auditEvents"\)/);
  for (const fnName of ["createQualityIssue", "quarantineContentVersion", "releaseQuarantine", "resolveQualityIssue", "updateQualityIssueSeverity"]) {
    const fn = extractFunctionSource(source, fnName);
    assert.match(fn, /writeAuditEvent/, `${fnName} must write an audit event`);
  }
  // Only ONE auditEvents collection reference in the whole file — proving
  // every callable funnels through the one writeAuditEvent helper rather
  // than each hand-rolling its own write into a second audit mechanism.
  const auditCollectionRefs = source.match(/collection\("auditEvents"\)/g) ?? [];
  assert.equal(auditCollectionRefs.length, 1);
});

// --- teacher-only mutation, student cannot create authoritative issue
// directly (spec section 12/14/15) — every callable calls requireTeacher
// before anything else; requireTeacher itself is already directly tested
// in util/auth.test.ts (rejects a student, accepts a teacher). ---

test("every mutating callable calls requireTeacher — never requireOwnerOrTeacher or any student-accessible path", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  for (const fnName of ["createQualityIssue", "quarantineContentVersion", "releaseQuarantine", "resolveQualityIssue", "updateQualityIssueSeverity"]) {
    const fn = extractFunctionSource(source, fnName);
    assert.match(fn, /requireTeacher\(caller\)/, `${fnName} must call requireTeacher`);
    assert.doesNotMatch(fn, /requireOwnerOrTeacher/, `${fnName} must not accept a student/owner path`);
  }
});
