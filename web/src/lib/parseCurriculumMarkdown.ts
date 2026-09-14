import { ALL_SUBJECTS, type Subject } from "./subjects";

export interface ParsedWeek {
  week: number;
  title: string;
  rawContent: string;
  hours: Partial<Record<Subject, number>>;
}

const SUBJECT_SET = new Set<string>(ALL_SUBJECTS);
const WEEK_HEADING = /^## Week (\d+)\s*[—-]\s*(.+)$/gm;

/**
 * Deterministic parser — no AI call — for the Q1-style curriculum format
 * already in consistent use: `## Week N — Title` headings, each followed
 * by a markdown table with Subject as the first column and Hrs as the
 * fifth. Splits on those headings regardless of what's inside them, so
 * even an unusual table layout still round-trips the week's raw content
 * correctly; only the per-subject hour extraction is format-sensitive; and
 * even a completely different underlying format just returns an empty
 * `hours` for that week, not wrong or fabricated data.
 *
 * Deliberately not an AI parse: this is the actual curriculum a kid will
 * be taught from, and a deterministic parser can't hallucinate content
 * that isn't in the file.
 */
export function parseCurriculumMarkdown(text: string): ParsedWeek[] {
  const matches = [...text.matchAll(WEEK_HEADING)];
  const weeks: ParsedWeek[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const week = Number(match[1]);
    const title = match[2].trim();
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const rawContent = text.slice(start, end).trim();
    weeks.push({ week, title, rawContent, hours: parseHoursFromTable(rawContent) });
  }

  return weeks.sort((a, b) => a.week - b.week);
}

function parseHoursFromTable(block: string): Partial<Record<Subject, number>> {
  const hours: Partial<Record<Subject, number>> = {};
  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    // "| subject | topic | objectives | activity | hrs | (optional extra) |"
    // -> split on "|" and drop the empty strings before/after the outer pipes.
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const subject = cells[0];
    const hrs = Number(cells[4]);
    if (SUBJECT_SET.has(subject) && Number.isFinite(hrs)) {
      // A subject can have two rows in one week (e.g. a "track A"/"track B"
      // split, like social_studies_history's local-history + government
      // strands) — sum them into one weekly total rather than overwrite.
      const key = subject as Subject;
      hours[key] = (hours[key] ?? 0) + hrs;
    }
  }
  return hours;
}
