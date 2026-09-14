import { readFileSync } from "fs";
import { join } from "path";
import type { PlacementKidKey } from "../types";
import { getSchoolDayIndex } from "./colorSheetRotation";

const FILE_BY_KID: Record<PlacementKidKey, string> = {
  millaray: "millaray_age10_q1_fall.md",
  makaio: "makaio_age8_q1_fall.md",
  maizley: "maizley_toddler_q1_fall.md",
};

// Populated at build time by scripts/copy-curriculum-data.js, which copies
// curriculum/q1_fall/*.md alongside the compiled output — see that script
// for why (firebase deploy only uploads functions/, not the repo root).
const DATA_DIR = join(__dirname, "..", "curriculum-data");

const Q1_WEEK_COUNT = 9;
const SCHOOL_DAYS_PER_WEEK = 5;

/** Which Q1 week (1-9) a date falls in, or null if outside Q1 entirely. */
export function getQ1WeekNumber(schoolYearStart: Date, date: Date): number | null {
  const dayIndex = getSchoolDayIndex(schoolYearStart, date);
  const week = Math.floor(dayIndex / SCHOOL_DAYS_PER_WEEK) + 1;
  return week >= 1 && week <= Q1_WEEK_COUNT ? week : null;
}

/**
 * Extracts one week's actual curriculum content — topics, objectives, and
 * activities per subject, verbatim from the real Q1 source file — so
 * generatePlan can ground a day's plan in what was actually authored
 * instead of inventing plausible-sounding but unrelated content. Returns
 * null if the week/kid can't be resolved (e.g. a date outside Q1's 9
 * weeks, since no Q2+ content exists yet) rather than fabricating anything.
 */
export function loadWeekContent(kidKey: PlacementKidKey, week: number): string | null {
  let fileText: string;
  try {
    fileText = readFileSync(join(DATA_DIR, FILE_BY_KID[kidKey]), "utf8");
  } catch {
    return null;
  }

  const heading = `## Week ${week} `;
  const startIdx = fileText.indexOf(heading);
  if (startIdx === -1) return null;

  const rest = fileText.slice(startIdx);
  const nextHeadingMatch = rest.slice(1).match(/\n## Week \d/);
  const endIdx = nextHeadingMatch ? (nextHeadingMatch.index ?? rest.length - 1) + 1 : rest.length;
  return rest.slice(0, endIdx).trim();
}
