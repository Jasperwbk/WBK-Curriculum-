import { createHash } from "crypto";
import type { ChildContentReference, CurriculumWeekEntry, PlacementKidKey } from "../types";

/**
 * Deterministic, field-order-independent hashing for material-change
 * detection (Builder Guide §4-5: "material changes after certification
 * require re-certification"). Only ever hashes explicitly-chosen material
 * fields — cosmetic/provenance metadata (sourceFileName, uploadedBy,
 * uploadedAt) never enters the hash, so re-saving the same content under a
 * different file name or re-uploading unchanged text never invalidates a
 * certification.
 */

/** Sorts object keys so field order never affects the hash. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/** Hashes a plain string — used by proposedDayLifecycle.ts for the legacy-mode (no certification id) idempotency signature fallback. */
export function hashText(text: string): string {
  return sha256(text);
}

/**
 * Quarter-level material: the theme arc only (each week's number + title),
 * NOT each week's rawContent/hours — those are certified independently at
 * the weekly level (WeeklyCertification), so refining one week's prose
 * doesn't force re-certifying the whole quarter and every other week in it.
 */
export function hashQuarterShape(weeks: readonly Pick<CurriculumWeekEntry, "week" | "title">[]): string {
  const shape = [...weeks]
    .sort((a, b) => a.week - b.week)
    .map((w) => ({ week: w.week, title: w.title }));
  return sha256(shape);
}

/** Week-level material: this week's actual instructional content. */
export function hashWeekContent(
  week: Pick<CurriculumWeekEntry, "title" | "rawContent" | "hours">
): string {
  return sha256({ title: week.title, rawContent: week.rawContent, hours: week.hours });
}

/**
 * Family package identity (build-order step 3.1): a hash-of-hashes over
 * every child's own content hash (quarter-shape or week-content, whichever
 * the caller is packaging). Deterministic and independent of input array
 * order — sorted by kidKey before hashing — so the SAME set of per-kid
 * hashes always produces the same family hash regardless of how the list
 * was built. Changes the moment ANY one child's hash changes (including a
 * child going from having content to not, or vice versa, represented as
 * contentHash: null), which is exactly the "one child's material changing
 * invalidates the family certification" requirement — the certification
 * boundary is the family package, even though each child's content stays
 * fully independent underneath it.
 */
export function hashFamilyPackage(childHashes: readonly ChildContentReference[]): string {
  const sorted = [...childHashes]
    .sort((a, b) => a.kidKey.localeCompare(b.kidKey))
    .map((c) => ({ kidKey: c.kidKey, contentHash: c.contentHash }));
  return sha256(sorted);
}

/**
 * Which of a family certification's child hashes no longer match the
 * current content — i.e. which specific child(ren) caused a family
 * certification to go stale. Pure diff, no I/O: both arguments are
 * assumed to already cover the same set of kidKeys (certificationStatus.ts
 * guarantees this — both are always built from the same PLACEMENT_KID_KEYS
 * loop). A kid present in one list but not the other is treated as having
 * changed (from/to no-content is still a material change).
 */
export function diffStaleKidKeys(
  current: readonly ChildContentReference[],
  certified: readonly ChildContentReference[]
): PlacementKidKey[] {
  const certifiedByKid = new Map(certified.map((c) => [c.kidKey, c.contentHash]));
  // A kid missing from `certified` has no entry, so .get() returns
  // undefined, which never equals a string | null contentHash — correctly
  // counts as "changed" without a separate presence check.
  return current.filter((c) => certifiedByKid.get(c.kidKey) !== c.contentHash).map((c) => c.kidKey);
}
