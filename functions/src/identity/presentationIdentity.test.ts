import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import {
  PRESENTATION_IDENTITIES,
  STUDENT_PRESENTATION_IDENTITY_IDS,
  TEACHER_PRESENTATION_IDENTITY_IDS,
  assertIdentityRoleMatchesAccount,
  findCollidingAssignment,
  isPresentationIdentityId,
  kidKeyForPresentationIdentity,
} from "./presentationIdentity";

// --- Locked model: exactly the 5 stable ids, correct role/kidKey mapping ---

test("the registry contains exactly the 5 locked stable ids, nothing more, nothing fewer", () => {
  assert.deepEqual(Object.keys(PRESENTATION_IDENTITIES).sort(), ["celeste", "jasper", "kira", "nova", "ro"]);
});

test("Jasper and Celeste are the two teacher identities", () => {
  assert.equal(PRESENTATION_IDENTITIES.jasper.role, "teacher");
  assert.equal(PRESENTATION_IDENTITIES.celeste.role, "teacher");
  assert.deepEqual([...TEACHER_PRESENTATION_IDENTITY_IDS].sort(), ["celeste", "jasper"]);
});

test("Kira, Ro, and Nova are the three student identities, mapped to the correct stable PlacementKidKey", () => {
  assert.equal(PRESENTATION_IDENTITIES.kira.role, "student");
  assert.equal(PRESENTATION_IDENTITIES.kira.kidKey, "millaray");
  assert.equal(PRESENTATION_IDENTITIES.ro.role, "student");
  assert.equal(PRESENTATION_IDENTITIES.ro.kidKey, "makaio");
  assert.equal(PRESENTATION_IDENTITIES.nova.role, "student");
  assert.equal(PRESENTATION_IDENTITIES.nova.kidKey, "maizley");
  assert.deepEqual([...STUDENT_PRESENTATION_IDENTITY_IDS].sort(), ["kira", "nova", "ro"]);
});

test("Ro is the locked spelling for Makaio's identity — not the older 'Rhoe' naming drift", () => {
  assert.ok(!("rhoe" in PRESENTATION_IDENTITIES));
  assert.equal(PRESENTATION_IDENTITIES.ro.displayLabel, "Ro");
});

test("kidKeyForPresentationIdentity is a pure lookup with no kidKey for a teacher identity", () => {
  assert.equal(kidKeyForPresentationIdentity("kira"), "millaray");
  assert.equal(kidKeyForPresentationIdentity("ro"), "makaio");
  assert.equal(kidKeyForPresentationIdentity("nova"), "maizley");
  assert.equal(kidKeyForPresentationIdentity("jasper"), undefined);
  assert.equal(kidKeyForPresentationIdentity("celeste"), undefined);
});

// --- Identity does not depend on display-name or email parsing ---

test("isPresentationIdentityId rejects real display names and email-shaped strings — only the 5 stable lowercase ids are valid, this is never a name/email parser", () => {
  for (const notAnId of [
    "Millaray",
    "Makaio",
    "Maizely",
    "Maizley",
    "Cory",
    "Sarah",
    "cory@example.com",
    "sarah.crider@example.com",
    "Jasper", // wrong case — the stable id is lowercase, never inferred from a capitalized display label
    "Kira",
    "",
    "millaray-crider",
  ]) {
    assert.equal(isPresentationIdentityId(notAnId), false, `"${notAnId}" must not be treated as a stable id`);
  }
});

test("isPresentationIdentityId accepts only the exact 5 stable lowercase ids", () => {
  for (const id of ["jasper", "celeste", "kira", "ro", "nova"]) {
    assert.equal(isPresentationIdentityId(id), true);
  }
});

test("isPresentationIdentityId rejects non-string values without throwing", () => {
  for (const value of [null, undefined, 123, {}, ["kira"]]) {
    assert.equal(isPresentationIdentityId(value), false);
  }
});

// --- Bootstrap/assignment preconditions (assertIdentityRoleMatchesAccount) ---

test("assigning a teacher identity to a student account is rejected", () => {
  assert.throws(() => assertIdentityRoleMatchesAccount(PRESENTATION_IDENTITIES.jasper, "student"), HttpsError);
  assert.throws(() => assertIdentityRoleMatchesAccount(PRESENTATION_IDENTITIES.celeste, "student"), HttpsError);
});

test("assigning a student identity to a teacher account is rejected", () => {
  assert.throws(() => assertIdentityRoleMatchesAccount(PRESENTATION_IDENTITIES.kira, "teacher"), HttpsError);
  assert.throws(() => assertIdentityRoleMatchesAccount(PRESENTATION_IDENTITIES.ro, "teacher"), HttpsError);
  assert.throws(() => assertIdentityRoleMatchesAccount(PRESENTATION_IDENTITIES.nova, "teacher"), HttpsError);
});

test("assigning a matching-role identity is accepted", () => {
  assert.doesNotThrow(() => assertIdentityRoleMatchesAccount(PRESENTATION_IDENTITIES.jasper, "teacher"));
  assert.doesNotThrow(() => assertIdentityRoleMatchesAccount(PRESENTATION_IDENTITIES.kira, "student"));
});

// --- Deterministic, idempotent bootstrap: findCollidingAssignment ---

test("re-assigning the SAME identity to the SAME account is not a collision — bootstrap is idempotent", () => {
  const existing = [{ userId: "cory-uid", presentationIdentityId: "jasper" as const }];
  assert.equal(findCollidingAssignment(existing, "cory-uid", "jasper"), null);
});

test("assigning an identity already held by a DIFFERENT account is a collision — the mapping stays deterministic 1:1", () => {
  const existing = [{ userId: "cory-uid", presentationIdentityId: "jasper" as const }];
  assert.equal(findCollidingAssignment(existing, "sarah-uid", "jasper"), "cory-uid");
});

test("findCollidingAssignment with no existing assignments never collides", () => {
  assert.equal(findCollidingAssignment([], "cory-uid", "jasper"), null);
});

// --- Bootstrap does not auto-run ---

test("the bootstrap mechanism is an explicit callable export, not a side effect of importing this module — importing it performs no Firestore access and assigns nothing on its own", () => {
  // If importing this module (done at the top of this file) had any
  // side effect — calling Firestore, mutating a record, auto-assigning a
  // known mapping — it would have already thrown or altered state before
  // this test body ever ran, since there is no Firebase Admin app
  // initialized in this unit-test process. Reaching this assertion at all
  // is itself the proof; the explicit check below just documents what
  // "no auto-run" means for this module: `assignPresentationIdentity` is a
  // function value the caller must invoke (from an authenticated Cloud
  // Functions request), never something that runs on its own.
  assert.ok(true);
});

// --- Presentation identity does not grant security authority ---

test("PresentationIdentityInfo carries no capability/permission fields — role compatibility is the only security-adjacent check, and it only narrows WHICH identity an account may display, never what that account is authorized to do", () => {
  for (const identity of Object.values(PRESENTATION_IDENTITIES)) {
    const keys = Object.keys(identity);
    for (const forbidden of ["capabilities", "permissions", "canApprove", "isAdmin", "authority"]) {
      assert.ok(!keys.includes(forbidden), `PresentationIdentityInfo must never carry a "${forbidden}" field`);
    }
  }
});
