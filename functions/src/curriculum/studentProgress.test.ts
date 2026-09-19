import { test } from "node:test";
import assert from "node:assert/strict";
import { isStudentBlockProgressState, studentProgressDocId, toPacketCompletionState } from "./studentProgress";

test("studentProgressDocId matches the same (family, student, date) formula as evidencePacketDocId/publishedDayDocId", () => {
  assert.equal(studentProgressDocId("family-1", "student-1", "2026-09-21"), "family-1_student-1_2026-09-21");
});

test("isStudentBlockProgressState accepts exactly the three student-writable states", () => {
  assert.equal(isStudentBlockProgressState("not_started"), true);
  assert.equal(isStudentBlockProgressState("in_progress"), true);
  assert.equal(isStudentBlockProgressState("completed"), true);
});

test("isStudentBlockProgressState rejects \"excused\" — the structural guarantee that a student can never self-excuse", () => {
  assert.equal(isStudentBlockProgressState("excused"), false);
});

test("isStudentBlockProgressState rejects garbage, empty string, and non-string values", () => {
  assert.equal(isStudentBlockProgressState("done"), false);
  assert.equal(isStudentBlockProgressState(""), false);
  assert.equal(isStudentBlockProgressState(undefined), false);
  assert.equal(isStudentBlockProgressState(null), false);
  assert.equal(isStudentBlockProgressState(42), false);
  assert.equal(isStudentBlockProgressState({}), false);
});

test("toPacketCompletionState passes each valid student state through unchanged", () => {
  assert.equal(toPacketCompletionState("not_started"), "not_started");
  assert.equal(toPacketCompletionState("in_progress"), "in_progress");
  assert.equal(toPacketCompletionState("completed"), "completed");
});
