import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import {
  isSystemOwner,
  requireOwner,
  requireOwnerOrTeacher,
  requireSameFamily,
  requireTeacher,
  type CallerContext,
} from "./auth";
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

// --- isSystemOwner / requireOwner (build-order step 11.2 — Account
// Governance Addendum). The invariant under test throughout this block:
// owner authority comes ONLY from the stored systemRole field, never from
// role, displayName, email, or presentationIdentityId (none of which
// even appear in these test profiles' inputs to isSystemOwner). ---

test("isSystemOwner is true only when systemRole is explicitly \"owner\"", () => {
  assert.equal(isSystemOwner(caller({ role: "teacher", familyId: "family-1", systemRole: "owner" }).profile), true);
});

test("isSystemOwner is false when systemRole is absent — the safe default for every existing/new account", () => {
  assert.equal(isSystemOwner(caller({ role: "teacher", familyId: "family-1" }).profile), false);
});

test("isSystemOwner is false when systemRole is explicitly \"standard\"", () => {
  assert.equal(
    isSystemOwner(caller({ role: "teacher", familyId: "family-1", systemRole: "standard" }).profile),
    false
  );
});

test("isSystemOwner is false for a teacher whose displayName/email would suggest they're Cory — name and email are never consulted", () => {
  assert.equal(
    isSystemOwner(caller({ role: "teacher", familyId: "family-1", displayName: "Cory Crider" }).profile),
    false
  );
});

test("isSystemOwner is false for a teacher whose presentationIdentityId is \"jasper\" — presentation identity alone never grants owner authority", () => {
  assert.equal(
    isSystemOwner(caller({ role: "teacher", familyId: "family-1", presentationIdentityId: "jasper" }).profile),
    false
  );
});

test("requireOwner rejects a plain teacher (Sarah's normal educational authority does not include owner authority)", () => {
  assert.throws(() => requireOwner(caller({ role: "teacher", familyId: "family-1" })), HttpsError);
});

test("requireOwner rejects a student, even with systemRole somehow set — role and systemRole are independent axes, but a student is never the intended owner", () => {
  assert.throws(
    () => requireOwner(caller({ role: "student", familyId: "family-1", systemRole: "owner" })),
    HttpsError
  );
});

test("requireOwner accepts a teacher whose stored systemRole is \"owner\"", () => {
  assert.doesNotThrow(() => requireOwner(caller({ role: "teacher", familyId: "family-1", systemRole: "owner" })));
});
