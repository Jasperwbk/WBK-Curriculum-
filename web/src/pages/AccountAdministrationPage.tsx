import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import {
  changeFamilyMemberEmailFn,
  resetFamilyMemberPasswordFn,
  useFamilyAccountAdministration,
  type FamilyAccountMember,
} from "../hooks/useAccountAdministration";

/**
 * Owner-only Family Account Administration (build-order step 11.2 —
 * Account Governance Addendum). Hidden from non-owners by App.tsx's route
 * gate (profile?.systemRole === "owner"), but that hiding is convenience
 * only — every action here calls a server-side callable that independently
 * re-verifies owner authority and family membership regardless of what
 * this page sends (functions/src/accountAdministration.ts).
 *
 * Deliberately does NOT expose: existing passwords (Firebase never
 * returns them to anyone, owner included), account deletion, or owner
 * transfer — none of those are in scope for this step.
 */
export function AccountAdministrationPage() {
  const { user } = useAuth();
  const { members, loading, error, refresh } = useFamilyAccountAdministration();
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"password" | "email" | null>(null);

  function closeForm() {
    setActiveUid(null);
    setActiveAction(null);
  }

  return (
    <AppShell>
      <div className="max-w-lg space-y-4">
        <div>
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Family Account Administration
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Owner-only. Reset a family member's password or change their login email. This
            never affects their educational records, mastery, hours, or certifications.
          </p>
        </div>

        {loading && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </p>
        )}
        {error && (
          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        {!loading && !error && (
          <ul className="space-y-3">
            {members.map((member) => (
              <li
                key={member.uid}
                className="rounded-xl border p-4 space-y-2 shadow-sm"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {member.displayName}
                      {member.uid === user?.uid && (
                        <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-secondary)" }}>
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {member.role === "teacher" ? "Teacher" : "Student"}
                      {member.systemRole === "owner" && " · Owner"}
                      {member.presentationIdentityId && ` · ${member.presentationIdentityId}`}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {member.email ?? "Login email not available"}
                      {member.email && !member.emailVerified && " (unverified)"}
                      {member.disabled && " · Account disabled"}
                    </p>
                  </div>
                </div>

                {activeUid === member.uid && activeAction === "password" && (
                  <ResetPasswordForm member={member} isSelf={member.uid === user?.uid} onDone={closeForm} onCancel={closeForm} />
                )}
                {activeUid === member.uid && activeAction === "email" && (
                  <ChangeEmailForm
                    member={member}
                    isSelf={member.uid === user?.uid}
                    onDone={() => {
                      closeForm();
                      refresh();
                    }}
                    onCancel={closeForm}
                  />
                )}

                {!(activeUid === member.uid) && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setActiveUid(member.uid);
                        setActiveAction("password");
                      }}
                      className="rounded-md border px-2 py-1 text-xs font-medium"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => {
                        setActiveUid(member.uid);
                        setActiveAction("email");
                      }}
                      className="rounded-md border px-2 py-1 text-xs font-medium"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      Change Email
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function ResetPasswordForm({
  member,
  isSelf,
  onDone,
  onCancel,
}: {
  member: FamilyAccountMember;
  isSelf: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    // Self-protection (section 7): an extra explicit confirmation step
    // when the owner is about to change their OWN password, so this
    // never happens as an accidental click.
    const confirmMessage = isSelf
      ? `You are about to change YOUR OWN password. You will need the new password to sign back in. Continue?`
      : `Reset ${member.displayName}'s password? They will need the new password to sign in.`;
    if (!confirm(confirmMessage)) return;

    setSaving(true);
    setError(null);
    try {
      await resetFamilyMemberPasswordFn({ targetUid: member.uid, newPassword });
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't reset that password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <label className="block text-xs space-y-1">
        <span style={{ color: "var(--text-secondary)" }}>New password</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--page)", color: "var(--text-primary)" }}
        />
      </label>
      <label className="block text-xs space-y-1">
        <span style={{ color: "var(--text-secondary)" }}>Confirm new password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--page)", color: "var(--text-primary)" }}
        />
      </label>
      {error && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          disabled={saving}
          onClick={handleSubmit}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {saving ? "Saving..." : "Set new password"}
        </button>
        <button
          disabled={saving}
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ChangeEmailForm({
  member,
  isSelf,
  onDone,
  onCancel,
}: {
  member: FamilyAccountMember;
  isSelf: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!newEmail.trim()) {
      setError("Enter a new email address.");
      return;
    }
    // Self-protection (section 7): an extra explicit confirmation step
    // when the owner is about to change the LOGIN EMAIL they sign in
    // with themselves.
    const confirmMessage = isSelf
      ? `You are about to change YOUR OWN login email to "${newEmail}". You will use this new address to sign in from now on. Continue?`
      : `Change ${member.displayName}'s login email to "${newEmail}"?`;
    if (!confirm(confirmMessage)) return;

    setSaving(true);
    setError(null);
    try {
      await changeFamilyMemberEmailFn({ targetUid: member.uid, newEmail: newEmail.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't change that email address.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <label className="block text-xs space-y-1">
        <span style={{ color: "var(--text-secondary)" }}>New login email</span>
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="w-full rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--page)", color: "var(--text-primary)" }}
        />
      </label>
      {error && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          disabled={saving}
          onClick={handleSubmit}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {saving ? "Saving..." : "Change email"}
        </button>
        <button
          disabled={saving}
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
