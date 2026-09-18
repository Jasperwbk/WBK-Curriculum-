/**
 * Pure idempotency/versioning decision for the two-day-ahead pipeline
 * (build-order step 4) — kept separate from proposedDays.ts's Firestore
 * I/O so the decision itself is unit-testable without a database (see
 * proposedDayLifecycle.test.ts). Running generation repeatedly for the
 * same (family, student, date) must never create uncontrolled duplicates:
 *
 *   no existing proposal              -> generate (version 1)
 *   unapproved, source unchanged      -> skip (nothing to do)
 *   unapproved, source changed        -> regenerate (new version, old one preserved)
 *   unapproved, teacher forced it     -> regenerate (new version, regardless of source)
 *   approved                          -> blocked, always — NEVER silently touched,
 *                                        forceRegenerate included (approved days
 *                                        are simply outside step 4's regeneration
 *                                        path; see certificationGate.ts's own
 *                                        "never touch a published day" rule)
 */

export interface ExistingProposedDay {
  id: string;
  status: "proposed" | "approved";
  sourceSignature: string;
  proposalVersion: number;
}

export type GenerationActionReason =
  | "no_existing_proposal"
  | "unchanged"
  | "source_changed"
  | "forced"
  | "already_approved";

export type GenerationAction =
  | { action: "generate"; reason: "no_existing_proposal"; nextVersion: 1; supersedesProposalId: null }
  | { action: "skip"; reason: "unchanged"; existingId: string }
  | {
      action: "regenerate";
      reason: "source_changed" | "forced";
      existingId: string;
      nextVersion: number;
      supersedesProposalId: string;
    }
  | { action: "blocked"; reason: "already_approved"; existingId: string };

export function decideGenerationAction(params: {
  existing: ExistingProposedDay | null;
  currentSourceSignature: string;
  forceRegenerate: boolean;
}): GenerationAction {
  if (!params.existing) {
    return { action: "generate", reason: "no_existing_proposal", nextVersion: 1, supersedesProposalId: null };
  }

  if (params.existing.status === "approved") {
    return { action: "blocked", reason: "already_approved", existingId: params.existing.id };
  }

  // status === "proposed" from here on.
  if (params.forceRegenerate) {
    return {
      action: "regenerate",
      reason: "forced",
      existingId: params.existing.id,
      nextVersion: params.existing.proposalVersion + 1,
      supersedesProposalId: params.existing.id,
    };
  }

  if (params.existing.sourceSignature !== params.currentSourceSignature) {
    return {
      action: "regenerate",
      reason: "source_changed",
      existingId: params.existing.id,
      nextVersion: params.existing.proposalVersion + 1,
      supersedesProposalId: params.existing.id,
    };
  }

  return { action: "skip", reason: "unchanged", existingId: params.existing.id };
}

/**
 * Read-only staleness check (no generation, no Claude call) — the same
 * comparison decideGenerationAction makes internally, exposed separately
 * so the teacher UI can show "requires regeneration" on an unapproved
 * proposal without triggering a regenerate. An approved day is never
 * "stale" in this sense — it's simply preserved, per certificationGate.ts's
 * "never touch a published day" rule; this only applies to unapproved
 * proposals sitting in review.
 */
export function isProposedDayStale(params: {
  status: "proposed" | "approved";
  sourceSignature: string;
  currentSourceSignature: string;
}): boolean {
  return params.status === "proposed" && params.sourceSignature !== params.currentSourceSignature;
}
