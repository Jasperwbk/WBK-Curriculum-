import type { PlacementKidKey } from "../types";

/**
 * Contract for the Historical Figure Coloring system (Builder Guide §14,
 * Q1 Fall Consolidated §7), which supersedes the retired subject-ring
 * color-sheet rotation (see colorSheetRotation.ts). Independent of subject
 * rotation — a kid's featured historical person for the day is not tied to
 * any particular subject block.
 *
 * Types only for now. The actual selection logic (historical-breadth
 * weighting, American-history emphasis without excluding
 * Indigenous/pre-colonial/intersecting history, upcoming-lesson/trip
 * relevance, anti-repetition, and completed-art preservation) is build-order
 * step 8 — not implemented yet. Nothing in this file is wired into
 * generatePlan or any other runtime path until that step.
 */

/** A historical person available for the coloring/show-and-tell feature. */
export interface HistoricalFigure {
  /** Stable ID — never reuse after a figure is retired from the pool. */
  id: string;
  name: string;
  era: string;
  /** e.g. "Indigenous / pre-colonial", "Colonial America", "U.S. 19th century". */
  region: string;
  briefBio: string;
  /** Curriculum tie-ins this figure is relevant to (subjects, week themes). */
  relevanceTags: string[];
  /** Builder Guide §19 source/rights discipline. */
  provenance: {
    sourceTitle: string;
    authorOrInstitution?: string;
    urlOrFileRef?: string;
    retrievedOrVersionDate?: string;
    rightsStatus: string;
    allowedUseNotes?: string;
  };
}

/** One kid's featured historical figure for one school day. */
export interface HistoricalFigureSelection {
  kidKey: PlacementKidKey;
  date: string; // ISO date
  figureId: string;
  /** Why this figure was chosen today (relevance/variety reasoning), for teacher review. */
  selectionReason: string;
  artComplexityBand: string;
}

/**
 * Art-ability band per kid — how much line-art detail their coloring page
 * should carry. Carried over from the retired color-sheet system's
 * BAND_BY_KID; still the right complexity signal for Historical Figure
 * Coloring, just no longer tied to a subject-ring pick.
 */
export const ART_COMPLEXITY_BAND_BY_KID: Record<PlacementKidKey, string> = {
  millaray: "Band C (detailed scene, background allowed, ~15-20 min to color)",
  makaio: "Band B (one clear scene, 4-8 objects, some interior detail)",
  maizley: "Band A (2-4 giant objects, thick outlines, no background)",
};
