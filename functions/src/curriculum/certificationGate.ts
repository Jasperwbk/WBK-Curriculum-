import type { PlacementKidKey, Quarter } from "../types";

/**
 * Pure decision logic for whether generatePlan may ground a NEW day plan
 * in a kid's week content — kept separate from certificationStatus.ts's
 * Firestore lookups so the actual gating decision is unit-testable without
 * a database (see certificationGate.test.ts).
 *
 * The gate only ever applies when there's real content to gate — a week
 * with nothing uploaded/written yet behaves exactly as it did before
 * certification existed (less-grounded generation, no error). Only a week
 * that HAS content but hasn't been certified (or was certified against an
 * older version of that content) blocks curriculum-grounded generation.
 */

export type WeekCertificationStatus = "certified" | "stale" | "neverCertified";

export type CertificationGateDecision =
  | { allow: true }
  | { allow: false; reason: string };

const KID_LABEL: Record<PlacementKidKey, string> = {
  millaray: "Millaray",
  makaio: "Makaio",
  maizley: "Maizley",
};

export function evaluateCertificationGate(params: {
  hasContent: boolean;
  weekStatus: WeekCertificationStatus;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
}): CertificationGateDecision {
  if (!params.hasContent) {
    return { allow: true };
  }
  if (params.weekStatus === "certified") {
    return { allow: true };
  }

  const kidLabel = KID_LABEL[params.kidKey];
  const location = `${kidLabel}'s ${params.quarter.toUpperCase()} Week ${params.week} curriculum`;
  const reason =
    params.weekStatus === "stale"
      ? `${location} has been edited since it was last certified — re-certify it before generating a curriculum-grounded plan for this date.`
      : `${location} has not been certified yet — certify it (after certifying the ${params.quarter.toUpperCase()} quarter, if that hasn't happened either) before generating a curriculum-grounded plan for this date.`;

  return { allow: false, reason };
}
