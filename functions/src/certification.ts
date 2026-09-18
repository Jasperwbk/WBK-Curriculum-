import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { requireCaller, requireTeacher, requireSameFamily } from "./util/auth";
import { createProposal, approveProposal } from "./approvals";
import { isValidKidKey, isValidQuarter, PLACEMENT_KID_KEYS, QUARTERS } from "./curriculum/loadCurriculumContent";
import {
  getFamilyQuarterCertificationStatus,
  getFamilyWeeklyCertificationStatus,
} from "./curriculum/certificationStatus";
import type {
  CertificationSource,
  ChildContentReference,
  DayDesignationType,
  FamilyQuarterCertification,
  FamilyWeeklyCertification,
  DayDesignation,
  PlacementKidKey,
  Quarter,
} from "./types";

/**
 * Quarter + weekly certification (build-order step 3, revised 3.1 —
 * FAMILY-level instructional package, per-kid traceability underneath),
 * built on the generalized approval primitive (approvals.ts) rather than a
 * new independent review pattern — certifying IS proposing-and-immediately-
 * approving a proposal of kind "quarterCertification"/"weeklyCertification".
 *
 * One deliberate teacher action — Review -> Certify — certifies the WHOLE
 * family's quarter/week package (Millaray + Makaio + Maizley) at once, not
 * three separate per-kid actions. There's still no separate later-approver
 * step: the teacher looking at the content and certifying it is both the
 * proposer and the approver in one action. "Either authorized teacher may
 * certify" just means any teacher account in the family can be the one
 * performing it, alone — never a two-teacher requirement.
 */

interface FamilyQuarterCertificationPayload {
  familyId: string;
  quarter: Quarter;
  childContent: ChildContentReference[];
  familyContentHash: string;
}

interface FamilyWeeklyCertificationPayload {
  familyId: string;
  quarter: Quarter;
  week: number;
  childContent: ChildContentReference[];
  familyContentHash: string;
  quarterCertificationId: string;
}

/** Shared by certifyQuarter and bootstrapExistingCertifications. Throws if no child has any content to certify. */
async function certifyQuarterInternal(params: {
  familyId: string;
  quarter: Quarter;
  certifiedByUid: string;
  source: CertificationSource;
}): Promise<{ certificationId: string; familyContentHash: string }> {
  const current = await getFamilyQuarterCertificationStatus(params.familyId, params.quarter);
  if (!current.current.anyContent) {
    throw new HttpsError(
      "failed-precondition",
      `No curriculum content found for any student in ${params.quarter.toUpperCase()} yet — nothing to certify.`
    );
  }

  const { proposalId } = await createProposal<FamilyQuarterCertificationPayload>({
    kind: "quarterCertification",
    familyId: params.familyId,
    proposedByUid: params.certifiedByUid,
    proposedByRole: "teacher",
    payload: {
      familyId: params.familyId,
      quarter: params.quarter,
      childContent: current.current.childContent,
      familyContentHash: current.current.familyContentHash,
    },
  });

  let certificationId = "";
  await approveProposal<FamilyQuarterCertificationPayload>({
    proposalId,
    reviewerUid: params.certifiedByUid,
    commit: (tx, payload) => {
      const ref = getFirestore().collection("familyQuarterCertifications").doc();
      certificationId = ref.id;
      const cert: FamilyQuarterCertification = {
        familyId: payload.familyId,
        quarter: payload.quarter,
        childContent: payload.childContent,
        familyContentHash: payload.familyContentHash,
        certifiedByUid: params.certifiedByUid,
        certifiedAt: Timestamp.now(),
        source: params.source,
      };
      tx.set(ref, cert);
    },
  });

  return { certificationId, familyContentHash: current.current.familyContentHash };
}

