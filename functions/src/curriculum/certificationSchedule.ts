import type { Family, WeeklyCertificationSchedule } from "../types";

/**
 * Friday ~17:00 review / Sunday ~20:00 certify, per the family's stated
 * default weekly cadence — configurable per family (Family.
 * weeklyCertificationSchedule), not a permanent hardcoded assumption. Not
 * enforced by any automation yet: nothing in step 3 blocks a late
 * certification or schedules anything against this. It exists as
 * configurable data for build-order step 4 (two-day-ahead generation) to
 * actually act on.
 */
export const DEFAULT_WEEKLY_CERTIFICATION_SCHEDULE: WeeklyCertificationSchedule = {
  reviewByDayOfWeek: 5, // Friday
  reviewByTime: "17:00",
  certifyByDayOfWeek: 0, // Sunday
  certifyByTime: "20:00",
};

export function getWeeklyCertificationSchedule(family: Family): WeeklyCertificationSchedule {
  return family.weeklyCertificationSchedule ?? DEFAULT_WEEKLY_CERTIFICATION_SCHEDULE;
}
