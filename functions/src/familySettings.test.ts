import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import { buildClosingWordsUpdate, sanitizeClosingWords } from "./familySettings";

// --- sanitizeClosingWords ---

test("a normal string is trimmed and accepted", () => {
  assert.equal(sanitizeClosingWords("  Our family's own words.  "), "Our family's own words.");
});

test("an empty string is valid and meaningful ('not set yet'), never coerced into a placeholder", () => {
  assert.equal(sanitizeClosingWords(""), "");
  assert.equal(sanitizeClosingWords("   "), "");
});

test("a non-string value is rejected", () => {
  assert.throws(() => sanitizeClosingWords(123), HttpsError);
  assert.throws(() => sanitizeClosingWords(null), HttpsError);
  assert.throws(() => sanitizeClosingWords(undefined), HttpsError);
});

test("an excessively long value is rejected rather than silently truncated", () => {
  const tooLong = "a".repeat(2001);
  assert.throws(() => sanitizeClosingWords(tooLong), HttpsError);
});

test("exactly the maximum length is accepted", () => {
  const maxLength = "a".repeat(2000);
  assert.equal(sanitizeClosingWords(maxLength), maxLength);
});

test("never invents, defaults, or substitutes any wording — the output is always exactly the trimmed input, for a range of real and edge-case values, never a fixed/fallback string", () => {
  for (const value of ["", "Our own words", "  leading/trailing spaces  ", "Odin, Frigg, and the Kindred watch over us."]) {
    assert.equal(sanitizeClosingWords(value), value.trim());
  }
});

// --- buildClosingWordsUpdate: no unrelated Family fields can be smuggled in ---

test("the update payload contains ONLY closingWords, regardless of the value", () => {
  for (const value of ["", "hello", "a".repeat(500)]) {
    const update = buildClosingWordsUpdate(value);
    assert.deepEqual(Object.keys(update), ["closingWords"]);
    assert.equal(update.closingWords, value);
  }
});

test("the update payload's TYPE (not just this test's runtime check) admits no other keys — buildClosingWordsUpdate's return type is the exact literal { closingWords: string }, so any code path attempting to smuggle another Family field into it would fail to compile, not just fail this assertion", () => {
  const update = buildClosingWordsUpdate("test");
  // A structural echo of the compile-time guarantee: the object has
  // exactly the one key, and nothing about this function's signature or
  // body could ever produce a second one.
  assert.equal(Object.keys(update).length, 1);
});
