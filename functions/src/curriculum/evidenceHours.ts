import type { EvidenceBlockEntry, Subject } from "../types";

/**
 * Pure aggregation from an approved packet's blocks to official
 * instructional minutes, per subject (build-order step 6, requirement
 * 4/5/6). Only ever reads `approvedMinutes` — never `plannedMinutes` or
 * `reportedMinutes` — because only teacher-APPROVED minutes may become
 * official (evidencePackets.ts only calls this AFTER the approval
 * transaction has frozen every block's approvedMinutes).
 *
 * Deliberately ignores `assessmentEligible` and `completionState`
 * entirely: hours are not mastery (requirement 6) — a block excluded
 * from assessment, or one the teacher marked "excused", still reports
 * whatever real instructional minutes actually happened (typically 0 for
 * excused/not_started work, but that's the teacher's own reported figure,
 * never assumed or overridden here).
 */
export function aggregateApprovedMinutesBySubject(blocks: readonly EvidenceBlockEntry[]): Partial<Record<Subject, number>> {
  const totals: Partial<Record<Subject, number>> = {};
  for (const block of blocks) {
    const minutes = block.approvedMinutes ?? 0;
    if (minutes <= 0) continue;
    totals[block.subject] = (totals[block.subject] ?? 0) + minutes;
  }
  return totals;
}

/**
 * Deterministic `logs` doc id for one packet's one subject (build-order
 * step 6, hardened/exported in 6.1) — the SAME (packetId, subject) always
 * produces the SAME id, so re-running the hours-posting pass (via
 * reconciliation, a retried call, or any other reason) always overwrites
 * the identical doc rather than creating a duplicate. This is the actual
 * mechanism behind "official hour posting is idempotent" — preserved
 * unchanged from step 6 rather than replaced, per the 6.1 instruction to
 * strengthen rather than unnecessarily replace it.
 */
export function hourLogDocId(packetId: string, subject: string): string {
  return `evidence_${packetId}_${subject}`;
}
