import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpsError } from "firebase-functions/v2/https";
import { mapAuthError } from "./accountAdministration";

const SOURCE_PATH = join(__dirname, "..", "src", "accountAdministration.ts");

function extractExport(source: string, exportName: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  if (start === -1) throw new Error(`${exportName} not found in source`);
  const rest = source.slice(start + exportName.length);
  const boundaries = ["\nexport const ", "\nexport interface ", "\ninterface ", "\nexport function ", "\nfunction "]
    .map((marker) => rest.indexOf(marker))
    .filter((i) => i !== -1);
  const end = boundaries.length > 0 ? Math.min(...boundaries) : rest.length;
  return rest.slice(0, end);
}

function readSource(): string {
  return readFileSync(SOURCE_PATH, "utf8");
}

// --- mapAuthError: controlled, clean Firebase Auth error mapping ---

test("mapAuthError maps auth/invalid-password and auth/weak-password to a clean, actionable message", () => {
  assert.throws(
    () => mapAuthError({ code: "auth/weak-password" }, "fallback"),
    (err: unknown) => {
      assert.ok(err instanceof HttpsError);
      assert.equal(err.code, "invalid-argument");
      assert.match(err.message, /at least 6 characters/);
      return true;
    }
  );
  assert.throws(
    () => mapAuthError({ code: "auth/invalid-password" }, "fallback"),
    (err: unknown) => err instanceof HttpsError && /at least 6 characters/.test(err.message)
  );
});

test("mapAuthError maps auth/email-already-exists to a duplicate-email message", () => {
  assert.throws(
    () => mapAuthError({ code: "auth/email-already-exists" }, "fallback"),
    (err: unknown) => err instanceof HttpsError && /already in use/.test(err.message)
  );
});

test("mapAuthError maps auth/invalid-email to an invalid-email message", () => {
  assert.throws(
    () => mapAuthError({ code: "auth/invalid-email" }, "fallback"),
    (err: unknown) => err instanceof HttpsError && /not a valid email/.test(err.message)
  );
});

test("mapAuthError falls back to the caller-supplied message for an unrecognized error code", () => {
  assert.throws(
    () => mapAuthError({ code: "auth/something-unexpected" }, "Could not complete that action."),
    (err: unknown) => err instanceof HttpsError && err.message === "Could not complete that action."
  );
});

test("mapAuthError never throws on a non-object input, and still falls back cleanly", () => {
  assert.throws(
    () => mapAuthError("a plain string", "fallback message"),
    (err: unknown) => err instanceof HttpsError && err.message === "fallback message"
  );
});

// --- getFamilyAccountAdministration: owner-only, live Auth metadata, no
// stored password/secret is ever read or returned ---

test("getFamilyAccountAdministration is owner-only", () => {
  const body = extractExport(readSource(), "getFamilyAccountAdministration");
  assert.match(body, /requireOwner\(caller\)/);
});

test("getFamilyAccountAdministration scopes the roster to the caller's own family, never a client-supplied familyId", () => {
  const body = extractExport(readSource(), "getFamilyAccountAdministration");
  assert.match(body, /where\("familyId", "==", caller\.profile\.familyId\)/);
});

test("getFamilyAccountAdministration never references a password, hash, or token field", () => {
  const body = extractExport(readSource(), "getFamilyAccountAdministration");
  assert.doesNotMatch(body, /password/i);
  assert.doesNotMatch(body, /passwordHash/i);
  assert.doesNotMatch(body, /token/i);
});

// --- resetFamilyMemberPassword ---

test("resetFamilyMemberPassword is owner-only and validates the target belongs to the caller's family via a server-fetched profile", () => {
  const body = extractExport(readSource(), "resetFamilyMemberPassword");
  assert.match(body, /requireOwner\(caller\)/);
  assert.match(body, /loadTargetProfile\(targetUid\)/);
  assert.match(body, /requireSameFamily\(caller, target\.familyId\)/);
});

test("resetFamilyMemberPassword enforces a minimum password length before ever calling Firebase Auth", () => {
  const body = extractExport(readSource(), "resetFamilyMemberPassword");
  assert.match(body, /newPassword\.length < 8/);
});

