import { useEffect, useState, type FormEvent } from "react";
import { httpsCallable } from "firebase/functions";
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { useDayPlans, type DayPlan } from "../hooks/useDayPlans";
import { AppShell } from "../components/AppShell";

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
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError("Describe the day first.");
      return;
    }
    setGenerating(true);
    setError(null);
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
      // certifying) instead of always showing a generic failure.
      const message = err instanceof Error && err.message ? err.message : null;
      setError(message ?? "Couldn't generate a plan. Try again.");
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
      if (editingId) {
        await updateDoc(doc(db, "dayPlans", editingId), data);
      } else {
        await addDoc(collection(db, "dayPlans"), data);
      }
      resetForm();
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(planId: string) {
    if (!confirm("Delete this plan? This can't be undone.")) return;
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
            <p className="text-sm" style={{ color: "var(--status-critical)" }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              {saving ? "Saving..." : editingId ? "Update plan" : "Save & publish"}
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
