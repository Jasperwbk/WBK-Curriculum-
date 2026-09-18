import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { applyMasteryResult, buildNextMasteryRecord, masteryRecordDocId } from "./mastery";
import type { RecordMasteryResultParams } from "./mastery";
import type { MasteryRecord } from "./types";

const NOW = Timestamp.fromDate(new Date("2026-09-21T12:00:00Z"));

function params(overrides: Partial<RecordMasteryResultParams> = {}): RecordMasteryResultParams {
  return {
    familyId: "family-1",
    userId: "student-1",
    objectiveId: "obj-1",
    subject: "math",
    skill: "counting",
    correct: true,
    ...overrides,
  };
}

// --- applyMasteryResult (2-of-last-3 threshold; unchanged by step 6.2) ---

test("fewer than 3 results is never mastered, regardless of correctness", () => {
  assert.equal(applyMasteryResult([], true).mastered, false);
  assert.equal(applyMasteryResult([true], true).mastered, false);
});

test("2 of the last 3 correct is mastered", () => {
  const r = applyMasteryResult([true, false], true);
  assert.deepEqual(r.recentResults, [true, false, true]);
  assert.equal(r.mastered, true);
  assert.equal(r.aced, false);
});

test("only 1 of the last 3 correct is not mastered", () => {
  const r = applyMasteryResult([false, false], true);
  assert.equal(r.mastered, false);
});

test("3 of 3 correct is both mastered and aced", () => {
  const r = applyMasteryResult([true, true], true);
  assert.equal(r.mastered, true);
  assert.equal(r.aced, true);
});

test("the window is capped at the last 3 — older results roll off", () => {
  const r = applyMasteryResult([true, true, true], false);
  assert.deepEqual(r.recentResults, [true, true, false]);
  assert.equal(r.mastered, true); // still 2 of 3
  assert.equal(r.aced, false); // no longer all 3
});

// --- masteryRecordDocId ---

test("masteryRecordDocId is deterministic per (userId, objectiveId)", () => {
  assert.equal(masteryRecordDocId("u1", "o1"), "u1_o1");
  assert.equal(masteryRecordDocId("u1", "o1"), masteryRecordDocId("u1", "o1"));
  assert.notEqual(masteryRecordDocId("u1", "o1"), masteryRecordDocId("u1", "o2"));
});

// --- buildNextMasteryRecord (pure; extracted in step 6.2 so a transactional
// caller can fold a result into a record it already read, without this
// function doing its own independent Firestore read) ---

test("with no existing record, the first result seeds a fresh record — never mastered off one result", () => {
  const record = buildNextMasteryRecord(null, params({ correct: true }), NOW);
  assert.deepEqual(record.recentResults, [true]);
  assert.equal(record.mastered, false);
  assert.equal(record.masteredAt, null);
  assert.equal(record.aced, false);
  assert.equal(record.acedAt, null);
  assert.equal(record.updatedAt, NOW);
});

test("masteredAt is set the instant mastery is first reached and never moves on a later call, even if mastered stays true", () => {
  const firstMasteredAt = Timestamp.fromDate(new Date("2026-09-20T00:00:00Z"));
  const existing: MasteryRecord = {
    familyId: "family-1",
    userId: "student-1",
    objectiveId: "obj-1",
    subject: "math",
    skill: "counting",
    recentResults: [true, false],
    mastered: true,
    masteredAt: firstMasteredAt,
    aced: false,
    acedAt: null,
    updatedAt: firstMasteredAt,
  };
  const record = buildNextMasteryRecord(existing, params({ correct: true }), NOW);
  assert.equal(record.mastered, true);
  assert.equal(record.masteredAt, firstMasteredAt); // unchanged
  assert.equal(record.updatedAt, NOW); // but updatedAt still advances
});

test("acedAt likewise only ever gets set once, the first time all 3 are correct", () => {
  const firstAcedAt = Timestamp.fromDate(new Date("2026-09-20T00:00:00Z"));
  const existing: MasteryRecord = {
    familyId: "family-1",
    userId: "student-1",
    objectiveId: "obj-1",
    subject: "math",
    skill: "counting",
    recentResults: [true, true, true],
    mastered: true,
    masteredAt: firstAcedAt,
    aced: true,
    acedAt: firstAcedAt,
    updatedAt: firstAcedAt,
  };
  const record = buildNextMasteryRecord(existing, params({ correct: true }), NOW);
  assert.equal(record.aced, true);
  assert.equal(record.acedAt, firstAcedAt); // unchanged even though still aced
});

test("familyId/subject/skill are taken from the params passed in, not the prior record — a caller can correct metadata on a later call", () => {
  const existing: MasteryRecord = {
    familyId: "family-1",
    userId: "student-1",
    objectiveId: "obj-1",
    subject: "math",
    skill: "old-label",
    recentResults: [true],
    mastered: false,
    masteredAt: null,
    aced: false,
    acedAt: null,
    updatedAt: NOW,
  };
  const record = buildNextMasteryRecord(existing, params({ skill: "new-label", correct: false }), NOW);
  assert.equal(record.skill, "new-label");
  assert.deepEqual(record.recentResults, [true, false]);
});
