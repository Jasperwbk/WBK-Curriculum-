/**
 * Shown on a student-facing screen when `presentationIdentityId` hasn't
 * been bootstrapped for this account yet (build-order step 9.1, section
 * 4) — deliberately age-appropriate and non-technical. Never a fallback
 * mechanism; the underlying feature simply doesn't run until a teacher
 * assigns this account's identity from the Identities page.
 */
export function StudentSetupRequiredNotice() {
  return (
    <div
      className="rounded-xl border p-5 text-center space-y-2 shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <div className="text-3xl" aria-hidden="true">
        🔧
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Your school profile needs to be linked before this activity can start. Ask your teacher!
      </p>
    </div>
  );
}