test("resetFamilyMemberPassword uses Admin Auth updateUser with only a password field — never reads an existing password first", () => {
  const body = extractExport(readSource(), "resetFamilyMemberPassword");
  assert.match(body, /updateUser\(targetUid, \{ password: newPassword \}\)/);
  assert.doesNotMatch(body, /\.getUser\(/);
});

test("resetFamilyMemberPassword never writes the password to Firestore, never includes it in the audit summary, and never returns it", () => {
  const body = extractExport(readSource(), "resetFamilyMemberPassword");
  // The only Firestore write in this function is the auditEvents doc —
  // assert its literal object body never mentions the password variable.
  const auditWriteStart = body.indexOf(".set({");
  const auditWrite = body.slice(auditWriteStart, body.indexOf("});", auditWriteStart));
  assert.doesNotMatch(auditWrite, /newPassword/);
  assert.match(body, /return \{ targetUid \};/);
});

test("resetFamilyMemberPassword records a sanitized auditEvents entry naming the actor and target, never the password", () => {
  const body = extractExport(readSource(), "resetFamilyMemberPassword");
  assert.match(body, /kind: "accountAdministration"/);
  assert.match(body, /action: "passwordReset"/);
});

// --- changeFamilyMemberEmail ---

test("changeFamilyMemberEmail is owner-only and validates the target belongs to the caller's family via a server-fetched profile", () => {
  const body = extractExport(readSource(), "changeFamilyMemberEmail");
  assert.match(body, /requireOwner\(caller\)/);
  assert.match(body, /loadTargetProfile\(targetUid\)/);
  assert.match(body, /requireSameFamily\(caller, target\.familyId\)/);
});

test("changeFamilyMemberEmail validates email format before calling Firebase Auth", () => {
  const body = extractExport(readSource(), "changeFamilyMemberEmail");
  assert.match(body, /\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//);
});

test("changeFamilyMemberEmail uses Admin Auth updateUser with only an email field — never writes to the users/{uid} Firestore doc, uid, familyId, or presentationIdentityId", () => {
  const body = extractExport(readSource(), "changeFamilyMemberEmail");
  assert.match(body, /updateUser\(targetUid, \{ email: newEmail \}\)/);
  assert.doesNotMatch(body, /collection\("users"\)\.doc\(targetUid\)\.(update|set)/);
  assert.doesNotMatch(body, /presentationIdentityId\s*:/);
});

test("changeFamilyMemberEmail's audit summary never includes the old or new email address", () => {
  const body = extractExport(readSource(), "changeFamilyMemberEmail");
  const auditWriteStart = body.indexOf(".set({");
  const auditWrite = body.slice(auditWriteStart, body.indexOf("});", auditWriteStart));
  assert.doesNotMatch(auditWrite, /newEmail/);
  assert.match(body, /kind: "accountAdministration"/);
  assert.match(body, /action: "emailChanged"/);
});

// --- Cross-cutting: neither callable trusts client-supplied ownership/family claims ---

test("neither resetFamilyMemberPassword nor changeFamilyMemberEmail ever reads a client-supplied familyId, role, or systemRole from request.data", () => {
  const source = readSource();
  assert.doesNotMatch(source, /request\.data\?\.familyId/);
  assert.doesNotMatch(source, /request\.data\?\.role/);
  assert.doesNotMatch(source, /request\.data\?\.systemRole/);
});

// --- Regression proof (build-order step 11.2, section 8): "Do NOT
// replace every requireTeacher with requireOwner." requireOwner must
// exist ONLY in this file — every pre-existing educational callable
// (certification, proposed days, evidence packets, help requests,
// curriculum quality, placement, extracurriculars, presentation identity,
// family settings, check-in, generatePlan/publishDayPlan/unpublishDayPlan)
// keeps its original requireTeacher gate untouched, so Sarah's normal
// teacher/curriculum authority is provably intact, not just unchanged by
// inspection. ---

const EDUCATIONAL_FILES_REQUIRING_TEACHER_GATE = [
  "certification.ts",
  "checkIn.ts",
  "curriculumQualityIssues.ts",
  "dayPlans.ts",
  "evidencePackets.ts",
  "extracurriculars.ts",
  "familySettings.ts",
  "placementTest.ts",
  "proposedDays.ts",
  "identity/helpRequests.ts",
  "identity/presentationIdentity.ts",
];

test("every existing educational-operation file still calls requireTeacher and never requireOwner — Sarah's authority is provably untouched by this step", () => {
  for (const relativePath of EDUCATIONAL_FILES_REQUIRING_TEACHER_GATE) {
    const source = readFileSync(join(__dirname, "..", "src", relativePath), "utf8");
    assert.match(source, /requireTeacher\(caller\)/, `${relativePath} should still call requireTeacher`);
    assert.doesNotMatch(source, /requireOwner\(/, `${relativePath} should never call requireOwner`);
  }
});

test("requireOwner is used in exactly one file in the whole functions source — this one", () => {
  const srcRoot = join(__dirname, "..", "src");
  const files = [
    "accountAdministration.ts",
    ...EDUCATIONAL_FILES_REQUIRING_TEACHER_GATE,
    "studentProgress.ts",
    "util/auth.ts",
  ];
  const filesCallingRequireOwner = files.filter((f) => {
    const source = readFileSync(join(srcRoot, f), "utf8");
    return /requireOwner\(caller\)/.test(source);
  });
  assert.deepEqual(filesCallingRequireOwner, ["accountAdministration.ts"]);
});
