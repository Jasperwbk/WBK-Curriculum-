import type { HistoricalFigure } from "../types";

/**
 * Hand-authored catalog of REAL historical people (build-order step 8,
 * requirement: "do not fabricate historical people" / "do not let the AI
 * invent source provenance"). No AI call ever selects a figure or writes
 * their facts — see historicalFigureSelector.ts's doc comment. Every
 * entry's biographical facts are drawn from general, widely-documented
 * historical record; `provenance.rightsStatus` is "public_domain" for
 * ALL entries because historical facts themselves are never copyrightable
 * — this is deliberately NOT a claim about any particular book/article.
 *
 * `artwork` is "unavailable"/"unknown_unverified" for every entry — no
 * generative-image pipeline exists, and internet artwork is never
 * scraped or assumed reusable (build-order step 8, requirements 6-7).
 * The printable coloring page itself doesn't exist yet for any figure;
 * the system degrades honestly (see
 * historicalFigureSelector.ts#isArtworkApprovedForPrinting) rather than
 * fabricating a file reference. Filling in real, rights-cleared artwork
 * per figure is a future, separate step.
 *
 * Broadly American-history oriented (build-order step 8, requirement 4),
 * spanning Indigenous/pre-colonial, colonial, Revolutionary, early US,
 * expansion, Civil War/Reconstruction, industrial/modern periods, and
 * people from outside the modern US whose lives intersect it — never
 * reduced to only "whoever today's academic lesson is about" (the
 * selection algorithm in historicalFigureSelector.ts only WEIGHTS toward
 * `relevanceTags` overlap, never restricts to it).
 *
 * `relevanceTags` intentionally reuse both real WBK subject strings and a
 * few free-form era/theme tags (see Q1_FALL_WEEK_RELEVANCE_TAGS below) —
 * they're a selection-weighting signal only, never validated against the
 * Subject enum, so adding a new thematic tag here never requires a
 * schema change.
 */
