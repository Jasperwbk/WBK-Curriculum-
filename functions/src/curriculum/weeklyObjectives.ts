import type { WeeklyObjective } from "../types";

/**
 * Transcribed from curriculum/q1_fall/millaray_week1_retrofit.md and the
 * Week 1 section of curriculum/q1_fall/makaio_weeks1-9_retrofit.md.
 *
 * Week 1 only, deliberately — the Millaray retrofit file itself frames
 * Week 1 as a pilot ("If this shape works for you, I'll carry it through
 * Weeks 2-9 for her, then do Makaio and Maizley the same way"). This
 * catalog follows the same staging: prove the check-in mechanism end to
 * end on Week 1 before transcribing the other 8 weeks for each kid.
 *
 * Scoped to Millaray & Makaio only — the scored mastery-threshold track.
 * Maizley's Week 1 checks (curriculum/q1_fall/maizley_weeks1-9_retrofit.md)
 * are Y/N-only with no mastery gate, per her track's "participation over
 * mastery" design (curriculum/maizley_track_clarification.md) — informal
 * for now rather than wired into this same mechanism.
 */
export const WEEK1_OBJECTIVES: Record<"millaray" | "makaio", readonly WeeklyObjective[]> = {
  millaray: [
    obj("millaray-w1-rla-1", 1, "reading_language_arts",
      "Write a structured 3-paragraph descriptive entry on a harvest task",
      ["Name one sensory detail you could add to a harvest sentence.",
       "Read your paragraph back — does it have a beginning, middle, end?"]),
    obj("millaray-w1-rla-2", 1, "reading_language_arts",
      "Use 5+ sensory/descriptive words correctly",
      ["Give me a word for how a tomato feels, not just looks.",
       "Point to one descriptive word in today's writing and say what sense it's for."]),
    obj("millaray-w1-rla-3", 1, "reading_language_arts",
      "Correctly punctuate compound sentences",
      ['"I picked tomatoes ___ I sorted them by size." (fill the joiner + comma)',
       "Find one compound sentence in your own paragraph."]),

    obj("millaray-w1-math-1", 1, "math",
      "Weigh/record produce to the nearest oz/lb",
      ["This bowl weighs 2 lb 4 oz — how many total ounces?",
       "Weigh one real item, record it correctly."]),
    obj("millaray-w1-math-2", 1, "math",
      "Calculate price-per-lb and total value",
      ["5 lb at $2/lb — total?", "$15 for 5 lb — what's the price per lb?"]),
    obj("millaray-w1-math-3", 1, "math",
      "Convert oz↔lb at 90%+ accuracy",
      ["32 oz = how many lb?", "2.5 lb = how many oz?"]),

    obj("millaray-w1-science-1", 1, "science",
      "Label the harvested part on 5 plants",
      ["A carrot — root, stem, or fruit?", "A pumpkin holds seeds — what part is it?"]),
    obj("millaray-w1-science-2", 1, "science",
      "Explain why the plant produces that part",
      ["Why does a plant make fruit, in one sentence?"]),
    obj("millaray-w1-science-3", 1, "science",
      "Diagram a seed-to-harvest life cycle",
      ["What comes right after 'seed' in the cycle?"]),

    obj("millaray-w1-ss-1", 1, "social_studies_history",
      "Describe 2 Osage food-gathering/preservation practices",
      ["Name one thing the Osage grew or gathered."]),
    obj("millaray-w1-ss-2", 1, "social_studies_history",
      "Compare to our homestead harvest",
      ["What's one way our harvest is similar to theirs?"]),
    obj("millaray-w1-ss-3", 1, "social_studies_history",
      "Locate Osage range vs. Webster County on a map",
      ["Point to Webster County without looking at the label."]),

    obj("millaray-w1-bushcraft-1", 1, "bushcraft_outdoor_skills",
      "Demonstrate safe knife handling incl. blood circle rule",
      ["What is the blood circle?"]),
    obj("millaray-w1-bushcraft-2", 1, "bushcraft_outdoor_skills",
      "Process a natural fiber into cordage",
      ["What plant part did you use for cordage today?"]),
    obj("millaray-w1-bushcraft-3", 1, "bushcraft_outdoor_skills",
      "State 2 survival uses for cordage",
      ["Name one thing cordage is used for in a survival kit."]),

    obj("millaray-w1-homestead-1", 1, "homestead_skills",
      "Explain water-bath vs. pressure canning, when each applies",
      ["Is jam high-acid or low-acid? Which method does it need?"]),
    obj("millaray-w1-homestead-2", 1, "homestead_skills",
      "Describe every step of a canning session",
      ["What's the step right after packing the jars?"]),
    obj("millaray-w1-homestead-3", 1, "homestead_skills",
      "Identify 2 signs of improper seal/spoilage",
      ["Lid popped up — good seal or bad?"]),

    obj("millaray-w1-nature-1", 1, "nature_identification",
      "Identify 5 fruiting/seeding plants on the property",
      ["Point to and name one plant without prompting."]),
    obj("millaray-w1-nature-2", 1, "nature_identification",
      "Distinguish one safe-to-eat plant from a dangerous look-alike",
      ["What's the one key difference between the pair you found today?"]),
    obj("millaray-w1-nature-3", 1, "nature_identification",
      "Log IDs with location notes",
      ["Read back one log entry — does it have a location noted?"]),

    obj("millaray-w1-spiritual-1", 1, "spiritual_cultural",
      "Explain the harvest blót's place in the calendar",
      ["What season does the harvest blót mark?"]),
    obj("millaray-w1-spiritual-2", 1, "spiritual_cultural",
      "Compare to Osage/Cherokee harvest-gratitude practices",
      ["Name one thing the traditions we've looked at have in common."]),
  ],
  makaio: [
    obj("makaio-w1-rla-1", 1, "reading_language_arts", "3–5 sentences on a harvest task",
      ["Read me one sentence."]),
    obj("makaio-w1-rla-2", 1, "reading_language_arts", "Spell 10 harvest words",
      ["Quiz 2-3 aloud."]),
    obj("makaio-w1-rla-3", 1, "reading_language_arts", "Read own entry aloud",
      ["Listen for smoothness."]),

    obj("makaio-w1-math-1", 1, "math", "Count/record by type",
      ["How many apples total?"]),
    obj("makaio-w1-math-2", 1, "math", "Tally chart by size/color",
      ["Which group has more?"]),
    obj("makaio-w1-math-3", 1, "math", "5 add/subtract word problems",
      ["One on the spot."]),

    obj("makaio-w1-science-1", 1, "science", "Label root/stem/leaf/fruit/seed",
      ["Point to the root."]),
    obj("makaio-w1-science-2", 1, "science", "One sentence per part's job",
      ["What does a leaf do?"]),
    obj("makaio-w1-science-3", 1, "science", "Match 3 foods to plant part",
      ["Is a carrot a root or a fruit?"]),

    obj("makaio-w1-ss-1", 1, "social_studies_history", "One Osage food", ["Name it."]),
    obj("makaio-w1-ss-2", 1, "social_studies_history", "Point to Webster County", ["On the map."]),
    obj("makaio-w1-ss-3", 1, "social_studies_history", "One similarity to our harvest",
      ["What's alike?"]),

    obj("makaio-w1-bushcraft-1", 1, "bushcraft_outdoor_skills", "Recite knife rules",
      ["Say one rule."]),
    obj("makaio-w1-bushcraft-2", 1, "bushcraft_outdoor_skills", "Safe hand position",
      ["Watch and confirm."]),
    obj("makaio-w1-bushcraft-3", 1, "bushcraft_outdoor_skills", "Blood circle",
      ["What is it?"]),

    obj("makaio-w1-homestead-1", 1, "homestead_skills", "2 steps of water-bath canning",
      ["Name one."]),
    obj("makaio-w1-homestead-2", 1, "homestead_skills", "Help with a real step",
      ["Watch."]),
    obj("makaio-w1-homestead-3", 1, "homestead_skills", "Why we preserve",
      ["Why do we do this?"]),

    obj("makaio-w1-nature-1", 1, "nature_identification", "ID 3 fall plants", ["Name one."]),
    obj("makaio-w1-nature-2", 1, "nature_identification", "Safe/not safe", ["Is this one safe?"]),
    obj("makaio-w1-nature-3", 1, "nature_identification", "Draw one", ["Show the drawing."]),

    obj("makaio-w1-spiritual-1", 1, "spiritual_cultural", "Why give thanks at harvest",
      ["Why do we do this?"]),
    obj("makaio-w1-spiritual-2", 1, "spiritual_cultural", "One Norse + one Osage/Cherokee tradition",
      ["Name one."]),
  ],
};

function obj(
  id: string,
  week: number,
  subject: WeeklyObjective["subject"],
  skill: string,
  checkQuestions: string[]
): WeeklyObjective {
  return { id, week, subject, skill, checkQuestions };
}
