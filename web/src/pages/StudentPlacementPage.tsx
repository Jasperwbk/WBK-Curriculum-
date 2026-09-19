import { useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { StudentShell } from "../components/StudentShell";
import { StudentSetupRequiredNotice } from "../components/StudentSetupRequiredNotice";
import { useStudentIdentity } from "../hooks/useStudentIdentity";
import { PLACEMENT_TEST_ITEMS } from "../lib/placementTestItems";

type ScoredKidKey = "millaray" | "makaio";
type Step = "intro" | "test" | "submitting" | "done";

const submitPlacementResponsesFn = httpsCallable<
  { userId: string; kidKey: ScoredKidKey; results: { itemId: string; answerText: string }[] },
  { submissionId: string }
>(functions, "submitPlacementResponses");

export function StudentPlacementPage() {
  const { user, profile } = useAuth();
  const { status: identityStatus, kidKey } = useStudentIdentity();

  const [step, setStep] = useState<Step>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (identityStatus === "setup_required") {
    return (
      <StudentShell>
        <div className="mt-10">
          <StudentSetupRequiredNotice />
        </div>
      </StudentShell>
    );
  }

  if (kidKey !== "millaray" && kidKey !== "makaio") {
    return (
      <StudentShell>
        <div className="text-center space-y-3 mt-10">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            This isn't for you right now — your teacher will work on this with you directly.
          </p>
          <Link to="/" style={{ color: "var(--series-1)" }} className="text-sm">
            Back home
          </Link>
        </div>
      </StudentShell>
    );
  }

  const items = PLACEMENT_TEST_ITEMS[kidKey];
  const currentItem = items[index];

  async function handleNext() {
    if (index < items.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    if (!user || kidKey !== "millaray" && kidKey !== "makaio") return;
    setStep("submitting");
    setError(null);
    try {
      const results = items.map((it) => ({ itemId: it.id, answerText: answers[it.id] ?? "" }));
      await submitPlacementResponsesFn({ userId: user.uid, kidKey, results });
      setStep("done");
    } catch {
      setError("Something went wrong saving that. Try tapping the button again.");
      setStep("test");
    }
  }

  return (
    <StudentShell>
      {step === "intro" && (
        <div className="text-center space-y-4 mt-4">
          <div className="text-4xl" aria-hidden="true">
            🌟
          </div>
          <h1 className="brand-heading text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Your Placement Test
          </h1>
          <div
            className="rounded-xl border p-5 space-y-3 text-left text-sm shadow-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <p>This isn't something you can fail! It just helps us see what you already know, so
            your teacher can pick the best lessons for you.</p>
            <p>Some questions might feel easy. Some might feel tricky — that's totally okay! If you
            don't know an answer, just do your best guess.</p>
            <p>Take your time. There's no rush.</p>
          </div>
          <button
            onClick={() => setStep("test")}
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-white"
            style={{ background: "var(--series-1)" }}
          >
            I'm ready!
          </button>
        </div>
      )}

      {(step === "test" || step === "submitting") && currentItem && (
        <div className="space-y-4 mt-4">
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            Question {index + 1} of {items.length}
          </p>
          <div className="w-full rounded-full h-1.5" style={{ background: "var(--gridline)" }}>
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${((index + 1) / items.length) * 100}%`,
                background: "var(--series-1)",
              }}
            />
          </div>

          <div
            className="rounded-xl border p-5 space-y-3 shadow-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <p className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
              {currentItem.question}
            </p>

            {currentItem.kind === "fixed" ? (
              <input
                type="text"
                autoFocus
                value={answers[currentItem.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [currentItem.id]: e.target.value }))}
                placeholder="Type your answer"
                className="w-full rounded-md border px-3 py-2 text-base"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
              />
            ) : (
              <textarea
                autoFocus
                rows={3}
                value={answers[currentItem.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [currentItem.id]: e.target.value }))}
                placeholder="Type your answer here"
                className="w-full rounded-md border px-3 py-2 text-base"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
              />
            )}
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: "var(--status-critical)" }}>
              {error}
            </p>
          )}

          <button
            onClick={handleNext}
            disabled={step === "submitting"}
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--series-1)" }}
          >
            {step === "submitting"
              ? "Saving..."
              : index < items.length - 1
                ? "Next question"
                : "I'm done!"}
          </button>
          <button
            onClick={handleNext}
            disabled={step === "submitting"}
            className="w-full text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            I don't know this one — skip it
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="text-center space-y-4 mt-10">
          <div className="text-5xl" aria-hidden="true">
            🎉
          </div>
          <h1 className="brand-heading text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Great job, {profile?.displayName}!
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            You finished your Placement Test! Your teacher will look it over and get your lessons
            ready soon. Thank you!
          </p>
          <Link
            to="/"
            className="inline-block rounded-md px-4 py-2.5 text-sm font-medium text-white"
            style={{ background: "var(--series-1)" }}
          >
            Back home
          </Link>
        </div>
      )}
    </StudentShell>
  );
}