/** Shared by certifyWeek and bootstrapExistingCertifications. Requires the family's quarter to be currently certified first. */
async function certifyWeekInternal(params: {
  familyId: string;
  quarter: Quarter;
  week: number;
  certifiedByUid: string;
  source: CertificationSource;
}): Promise<{ certificationId: string; familyContentHash: string }> {
  const quarterStatus = await getFamilyQuarterCertificationStatus(params.familyId, params.quarter);
  if (quarterStatus.status !== "certified" || !quarterStatus.latest) {
    throw new HttpsError(
      "failed-precondition",
      `Certify the family's ${params.quarter.toUpperCase()} quarter first (current status: ${quarterStatus.status}).`
    );
  }

  const weekStatus = await getFamilyWeeklyCertificationStatus(params.familyId, params.quarter, params.week);
  if (!weekStatus.current.anyContent) {
    throw new HttpsError(
      "failed-precondition",
      `No curriculum content found for any student in ${params.quarter.toUpperCase()} Week ${params.week} yet — nothing to certify.`
    );
  }

  const { proposalId } = await createProposal<FamilyWeeklyCertificationPayload>({
    kind: "weeklyCertification",
    familyId: params.familyId,
    proposedByUid: params.certifiedByUid,
    proposedByRole: "teacher",
    payload: {
      familyId: params.familyId,
      quarter: params.quarter,
      week: params.week,
      childContent: weekStatus.current.childContent,
      familyContentHash: weekStatus.current.familyContentHash,
      quarterCertificationId: quarterStatus.latest.id,
    },
  });

  let certificationId = "";
  await approveProposal<FamilyWeeklyCertificationPayload>({
    proposalId,
    reviewerUid: params.certifiedByUid,
    commit: (tx, payload) => {
      const ref = getFirestore().collection("familyWeeklyCertifications").doc();
      certificationId = ref.id;
      const cert: FamilyWeeklyCertification = {
        familyId: payload.familyId,
        quarter: payload.quarter,
        week: payload.week,
        quarterCertificationId: payload.quarterCertificationId,
        childContent: payload.childContent,
        familyContentHash: payload.familyContentHash,
        certifiedByUid: params.certifiedByUid,
        certifiedAt: Timestamp.now(),
        source: params.source,
      };
      tx.set(ref, cert);
    },
  });

  return { certificationId, familyContentHash: weekStatus.current.familyContentHash };
}

interface CertifyQuarterRequest {
  familyId: string;
  quarter: string;
}

/** A teacher reviews and certifies the family's whole quarter-level curriculum shape (the 9-week theme arc, for every student). */
export const certifyQuarter = onCall<CertifyQuarterRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId, quarter } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);
  if (!isValidQuarter(quarter)) {
    throw new HttpsError("invalid-argument", `quarter must be one of: ${QUARTERS.join(", ")}.`);
  }

  return certifyQuarterInternal({ familyId, quarter, certifiedByUid: caller.uid, source: "reviewed" });
});

interface CertifyWeekRequest {
  familyId: string;
  quarter: string;
  week: number;
}

/** A teacher reviews and certifies one week's actual instructional content for the whole family. Requires the quarter to already be certified. */
export const certifyWeek = onCall<CertifyWeekRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId, quarter, week } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);
  if (!isValidQuarter(quarter)) {
    throw new HttpsError("invalid-argument", `quarter must be one of: ${QUARTERS.join(", ")}.`);
  }
  if (!Number.isInteger(week) || week < 1 || week > 9) {
    throw new HttpsError("invalid-argument", "week must be an integer from 1 to 9.");
  }

  return certifyWeekInternal({ familyId, quarter, week, certifiedByUid: caller.uid, source: "reviewed" });
});

interface BootstrapCertificationsRequest {
  familyId: string;
}

interface BootstrapResult {
  quartersCertified: Quarter[];
  weeksCertified: { quarter: Quarter; week: number }[];
  alreadyCurrent: { quarter: Quarter; week?: number }[];
}

const WEEKS_PER_QUARTER = 9;

/**
 * One-time (but safe to re-run) catch-up for curriculum content that
 * already existed before this certification system did — Q1, most
 * notably, which is live and in active use today. Creates FAMILY-level
 * certification packages (retaining every child's own hash inside
 * childContent for traceability), purely additive and idempotent: for
 * every quarter/week that has content but no current family
 * certification, creates one, source "bootstrap" (honestly flagged as
 * retroactive, not a genuine line-by-line review); anything already
 * certified-and-current is left untouched and reported as skipped. Never
 * edits or deletes an existing certification, curriculumContent doc, or
 * anything else. Must be explicitly called by a signed-in teacher — no
 * certification here is fabricated without a real uid/timestamp/audit
 * trail behind it. Not executed against production from this environment.
 */
