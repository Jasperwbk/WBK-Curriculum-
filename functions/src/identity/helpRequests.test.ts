import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpsError } from "firebase-functions/v2/https";
import {
  defaultEscalationLevel,
  isHelpRequestCategory,
  resolveHelpRequestMessage,
  sanitizeHelpRequestReference,
} from "./helpRequests";

// --- Valid categories (spec section 7's exact controlled list) ---

test("exactly the 6 locked categories are valid, nothing more, nothing fewer", () => {
  const categories = [
    "dont_understand",
    "directions_unclear",
    "think_content_is_wrong",
    "cannot_complete",
    "need_teacher",
    "other",
  ];
  for (const c of categories) assert.equal(isHelpRequestCategory(c), true);
});

test("an unrecognized category string is rejected", () => {
  for (const notACategory of ["dontUnderstand", "DONT_UNDERSTAND", "help", "", "curriculum_is_wrong"]) {
    assert.equal(isHelpRequestCategory(notACategory), false);
  }
});

test("isHelpRequestCategory rejects non-string values without throwing", () => {
  for (const value of [null, undefined, 123, {}, ["dont_understand"]]) {
    assert.equal(isHelpRequestCategory(value), false);
  }
});

// --- No-typing-required flow (Maizely-compatible) ---

test("an absent message falls back to a fixed, non-empty canonical label for every category — the no-typing flow is representable for ANY student, not just Maizely", () => {
  for (const category of [
    "dont_understand",
    "directions_unclear",
    "think_content_is_wrong",
    "cannot_complete",
    "need_teacher",
    "other",
  ] as const) {
    const message = resolveHelpRequestMessage(category, undefined);
    assert.ok(message.length > 0);
  }
});

test("a blank/whitespace-only message also falls back to the canonical label, not an empty string", () => {
  assert.equal(resolveHelpRequestMessage("dont_understand", "   "), "I don't understand this.");
  assert.equal(resolveHelpRequestMessage("need_teacher", ""), "I need my teacher.");
});

test("a real typed message is kept verbatim (trimmed), not replaced by the canonical label", () => {
  assert.equal(resolveHelpRequestMessage("other", "  the fraction part is confusing  "), "the fraction part is confusing");
});

test("an excessively long message is rejected rather than silently truncated", () => {
  assert.throws(() => resolveHelpRequestMessage("other", "a".repeat(501)), HttpsError);
});

test("canonical messages are never AI-authored — they are the same fixed literal every time for a given category", () => {
  assert.equal(resolveHelpRequestMessage("dont_understand", undefined), resolveHelpRequestMessage("dont_understand", null));
  assert.equal(resolveHelpRequestMessage("dont_understand", undefined), resolveHelpRequestMessage("dont_understand", 42));
});

// --- Stable day/block/objective references, never duplicated content ---

test("sanitizeHelpRequestReference keeps only proposedDayId/blockId/objectiveId", () => {
  const ref = sanitizeHelpRequestReference({
    proposedDayId: "day-1",
    blockId: "b2",
    objectiveId: "MA-03",
    curriculumText: "the whole lesson, verbatim — must never be copied in",
    subject: "math",
  });
  assert.deepEqual(ref, { proposedDayId: "day-1", blockId: "b2", objectiveId: "MA-03" });
});

test("sanitizeHelpRequestReference drops empty-string reference fields", () => {
  assert.deepEqual(sanitizeHelpRequestReference({ proposedDayId: "", blockId: "b1" }), { blockId: "b1" });
});

test("sanitizeHelpRequestReference never throws on garbage input — null, a string, a number, an array", () => {
  for (const garbage of [null, undefined, "not an object", 42, ["day-1"]]) {
    assert.deepEqual(sanitizeHelpRequestReference(garbage), {});
  }
});

test("sanitizeHelpRequestReference returns {} when no reference is given — a general 'I need my teacher' with nothing to point to is valid", () => {
  assert.deepEqual(sanitizeHelpRequestReference({}), {});
});

// --- Default routing to Celeste (never AI-guessed, never category-based) ---

test("defaultEscalationLevel is always 'celeste' — the one routing decision made at creation, independent of category", () => {
  assert.equal(defaultEscalationLevel(), "celeste");
});

// --- Request never becomes an AI tutoring response ---

test("this module never imports an AI/model SDK — Ask-a-Teacher is deterministic structured routing only, per spec section 9", () => {
  // Runs from the compiled lib/identity/helpRequests.test.js — resolve
  // back to the TypeScript source (rootDir src -> outDir lib, structure
  // preserved) rather than inspecting the compiled output.
  const sourcePath = join(__dirname, "..", "..", "src", "identity", "helpRequests.ts");
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /anthropic/i);
  assert.doesNotMatch(source, /claude/i);
  assert.doesNotMatch(source, /openai/i);
});
