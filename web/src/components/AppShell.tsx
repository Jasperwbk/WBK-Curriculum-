import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/log", label: "Log activity", end: false },
  { to: "/plan", label: "Plan a day", end: false },
  { to: "/placement", label: "Placement test", end: false },
  { to: "/checkin", label: "Weekly check-in", end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: "var(--page)" }}>
      <header
        className="border-b px-4 py-3 space-y-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span
            className="brand-heading text-lg font-semibold flex items-center gap-1.5"
            style={{ color: "var(--text-primary)" }}
          >
            <span aria-hidden="true">🌾</span> WBK Homeschool
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>{profile?.displayName}</span>
            <button
              onClick={() => signOut()}
              className="rounded-md border px-3 py-1.5 font-medium"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Horizontally scrollable on narrow screens instead of clipping/
            overflowing — every tab stays reachable at phone width. */}
        <nav className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 pb-1">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0"
              style={({ isActive }) => ({
                background: isActive ? "var(--series-1)" : "var(--surface-2)",
                color: isActive ? "#ffffff" : "var(--text-secondary)",
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="p-4 max-w-3xl mx-auto">{children}</main>
    </div>
  );
}
