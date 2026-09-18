import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import {
  useProposedDays,
  type HistoricalFigureClosingPlan,
  type InstructionalStage,
  type ItineraryMode,
  type LearningBlock,
  type ProposedDay,
} from "../hooks/useProposedDays";
import { AppShell } from "../components/AppShell";

const STAGE_LABEL: Record<InstructionalStage, string> = {
  warmup_retrieval: "Warm-up / retrieval",
  teach_model: "Teach / model",
  guided_practice: "Guided practice",
  independent_practice: "Independent practice",
  assessment_check: "Assessment / check",
  application_transfer: "Application / transfer",
  reflection_metacognition: "Reflection",
  enrichment: "Enrichment",
};

interface GenerateResult {
  studentId: string;
  action: "generated" | "regenerated" | "unchanged" | "blocked" | "skipped";
  proposedDayId: string | null;
  proposalVersion: number | null;
  reason?: string;
}

const getGenerationTargetDateFn = httpsCallable<{ familyId: string }, { date: string }>(
  functions,
  "getGenerationTargetDate"
);

const generateProposedDaysFn = httpsCallable<
  { familyId: string; date: string; studentIds?: string[]; forceRegenerate?: boolean },
  { results: GenerateResult[] }
>(functions, "generateProposedDays");

const checkStalenessFn = httpsCallable<{ proposedDayId: string }, { isStale: boolean }>(
  functions,
  "checkProposedDayStaleness"
);

const saveProposedDayDraftFn = httpsCallable<
  {
    proposedDayId: string;
    expectedRevision: number;
    title: string;
    summary: string;
    planText: string;
    jasperMessageEdited?: string;
    itineraryMode: ItineraryMode;
  },
  { revision: number }
>(functions, "saveProposedDayDraft");

const approveProposedDayFn = httpsCallable<{ proposedDayId: string; expectedRevision: number }, { proposedDayId: string }>(
  functions,
  "approveProposedDay"
);

const ACTION_LABEL: Record<GenerateResult["action"], string> = {
  generated: "Generated",
  regenerated: "Regenerated (previous version preserved)",
  unchanged: "Already up to date — not regenerated",
  blocked: "Already approved — not touched",
  skipped: "Could not generate",
};

interface ReviewDraft {
  title: string;
  summary: string;
  planText: string;
  jasperMessage: string;
  itineraryMode: ItineraryMode;
  revision: number;
}

function draftFromPlan(plan: ProposedDay): ReviewDraft {
  return {
    title: plan.draft.title,
    summary: plan.draft.summary,
    planText: plan.draft.planText,
    jasperMessage: plan.draft.jasperMessageEdited ?? plan.jasperMessage?.generated ?? "",
    itineraryMode: plan.draft.itineraryMode,
    revision: plan.draft.revision,
  };
}

