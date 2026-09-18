import { getFirestore } from "firebase-admin/firestore";
import type {
  ChildContentReference,
  FamilyQuarterCertification,
  FamilyWeeklyCertification,
  PlacementKidKey,
  Quarter,
} from "../types";
import { diffStaleKidKeys, hashFamilyPackage, hashQuarterShape, hashWeekContent } from "./contentHash";
import { loadAllWeekEntries, loadWeekEntry, PLACEMENT_KID_KEYS } from "./loadCurriculumContent";
import type { FamilyWeekStatus } from "./certificationGate";

/**
 * Firestore-querying half of certification status (build-order step 3.1:
 * FAMILY-level packages, per-kid traceability underneath). Resolves
 * whether the family's quarter/week package is currently certified by
 * comparing the most recent certification record's familyContentHash
 * against one freshly computed from every child's current content. See
 * types.ts's FamilyQuarterCertification/FamilyWeeklyCertification doc
 * comments for why there's no mutable "status" field to query instead.
 */

export type QuarterOrWeekStatus = FamilyWeekStatus;

export interface FamilyQuarterCertificationLookup {
  id: string;
  record: FamilyQuarterCertification;
}

export interface FamilyWeeklyCertificationLookup {
  id: string;
  record: FamilyWeeklyCertification;
}

/** The most recent FamilyQuarterCertification for this family+quarter, if any exists at all (certified or stale). */
export async function getCurrentFamilyQuarterCertification(
  familyId: string,
  quarter: Quarter
): Promise<FamilyQuarterCertificationLookup | null> {
  const db = getFirestore();
  const snap = await db
    .collection("familyQuarterCertifications")
    .where("familyId", "==", familyId)
    .where("quarter", "==", quarter)
    .orderBy("certifiedAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, record: doc.data() as FamilyQuarterCertification };
}

/** The most recent FamilyWeeklyCertification for this family+quarter+week, if any exists at all. */
export async function getCurrentFamilyWeeklyCertification(
  familyId: string,
  quarter: Quarter,
  week: number
): Promise<FamilyWeeklyCertificationLookup | null> {
  const db = getFirestore();
  const snap = await db
    .collection("familyWeeklyCertifications")
    .where("familyId", "==", familyId)
    .where("quarter", "==", quarter)
    .where("week", "==", week)
    .orderBy("certifiedAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, record: doc.data() as FamilyWeeklyCertification };
}

interface FamilyPackageContent {
  childContent: ChildContentReference[];
  familyContentHash: string;
  /** Whether ANY of the three kids has content at all — an all-null package is nothing to certify. */
  anyContent: boolean;
}

/** Every child's current quarter-shape hash, assembled into the family package — see contentHash.ts#hashFamilyPackage. */
async function computeFamilyQuarterContent(familyId: string, quarter: Quarter): Promise<FamilyPackageContent> {
  const childContent: ChildContentReference[] = await Promise.all(
    PLACEMENT_KID_KEYS.map(async (kidKey) => {
      const weeks = await loadAllWeekEntries(familyId, kidKey, quarter);
      const contentHash = weeks && weeks.length > 0 ? hashQuarterShape(weeks) : null;
      return { kidKey, contentHash };
    })
  );
  return {
    childContent,
    familyContentHash: hashFamilyPackage(childContent),
    anyContent: childContent.some((c) => c.contentHash !== null),
  };
}

/** Every child's current week-content hash, assembled into the family package. */
async function computeFamilyWeekContent(
  familyId: string,
  quarter: Quarter,
  week: number
): Promise<FamilyPackageContent> {
  const childContent: ChildContentReference[] = await Promise.all(
    PLACEMENT_KID_KEYS.map(async (kidKey) => {
      const entry = await loadWeekEntry(familyId, kidKey, quarter, week);
      const contentHash = entry ? hashWeekContent(entry) : null;
      return { kidKey, contentHash };
    })
  );
  return {
    childContent,
    familyContentHash: hashFamilyPackage(childContent),
    anyContent: childContent.some((c) => c.contentHash !== null),
  };
}

export interface FamilyQuarterStatusResult {
  /** Has the family EVER certified this quarter (regardless of current staleness)? */
  governed: boolean;
  status: QuarterOrWeekStatus;
  current: FamilyPackageContent;
  /** Which kid(s)' shape changed since the latest certification — empty unless status is "stale". */
  staleKidKeys: PlacementKidKey[];
  latest: FamilyQuarterCertificationLookup | null;
}

/** Combines the family's current quarter package with the latest certification record. */
export async function getFamilyQuarterCertificationStatus(
  familyId: string,
  quarter: Quarter
): Promise<FamilyQuarterStatusResult> {
  const current = await computeFamilyQuarterContent(familyId, quarter);
  const latest = await getCurrentFamilyQuarterCertification(familyId, quarter);

  if (!latest) {
    return { governed: false, status: "neverCertified", current, staleKidKeys: [], latest: null };
  }
  const isCurrent = latest.record.familyContentHash === current.familyContentHash;
  return {
    governed: true,
    status: isCurrent ? "certified" : "stale",
    current,
    staleKidKeys: isCurrent ? [] : diffStaleKidKeys(current.childContent, latest.record.childContent),
    latest,
  };
}

export interface FamilyWeekStatusResult {
  status: QuarterOrWeekStatus;
  current: FamilyPackageContent;
  staleKidKeys: PlacementKidKey[];
  latest: FamilyWeeklyCertificationLookup | null;
}

/**
 * Combines the family's current week package with the latest certification
 * record. Whether the week's QUARTER is itself governed/certified is a
 * separate concern the gate checks first via
 * getFamilyQuarterCertificationStatus (build-order step 3.2 — the gate's
 * top-level switch is the family's explicit governanceMode, not a
 * per-quarter "does a cert record exist" inference) — callers that need
 * both fetch both, rather than this function doing an extra quarter-level
 * lookup just to bundle a boolean in here as step 3.1 did.
 */
export async function getFamilyWeeklyCertificationStatus(
  familyId: string,
  quarter: Quarter,
  week: number
): Promise<FamilyWeekStatusResult> {
  const [current, latest] = await Promise.all([
    computeFamilyWeekContent(familyId, quarter, week),
    getCurrentFamilyWeeklyCertification(familyId, quarter, week),
  ]);

  if (!latest) {
    return { status: "neverCertified", current, staleKidKeys: [], latest: null };
  }
  const isCurrent = latest.record.familyContentHash === current.familyContentHash;
  return {
    status: isCurrent ? "certified" : "stale",
    current,
    staleKidKeys: isCurrent ? [] : diffStaleKidKeys(current.childContent, latest.record.childContent),
    latest,
  };
}
