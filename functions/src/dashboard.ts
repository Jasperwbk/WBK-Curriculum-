import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  CORE_SUBJECTS,
  SPECIALTY_SUBJECTS,
  type Family,
  type Location,
  type SchoolYear,
  type Subject,
  type UserProfile,
} from "./types";
import { requireCaller, requireOwnerOrTeacher, requireSameFamily } from "./util/auth";
import { computeSubjectWeights } from "./curriculum/subjectWeights";
import { sumInstructionalMinutes } from "./curriculum/hourAggregation";

export type GaugeStatus = "green" | "yellow" | "red";

export interface Gauge {
  label: string;
  expectedHours: number;
  actualHours: number;
  balanceHours: number; // positive = banked surplus ("PTO"), negative = behind pace
  status: GaugeStatus;
}

/**
 * Fraction of the school year elapsed, applied to a target hour count.
 * Clamped to [0, 1] so the number stays sane before day 0 and after the
 * year's nominal end.
 */
export function getExpectedHoursToDate(
  schoolYear: SchoolYear,
  today: Date,
  targetHours: number
): number {
  const startDate = schoolYear.startDate.toDate();
  const daysElapsed = (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const fractionOfYear = Math.min(Math.max(daysElapsed / schoolYear.yearLengthDays, 0), 1);
  return targetHours * fractionOfYear;
}

export function getBalance(actual: number, expected: number): number {
  return actual - expected;
}

export function getStatus(balance: number, expected: number): GaugeStatus {
  if (expected === 0) {
    // Guard divide-by-zero at the very start of the year, before any hours
    // are expected yet — can't be "behind pace" against a target of zero.
    return balance >= 0 ? "green" : "red";
  }
  const ratio = balance / expected;
  if (ratio >= 0) return "green";
  if (ratio >= -0.1) return "yellow"; // within 10% behind
  return "red";
}

interface ActualHoursOptions {
  subjects?: readonly Subject[];
  locations?: readonly Location[];
}

/**
 * Sums durationMinutes (in hours) for a student's logs up to `today`,
 * optionally narrowed to a set of subjects and/or locations.
 *
 * home-core gauge: subjects = CORE_SUBJECTS, locations = ["home", "field"]
 * (external-location hours count toward total/core but never home-core).
 */
async function getActualHoursToDate(
  familyId: string,
  userId: string,
  today: Date,
  opts: ActualHoursOptions = {}
): Promise<number> {
  const db = getFirestore();
  let query = db
    .collection("logs")
    .where("userId", "==", userId)
    .where("date", "<=", Timestamp.fromDate(today));

  if (opts.subjects && opts.subjects.length > 0) {
    query = query.where("subject", "in", opts.subjects as string[]);
  }

  const snap = await query.get();
  // sumInstructionalMinutes (curriculum/hourAggregation.ts) is the ONE
  // deterministic official-hour calculation (build-order step 6.1) —
  // deliberately behavior-preserving: it does not gate on
  // LogEntry.provenance, so a legacy, manual, extracurricular, or
  // governed-evidence log all count identically, exactly as before this
  // step. See that file's doc comment for why no dedup logic was added
  // here.
  const totalMinutes = sumInstructionalMinutes(
    snap.docs.map((doc) => doc.data() as { familyId: string; location: Location; durationMinutes: number }),
    familyId,
    { locations: opts.locations }
  );
  return totalMinutes / 60;
}

function buildGauge(label: string, expectedHours: number, actualHours: number): Gauge {
  const balanceHours = getBalance(actualHours, expectedHours);
  return {
    label,
    expectedHours,
    actualHours,
    balanceHours,
    status: getStatus(balanceHours, expectedHours),
  };
}

export interface DashboardData {
  asOf: string; // ISO date the snapshot was computed for
  total: Gauge;
  core: Gauge;
  homeCore: Gauge;
  subjects: Record<Subject, Gauge>;
  assessmentBaseline: Record<string, string>;
}

/**
 * Computes every gauge for one student as of `today`.
 *
 * The spec's family schema only defines targets for the total/core/home-core
 * buckets, not per individual subject. To still give each subject its own
 * pace gauge (per spec section 4) without an arbitrary even split, each
 * subject's annual target is its real curriculum weight (computeSubjectWeights,
 * derived from the actual weekly hours assigned per subject across the Q1
 * curriculum files — reading/language arts, math, science, and social studies
 * are weighted higher than the specialty subjects because that's what the
 * curriculum actually assigns) times its bucket's annual target
 * (coreHoursTarget for core subjects, totalHoursTarget - coreHoursTarget for
 * specialty subjects).
 */
export async function computeDashboardData(
  familyId: string,
  family: Family,
  targetUserId: string,
  today: Date,
  assessmentBaseline: Record<string, string> = {}
): Promise<DashboardData> {
  const { schoolYear } = family;

  const [totalActual, coreActual, homeCoreActual] = await Promise.all([
    getActualHoursToDate(familyId, targetUserId, today),
    getActualHoursToDate(familyId, targetUserId, today, { subjects: CORE_SUBJECTS }),
    getActualHoursToDate(familyId, targetUserId, today, {
      subjects: CORE_SUBJECTS,
      locations: ["home", "field"],
    }),
  ]);

  const total = buildGauge(
    "Total hours",
    getExpectedHoursToDate(schoolYear, today, schoolYear.totalHoursTarget),
    totalActual
  );
  const core = buildGauge(
    "Core hours",
    getExpectedHoursToDate(schoolYear, today, schoolYear.coreHoursTarget),
    coreActual
  );
  const homeCore = buildGauge(
    "Home-core hours",
    getExpectedHoursToDate(schoolYear, today, schoolYear.homeCoreHoursTarget),
    homeCoreActual
  );

  const subjectWeights = computeSubjectWeights();
  const specialtyBucketTarget = Math.max(
    schoolYear.totalHoursTarget - schoolYear.coreHoursTarget,
    0
  );

  const subjectEntries = await Promise.all(
    [...CORE_SUBJECTS, ...SPECIALTY_SUBJECTS].map(async (subject) => {
      const isCore = (CORE_SUBJECTS as readonly string[]).includes(subject);
      const bucketTarget = isCore ? schoolYear.coreHoursTarget : specialtyBucketTarget;
      const target = subjectWeights[subject] * bucketTarget;
      const actual = await getActualHoursToDate(familyId, targetUserId, today, {
        subjects: [subject],
      });
      const gauge = buildGauge(
        subject,
        getExpectedHoursToDate(schoolYear, today, target),
        actual
      );
      return [subject, gauge] as const;
    })
  );

  return {
    asOf: today.toISOString().slice(0, 10),
    total,
    core,
    homeCore,
    subjects: Object.fromEntries(subjectEntries) as Record<Subject, Gauge>,
    assessmentBaseline,
  };
}

interface GetDashboardDataRequest {
  userId: string;
  asOf?: string; // optional ISO date override, defaults to today
}

/**
 * Callable: returns the full gauge set (total/core/home-core/per-subject)
 * for one student. A student may call this for themselves; a teacher may
 * call it for anyone in their family.
 */
export const getDashboardData = onCall<GetDashboardDataRequest>(async (request) => {
  const caller = await requireCaller(request);
  const { userId, asOf } = request.data ?? {};
  if (!userId || typeof userId !== "string") {
    throw new HttpsError("invalid-argument", "userId is required.");
  }
  requireOwnerOrTeacher(caller, userId);

  const db = getFirestore();
  const targetSnap = await db.collection("users").doc(userId).get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "No such student.");
  }
  const targetProfile = targetSnap.data() as UserProfile;
  requireSameFamily(caller, targetProfile.familyId);

  const familySnap = await db.collection("families").doc(targetProfile.familyId).get();
  if (!familySnap.exists) {
    throw new HttpsError("failed-precondition", "Family record not found.");
  }
  const family = familySnap.data() as Family;

  const today = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(today.getTime())) {
    throw new HttpsError("invalid-argument", "asOf must be a valid ISO date.");
  }

  return computeDashboardData(
    targetProfile.familyId,
    family,
    userId,
    today,
    targetProfile.assessmentBaseline ?? {}
  );
});
