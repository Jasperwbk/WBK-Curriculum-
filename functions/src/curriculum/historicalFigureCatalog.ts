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
 * PROVENANCE HONESTY (build-order step 8.1 correction): every entry's
 * `provenance.verificationStatus` is "unverified". Step 8's original text
 * ("General historical record (public domain facts)") described these as
 * though the label itself were a real, traceable source — an audit
 * correctly identified this as a placeholder, not a citable source
 * packet: a person being real and their facts being broadly documented
 * does NOT mean this specific catalog entry has been checked against a
 * specific, named source. No web-research project was run to backfill
 * real citations here (out of scope for a focused correction step); the
 * honest fix is to say so, not to invent one. `verificationStatus:
 * "verified"` is reserved for an entry that has actually been checked
 * against a specific source recorded in `sourceTitle`/`urlOrFileRef`,
 * which is real future work, not a claim this catalog makes today.
 *
 * GEOGRAPHIC ACCURACY (build-order step 8.1 correction): step 8's Leif
 * Erikson entry said he "reached North America," which is technically
 * true but dangerously ambiguous next to every other entry's
 * "United States" wording — the actual, securely documented Norse site
 * is L'Anse aux Meadows, in present-day Newfoundland and Labrador,
 * CANADA, never the modern United States. Corrected below. Columbus's
 * entry already correctly said "islands in the Caribbean" (never
 * claiming the continental U.S.) and needed no factual correction, but
 * its "colonial" relevance tag was removed — see Q1_FALL_WEEK_RELEVANCE_TAGS'
 * doc comment for why that tag is reserved for the actual English
 * colonial period (1607+), a full century after Columbus.
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    // toddlerAppropriate: false — NOT because her story involves combat
    // (see types.ts's corrected doc comment: combat alone never disqualifies
    // a figure). The actual reason: unlike, say, George Washington (who has
    // an honest, simple, non-military alternate framing — "became the
    // first president"), Sampson has NO adequately simple alternate
    // framing available — her entire recorded significance IS the
    // disguise-to-enlist act itself, which requires explaining gender
    // disguise and military enlistment together to make any sense at all.
    // There's no honest way to simplify that into a 2.5-year-old's
    // point-and-name interaction without either omitting the one thing
    // that makes her notable or presenting a concept she can't grasp.
    toddlerAppropriate: false,
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-leif-erikson",
    name: "Leif Erikson",
    era: "Around 1000 AD",
    region: "Norse (Iceland/Greenland) — landed in present-day Newfoundland and Labrador, Canada, not the modern United States",
    briefBio:
      "Leif Erikson was a Norse explorer, son of Erik the Red, who sailed from Greenland and established a short-lived settlement at what is now L'Anse aux Meadows, in present-day Newfoundland and Labrador, Canada — centuries before Columbus's voyages.",
    whyItMatters:
      "His voyage is the earliest securely documented European landing in North America — a real, physical settlement site archaeologists have found, not just a legend. It never reached the modern United States, but it's part of the wider story of how Europeans came to know about the Americas, a story the future United States is later part of.",
    relevanceTags: ["exploration", "norse", "heritage", "reflection"],
    toddlerAppropriate: true,
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
    artwork: { status: "unavailable", rightsStatus: "unknown_unverified" },
  },
  {
    id: "hf-columbus",
    name: "Christopher Columbus",
    era: "Late 1400s",
    region: "Genoa/Spain — voyages reaching the Caribbean and, on later trips, the coasts of Central and South America; never the mainland of the present-day United States",
    briefBio:
      "Christopher Columbus sailed across the Atlantic Ocean in 1492 hoping to reach Asia, and instead reached islands in the Caribbean; later voyages reached parts of the coasts of what are now Central and South America.",
    whyItMatters:
      "His voyages started sustained contact between Europe and the Americas, with consequences — good and very harmful — that shaped centuries of history. He never set foot in what's now the United States, but the chain of European exploration and colonization his voyages set off is part of how that later history came to be.",
    relevanceTags: ["exploration"],
    toddlerAppropriate: true,
    provenance: {
      sourceTitle: "General historical/encyclopedic knowledge — not yet traced to a specific citable source",
      rightsStatus: "public_domain",
      verificationStatus: "unverified",
      allowedUseNotes: "Safe for general child-facing educational use; verify against a specific named source before treating as authoritative.",
    },
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
 *
 * TAG SEMANTICS (build-order step 8.1 correction): every tag here is a
 * HISTORICAL-RELEVANCE/THEME signal, never a claim of geographic presence
 * in the modern United States. In particular, `"colonial"` means "the
 * actual English colonial period in what's now the U.S. (1607 onward)" —
 * it does NOT mean "old" or "pre-1776" in general, which is why
 * Christopher Columbus (1492, a full century earlier, and never in
 * English colonial territory at all) does not carry it in
 * historicalFigureCatalog.ts, even though he's tagged "exploration" and
 * genuinely relevant to American-history study. A figure can be highly
 * relevant to that study — Columbus, Leif Erikson — without this table
 * or the catalog ever implying they set foot in the present-day U.S.;
 * `"norse"`/`"heritage"`/`"exploration"`/`"reflection"` (week 9) are
 * historical/thematic connections, not geography claims. Downstream
 * consumers (a future AI-context step, if one is ever added) must not
 * infer U.S. presence from tag membership alone — geography claims
 * belong in `HistoricalFigure.region`/`briefBio`/`whyItMatters` text,
 * stated explicitly, never inferred from a tag.
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