export function ProposedDaysPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();
  const { proposedDays, loading: loadingProposals } = useProposedDays();

  const [date, setDate] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResults, setGenerateResults] = useState<GenerateResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [viewingBlocksId, setViewingBlocksId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [staleness, setStaleness] = useState<Record<string, boolean | "checking">>({});
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [approving, setApproving] = useState(false);

  // Prefill the date with the family's actual next instructional-day
  // target (weekday/DayDesignation-aware) rather than a naive +2-calendar-
  // days client guess — the teacher can still change it manually.
  useEffect(() => {
    if (!profile) return;
    getGenerationTargetDateFn({ familyId: profile.familyId })
      .then((res) => setDate(res.data.date))
      .catch(() => {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 2);
        setDate(fallback.toISOString().slice(0, 10));
      });
  }, [profile]);

  function toggleStudent(uid: string) {
    setSelectedStudentIds((current) => (current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid]));
  }

  function studentName(uid: string): string {
    return students.find((s) => s.uid === uid)?.displayName ?? "Unknown student";
  }

  async function handleGenerate() {
    if (!profile) return;
    setGenerating(true);
    setError(null);
    setGenerateResults([]);
    try {
      const res = await generateProposedDaysFn({
        familyId: profile.familyId,
        date,
        studentIds: selectedStudentIds.length > 0 ? selectedStudentIds : undefined,
        forceRegenerate,
      });
      setGenerateResults(res.data.results);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't generate proposed days. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  function startReview(plan: ProposedDay) {
    setReviewingId(plan.id);
    setDraft(draftFromPlan(plan));
    setError(null);
    setSavedNotice(false);
  }

  function cancelReview() {
    setReviewingId(null);
    setDraft(null);
    setSavedNotice(false);
  }

  async function checkFreshness(proposedDayId: string) {
    setStaleness((s) => ({ ...s, [proposedDayId]: "checking" }));
    try {
      const res = await checkStalenessFn({ proposedDayId });
      setStaleness((s) => ({ ...s, [proposedDayId]: res.data.isStale }));
    } catch {
      setStaleness((s) => {
        const next = { ...s };
        delete next[proposedDayId];
        return next;
      });
    }
  }

  async function handleSaveDraft(plan: ProposedDay) {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      const res = await saveProposedDayDraftFn({
        proposedDayId: plan.id,
        expectedRevision: draft.revision,
        title: draft.title,
        summary: draft.summary,
        planText: draft.planText,
        jasperMessageEdited: draft.jasperMessage !== (plan.jasperMessage?.generated ?? "") ? draft.jasperMessage : undefined,
        itineraryMode: draft.itineraryMode,
      });
      setDraft({ ...draft, revision: res.data.revision });
      setSavedNotice(true);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't save this draft. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(plan: ProposedDay) {
    if (!draft) return;
    setApproving(true);
    setError(null);
    try {
      await approveProposedDayFn({ proposedDayId: plan.id, expectedRevision: draft.revision });
      cancelReview();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't approve this day. Try again.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Two-day-ahead proposed days
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Generates a governed, certified-curriculum-grounded day per student, roughly two instructional days
            ahead. Every proposal stays a draft — nothing reaches a student until you review and approve it here.
            Review edits save as a draft, so it's safe to close the app and come back later.
          </p>
        </div>

        <div className="rounded-xl border p-4 space-y-4 shadow-sm" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
          <label className="block text-sm space-y-1">
            <span style={{ color: "var(--text-secondary)" }}>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
            />
          </label>

          {!loadingStudents && students.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Students (none selected = everyone)
              </span>
              <div className="flex flex-wrap gap-2">
                {students.map((s) => (
                  <label
                    key={s.uid}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    <input type="checkbox" checked={selectedStudentIds.includes(s.uid)} onChange={() => toggleStudent(s.uid)} />
                    {s.displayName}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={forceRegenerate} onChange={(e) => setForceRegenerate(e.target.checked)} />
            Force regeneration even if nothing certified has changed (an approved day is still never touched)
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--series-1)" }}
          >
            {generating ? "Generating..." : "Generate proposed days"}
          </button>

          {error && !reviewingId && (
            <p className="text-sm" style={{ color: "var(--status-critical)" }}>
              {error}
            </p>
          )}

          {generateResults.length > 0 && (
            <ul className="text-sm space-y-1 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              {generateResults.map((r) => (
                <li key={r.studentId}>
                  <strong style={{ color: "var(--text-primary)" }}>{studentName(r.studentId)}:</strong>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {ACTION_LABEL[r.action]}
                    {r.reason ? ` — ${r.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Proposals
          </h2>
          {loadingProposals && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Loading...
            </p>
          )}
          {!loadingProposals && proposedDays.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No proposed days yet.
            </p>
          )}
          <ul className="space-y-2">
            {proposedDays.map((plan) => {
              const isReviewing = reviewingId === plan.id;
              const staleState = staleness[plan.id];
              return (
                <li
                  key={plan.id}
                  className="rounded-lg border p-3 text-sm space-y-2 shadow-sm"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div style={{ color: "var(--text-primary)" }}>
                        {studentName(plan.studentId)} — {plan.date}
                        {plan.proposalVersion > 1 && (
                          <span style={{ color: "var(--text-muted)" }}> (v{plan.proposalVersion})</span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {plan.status === "approved" ? "Approved & published" : "Pending review"}
                        {" · "}
                        {plan.dayType === "ordinary" ? "Ordinary school day" : plan.dayType === "alternativePackage" ? "Alternative package" : "Non-instructional day"}
                        {plan.status === "approved" && plan.itineraryMode
                          ? ` · ${plan.itineraryMode} itinerary`
                          : ` · ${plan.draft.itineraryMode} itinerary (draft)`}
                        {!plan.status || plan.status === "proposed" ? ` · draft rev. ${plan.draft.revision}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {plan.status === "proposed" && !isReviewing && (
                        <>
                          <button
                            onClick={() => checkFreshness(plan.id)}
                            className="rounded-md border px-2 py-1 text-xs font-medium"
                            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                          >
                            {staleState === "checking" ? "Checking..." : "Check freshness"}
                          </button>
                          <button
                            onClick={() => startReview(plan)}
                            className="rounded-md border px-2 py-1 text-xs font-medium"
                            style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
                          >
                            Review
                          </button>
                        </>
                      )}
                      {plan.draft.learningBlocks.length > 0 && (
                        <button
                          onClick={() => setViewingBlocksId((id) => (id === plan.id ? null : plan.id))}
                          className="rounded-md border px-2 py-1 text-xs font-medium"
                          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                        >
                          {viewingBlocksId === plan.id
                            ? "Hide blocks"
                            : `${plan.draft.learningBlocks.length} block${plan.draft.learningBlocks.length === 1 ? "" : "s"}`}
                        </button>
                      )}
                    </div>
                  </div>

                  {staleState === true && (
                    <p className="text-xs" style={{ color: "var(--status-critical)" }}>
                      The certified content this was generated from has changed since — regenerate before approving.
                    </p>
                  )}

                  {/* draft.summary is the "current" summary from generation through approval and beyond —
                      unlike the frozen top-level plan.summary/plan.title, it reflects whatever a teacher
                      actually approved (see types.ts's ProposedDayDraft doc comment). */}
                  <p style={{ color: "var(--text-secondary)" }}>{plan.draft.summary}</p>

                  {viewingBlocksId === plan.id && (
                    <>
                      <BlockList blocks={[...plan.draft.learningBlocks].sort((a, b) => a.order - b.order)} />
                      <HistoricalFigureClosingSummary closing={plan.draft.historicalFigureClosing} />
                    </>
                  )}

                  {isReviewing && draft && (
                    <div className="space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                      <label className="block text-sm space-y-1">
                        <span style={{ color: "var(--text-secondary)" }}>Title</span>
                        <input
                          type="text"
                          value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                        />
                      </label>
                      <label className="block text-sm space-y-1">
                        <span style={{ color: "var(--text-secondary)" }}>Summary</span>
                        <input
                          type="text"
                          value={draft.summary}
                          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                        />
                      </label>
                      {plan.dayType !== "nonInstructional" && (
                        <label className="block text-sm space-y-1">
                          <span style={{ color: "var(--text-secondary)" }}>Jasper's Morning Message</span>
                          <textarea
                            value={draft.jasperMessage}
                            onChange={(e) => setDraft({ ...draft, jasperMessage: e.target.value })}
                            rows={4}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                          />
                          {plan.jasperMessage && (
                            <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                              Original generated message is preserved even if you edit this.
                            </span>
                          )}
                        </label>
                      )}
                      <label className="block text-sm space-y-1">
                        <span style={{ color: "var(--text-secondary)" }}>Plan</span>
                        <textarea
                          value={draft.planText}
                          onChange={(e) => setDraft({ ...draft, planText: e.target.value })}
                          rows={8}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          Itinerary mode
                        </span>
                        <div className="flex gap-2">
                          {(["strict", "flexible"] as const).map((mode) => (
                            <label
                              key={mode}
                              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
                              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                            >
                              <input
                                type="radio"
                                name={`itinerary-${plan.id}`}
                                checked={draft.itineraryMode === mode}
                                onChange={() => setDraft({ ...draft, itineraryMode: mode })}
                              />
                              {mode === "strict" ? "Strict (approved order enforced)" : "Flexible (student chooses eligible blocks)"}
                            </label>
                          ))}
                        </div>
                      </div>

                      {savedNotice && (
                        <p className="text-xs" style={{ color: "var(--status-good)" }}>
                          Draft saved (revision {draft.revision}). Safe to close and come back — your edits are kept.
                        </p>
                      )}
                      {error && (
                        <div className="space-y-1">
                          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                            {error}
                          </p>
                          {error.toLowerCase().includes("revision") && (
                            <button
                              type="button"
                              onClick={() => startReview(plan)}
                              className="text-xs font-medium underline"
                              style={{ color: "var(--series-1)" }}
                            >
                              Load the latest saved draft
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveDraft(plan)}
                          disabled={saving || approving}
                          className="flex-1 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-60"
                          style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
                        >
                          {saving ? "Saving..." : "Save draft"}
                        </button>
                        <button
                          onClick={() => handleApprove(plan)}
                          disabled={approving || saving}
                          className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                          style={{ background: "var(--series-1)" }}
                        >
                          {approving ? "Approving..." : "Approve & publish"}
                        </button>
                        <button
                          onClick={cancelReview}
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
      </div>
    </AppShell>
  );
}

/**
 * Read-only structured-block inspection (build-order step 5, requirement
 * 12 — "at minimum make visible: block title, subject, objective(s),
 * instructional stage, estimated time, required/enrichment, dependencies/
 * locked status"). Deliberately inspect-only, not an editing surface —
 * block content isn't yet editable via saveProposedDayDraft in this step.
 */
function BlockList({ blocks }: { blocks: LearningBlock[] }) {
  const titleById = new Map(blocks.map((b) => [b.blockId, b.title]));
  return (
    <ul className="space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
      {blocks.map((block) => (
        <li
          key={block.blockId}
          className="rounded-md border px-3 py-2 text-xs space-y-1"
          style={{ borderColor: "var(--border)", background: "var(--page)" }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {block.title}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {block.subject} · {STAGE_LABEL[block.stage]} · {block.estimatedMinutes} min ·{" "}
              {block.required ? "required" : "enrichment"}
            </span>
          </div>
          {block.objectiveIds.length > 0 && (
            <div style={{ color: "var(--text-secondary)" }}>Objectives: {block.objectiveIds.join(", ")}</div>
          )}
          {block.dependsOn.length > 0 && (
            <div style={{ color: "var(--text-secondary)" }}>
              Depends on: {block.dependsOn.map((d) => titleById.get(d.blockId) ?? d.blockId).join(", ")}
            </div>
          )}
          {block.teacherLocked && (
            <div style={{ color: "var(--status-critical)" }}>Locked by teacher</div>
          )}
          {block.carryForward && (
            <div style={{ color: "var(--text-muted)" }}>
              Carried forward from {block.carryForward.fromDate}: {block.carryForward.reason}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Read-only review of the day's Historical Figure Closing (build-order
 * step 8, requirement: "Teacher must see the selected person and
 * generated contextual material before publication"). Purely informational
 * here — the figure/prompts are frozen at generation and not yet
 * independently editable via saveProposedDayDraft, same status as
 * BlockList's structured blocks above. `null` for a nonInstructional day.
 */
function HistoricalFigureClosingSummary({ closing }: { closing: HistoricalFigureClosingPlan | null }) {
  if (!closing) return null;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs space-y-1"
      style={{ borderColor: "var(--border)", background: "var(--page)" }}
    >
      <div className="font-medium" style={{ color: "var(--text-primary)" }}>
        Closing: Historical Figure Coloring
      </div>
      <div style={{ color: "var(--text-secondary)" }}>Figure: {closing.figureId}</div>
      <div style={{ color: "var(--text-muted)" }}>{closing.selectionReason}</div>
      <div style={{ color: "var(--text-muted)" }}>Art complexity: {closing.artComplexityBand}</div>
      <div style={{ color: "var(--text-secondary)" }}>Show and tell: {closing.showAndTellPrompt}</div>
      <div style={{ color: "var(--text-secondary)" }}>Recall question: {closing.recallQuestion}</div>
    </div>
  );
}
