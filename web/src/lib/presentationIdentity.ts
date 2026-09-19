import type { PlacementKidKey } from "./placementTestItems";

/**
 * Client-side mirror of functions/src/identity/presentationIdentity.ts's
 * registry (build-order step 9/9.1) — display-only data plus the one
 * derived value (a student's PlacementKidKey) this app's UI is allowed to
 * read off a presentation identity. Never used for any authorization
 * decision on this side; every callable re-validates identity/ownership
 * server-side regardless of what this file says (build-order step 9.1,
 * section 3: presentation identity is presentation/configuration only,
 * never a security credential).
 *
 * functions/ and web/ are separate TS projects with no shared build, so
 * this is a manually-mirrored duplicate (same pattern as lib/subjects.ts
 * mirroring functions/src/subjects.ts) rather than a shared import.
 * functions/src/identity/presentationIdentity.test.ts locks this file's
 * STUDENT_PRESENTATION_TO_KID_KEY values to the same mapping the
 * functions-side registry uses, so the two can't silently drift apart.
 */
export type PresentationIdentityId = "jasper" | "celeste" | "kira" | "ro" | "nova";
export type StudentPresentationIdentityId = "kira" | "ro" | "nova";

export interface PresentationIdentityOption {
  id: PresentationIdentityId;
  role: "teacher" | "student";
  label: string;
}

export const PRESENTATION_IDENTITY_OPTIONS: PresentationIdentityOption[] = [
  { id: "jasper", role: "teacher", label: "Jasper" },
  { id: "celeste", role: "teacher", label: "Celeste" },
  { id: "kira", role: "student", label: "Kira" },
  { id: "ro", role: "student", label: "Ro" },
  { id: "nova", role: "student", label: "Nova" },
];

/** The ONLY place a presentation identity is ever mapped to a PlacementKidKey on this side — every page that needs a student's kidKey goes through kidKeyForPresentationIdentity below instead of re-deriving this switch itself. */
export const STUDENT_PRESENTATION_TO_KID_KEY: Record<StudentPresentationIdentityId, PlacementKidKey> = {
  kira: "millaray",
  ro: "makaio",
  nova: "maizley",
};

export function isStudentPresentationIdentityId(id: unknown): id is StudentPresentationIdentityId {
  return id === "kira" || id === "ro" || id === "nova";
}

export function presentationIdentityLabel(id: string | null): string | null {
  if (!id) return null;
  return PRESENTATION_IDENTITY_OPTIONS.find((o) => o.id === id)?.label ?? null;
}

/**
 * The single web-side resolver from a stored presentationIdentityId to a
 * student's canonical PlacementKidKey (build-order step 9.1) — never
 * derived from displayName, email, or any other name-shaped input. Returns
 * null for a teacher identity ("jasper"/"celeste"), an unrecognized value,
 * or (critically) `null` itself — a not-yet-bootstrapped account gets null
 * here, NOT a display-name-inferred guess; every caller must treat null as
 * "setup required," never silently fall back to another mechanism.
 */
export function kidKeyForPresentationIdentity(id: string | null | undefined): PlacementKidKey | null {
  if (!id || !isStudentPresentationIdentityId(id)) return null;
  return STUDENT_PRESENTATION_TO_KID_KEY[id];
}
