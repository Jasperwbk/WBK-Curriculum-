import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCertificationGate } from "./certificationGate";

test("allows generation when there is no content to ground on (unchanged pre-certification behavior)", () => {
  const decision = evaluateCertificationGate({
    hasContent: false,
    weekStatus: "neverCertified",
    kidKey: "millaray",
    quarter: "q2",
    week: 1,
  });
  assert.equal(decision.allow, true);
});

test("allows generation when the week is certified and current", () => {
  const decision = evaluateCertificationGate({
    hasContent: true,
    weekStatus: "certified",
    kidKey: "millaray",
    quarter: "q1",
    week: 1,
  });
  assert.equal(decision.allow, true);
});

test("blocks generation when content exists but was never certified", () => {
  const decision = evaluateCertificationGate({
    hasContent: true,
    weekStatus: "neverCertified",
    kidKey: "makaio",
    quarter: "q1",
    week: 3,
  });
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /Makaio/);
    assert.match(decision.reason, /Q1/);
    assert.match(decision.reason, /Week 3/);
    assert.match(decision.reason, /not been certified/);
  }
});

test("blocks generation when content exists but was certified against an older version (stale)", () => {
  const decision = evaluateCertificationGate({
    hasContent: true,
    weekStatus: "stale",
    kidKey: "maizley",
    quarter: "q1",
    week: 5,
  });
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /Maizley/);
    assert.match(decision.reason, /edited since it was last certified/);
  }
});