export const HISTORICAL_FIGURE_CATALOG: readonly HistoricalFigure[] = [
  {
    id: "hf-squanto",
    name: "Squanto (Tisquantum)",
    era: "Early 1600s",
    region: "Indigenous (Patuxet) — southern New England",
    briefBio:
      "Squanto was a Patuxet man who, after being taken to Europe and returning home to find his village gone, helped the Plymouth colonists survive their first winters.",
    whyItMatters:
      "He taught the colonists to plant corn and fish local waters, and helped translate between colonists and neighboring nations — his help is part of why Plymouth Colony survived at all.",
    relevanceTags: ["indigenous", "colonial", "harvest", "agriculture"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-pocahontas",
    name: "Pocahontas (Matoaka)",
    era: "Early 1600s",
    region: "Indigenous (Powhatan) — Virginia",
    briefBio:
      "Pocahontas was the daughter of Powhatan, chief of a confederacy of Virginia nations, and became a well-known go-between for the Powhatan people and English colonists at Jamestown.",
    whyItMatters: "Her life shows both real contact and real conflict between Indigenous nations and early English colonists.",
    relevanceTags: ["indigenous", "colonial", "exploration"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-sequoyah",
    name: "Sequoyah",
    era: "Late 1700s - early 1800s",
    region: "Indigenous (Cherokee) — southeastern United States",
    briefBio:
      "Sequoyah was a Cherokee silversmith who single-handedly created a complete writing system (syllabary) for the Cherokee language.",
    whyItMatters: "Thanks to his invention, the Cherokee Nation quickly became widely literate in their own written language.",
    relevanceTags: ["indigenous", "invention", "reading_language_arts", "writing"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-sacagawea",
    name: "Sacagawea",
    era: "Early 1800s",
    region: "Indigenous (Lemhi Shoshone) — Trans-Mississippi West",
    briefBio:
      "Sacagawea traveled thousands of miles with the Lewis and Clark expedition, helping guide, translate, and negotiate with nations they met along the way — carrying her infant son the whole journey.",
    whyItMatters: "Her knowledge of the land and languages was essential to the expedition's success in reaching the Pacific.",
    relevanceTags: ["indigenous", "exploration", "expansion", "tracking", "animals", "outdoors"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-benjamin-franklin",
    name: "Benjamin Franklin",
    era: "1700s",
    region: "Colonial America / early United States",
    briefBio:
      "Benjamin Franklin was a printer, inventor, scientist, and statesman who helped write the Declaration of Independence and the U.S. Constitution.",
    whyItMatters: "He invented useful things (like bifocal glasses and the lightning rod) and helped found the United States.",
    relevanceTags: ["colonial", "revolutionary", "invention", "science", "weather"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-phillis-wheatley",
    name: "Phillis Wheatley",
    era: "1700s",
    region: "Colonial America (Boston)",
    briefBio:
      "Phillis Wheatley was brought to America as an enslaved child and became the first African American to publish a book of poetry.",
    whyItMatters: "Her published poems made her one of the best-known writers in the colonies at the time.",
    relevanceTags: ["colonial", "reading_language_arts", "literature"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-paul-revere",
    name: "Paul Revere",
    era: "1700s",
    region: "Colonial America (Massachusetts)",
    briefBio:
      "Paul Revere was a silversmith who rode on horseback through the night to warn colonial militia that British troops were coming.",
    whyItMatters: "His famous ride helped colonial fighters prepare for the battles that started the Revolutionary War.",
    relevanceTags: ["revolutionary", "colonial"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-deborah-sampson",
    name: "Deborah Sampson",
    era: "1700s",
    region: "Revolutionary America (Massachusetts)",
    briefBio:
      "Deborah Sampson disguised herself as a man to enlist and fight as a soldier in the Continental Army during the Revolutionary War.",
    whyItMatters: "She's one of the earliest known American women to serve in combat.",
    relevanceTags: ["revolutionary"],
    // Her entire significance is tied to disguising herself to serve in
    // combat — hard to present in a genuinely toddler-safe way without
    // either distorting the story or introducing war/combat framing.
    toddlerAppropriate: false,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-george-washington",
    name: "George Washington",
    era: "1700s",
    region: "Revolutionary America / early United States",
    briefBio:
      "George Washington led the Continental Army during the Revolutionary War and became the first President of the United States.",
    whyItMatters: "He helped win American independence and set an example for how presidents should lead.",
    relevanceTags: ["revolutionary", "early_us", "history"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-lafayette",
    name: "Marquis de Lafayette",
    era: "1700s",
    region: "France / Revolutionary America",
    briefBio:
      "The Marquis de Lafayette was a young French nobleman who volunteered to fight alongside American colonists against the British.",
    whyItMatters: "French support he helped arrange, including soldiers and ships, was a big part of why the colonies won independence.",
    relevanceTags: ["revolutionary", "exploration"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-thomas-jefferson",
    name: "Thomas Jefferson",
    era: "Late 1700s - early 1800s",
    region: "Early United States",
    briefBio:
      "Thomas Jefferson wrote the Declaration of Independence and, as president, arranged the Louisiana Purchase, doubling the size of the country.",
    whyItMatters: "His writing shaped the country's founding ideas, and his land purchase opened the way west.",
    relevanceTags: ["early_us", "expansion", "history"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-dolley-madison",
    name: "Dolley Madison",
    era: "Early 1800s",
    region: "Early United States",
    briefBio:
      "Dolley Madison was First Lady during the War of 1812 and famously saved a portrait of George Washington before the British burned the White House.",
    whyItMatters: "Her quick thinking preserved an important piece of the young country's history.",
    relevanceTags: ["early_us", "history"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-johnny-appleseed",
    name: "Johnny Appleseed (John Chapman)",
    era: "Late 1700s - mid 1800s",
    region: "United States frontier (Ohio Valley and beyond)",
    briefBio:
      "John Chapman, known as Johnny Appleseed, traveled the American frontier for decades planting apple tree nurseries for settlers.",
    whyItMatters: "His orchards fed and supplied settlers moving west, and his gentle, wandering life became a lasting American story.",
    relevanceTags: ["expansion", "agriculture", "plants", "seeds", "pioneer", "science"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-abraham-lincoln",
    name: "Abraham Lincoln",
    era: "Mid 1800s",
    region: "United States",
    briefBio:
      "Abraham Lincoln led the United States through the Civil War and signed the Emancipation Proclamation, which declared enslaved people in Confederate states free.",
    whyItMatters: "His leadership helped hold the country together and moved the nation toward ending slavery.",
    relevanceTags: ["civil_war", "history", "reflection"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-harriet-tubman",
    name: "Harriet Tubman",
    era: "Mid-to-late 1800s",
    region: "United States",
    briefBio:
      "Harriet Tubman escaped slavery and then made many dangerous trips back south to guide other enslaved people to freedom on the Underground Railroad.",
    whyItMatters: "Her courage helped many people reach freedom, and she later helped the Union Army during the Civil War.",
    relevanceTags: ["civil_war", "history"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-frederick-douglass",
    name: "Frederick Douglass",
    era: "1800s",
    region: "United States",
    briefBio:
      "Frederick Douglass, born enslaved, secretly taught himself to read and write, escaped to freedom, and became a famous writer and speaker against slavery.",
    whyItMatters: "His speeches and writing changed many people's minds and helped the fight to end slavery.",
    relevanceTags: ["civil_war", "reading_language_arts", "history"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-thomas-edison",
    name: "Thomas Edison",
    era: "Late 1800s - early 1900s",
    region: "United States",
    briefBio:
      "Thomas Edison was a prolific inventor who developed the practical light bulb, the phonograph, and hundreds of other inventions.",
    whyItMatters: "His inventions changed how homes, businesses, and daily life worked.",
    relevanceTags: ["industrial", "invention", "technology"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-wright-brothers",
    name: "The Wright Brothers (Wilbur and Orville Wright)",
    era: "Early 1900s",
    region: "United States",
    briefBio:
      "Wilbur and Orville Wright, bicycle makers from Ohio, built and flew the first successful powered airplane at Kitty Hawk, North Carolina.",
    whyItMatters: "Their flight opened the door to modern air travel.",
    relevanceTags: ["industrial", "invention", "technology"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-leif-erikson",
    name: "Leif Erikson",
    era: "Around 1000 AD",
    region: "Norse (Iceland/Greenland) — reached North America",
    briefBio:
      "Leif Erikson was a Norse explorer, son of Erik the Red, who sailed from Greenland and is believed to have reached North America centuries before Columbus.",
    whyItMatters: "His voyage was likely the first time Europeans set foot in North America.",
    relevanceTags: ["exploration", "norse", "heritage", "reflection"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-columbus",
    name: "Christopher Columbus",
    era: "Late 1400s",
    region: "Genoa/Spain — voyages to the Americas",
    briefBio:
      "Christopher Columbus sailed across the Atlantic Ocean in 1492 hoping to reach Asia, and instead reached islands in the Caribbean.",
    whyItMatters: "His voyages began sustained contact between Europe and the Americas, with consequences — good and very harmful — that shaped centuries of history.",
    relevanceTags: ["exploration", "colonial"],
    toddlerAppropriate: true,
    provenance: { sourceTitle: "General historical record (public domain facts)", rightsStatus: "public_domain" },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
] as const;

/**
 * Curriculum-context tags for each Q1 week's theme (see
 * curriculum/q1_fall/q1_fall_curriculum_overview.md's nine-week arc) —
 * the "upcoming-context weighting" half of the locked hybrid selection
 * strategy (build-order step 8, requirement 4). A figure whose
 * `relevanceTags` overlap the CURRENT or the NEXT week's tags gets a
 * selection-weight bonus in historicalFigureSelector.ts — never a hard
 * filter, so broad variety is always still possible even during a
 * heavily-themed week.
 */
export const Q1_FALL_WEEK_RELEVANCE_TAGS: Readonly<Record<number, readonly string[]>> = {
  1: ["harvest", "math"],
  2: ["food_preservation", "science"],
  3: ["plants", "seeds", "science", "agriculture"],
  4: ["nature", "seasons", "outdoors"],
  5: ["animals", "tracking", "outdoors", "indigenous"],
  6: ["invention", "technology", "industrial"],
  7: ["weather", "science"],
  8: ["history", "colonial", "indigenous", "pioneer", "expansion"],
  9: ["reflection", "norse", "heritage"],
};

/**
 * The context-tag union for "this week AND next week" — the actual
 * "upcoming" half of upcoming-context weighting (build-order step 8):
 * a figure connected to what's coming up gets a selection-weight boost
 * even a week before that content is current. Returns [] (pure variety,
 * no crash) when `week` is null or has no entry — e.g. outside the
 * school year, or a future quarter with no table yet.
 */
export function getUpcomingContextTags(
  week: number | null,
  weekTags: Readonly<Record<number, readonly string[]>> = Q1_FALL_WEEK_RELEVANCE_TAGS
): string[] {
  if (week === null) return [];
  const current = weekTags[week] ?? [];
  const next = weekTags[week + 1] ?? [];
  return [...new Set([...current, ...next])];
}
