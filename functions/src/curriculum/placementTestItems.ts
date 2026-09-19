import type { PlacementItemKind, PlacementKidKey, PlacementTestItem } from "../types";

/**
 * Transcribed directly from curriculum/assessments/{kid}_assessment2_rubric.md
 * and {kid}_assessment2_content.md (Assessment 2.0). These are one-time
 * placement tests, not a rotating pool — no alternates/variants needed.
 *
 * Millaray & Makaio: scored, in-app. Only the fixed-numeric-answer math
 * items ("fixed") have a single correct answer graded automatically —
 * everything else ("open") is scored by the teacher's own judgment call,
 * per each rubric's notes (fluency level, reasoning quality, etc).
 *
 * Maizley: not scored at all — a checklist ("checklist") logged Y/N, plus
 * one puzzle item logged by help-level ("puzzle_level") rather than
 * correct/incorrect. Per curriculum/maizley_track_clarification.md, this
 * feeds a printable worksheet/lesson plan for Sarah, not app scoring.
 */
export const PLACEMENT_TEST_ITEMS: Record<PlacementKidKey, readonly PlacementTestItem[]> = {
  millaray: [
    item("MA-01", "reading_language_arts", "reading fluency",
      "Read a short paragraph aloud, tell it back in own words", "open"),
    item("MA-02", "reading_language_arts", "descriptive writing",
      "Write 2–3 sentences about your favorite spot on our land", "open"),
    item("MA-03", "math", "addition", "7 + 8", "fixed", "15"),
    item("MA-04", "math", "subtraction", "23 − 9", "fixed", "14"),
    item("MA-05", "math", "multiplication", "6 × 4", "fixed", "24"),
    item("MA-06", "math", "money subtraction", "$20 − $12", "fixed", "$8"),
    item("MA-07", "math", "fractions", "3/4 pie, eat half of what's left", "fixed", "3/8 pie left"),
    item("MA-08", "social_studies_history", "Missouri knowledge",
      "Name one thing that makes Missouri unique", "open"),
    item("MA-09", "nature_identification", "land knowledge",
      "Name one plant or animal from our land and how it survives", "open"),
    item("MA-10", "science", "mechanical reasoning",
      "Builder's Challenge: pick something with moving parts, draw/describe how it works", "open"),
    item("MA-11", "math", "logic/critical thinking",
      "Bucket puzzle: 5-gal + 3-gal buckets, get exactly 4 gallons", "open"),
    item("MA-12", "bushcraft_outdoor_skills", "wayfinding",
      "Name one way to tell direction outdoors without a compass/phone", "open"),
    item("MA-13", "spiritual_cultural", "cipher decoding",
      "Decode the Wilderwood Cipher message", "open"),
  ],
  makaio: [
    item("MK-01", "reading_language_arts", "reading fluency",
      "Read a short paragraph aloud, tell it back in own words", "open"),
    item("MK-02", "reading_language_arts", "descriptive writing",
      "Write 2–3 sentences about your favorite spot on our land", "open"),
    item("MK-03", "math", "addition", "7 + 8", "fixed", "15"),
    item("MK-04", "math", "subtraction", "23 − 9", "fixed", "14"),
    item("MK-05", "math", "multiplication", "6 × 4", "fixed", "24"),
    item("MK-06", "math", "money subtraction", "$20 − $12", "fixed", "$8"),
    item("MK-07", "social_studies_history", "Missouri knowledge",
      "Name one thing that makes Missouri unique", "open"),
    item("MK-08", "nature_identification", "land knowledge",
      "Name one plant or animal from our land and how it survives", "open"),
    item("MK-09", "science", "mechanical reasoning",
      "Builder's Challenge: pick something with moving parts, draw/describe how it works", "open"),
    item("MK-10", "math", "logic/critical thinking",
      "Bucket puzzle: 5-gal + 3-gal buckets, get exactly 4 gallons", "open"),
    item("MK-11", "bushcraft_outdoor_skills", "wayfinding",
      "Name one way to tell direction outdoors without a compass/phone", "open"),
    item("MK-12", "spiritual_cultural", "cipher decoding",
      "Decode the Wilderwood Cipher message", "open"),
  ],
  maizley: [
    item("MZ-01", "reading_language_arts", "1-step direction",
      "Follows a one-step instruction (sit down, give it to me)", "checklist"),
    item("MZ-02", "reading_language_arts", "2-step direction",
      "Follows a two-step instruction (pick up the toy, put it in the box)", "checklist"),
    item("MZ-03", "reading_language_arts", "body vocabulary",
      "Points to a named body part", "checklist"),
    item("MZ-04", "math", "shape recognition",
      "Recognizes circle, square, triangle", "checklist"),
    item("MZ-05", "math", "color recognition",
      "Recognizes at least 3 colors", "checklist"),
    item("MZ-06", "math", "matching",
      "Can match same shapes or colors together", "checklist"),
    item("MZ-07", "math", "problem-solving",
      "Little Puzzle: simple maze/shape sorter/stacking cups", "puzzle_level"),
  ],
};

