import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium ${isActive ? "text-white" : ""}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--page)" }}>
      <header
        className="border-b px-4 py-3 flex items-center justify-between gap-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
            WBK Homeschool
          </span>
          <nav className="flex items-center gap-1 ml-4">
            <NavLink
              to="/"
              end
              className={navLinkClass}
              style={({ isActive }) => ({
                background: isActive ? "var(--series-1)" : "transparent",
                color: isActive ? "#ffffff" : "var(--text-secondary)",
              })}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/log"
              className={navLinkClass}
              style={({ isActive }) => ({
                background: isActive ? "var(--series-1)" : "transparent",
                color: isActive ? "#ffffff" : "var(--text-secondary)",
              })}
            >
              Log activity
            </NavLink>
            <NavLink
              to="/plan"
              className={navLinkClass}
              style={({ isActive }) => ({
                background: isActive ? "var(--series-1)" : "transparent",
                color: isActive ? "#ffffff" : "var(--text-secondary)",
              })}
            >
              Plan a day
            </NavLink>
            <NavLink
              to="/placement"
              className={navLinkClass}
              style={({ isActive }) => ({
                background: isActive ? "var(--series-1)" : "transparent",
                color: isActive ? "#ffffff" : "var(--text-secondary)",
              })}
            >
              Placement test
            </NavLink>
          </nav>
        </div>
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
      </header>
      <main className="p-4 max-w-3xl mx-auto">{children}</main>
    </div>
  );
}
