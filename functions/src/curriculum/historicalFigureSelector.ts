import { hashText } from "./contentHash";
import type { HistoricalFigure, HistoricalFigureArtwork, PlacementKidKey } from "../types";
import { ART_COMPLEXITY_BAND_BY_KID } from "../types";

/**
 * Historical Figure Coloring — a short daily CLOSING activity built
 * around one real historical person (Builder Guide §14, Q1 Fall
 * Consolidated §7; step 1 established the contract, build-order step 8
 * implements it). Supersedes the retired subject-ring color-sheet
 * rotation (colorSheetRotation.ts) — independent of subject rotation
 * entirely; a kid's featured historical person is never tied to a
 * LearningBlock or a Subject.
 *
 * DELIBERATE DESIGN DECISION: nothing in this file ever calls the AI.
 * Both the FIGURE (who, and their facts) and the show-and-tell/recall
 * PROMPT TEXT are fully deterministic — the figure comes from the
 * hand-authored catalog (historicalFigureCatalog.ts) via the pure
 * weighted-selection algorithm below, and the prompt text is template
 * text built from that same catalog entry's own fields. The step 8
 * instruction explicitly requires "do not fabricate historical people"
 * and "do not let the AI invent source provenance" — the safest way to
 * guarantee that, rather than trusting prompt engineering alone, is to
 * never give an AI call the opportunity to invent either one in the
 * first place. ("The AI may draft an age-appropriate prompt" in the
 * spec is a permission, not a requirement — this implementation takes
 * the stricter, zero-fabrication-risk path.)
 */

// --- Selection ---

export interface SelectHistoricalFigureParams {
  catalog: readonly HistoricalFigure[];
  kidKey: PlacementKidKey;
  /** ISO "YYYY-MM-DD" — the sole source of determinism, together with kidKey. Regenerating the same date for the same kid always selects the same figure. */
  date: string;
  /** Figure ids this kid has already had on recent APPROVED days — the anti-repetition signal (build-order step 8, requirement: "avoid excessive repetition"). Only ever populated from real approved history — see proposedDays.ts#loadRecentHistoricalFigureIds. */
  recentFigureIds: readonly string[];
  /** Tags connected to this week's (and, per "upcoming-context weighting", next week's) curriculum theme — see Q1_FALL_WEEK_RELEVANCE_TAGS. Empty when there's no resolvable week context (e.g. outside the school year); selection then falls back to pure variety. */
  contextTags: readonly string[];
}

export interface HistoricalFigureSelectionResult {
  figure: HistoricalFigure;
  selectionReason: string;
}

const VARIETY_BASE_WEIGHT = 1;
const RELEVANCE_WEIGHT_PER_TAG = 2;

/**
 * Deterministic weighted pick — NOT true randomness. `hashText` (already
 * used elsewhere for content-change detection) turns `${date}:${kidKey}`
 * into a stable digest; the first 8 hex characters become an integer,
 * reduced modulo the total weight to land on one weighted "slot." Same
 * inputs always produce the same output, which is what makes this
 * genuinely unit-testable rather than "seeded random dressed up as
 * deterministic."
 */
function deterministicWeightedIndex(seed: string, totalWeight: number): number {
  const digest = hashText(seed);
  const n = parseInt(digest.slice(0, 8), 16);
  return n % totalWeight;
}

function countOverlap(a: readonly string[], b: readonly string[]): number {
  const set = new Set(b);
  return a.filter((tag) => set.has(tag)).length;
}

/**
 * Locked hybrid strategy (build-order step 8, requirement 4): VARIETY +
 * UPCOMING-CONTEXT WEIGHTING. Every eligible figure always has at least
 * the base variety weight — a context-tag match only ever ADDS weight on
 * top, it never excludes or hard-locks the pick to "whoever this week's
 * lesson is about." Anti-repetition is a soft preference too: if
 * excluding every recently-shown figure would empty the pool entirely,
 * the exclusion is dropped for that call rather than crashing or
 * returning nothing — a real repeat is a better outcome than no closing
 * activity at all, and this is intentionally the LAST resort, not the
 * common case (the catalog is much larger than any realistic recent-
 * history window).
 */
