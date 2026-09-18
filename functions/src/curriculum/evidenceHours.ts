import type { EvidenceBlockEntry, Subject } from "../types";

/**
 * Subjects that are a REQUIRED part of the daily plan but never post
 * official instructional/compliance hours — an explicit, standing
 * program rule (build-order step 7, Cory's decision), not an artifact of
 * `computeSubjectWeights` happening to compute a weight of 0 for them.
 * "Required for the daily routine" and "counts toward compliance hours"
 * are deliberately independent dimensions; this set is what encodes the
 * second one being "no" for a subject where the first is still "yes" —
 * required-ness itself lives on each block's own `required` field
 * (server-enforced true for physical_education in blockValidation.ts),
 * completely unaffected by this set.
 *
 * `physical_education`: PE is required every school day (see
 * proposedDays.ts/blockValidation.ts), but Cory's policy is that it is
 * non-hour-bearing for Missouri instructional/compliance purposes —
 * regular movement, fitness, and play, not another hour-bank subject.
 * Teachers still record completion/observations/demonstrated skills and
 * may report actual movement minutes on the block itself (preserved in
 * the packet's own history, per evidenceValidation.ts) — that data simply
 * never becomes an official `logs` entry via this pipeline.
 */
export const NON_HOUR_BEARING_SUBJECTS: ReadonlySet<Subject> = new Set<Subject>(["physical_education"]);

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
 *
 * A block whose subject is in NON_HOUR_BEARING_SUBJECTS (build-order step
 * 7) is skipped entirely regardless of its approvedMinutes — this is the
 * one enforcement point for "PE minutes must never flow into official
 * instructional/compliance-hour totals": a subject-generic gate, not a
 * mastery/completion gate, so a PE block's completion state and reported
 * minutes remain fully intact in the packet itself (see
 * evidenceValidation.ts) — they simply never produce a `logs` doc.
 */
export function aggregateApprovedMinutesBySubject(blocks: readonly EvidenceBlockEntry[]): Partial<Record<Subject, number>> {
  const totals: Partial<Record<Subject, number>> = {};
  for (const block of blocks) {
    if (NON_HOUR_BEARING_SUBJECTS.has(block.subject)) continue;
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
