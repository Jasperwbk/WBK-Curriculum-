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

// --- 1. Legacy / pre-governance mode ---

test("legacy: grounds on content when it exists, regardless of any certification status", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "legacy",
    quarterStatus: "neverCertified",
    hasContent: true,
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decision.outcome, "legacy_compatibility");
  assert.equal(decision.allow, true);
});

test("legacy: allows generation with no content too (nothing to ground on, nothing to block)", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "legacy",
    quarterStatus: "neverCertified",
    hasContent: false,
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decision.outcome, "legacy_compatibility");
  assert.equal(decision.allow, true);
});

test("legacy: never blocks even if the quarter/week statuses would otherwise be stale", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "legacy",
    quarterStatus: "stale",
    hasContent: true,
    familyWeekStatus: "stale",
    staleKidKeys: ["makaio"],
  });
  assert.equal(decision.outcome, "legacy_compatibility");
  assert.equal(decision.allow, true);
});

// --- Missing certification alone must NOT imply legacy mode ---

test("missing certification records do not, by themselves, put the gate in legacy mode — governed + never-certified still blocks", () => {
  // This is the exact bug step 3.2 corrects: a quarter having no
  // certification record at all used to be read as \"nothing to enforce
  // yet\" regardless of governance state. Now governanceMode is the only
  // thing that can produce legacy-style permissiveness — the absence of a
  // certification record, on its own, must still block under \"governed\".
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "neverCertified",
    hasContent: true,
    familyWeekStatus: "neverCertified",
  });
  assert.notEqual(decision.outcome, "legacy_compatibility");
  assert.equal(decision.outcome, "blocked_quarter");
  assert.equal(decision.allow, false);
});

// --- 2/3/4. Governed quarter states ---

test("governed + never-certified quarter blocks with a 'quarter certification is required' message, before even checking the week", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "neverCertified",
    hasContent: false, // even with no content, the quarter check fires first
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decision.outcome, "blocked_quarter");
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /not been certified yet/);
    assert.match(decision.reason, /Quarter certification is required/);
  }
});

test("governed + stale quarter blocks with a re-certify message", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "stale",
    hasContent: true,
    familyWeekStatus: "certified",
  });
  assert.equal(decision.outcome, "blocked_quarter");
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /stale/);
    assert.match(decision.reason, /Re-certify the quarter/);
  }
});

test("governed + certified quarter proceeds to the weekly gate — certified week allows", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "certified",
    hasContent: true,
    familyWeekStatus: "certified",
  });
  assert.equal(decision.outcome, "certified");
  assert.equal(decision.allow, true);
});

test("governed + certified quarter, but content missing for this kid -> blocked_missing ('Curriculum Assistance Required')", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "certified",
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

test("governed + certified quarter, content exists, but the family week was never certified -> blocked_week", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "certified",
    hasContent: true,
    familyWeekStatus: "neverCertified",
  });
  assert.equal(decision.outcome, "blocked_week");
  assert.equal(decision.allow, false);
  if (!decision.allow) assert.match(decision.reason, /has not been certified yet/);
});

test("governed + certified quarter, content exists, family week is stale -> blocked_week, naming the culprit(s)", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "certified",
    hasContent: true,
    familyWeekStatus: "stale",
    staleKidKeys: ["makaio", "maizley"],
  });
  assert.equal(decision.outcome, "blocked_week");
  assert.equal(decision.allow, false);
  if (!decision.allow) {
    assert.match(decision.reason, /stale/);
    assert.match(decision.reason, /Makaio/);
    assert.match(decision.reason, /Maizley/);
  }
});

// --- 6/7. Explicit designations ---

test("D: an explicit alternativePackage designation allows generation even under governed mode with a never-certified quarter", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "neverCertified",
    hasContent: false,
    familyWeekStatus: "neverCertified",
    dayDesignation: { type: "alternativePackage", description: "Field trip to the science museum." },
  });
  assert.equal(decision.outcome, "alternative_package");
  assert.equal(decision.allow, true);
  if (decision.allow) assert.equal(decision.description, "Field trip to the science museum.");
});

test("E: an explicit nonInstructional designation allows generation even under governed mode", () => {
  const decision = evaluateCertificationGate({
    ...BASE,
    governanceMode: "governed",
    quarterStatus: "stale",
    hasContent: false,
    familyWeekStatus: "neverCertified",
    dayDesignation: { type: "nonInstructional", description: "Approved family PTO day." },
  });
  assert.equal(decision.outcome, "non_instructional");
  assert.equal(decision.allow, true);
  if (decision.allow) assert.equal(decision.description, "Approved family PTO day.");
});

test("D/E are never reachable without an explicit dayDesignation input, across every governance/status combination", () => {
  const modes: ("legacy" | "governed")[] = ["legacy", "governed"];
  const statuses: ("certified" | "stale" | "neverCertified")[] = ["certified", "stale", "neverCertified"];
  const boolCombos = [true, false];
  for (const governanceMode of modes) {
    for (const quarterStatus of statuses) {
      for (const hasContent of boolCombos) {
        for (const familyWeekStatus of statuses) {
          const decision = evaluateCertificationGate({
            ...BASE,
            governanceMode,
            quarterStatus,
            hasContent,
            familyWeekStatus,
            dayDesignation: null, // explicitly absent in every combination
          });
          assert.notEqual(decision.outcome, "alternative_package");
          assert.notEqual(decision.outcome, "non_instructional");
        }
      }
    }
  }
});
