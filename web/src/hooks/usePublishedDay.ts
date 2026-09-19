import { useEffect, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { InstructionalStage, ItineraryMode } from "./useProposedDays";

/**
 * Client-side mirror of functions/src/types.ts's PublishedDay family
 * (build-order step 11, section 2) — the ONLY day-shaped document a
 * student may ever read. `proposedDays` stays teacher-only forever (see
 * firestore.rules); this is the narrow, explicitly-constructed
 * student-safe projection written by approveProposedDay itself.
 */
export interface PublishedLearningBlock {
  blockId: string;
  subject: string;
  title: string;
  stage: InstructionalStage;
  estimatedMinutes: number;
  required: boolean;
  order: number;
  dependsOn: { blockId: string }[];
  teacherLocked: boolean;
  activityFormat?: string;
  notes?: string;
  carriedForward: boolean;
  carryForwardReason?: string;
}

export interface PublishedHistoricalFigureClosing {
  figureId: string;
  name: string;
  era: string;
  briefBio: string;
  whyItMatters: string;
  artComplexityBand: string;
  showAndTellPrompt: string;
  recallQuestion: string;
  artworkAvailable: boolean;
}

export interface PublishedDay {
  familyId: string;
  studentId: string;
  date: string;
  proposedDayId: string;
  proposalVersion: number;
  itineraryMode: ItineraryMode;
  title: string;
  summary: string;
  planText: string;
  jasperMessage: string | null;
  learningBlocks: PublishedLearningBlock[];
  historicalFigureClosing: PublishedHistoricalFigureClosing | null;
  publishedAt: Timestamp;
}

/** Same (family, student, date) doc-id formula as functions/src/curriculum/publishedDay.ts#publishedDayDocId / evidencePacketDocId / studentProgress.ts#studentProgressDocId — all three collections key identically off a school day. */
export function publishedDayDocId(familyId: string, studentId: string, date: string): string {
  return `${familyId}_${studentId}_${date}`;
}

/**
 * Realtime read of the signed-in student's own approved day for `date`.
 * `publishedDay: null` while loading is indistinguishable from "nothing
 * approved yet" at the type level on purpose — both are ordinary states a
 * caller shows the same friendly "nothing today yet" message for; use
 * `loading` to tell them apart only if the distinction matters to the UI.
 */
export function usePublishedDay(familyId: string | undefined, studentId: string | undefined, date: string) {
  const [publishedDay, setPublishedDay] = useState<PublishedDay | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId || !studentId) {
      setPublishedDay(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, "publishedDays", publishedDayDocId(familyId, studentId, date));
    return onSnapshot(ref, (snap) => {
      setPublishedDay(snap.exists() ? (snap.data() as PublishedDay) : null);
      setLoading(false);
    });
  }, [familyId, studentId, date]);

  return { publishedDay, loading };
}
