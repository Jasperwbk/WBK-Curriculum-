import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCertificationGate } from "./certificationGate";

const BASE = {
  kidKey: "millaray" as const,
  quarter: "q1" as const,
  week: 3,
  staleKidKeys: [] as ("millaray" | "makaio" | "maizley")[],
  dayDesignation: null,
};

test("A: allows generation when the family week is certified and current", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: true,
    hasContent: true,
    familyWeekStatus: "certified",
  });
  assert.equal(decision.outcome, "certified");
  assert.equal(decision.allow, true);
});

test("B: blocks when content exists but the family week was never certified (quarter is governed)", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: true,
    hasContent: true,
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decision.outcome, "blocked_uncertified");
  assert.equal(decision.allow, false);
  if (!decision.allow) assert.match(decision.reason, /has not been certified yet/);
});

test("B: blocks when content exists but the family week is stale, naming the child(ren) who caused it", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: true,
    hasContent: true,
    familyWeekStatus: "stale",
    staleKidKeys: ["makaio"],
  });
  assert.equal(decision.outcome, "blocked_uncertified");
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /stale/);
    assert.match(decision.reason, /Makaio/);
  }
});

test("B: stale message lists multiple culprits when more than one child changed", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: true,
    hasContent: true,
    familyWeekStatus: "stale",
    staleKidKeys: ["makaio", "maizley"],
  });
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /Makaio/);
    assert.match(decision.reason, /Maizley/);
  }
});

test("C: blocks with 'Curriculum Assistance Required' when a governed quarter is missing a kid's content unexpectedly", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: true,
    hasContent: false,
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decision.outcome, "blocked_missing");
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /Curriculum Assistance Required/);
    assert.match(decision.reason, /Millaray/);
  }
});

test("not_governed: allows generation when the quarter has never been certified at all (e.g. an unstarted future quarter)", () => {
  const decisionNoContent = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: false,
    hasContent: false,
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decisionNoContent.outcome, "not_governed");
  assert.equal(decisionNoContent.allow, true);

  // Even if content somehow exists for an ungoverned quarter, it's still
  // not_governed — the family simply hasn't started governing it yet.
  const decisionWithContent = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: false,
    hasContent: true,
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decisionWithContent.outcome, "not_governed");
  assert.equal(decisionWithContent.allow, true);
});

test("D: an explicit alternativePackage designation allows generation even with no content and an uncertified/ungoverned quarter", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: true,
    hasContent: false,
    familyWeekStatus: "neverCertified",
    dayDesignation: { type: "alternativePackage", description: "Field trip to the science museum." },
  });
  assert.equal(decision.outcome, "alternative_package");
  assert.equal(decision.allow, true);
  if (decision.allow) assert.equal(decision.description, "Field trip to the science museum.");
});

test("E: an explicit nonInstructional designation allows generation even with no content", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    quarterGoverned: true,
    hasContent: false,
    familyWeekStatus: "neverCertified",
    dayDesignation: { type: "nonInstructional", description: "Approved family PTO day." },
  });
  assert.equal(decision.outcome, "non_instructional");
  assert.equal(decision.allow, true);
  if (decision.allow) assert.equal(decision.description, "Approved family PTO day.");
});

test("D/E are never reachable without an explicit dayDesignation input, across every other combination", () => {
  const boolCombos = [true, false];
  const statuses: ("certified" | "stale" | "neverCertified")[] = ["certified", "stale", "neverCertified"];
  for (const quarterGoverned of boolCombos) {
    for (const hasContent of boolCombos) {
      for (const familyWeekStatus of statuses) {
        const decision = evaluateCertificationGate({
          ...BASE,
          quarterGoverned,
          hasContent,
          familyWeekStatus,
          dayDesignation: null, // explicitly absent in every combination
        });
        assert.notEqual(decision.outcome, "alternative_package");
        assert.notEqual(decision.outcome, "non_instructional");
      }
    }
  }
});
