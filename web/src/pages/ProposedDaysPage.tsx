import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { useProposedDays, type ItineraryMode, type ProposedDay } from "../hooks/useProposedDays";
import { AppShell } from "../components/AppShell";

function twoDaysFromToday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

interface GenerateResult {
  studentId: string;
  action: "generated" | "regenerated" | "unchanged" | "blocked" | "skipped";
  proposedDayId: string | null;
  proposalVersion: number | null;
  reason?: string;
}

const generateProposedDaysFn = httpsCallable<
  { familyId: string; date: string; studentIds?: string[]; forceRegenerate?: boolean },
  { results: GenerateResult[] }
>(functions, "generateProposedDays");

const checkStalenessFn = httpsCallable<{ proposedDayId: string }, { isStale: boolean }>(
  functions,
  "checkProposedDayStaleness"
);

const approveProposedDayFn = httpsCallable<
  {
    proposedDayId: string;
    itineraryMode: ItineraryMode;
    jasperMessageOverride?: string;
    titleOverride?: string;
    summaryOverride?: string;
    planTextOverride?: string;
  },
  { proposedDayId: string }
>(functions, "approveProposedDay");

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
}

export function ProposedDaysPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();
  const { proposedDays, loading: loadingProposals } = useProposedDays();

  const [date, setDate] = useState(twoDaysFromToday());
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResults, setGenerateResults] = useState<GenerateResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [staleness, setStaleness] = useState<Record<string, boolean | "checking">>({});
  const [approving, setApproving] = useState(false);

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
    setDraft({
      title: plan.title,
      summary: plan.summary,
      planText: plan.planText,
      jasperMessage: plan.jasperMessage?.edited ?? plan.jasperMessage?.generated ?? "",
      itineraryMode: plan.itineraryMode ?? plan.suggestedItineraryMode ?? "flexible",
    });
    setError(null);
  }

  function cancelReview() {
    setReviewingId(null);
    setDraft(null);
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

  async function handleApprove(plan: ProposedDay) {
    if (!draft) return;
    setApproving(true);
    setError(null);
    try {
      await approveProposedDayFn({
        proposedDayId: plan.id,
        itineraryMode: draft.itineraryMode,
        jasperMessageOverride: plan.jasperMessage && draft.jasperMessage !== plan.jasperMessage.generated ? draft.jasperMessage : undefined,
        titleOverride: draft.title !== plan.title ? draft.title : undefined,
        summaryOverride: draft.summary !== plan.summary ? draft.summary : undefined,
        planTextOverride: draft.planText !== plan.planText ? draft.planText : undefined,
      });
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
            Generates a governed, certified-curriculum-grounded day per student, roughly two days ahead. Every
            proposal stays a draft — nothing reaches a student until you review and approve it here.
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

          {error && (
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
                        {plan.itineraryMode ?? plan.suggestedItineraryMode
                          ? ` · ${plan.itineraryMode ?? plan.suggestedItineraryMode} itinerary${plan.itineraryMode ? "" : " (suggested)"}`
                          : ""}
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
                    </div>
                  </div>

                  {staleState === true && (
                    <p className="text-xs" style={{ color: "var(--status-critical)" }}>
                      The certified content this was generated from has changed since — regenerate before approving.
                    </p>
                  )}

                  <p style={{ color: "var(--text-secondary)" }}>{plan.summary}</p>

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

                      {error && (
                        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                          {error}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(plan)}
                          disabled={approving}
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
                          Cancel
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