export const bootstrapExistingCertifications = onCall<BootstrapCertificationsRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);

  const result: BootstrapResult = { quartersCertified: [], weeksCertified: [], alreadyCurrent: [] };

  for (const quarter of QUARTERS) {
    const quarterStatus = await getFamilyQuarterCertificationStatus(familyId, quarter);
    if (!quarterStatus.current.anyContent) {
      continue; // nothing uploaded/bundled for any kid in this quarter — nothing to bootstrap
    }

    if (quarterStatus.status === "certified") {
      result.alreadyCurrent.push({ quarter });
    } else {
      await certifyQuarterInternal({ familyId, quarter, certifiedByUid: caller.uid, source: "bootstrap" });
      result.quartersCertified.push(quarter);
    }

    for (let week = 1; week <= WEEKS_PER_QUARTER; week++) {
      const weekStatus = await getFamilyWeeklyCertificationStatus(familyId, quarter, week);
      if (!weekStatus.current.anyContent) continue;
      if (weekStatus.status === "certified") {
        result.alreadyCurrent.push({ quarter, week });
        continue;
      }
      await certifyWeekInternal({ familyId, quarter, week, certifiedByUid: caller.uid, source: "bootstrap" });
      result.weeksCertified.push({ quarter, week });
    }
  }

  return result;
});

interface DesignateDayRequest {
  familyId: string;
  date: string;
  type: DayDesignationType;
  description: string;
  kidKeys?: string[];
}

interface DayDesignationPayload {
  familyId: string;
  date: string;
  kidKeys: PlacementKidKey[];
  type: DayDesignationType;
  description: string;
}

/**
 * Explicitly represents a date as an approved alternative-package
 * (field trip, etc.) or non-instructional (PTO/break) day — the only way
 * generatePlan's certification gate will ever treat missing curriculum
 * content as intentional rather than a configuration gap (see
 * certificationGate.ts). kidKeys defaults to all three students when
 * omitted; every value must be a real kid key.
 */
export const designateDay = onCall<DesignateDayRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId, date, type, description, kidKeys } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);
  if (!date || typeof date !== "string" || Number.isNaN(new Date(date).getTime())) {
    throw new HttpsError("invalid-argument", "A valid date is required.");
  }
  if (type !== "alternativePackage" && type !== "nonInstructional") {
    throw new HttpsError("invalid-argument", 'type must be "alternativePackage" or "nonInstructional".');
  }
  if (!description || typeof description !== "string" || description.trim().length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "A description is required — this is never inferred, it has to say what's actually happening."
    );
  }

  const resolvedKidKeys = Array.isArray(kidKeys) && kidKeys.length > 0 ? kidKeys : PLACEMENT_KID_KEYS;
  for (const k of resolvedKidKeys) {
    if (!isValidKidKey(k)) {
      throw new HttpsError("invalid-argument", `kidKeys must each be one of: ${PLACEMENT_KID_KEYS.join(", ")}.`);
    }
  }

  const { proposalId } = await createProposal<DayDesignationPayload>({
    kind: "dayDesignation",
    familyId,
    proposedByUid: caller.uid,
    proposedByRole: "teacher",
    payload: {
      familyId,
      date,
      kidKeys: resolvedKidKeys as PlacementKidKey[],
      type,
      description: description.trim(),
    },
  });

  let designationId = "";
  await approveProposal<DayDesignationPayload>({
    proposalId,
    reviewerUid: caller.uid,
    commit: (tx, payload) => {
      const ref = getFirestore().collection("dayDesignations").doc();
      designationId = ref.id;
      const designation: DayDesignation = {
        familyId: payload.familyId,
        date: payload.date,
        kidKeys: payload.kidKeys,
        type: payload.type,
        description: payload.description,
        createdByUid: caller.uid,
        createdAt: Timestamp.now(),
      };
      tx.set(ref, designation);
    },
  });

  return { designationId };
});
