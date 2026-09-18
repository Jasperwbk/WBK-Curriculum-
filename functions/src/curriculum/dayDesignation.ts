import { getFirestore } from "firebase-admin/firestore";
import type { DayDesignation, PlacementKidKey } from "../types";
import type { DayDesignationInfo } from "./certificationGate";

/**
 * Explicit, teacher-declared day designations (build-order step 3.1) — the
 * ONLY way a day can be represented as an approved alternative-package or
 * non-instructional day to generatePlan's certification gate. Never
 * inferred from missing content; see certificationGate.ts.
 */

/** All designations recorded for one family+date — usually zero or one, but not assumed to be. */
export async function getDayDesignationsForDate(
  familyId: string,
  date: string
): Promise<DayDesignation[]> {
  const db = getFirestore();
  const snap = await db
    .collection("dayDesignations")
    .where("familyId", "==", familyId)
    .where("date", "==", date)
    .get();
  return snap.docs.map((doc) => doc.data() as DayDesignation);
}

/** Picks out the designation (if any) that applies to one specific kid, from an already-fetched list for that date. */
export function findDesignationForKid(
  designations: readonly DayDesignation[],
  kidKey: PlacementKidKey
): DayDesignationInfo | null {
  const match = designations.find((d) => d.kidKeys.includes(kidKey));
  return match ? { type: match.type, description: match.description } : null;
}
