import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { applyEligibleEvidenceToMastery, evidenceItemId, loadAppliedEvidenceIds, masteryApplicationDocId } from "./evidenceMastery";
import { masteryRecordDocId } from "../mastery";
import type { EvidenceBlockEntry, EvidencePacketDraft, MasteryApplicationRecord, MasteryRecord, ObjectiveEvidenceItem } from "../types";

/**
 * NOT the Firebase emulator — there is no emulator available in this
 * sandbox (see the step 6.1/6.2 reports' "not integration-tested"
 * sections). This is a small, deliberately-labeled IN-MEMORY SIMULATION
 * of just enough of the Firestore transaction contract to make the tests
 * below meaningful rather than misleading:
 *
 *  - `runTransaction` re-invokes its callback from scratch if any
 *    document the callback read (via `tx.get`) was written by a
 *    different, already-committed transaction after this one read it —
 *    the same optimistic-concurrency-with-retry behavior real Firestore
 *    documents for `runTransaction`.
 *  - Within one callback, `tx.get`/`tx.set` behave like real
 *    transaction reads/writes: writes are staged, not visible to
 *    anything outside the transaction, until the whole callback
 *    resolves and no conflicting read is detected.
 *
 * It does NOT model real network partitions, real multi-region
 * consistency, real Firestore's actual conflict-detection granularity
 * (field paths vs. whole documents), security rules, or genuine process
 * crashes (a crash is instead simulated explicitly below by simply never
 * calling the second half of a code path — see the "simulated crash"
 * tests). It exists solely to let `applyEligibleEvidenceToMastery`'s real
 * orchestration logic run against something that enforces "all reads
 * before all writes, atomic commit-or-retry" instead of a mock that
 * would silently accept an unsafe two-write sequence.
 */
class FakeFirestore {
  private docs = new Map<string, unknown>();
  private versions = new Map<string, number>();
  private gate: { path: string; blocked: Promise<void>; markReached: () => void } | null = null;

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this, name);
  }

  /** Test-only hook: makes the next transaction that reads `path` pause (after its
   * callback has finished staging reads/writes, before the commit/conflict check)
   * until `unblock()` is called. Lets a test deterministically interleave two
   * "concurrent" transaction attempts without timers. */
  gateNextTransactionOn(path: string): { reached: Promise<void>; unblock: () => void } {
    let unblock!: () => void;
    let markReached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    this.gate = { path, blocked, markReached };
    return { reached, unblock };
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    for (;;) {
      const tx = new FakeTransaction(this);
      const result = await fn(tx);

      if (this.gate && [...tx.readPaths()].some((p) => p === this.gate!.path)) {
        const gate = this.gate;
        this.gate = null;
        gate.markReached();
        await gate.blocked;
      }

      const conflict = [...tx.readVersions()].some(([path, readVersion]) => (this.versions.get(path) ?? 0) !== readVersion);
      if (conflict) continue; // real Firestore: whole callback re-runs

      for (const [path, data] of tx.pendingWrites()) {
        this.docs.set(path, data);
        this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
      }
      return result;
    }
  }

  _readWithVersion(path: string): { data: unknown; version: number } {
    return { data: this.docs.get(path), version: this.versions.get(path) ?? 0 };
  }

  _queryEquals(collectionName: string, field: string, value: unknown): [string, unknown][] {
    const prefix = `${collectionName}/`;
    const results: [string, unknown][] = [];
    for (const [path, data] of this.docs) {
      if (path.startsWith(prefix) && (data as Record<string, unknown>)[field] === value) {
        results.push([path, data]);
      }
    }
    return results;
  }
}

class FakeCollectionReference {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly name: string
  ) {}

  doc(id: string): FakeDocumentReference {
    return new FakeDocumentReference(this.firestore, `${this.name}/${id}`);
  }

  where(field: string, _op: "==", value: unknown): FakeQuery {
    return new FakeQuery(this.firestore, this.name, field, value);
  }
}

