import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import { AppShell } from "../components/AppShell";
import { useFamilyMembers } from "../hooks/useFamilyMembers";
import { PRESENTATION_IDENTITY_OPTIONS, presentationIdentityLabel } from "../lib/presentationIdentity";

const assignFn = httpsCallable<
  { userId: string; presentationIdentityId: string },
  { userId: string; presentationIdentityId: string }
>(functions, "assignPresentationIdentity");

/**
 * Teacher-only presentation-identity bootstrap panel (build-order step 9,
 * section 4) — the ONE place a stable identity (jasper/celeste/kira/ro/
 * nova) is ever attached to a real account from the app itself. Every
 * assignment is an explicit, reviewed choice made here by a teacher; this
 * page never infers or suggests a mapping from a member's displayName —
 * the dropdown starts unset for every member every time the page loads.
 */
export function IdentitySetupPage() {
  const { members, loading, refetch } = useFamilyMembers();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(uid: string) {
    const presentationIdentityId = selection[uid];
    if (!presentationIdentityId) return;
    setBusyUid(uid);
    setError(null);
    try {
      await assignFn({ userId: uid, presentationIdentityId });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't assign that identity.");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Presentation identities
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Assign each family member's stable in-app identity (Jasper, Celeste, Kira, Ro, Nova). This
            is explicit and reviewed by you every time — nothing here is guessed from a name.
          </p>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        {loading && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </p>
        )}

        <div className="space-y-2">
          {members.map((m) => {
            const options = PRESENTATION_IDENTITY_OPTIONS.filter((o) => o.role === m.role);
            const currentLabel = presentationIdentityLabel(m.presentationIdentityId);
            return (
              <div
                key={m.uid}
                className="rounded-lg border p-3 flex items-center justify-between gap-3 flex-wrap"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {m.displayName} <span style={{ color: "var(--text-muted)" }}>({m.role})</span>
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {currentLabel ? `Currently: ${currentLabel}` : "Not yet assigned"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selection[m.uid] ?? ""}
                    onChange={(e) => setSelection((s) => ({ ...s, [m.uid]: e.target.value }))}
                    className="rounded-md border px-2 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                  >
                    <option value="">Choose...</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!selection[m.uid] || busyUid === m.uid}
                    onClick={() => assign(m.uid)}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    style={{ background: "var(--series-1)" }}
                  >
                    Assign
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
