import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      setError("Couldn't sign in. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--page)" }}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border p-6 space-y-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            WBK Homeschool
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Sign in to continue
          </p>
        </div>

        <label className="block text-sm space-y-1">
          <span style={{ color: "var(--text-secondary)" }}>Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
          />
        </label>

        <label className="block text-sm space-y-1">
          <span style={{ color: "var(--text-secondary)" }}>Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--page)" }}
          />
        </label>

        {error && (
          <p className="text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
