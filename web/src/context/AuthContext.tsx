import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export interface UserProfile {
  familyId: string;
  displayName: string;
  role: "teacher" | "student";
  characterMapping: string | null;
  gradeLabel: string | null;
  assessmentBaseline: Record<string, string>;
  /** Stable presentation-identity id (build-order step 9) — "jasper" | "celeste" | "kira" | "ro" | "nova" | null. See lib/presentationIdentity.ts. */
  presentationIdentityId: string | null;
  /**
   * System/account authority (build-order step 11.2) — "owner" | "standard"
   * | undefined (absent means "standard"). PRESENTATION/ROUTING ONLY on
   * this side, exactly like every other profile field: it decides whether
   * the Account Administration nav item and page are shown, nothing more.
   * The real security boundary is server-side (functions/src/util/
   * auth.ts#requireOwner) — every account-administration callable
   * re-verifies this from the caller's own stored profile regardless of
   * what this client-side value says, so hiding the UI is a convenience,
   * never the actual protection.
   */
  systemRole?: "owner" | "standard";
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (!nextUser) setProfile(null);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileLoading(true);
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setProfileLoading(false);
    });
  }, [user]);

  const value: AuthContextValue = {
    user,
    profile,
    loading: authLoading || (!!user && profileLoading),
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOut: () => firebaseSignOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
