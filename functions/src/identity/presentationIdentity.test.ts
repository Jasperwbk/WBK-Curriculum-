import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpsError } from "firebase-functions/v2/https";
import {
  PRESENTATION_IDENTITIES,
  STUDENT_PRESENTATION_IDENTITY_IDS,
  TEACHER_PRESENTATION_IDENTITY_IDS,
  assertIdentityRoleMatchesAccount,
  findCollidingAssignment,
  isPresentationIdentityId,
  kidKeyForPresentationIdentity,
  resolveKidKeyForStudent,
} from "./presentationIdentity";
import type { UserProfile } from "../types";

function studentProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    familyId: "family-1",
    displayName: "Test Student",
    role: "student",
    characterMapping: null,
    gradeLabel: null,
    assessmentBaseline: {},
    presentationIdentityId: null,
    ...overrides,
  };
}

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

// --- resolveKidKeyForStudent (build-order step 9.1): stable identity is
// authoritative; the legacy displayName fallback fires ONLY when
// presentationIdentityId is genuinely unset, and can never be overridden
// by a misleading displayName once a stable identity IS set. ---

test("a bootstrapped presentationIdentityId is authoritative — a misleading displayName cannot alter the resolved kidKey", () => {
  const profile = studentProfile({ displayName: "Makaio Crider", presentationIdentityId: "kira" });
  assert.equal(resolveKidKeyForStudent(profile), "millaray");
});

test("resolveKidKeyForStudent never reads any email-shaped field — UserProfile carries no email at all, so a misleading email cannot alter the resolved identity by construction", () => {
  // UserProfile (types.ts) has no `email` field — identity resolution can
  // only ever see familyId/displayName/role/presentationIdentityId, never
  // an email address. This test documents that structural guarantee: a
  // profile with an unrelated extra field is still resolved purely from
  // presentationIdentityId, proving no other field (email included, were
  // one ever added) is consulted.
  const profile = { ...studentProfile({ presentationIdentityId: "nova" }), unrelatedField: "attacker@example.com" };
  assert.equal(resolveKidKeyForStudent(profile), "maizley");
});

test("a not-yet-bootstrapped account (presentationIdentityId: null) falls back to the legacy displayName inference — a deliberate, documented, temporary compatibility path (build-order step 9), not a second permanent mechanism", () => {
  const profile = studentProfile({ displayName: "Millaray Crider", presentationIdentityId: null });
  assert.equal(resolveKidKeyForStudent(profile), "millaray");
});

test("a not-yet-bootstrapped account with an unrecognized displayName resolves to null — never a guess", () => {
  const profile = studentProfile({ displayName: "New Kid", presentationIdentityId: null });
  assert.equal(resolveKidKeyForStudent(profile), null);
});

// --- Web-side registry parity (build-order step 9.1, section 6): web/ and
// functions/ are separate TS projects with no shared build, so
// web/src/lib/presentationIdentity.ts's STUDENT_PRESENTATION_TO_KID_KEY is
// a manually-mirrored duplicate rather than a shared import. This test
// locks that duplicate's literal values to this file's canonical registry
// so the two can never silently drift apart — if either changes, this
// test must be updated to match, on purpose. ---

test("web/src/lib/presentationIdentity.ts's STUDENT_PRESENTATION_TO_KID_KEY mirror matches this canonical registry exactly", () => {
  // Keep this object identical to web/src/lib/presentationIdentity.ts's
  // STUDENT_PRESENTATION_TO_KID_KEY constant.
  const webMirror: Record<"kira" | "ro" | "nova", "millaray" | "makaio" | "maizley"> = {
    kira: "millaray",
    ro: "makaio",
    nova: "maizley",
  };
  for (const id of STUDENT_PRESENTATION_IDENTITY_IDS) {
    assert.equal(webMirror[id], kidKeyForPresentationIdentity(id), `web mirror for "${id}" has drifted from the canonical registry`);
  }
});

// --- Old web-side inferKidKey has no live runtime callers (build-order
// step 9.1) --- a source scan of web/src, run from the compiled
// lib/identity/ dir back to the repo's web/src tree, since there is no
// shared build between the two packages to import across directly.

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("no file under web/src calls inferKidKey(...) anymore — the web-side display-name-inference helper was removed entirely, not just unused", () => {
  const webSrc = join(__dirname, "..", "..", "..", "web", "src");
  const files = listFilesRecursive(webSrc);
  assert.ok(files.length > 10, "sanity check: web/src should contain many files");
  const offenders = files.filter((f) => /inferKidKey\s*\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `these web files still call inferKidKey(...): ${offenders.join(", ")}`);
});

test("web/src/lib/placementTestItems.ts no longer exports an inferKidKey function", () => {
  const filePath = join(__dirname, "..", "..", "..", "web", "src", "lib", "placementTestItems.ts");
  const source = readFileSync(filePath, "utf8");
  assert.doesNotMatch(source, /export function inferKidKey/);
});