/** Human-facing answer-key/scoring-note text, keyed by item id. Teacher-facing only. */
export const PLACEMENT_SCORING_NOTES: Record<string, string> = {
  "MA-01": "No fixed answer — note fluency level (smooth/some help/lots of help) and whether the retelling captures the gist vs. fragments.",
  "MA-02": "No fixed answer — note clear, connected thoughts vs. fragments.",
  "MA-08": "Open-ended — look for a real, reasoned fact, not just any word.",
  "MA-09": "Open-ended — look for an actual survival mechanism named, not just an ID.",
  "MA-10": "Open-ended — look for correct cause-effect explanation of the mechanism.",
  "MA-11": "One valid path: fill 5-gal, pour into 3-gal (2 gal left in 5-gal) → empty 3-gal → pour the 2 gal into 3-gal → fill 5-gal again → top off 3-gal (uses 1 gal) → 4 gal remains in 5-gal. Credit any valid path — look for reasoning, not the exact steps.",
  "MA-12": "Open-ended — sun position, moss, star navigation, etc. — any valid method.",
  "MA-13": 'Decodes to: "You Are Doing Great"',
  "MK-01": "No fixed answer — note fluency level and whether retelling captures the gist.",
  "MK-02": "No fixed answer — note clear, connected thoughts vs. fragments.",
  "MK-07": "Open-ended — look for a real, reasoned fact.",
  "MK-08": "Open-ended — look for a real survival mechanism, not just an ID.",
  "MK-09": "Open-ended — look for a correct cause-effect explanation.",
  "MK-10": "Same valid path as Millaray's version — credit any valid reasoning, not just one path.",
  "MK-11": "Open-ended — any valid method.",
  "MK-12": 'Decodes to: "You Are Doing Great"',
  "MZ-01": 'Y/N — not a red flag if N, comprehension/attention still developing.',
  "MZ-07": "Log level: no help / a little guidance / hands-on help — watching persistence, not speed.",
};

// The display-name-substring-inference helper that used to live here
// (inferKidKey) was removed (build-order step 9.2) — the last backend
// caller (identity/presentationIdentity.ts's resolveKidKeyForStudent) had
// its own display-name fallback removed in the same step, per the locked
// policy: an account missing a stable presentationIdentityId is treated
// as requiring setup, never identified by what its displayName contains.
// See identity/presentationIdentity.ts for the current, stable-id-only
// resolution path.

function item(
  id: string,
  subject: PlacementTestItem["subject"],
  skill: string,
  question: string,
  kind: PlacementItemKind,
  correctAnswer?: string
): PlacementTestItem {
  return { id, subject, skill, question, kind, ...(correctAnswer ? { correctAnswer } : {}) };
}
