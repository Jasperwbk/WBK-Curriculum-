import { getFirestore } from "firebase-admin/firestore";
import type { PlacementKidKey, Quarter, QuarterCertification, WeeklyCertification } from "../types";
import { hashQuarterShape, hashWeekContent } from "./contentHash";
import { loadAllWeekEntries, loadWeekEntry } from "./loadCurriculumContent";
import type { WeekCertificationStatus } from "./certificationGate";

/**
 * Firestore-querying half of certification status — resolves whether a
 * quarter or week is currently certified by comparing the most recent
 * certification record's stored hash against a freshly computed hash of
 * the content as it exists right now. See types.ts's QuarterCertification/
 * WeeklyCertification doc comments for why there's no mutable "status"
 * field to query instead.
 */

export type QuarterOrWeekStatus = "certified" | "stale" | "neverCertified";

export interface QuarterCertificationLookup {
  id: string;
  record: QuarterCertification;
}

export interface WeeklyCertificationLookup {
  id: string;
  record: WeeklyCertification;
}

/** The most recent QuarterCertification for this kid+quarter, if any exists at all (certified or stale). */
export async function getCurrentQuarterCertification(
  familyId: string,
  kidKey: PlacementKidKey,
  quarter: Quarter
): Promise<QuarterCertificationLookup | null> {
  const db = getFirestore();
  const snap = await db
    .collection("quarterCertifications")
    .where("familyId", "==", familyId)
    .where("kidKey", "==", kidKey)
    .where("quarter", "==", quarter)
    .orderBy("certifiedAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, record: doc.data() as QuarterCertification };
}

/** The most recent WeeklyCertification for this kid+quarter+week, if any exists at all. */
export async function getCurrentWeeklyCertification(
  familyId: string,
  kidKey: PlacementKidKey,
  quarter: Quarter,
  week: number
): Promise<WeeklyCertificationLookup | null> {
  const db = getFirestore();
  const snap = await db
    .collection("weeklyCertifications")
    .where("familyId", "==", familyId)
    .where("kidKey", "==", kidKey)
    .where("quarter", "==", quarter)
    .where("week", "==", week)
    .orderBy("certifiedAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, record: doc.data() as WeeklyCertification };
}

export interface QuarterStatusResult {
  status: QuarterOrWeekStatus;
  currentHash: string | null; // null only when there's no content at all to hash
  latest: QuarterCertificationLookup | null;
}

/** Combines the current content's hash with the latest certification record to decide quarter status. */
export async function getQuarterCertificationStatus(
  familyId: string,
  kidKey: PlacementKidKey,
  quarter: Quarter
): Promise<QuarterStatusResult> {
  const weeks = await loadAllWeekEntries(familyId, kidKey, quarter);
  if (!weeks || weeks.length === 0) {
    return { status: "neverCertified", currentHash: null, latest: null };
  }
  const currentHash = hashQuarterShape(weeks);
  const latest = await getCurrentQuarterCertification(familyId, kidKey, quarter);
  if (!latest) return { status: "neverCertified", currentHash, latest: null };
  const status = latest.record.certifiedContentHash === currentHash ? "certified" : "stale";
  return { status, currentHash, latest };
}

export interface WeekStatusResult {
  status: WeekCertificationStatus;
  hasContent: boolean;
  currentHash: string | null;
  latest: WeeklyCertificationLookup | null;
}

/** Combines the current week's content hash with the latest certification record to decide week status. */
export async function getWeeklyCertificationStatus(
  familyId: string,
  kidKey: PlacementKidKey,
  quarter: Quarter,
  week: number
): Promise<WeekStatusResult> {
  const entry = await loadWeekEntry(familyId, kidKey, quarter, week);
  if (!entry) {
    return { status: "neverCertified", hasContent: false, currentHash: null, latest: null };
  }
  const currentHash = hashWeekContent(entry);
  const latest = await getCurrentWeeklyCertification(familyId, kidKey, quarter, week);
  if (!latest) return { status: "neverCertified", hasContent: true, currentHash, latest: null };
  const status = latest.record.certifiedContentHash === currentHash ? "certified" : "stale";
  return { status, hasContent: true, currentHash, latest };
}
