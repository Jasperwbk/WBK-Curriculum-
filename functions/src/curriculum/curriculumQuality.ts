import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { hashWeekContent } from "./contentHash";
import { loadWeekEntry, isValidKidKey, isValidQuarter } from "./loadCurriculumContent";
import { requireKidKeyForStudent } from "../identity/presentationIdentity";
import type {
  CurriculumContentVersionReference,
  CurriculumQualityIssueCategory,
  CurriculumQualityIssueSeverity,
  CurriculumQualityResolutionAction,
  FamilyWeeklyCertification,
  PlacementKidKey,
  ProposedDay,
  Quarter,
  UserProfile,
} from "../types";

/**
 * The Curriculum Quality Feedback Queue (build-order step 10) — for
 * suspected DEFECTS in curriculum content itself. Structurally separate
 * from: a student misunderstanding correct material (ordinary
 * remediation), Ask-a-Teacher (identity/helpRequests.ts — a live help
 * request), and certificationGate.ts's "Curriculum Assistance Required"
 * blocked_missing outcome (content that's simply ABSENT, not defective).
 * Teacher authority is final everywhere in this module: nothing here
 * assigns severity or promotes a help request into a defect determination
 * automatically.
 */

const CATEGORIES: readonly CurriculumQualityIssueCategory[] = [
  "factual_error",
  "unclear_directions",
  "broken_activity",
  "incorrect_answer_key",
  "age_inappropriate",
  "unsafe_instruction",
  "source_problem",
  "broken_resource",
  "duplicate_or_conflicting",
  "other",
];

const SEVERITIES: readonly CurriculumQualityIssueSeverity[] = ["low", "medium", "high", "critical"];

const RESOLUTION_ACTIONS: readonly CurriculumQualityResolutionAction[] = [
  "corrected_content",
  "replaced_resource",
  "clarified_directions",
  "source_verified",
  "false_alarm",
  "accepted_as_is",
  "other",
];

