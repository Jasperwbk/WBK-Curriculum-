import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOwnerOrTeacher, requireSameFamily, requireTeacher, type CallerContext } from "./auth";
import type { UserProfile } from "../types";

function caller(
  overrides: Partial<UserProfile> & Pick<UserProfile, "role" | "familyId">,
  uid = "uid-1"
): CallerContext {
  return {
    uid,
    profile: {
      displayName: "Test User",
      characterMapping: null,
      gradeLabel: null,
      assessmentBaseline: {},
      presentationIdentityId: null,
      ...overrides,
    },
  };
}

// --- requireTeacher: the actual mechanism behind "student cannot modify
// family closing words" (build-order step 8.1) — updateFamilyClosingWords
// (familySettings.ts) calls this before doing anything else. ---

test("requireTeacher rejects a student caller", () => {
  assert.throws(() => requireTeacher(caller({ role: "student", familyId: "family-1" })), HttpsError);
});

test("requireTeacher accepts a teacher caller", () => {
  assert.doesNotThrow(() => requireTeacher(caller({ role: "teacher", familyId: "family-1" })));
});

// --- requireSameFamily / requireOwnerOrTeacher: existing sanity coverage
// (previously untested, though used throughout the codebase) ---

test("requireSameFamily rejects a caller from a different family", () => {
  assert.throws(() => requireSameFamily(caller({ role: "teacher", familyId: "family-1" }), "family-2"), HttpsError);
});

test("requireSameFamily accepts a caller from the same family", () => {
  assert.doesNotThrow(() => requireSameFamily(caller({ role: "teacher", familyId: "family-1" }), "family-1"));
});

test("requireOwnerOrTeacher accepts a student acting on their own record", () => {
  assert.doesNotThrow(() =>
    requireOwnerOrTeacher(caller({ role: "student", familyId: "family-1" }, "student-1"), "student-1")
  );
});

test("requireOwnerOrTeacher rejects a student acting on someone else's record", () => {
  assert.throws(
    () => requireOwnerOrTeacher(caller({ role: "student", familyId: "family-1" }, "student-1"), "student-2"),
    HttpsError
  );
});

test("requireOwnerOrTeacher accepts a teacher acting on any record", () => {
  assert.doesNotThrow(() => requireOwnerOrTeacher(caller({ role: "teacher", familyId: "family-1" }), "someone-elses-uid"));
});
