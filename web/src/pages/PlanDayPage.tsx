import { useEffect, useState, type FormEvent } from "react";
import { httpsCallable } from "firebase/functions";
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { useDayPlans, type DayPlan } from "../hooks/useDayPlans";
import { AppShell } from "../components/AppShell";
import { DiagnosticDetails } from "../components/DiagnosticDetails";
import { extractDiagnosticDetail, type DiagnosticDetail } from "../lib/diagnostics";

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface GeneratePlanResponse {
  title: string;
  summary: string;
  planText: string;
}

const generatePlanFn = httpsCallable<
  { date: string; studentNames: string[]; studentIds: string[]; prompt: string },
  GeneratePlanResponse
>(functions, "generatePlan");

// Connects "Plan a day" to the Student Today system (build-order step
// 11.1) — Save & Publish always wrote to the legacy `dayPlans` collection
// (still does, below, as the teacher's own authoring/history record), but
// nothing ever fed the canonical `publishedDays` collection Student Today
// actually reads. publishDayPlanFn is that missing connection; it takes
// the already-reviewed title/summary/planText and writes the same
// student-safe projection shape the governed Two-day-ahead pipeline uses,
// through curriculum/publishedDay.ts's buildFreeformPublishedDayProjection
// — one canonical publication path regardless of which tool produced it.
const publishDayPlanFn = httpsCallable<
  { dayPlanId: string; date: string; studentIds: string[]; title: string; summary: string; planText: string },
  { date: string; studentIds: string[] }
>(functions, "publishDayPlan");

const unpublishDayPlanFn = httpsCallable<{ dayPlanId: string }, { deletedCount: number }>(
  functions,
  "unpublishDayPlan"
);

