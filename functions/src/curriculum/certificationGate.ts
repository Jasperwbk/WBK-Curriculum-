import type { DayDesignationType, PlacementKidKey, Quarter } from "../types";

/**
 * Pure decision logic for whether generatePlan may ground a NEW day plan
 * in a kid's week content — kept separate from certificationStatus.ts's
 * Firestore lookups so the actual gating decision is unit-testable without
 * a database (see certificationGate.test.ts).
 *
 * Revised in build-order step 3.1: certification is a FAMILY-level
 * instructional-package boundary (see types.ts's FamilyQuarterCertification/
 * FamilyWeeklyCertification doc comments), and "no content" is no longer
 * automatically treated as "nothing to gate" — see the five outcomes below.
 * A day's status is always exactly one of:
 *
 *   A. certified          — expected content exists and is currently certified.
 *   B. blocked_uncertified — expected content exists but the family week
 *                            isn't certified yet, or is stale (some child's
 *                            material changed since it was certified).
 *   C. blocked_missing     — the quarter is under governance (the family
 *                            has certified it before) so content was
 *                            EXPECTED for this kid/week, but none exists —
 *                            a real configuration gap, not a normal case.
 *   D. alternative_package — an explicit, teacher-declared DayDesignation
 *                            says today uses a non-standard package for
 *                            this kid (field trip, etc.).
 *   E. non_instructional   — an explicit, teacher-declared DayDesignation
 *                            says today isn't an instructional day for
 *                            this kid (PTO/break).
 *   not_governed            — the quarter itself has never been certified
 *                            by the family at all (e.g. Q2 today, before
 *                            anyone has started it) — nothing to enforce
 *                            yet; same as pre-certification behavior.
 *
 * D and E can ONLY be reached via an explicit dayDesignation input — there
 * is no code path here that infers them from content merely being absent
 * (certificationGate.test.ts asserts this directly).
 */

export type FamilyWeekStatus = "certified" | "stale" | "neverCertified";

export type CertificationGateOutcome =
  | "certified"
  | "blocked_uncertified"
  | "blocked_missing"
  | "alternative_package"
  | "non_instructional"
  | "not_governed";

export type CertificationGateDecision =
  | { outcome: "certified" | "alternative_package" | "non_instructional" | "not_governed"; allow: true; description?: string }
  | { outcome: "blocked_uncertified" | "blocked_missing"; allow: false; reason: string };

export interface DayDesignationInfo {
  type: DayDesignationType;
  description: string;
}

const KID_LABEL: Record<PlacementKidKey, string> = {
  millaray: "Millaray",
  makaio: "Makaio",
  maizley: "Maizley",
};

export function evaluateCertificationGate(params: {
  /** Has the family EVER certified this quarter at all (regardless of current staleness)? */
  quarterGoverned: boolean;
  /** Does this specific kid have curriculum content written for this week? */
  hasContent: boolean;
  /** The FAMILY week's certification status — only meaningful when quarterGoverned && hasContent. */
  familyWeekStatus: FamilyWeekStatus;
  /** Which kid(s) caused the family week to go stale, when familyWeekStatus is "stale". */
  staleKidKeys: PlacementKidKey[];
  /** An explicit teacher-declared override for this date, if one exists and applies to this kid. Never inferred. */
  dayDesignation: DayDesignationInfo | null;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
}): CertificationGateDecision {
  // Explicit designation always wins — this is the ONLY path to D or E.
  if (params.dayDesignation) {
    return params.dayDesignation.type === "alternativePackage"
      ? { outcome: "alternative_package", allow: true, description: params.dayDesignation.description }
      : { outcome: "non_instructional", allow: true, description: params.dayDesignation.description };
  }

  if (!params.quarterGoverned) {
    return { outcome: "not_governed", allow: true };
  }

  const kidLabel = KID_LABEL[params.kidKey];
  const location = `${params.quarter.toUpperCase()} Week ${params.week}`;

  if (!params.hasContent) {
    return {
      outcome: "blocked_missing",
      allow: false,
      reason:
        `Curriculum Assistance Required: ${kidLabel} has no curriculum content for ${location}, but this family's ` +
        `${params.quarter.toUpperCase()} is under certification governance, so content was expected. Either add ` +
        `${kidLabel}'s content, or explicitly designate this date as an alternative-package or non-instructional ` +
        `day if that's what's actually happening — a missing file is never assumed to mean that on its own.`,
    };
  }

  if (params.familyWeekStatus === "certified") {
    return { outcome: "certified", allow: true };
  }

  const staleNote =
    params.familyWeekStatus === "stale" && params.staleKidKeys.length > 0
      ? ` — ${params.staleKidKeys.map((k) => KID_LABEL[k]).join(" and ")}'s material changed since it was last certified`
      : "";
  return {
    outcome: "blocked_uncertified",
    allow: false,
    reason:
      params.familyWeekStatus === "stale"
        ? `This family's ${location} instructional package is stale${staleNote}. Re-certify the week before generating a new plan for ${kidLabel}.`
        : `This family's ${location} instructional package has not been certified yet. Certify the week before generating a new plan for ${kidLabel}.`,
  };
}
