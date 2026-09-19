/**
 * Client-side mirror of functions/src/identity/presentationIdentity.ts's
 * registry (build-order step 9) — display-only data (labels/role for
 * rendering the identity-assignment panel), never used for any
 * authorization decision on this side; the callable re-validates
 * everything server-side regardless of what this file says.
 */
export type PresentationIdentityId = "jasper" | "celeste" | "kira" | "ro" | "nova";

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

export function presentationIdentityLabel(id: string | null): string | null {
  if (!id) return null;
  return PRESENTATION_IDENTITY_OPTIONS.find((o) => o.id === id)?.label ?? null;
}
