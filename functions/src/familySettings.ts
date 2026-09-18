import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireCaller, requireTeacher } from "./util/auth";

const MAX_CLOSING_WORDS_LENGTH = 2000;

interface UpdateFamilyClosingWordsRequest {
  closingWords: string;
}

/**
 * Validates and normalizes a submitted closingWords value — pure, so the
 * callable's input handling is directly unit-testable without Firestore
 * (build-order step 8.1). An empty string is valid and meaningful ("not
 * set yet"), never coerced into a placeholder.
 */
export function sanitizeClosingWords(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "closingWords must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_CLOSING_WORDS_LENGTH) {
    throw new HttpsError("invalid-argument", `closingWords is too long (${MAX_CLOSING_WORDS_LENGTH} character max).`);
  }
  return trimmed;
}

/**
 * The exact Firestore update payload this feature is allowed to write —
 * a pure function whose return TYPE (`{ closingWords: string }`, no index
 * signature) makes it a compile-time guarantee, not just a runtime habit,
 * that this feature can never smuggle any other Family field into a
 * write (build-order step 8.1, requirement: "does not create an unsafe
 * generic client-write path to unrelated Family fields"). Factored out
 * specifically so that guarantee is unit-testable on its own, independent
 * of Firestore.
 */
export function buildClosingWordsUpdate(closingWords: string): { closingWords: string } {
  return { closingWords };
}

/**
 * The one narrowly-scoped, teacher-authorized way to set the family's own
 * closing motto/prayer (build-order step 8.1 correction). Previously
 * `EndOfDayClosingPage.tsx` wrote `closingWords` via a direct client-side
 * `updateDoc` against `families/{familyId}` — students were already
 * correctly blocked (firestore.rules' `isTeacherInFamily` checks role,
 * not just family, and `requireTeacher` below independently re-checks the
 * same thing server-side), but that path still exercised the family
 * doc's blanket `allow write: if isTeacherInFamily(familyId)` rule,
 * unrestricted to any field. That rule is now `allow write: if false`
 * (matching every other Cloud-Function-only collection); this callable
 * is the only way any field on a family doc gets written from client
 * code, and it only ever touches `closingWords` (via
 * `buildClosingWordsUpdate` above), on the CALLER's OWN family (never a
 * client-supplied familyId — there's no `familyId` parameter at all) —
 * no write path can reach any other Family field or a different
 * family's document through it.
 *
 * Deliberately a plain onCall, not routed through approvals.ts — this is
 * ordinary teacher self-service editing of their own family's setting,
 * not a governed curriculum decision needing propose/review/approve/audit.
 *
 * Never invents or defaults the actual wording — an empty string is a
 * valid, meaningful "not set yet" value, exactly like the field's
 * undefined starting state.
 */
export const updateFamilyClosingWords = onCall<UpdateFamilyClosingWordsRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const trimmed = sanitizeClosingWords(request.data?.closingWords);

  const db = getFirestore();
  await db.collection("families").doc(caller.profile.familyId).update(buildClosingWordsUpdate(trimmed));

  return { closingWords: trimmed };
});