class FakeQuery {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly collectionName: string,
    private readonly field: string,
    private readonly value: unknown
  ) {}

  async get(): Promise<{ docs: { id: string; data: () => unknown }[] }> {
    const matches = this.firestore._queryEquals(this.collectionName, this.field, this.value);
    return { docs: matches.map(([path, data]) => ({ id: path.split("/")[1], data: () => data })) };
  }
}

class FakeDocumentReference {
  constructor(
    public readonly firestore: FakeFirestore,
    public readonly path: string
  ) {}

  async get(): Promise<{ exists: boolean; data: () => unknown }> {
    const { data } = this.firestore._readWithVersion(this.path);
    return { exists: data !== undefined, data: () => data };
  }
}

class FakeTransaction {
  private reads = new Map<string, number>();
  private writes = new Map<string, unknown>();

  constructor(private readonly firestore: FakeFirestore) {}

  async get(ref: FakeDocumentReference): Promise<{ exists: boolean; data: () => unknown }> {
    const { data, version } = this.firestore._readWithVersion(ref.path);
    this.reads.set(ref.path, version);
    return { exists: data !== undefined, data: () => data };
  }

  set(ref: FakeDocumentReference, data: unknown): void {
    this.writes.set(ref.path, data);
  }

  readPaths(): string[] {
    return [...this.reads.keys()];
  }

  readVersions(): [string, number][] {
    return [...this.reads.entries()];
  }

  pendingWrites(): [string, unknown][] {
    return [...this.writes.entries()];
  }
}

// --- test fixtures ---

const NOW = Timestamp.fromDate(new Date("2026-09-21T12:00:00Z"));
const FAMILY = "family-1";
const STUDENT = "student-1";
const PACKET_ID = "packet-1";

function evidenceItem(overrides: Partial<ObjectiveEvidenceItem> & Pick<ObjectiveEvidenceItem, "objectiveId" | "outcome">): ObjectiveEvidenceItem {
  return {
    demonstrationType: "verbal_explanation",
    sourceType: "teacher_observation",
    assessmentEligible: true,
    recordedByUid: "teacher-1",
    recordedAt: NOW,
    ...overrides,
  };
}

function block(overrides: Partial<EvidenceBlockEntry> & Pick<EvidenceBlockEntry, "blockId">): EvidenceBlockEntry {
  return {
    subject: "math",
    title: "Weighing produce",
    required: true,
    objectiveIds: [],
    plannedMinutes: 20,
    reportedMinutes: 20,
    approvedMinutes: 20,
    completionState: "completed",
    assessmentEligible: true,
    objectiveEvidence: [],
    sourceQuarterCertificationId: "qc-1",
    sourceWeeklyCertificationId: "wc-1",
    ...overrides,
  };
}

function draft(blocks: EvidenceBlockEntry[]): EvidencePacketDraft {
  return { blocks, dayAssessmentEligible: true, revision: 0, lastEditedByUid: "teacher-1", lastEditedAt: NOW };
}

function fakePacketRef(db: FakeFirestore): DocumentReference {
  // applyEligibleEvidenceToMastery only ever reads `.firestore` off this —
  // the packet doc itself is never read/written inside this function.
  return { firestore: db } as unknown as DocumentReference;
}

async function getMasteryRecord(db: FakeFirestore, objectiveId: string): Promise<MasteryRecord | null> {
  const snap = await new FakeCollectionReference(db, "masteryRecords").doc(masteryRecordDocId(STUDENT, objectiveId)).get();
  return snap.exists ? (snap.data() as MasteryRecord) : null;
}

// --- tests ---

