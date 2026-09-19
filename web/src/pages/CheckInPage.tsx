import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { AppShell } from "../components/AppShell";
import { subjectLabel } from "../lib/subjects";
import { WEEK1_OBJECTIVES, type WeeklyObjective } from "../lib/weeklyObjectives";
import { kidKeyForPresentationIdentity } from "../lib/presentationIdentity";

type ScoredKidKey = "millaray" | "makaio";

const submitCheckInFn = httpsCallable<
  { userId: string; kidKey: ScoredKidKey; results: { objectiveId: string; correct: boolean }[] },
  { updated: { objectiveId: string; mastered: boolean; aced: boolean }[] }
>(functions, "submitCheckIn");

export function CheckInPage() {
  const { students, loading: loadingStudents } = useFamilyStudents();
  const eligible = useMemo(
    () =>
      students.filter((s) => {
        const key = kidKeyForPresentationIdentity(s.presentationIdentityId);
        return key === "millaray" || key === "makaio";
      }),
    [students]
  );
  const needsSetup = useMemo(
    () => students.filter((s) => s.presentationIdentityId === null),
    [students]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [acedIds, setAcedIds] = useState<Set<string>>(new Set());
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    setSelectedId((current) => current ?? eligible[0]?.uid ?? null);
  }, [eligible]);

  const selectedStudent = eligible.find((s) => s.uid === selectedId) ?? null;
  const kidKey = selectedStudent
    ? (kidKeyForPresentationIdentity(selectedStudent.presentationIdentityId) as ScoredKidKey | null)
    : null;
  const objectives = kidKey ? WEEK1_OBJECTIVES[kidKey] : [];

  const bySubject = useMemo(() => {
    const groups = new Map<string, WeeklyObjective[]>();
    for (const o of objectives) {
      const list = groups.get(o.subject) ?? [];
      list.push(o);
      groups.set(o.subject, list);
    }
    return [...groups.entries()];
  }, [objectives]);

  function selectStudent(uid: string) {
    setSelectedId(uid);
    setMarks({});
    setError(null);
  }

  function mark(objectiveId: string, correct: boolean) {
    setMarks((current) => ({ ...current, [objectiveId]: correct }));
  }

  async function handleSubmit() {
    if (!selectedStudent || !kidKey) return;
    const results = Object.entries(marks).map(([objectiveId, correct]) => ({ objectiveId, correct }));
    if (results.length === 0) {
      setError("Mark at least one objective before saving.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitCheckInFn({ userId: selectedStudent.uid, kidKey, results });
      setMasteredIds((current) => {
        const next = new Set(current);
        for (const u of res.data.updated) {
          if (u.mastered) next.add(u.objectiveId);
          else next.delete(u.objectiveId);
        }
        return next;
      });
      setAcedIds((current) => {
        const next = new Set(current);
        for (const u of res.data.updated) {
          if (u.aced) next.add(u.objectiveId);
          else next.delete(u.objectiveId);
        }
        return next;
      });
      setSavedCount((n) => n + 1);
      setMarks({});
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Weekly check-in
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Ask these in the moment during the week's actual activity — not a separate quiz. Only
            mark the ones you actually checked; anything left blank stays untouched. Week 1 only for
            now, for Millaray and Makaio. If a kid nails an objective 3 times in a row with no
            struggle, it gets flagged "🚀 Acing it" — the next day plan will give them something
            harder there instead of just moving on.
          </p>
        </div>

        {!loadingStudents && eligible.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No eligible student accounts found yet.
          </p>
        )}

        {needsSetup.length > 0 && (
          <p
            className="text-xs rounded-md border px-3 py-2"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--surface-2)" }}
          >
            Needs identity setup before they can appear here:{" "}
            {needsSetup.map((s) => s.displayName).join(", ")} —{" "}
            <Link to="/identity" style={{ color: "var(--series-1)" }}>
              assign identities
            </Link>
            .
          </p>
        )}

        {eligible.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {eligible.map((s) => (
              <button
                key={s.uid}
                onClick={() => selectStudent(s.uid)}
                className="rounded-full border px-3 py-1.5 text-sm font-medium"
                style={{
                  borderColor: s.uid === selectedId ? "var(--series-1)" : "var(--border)",
                  background: s.uid === selectedId ? "var(--series-1)" : "var(--surface-2)",
                  color: s.uid === selectedId ? "#ffffff" : "var(--text-primary)",
                }}
              >
                {s.displayName}
              </button>
            ))}
          </div>
        )}

        {bySubject.map(([subject, items]) => (
          <div key={subject} className="space-y-2">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {subjectLabel(subject)}
            </h2>
            <div className="space-y-2">
              {items.map((o) => {
                const mark_ = marks[o.id];
                const mastered = masteredIds.has(o.id);
                const aced = acedIds.has(o.id);
                return (
                  <div
                    key={o.id}
                    className="rounded-lg border p-3 space-y-2 shadow-sm"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {o.skill}
                      </p>
                      {aced && (
                        <span
                          className="text-xs shrink-0 font-medium"
                          style={{ color: "var(--series-1)" }}
                          title="3-for-3 correct, no struggle — ready for harder material"
                        >
                          🚀 Acing it
                        </span>
                      )}
                      {mastered && !aced && (
                        <span className="text-xs shrink-0" style={{ color: "var(--status-good)" }}>
                          ● Mastered
                        </span>
                      )}
                    </div>
                    <ul className="text-xs space-y-0.5" style={{ color: "var(--text-muted)" }}>
                      {o.checkQuestions.map((q, i) => (
                        <li key={i}>"{q}"</li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <button
                        onClick={() => mark(o.id, true)}
                        className="rounded-md border px-3 py-1 text-xs font-medium"
                        style={{
                          borderColor: mark_ === true ? "var(--status-good)" : "var(--border)",
                          background: mark_ === true ? "var(--status-good)" : "transparent",
                          color: mark_ === true ? "#ffffff" : "var(--text-secondary)",
                        }}
                      >
                        Got it
                      </button>
                      <button
                        onClick={() => mark(o.id, false)}
                        className="rounded-md border px-3 py-1 text-xs font-medium"
                        style={{
                          borderColor: mark_ === false ? "var(--status-critical)" : "var(--border)",
                          background: mark_ === false ? "var(--status-critical)" : "transparent",
                          color: mark_ === false ? "#ffffff" : "var(--text-secondary)",
                        }}
                      >
                        Needs work
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {selectedStudent && (
          <>
            {error && (
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
            )}
            {savedCount > 0 && !error && (
              <p className="text-sm">
                <span style={{ color: "var(--status-good)" }}>●</span>{" "}
                <span style={{ color: "var(--text-secondary)" }}>
                  Saved — this feeds the pace dashboard and future day plans.
                </span>
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              {submitting ? "Saving..." : "Save check-in"}
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}
