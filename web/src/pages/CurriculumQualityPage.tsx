import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useFamilyQualityIssues, type CurriculumQualityIssueRow } from "../hooks/useCurriculumQualityIssues";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import type { CurriculumQualityIssueCategory, CurriculumQualityIssueSeverity, CurriculumQualityResolutionAction } from "../lib/types";

const createQualityIssueFn = httpsCallable<
  {
    category: string;
    severity: string;
    description: string;
    reference?: { studentId?: string; proposedDayId?: string; blockId?: string; objectiveId?: string };
    contentLocation?: { kidKey: string; quarter: string; week: number };
  },
  { issueId: string }
>(functions, "createQualityIssue");
const quarantineFn = httpsCallable<{ issueId: string }, { issueId: string }>(functions, "quarantineContentVersion");
const releaseFn = httpsCallable<{ issueId: string; note?: string }, { issueId: string }>(functions, "releaseQuarantine");
const resolveFn = httpsCallable<{ issueId: string; action: string; note?: string }, { issueId: string }>(
  functions,
  "resolveQualityIssue"
);
const updateSeverityFn = httpsCallable<{ issueId: string; severity: string }, { issueId: string }>(
  functions,
  "updateQualityIssueSeverity"
);

const CATEGORIES: { value: CurriculumQualityIssueCategory; label: string }[] = [
  { value: "factual_error", label: "Factual error" },
  { value: "unclear_directions", label: "Unclear/misleading directions" },
  { value: "broken_activity", label: "Broken activity" },
  { value: "incorrect_answer_key", label: "Bad answer key" },
  { value: "age_inappropriate", label: "Age-inappropriate material" },
  { value: "unsafe_instruction", label: "Unsafe instruction" },
  { value: "source_problem", label: "Bad/missing source" },
  { value: "broken_resource", label: "Broken printable/resource" },
  { value: "duplicate_or_conflicting", label: "Duplicate/conflicting content" },
  { value: "other", label: "Other curriculum-quality problem" },
];

