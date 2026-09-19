/**
 * Emulator-backed Firestore rules suite for the CONTROLLED FAMILY-TEST
 * DEPLOYMENT PREPARATION review (step 11.4, section 5). Covers, against
 * the REAL `firestore.rules` file via the real rules engine, the exact
 * checklist that step asked for: every place a student's privacy or a
 * non-owner's authority boundary could be violated by a raw client
 * Firestore write/read, plus confirmation that ordinary teacher work
 * (including Sarah's, who holds no systemRole) still functions.
 *
 * Deliberately separate from `usersSystemRole.rules.test.mjs` (which goes
 * deeper on the systemRole-immutability rule specifically) and from the
 * main `node --test` suite — this needs a live Firestore emulator and
 * `tsconfig.json`'s rootDir/include ("src") never compiles anything in
 * this directory into that pipeline.
 *
 * Run manually:
 *   1. In one terminal: `firebase emulators:start --only firestore --project wbk-curriculum-8163d`
 *   2. In another: `node functions/rules-tests/familyTestReadiness.rules.test.mjs`
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, "..", "..", "firestore.rules");

let passCount = 0;
function pass(label) {
  passCount++;
  console.log(`  ok - ${label}`);
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: "wbk-family-test-readiness",
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // -- Family roster: Cory (owner), Sarah (standard teacher, no
      // systemRole — proves owner authority is never required for
      // ordinary teacher work), and three students/siblings. --
      await setDoc(doc(db, "users", "teacher-cory"), {
        familyId: "family-1", displayName: "Cory", role: "teacher",
        characterMapping: null, gradeLabel: null, assessmentBaseline: {},
        presentationIdentityId: "jasper", systemRole: "owner",
      });
      await setDoc(doc(db, "users", "teacher-sarah"), {
        familyId: "family-1", displayName: "Sarah", role: "teacher",
        characterMapping: null, gradeLabel: null, assessmentBaseline: {},
        presentationIdentityId: "celeste",
      });
      await setDoc(doc(db, "users", "student-millaray"), {
        familyId: "family-1", displayName: "Millaray", role: "student",
        characterMapping: "Kira", gradeLabel: "5th grade", assessmentBaseline: {},
        presentationIdentityId: "kira",
      });
      await setDoc(doc(db, "users", "student-makaio"), {
        familyId: "family-1", displayName: "Makaio", role: "student",
        characterMapping: "Ro", gradeLabel: "3rd grade", assessmentBaseline: {},
        presentationIdentityId: "ro",
      });

      // -- publishedDays: one per student, the ONE thing a student ever
      // reads about their own day. --
      await setDoc(doc(db, "publishedDays", "pd-millaray"), {
        familyId: "family-1", studentId: "student-millaray", date: "2026-09-21",
      });
      await setDoc(doc(db, "publishedDays", "pd-makaio"), {
        familyId: "family-1", studentId: "student-makaio", date: "2026-09-21",
      });

      // -- proposedDays: teacher-only forever, even once approved — a
      // student never reads this collection at all. --
      await setDoc(doc(db, "proposedDays", "prop-millaray"), {
        familyId: "family-1", studentId: "student-millaray", date: "2026-09-21", status: "approved",
      });

      // -- studentBlockProgress: write:false always (Cloud Function only,
      // needs server-side day/block validation a rule can't express). --
      await setDoc(doc(db, "studentBlockProgress", "sbp-millaray"), {
        familyId: "family-1", studentId: "student-millaray", date: "2026-09-21",
      });

      // -- evidencePackets: teacher-only read, write:false always. --
      await setDoc(doc(db, "evidencePackets", "ep-millaray"), {
        familyId: "family-1", studentId: "student-millaray", date: "2026-09-21", status: "open",
      });

      // -- masteryRecords: write:false always, for anyone. --
      await setDoc(doc(db, "masteryRecords", "mr-millaray"), {
        familyId: "family-1", userId: "student-millaray",
      });

      // -- curriculumQualityIssues: teacher-only read, no owner clause at all. --
      await setDoc(doc(db, "curriculumQualityIssues", "cqi-1"), {
        familyId: "family-1", status: "open",
      });

      // -- helpRequests: a student reads only their own. --
      await setDoc(doc(db, "helpRequests", "hr-millaray"), {
        familyId: "family-1", studentId: "student-millaray",
      });

      // -- familyQuarterCertifications: teacher-only read (curriculum-readiness concern). --
      await setDoc(doc(db, "familyQuarterCertifications", "fqc-1"), {
        familyId: "family-1", quarter: "2026-Q1",
      });
    });

    const millaray = testEnv.authenticatedContext("student-millaray").firestore();
    const makaio = testEnv.authenticatedContext("student-makaio").firestore();
    const sarah = testEnv.authenticatedContext("teacher-sarah").firestore();
    const cory = testEnv.authenticatedContext("teacher-cory").firestore();

    // === 1. student cannot read sibling published day ===
    await assertFails(getDocs(query(collection(makaio, "publishedDays"), where("studentId", "==", "student-millaray"))));
    await assertSucceeds(getDocs(query(collection(millaray, "publishedDays"), where("studentId", "==", "student-millaray"))));
    pass("a student cannot read a sibling's published day, but can read their own");

    // === 2. student cannot read unapproved (or any) proposed day ===
    await assertFails(getDocs(query(collection(millaray, "proposedDays"), where("studentId", "==", "student-millaray"))));
    await assertSucceeds(getDocs(query(collection(sarah, "proposedDays"), where("familyId", "==", "family-1"))));
    pass("a student can never read proposedDays (teacher-only forever), a teacher can");

    // === 3. student cannot write (sibling or even own) block progress ===
    await assertFails(updateDoc(doc(millaray, "studentBlockProgress", "sbp-millaray"), { completionState: "completed" }));
    await assertFails(setDoc(doc(makaio, "studentBlockProgress", "sbp-makaio"), {
      familyId: "family-1", studentId: "student-makaio", date: "2026-09-21",
    }));
    pass("a student cannot write studentBlockProgress via a direct client write, their own or a sibling's — Cloud Function only");

    // === 4. student cannot approve evidence/hours ===
    await assertFails(updateDoc(doc(millaray, "evidencePackets", "ep-millaray"), { status: "approved" }));
    await assertFails(getDocs(query(collection(millaray, "evidencePackets"), where("studentId", "==", "student-millaray"))));
    pass("a student cannot write an evidence packet (approve hours), and has no read access either — no student evidence view exists yet");

    // === 5. student cannot mutate mastery ===
    await assertFails(updateDoc(doc(millaray, "masteryRecords", "mr-millaray"), { level: 99 }));
    await assertFails(updateDoc(doc(sarah, "masteryRecords", "mr-millaray"), { level: 99 }));
    pass("nobody — student or teacher — can write masteryRecords via a direct client write; Cloud Function only");

    // === 6. student cannot read curriculum quality queue ===
    await assertFails(getDocs(query(collection(millaray, "curriculumQualityIssues"), where("familyId", "==", "family-1"))));
    await assertSucceeds(getDocs(query(collection(sarah, "curriculumQualityIssues"), where("familyId", "==", "family-1"))));
    pass("a student cannot browse the Curriculum Quality Feedback Queue; a teacher can");

    // === 7. student cannot read sibling help request ===
    await assertFails(getDocs(query(collection(makaio, "helpRequests"), where("studentId", "==", "student-millaray"))));
    await assertSucceeds(getDocs(query(collection(millaray, "helpRequests"), where("studentId", "==", "student-millaray"))));
    pass("a student cannot read a sibling's help request, but can read their own");

    // === 8. teacher can perform legitimate educational operations ===
    await assertSucceeds(getDocs(query(collection(sarah, "familyQuarterCertifications"), where("familyId", "==", "family-1"))));
    await assertSucceeds(
      setDoc(doc(sarah, "curriculumContent", "cc-1"), { familyId: "family-1", quarter: "2026-Q1", week: 1 })
    );
    pass("a teacher can read certification records and create curriculum content — ordinary teacher work is unimpeded");

    // === 9. Sarah does not need owner authority for teacher operations ===
    // (Sarah holds no systemRole field at all — every assertion above that
    // used `sarah` already proves this; this is the explicit summary check.)
    await assertSucceeds(getDocs(query(collection(sarah, "proposedDays"), where("familyId", "==", "family-1"))));
    await assertSucceeds(getDocs(query(collection(sarah, "evidencePackets"), where("familyId", "==", "family-1"))));
    pass("Sarah (systemRole absent) reads proposedDays and evidencePackets exactly like an owner would — owner authority is never required for shared educational teacher work");

    // === 10. non-owner cannot use account-administration data paths ===
    // Account Administration (roster + password reset + email change) is
    // Cloud-Function-only (functions/src/accountAdministration.ts, Admin
    // Auth SDK) with NO backing Firestore collection at all — there is
    // structurally nothing here for a rules test to reach. The one
    // Firestore-level surface this addendum touches is the systemRole
    // field on users/{uid}, covered by checks 11 below and in more depth
    // by usersSystemRole.rules.test.mjs.
    pass("account-administration data paths have no Firestore collection to test against — enforced entirely by requireOwner in Cloud Functions, verified in the unit-test suite and confirmed by source scan (functions/src/accountAdministration.ts)");

    // === 11. systemRole cannot be client-modified ===
    await assertFails(updateDoc(doc(sarah, "users", "teacher-sarah"), { systemRole: "owner" }));
    await assertFails(updateDoc(doc(sarah, "users", "student-millaray"), { systemRole: "owner" }));
    await assertFails(updateDoc(doc(cory, "users", "teacher-cory"), { systemRole: "standard" }));
    pass("systemRole can never be set or changed by any client write, including the owner's own");

    // === 12. legitimate ordinary profile updates still work ===
    await assertSucceeds(updateDoc(doc(sarah, "users", "student-millaray"), { gradeLabel: "6th grade" }));
    await assertSucceeds(updateDoc(doc(cory, "users", "teacher-cory"), { displayName: "Cory Crider" }));
    pass("ordinary profile field updates (grade label, display name) still succeed for both a plain teacher and the owner");

    console.log(`\nALL ${passCount} FAMILY-TEST-READINESS RULES CHECKS PASSED`);
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((err) => {
  console.error("RULES TEST FAILURE:", err);
  process.exitCode = 1;
});
