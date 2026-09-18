import type { Timestamp } from "firebase-admin/firestore";
import type { ProjectionState } from "../types";

/**
 * Pure processing-state decisions for a packet's two post-approval
 * projections (hours/mastery) — build-order step 6.1. Kept separate from
 * evidencePackets.ts's Firestore orchestration so "does this need
 * (re-)running" and "how do we summarize a caught error" are
 * unit-testable without a database.
 */

const MAX_ERROR_LENGTH = 300;

/** A projection needs (re-)running whenever it hasn't already succeeded — covers "pending" (never attempted), "failed" (attempted and errored), and "undefined" (a step-6-only packet predating this field, if one ever existed) identically. Never re-runs an "applied" projection — that's the idempotency guarantee reconciliation depends on. */
export function needsProjection(state: ProjectionState | undefined): boolean {
  return state?.status !== "applied";
}

/** Never stores a raw stack trace or any secret — message text only, truncated to a bounded length. */
export function summarizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
}

export function initialProjectionState(now: Timestamp): ProjectionState {
  return { status: "pending", lastAttemptAt: now };
}

export function appliedProjectionState(now: Timestamp): ProjectionState {
  return { status: "applied", lastAttemptAt: now, appliedAt: now };
}

export function failedProjectionState(now: Timestamp, err: unknown): ProjectionState {
  return { status: "failed", lastAttemptAt: now, error: summarizeError(err) };
}
