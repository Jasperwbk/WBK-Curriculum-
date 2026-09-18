import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import {
  appliedProjectionState,
  failedProjectionState,
  initialProjectionState,
  needsProjection,
  summarizeError,
} from "./evidenceProjection";

const NOW = Timestamp.fromDate(new Date("2026-09-21T12:00:00Z"));

test("needsProjection: pending needs (re-)running", () => {
  assert.equal(needsProjection({ status: "pending", lastAttemptAt: NOW }), true);
});

test("needsProjection: failed needs (re-)running — failure status is recoverable", () => {
  assert.equal(needsProjection({ status: "failed", lastAttemptAt: NOW, error: "boom" }), true);
});

test("needsProjection: applied does NOT need running again — an already-successful projection is never duplicated during reconciliation", () => {
  assert.equal(needsProjection({ status: "applied", lastAttemptAt: NOW, appliedAt: NOW }), false);
});

test("needsProjection: undefined state (never attempted) needs running", () => {
  assert.equal(needsProjection(undefined), true);
});

test("processing status transitions are deterministic: the same state always yields the same needsProjection verdict", () => {
  const state = { status: "failed" as const, lastAttemptAt: NOW, error: "x" };
  assert.equal(needsProjection(state), needsProjection(state));
  assert.equal(needsProjection(state), true);
});

test("summarizeError: extracts a plain Error's message", () => {
  assert.equal(summarizeError(new Error("Firestore unavailable")), "Firestore unavailable");
});

test("summarizeError: accepts a plain string", () => {
  assert.equal(summarizeError("something broke"), "something broke");
});

test("summarizeError: never includes a stack trace, and falls back to a generic message for a non-Error/non-string", () => {
  assert.equal(summarizeError({ weird: "object" }), "Unknown error");
  assert.equal(summarizeError(undefined), "Unknown error");
});

test("summarizeError: truncates an excessively long message rather than storing it in full", () => {
  const huge = "x".repeat(1000);
  const result = summarizeError(new Error(huge));
  assert.ok(result.length <= 301); // 300 chars + ellipsis
  assert.ok(result.endsWith("…"));
});

test("initialProjectionState: starts pending, with lastAttemptAt set and nothing else", () => {
  const state = initialProjectionState(NOW);
  assert.equal(state.status, "pending");
  assert.equal(state.lastAttemptAt, NOW);
  assert.equal(state.appliedAt, undefined);
  assert.equal(state.error, undefined);
});

test("appliedProjectionState: sets both lastAttemptAt and appliedAt to the same successful moment", () => {
  const state = appliedProjectionState(NOW);
  assert.equal(state.status, "applied");
  assert.equal(state.lastAttemptAt, NOW);
  assert.equal(state.appliedAt, NOW);
  assert.equal(state.error, undefined);
});

test("failedProjectionState: sets status failed with a summarized error, and never sets appliedAt", () => {
  const state = failedProjectionState(NOW, new Error("network blip"));
  assert.equal(state.status, "failed");
  assert.equal(state.error, "network blip");
  assert.equal(state.appliedAt, undefined);
});
