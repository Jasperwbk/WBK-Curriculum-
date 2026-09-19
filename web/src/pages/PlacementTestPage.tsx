import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { collection, deleteDoc, doc, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { AppShell } from "../components/AppShell";
import { subjectLabel } from "../lib/subjects";
import { PLACEMENT_TEST_ITEMS, PUZZLE_LEVELS, type PlacementKidKey } from "../lib/placementTestItems";
import { kidKeyForPresentationIdentity } from "../lib/presentationIdentity";

interface AnswerState {
  correct: boolean;
  answerText: string;
  notes: string;
  level: string;
}

function emptyAnswer(): AnswerState {
  return { correct: false, answerText: "", notes: "", level: PUZZLE_LEVELS[0] };
}

interface PendingSubmission {
  id: string;
  userId: string;
  kidKey: "millaray" | "makaio";
  submittedAt: Timestamp;
  results: { itemId: string; answerText: string; correct: boolean | null }[];
}

const submitPlacementTestFn = httpsCallable<
  { userId: string; kidKey: "millaray" | "makaio"; date: string; results: unknown[] },
  { placementTestId: string; subjectBaselines: Record<string, string> }
>(functions, "submitPlacementTest");

const submitPrintableCheckInFn = httpsCallable<
  { userId: string; date: string; results: unknown[] },
  { placementTestId: string }
>(functions, "submitPrintableCheckIn");

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PlacementTestPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();
  const eligible = useMemo(
    () => students.filter((s) => kidKeyForPresentationIdentity(s.presentationIdentityId) !== null),
    [students]
  );
  const needsSetup = useMemo(
    () => students.filter((s) => s.presentationIdentityId === null),
    [students]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string> | "checked_in" | null>(null);
  const [pending, setPending] = useState<PendingSubmission[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId((current) => current ?? eligible[0]?.uid ?? null);
  }, [eligible]);

  async function loadPending() {
    if (!profile) return;
    setLoadingPending(true);
    const snap = await getDocs(
      query(collection(db, "placementSubmissions"), where("familyId", "==", profile.familyId))
    );
    setPending(
      snap.docs.map((d) => ({
        id: d.id,
        userId: d.data().userId,
        kidKey: d.data().kidKey,
        submittedAt: d.data().submittedAt,
        results: d.data().results,
      }))
    );
    setLoadingPending(false);
  }

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function reviewSubmission(submission: PendingSubmission) {
    setSelectedId(submission.userId);
    setResult(null);
    setError(null);
    setReviewingSubmissionId(submission.id);
    const prefilled: Record<string, AnswerState> = {};
    for (const r of submission.results) {
      prefilled[r.itemId] = {
        correct: r.correct === true,
        answerText: r.answerText,
        notes: r.answerText,
        level: PUZZLE_LEVELS[0],
      };
    }
    setAnswers(prefilled);
  }

  const selectedStudent = eligible.find((s) => s.uid === selectedId) ?? null;
  const kidKey: PlacementKidKey | null = selectedStudent
    ? kidKeyForPresentationIdentity(selectedStudent.presentationIdentityId)
    : null;
  const items = kidKey ? PLACEMENT_TEST_ITEMS[kidKey] : [];
  const scored = kidKey === "millaray" || kidKey === "makaio";

  function selectStudent(uid: string) {
    setSelectedId(uid);
    setAnswers({});
    setResult(null);
    setError(null);
    setReviewingSubmissionId(null);
  }

  function updateAnswer(itemId: string, patch: Partial<AnswerState>) {
    setAnswers((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? emptyAnswer()), ...patch },
    }));
  }

  async function handleSubmit() {
    if (!selectedStudent || !kidKey) return;
    setSubmitting(true);
    setError(null);
    try {
      if (scored && (kidKey === "millaray" || kidKey === "makaio")) {
        const results = items.map((it) => {
          const a = answers[it.id] ?? emptyAnswer();
          return {
            itemId: it.id,
            correct: a.correct,
            answerText: a.answerText || undefined,
            notes: a.notes || undefined,
          };
        });
        const res = await submitPlacementTestFn({
          userId: selectedStudent.uid,
          kidKey,
          date: todayIso(),
          results,
        });
        setResult(res.data.subjectBaselines);
        if (reviewingSubmissionId) {
          await deleteDoc(doc(db, "placementSubmissions", reviewingSubmissionId));
          setReviewingSubmissionId(null);
          loadPending();
        }
      } else {
        const results = items.map((it) => {
          const a = answers[it.id] ?? emptyAnswer();
          return {
            itemId: it.id,
            correct: it.kind === "checklist" ? a.correct : null,
            level: it.kind === "puzzle_level" ? a.level : undefined,
          };
        });
        await submitPrintableCheckInFn({ userId: selectedStudent.uid, date: todayIso(), results });
        setResult("checked_in");
      }
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6 print:max-w-full">
        <div className="print:hidden">
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Placement test
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            A one-time starting-point check per kid. Proctor it yourself (read the question aloud
            or hand over the paper version), then enter what happened here — Millaray and Makaio's
            results feed the pace dashboard and daily plans; Maizley's is a printable check-in only,
            not scored. Or print a blank copy below and let them fill it out on paper first.
          </p>
        </div>

        {!loadingStudents && eligible.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No eligible student accounts found yet.
          </p>
        )}

        {needsSetup.length > 0 && (
          <p
            className="text-xs rounded-md border px-3 py-2 print:hidden"
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

        {!loadingPending && pending.length > 0 && (
          <div className="space-y-2 print:hidden">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Waiting on your review
            </h2>
            <ul className="space-y-2">
              {pending.map((sub) => {
                const kid = eligible.find((s) => s.uid === sub.userId);
                const openCount = sub.results.filter((r) => r.correct === null).length;
                return (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                  >
                    <span style={{ color: "var(--text-primary)" }}>
                      {kid?.displayName ?? sub.userId} finished their placement test — {openCount}{" "}
                      answer{openCount === 1 ? "" : "s"} to review
                    </span>
                    <button
                      onClick={() => reviewSubmission(sub)}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-white shrink-0"
                      style={{ background: "var(--series-1)" }}
                    >
                      Review now
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {eligible.length > 0 && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {eligible.map((s) => (
              <button
                key={s.uid}
                onClick={() => selectStudent(s.uid)}
                className="rounded-md border px-3 py-1.5 text-sm font-medium"
                style={{
                  borderColor: s.uid === selectedId ? "var(--series-1)" : "var(--border)",
                  background: s.uid === selectedId ? "var(--series-1)" : "transparent",
                  color: s.uid === selectedId ? "#ffffff" : "var(--text-primary)",
                }}
              >
                {s.displayName}
              </button>
            ))}
          </div>
        )}

        {kidKey === "maizley" && (
          <p
            className="text-sm rounded-md border px-3 py-2 print:hidden"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--surface-1)" }}
          >
            Not a test — just play with a purpose. No pass/fail; this is a snapshot to feed her
            printable worksheet, not the scored track Millaray and Makaio use.
          </p>
        )}

        {selectedStudent && (
          <button
            onClick={() => window.print()}
            className="rounded-md border px-3 py-2 text-sm font-medium print:hidden"
            style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}
          >
            Print blank copy for {selectedStudent.displayName}
          </button>
        )}

        {/* Printable version: plain question list with blank answer space,
            no scoring UI. Hidden on screen, shown only when printing. */}
        {selectedStudent && (
          <div className="hidden print:block space-y-5 text-black">
            <div>
              <h1 className="text-xl font-semibold">
                {selectedStudent.displayName} — {scored ? "Placement Test" : "Check-In"}
              </h1>
              <p className="text-sm mt-1">Date: _______________________</p>
            </div>
            {items.map((it) => (
              <div key={it.id} className="break-inside-avoid-page pb-2">
                <p className="text-sm font-medium">{it.question}</p>
                {it.kind === "fixed" && <p className="text-sm mt-1">Answer: _______________________</p>}
                {it.kind === "open" && (
                  <div className="mt-1 space-y-3">
                    <div className="border-b border-black h-5" />
                    <div className="border-b border-black h-5" />
                  </div>
                )}
                {it.kind === "checklist" && <p className="text-sm mt-1">☐ Yes &nbsp;&nbsp;☐ Not yet</p>}
                {it.kind === "puzzle_level" && (
                  <p className="text-sm mt-1">
                    {PUZZLE_LEVELS.map((level) => `☐ ${level}`).join("   ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {selectedStudent && reviewingSubmissionId && (
          <p
            className="text-sm rounded-md border px-3 py-2 print:hidden"
            style={{ borderColor: "var(--series-1)", color: "var(--text-secondary)", background: "var(--surface-1)" }}
          >
            Reviewing {selectedStudent.displayName}'s own answers below — math is already graded;
            just judge the open-ended ones and confirm.
          </p>
        )}

        {selectedStudent && (
          <div className="space-y-4 print:hidden">
            {items.map((it) => {
              const a = answers[it.id] ?? emptyAnswer();
              return (
                <div
                  key={it.id}
                  className="rounded-lg border p-3 space-y-2 shadow-sm"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {it.question}
                    </p>
                    <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                      {subjectLabel(it.subject)}
                    </span>
                  </div>

                  {it.kind === "fixed" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="What did they answer?"
                        value={a.answerText}
                        onChange={(e) => updateAnswer(it.id, { answerText: e.target.value })}
                        className="rounded-md border px-2 py-1 text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                      />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Correct answer: {it.correctAnswer}
                      </span>
                      <label className="flex items-center gap-1.5 text-sm ml-auto" style={{ color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          checked={a.correct}
                          onChange={(e) => updateAnswer(it.id, { correct: e.target.checked })}
                        />
                        Correct
                      </label>
                    </div>
                  )}

                  {it.kind === "open" && (
                    <div className="space-y-2">
                      <textarea
                        placeholder="Notes on their answer/reasoning..."
                        value={a.notes}
                        onChange={(e) => updateAnswer(it.id, { notes: e.target.value })}
                        rows={2}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                      />
                      <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          checked={a.correct}
                          onChange={(e) => updateAnswer(it.id, { correct: e.target.checked })}
                        />
                        Solid answer / good reasoning
                      </label>
                    </div>
                  )}

                  {it.kind === "checklist" && (
                    <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={a.correct}
                        onChange={(e) => updateAnswer(it.id, { correct: e.target.checked })}
                      />
                      Can do this
                    </label>
                  )}

                  {it.kind === "puzzle_level" && (
                    <select
                      value={a.level}
                      onChange={(e) => updateAnswer(it.id, { level: e.target.value })}
                      className="rounded-md border px-2 py-1 text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
                    >
                      {PUZZLE_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}

            {error && (
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              {submitting ? "Saving..." : scored ? "Score & save placement test" : "Save check-in"}
            </button>

            {result && result !== "checked_in" && (
              <div
                className="rounded-lg border p-3 text-sm space-y-1 shadow-sm"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                  Baseline scored
                </p>
                {Object.entries(result).map(([subject, summary]) => (
                  <p key={subject} style={{ color: "var(--text-secondary)" }}>
                    {subjectLabel(subject)}: {summary}
                  </p>
                ))}
              </div>
            )}

            {result === "checked_in" && (
              <p className="text-sm" style={{ color: "var(--status-good)" }}>
                Check-in saved. Use the printable worksheet content in
                curriculum/assessments/maizley_assessment2_content.md for her paper activity.
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
