import { ALL_SUBJECTS } from "../subjects";
import type { CurriculumWeekEntry, Subject } from "../types";

/**
 * Backend copy of web/src/lib/parseCurriculumMarkdown.ts's logic — same
 * deterministic (no AI) parser, same regex, same table-column layout.
 * Needed so the certification bootstrap path (certification.ts) can derive
 * a real CurriculumWeekEntry[] from the bundled static Q1 markdown files to
 * hash, the same way it would for a Firestore-backed curriculumContent
 * doc's `weeks` field — the two are genuinely the same file format, just
 * one lives in the browser bundle and one in the Cloud Functions bundle,
 * so there's no shared workspace package to import from instead.
 *
 * If this format ever changes, the web copy is the one to update it
 * against — both should be kept in sync by hand, since they parse the
 * exact same source documents.
 */

const SUBJECT_SET = new Set<string>(ALL_SUBJECTS);
const WEEK_HEADING = /^## Week (\d+)\s*[—-]\s*(.+)$/gm;

export function parseStaticCurriculumMarkdown(text: string): CurriculumWeekEntry[] {
  const matches = [...text.matchAll(WEEK_HEADING)];
  const weeks: CurriculumWeekEntry[] = [];

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
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const subject = cells[0];
    const hrs = Number(cells[4]);
    if (SUBJECT_SET.has(subject) && Number.isFinite(hrs)) {
      const key = subject as Subject;
      hours[key] = (hours[key] ?? 0) + hrs;
    }
  }
  return hours;
}
