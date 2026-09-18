import { readFileSync } from "fs";
import { join } from "path";
import { getFirestore } from "firebase-admin/firestore";
import type { CurriculumContentDoc, PlacementKidKey, Quarter } from "../types";
import { getSchoolDayIndex } from "./schoolCalendar";

// Q1's original launch content, bundled into the deployed function (see
// scripts/copy-curriculum-data.js) so it keeps working without anyone
// needing to re-upload it through the new upload flow. Every other quarter
// comes from Firestore, written by the teacher's "Upload new quarter"
// flow in the web app — no code change or deploy needed for those.
const STATIC_FILE_BY_KID: Record<PlacementKidKey, string> = {
  millaray: "millaray_age10_q1_fall.md",
  makaio: "makaio_age8_q1_fall.md",
  maizley: "maizley_toddler_q1_fall.md",
};
const STATIC_DATA_DIR = join(__dirname, "..", "curriculum-data");

const WEEKS_PER_QUARTER = 9;
const SCHOOL_DAYS_PER_WEEK = 5;
const SCHOOL_DAYS_PER_QUARTER = WEEKS_PER_QUARTER * SCHOOL_DAYS_PER_WEEK;
const QUARTERS: readonly Quarter[] = ["q1", "q2", "q3", "q4"];

/** Which quarter + week (1-9) a date falls in, or null if past the school year (4 quarters). */
export function getQuarterAndWeek(
  schoolYearStart: Date,
  date: Date
): { quarter: Quarter; week: number } | null {
  const dayIndex = getSchoolDayIndex(schoolYearStart, date);
  const quarterIdx = Math.floor(dayIndex / SCHOOL_DAYS_PER_QUARTER);
  if (quarterIdx < 0 || quarterIdx >= QUARTERS.length) return null;
  const week = Math.floor((dayIndex % SCHOOL_DAYS_PER_QUARTER) / SCHOOL_DAYS_PER_WEEK) + 1;
  return { quarter: QUARTERS[quarterIdx], week };
}

function loadStaticQ1WeekContent(kidKey: PlacementKidKey, week: number): string | null {
  let fileText: string;
  try {
    fileText = readFileSync(join(STATIC_DATA_DIR, STATIC_FILE_BY_KID[kidKey]), "utf8");
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

/**
 * Loads one week's actual curriculum content for a kid — the real,
 * already-written topics/objectives/activities, verbatim — so
 * generatePlan can ground a day's plan in it instead of inventing
 * plausible-sounding but unrelated content. Firestore first (whatever's
 * been uploaded through the teacher's "Upload new quarter" flow),
 * falling back to the bundled Q1 files only for quarter "q1". Any other
 * quarter with nothing uploaded yet returns null rather than fabricating
 * content — the generator just gets less grounding for that day.
 */
export async function loadWeekContent(
  familyId: string,
  kidKey: PlacementKidKey,
  quarter: Quarter,
  week: number
): Promise<string | null> {
  const db = getFirestore();
  const snap = await db.collection("curriculumContent").doc(`${familyId}_${kidKey}_${quarter}`).get();
  if (snap.exists) {
    const data = snap.data() as CurriculumContentDoc;
    const found = data.weeks.find((w) => w.week === week);
    if (found) return found.rawContent;
  }

  if (quarter === "q1") {
    return loadStaticQ1WeekContent(kidKey, week);
  }
  return null;
}
