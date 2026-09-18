import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot } from "firebase/firestore";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { useProposedDays } from "../hooks/useProposedDays";
import {
  useEvidencePackets,
  type EvidenceBlockEntry,
  type EvidenceDemonstrationType,
  type EvidenceOutcome,
  type EvidencePacket,
  type EvidenceSourceType,
  type ObjectiveEvidenceItem,
  type PacketBlockCompletionState,
} from "../hooks/useEvidencePackets";
import { AppShell } from "../components/AppShell";

const COMPLETION_LABEL: Record<PacketBlockCompletionState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  excused: "Excused",
};

const DEMONSTRATION_OPTIONS: EvidenceDemonstrationType[] = [
  "written_response",
  "verbal_explanation",
  "tap_show_me",
  "matching",
  "pointing",
  "sorting",
  "naming",
  "physical_demonstration",
  "guided_play",
  "teacher_observation_only",
];
const OUTCOME_OPTIONS: EvidenceOutcome[] = ["correct", "incorrect", "partial", "observed_strong", "observed_weak", "not_applicable"];
const SOURCE_TYPE_OPTIONS: EvidenceSourceType[] = [
  "teacher_observation",
  "student_response",
  "worksheet",
  "app_activity",
  "field_activity",
  "project",
  "assessment",
];

const openEvidencePacketFn = httpsCallable<
  { familyId: string; studentId: string; date: string },
  { packetId: string; created: boolean }
>(functions, "openEvidencePacket");

const saveEvidencePacketDraftFn = httpsCallable<
  {
    packetId: string;
    expectedRevision: number;
    dayAssessmentEligible: boolean;
    dayNotes?: string;
    blocks: unknown;
  },
  { revision: number }
>(functions, "saveEvidencePacketDraft");

const approveEvidencePacketFn = httpsCallable<{ packetId: string; expectedRevision: number }, { packetId: string }>(
  functions,
  "approveEvidencePacket"
);

const approveEvidencePacketsFn = httpsCallable<
  { packets: { packetId: string; expectedRevision: number }[] },
  { results: { packetId: string; ok: boolean; error?: string }[] }
>(functions, "approveEvidencePackets");

const reconcileEvidencePacketFn = httpsCallable<
  { packetId: string },
  { packetId: string; hoursStatus: string; masteryStatus: string }
>(functions, "reconcileEvidencePacket");

const recordHistoricalFigureRetentionFn = httpsCallable<
  { packetId: string; retentionObservation: number; teacherNote?: string },
  { packetId: string }
>(functions, "recordHistoricalFigureRetention");

const updateFamilyClosingWordsFn = httpsCallable<{ closingWords: string }, { closingWords: string }>(
  functions,
  "updateFamilyClosingWords"
);

/** The fields a teacher actually edits for one evidence item — recordedByUid/recordedAt are always server-set (evidenceValidation.ts ignores whatever the client sends for them), so the local editing state never needs to fabricate them. */
type EvidenceDraftItem = Omit<ObjectiveEvidenceItem, "recordedByUid" | "recordedAt">;

interface DraftEdit {
  reportedMinutes: number | null;
  completionState: PacketBlockCompletionState;
  excusedReason: string;
  notes: string;
  assessmentEligible: boolean;
  objectiveEvidence: EvidenceDraftItem[];
}

interface OpenPacketState {
  packetId: string;
  revision: number;
  dayAssessmentEligible: boolean;
  dayNotes: string;
  blocks: EvidenceBlockEntry[]; // authoritative order/identity
  edits: Record<string, DraftEdit>; // keyed by blockId
}

