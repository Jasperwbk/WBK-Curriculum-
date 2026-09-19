/**
 * Emulator-backed Firestore rules test for the `users/{userId}` systemRole
 * immutability change (build-order step 11.3 — focused pre-family-test
 * security review of the Account Governance Addendum). Deliberately
 * SEPARATE from the main `node --test` suite (functions/src/**\/*.test.ts,
 * run via `npm run test:unit`) — this one needs a live Firestore emulator
 * and is not part of that pipeline; `tsconfig.json`'s rootDir/include
 * ("src") never compiles or picks up anything in this directory.
 *
 * Run manually:
 *   1. In one terminal: `firebase emulators:start --only firestore --project wbk-curriculum-8163d`
 *   2. In another: `node functions/rules-tests/usersSystemRole.rules.test.mjs`
 *
 * What this proves that a source-only review cannot: that the rule
 * actually evaluates the way the source suggests, against the REAL
 * firestore.rules file, via the real Firestore rules engine — not a
 * human's reading of CEL syntax. Covers exactly what this step's
 * instruction asked to verify: (a) the systemRole immutability
 * protection actually blocks every escalation path tested, and (b) it
 * does NOT accidentally break the legitimate, pre-existing profile
 * operations (editing an ordinary field on your own or a family member's
 * profile; creating a brand-new account with no systemRole field at all).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, "..", "..", "firestore.rules");

let passCount = 0;
function pass(label) {
  passCount++;
  console.log(`  ok - ${label}`);
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: "wbk-rules-test",
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users", "teacher-sarah"), {
        familyId: "family-1",
        displayName: "Sarah",
        role: "teacher",
        characterMapping: null,
        gradeLabel: null,
        assessmentBaseline: {},
        presentationIdentityId: "celeste",
      });
      await setDoc(doc(db, "users", "teacher-cory"), {
        familyId: "family-1",
        displayName: "Cory",
        role: "teacher",
        characterMapping: null,
        gradeLabel: null,
        assessmentBaseline: {},
        presentationIdentityId: "jasper",
        systemRole: "owner",
      });
      await setDoc(doc(db, "users", "student-1"), {
        familyId: "family-1",
        displayName: "Kira",
        role: "student",
        characterMapping: "Kira",
        gradeLabel: "5th grade",
        assessmentBaseline: {},
        presentationIdentityId: "kira",
      });
    });

    const sarahDb = testEnv.authenticatedContext("teacher-sarah").firestore();
    const coryDb = testEnv.authenticatedContext("teacher-cory").firestore();

    // --- Legitimate operations must keep working (this step's explicit
    // concern: don't let the new protection break existing behavior) ---

    await assertSucceeds(updateDoc(doc(sarahDb, "users", "student-1"), { gradeLabel: "6th grade" }));
    pass("a plain teacher can still update an ordinary field on a family member's profile");

    await assertSucceeds(
      setDoc(doc(sarahDb, "users", "new-student"), {
        familyId: "family-1",
        displayName: "New Kid",
        role: "student",
        characterMapping: null,
        gradeLabel: "K",
        assessmentBaseline: {},
        presentationIdentityId: null,
      })
    );
    pass("a plain teacher can still create a new family member's profile with no systemRole field at all");

    await assertSucceeds(
      updateDoc(doc(coryDb, "users", "teacher-cory"), { displayName: "Cory Crider", gradeLabel: null })
    );
    pass("the owner can still update ordinary fields on their own profile without touching systemRole");

    // --- The actual protection: systemRole can never be set/changed by
    // any client write, including the owner's own ---

    await assertFails(updateDoc(doc(sarahDb, "users", "teacher-sarah"), { systemRole: "owner" }));
    pass("a plain teacher CANNOT grant themself owner authority via a direct update");

    await assertFails(updateDoc(doc(sarahDb, "users", "student-1"), { systemRole: "owner" }));
    pass("a plain teacher CANNOT grant a student owner authority via a direct update");

    await assertFails(updateDoc(doc(coryDb, "users", "teacher-cory"), { systemRole: "standard" }));
    pass("even the owner CANNOT change their own systemRole via a direct client update");

    await assertFails(
      setDoc(doc(sarahDb, "users", "new-teacher"), {
        familyId: "family-1",
        displayName: "New Teacher",
        role: "teacher",
        characterMapping: null,
        gradeLabel: null,
        assessmentBaseline: {},
        presentationIdentityId: null,
        systemRole: "owner",
      })
    );
    pass("systemRole: \"owner\" can never be set on CREATE via a client write");

    console.log(`\nALL ${passCount} EMULATOR RULES TESTS PASSED`);
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((err) => {
  console.error("RULES TEST FAILURE:", err);
  process.exitCode = 1;
});