test("first application: a single eligible item creates both the mastery record and its application/traceability record", async () => {
  const db = new FakeFirestore();
  const b = block({ blockId: "b1", objectiveIds: ["obj-1"], objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })] });

  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));

  const record = await getMasteryRecord(db, "obj-1");
  assert.ok(record);
  assert.deepEqual(record!.recentResults, [true]);
  assert.equal(record!.mastered, false); // only 1 result so far

  const applied = await loadAppliedEvidenceIds(db as unknown as Firestore, PACKET_ID);
  assert.deepEqual([...applied], [evidenceItemId("b1", 0)]);

  const appSnap = await new FakeCollectionReference(db, "masteryApplications")
    .doc(masteryApplicationDocId(PACKET_ID, evidenceItemId("b1", 0)))
    .get();
  assert.ok(appSnap.exists);
  const appRecord = appSnap.data() as MasteryApplicationRecord;
  assert.equal(appRecord.packetId, PACKET_ID);
  assert.equal(appRecord.evidenceId, evidenceItemId("b1", 0));
  assert.equal(appRecord.objectiveId, "obj-1");
  assert.equal(appRecord.userId, STUDENT);
  assert.equal(appRecord.familyId, FAMILY);
  assert.equal(appRecord.correct, true);
});

test("normal retry after a fully-successful application is a no-op: the item is never counted twice", async () => {
  const db = new FakeFirestore();
  const b = block({ blockId: "b1", objectiveIds: ["obj-1"], objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })] });

  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));
  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b])); // retry, same draft

  const record = await getMasteryRecord(db, "obj-1");
  assert.deepEqual(record!.recentResults, [true]); // still just one result, not two

  const applied = await loadAppliedEvidenceIds(db as unknown as Firestore, PACKET_ID);
  assert.equal(applied.size, 1);
});

test("simulated crash BEFORE application (nothing written yet): a retry applies it normally, exactly once", async () => {
  // "Before application" means the process died before ever calling
  // applyEligibleEvidenceToMastery for this packet at all — there is
  // nothing to simulate beyond calling it for the first time, which the
  // "first application" test above already covers. This test instead
  // covers the closely related case: a packet with TWO eligible items
  // where the process is simulated to have died after item 1's
  // transaction committed but before item 2's transaction ever started
  // (i.e., mid-loop, not mid-transaction) — the retry must apply only
  // the remaining item.
  const db = new FakeFirestore();
  const b = block({
    blockId: "b1",
    objectiveIds: ["obj-1", "obj-2"],
    objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" }), evidenceItem({ objectiveId: "obj-2", outcome: "incorrect" })],
  });

  // Simulate the crash: manually pre-seed only item 1 as applied, exactly
  // as if a prior real call had completed item 1's transaction and then
  // the process died before starting item 2's.
  const firstApplicationRef = new FakeCollectionReference(db, "masteryApplications").doc(masteryApplicationDocId(PACKET_ID, evidenceItemId("b1", 0)));
  const preSeed: MasteryApplicationRecord = {
    packetId: PACKET_ID,
    evidenceId: evidenceItemId("b1", 0),
    objectiveId: "obj-1",
    subject: "math",
    userId: STUDENT,
    familyId: FAMILY,
    correct: true,
    appliedAt: NOW,
  };
  await db.runTransaction(async (tx) => tx.set(firstApplicationRef, preSeed));
  await db.runTransaction(async (tx) =>
    tx.set(new FakeCollectionReference(db, "masteryRecords").doc(masteryRecordDocId(STUDENT, "obj-1")), {
      familyId: FAMILY,
      userId: STUDENT,
      objectiveId: "obj-1",
      subject: "math",
      skill: "Weighing produce",
      recentResults: [true],
      mastered: false,
      masteredAt: null,
      aced: false,
      acedAt: null,
      updatedAt: NOW,
    })
  );

  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));

  const record1 = await getMasteryRecord(db, "obj-1");
  assert.deepEqual(record1!.recentResults, [true]); // untouched — item 1 was already applied

  const record2 = await getMasteryRecord(db, "obj-2");
  assert.deepEqual(record2!.recentResults, [false]); // item 2 applied by the retry

  const applied = await loadAppliedEvidenceIds(db as unknown as Firestore, PACKET_ID);
  assert.equal(applied.size, 2);
});

