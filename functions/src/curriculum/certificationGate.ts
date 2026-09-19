import type { CurriculumGovernanceMode, DayDesignationType, PlacementKidKey, Quarter } from "../types";

/**
 * Pure decision logic for whether generatePlan may ground a NEW day plan
 * in a kid's week content — kept separate from certificationStatus.ts's
 * Firestore lookups so the actual gating decision is unit-testable without
 * a database (see certificationGate.test.ts).
 *
 * Revised in build-order step 3.2: the top-level switch between
 * enforcement and pre-governance compatibility is now an EXPLICIT,
 * family-level governanceMode ("legacy" | "governed" — see types.ts's
 * CurriculumGovernanceState and curriculumGovernance.ts), never inferred
 * from whether any particular quarter happens to have a certification
 * record. Step 3.1's mistake was treating "this quarter has never been
 * certified" as itself meaning "nothing to enforce yet" — under
 * "governed" mode, a quarter that's never been certified is exactly the
 * case that must block (a brand-new Q2 doesn't get a free pass just
 * because nobody's certified it yet).
 *
 * A day's status is always exactly one of:
 *
 *   1. legacy_compatibility — governanceMode is "legacy": existing
 *                             pre-governance behavior continues untouched
 *                             (ground on content if present, nothing if
 *                             not, never block). The family's default
 *                             until a teacher deliberately activates
 *                             governance (see bootstrapExistingCertifications).
 *   2. certified            — governed, and both the quarter and the
 *                             family week are currently certified.
 *   3/4. blocked_quarter    — governed, but the quarter itself is not
 *                             currently certified (never certified, or
 *                             certified against an older framework/shape).
 *                             Blocks before even looking at the week.
 *   5. blocked_week         — governed, quarter is certified, but the
 *                             family WEEK isn't (never certified or
 *                             stale — names which child's material caused
 *                             staleness).
 *   6. alternative_package  — an explicit, teacher-declared DayDesignation
 *                             says today uses a non-standard package for
 *                             this kid (field trip, etc.).
 *   7. non_instructional    — an explicit, teacher-declared DayDesignation
 *                             says today isn't an instructional day for
 *                             this kid (PTO/break).
 *   8. blocked_missing      — governed, quarter AND week are certified,
 *                             but this specific kid has no content at all
 *                             — "Curriculum Assistance Required."
 *   9. blocked_quarantined  — a teacher has flagged this EXACT content
 *                             version (build-order step 10's Curriculum
 *                             Quality Feedback Queue) as defective and
 *                             quarantined it. Checked BEFORE the legacy/
 *                             governed split — a quarantined version must
 *                             never feed a new day in EITHER mode — but
 *                             AFTER dayDesignation, since an explicit
 *                             alternative-package/non-instructional day
 *                             doesn't use the flagged content at all.
 *                             Also "Curriculum Assistance Required" —
 *                             reuses the same outcome family/messaging
 *                             rather than a competing state.
 *
 * 6 and 7 can ONLY be reached via an explicit dayDesignation input — there
 * is no code path here that infers them from content merely being absent
 * (certificationGate.test.ts asserts this directly). Likewise, 9 can only
 * be reached via an explicit quarantineReason input (computed by the
 * caller from an actual quarantined CurriculumQualityIssue — see
 * curriculum/curriculumQuality.ts#findActiveQuarantineReason) — this
 * function never queries or infers quarantine state itself.
 */

export type FamilyWeekStatus = "certified" | "stale" | "neverCertified";

export type CertificationGateOutcome =
  | "certified"
  | "legacy_compatibility"
  | "blocked_quarter"
  | "blocked_week"
  | "blocked_missing"
  | "blocked_quarantined"
  | "alternative_package"
  | "non_instructional";

