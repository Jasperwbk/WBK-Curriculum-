import { createHash } from "crypto";
import type { CurriculumWeekEntry } from "../types";

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
