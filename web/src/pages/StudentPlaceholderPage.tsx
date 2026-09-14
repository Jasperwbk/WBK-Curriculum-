import { AppShell } from "../components/AppShell";

export function StudentPlaceholderPage() {
  return (
    <AppShell>
      <div
        className="rounded-xl border p-6 text-center shadow-sm"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div className="text-3xl mb-2" aria-hidden="true">
          🌻
        </div>
        <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Your view is coming soon
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          This app currently only has the teacher dashboard built. Your own
          screen is planned for a later update.
        </p>
      </div>
    </AppShell>
  );
}