function toEdit(block: EvidenceBlockEntry): DraftEdit {
  return {
    reportedMinutes: block.reportedMinutes,
    completionState: block.completionState,
    excusedReason: block.excusedReason ?? "",
    notes: block.notes ?? "",
    assessmentEligible: block.assessmentEligible,
    objectiveEvidence: block.objectiveEvidence.map((item) => ({
      objectiveId: item.objectiveId,
      demonstrationType: item.demonstrationType,
      outcome: item.outcome,
      sourceType: item.sourceType,
      assessmentEligible: item.assessmentEligible,
      ...(item.observation ? { observation: item.observation } : {}),
      ...(item.artifacts ? { artifacts: item.artifacts } : {}),
    })),
  };
}

export function EndOfDayClosingPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();
  const { proposedDays } = useProposedDays();
  const { packets, loading: loadingPackets } = useEvidencePackets();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<OpenPacketState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [approving, setApproving] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchApproving, setBatchApproving] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [newEvidenceByBlock, setNewEvidenceByBlock] = useState<Record<string, Partial<EvidenceDraftItem>>>({});
  const [retentionDrafts, setRetentionDrafts] = useState<Record<string, { score: string; note: string }>>({});
  const [savingRetentionId, setSavingRetentionId] = useState<string | null>(null);

  function studentName(uid: string): string {
    return students.find((s) => s.uid === uid)?.displayName ?? "Unknown student";
  }

  const approvedPlansForDate = useMemo(
    () => proposedDays.filter((p) => p.date === date && p.status === "approved"),
    [proposedDays, date]
  );
  const packetsForDate = useMemo(() => packets.filter((p) => p.date === date), [packets, date]);

  async function handleOpen(studentId: string) {
    if (!profile) return;
    setBusyStudentId(studentId);
    setError(null);
    try {
      const res = await openEvidencePacketFn({ familyId: profile.familyId, studentId, date });
      const packet = packets.find((p) => p.id === res.data.packetId);
      beginEditing(res.data.packetId, packet?.draft.blocks, packet?.draft.dayAssessmentEligible, packet?.draft.dayNotes, packet?.draft.revision);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't open closeout for this student. Try again.");
    } finally {
      setBusyStudentId(null);
    }
  }

  function beginEditing(
    packetId: string,
    blocks: EvidenceBlockEntry[] | undefined,
    dayAssessmentEligible: boolean | undefined,
    dayNotes: string | undefined,
    revision: number | undefined
  ) {
    const realBlocks = blocks ?? packets.find((p) => p.id === packetId)?.draft.blocks ?? [];
    const edits: Record<string, DraftEdit> = {};
    for (const block of realBlocks) edits[block.blockId] = toEdit(block);
    setEditing({
      packetId,
      revision: revision ?? packets.find((p) => p.id === packetId)?.draft.revision ?? 0,
      dayAssessmentEligible: dayAssessmentEligible ?? packets.find((p) => p.id === packetId)?.draft.dayAssessmentEligible ?? true,
      dayNotes: dayNotes ?? packets.find((p) => p.id === packetId)?.draft.dayNotes ?? "",
      blocks: realBlocks,
      edits,
    });
    setSavedNotice(false);
    setError(null);
  }

  function startReview(packetId: string) {
    const packet = packets.find((p) => p.id === packetId);
    if (!packet) return;
    beginEditing(packetId, packet.draft.blocks, packet.draft.dayAssessmentEligible, packet.draft.dayNotes, packet.draft.revision);
  }

  function updateEdit(blockId: string, patch: Partial<DraftEdit>) {
    setEditing((cur) => {
      if (!cur) return cur;
      return { ...cur, edits: { ...cur.edits, [blockId]: { ...cur.edits[blockId], ...patch } } };
    });
  }

  function addEvidence(blockId: string) {
    const draft = newEvidenceByBlock[blockId];
    if (!draft) return;
    if (!draft.objectiveId || !draft.demonstrationType || !draft.outcome || !draft.sourceType) {
      setError("Objective, demonstration type, outcome, and source are all required to add evidence.");
      return;
    }
    const item: EvidenceDraftItem = {
      objectiveId: draft.objectiveId,
      demonstrationType: draft.demonstrationType,
      outcome: draft.outcome,
      sourceType: draft.sourceType,
      assessmentEligible: draft.assessmentEligible ?? true,
      ...(draft.observation ? { observation: draft.observation } : {}),
    };
    updateEdit(blockId, { objectiveEvidence: [...(editing?.edits[blockId].objectiveEvidence ?? []), item] });
    setNewEvidenceByBlock((cur) => ({ ...cur, [blockId]: {} }));
    setError(null);
  }

  function removeEvidence(blockId: string, index: number) {
    const current = editing?.edits[blockId]?.objectiveEvidence ?? [];
    updateEdit(blockId, { objectiveEvidence: current.filter((_, i) => i !== index) });
  }

  async function handleSaveDraft() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      const blocksPayload = editing.blocks.map((block) => {
        const edit = editing.edits[block.blockId];
        return {
          blockId: block.blockId,
          reportedMinutes: edit.reportedMinutes,
          completionState: edit.completionState,
          ...(edit.completionState === "excused" ? { excusedReason: edit.excusedReason } : {}),
          ...(edit.notes.trim() ? { notes: edit.notes.trim() } : {}),
          assessmentEligible: edit.assessmentEligible,
          objectiveEvidence: edit.objectiveEvidence.map((e) => ({
            objectiveId: e.objectiveId,
            demonstrationType: e.demonstrationType,
            outcome: e.outcome,
            sourceType: e.sourceType,
            assessmentEligible: e.assessmentEligible,
            ...(e.observation ? { observation: e.observation } : {}),
          })),
        };
      });
      const res = await saveEvidencePacketDraftFn({
        packetId: editing.packetId,
        expectedRevision: editing.revision,
        dayAssessmentEligible: editing.dayAssessmentEligible,
        ...(editing.dayNotes.trim() ? { dayNotes: editing.dayNotes.trim() } : {}),
        blocks: blocksPayload,
      });
      setEditing({ ...editing, revision: res.data.revision });
      setSavedNotice(true);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't save this closeout. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!editing) return;
    setApproving(true);
    setError(null);
    try {
      await approveEvidencePacketFn({ packetId: editing.packetId, expectedRevision: editing.revision });
      setEditing(null);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't approve this closeout. Try again.");
    } finally {
      setApproving(false);
    }
  }

  function toggleBatch(packetId: string) {
    setSelectedForBatch((cur) => {
      const next = new Set(cur);
      if (next.has(packetId)) next.delete(packetId);
      else next.add(packetId);
      return next;
    });
  }

  async function handleReconcile(packetId: string) {
    setReconcilingId(packetId);
    setError(null);
    try {
      await reconcileEvidencePacketFn({ packetId });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't retry this packet's processing. Try again.");
    } finally {
      setReconcilingId(null);
    }
  }

  async function handleSaveRetention(packetId: string) {
    const draft = retentionDrafts[packetId];
    const score = Number(draft?.score);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      setError("Retention observation must be a whole number from 1 to 10.");
      return;
    }
    setSavingRetentionId(packetId);
    setError(null);
    try {
      await recordHistoricalFigureRetentionFn({
        packetId,
        retentionObservation: score,
        ...(draft?.note?.trim() ? { teacherNote: draft.note.trim() } : {}),
      });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't save the retention observation. Try again.");
    } finally {
      setSavingRetentionId(null);
    }
  }

  async function handleBatchApprove() {
    setBatchApproving(true);
    setError(null);
    try {
      const targets = packetsForDate.filter((p) => selectedForBatch.has(p.id) && p.status === "open");
      const res = await approveEvidencePacketsFn({
        packets: targets.map((p) => ({ packetId: p.id, expectedRevision: p.draft.revision })),
      });
      const failures = res.data.results.filter((r) => !r.ok);
      if (failures.length > 0) {
        setError(`${failures.length} packet(s) could not be approved: ${failures.map((f) => `${studentName(packetsForDate.find((p) => p.id === f.packetId)?.studentId ?? "")} (${f.error})`).join("; ")}`);
      }
      setSelectedForBatch(new Set());
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't approve the selected packets. Try again.");
    } finally {
      setBatchApproving(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            End-of-day closeout
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            An approved proposed day is a plan — it only becomes official history once you close it out here. Record
            what actually happened, then approve: only approved minutes count toward official hours, and only
            approved, eligible evidence updates mastery.
          </p>
        </div>

        {profile && <FamilyClosingWordsEditor familyId={profile.familyId} />}

        <label className="block text-sm space-y-1">
          <span style={{ color: "var(--text-secondary)" }}>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setEditing(null);
              setSelectedForBatch(new Set());
            }}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
          />
        </label>

        {error && (
          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        {selectedForBatch.size > 0 && (
          <button
            type="button"
            onClick={handleBatchApprove}
            disabled={batchApproving}
            className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--series-1)" }}
          >
            {batchApproving ? "Approving..." : `Approve ${selectedForBatch.size} selected`}
          </button>
        )}

        {!loadingStudents && !loadingPackets && approvedPlansForDate.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No approved proposed days for this date yet.
          </p>
        )}

        <ul className="space-y-3">
          {approvedPlansForDate.map((plan) => {
            const packet = packetsForDate.find((p) => p.studentId === plan.studentId);
            const isEditing = editing?.packetId === packet?.id;
            return (
              <li
                key={plan.id}
                className="rounded-lg border p-3 text-sm space-y-2 shadow-sm"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {packet && packet.status === "open" && (
                      <input
                        type="checkbox"
                        checked={selectedForBatch.has(packet.id)}
                        onChange={() => toggleBatch(packet.id)}
                        aria-label={`Select ${studentName(plan.studentId)} for batch approval`}
                      />
                    )}
                    <span style={{ color: "var(--text-primary)" }}>{studentName(plan.studentId)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {!packet
                        ? "Not opened yet"
                        : packet.status === "approved"
                          ? "Approved — historical record"
                          : `Open — draft rev. ${packet.draft.revision}`}
                    </span>
                    {!packet && (
                      <button
                        onClick={() => handleOpen(plan.studentId)}
                        disabled={busyStudentId === plan.studentId}
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
                      >
                        {busyStudentId === plan.studentId ? "Opening..." : "Open closeout"}
                      </button>
                    )}
                    {packet && packet.status === "open" && !isEditing && (
                      <button
                        onClick={() => startReview(packet.id)}
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>

                {packet && packet.status === "approved" && (
                  <ApprovedSummary
                    packet={packet}
                    reconciling={reconcilingId === packet.id}
                    onReconcile={() => handleReconcile(packet.id)}
                  />
                )}

                {isEditing && editing && (
                  <div className="space-y-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    {editing.blocks.map((block) => {
                      const edit = editing.edits[block.blockId];
                      return (
                        <div
                          key={block.blockId}
                          className="rounded-md border px-3 py-2 space-y-2"
                          style={{ borderColor: "var(--border)", background: "var(--page)" }}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                              {block.title}
                            </span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {block.subject} · {block.required ? "required" : "enrichment"} · planned {block.plannedMinutes}m
                              {block.carryForward && ` · carried forward from ${block.carryForward.fromDate}`}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-3 items-center">
                            <label className="text-xs space-y-1">
                              <span className="block" style={{ color: "var(--text-secondary)" }}>
                                Completion
                              </span>
                              <select
                                value={edit.completionState}
                                onChange={(e) => updateEdit(block.blockId, { completionState: e.target.value as PacketBlockCompletionState })}
                                className="rounded-md border px-2 py-1 text-xs"
                                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--surface-1)" }}
                              >
                                {(Object.keys(COMPLETION_LABEL) as PacketBlockCompletionState[]).map((state) => (
                                  <option key={state} value={state}>
                                    {COMPLETION_LABEL[state]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs space-y-1">
                              <span className="block" style={{ color: "var(--text-secondary)" }}>
                                Actual minutes
                              </span>
                              <input
                                type="number"
                                min={0}
                                value={edit.reportedMinutes ?? ""}
                                onChange={(e) =>
                                  updateEdit(block.blockId, {
                                    reportedMinutes: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                className="w-20 rounded-md border px-2 py-1 text-xs"
                                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--surface-1)" }}
                              />
                            </label>
                            <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                              <input
                                type="checkbox"
                                checked={edit.assessmentEligible}
                                onChange={(e) => updateEdit(block.blockId, { assessmentEligible: e.target.checked })}
                              />
                              Use for assessment
                            </label>
                          </div>

                          {edit.completionState === "excused" && (
                            <input
                              type="text"
                              placeholder="Why is this excused? (required)"
                              value={edit.excusedReason}
                              onChange={(e) => updateEdit(block.blockId, { excusedReason: e.target.value })}
                              className="w-full rounded-md border px-2 py-1 text-xs"
                              style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--surface-1)" }}
                            />
                          )}

                          <textarea
                            placeholder="Notes / observations"
                            value={edit.notes}
                            onChange={(e) => updateEdit(block.blockId, { notes: e.target.value })}
                            rows={2}
                            className="w-full rounded-md border px-2 py-1 text-xs"
                            style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--surface-1)" }}
                          />

                          {edit.objectiveEvidence.length > 0 && (
                            <ul className="space-y-1">
                              {edit.objectiveEvidence.map((item, i) => (
                                <li key={i} className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                                  <span>
                                    {item.objectiveId} · {item.demonstrationType} · {item.outcome}
                                    {!item.assessmentEligible && " · excluded from assessment"}
                                  </span>
                                  <button
                                    onClick={() => removeEvidence(block.blockId, i)}
                                    className="underline"
                                    style={{ color: "var(--status-critical)" }}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {block.objectiveIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-end border-t pt-2" style={{ borderColor: "var(--border)" }}>
                              <select
                                value={newEvidenceByBlock[block.blockId]?.objectiveId ?? ""}
                                onChange={(e) =>
                                  setNewEvidenceByBlock((cur) => ({
                                    ...cur,
                                    [block.blockId]: { ...cur[block.blockId], objectiveId: e.target.value },
                                  }))
                                }
                                className="rounded-md border px-1.5 py-1 text-xs"
                                style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                              >
                                <option value="">Objective...</option>
                                {block.objectiveIds.map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={newEvidenceByBlock[block.blockId]?.demonstrationType ?? ""}
                                onChange={(e) =>
                                  setNewEvidenceByBlock((cur) => ({
                                    ...cur,
                                    [block.blockId]: { ...cur[block.blockId], demonstrationType: e.target.value as EvidenceDemonstrationType },
                                  }))
                                }
                                className="rounded-md border px-1.5 py-1 text-xs"
                                style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                              >
                                <option value="">Demonstration...</option>
                                {DEMONSTRATION_OPTIONS.map((d) => (
                                  <option key={d} value={d}>
                                    {d.replace(/_/g, " ")}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={newEvidenceByBlock[block.blockId]?.outcome ?? ""}
                                onChange={(e) =>
                                  setNewEvidenceByBlock((cur) => ({
                                    ...cur,
                                    [block.blockId]: { ...cur[block.blockId], outcome: e.target.value as EvidenceOutcome },
                                  }))
                                }
                                className="rounded-md border px-1.5 py-1 text-xs"
                                style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                              >
                                <option value="">Outcome...</option>
                                {OUTCOME_OPTIONS.map((o) => (
                                  <option key={o} value={o}>
                                    {o.replace(/_/g, " ")}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={newEvidenceByBlock[block.blockId]?.sourceType ?? ""}
                                onChange={(e) =>
                                  setNewEvidenceByBlock((cur) => ({
                                    ...cur,
                                    [block.blockId]: { ...cur[block.blockId], sourceType: e.target.value as EvidenceSourceType },
                                  }))
                                }
                                className="rounded-md border px-1.5 py-1 text-xs"
                                style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                              >
                                <option value="">Source...</option>
                                {SOURCE_TYPE_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s.replace(/_/g, " ")}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="Observation (optional)"
                                value={newEvidenceByBlock[block.blockId]?.observation ?? ""}
                                onChange={(e) =>
                                  setNewEvidenceByBlock((cur) => ({
                                    ...cur,
                                    [block.blockId]: { ...cur[block.blockId], observation: e.target.value },
                                  }))
                                }
                                className="rounded-md border px-1.5 py-1 text-xs flex-1 min-w-[8rem]"
                                style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                              />
                              <button
                                type="button"
                                onClick={() => addEvidence(block.blockId)}
                                className="rounded-md border px-2 py-1 text-xs font-medium"
                                style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
                              >
                                Add evidence
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {packet?.historicalFigureClosing && (
                      <div
                        className="rounded-md border px-3 py-2 space-y-2"
                        style={{ borderColor: "var(--border)", background: "var(--page)" }}
                      >
                        <div className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                          Closing: Historical Figure Coloring — {packet.historicalFigureClosing.figureId}
                        </div>
                        {packet.historicalFigureClosing.completed ? (
                          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            Retention observation recorded: {packet.historicalFigureClosing.retentionObservation}/10
                            {packet.historicalFigureClosing.teacherNote ? ` — "${packet.historicalFigureClosing.teacherNote}"` : ""}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              Retention (1-10):
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={retentionDrafts[packet.id]?.score ?? ""}
                              onChange={(e) =>
                                setRetentionDrafts((cur) => ({
                                  ...cur,
                                  [packet.id]: { ...cur[packet.id], score: e.target.value },
                                }))
                              }
                              className="w-16 rounded-md border px-1.5 py-1 text-xs"
                              style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                            />
                            <input
                              type="text"
                              placeholder="Note (optional)"
                              value={retentionDrafts[packet.id]?.note ?? ""}
                              onChange={(e) =>
                                setRetentionDrafts((cur) => ({
                                  ...cur,
                                  [packet.id]: { ...cur[packet.id], note: e.target.value },
                                }))
                              }
                              className="rounded-md border px-1.5 py-1 text-xs flex-1 min-w-[8rem]"
                              style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRetention(packet.id)}
                              disabled={savingRetentionId === packet.id}
                              className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60"
                              style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
                            >
                              {savingRetentionId === packet.id ? "Saving..." : "Save"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={editing.dayAssessmentEligible}
                        onChange={(e) => setEditing({ ...editing, dayAssessmentEligible: e.target.checked })}
                      />
                      Use this whole day for assessment
                    </label>
                    <textarea
                      placeholder="Day notes"
                      value={editing.dayNotes}
                      onChange={(e) => setEditing({ ...editing, dayNotes: e.target.value })}
                      rows={2}
                      className="w-full rounded-md border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                    />

                    {savedNotice && (
                      <p className="text-xs" style={{ color: "var(--status-good)" }}>
                        Draft saved (revision {editing.revision}). Safe to close and come back.
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveDraft}
                        disabled={saving || approving}
                        className="flex-1 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-60"
                        style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
                      >
                        {saving ? "Saving..." : "Save draft"}
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={approving || saving}
                        className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                        style={{ background: "var(--series-1)" }}
                      >
                        {approving ? "Approving..." : "Approve & post hours"}
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-md border px-3 py-2 text-sm font-medium"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}

/**
 * The last step of the locked closing sequence (build-order step 8) —
 * the family's own Kindred motto/prayer/closing words. Deliberately
 * NEVER given a default or AI-generated placeholder (the exact wording
 * was never supplied and must not be invented — see types.ts's
 * Family.closingWords doc comment).
 *
 * Reads the family doc directly (still allowed — `families/{familyId}`
 * stays client-readable), but SAVES via the dedicated
 * updateFamilyClosingWordsFn callable rather than a direct client write
 * (build-order step 8.1 correction): the family doc's write rule is now
 * `allow write: if false`, matching every other Cloud-Function-only
 * collection, and this callable only ever touches `closingWords` on the
 * caller's own family — never any other Family field, never a
 * client-supplied familyId.
 */
function FamilyClosingWordsEditor({ familyId }: { familyId: string }) {
  const [closingWords, setClosingWords] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [editing, setEditingWords] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "families", familyId), (snap) => {
      const value = (snap.data()?.closingWords as string | undefined) ?? "";
      setClosingWords(value);
      setDraft(value);
    });
  }, [familyId]);

  async function save() {
    setSaving(true);
    try {
      await updateFamilyClosingWordsFn({ closingWords: draft.trim() });
      setEditingWords(false);
    } finally {
      setSaving(false);
    }
  }

  if (closingWords === undefined) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm space-y-1"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Closing: family words
        </span>
        {!editing && (
          <button onClick={() => setEditingWords(true)} className="text-xs font-medium" style={{ color: "var(--series-1)" }}>
            {closingWords ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Your family's own closing motto/prayer — never invented for you."
            className="w-full rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60"
              style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setDraft(closingWords);
                setEditingWords(false);
              }}
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p style={{ color: closingWords ? "var(--text-secondary)" : "var(--text-muted)" }}>
          {closingWords || "Not set yet — add your family's own closing words whenever you're ready."}
        </p>
      )}
    </div>
  );
}

const PROJECTION_LABEL: Record<string, string> = {
  applied: "Applied",
  pending: "Pending",
  failed: "Needs retry",
};

/**
 * Read-only summary for an already-approved (historical, immutable)
 * packet — carry-forward candidates, posted hours, and (build-order step
 * 6.1) each downstream projection's actual state, with a Retry action
 * when either hasn't landed yet. The approval itself never changes here;
 * only the two independent hours/mastery projections do.
 */
function ApprovedSummary({
  packet,
  reconciling,
  onReconcile,
}: {
  packet: EvidencePacket;
  reconciling: boolean;
  onReconcile: () => void;
}) {
  const blocks = packet.draft.blocks;
  const outstanding = blocks.filter(
    (b) => b.required && (b.completionState === "not_started" || b.completionState === "in_progress")
  );
  const totalApproved = blocks.reduce((sum, b) => sum + (b.approvedMinutes ?? 0), 0);
  const hoursOk = packet.hoursProjection.status === "applied";
  const masteryOk = packet.masteryProjection.status === "applied";
  return (
    <div className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
      <div>{totalApproved} approved instructional minutes posted.</div>
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ color: hoursOk ? "var(--status-good)" : "var(--status-critical)" }}>
          Hours: {PROJECTION_LABEL[packet.hoursProjection.status]}
        </span>
        <span style={{ color: masteryOk ? "var(--status-good)" : "var(--status-critical)" }}>
          Mastery: {PROJECTION_LABEL[packet.masteryProjection.status]}
        </span>
        {(!hoursOk || !masteryOk) && (
          <button
            type="button"
            onClick={onReconcile}
            disabled={reconciling}
            className="rounded-md border px-2 py-0.5 text-xs font-medium disabled:opacity-60"
            style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
          >
            {reconciling ? "Retrying..." : "Retry"}
          </button>
        )}
      </div>
      {packet.hoursProjection.error && (
        <div style={{ color: "var(--status-critical)" }}>Hours error: {packet.hoursProjection.error}</div>
      )}
      {packet.masteryProjection.error && (
        <div style={{ color: "var(--status-critical)" }}>Mastery error: {packet.masteryProjection.error}</div>
      )}
      {outstanding.length > 0 && (
        <div style={{ color: "var(--status-critical)" }}>
          Carry-forward candidates for the next proposal: {outstanding.map((b) => b.title).join(", ")}
        </div>
      )}
    </div>
  );
}
