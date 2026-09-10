import { useState, type FormEvent } from "react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { AppShell } from "../components/AppShell";
import {
  CORE_SUBJECTS,
  SPECIALTY_SUBJECTS,
  getSubjectType,
  subjectLabel,
  LOCATION_LABELS,
  type Location,
} from "../lib/subjects";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogActivityPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();

  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState(CORE_SUBJECTS[0]);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [location, setLocation] = useState<Location>("home");
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);

  const activeStudentId = studentId || students[0]?.uid || "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !activeStudentId) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, "logs"), {
        familyId: profile.familyId,
        userId: activeStudentId,
        date: Timestamp.fromDate(new Date(date)),
        subject,
        subjectType: getSubjectType(subject),
        durationMinutes,
        location,
        source: "curriculum",
      });
      setSuccessCount((n) => n + 1);
      setDurationMinutes(30);
    } catch {
      setError("Couldn't save that entry. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-md space-y-4">
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Log an activity
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
            className="rounded-xl border p-4 space-y-4"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <label className="block text-sm space-y-1">
              <span style={{ color: "var(--text-secondary)" }}>Student</span>
              <select
                value={activeStudentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
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
                step={5}
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
              />
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

            {error && (
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
            )}
            {successCount > 0 && !error && (
              <p className="text-sm">
                <span style={{ color: "var(--status-good)" }}>●</span>{" "}
                <span style={{ color: "var(--text-secondary)" }}>Saved. Log another below if you'd like.</span>
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              {submitting ? "Saving..." : "Save entry"}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
