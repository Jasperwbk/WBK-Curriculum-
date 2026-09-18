import { getFirestore } from "firebase-admin/firestore";
import type { DayDesignation, PlacementKidKey } from "../types";
import type { DayDesignationInfo } from "./certificationGate";

/**
 * Explicit, teacher-declared day designations (build-order step 3.1) — the
 * ONLY way a day can be represented as an approved alternative-package or
 * non-instructional day to generatePlan's certification gate. Never
 * inferred from missing content; see certificationGate.ts.
 */

export interface DayDesignationLookup {
  id: string;
  record: DayDesignation;
}

/** All designations recorded for one family+date — usually zero or one, but not assumed to be. */
export async function getDayDesignationsForDate(
  familyId: string,
  date: string
): Promise<DayDesignationLookup[]> {
  const db = getFirestore();
  const snap = await db
    .collection("dayDesignations")
    .where("familyId", "==", familyId)
    .where("date", "==", date)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, record: doc.data() as DayDesignation }));
}

export interface DayDesignationInfoWithId extends DayDesignationInfo {
  id: string;
}

/** Picks out the designation (if any) that applies to one specific kid, from an already-fetched list for that date. */
export function findDesignationForKid(
  designations: readonly DayDesignationLookup[],
  kidKey: PlacementKidKey
): DayDesignationInfoWithId | null {
  const match = designations.find((d) => d.record.kidKeys.includes(kidKey));
  return match ? { id: match.id, type: match.record.type, description: match.record.description } : null;
}
