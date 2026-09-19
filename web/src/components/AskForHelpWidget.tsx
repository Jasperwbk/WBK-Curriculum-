import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useMyHelpRequests } from "../hooks/useHelpRequests";
import type { HelpRequestCategory, HelpRequestReference } from "../lib/types";

const createHelpRequestFn = httpsCallable<
  { studentId: string; category: HelpRequestCategory; message?: string; reference?: HelpRequestReference },
  { helpRequestId: string; message: string; escalationLevel: string }
>(functions, "createHelpRequest");

const CATEGORY_BUTTONS: { category: HelpRequestCategory; emoji: string; label: string }[] = [
  { category: "dont_understand", emoji: "🤔", label: "I don't understand this" },
  { category: "directions_unclear", emoji: "📄", label: "The directions don't make sense" },
  { category: "think_content_is_wrong", emoji: "⚠️", label: "I think something is wrong" },
  { category: "cannot_complete", emoji: "🛑", label: "I can't finish this" },
  { category: "need_teacher", emoji: "🙋", label: "I need my teacher" },
];

/**
 * The smallest useful Ask-a-Teacher student interaction (build-order step
 * 9, section 13) — a category button IS the whole submission for every
 * category except "Something else," so no typing is ever required (this
 * is what makes the flow usable for Maizely, and works identically for
 * every student). `reference` is accepted but optional and unused by any
 * caller today — passing the current proposedDayId/blockId/objectiveId
 * here is exactly how a future LearningBlock "Ask for Help" action plugs
 * in without redesigning this component.
 */
export function AskForHelpWidget({ reference }: { reference?: HelpRequestReference }) {
  const { user } = useAuth();
  const { requests } = useMyHelpRequests(user?.uid);
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCount = requests.filter((r) => r.status === "open").length;

  async function send(category: HelpRequestCategory, message?: string) {
    if (!user) return;
    setSending(true);
    setError(null);
    try {
      const res = await createHelpRequestFn({ studentId: user.uid, category, message, reference });
      setSentMessage(res.data.message);
      setShowOther(false);
      setOtherText("");
    } catch {
      setError("Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-5 space-y-3 shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          🙋 Ask for help
        </h2>
        {openCount > 0 && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {openCount} waiting for your teacher
          </span>
        )}
      </div>

      {sentMessage && !error && (
        <p className="text-sm" style={{ color: "var(--status-good)" }}>
          ✅ Sent to your teacher: "{sentMessage}"
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {CATEGORY_BUTTONS.map(({ category, emoji, label }) => (
          <button
            key={category}
            disabled={sending}
            onClick={() => send(category)}
            className="text-left rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
          >
            <span aria-hidden="true">{emoji}</span> {label}
          </button>
        ))}

        {!showOther && (
          <button
            disabled={sending}
            onClick={() => setShowOther(true)}
            className="text-left rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
          >
            <span aria-hidden="true">💬</span> Something else
          </button>
        )}

        {showOther && (
          <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Tell your teacher what's going on (optional)"
              rows={2}
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
            <button
              disabled={sending}
              onClick={() => send("other", otherText)}
              className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              Send to my teacher
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
