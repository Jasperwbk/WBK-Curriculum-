import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { StudentShell } from "../components/StudentShell";
import { AskForHelpWidget } from "../components/AskForHelpWidget";
import { inferKidKey } from "../lib/placementTestItems";

type Status = "loading" | "not_started" | "pending_review" | "done" | "not_applicable";

export function StudentHomePage() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<Status>("loading");

  const kidKey = profile ? inferKidKey(profile.displayName) : null;
  const selfService = kidKey === "millaray" || kidKey === "makaio";

  useEffect(() => {
    if (!user) return;
    if (!selfService) {
      setStatus("not_applicable");
      return;
    }
    (async () => {
      const [finalizedSnap, pendingSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "placementTests"),
            where("userId", "==", user.uid),
            where("scored", "==", true)
          )
        ),
        getDocs(query(collection(db, "placementSubmissions"), where("userId", "==", user.uid))),
      ]);
      if (!finalizedSnap.empty) setStatus("done");
      else if (!pendingSnap.empty) setStatus("pending_review");
      else setStatus("not_started");
    })();
  }, [user, selfService]);

  return (
    <StudentShell>
      <div className="text-center space-y-4 mt-6">
        <div className="text-4xl" aria-hidden="true">
          👋
        </div>
        <h1 className="brand-heading text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Hi {profile?.displayName}!
        </h1>

        {status === "loading" && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </p>
        )}

        {status === "not_applicable" && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Your teacher will work on this with you directly — nothing to do here right now.
          </p>
        )}

        {status === "not_started" && (
          <div
            className="rounded-xl border p-5 space-y-3 shadow-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              You have a Placement Test waiting for you! It helps your teacher figure out the best
              lessons for you.
            </p>
            <Link
              to="/placement"
              className="inline-block w-full rounded-md px-4 py-2.5 text-sm font-medium text-white"
              style={{ background: "var(--series-1)" }}
            >
              Start my placement test
            </Link>
          </div>
        )}

        {status === "pending_review" && (
          <div
            className="rounded-xl border p-5 shadow-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              🎉 You already finished your Placement Test! Your teacher is looking it over. Great
              job!
            </p>
          </div>
        )}

        {status === "done" && (
          <div
            className="rounded-xl border p-5 shadow-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              ✅ Your Placement Test is all done! Your teacher is picking out your lessons. More
              will show up here soon.
            </p>
          </div>
        )}

        <div className="text-left">
          <AskForHelpWidget />
        </div>
      </div>
    </StudentShell>
  );
}