export function isCurriculumQualityIssueCategory(value: unknown): value is CurriculumQualityIssueCategory {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** Teacher-chosen/confirmed only — see types.ts's CurriculumQualityIssueSeverity doc comment. There is no function anywhere in this codebase that computes or defaults a severity value; every caller must supply one explicitly, and this only validates it. */
export function isCurriculumQualityIssueSeverity(value: unknown): value is CurriculumQualityIssueSeverity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

export function isCurriculumQualityResolutionAction(value: unknown): value is CurriculumQualityResolutionAction {
  return typeof value === "string" && (RESOLUTION_ACTIONS as readonly string[]).includes(value);
}

export { CATEGORIES as CURRICULUM_QUALITY_ISSUE_CATEGORIES };
export { SEVERITIES as CURRICULUM_QUALITY_ISSUE_SEVERITIES };
export { RESOLUTION_ACTIONS as CURRICULUM_QUALITY_RESOLUTION_ACTIONS };

interface ContentLocationInput {
  kidKey?: unknown;
  quarter?: unknown;
  week?: unknown;
}

/**
 * Resolves the exact, narrowest stable content version an issue concerns
 * — from EITHER a proposedDayId (the day/student the teacher was looking
 * at) OR a direct {kidKey, quarter, week} location (for a defect spotted
 * outside any specific day, e.g. reading the uploaded file directly).
 * Returns null when neither is given — a legitimate case (e.g. a general
 * "unclear directions" issue with no specific version to pin down).
 *
 * The client may name a LOCATION (which day, or which kid/quarter/week)
 * but never the content hash itself — that is always computed here,
 * server-side, from whatever content actually exists at that location
 * right now (or, when a proposedDayId with a sourceWeeklyCertificationId
 * is given, from that certification's own immutable historical hash, the
 * more precise "what was actually used" reference). This is exactly
 * section 15's "do not trust client-supplied content ownership" applied
 * to version identity: a client can point at a place, never assert a hash.
 */
export async function resolveContentVersionReference(params: {
  familyId: string;
  proposedDayId?: string;
  contentLocation?: ContentLocationInput;
}): Promise<CurriculumContentVersionReference | null> {
  const db = getFirestore();
  let kidKey: PlacementKidKey;
  let quarter: Quarter;
  let week: number;
  let weeklyCertificationId: string | null = null;

  if (params.proposedDayId) {
    const daySnap = await db.collection("proposedDays").doc(params.proposedDayId).get();
    if (!daySnap.exists) {
      throw new HttpsError("not-found", "No such proposed day.");
    }
    const day = daySnap.data() as ProposedDay;
    if (day.familyId !== params.familyId) {
      throw new HttpsError("permission-denied", "That proposed day belongs to a different family.");
    }
    if (day.quarter === null || day.week === null) {
      // A non-instructional/out-of-school-year day has no curriculum
      // content of its own to reference.
      return null;
    }
    const studentSnap = await db.collection("users").doc(day.studentId).get();
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "No such student.");
    }
    kidKey = requireKidKeyForStudent(studentSnap.data() as UserProfile);
    quarter = day.quarter;
    week = day.week;
    weeklyCertificationId = day.sourceWeeklyCertificationId;
  } else if (params.contentLocation) {
    const { kidKey: rawKidKey, quarter: rawQuarter, week: rawWeek } = params.contentLocation;
    if (!isValidKidKey(rawKidKey)) {
      throw new HttpsError("invalid-argument", "contentLocation.kidKey is invalid.");
    }
    if (!isValidQuarter(rawQuarter)) {
      throw new HttpsError("invalid-argument", "contentLocation.quarter is invalid.");
    }
    if (typeof rawWeek !== "number" || !Number.isInteger(rawWeek) || rawWeek < 1 || rawWeek > 9) {
      throw new HttpsError("invalid-argument", "contentLocation.week must be an integer from 1 to 9.");
    }
    kidKey = rawKidKey;
    quarter = rawQuarter;
    week = rawWeek;
  } else {
    return null;
  }

  // Prefer the certification's own immutable historical hash (the exact
  // version actually used to generate that day) when one exists; only
  // fall back to hashing the CURRENT live content when it doesn't
  // (legacy-mode days, or a direct location with no certification at all).
  let contentHash: string | null = null;
  if (weeklyCertificationId) {
    const certSnap = await db.collection("familyWeeklyCertifications").doc(weeklyCertificationId).get();
    if (certSnap.exists) {
      const cert = certSnap.data() as FamilyWeeklyCertification;
      contentHash = cert.childContent.find((c) => c.kidKey === kidKey)?.contentHash ?? null;
    }
  }
  if (contentHash === null) {
    const entry = await loadWeekEntry(params.familyId, kidKey, quarter, week);
    contentHash = entry ? hashWeekContent(entry) : null;
  }
  if (contentHash === null) {
    throw new HttpsError(
      "failed-precondition",
      "No curriculum content exists for that student/quarter/week — nothing to reference."
    );
  }

  return { kidKey, quarter, week, contentHash, weeklyCertificationId };
}

/**
 * The day-generation gate check (build-order step 10, section 8) — an
 * EXACT match on (familyId, kidKey, quarter, week, contentHash) against
 * every issue with an active quarantine. Returns a "Curriculum Assistance
 * Required"-style reason string when a match exists, reusing that exact
 * phrasing (see certificationGate.ts) rather than inventing a new outcome
 * class; null otherwise. Never matches a corrected version that replaces
 * the flagged one (a different hash), and never affects any other
 * kid/week — this is the "prefer exact-version quarantine, never an
 * entire subject/objective/quarter" requirement enforced structurally by
 * the query itself.
 */
export async function findActiveQuarantineReason(
  familyId: string,
  kidKey: PlacementKidKey,
  quarter: Quarter,
  week: number,
  contentHash: string
): Promise<string | null> {
  const db = getFirestore();
  const snap = await db
    .collection("curriculumQualityIssues")
    .where("familyId", "==", familyId)
    .where("quarantine.active", "==", true)
    .where("contentVersion.kidKey", "==", kidKey)
    .where("contentVersion.quarter", "==", quarter)
    .where("contentVersion.week", "==", week)
    .where("contentVersion.contentHash", "==", contentHash)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const kidLabel = kidKey.charAt(0).toUpperCase() + kidKey.slice(1);
  const quarterLabel = quarter.toUpperCase();
  return (
    `Curriculum Assistance Required: ${kidLabel}'s ${quarterLabel} Week ${week} content has been flagged as ` +
    `defective and quarantined pending teacher review. Resolve or release the quarantine in the Curriculum ` +
    `Quality queue before a new plan can be generated from this exact content version.`
  );
}
