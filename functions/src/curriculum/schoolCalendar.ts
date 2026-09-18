/**
 * School-day index within the school year: 0 on the school year's start
 * date (assumed a school day), incrementing once per weekday thereafter.
 * Weekends never count. Used to resolve which quarter/week a date falls in
 * (loadCurriculumContent.ts) — a generic calendar utility, independent of
 * any particular daily-content-assignment scheme.
 */
export function getSchoolDayIndex(schoolYearStart: Date, date: Date): number {
  const start = stripTime(schoolYearStart);
  const target = stripTime(date);
  if (target < start) return 0;

  let count = -1;
  const cursor = new Date(start);
  while (cursor <= target) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(count, 0);
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
