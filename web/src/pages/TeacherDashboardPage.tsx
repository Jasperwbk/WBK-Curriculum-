import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { AppShell } from "../components/AppShell";
import { Gauge } from "../components/Gauge";
import { CORE_SUBJECTS, SPECIALTY_SUBJECTS, subjectLabel } from "../lib/subjects";
import type { DashboardData } from "../lib/types";

const getDashboardDataFn = httpsCallable<{ userId: string }, DashboardData>(
  functions,
  "getDashboardData"
);

export function TeacherDashboardPage() {
  const { students, loading: loadingStudents } = useFamilyStudents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId((current) => current ?? students[0]?.uid ?? null);
  }, [students]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingData(true);
    setError(null);
    getDashboardDataFn({ userId: selectedId })
      .then((res) => setData(res.data))
      .catch(() => setError("Couldn't load the dashboard. Try again in a moment."))
      .finally(() => setLoadingData(false));
  }, [selectedId]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.uid === selectedId) ?? null,
    [students, selectedId]
  );

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Pace dashboard
          </h1>
          {!loadingStudents && students.length > 0 && (
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--surface-1)" }}
            >
              {students.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.displayName}
                  {s.characterMapping ? ` (${s.characterMapping})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

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

        {error && (
          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        {loadingData && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading {selectedStudent?.displayName ?? "student"}'s pace...
          </p>
        )}

        {data && !loadingData && (
          <>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              As of {data.asOf}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Gauge {...data.total} />
              <Gauge {...data.core} />
              <Gauge {...data.homeCore} />
            </div>

            <details className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <summary
                className="cursor-pointer px-3 py-2 text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Per-subject breakdown
              </summary>
              <div className="p-3 pt-0 space-y-3">
                <div>
                  <h2 className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                    Core subjects
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CORE_SUBJECTS.map((subject) => (
                      <Gauge key={subject} {...{ ...data.subjects[subject], label: subjectLabel(subject) }} />
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                    Specialty subjects
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SPECIALTY_SUBJECTS.map((subject) => (
                      <Gauge key={subject} {...{ ...data.subjects[subject], label: subjectLabel(subject) }} />
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </>
        )}
      </div>
    </AppShell>
  );
}