test("simulated crash AFTER the mastery effect but before the packet's projection-completion marker: retry does not re-apply", async () => {
  // This is the exact bug step 6.1 had: recordMasteryResult succeeding
  // and the packet-level marker/status update never happening. Simulated
  // here by calling applyEligibleEvidenceToMastery to completion (which
  // now atomically writes the mastery effect AND its own per-item
  // application record together) and then simply never updating the
  // packet's masteryProjection status (that update lives in
  // evidencePackets.ts#runProjections, one layer up, and is irrelevant
  // to this function's own idempotency) — then retrying this function
  // again as reconciliation would.
  const db = new FakeFirestore();
  const b = block({ blockId: "b1", objectiveIds: ["obj-1"], objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })] });

  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));
  // Simulated crash: packet's masteryProjection.status is never set to
  // "applied" (not modeled by this fake at all — deliberately, since
  // that field lives on the real evidencePackets doc, not here). A
  // teacher's retry re-runs this same function regardless.
  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));

  const record = await getMasteryRecord(db, "obj-1");
  assert.deepEqual(record!.recentResults, [true]); // still exactly one application
});

test("concurrent reconciliation attempts on the same evidence item: the item influences mastery at most once", async () => {
  const db = new FakeFirestore();
  const b = block({ blockId: "b1", objectiveIds: ["obj-1"], objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })] });
  const applicationPath = `masteryApplications/${masteryApplicationDocId(PACKET_ID, evidenceItemId("b1", 0))}`;

  const gate = db.gateNextTransactionOn(applicationPath);
  const callA = applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));
  await gate.reached; // A has read the (still-absent) guard doc and is paused before its commit

  const callB = applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));
  await callB; // B runs uncontested end-to-end: applies the item, commits both writes

  gate.unblock(); // release A — its stale read of the guard doc now conflicts and its transaction retries
  await callA; // A's retry observes the guard doc already present and no-ops

  const record = await getMasteryRecord(db, "obj-1");
  assert.deepEqual(record!.recentResults, [true]); // applied exactly once, not twice

  const applied = await loadAppliedEvidenceIds(db as unknown as Firestore, PACKET_ID);
  assert.equal(applied.size, 1);
});

test("two different evidence items for the same objective both legitimately count, in order", async () => {
  const db = new FakeFirestore();
  const b1 = block({ blockId: "b1", objectiveIds: ["obj-1"], objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })] });
  const b2 = block({ blockId: "b2", objectiveIds: ["obj-1"], objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "incorrect" })] });

  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b1, b2]));

  const record = await getMasteryRecord(db, "obj-1");
  assert.deepEqual(record!.recentResults, [true, false]);

  const applied = await loadAppliedEvidenceIds(db as unknown as Firestore, PACKET_ID);
  assert.equal(applied.size, 2);
});

test("2-of-last-3 mastery semantics are unchanged end-to-end through the transactional path", async () => {
  const db = new FakeFirestore();
  const b = block({
    blockId: "b1",
    objectiveIds: ["obj-1"],
    objectiveEvidence: [
      evidenceItem({ objectiveId: "obj-1", outcome: "correct" }),
      evidenceItem({ objectiveId: "obj-1", outcome: "incorrect" }),
      evidenceItem({ objectiveId: "obj-1", outcome: "correct" }),
    ],
  });

  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, draft([b]));

  const record = await getMasteryRecord(db, "obj-1");
  assert.deepEqual(record!.recentResults, [true, false, true]);
  assert.equal(record!.mastered, true); // 2 of the last 3
  assert.equal(record!.aced, false);
});

test("excluded evidence (day-level Do Not Use for Assessment) never enters mastery, even via this transactional path", async () => {
  const db = new FakeFirestore();
  const b = block({ blockId: "b1", objectiveIds: ["obj-1"], objectiveEvidence: [evidenceItem({ objectiveId: "obj-1", outcome: "correct" })] });
  const excludedDraft: EvidencePacketDraft = { ...draft([b]), dayAssessmentEligible: false };

  await applyEligibleEvidenceToMastery(fakePacketRef(db), FAMILY, STUDENT, PACKET_ID, excludedDraft);

  const record = await getMasteryRecord(db, "obj-1");
  assert.equal(record, null);

  const applied = await loadAppliedEvidenceIds(db as unknown as Firestore, PACKET_ID);
  assert.equal(applied.size, 0);
});
