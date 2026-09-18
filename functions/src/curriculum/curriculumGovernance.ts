import type { CurriculumGovernanceMode, Family } from "../types";

/**
 * The gate's top-level compatibility switch (build-order step 3.2) —
 * always "legacy" unless a family's own Family.curriculumGovernance record
 * explicitly says "governed". Deliberately NOT inferred from whether any
 * quarter/week happens to have a certification record — that was the
 * exact bug this correction fixes (see certificationGate.ts). A family
 * that has never called bootstrapExistingCertifications, or was created
 * before this architecture existed, is always "legacy" — deploying this
 * code can never by itself change a family's behavior.
 */
export function getCurriculumGovernanceMode(family: Family): CurriculumGovernanceMode {
  return family.curriculumGovernance?.mode ?? "legacy";
}

/**
 * bootstrapExistingCertifications' activation decision, pulled out as a
 * pure function so the transition is unit-testable without Firestore:
 * activation only ever fires on the legacy -> governed transition, and is
 * a no-op every time it's already "governed" — deterministic and
 * idempotent regardless of how many times bootstrap is re-run.
 */
export function shouldActivateGovernance(currentMode: CurriculumGovernanceMode): boolean {
  return currentMode === "legacy";
}