const SEVERITIES: { value: CurriculumQualityIssueSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const RESOLUTION_ACTIONS: { value: CurriculumQualityResolutionAction; label: string }[] = [
  { value: "corrected_content", label: "Corrected the content" },
  { value: "replaced_resource", label: "Replaced the resource" },
  { value: "clarified_directions", label: "Clarified the directions" },
  { value: "source_verified", label: "Verified the source" },
  { value: "false_alarm", label: "False alarm" },
  { value: "accepted_as_is", label: "Accepted as-is" },
  { value: "other", label: "Other" },
];

const QUARTERS = ["q1", "q2", "q3", "q4"];

function formatTime(ts: { seconds: number } | undefined): string {
  if (!ts) return "";
  return new Date(ts.seconds * 1000).toLocaleString();
}

/**
 * Curriculum Quality Feedback Queue (build-order step 10) — for suspected
 * DEFECTS in curriculum content, deliberately kept as an operational
 * queue, not a content-management system: create, see context, quarantine
 * the exact flagged version, resolve, release. Teacher/admin only — never
 * fetched for a student (see firestore.rules and section 12).
 */
export function CurriculumQualityPage() {
  const { profile } = useAuth();
  const { issues, loading } = useFamilyQualityIssues(profile?.familyId);
  const { students } = useFamilyStudents();
  const [showResolved, setShowResolved] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create-form state
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [severity, setSeverity] = useState<string>("medium");
  const [description, setDescription] = useState("");
  const [studentId, setStudentId] = useState("");
  const [proposedDayId, setProposedDayId] = useState("");
  const [blockId, setBlockId] = useState("");
  const [objectiveId, setObjectiveId] = useState("");
  const [locKidKey, setLocKidKey] = useState("");
  const [locQuarter, setLocQuarter] = useState("q1");
  const [locWeek, setLocWeek] = useState("1");
  const [creating, setCreating] = useState(false);

  const [resolveDrafts, setResolveDrafts] = useState<Record<string, { action: string; note: string }>>({});

  const visible = issues.filter((i) => (showResolved ? true : i.status === "open"));

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const reference: Record<string, string> = {};
      if (studentId) reference.studentId = studentId;
      if (proposedDayId.trim()) reference.proposedDayId = proposedDayId.trim();
      if (blockId.trim()) reference.blockId = blockId.trim();
      if (objectiveId.trim()) reference.objectiveId = objectiveId.trim();

      const contentLocation =
        !proposedDayId.trim() && locKidKey
          ? { kidKey: locKidKey, quarter: locQuarter, week: Number(locWeek) }
          : undefined;

      await createQualityIssueFn({
        category,
        severity,
        description,
        reference: Object.keys(reference).length > 0 ? reference : undefined,
        contentLocation,
      });
      setDescription("");
      setProposedDayId("");
      setBlockId("");
      setObjectiveId("");
      setLocKidKey("");
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that issue.");
    } finally {
      setCreating(false);
    }
  }

  async function quarantine(issueId: string) {
    setBusyId(issueId);
    setError(null);
    try {
      await quarantineFn({ issueId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't quarantine that.");
    } finally {
      setBusyId(null);
    }
  }

  async function release(issueId: string) {
    setBusyId(issueId);
    setError(null);
    try {
      await releaseFn({ issueId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't release that quarantine.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(issueId: string) {
    const draft = resolveDrafts[issueId];
    if (!draft?.action) return;
    setBusyId(issueId);
    setError(null);
    try {
      await resolveFn({ issueId, action: draft.action, note: draft.note || undefined });
      setResolveDrafts((d) => ({ ...d, [issueId]: { action: "", note: "" } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resolve that issue.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeSeverity(issueId: string, newSeverity: string) {
    setBusyId(issueId);
    setError(null);
    try {
      await updateSeverityFn({ issueId, severity: newSeverity });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change severity.");
    } finally {
      setBusyId(null);
    }
  }

  function IssueCard({ issue }: { issue: CurriculumQualityIssueRow }) {
    const draft = resolveDrafts[issue.id] ?? { action: "", note: "" };
    return (
      <div
        className="rounded-lg border p-3 space-y-2 shadow-sm"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {CATEGORIES.find((c) => c.value === issue.category)?.label ?? issue.category}
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {issue.description}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {issue.status === "open" ? (
              <select
                value={issue.severity}
                onChange={(e) => changeSeverity(issue.id, e.target.value)}
                disabled={busyId === issue.id}
                className="text-xs rounded-full border px-2 py-0.5 font-medium"
                style={{
                  borderColor: "var(--border)",
                  background:
                    issue.severity === "critical" || issue.severity === "high" ? "var(--status-critical)" : "var(--surface-2)",
                  color: issue.severity === "critical" || issue.severity === "high" ? "#ffffff" : "var(--text-secondary)",
                }}
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs rounded-full px-2 py-0.5 font-medium" style={{ background: "var(--status-good)", color: "#fff" }}>
                Resolved
              </span>
            )}
          </div>
        </div>

        {(issue.reference.studentId || issue.reference.proposedDayId || issue.reference.blockId || issue.reference.objectiveId || issue.reference.helpRequestId) && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {issue.reference.studentId ? `student ${students.find((s) => s.uid === issue.reference.studentId)?.displayName ?? issue.reference.studentId} · ` : ""}
            {issue.reference.proposedDayId ? `day ${issue.reference.proposedDayId} · ` : ""}
            {issue.reference.blockId ? `block ${issue.reference.blockId} · ` : ""}
            {issue.reference.objectiveId ? `objective ${issue.reference.objectiveId} · ` : ""}
            {issue.reference.helpRequestId ? `from help request ${issue.reference.helpRequestId}` : ""}
          </p>
        )}

        {issue.contentVersion && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Content version: {issue.contentVersion.kidKey} {issue.contentVersion.quarter.toUpperCase()} Week{" "}
            {issue.contentVersion.week} ({issue.contentVersion.contentHash.slice(0, 10)}…)
          </p>
        )}

        {issue.quarantine?.active && (
          <p className="text-xs font-medium rounded-md border px-2 py-1" style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}>
            🔒 Quarantined since {formatTime(issue.quarantine.quarantinedAt)} — this exact version can't feed a new day until released.
          </p>
        )}
        {issue.quarantine && !issue.quarantine.active && issue.quarantine.releasedAt && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Quarantine released {formatTime(issue.quarantine.releasedAt)}
            {issue.quarantine.releaseNote ? ` — ${issue.quarantine.releaseNote}` : ""}
          </p>
        )}

        {issue.status === "resolved" && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Resolved {formatTime(issue.resolvedAt)}: {RESOLUTION_ACTIONS.find((a) => a.value === issue.resolutionAction)?.label ?? issue.resolutionAction}
            {issue.resolutionNote ? ` — ${issue.resolutionNote}` : ""}
          </p>
        )}

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Raised {formatTime(issue.createdAt)}
        </p>

        <div className="flex flex-wrap gap-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
          {issue.contentVersion && !issue.quarantine?.active && (
            <button
              disabled={busyId === issue.id}
              onClick={() => quarantine(issue.id)}
              className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}
            >
              Quarantine this version
            </button>
          )}
          {issue.quarantine?.active && (
            <button
              disabled={busyId === issue.id}
              onClick={() => release(issue.id)}
              className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              Release quarantine
            </button>
          )}
          {issue.status === "open" && (
            <>
              <select
                value={draft.action}
                onChange={(e) => setResolveDrafts((d) => ({ ...d, [issue.id]: { ...draft, action: e.target.value } }))}
                className="rounded-md border px-2 py-1.5 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
              >
                <option value="">Resolve as...</option>
                {RESOLUTION_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <button
                disabled={!draft.action || busyId === issue.id}
                onClick={() => resolve(issue.id)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                style={{ background: "var(--series-1)" }}
              >
                Resolve
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Curriculum Quality
          </h1>
          <div className="flex items-center gap-3">
            <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
              Show resolved
            </label>
            <button
              onClick={() => setShowCreateForm((s) => !s)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: "var(--series-1)" }}
            >
              {showCreateForm ? "Cancel" : "Report an issue"}
            </button>
          </div>
        </div>

        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          For suspected defects in the curriculum itself — a factual error, broken activity, bad answer key, unsafe
          instruction, and so on. Not for a student misunderstanding correct material (that's Ask-a-Teacher) and not
          for missing/uncertified content (that's handled automatically when generating a day).
        </p>

        {error && (
          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        {showCreateForm && (
          <div className="rounded-lg border p-4 space-y-3" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span style={{ color: "var(--text-secondary)" }}>Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span style={{ color: "var(--text-secondary)" }}>Severity</span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm space-y-1">
              <span style={{ color: "var(--text-secondary)" }}>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's wrong, and where?"
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
              />
            </label>

            <label className="block text-sm space-y-1">
              <span style={{ color: "var(--text-secondary)" }}>Student (optional)</span>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
              >
                <option value="">None</option>
                {students.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </label>

            <details className="text-sm">
              <summary style={{ color: "var(--text-secondary)" }}>Pin to an exact day/block/objective (optional)</summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <input
                  value={proposedDayId}
                  onChange={(e) => setProposedDayId(e.target.value)}
                  placeholder="proposedDayId"
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                />
                <input
                  value={blockId}
                  onChange={(e) => setBlockId(e.target.value)}
                  placeholder="blockId"
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                />
                <input
                  value={objectiveId}
                  onChange={(e) => setObjectiveId(e.target.value)}
                  placeholder="objectiveId"
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                />
              </div>
            </details>

            <details className="text-sm">
              <summary style={{ color: "var(--text-secondary)" }}>
                Or reference a specific kid/quarter/week directly (used only when no proposedDayId is given above)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <select
                  value={locKidKey}
                  onChange={(e) => setLocKidKey(e.target.value)}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                >
                  <option value="">No kid</option>
                  <option value="millaray">Millaray</option>
                  <option value="makaio">Makaio</option>
                  <option value="maizley">Maizley</option>
                </select>
                <select
                  value={locQuarter}
                  onChange={(e) => setLocQuarter(e.target.value)}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                >
                  {QUARTERS.map((q) => (
                    <option key={q} value={q}>
                      {q.toUpperCase()}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={locWeek}
                  onChange={(e) => setLocWeek(e.target.value)}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                />
              </div>
            </details>

            <button
              disabled={creating || !description.trim()}
              onClick={handleCreate}
              className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              {creating ? "Submitting..." : "Submit issue"}
            </button>
          </div>
        )}

        {loading && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </p>
        )}
        {!loading && visible.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No {showResolved ? "" : "open "}curriculum quality issues.
          </p>
        )}

        <div className="space-y-2">
          {visible.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
