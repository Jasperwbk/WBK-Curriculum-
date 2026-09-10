/**
 * One-time (idempotent) setup script: creates the five manually-provisioned
 * accounts for the family plus their families/{familyId} and users/{uid}
 * Firestore docs. Per spec section 3, there is no self-registration screen —
 * this script IS the account creation flow.
 *
 * Usage:
 *   1. Copy scripts/accounts.config.example.json to scripts/accounts.config.json
 *      and fill in real emails/temp passwords (this file is gitignored).
 *   2. Point GOOGLE_APPLICATION_CREDENTIALS at a Firebase service account key
 *      for the target project (or run inside an environment with Application
 *      Default Credentials already configured).
 *   3. npm install && npm run seed
 *
 * Safe to re-run: existing auth users are matched by email and existing
 * Firestore docs are merged, not overwritten from scratch.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

type Role = "teacher" | "student";

interface AccountConfig {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  characterMapping: string | null;
  gradeLabel: string | null;
}

interface SeedConfig {
  familyId: string;
  familyName: string;
  schoolYear: {
    startDate: string; // ISO date
    yearLengthDays: number;
    totalHoursTarget: number;
    coreHoursTarget: number;
    homeCoreHoursTarget: number;
  };
  accounts: AccountConfig[];
}

function loadConfig(): SeedConfig {
  const configPath = resolve(__dirname, "../accounts.config.json");
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    throw new Error(
      `Missing ${configPath}. Copy accounts.config.example.json to accounts.config.json ` +
        "and fill in real values first."
    );
  }
  return JSON.parse(raw) as SeedConfig;
}

async function ensureAuthUser(config: AccountConfig): Promise<string> {
  const auth = getAuth();
  try {
    const existing = await auth.getUserByEmail(config.email);
    await auth.updateUser(existing.uid, { displayName: config.displayName });
    console.log(`  existing auth user: ${config.email} (${existing.uid})`);
    return existing.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/user-not-found") throw err;
  }
  const created = await auth.createUser({
    email: config.email,
    password: config.password,
    displayName: config.displayName,
    emailVerified: false,
  });
  console.log(`  created auth user: ${config.email} (${created.uid})`);
  return created.uid;
}

async function main() {
  const config = loadConfig();
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  console.log(`Seeding family "${config.familyName}" (${config.familyId})...`);
  const memberIds: string[] = [];

  for (const account of config.accounts) {
    console.log(`Account: ${account.displayName} <${account.email}> [${account.role}]`);
    const uid = await ensureAuthUser(account);
    memberIds.push(uid);

    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          familyId: config.familyId,
          displayName: account.displayName,
          role: account.role,
          characterMapping: account.role === "student" ? account.characterMapping : null,
          gradeLabel: account.role === "student" ? account.gradeLabel : null,
          assessmentBaseline: {},
        },
        { merge: true }
      );
  }

  await db
    .collection("families")
    .doc(config.familyId)
    .set(
      {
        familyName: config.familyName,
        schoolYear: {
          startDate: Timestamp.fromDate(new Date(config.schoolYear.startDate)),
          yearLengthDays: config.schoolYear.yearLengthDays,
          totalHoursTarget: config.schoolYear.totalHoursTarget,
          coreHoursTarget: config.schoolYear.coreHoursTarget,
          homeCoreHoursTarget: config.schoolYear.homeCoreHoursTarget,
        },
        memberIds,
      },
      { merge: true }
    );

  console.log(`\nDone. ${memberIds.length} accounts linked to families/${config.familyId}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
