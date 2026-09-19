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
 * every student). `reference` is how a LearningBlock-level "Ask for Help"
 * action (build-order step 11, section 8) passes the current
 * proposedDayId/blockId/objectiveId into this SAME help-request path,
 * rather than a second one.
 *
 * `compact` (step 11) renders this collapsed to a single small link for
 * use inside a LearningBlock card on the Student Today page, expanding to
 * the identical category picker on click — no new UI pattern, just a
 * smaller footprint for use once per block instead of once per page.
 */
export function AskForHelpWidget({
  reference,
  compact = false,
}: {
  reference?: HelpRequestReference;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { requests } = useMyHelpRequests(user?.uid);
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

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

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-left text-xs font-medium underline"
        style={{ color: "var(--series-1)" }}
      >
        🙋 Ask for help with this
      </button>
    );
  }

  return (
    <div
      className={compact ? "rounded-lg border p-3 space-y-2" : "rounded-xl border p-5 space-y-3 shadow-sm"}
      style={{ background: compact ? "var(--surface-2)" : "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          🙋 Ask for help
        </h2>
        {!compact && openCount > 0 && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {openCount} waiting for your teacher
          </span>
        )}
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
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