export function PlanDayPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();
  const { plans, loading: loadingPlans } = useDayPlans();

  const [date, setDate] = useState(tomorrowIso());
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [planText, setPlanText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generateDiagnostic, setGenerateDiagnostic] = useState<DiagnosticDetail | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [publishDiagnostic, setPublishDiagnostic] = useState<DiagnosticDetail | null>(null);

  // Default to every student in the family once they've loaded.
  useEffect(() => {
    setSelectedStudentIds((current) => (current.length > 0 ? current : students.map((s) => s.uid)));
  }, [students]);

  function toggleStudent(uid: string) {
    setSelectedStudentIds((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid]
    );
  }

  function resetForm() {
    setEditingId(null);
    setDate(tomorrowIso());
    setSelectedStudentIds(students.map((s) => s.uid));
    setPrompt("");
    setTitle("");
    setSummary("");
    setPlanText("");
    setPublishNotice(null);
    setPublishDiagnostic(null);
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError("Describe the day first.");
      return;
    }
    setGenerating(true);
    setError(null);
    setGenerateDiagnostic(null);
    try {
      const selected = students.filter((s) => selectedStudentIds.includes(s.uid));
      const names = selected.map((s) => s.displayName);
      const ids = selected.map((s) => s.uid);
      const res = await generatePlanFn({ date, studentNames: names, studentIds: ids, prompt });
      setTitle(res.data.title);
      setSummary(res.data.summary);
      setPlanText(res.data.planText);
    } catch (err) {
      // Surfaces a specific backend message when there is one (e.g. the
      // certification gate explaining exactly which kid/week needs
      // certifying) instead of always showing a generic failure. The
      // normal message stays generic for an AI-provider failure — the
      // expandable diagnostic panel below carries the specific code (e.g.
      // PLAN-GEN-AUTH), so a bad ANTHROPIC_API_KEY no longer looks
      // identical to every other failure.
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't generate a plan. Try again.");
      setGenerateDiagnostic(extractDiagnosticDetail(err, "plan-generation"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile || selectedStudentIds.length === 0 || !title.trim() || !planText.trim()) {
      setError("Generate (or write) a plan and pick at least one student first.");
      return;
    }
    setSaving(true);
    setError(null);
    setPublishNotice(null);
    setPublishDiagnostic(null);
    try {
      const data = {
        familyId: profile.familyId,
        createdBy: profile.displayName,
        date: Timestamp.fromDate(new Date(date)),
        studentIds: selectedStudentIds,
        prompt,
        title,
        summary,
        planText,
      };
      const dayPlanId = editingId ?? (await addDoc(collection(db, "dayPlans"), data)).id;
      if (editingId) {
        await updateDoc(doc(db, "dayPlans", editingId), data);
      }

      // The actual connection to Student Today (build-order step 11.1):
      // a failure here does NOT undo the dayPlans save above — the
      // teacher's plan is safely saved either way — but it does mean
      // students won't see it yet, so it's surfaced as its own distinct
      // notice rather than silently swallowed.
      try {
        const selectedNames = students
          .filter((s) => selectedStudentIds.includes(s.uid))
          .map((s) => s.displayName);
        await publishDayPlanFn({ dayPlanId, date, studentIds: selectedStudentIds, title, summary, planText });
        setPublishNotice(`✅ Saved and published to ${selectedNames.join(", ") || "the selected student(s)"}.`);
      } catch (err) {
        setPublishDiagnostic(extractDiagnosticDetail(err, "plan-publication"));
        const message = err instanceof Error && err.message ? err.message : null;
        setError(
          `Saved, but couldn't publish to students: ${message ?? "unknown error"}. Your plan wasn't lost — try saving again.`
        );
      }

      if (!editingId) {
        resetForm();
      }
    } catch {
      setError("Couldn't save that plan. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(plan: DayPlan) {
    setEditingId(plan.id);
    setDate(plan.date.toDate().toISOString().slice(0, 10));
    setSelectedStudentIds(plan.studentIds);
    setPrompt(plan.prompt);
    setTitle(plan.title);
    setSummary(plan.summary);
    setPlanText(plan.planText);
    setPublishNotice(null);
    setPublishDiagnostic(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(planId: string) {
    if (!confirm("Delete this plan? This can't be undone.")) return;
    try {
      // Best-effort: an unpublish failure here shouldn't block the
      // teacher from deleting their own record — worst case a stale
      // published day needs a manual follow-up, which is far less bad
      // than a broken Delete button in a family-test build.
      await unpublishDayPlanFn({ dayPlanId: planId });
    } catch (err) {
      console.error("unpublishDayPlan failed during delete:", err);
    }
    await deleteDoc(doc(db, "dayPlans", planId));
    if (editingId === planId) resetForm();
  }

  return (
    <AppShell>
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {editingId ? "Edit day plan" : "Plan a day"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Describe an upcoming day — a regular school day, or something special like a field
            trip — and get a draft plan to review before it's saved. A student only sees a plan
            once its date arrives, never a day early.
          </p>
        </div>

        <form
          onSubmit={handleSave}
          className="rounded-xl border p-4 space-y-4 shadow-sm"
          style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
        >
          <label className="block text-sm space-y-1">
            <span style={{ color: "var(--text-secondary)" }}>Date</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
            />
          </label>

          {!loadingStudents && students.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Applies to
              </span>
              <div className="flex flex-wrap gap-2">
                {students.map((s) => (
                  <label
                    key={s.uid}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(s.uid)}
                      onChange={() => toggleStudent(s.uid)}
                    />
                    {s.displayName}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="block text-sm space-y-1">
            <span style={{ color: "var(--text-secondary)" }}>Describe the day</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={
                'e.g. "Friday we\'re camping at Bennett Spring for the day. Light on the education, ' +
                'more on fun — a couple nature activities would be great."'
              }
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
            />
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
          >
            {generating ? "Generating..." : "Generate plan"}
          </button>

          {(title || planText) && (
            <div className="space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <label className="block text-sm space-y-1">
                <span style={{ color: "var(--text-secondary)" }}>Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                />
              </label>
              <label className="block text-sm space-y-1">
                <span style={{ color: "var(--text-secondary)" }}>Summary</span>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                />
              </label>
              <label className="block text-sm space-y-1">
                <span style={{ color: "var(--text-secondary)" }}>Plan</span>
                <textarea
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  rows={10}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                />
              </label>
            </div>
          )}

          {error && (
            <div className="space-y-1">
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
              {(generateDiagnostic || publishDiagnostic) && (
                <DiagnosticDetails detail={(publishDiagnostic ?? generateDiagnostic)!} />
              )}
            </div>
          )}

          {publishNotice && !error && (
            <p className="text-sm" style={{ color: "var(--status-good)" }}>
              {publishNotice}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              {saving ? "Saving..." : editingId ? "Update & publish" : "Save & publish"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border px-3 py-2 text-sm font-medium"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div>
          <h2 className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Saved plans
          </h2>
          {loadingPlans && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Loading...
            </p>
          )}
          {!loadingPlans && plans.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No plans saved yet.
            </p>
          )}
          {!loadingPlans && plans.length > 0 && (
            <ul className="space-y-2">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className="rounded-lg border p-3 text-sm space-y-1 shadow-sm"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div style={{ color: "var(--text-primary)" }}>{plan.title}</div>
                      <div style={{ color: "var(--text-muted)" }}>{plan.date.toDate().toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(plan)}
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(plan.id)}
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        style={{ borderColor: "var(--border)", color: "var(--status-critical)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p style={{ color: "var(--text-secondary)" }}>{plan.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