export function selectHistoricalFigure(params: SelectHistoricalFigureParams): HistoricalFigureSelectionResult | null {
  const { catalog, kidKey, date, recentFigureIds, contextTags } = params;
  if (catalog.length === 0) return null;

  const ageAppropriatePool = kidKey === "maizley" ? catalog.filter((f) => f.toddlerAppropriate) : catalog;
  const pool = ageAppropriatePool.length > 0 ? ageAppropriatePool : catalog;

  const recentSet = new Set(recentFigureIds);
  const notRecentlyShown = pool.filter((f) => !recentSet.has(f.id));
  const eligible = notRecentlyShown.length > 0 ? notRecentlyShown : pool;

  const weighted = eligible.map((figure) => {
    const overlap = countOverlap(figure.relevanceTags, contextTags);
    return { figure, weight: VARIETY_BASE_WEIGHT + overlap * RELEVANCE_WEIGHT_PER_TAG, overlap };
  });
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const target = deterministicWeightedIndex(`${date}:${kidKey}`, totalWeight);

  let cumulative = 0;
  for (const w of weighted) {
    cumulative += w.weight;
    if (target < cumulative) {
      const selectionReason =
        w.overlap > 0
          ? `Connects to this week's curriculum themes (${w.figure.relevanceTags.filter((t) => contextTags.includes(t)).join(", ")}).`
          : "Selected for historical variety.";
      return { figure: w.figure, selectionReason };
    }
  }
  // Unreachable given totalWeight > 0 and target < totalWeight, but keep
  // a safe fallback rather than an assumed-exhaustive loop.
  const fallback = weighted[weighted.length - 1].figure;
  return { figure: fallback, selectionReason: "Selected for historical variety." };
}

// --- Age-differentiated, deterministic prompt text (no AI call — see this file's top doc comment) ---

/**
 * Show-and-tell prompt, age-differentiated per build-order step 8,
 * requirement 5. These are EXAMPLE wordings, not the only acceptable
 * phrasing (the spec explicitly says so) — kept as plain template
 * strings so they stay server-deterministic and teacher-reviewable,
 * exactly as required, without needing an AI call at all.
 */
export function buildShowAndTellPrompt(figure: HistoricalFigure, kidKey: PlacementKidKey): string {
  switch (kidKey) {
    case "millaray":
      return `Show and tell: who did you color today, and what do you remember about ${figure.name}? What was happening in the world during ${figure.era}?`;
    case "makaio":
      return `Who did you color today? Tell me one thing about ${figure.name}.`;
    case "maizley":
      return `Can you point to ${figure.name} in your picture? Let's say their name together!`;
  }
}

/**
 * Brief context recall / application question, age-differentiated.
 * Millaray gets the strongest recall+application ask; Makaio gets a
 * clear, concise one; Maizley's is recognition/interaction, never a
 * verbal-explanation demand (build-order step 8, requirement 5: "do not
 * impose older-child written work on Maizely").
 */
export function buildRecallQuestion(figure: HistoricalFigure, kidKey: PlacementKidKey): string {
  switch (kidKey) {
    case "millaray":
      return `Why might ${figure.name} matter, and how does that connect to something we've learned recently?`;
    case "makaio":
      return `Why was ${figure.name} important?`;
    case "maizley":
      return `Match the picture to ${figure.name}'s name — good job!`;
  }
}

// --- Artwork provenance ---

/**
 * The one place that decides whether a figure's artwork is actually safe
 * to print (build-order step 8, requirement 7): "unknown/unverified
 * artwork must not silently become approved printable material." Both
 * conditions must hold — a real asset must exist AND its rights must be
 * something other than unknown/unverified. Every catalog entry today is
 * `status: "unavailable"` (no image pipeline exists yet — see
 * historicalFigureCatalog.ts's doc comment), so this always returns
 * false for now; it exists so a future step that DOES add real artwork
 * has one tested gate to pass through, not an assumption to trust.
 */
export function isArtworkApprovedForPrinting(artwork: HistoricalFigureArtwork): boolean {
  return artwork.status === "available" && artwork.rightsStatus !== "unknown_unverified";
}

export { ART_COMPLEXITY_BAND_BY_KID };
