import type { Subject } from "./subjects";

export type PlacementKidKey = "millaray" | "makaio" | "maizley";
export type PlacementItemKind = "fixed" | "open" | "checklist" | "puzzle_level";

export interface PlacementTestItem {
  id: string;
  subject: Subject;
  skill: string;
  question: string;
  kind: PlacementItemKind;
  correctAnswer?: string;
}

/**
 * Mirrors functions/src/curriculum/placementTestItems.ts (Assessment 2.0
 * content) — kept in sync manually, same pattern as lib/subjects.ts
 * duplicating functions/src/subjects.ts. Source: curriculum/assessments/.
 */
export const PLACEMENT_TEST_ITEMS: Record<PlacementKidKey, readonly PlacementTestItem[]> = {
  millaray: [
    item("MA-01", "reading_language_arts", "reading fluency", "Read a short paragraph aloud, tell it back in own words", "open"),
    item("MA-02", "reading_language_arts", "descriptive writing", "Write 2–3 sentences about your favorite spot on our land", "open"),
    item("MA-03", "math", "addition", "7 + 8", "fixed", "15"),
    item("MA-04", "math", "subtraction", "23 − 9", "fixed", "14"),
    item("MA-05", "math", "multiplication", "6 × 4", "fixed", "24"),
    item("MA-06", "math", "money subtraction", "$20 − $12", "fixed", "$8"),
    item("MA-07", "math", "fractions", "3/4 pie, eat half of what's left", "fixed", "3/8 pie left"),
    item("MA-08", "social_studies_history", "Missouri knowledge", "Name one thing that makes Missouri unique", "open"),
    item("MA-09", "nature_identification", "land knowledge", "Name one plant or animal from our land and how it survives", "open"),
    item("MA-10", "science", "mechanical reasoning", "Builder's Challenge: pick something with moving parts, draw/describe how it works", "open"),
    item("MA-11", "math", "logic/critical thinking", "Bucket puzzle: 5-gal + 3-gal buckets, get exactly 4 gallons", "open"),
    item("MA-12", "bushcraft_outdoor_skills", "wayfinding", "Name one way to tell direction outdoors without a compass/phone", "open"),
    item("MA-13", "spiritual_cultural", "cipher decoding", "Decode the Wilderwood Cipher message", "open"),
  ],
  makaio: [
    item("MK-01", "reading_language_arts", "reading fluency", "Read a short paragraph aloud, tell it back in own words", "open"),
    item("MK-02", "reading_language_arts", "descriptive writing", "Write 2–3 sentences about your favorite spot on our land", "open"),
    item("MK-03", "math", "addition", "7 + 8", "fixed", "15"),
    item("MK-04", "math", "subtraction", "23 − 9", "fixed", "14"),
    item("MK-05", "math", "multiplication", "6 × 4", "fixed", "24"),
    item("MK-06", "math", "money subtraction", "$20 − $12", "fixed", "$8"),
    item("MK-07", "social_studies_history", "Missouri knowledge", "Name one thing that makes Missouri unique", "open"),
    item("MK-08", "nature_identification", "land knowledge", "Name one plant or animal from our land and how it survives", "open"),
    item("MK-09", "science", "mechanical reasoning", "Builder's Challenge: pick something with moving parts, draw/describe how it works", "open"),
    item("MK-10", "math", "logic/critical thinking", "Bucket puzzle: 5-gal + 3-gal buckets, get exactly 4 gallons", "open"),
    item("MK-11", "bushcraft_outdoor_skills", "wayfinding", "Name one way to tell direction outdoors without a compass/phone", "open"),
    item("MK-12", "spiritual_cultural", "cipher decoding", "Decode the Wilderwood Cipher message", "open"),
  ],
  maizley: [
    item("MZ-01", "reading_language_arts", "1-step direction", "Follows a one-step instruction (sit down, give it to me)", "checklist"),
    item("MZ-02", "reading_language_arts", "2-step direction", "Follows a two-step instruction (pick up the toy, put it in the box)", "checklist"),
    item("MZ-03", "reading_language_arts", "body vocabulary", "Points to a named body part", "checklist"),
    item("MZ-04", "math", "shape recognition", "Recognizes circle, square, triangle", "checklist"),
    item("MZ-05", "math", "color recognition", "Recognizes at least 3 colors", "checklist"),
    item("MZ-06", "math", "matching", "Can match same shapes or colors together", "checklist"),
    item("MZ-07", "math", "problem-solving", "Little Puzzle: simple maze/shape sorter/stacking cups", "puzzle_level"),
  ],
};

export const PUZZLE_LEVELS = ["No help", "A little guidance", "Needed hands-on help"] as const;

// The display-name-substring-inference helper that used to live here was
// removed (build-order step 9.1) — every web-side caller now resolves a student's
// PlacementKidKey from their stable presentationIdentityId instead; see
// lib/presentationIdentity.ts#kidKeyForPresentationIdentity and
// hooks/useStudentIdentity.ts. The functions-side inferKidKey
// (curriculum/placementTestItems.ts) is a separate, intentionally-kept
// legacy compatibility fallback reviewed in step 9 — not affected by this.

function item(
  id: string,
  subject: Subject,
  skill: string,
  question: string,
  kind: PlacementItemKind,
  correctAnswer?: string
): PlacementTestItem {
  return { id, subject, skill, question, kind, ...(correctAnswer ? { correctAnswer } : {}) };
}
