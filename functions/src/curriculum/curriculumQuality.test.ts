import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Runs from the compiled lib/curriculum/curriculumQuality.test.js — resolve
// back to the TypeScript source (rootDir src -> outDir lib, structure
// preserved) rather than inspecting compiled output.
const FUNCTIONS_SRC = join(__dirname, "..", "..", "src");
const FEATURE_SOURCE_FILES = [
  join(FUNCTIONS_SRC, "curriculum", "curriculumQuality.ts"),
  join(FUNCTIONS_SRC, "curriculumQualityIssues.ts"),
];
import {
  CURRICULUM_QUALITY_ISSUE_CATEGORIES,
  CURRICULUM_QUALITY_ISSUE_SEVERITIES,
  CURRICULUM_QUALITY_RESOLUTION_ACTIONS,
  isCurriculumQualityIssueCategory,
  isCurriculumQualityIssueSeverity,
  isCurriculumQualityResolutionAction,
} from "./curriculumQuality";

// --- Controlled issue categories (spec section 4) ---

test("exactly the 10 locked categories are valid, nothing more, nothing fewer", () => {
  assert.deepEqual(
    [...CURRICULUM_QUALITY_ISSUE_CATEGORIES].sort(),
    [
      "age_inappropriate",
      "broken_activity",
      "broken_resource",
      "duplicate_or_conflicting",
      "factual_error",
      "incorrect_answer_key",
      "other",
      "source_problem",
      "unclear_directions",
      "unsafe_instruction",
    ]
  );
  for (const c of CURRICULUM_QUALITY_ISSUE_CATEGORIES) assert.equal(isCurriculumQualityIssueCategory(c), true);
});

test("an unrecognized category is rejected", () => {
  for (const notACategory of ["factualError", "FACTUAL_ERROR", "", "wrong_answer", null, undefined, 5]) {
    assert.equal(isCurriculumQualityIssueCategory(notACategory), false);
  }
});

// --- Controlled severity values (spec section 5) ---

test("exactly the 4 locked severities are valid", () => {
  assert.deepEqual([...CURRICULUM_QUALITY_ISSUE_SEVERITIES].sort(), ["critical", "high", "low", "medium"]);
  for (const s of CURRICULUM_QUALITY_ISSUE_SEVERITIES) assert.equal(isCurriculumQualityIssueSeverity(s), true);
});

test("an unrecognized severity is rejected", () => {
  for (const notASeverity of ["urgent", "LOW", "", null, undefined, 1]) {
    assert.equal(isCurriculumQualityIssueSeverity(notASeverity), false);
  }
});

// --- Controlled resolution actions (spec section 9) ---

test("exactly the 7 locked resolution actions are valid", () => {
  assert.deepEqual(
    [...CURRICULUM_QUALITY_RESOLUTION_ACTIONS].sort(),
    [
      "accepted_as_is",
      "clarified_directions",
      "corrected_content",
      "false_alarm",
      "other",
      "replaced_resource",
      "source_verified",
    ]
  );
  for (const a of CURRICULUM_QUALITY_RESOLUTION_ACTIONS) assert.equal(isCurriculumQualityResolutionAction(a), true);
});

test("an unrecognized resolution action is rejected", () => {
  for (const notAnAction of ["fixed", "", null, undefined]) {
    assert.equal(isCurriculumQualityResolutionAction(notAnAction), false);
  }
});

// --- No AI anywhere in this feature (spec section 5: "Do NOT let AI
// silently assign authoritative severity" — this module goes further:
// there is no AI/model call anywhere in the whole Quality Feedback Queue
// feature, category/severity/resolution are always an explicit teacher
// choice this module only validates). ---

test("no AI/model SDK reference anywhere in the Quality Feedback Queue feature's source (curriculumQuality.ts, curriculumQualityIssues.ts) — severity/category are always an explicit, validated teacher choice, never AI-assigned", () => {
  for (const file of FEATURE_SOURCE_FILES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /anthropic/i, `${file} must not reference an AI SDK`);
    assert.doesNotMatch(source, /claude/i, `${file} must not reference an AI SDK`);
    assert.doesNotMatch(source, /openai/i, `${file} must not reference an AI SDK`);
  }
});

// --- Approved-history invariants (spec section 13), proven structurally:
// this feature's source code never writes to (or reads for mutation) any
// of the historical/evidence collections it must never touch. A defect
// found later must never rewrite an approved historical day, erase
// approved hours, or erase evidence — the strongest proof available
// without a live Firestore is that the code literally never references
// those collections at all. ---

test("the Quality Feedback Queue never touches logs, evidencePackets, or masteryRecords — approved hours/evidence are structurally unreachable from this feature", () => {
  for (const file of FEATURE_SOURCE_FILES) {
    const source = readFileSync(file, "utf8");
    for (const forbiddenCollection of ["collection(\"logs\")", "collection(\"evidencePackets\")", "collection(\"masteryRecords\")"]) {
      assert.ok(!source.includes(forbiddenCollection), `${file} must never touch ${forbiddenCollection}`);
    }
  }
});

test("the Quality Feedback Queue only ever READS proposedDays/familyWeeklyCertifications, never writes to them — an approved day/certification is never mutated by a later-discovered defect", () => {
  for (const file of FEATURE_SOURCE_FILES) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /collection\("proposedDays"\)[^;]*\.(update|set|delete)\(/,
      `${file} must never write to proposedDays`
    );
    assert.doesNotMatch(
      source,
      /collection\("familyWeeklyCertifications"\)[^;]*\.(update|set|delete)\(/,
      `${file} must never write to familyWeeklyCertifications`
    );
  }
});
