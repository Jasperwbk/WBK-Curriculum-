import { useEffect, useState, type FormEvent } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { useRecentLogs, type LogEntry } from "../hooks/useRecentLogs";
import { AppShell } from "../components/AppShell";
import {
  CORE_SUBJECTS,
  SPECIALTY_SUBJECTS,
  getSubjectType,
  subjectLabel,
  LOCATION_LABELS,
  type Location,
  type Subject,
} from "../lib/subjects";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogActivityPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();

  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState<Subject>(CORE_SUBJECTS[0]);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [location, setLocation] = useState<Location>("home");
  const [date, setDate] = useState(todayIso());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [governedMinutes, setGovernedMinutes] = useState<number | null>(null);
  const [acknowledgeSeparate, setAcknowledgeSeparate] = useState(false);

  const activeStudentId = studentId || students[0]?.uid || "";
  const { logs, loading: loadingLogs } = useRecentLogs(activeStudentId);

  // Switching students while mid-edit would silently edit the wrong kid's
  // entry, so drop back to "new entry" mode whenever the student changes.
  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudentId]);

  // Prevention, not silent deduplication (build-order step 6.1): if this
  // exact student/date already has an APPROVED end-of-day closeout
  // covering this subject, warn before logging what might be the same
  // activity a second time. Uses the deterministic evidencePackets doc id
  // and a real block-subject match — never fuzzy text — and never blocks
  // outright, since a homeschool day can legitimately have more than one
  // activity in the same subject.
  useEffect(() => {
    setGovernedMinutes(null);
    setAcknowledgeSeparate(false);
    if (!profile || !activeStudentId || !date) return;
    let cancelled = false;
    const packetId = `${profile.familyId}_${activeStudentId}_${date}`;
    getDoc(doc(db, "evidencePackets", packetId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as { status?: string; draft?: { blocks?: { subject: string; approvedMinutes: number | null }[] } };
        if (data.status !== "approved") return;
        const matching = (data.draft?.blocks ?? []).filter((b) => b.subject === subject);
        if (matching.length === 0) return;
        setGovernedMinutes(matching.reduce((sum, b) => sum + (b.approvedMinutes ?? 0), 0));
      })
      .catch(() => {
        // Best-effort only — a lookup failure never blocks ordinary logging.
      });
    return () => {
      cancelled = true;
    };
  }, [profile, activeStudentId, date, subject]);

  function resetForm() {
    setEditingId(null);
    setSubject(CORE_SUBJECTS[0]);
    setDurationMinutes(30);
    setLocation("home");
    setDate(todayIso());
  }

  function startEdit(log: LogEntry) {
    setEditingId(log.id);
    setSubject(log.subject);
    setDurationMinutes(log.durationMinutes);
    setLocation(log.location);
    setDate(log.date.toDate().toISOString().slice(0, 10));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(logId: string) {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    try {
      await deleteDoc(doc(db, "logs", logId));
      if (editingId === logId) resetForm();
    } catch {
      setError("Couldn't delete that entry. Try again.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !activeStudentId) return;
    if (governedMinutes !== null && !acknowledgeSeparate) {
      setError("Please confirm this is a separate activity, or adjust the date/subject, before saving.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = {
        familyId: profile.familyId,
        userId: activeStudentId,
        date: Timestamp.fromDate(new Date(date)),
        subject,
        subjectType: getSubjectType(subject),
        durationMinutes,
        location,
        source: "curriculum",
        provenance: "manual",
      };
      if (editingId) {
        await updateDoc(doc(db, "logs", editingId), data);
      } else {
        await addDoc(collection(db, "logs"), data);
      }
      setSuccessCount((n) => n + 1);
      resetForm();
    } catch {
      setError("Couldn't save that entry. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-md space-y-4">
        <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {editingId ? "Edit activity" : "Log an activity"}
        </h1>

        {loadingStudents && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading students...
          </p>
        )}

        {!loadingStudents && students.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No student accounts found in your family yet.
          </p>
        )}

        {!loadingStudents && students.length > 0 && (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border p-4 space-y-4 shadow-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <label className="block text-sm space-y-1">
              <span style={{ color: "var(--text-secondary)" }}>Student</span>
              <select
                value={activeStudentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={!!editingId}
                className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
              >
                {students.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.displayName}
                    {s.characterMapping ? ` (${s.characterMapping})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm space-y-1">
              <span style={{ color: "var(--text-secondary)" }}>Subject</span>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as typeof subject)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
              >
                <optgroup label="Core">
                  {CORE_SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {subjectLabel(s)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Specialty">
                  {SPECIALTY_SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {subjectLabel(s)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            <label className="block text-sm space-y-1">
              <span style={{ color: "var(--text-secondary)" }}>Duration (minutes)</span>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
              />
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                Total minutes spent, e.g. 30 for a half hour, 90 for an hour and a half.
              </span>
            </label>

            <label className="block text-sm space-y-1">
              <span style={{ color: "var(--text-secondary)" }}>Location</span>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as Location)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
              >
                {Object.entries(LOCATION_LABELS).map(([value, labelText]) => (
                  <option key={value} value={value}>
                    {labelText}
                  </option>
                ))}
              </select>
            </label>

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

            {governedMinutes !== null && (
              <div
                className="rounded-md border px-3 py-2 text-xs space-y-2"
                style={{ borderColor: "var(--status-critical)", background: "var(--page)" }}
              >
                <p style={{ color: "var(--status-critical)" }}>
                  This date already has {governedMinutes} approved {subjectLabel(subject)} minute
                  {governedMinutes === 1 ? "" : "s"} from end-of-day closeout. If this is the same activity, don't
                  log it again — the closeout is already authoritative. If it's a genuinely separate activity, you
                  can still log it.
                </p>
                <label className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={acknowledgeSeparate}
                    onChange={(e) => setAcknowledgeSeparate(e.target.checked)}
                  />
                  Yes, this is a separate activity
                </label>
              </div>
            )}

            {error && (
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
            )}
            {successCount > 0 && !error && !editingId && (
              <p className="text-sm">
                <span style={{ color: "var(--status-good)" }}>●</span>{" "}
                <span style={{ color: "var(--text-secondary)" }}>Saved. Log another below if you'd like.</span>
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || (governedMinutes !== null && !acknowledgeSeparate)}
                className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ background: "var(--series-1)" }}
              >
                {submitting ? "Saving..." : editingId ? "Update entry" : "Save entry"}
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
        )}

        {!loadingStudents && students.length > 0 && (
          <div>
            <h2 className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Recent activity
            </h2>
            {loadingLogs && (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Loading...
              </p>
            )}
            {!loadingLogs && logs.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No entries logged yet for this student.
              </p>
            )}
            {!loadingLogs && logs.length > 0 && (
              <ul className="space-y-2">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                  >
                    <div>
                      <div style={{ color: "var(--text-primary)" }}>{subjectLabel(log.subject)}</div>
                      <div style={{ color: "var(--text-muted)" }}>
                        {log.date.toDate().toLocaleDateString()} · {log.durationMinutes} min ·{" "}
                        {LOCATION_LABELS[log.location]}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(log)}
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        style={{ borderColor: "var(--border)", color: "var(--status-critical)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
