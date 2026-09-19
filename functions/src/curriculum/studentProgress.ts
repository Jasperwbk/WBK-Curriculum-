import type { PacketBlockCompletionState, StudentBlockProgressState } from "../types";

/**
 * Student progress (build-order step 11, sections 5/6) — the smallest
 * safe mechanism for a student's own "not started / in progress /
 * completed" signal to reach the teacher's closeout as a starting point,
 * without a second, disconnected completion system. See
 * studentProgress.ts (the callable) for how this connects to
 * EndOfDayEvidencePacket, and types.ts's StudentDayProgress doc comment
 * for the full design rationale.
 */

/** Deterministic — one progress record per (family, student, date), same id formula as evidencePacketStore.ts#evidencePacketDocId and publishedDay.ts#publishedDayDocId, so all three collections key identically off a school day. */
export function studentProgressDocId(familyId: string, studentId: string, date: string): string {
  return `${familyId}_${studentId}_${date}`;
}

const VALID_STATES: readonly StudentBlockProgressState[] = ["not_started", "in_progress", "completed"];

/**
 * The one validation that structurally guarantees a student can never
 * self-excuse work (spec section 5): "excused" is a real
 * PacketBlockCompletionState a teacher can set, but it is deliberately
 * NOT in this list, so no client input can ever produce it through this
 * path — see studentProgress.ts's updateBlockProgress, the only writer of
 * this state.
 */
export function isStudentBlockProgressState(value: unknown): value is StudentBlockProgressState {
  return typeof value === "string" && (VALID_STATES as readonly string[]).includes(value);
}

/**
 * A StudentBlockProgressState is a strict subset of PacketBlockCompletionState
 * (which also has "excused") — this identity function exists only to name
 * that widening at the one call site that mirrors a student's state onto
 * an EvidenceBlockEntry, so the safety property ("this value can never be
 * 'excused'") is visible at the point of use, not just implied by a type
 * annotation.
 */
export function toPacketCompletionState(state: StudentBlockProgressState): PacketBlockCompletionState {
  return state;
}