export type CertificationGateDecision =
  | {
      outcome: "certified" | "legacy_compatibility" | "alternative_package" | "non_instructional";
      allow: true;
      description?: string;
    }
  | { outcome: "blocked_quarter" | "blocked_week" | "blocked_missing" | "blocked_quarantined"; allow: false; reason: string };

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
  governanceMode: CurriculumGovernanceMode;
  /** The QUARTER's own certification status — only meaningful when governanceMode is "governed". */
  quarterStatus: FamilyWeekStatus;
  /** Does this specific kid have curriculum content written for this week? */
  hasContent: boolean;
  /** The FAMILY week's certification status — only meaningful when governed && quarterStatus === "certified" && hasContent. */
  familyWeekStatus: FamilyWeekStatus;
  /** Which kid(s) caused the family week to go stale, when familyWeekStatus is "stale". */
  staleKidKeys: PlacementKidKey[];
  /** An explicit teacher-declared override for this date, if one exists and applies to this kid. Never inferred. */
  dayDesignation: DayDesignationInfo | null;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
  /**
   * Set by the caller (build-order step 10) when this exact kid/quarter/
   * week content version has an active quarantine — see
   * curriculum/curriculumQuality.ts#findActiveQuarantineReason. Optional
   * and defaults to "no quarantine" when omitted, so every pre-step-10
   * caller/test continues to compile and behave identically.
   */
  quarantineReason?: string | null;
}): CertificationGateDecision {
  // Explicit designation always wins — this is the ONLY path to 6 or 7.
  if (params.dayDesignation) {
    return params.dayDesignation.type === "alternativePackage"
      ? { outcome: "alternative_package", allow: true, description: params.dayDesignation.description }
      : { outcome: "non_instructional", allow: true, description: params.dayDesignation.description };
  }

  // A quarantined exact version must never feed a new day in EITHER
  // legacy or governed mode — checked before the mode split below.
  if (params.quarantineReason) {
    return { outcome: "blocked_quarantined", allow: false, reason: params.quarantineReason };
  }

  if (params.governanceMode === "legacy") {
    return { outcome: "legacy_compatibility", allow: true };
  }

  const kidLabel = KID_LABEL[params.kidKey];
  const quarterLabel = params.quarter.toUpperCase();
  const location = `${quarterLabel} Week ${params.week}`;

  if (params.quarterStatus !== "certified") {
    const reason =
      params.quarterStatus === "neverCertified"
        ? `This family's ${quarterLabel} quarter has not been certified yet. Quarter certification is required ` +
          `before generating a new plan for ${kidLabel}.`
        : `This family's ${quarterLabel} quarter certification is stale — the certified framework no longer ` +
          `matches the current content. Re-certify the quarter before generating a new plan for ${kidLabel}.`;
    return { outcome: "blocked_quarter", allow: false, reason };
  }

  if (!params.hasContent) {
    return {
      outcome: "blocked_missing",
      allow: false,
      reason:
        `Curriculum Assistance Required: ${kidLabel} has no curriculum content for ${location}, but this family's ` +
        `${quarterLabel} is certified and under governance, so content was expected. Either add ${kidLabel}'s ` +
        `content, or explicitly designate this date as an alternative-package or non-instructional day if that's ` +
        `what's actually happening — a missing file is never assumed to mean that on its own.`,
    };
  }

  if (params.familyWeekStatus !== "certified") {
    const staleNote =
      params.familyWeekStatus === "stale" && params.staleKidKeys.length > 0
        ? ` — ${params.staleKidKeys.map((k) => KID_LABEL[k]).join(" and ")}'s material changed since it was last certified`
        : "";
    const reason =
      params.familyWeekStatus === "stale"
        ? `This family's ${location} instructional package is stale${staleNote}. Re-certify the week before generating a new plan for ${kidLabel}.`
        : `This family's ${location} instructional package has not been certified yet. Certify the week before generating a new plan for ${kidLabel}.`;
    return { outcome: "blocked_week", allow: false, reason };
  }

  return { outcome: "certified", allow: true };
}
