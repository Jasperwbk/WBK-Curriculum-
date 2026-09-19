import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useFamilyHelpRequests, type HelpRequestRow } from "../hooks/useHelpRequests";
import { useFamilyStudents } from "../hooks/useFamilyStudents";

const respondFn = httpsCallable<{ helpRequestId: string; note: string }, { helpRequestId: string }>(
  functions,
  "respondToHelpRequest"
);
const escalateFn = httpsCallable<{ helpRequestId: string; note?: string }, { helpRequestId: string }>(
  functions,
  "escalateHelpRequest"
);
const resolveFn = httpsCallable<{ helpRequestId: string; note?: string }, { helpRequestId: string }>(
  functions,
  "resolveHelpRequest"
);

const CATEGORY_LABEL: Record<string, string> = {
  dont_understand: "Doesn't understand",
  directions_unclear: "Directions unclear",
  think_content_is_wrong: "Thinks content is wrong",
  cannot_complete: "Can't complete",
  need_teacher: "Needs teacher",
  other: "Other",
};

function formatTime(ts: { seconds: number } | undefined): string {
  if (!ts) return "";
  return new Date(ts.seconds * 1000).toLocaleString();
}

/**
 * Teacher help queue (build-order step 9, section 11) — a school help
 * queue, deliberately NOT a chat/social feed: every request shows the
 * student, category, message, and referenced day/block/objective (when
 * present), with respond/resolve/escalate actions. Both teacher accounts
 * can act on any request regardless of escalation level (there's no
 * finer-grained teacher sub-role in this app's authorization model to
 * split "Celeste's queue" from "Jasper's queue" at the access-control
 * layer) — the Celeste/Jasper split below is UI grouping only, matching
 * the intended first-level/escalated workflow.
 */
export function HelpRequestsPage() {
  const { profile } = useAuth();
  const { requests, loading } = useFamilyHelpRequests(profile?.familyId);
  const { students } = useFamilyStudents();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);

  const studentName = (uid: string) => students.find((s) => s.uid === uid)?.displayName ?? uid;

  const visible = requests.filter((r) => (showResolved ? true : r.status === "open"));
  const celesteLevel = visible.filter((r) => r.escalationLevel === "celeste");
  const jasperLevel = visible.filter((r) => r.escalationLevel === "jasper");

  async function respond(id: string) {
    const note = (noteDrafts[id] ?? "").trim();
    if (!note) return;
    setBusyId(id);
    try {
      await respondFn({ helpRequestId: id, note });
      setNoteDrafts((d) => ({ ...d, [id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  async function escalate(id: string) {
    setBusyId(id);
    try {
      const note = (noteDrafts[id] ?? "").trim();
      await escalateFn({ helpRequestId: id, note: note || undefined });
      setNoteDrafts((d) => ({ ...d, [id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(id: string) {
    setBusyId(id);
    try {
      const note = (noteDrafts[id] ?? "").trim();
      await resolveFn({ helpRequestId: id, note: note || undefined });
      setNoteDrafts((d) => ({ ...d, [id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  function RequestCard({ r }: { r: HelpRequestRow }) {
    return (
      <div
        className="rounded-lg border p-3 space-y-2 shadow-sm"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {studentName(r.studentId)} — {CATEGORY_LABEL[r.category] ?? r.category}
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              "{r.message}"
            </p>
          </div>
          <span
            className="text-xs shrink-0 rounded-full px-2 py-0.5 font-medium"
            style={{
              background: r.status === "resolved" ? "var(--status-good)" : "var(--surface-2)",
              color: r.status === "resolved" ? "#ffffff" : "var(--text-secondary)",
            }}
          >
            {r.status === "resolved" ? "Resolved" : "Open"}
          </span>
        </div>

        {(r.reference.proposedDayId || r.reference.blockId || r.reference.objectiveId) && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Working on: {r.reference.proposedDayId ? `day ${r.reference.proposedDayId}` : ""}
            {r.reference.blockId ? ` · block ${r.reference.blockId}` : ""}
            {r.reference.objectiveId ? ` · objective ${r.reference.objectiveId}` : ""}
          </p>
        )}

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Raised {formatTime(r.createdAt)}
        </p>

        {r.teacherNotes.length > 0 && (
          <div className="space-y-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            {r.teacherNotes.map((n, i) => (
              <p key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {n.note} <span style={{ color: "var(--text-muted)" }}>— {formatTime(n.at)}</span>
              </p>
            ))}
          </div>
        )}

        {r.status === "open" && (
          <div className="space-y-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <textarea
              value={noteDrafts[r.id] ?? ""}
              onChange={(e) => setNoteDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
              placeholder="Add a note (optional for escalate/resolve, required to respond)"
              rows={2}
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busyId === r.id}
                onClick={() => respond(r.id)}
                className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                Respond
              </button>
              {r.escalationLevel !== "jasper" && (
                <button
                  disabled={busyId === r.id}
                  onClick={() => escalate(r.id)}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  Escalate to Jasper
                </button>
              )}
              <button
                disabled={busyId === r.id}
                onClick={() => resolve(r.id)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                style={{ background: "var(--series-1)" }}
              >
                Mark resolved
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Ask-a-Teacher
          </h1>
          <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
        </div>

        {loading && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </p>
        )}

        {!loading && visible.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No {showResolved ? "" : "open "}help requests right now.
          </p>
        )}

        {celesteLevel.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              First-level (Celeste)
            </h2>
            <div className="space-y-2">
              {celesteLevel.map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </div>
          </div>
        )}

        {jasperLevel.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Escalated to Jasper
            </h2>
            <div className="space-y-2">
              {jasperLevel.map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
