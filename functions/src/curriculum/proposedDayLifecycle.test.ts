import { test } from "node:test";
import assert from "node:assert/strict";
import { decideGenerationAction, isProposedDayStale } from "./proposedDayLifecycle";

test("no existing proposal -> generate, version 1", () => {
  const decision = decideGenerationAction({
    existing: null,
    currentSourceSignature: "cert:abc",
    forceRegenerate: false,
  });
  assert.equal(decision.action, "generate");
  assert.equal(decision.nextVersion, 1);
  assert.equal(decision.supersedesProposalId, null);
});

test("unapproved proposal, source unchanged -> skip (does not unnecessarily regenerate)", () => {
  const decision = decideGenerationAction({
    existing: { id: "p1", status: "proposed", sourceSignature: "cert:abc", proposalVersion: 1 },
    currentSourceSignature: "cert:abc",
    forceRegenerate: false,
  });
  assert.equal(decision.action, "skip");
  if (decision.action === "skip") assert.equal(decision.existingId, "p1");
});

test("unapproved proposal, source changed -> regenerate, preserving the old version as supersedesProposalId", () => {
  const decision = decideGenerationAction({
    existing: { id: "p1", status: "proposed", sourceSignature: "cert:abc", proposalVersion: 1 },
    currentSourceSignature: "cert:XYZ",
    forceRegenerate: false,
  });
  assert.equal(decision.action, "regenerate");
  if (decision.action === "regenerate") {
    assert.equal(decision.reason, "source_changed");
    assert.equal(decision.nextVersion, 2);
    assert.equal(decision.supersedesProposalId, "p1");
  }
});

test("unapproved proposal, teacher forces regeneration even with an unchanged source -> regenerate anyway", () => {
  const decision = decideGenerationAction({
    existing: { id: "p1", status: "proposed", sourceSignature: "cert:abc", proposalVersion: 3 },
    currentSourceSignature: "cert:abc", // unchanged
    forceRegenerate: true,
  });
  assert.equal(decision.action, "regenerate");
  if (decision.action === "regenerate") {
    assert.equal(decision.reason, "forced");
    assert.equal(decision.nextVersion, 4);
    assert.equal(decision.supersedesProposalId, "p1");
  }
});

test("approved day exists -> always blocked, never silently overwritten, even with a changed source", () => {
  const decision = decideGenerationAction({
    existing: { id: "p1", status: "approved", sourceSignature: "cert:abc", proposalVersion: 2 },
    currentSourceSignature: "cert:XYZ",
    forceRegenerate: false,
  });
  assert.equal(decision.action, "blocked");
  if (decision.action === "blocked") assert.equal(decision.existingId, "p1");
});

test("approved day exists -> blocked even when the teacher explicitly requests forceRegenerate", () => {
  const decision = decideGenerationAction({
    existing: { id: "p1", status: "approved", sourceSignature: "cert:abc", proposalVersion: 2 },
    currentSourceSignature: "cert:abc",
    forceRegenerate: true,
  });
  assert.equal(decision.action, "blocked");
});

test("version numbers increment monotonically across repeated regenerations", () => {
  let existing = null as Parameters<typeof decideGenerationAction>[0]["existing"];
  const first = decideGenerationAction({ existing, currentSourceSignature: "v1", forceRegenerate: false });
  assert.equal(first.action, "generate");
  existing = { id: "p1", status: "proposed", sourceSignature: "v1", proposalVersion: 1 };

  const second = decideGenerationAction({ existing, currentSourceSignature: "v2", forceRegenerate: false });
  assert.equal(second.action, "regenerate");
  if (second.action !== "regenerate") throw new Error("unreachable");
  assert.equal(second.nextVersion, 2);
  existing = { id: "p2", status: "proposed", sourceSignature: "v2", proposalVersion: 2 };

  const third = decideGenerationAction({ existing, currentSourceSignature: "v3", forceRegenerate: false });
  assert.equal(third.action, "regenerate");
  if (third.action !== "regenerate") throw new Error("unreachable");
  assert.equal(third.nextVersion, 3);
});

// --- isProposedDayStale ---

test("isProposedDayStale: false for an unapproved proposal whose source matches the current one", () => {
  assert.equal(
    isProposedDayStale({ status: "proposed", sourceSignature: "cert:abc", currentSourceSignature: "cert:abc" }),
    false
  );
});

test("isProposedDayStale: true for an unapproved proposal whose source no longer matches", () => {
  assert.equal(
    isProposedDayStale({ status: "proposed", sourceSignature: "cert:abc", currentSourceSignature: "cert:XYZ" }),
    true
  );
});

test("isProposedDayStale: an approved day is never reported stale, even if its source no longer matches — it's preserved, not flagged for regeneration", () => {
  assert.equal(
    isProposedDayStale({ status: "approved", sourceSignature: "cert:abc", currentSourceSignature: "cert:XYZ" }),
    false
  );
});
