import { useAuth } from "../context/AuthContext";
import { kidKeyForPresentationIdentity } from "../lib/presentationIdentity";
import type { PlacementKidKey } from "../lib/placementTestItems";

export type StudentIdentityStatus = "ready" | "setup_required";

export interface StudentIdentityResult {
  status: StudentIdentityStatus;
  kidKey: PlacementKidKey | null;
}

/**
 * Resolves the CURRENTLY SIGNED-IN student's own canonical PlacementKidKey
 * (build-order step 9.1) — the one place StudentHomePage/
 * StudentPlacementPage/etc. should read this from, instead of each parsing
 * `profile.displayName` itself. Reads only `profile.presentationIdentityId`
 * — never displayName, email, or any other name-shaped field — and never
 * falls back to the retired `inferKidKey` when it's unset.
 *
 * `status: "setup_required"` means exactly that: this account has no
 * bootstrapped presentationIdentityId yet. Callers show an age-appropriate
 * "ask your teacher" state, never a technical error, and never guess a
 * kidKey to unblock the child in the meantime.
 */
export function useStudentIdentity(): StudentIdentityResult {
  const { profile } = useAuth();
  const kidKey = kidKeyForPresentationIdentity(profile?.presentationIdentityId ?? null);
  return kidKey ? { status: "ready", kidKey } : { status: "setup_required", kidKey: null };
}
