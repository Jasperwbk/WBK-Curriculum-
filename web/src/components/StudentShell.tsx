import { type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export function StudentShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: "var(--page)" }}>
      <header
        className="border-b px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <span
          className="brand-heading text-lg font-semibold flex items-center gap-1.5"
          style={{ color: "var(--text-primary)" }}
        >
          <span aria-hidden="true">🌻</span> {profile?.displayName}
        </span>
        <button
          onClick={() => signOut()}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Sign out
        </button>
      </header>
      <main className="p-4 max-w-lg mx-auto">{children}</main>
    </div>
  );
}
