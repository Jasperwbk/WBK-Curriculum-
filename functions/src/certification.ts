import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { requireCaller, requireTeacher, requireSameFamily } from "./util/auth";
import { createProposal, approveProposal } from "./approvals";
import {
  isValidKidKey,
  isValidQuarter,
  loadAllWeekEntries,
  PLACEMENT_KID_KEYS,
  QUARTERS,
} from "./curriculum/loadCurriculumContent";
import { hashQuarterShape } from "./curriculum/contentHash";
import {
  getQuarterCertificationStatus,
  getWeeklyCertificationStatus,
} from "./curriculum/certificationStatus";
import type {
  CertificationSource,
  PlacementKidKey,
  Quarter,
  QuarterCertification,
  WeeklyCertification,
} from "./types";

/**
 * Quarter + weekly certification (build-order step 3), built on the
 * generalized approval primitive (approvals.ts) rather than a new
 * independent review pattern — certifying IS proposing-and-immediately-
 * approving a proposal of kind "quarterCertification"/"weeklyCertification".
 * There's no separate later-approver step here: the teacher looking at the
 * content and certifying it is both the proposer and the approver in one
 * action, same as how a teacher reviewing/saving a day plan today is one
 * action, not two people. "Either authorized teacher may certify" just
 * means any teacher account in the family can be the one performing it,
 * not that two teachers are required per certification.
 */

interface QuarterCertificationPayload {
  familyId: string;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  contentHash: string;
}

interface WeeklyCertificationPayload {
  familyId: string;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
  contentHash: string;
  quarterCertificationId: string;
}

/** Shared by certifyQuarter and bootstrapExistingCertifications. Throws if there's no content to certify. */
async function certifyQuarterInternal(params: {
  familyId: string;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  certifiedByUid: string;
  source: CertificationSource;
}): Promise<{ certificationId: string; contentHash: string }> {
  const weeks = await loadAllWeekEntries(params.familyId, params.kidKey, params.quarter);
  if (!weeks || weeks.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      `No curriculum content found for ${params.kidKey} / ${params.quarter.toUpperCase()} yet — nothing to certify.`
    );
  }
  const contentHash = hashQuarterShape(weeks);

  const { proposalId } = await createProposal<QuarterCertificationPayload>({
    kind: "quarterCertification",
    familyId: params.familyId,
    proposedByUid: params.certifiedByUid,
    proposedByRole: "teacher",
    payload: { familyId: params.familyId, kidKey: params.kidKey, quarter: params.quarter, contentHash },
  });

  let certificationId = "";
  await approveProposal<QuarterCertificationPayload>({
    proposalId,
    reviewerUid: params.certifiedByUid,
    commit: (tx, payload) => {
      const ref = getFirestore().collection("quarterCertifications").doc();
      certificationId = ref.id;
      const cert: QuarterCertification = {
        familyId: payload.familyId,
        kidKey: payload.kidKey,
        quarter: payload.quarter,
        certifiedContentHash: payload.contentHash,
        certifiedByUid: params.certifiedByUid,
        certifiedAt: Timestamp.now(),
        source: params.source,
      };
      tx.set(ref, cert);
    },
  });

  return { certificationId, contentHash };
}

/** Shared by certifyWeek and bootstrapExistingCertifications. Requires the quarter to be currently certified first. */
async function certifyWeekInternal(params: {
  familyId: string;
  kidKey: PlacementKidKey;
  quarter: Quarter;
  week: number;
  certifiedByUid: string;
  source: CertificationSource;
}): Promise<{ certificationId: string; contentHash: string }> {
  const quarterStatus = await getQuarterCertificationStatus(params.familyId, params.kidKey, params.quarter);
  if (quarterStatus.status !== "certified" || !quarterStatus.latest) {
    throw new HttpsError(
      "failed-precondition",
      `Certify the ${params.quarter.toUpperCase()} quarter for ${params.kidKey} first (current status: ${quarterStatus.status}).`
    );
  }

  const weekStatus = await getWeeklyCertificationStatus(
    params.familyId,
    params.kidKey,
    params.quarter,
    params.week
  );
  if (!weekStatus.hasContent || weekStatus.currentHash === null) {
    throw new HttpsError(
      "failed-precondition",
      `No curriculum content found for ${params.kidKey} / ${params.quarter.toUpperCase()} Week ${params.week} yet — nothing to certify.`
    );
  }
  const contentHash = weekStatus.currentHash;

  const { proposalId } = await createProposal<WeeklyCertificationPayload>({
    kind: "weeklyCertification",
    familyId: params.familyId,
    proposedByUid: params.certifiedByUid,
    proposedByRole: "teacher",
    payload: {
      familyId: params.familyId,
      kidKey: params.kidKey,
      quarter: params.quarter,
      week: params.week,
      contentHash,
      quarterCertificationId: quarterStatus.latest.id,
    },
  });

  let certificationId = "";
  await approveProposal<WeeklyCertificationPayload>({
    proposalId,
    reviewerUid: params.certifiedByUid,
    commit: (tx, payload) => {
      const ref = getFirestore().collection("weeklyCertifications").doc();
      certificationId = ref.id;
      const cert: WeeklyCertification = {
        familyId: payload.familyId,
        kidKey: payload.kidKey,
        quarter: payload.quarter,
        week: payload.week,
        quarterCertificationId: payload.quarterCertificationId,
        certifiedContentHash: payload.contentHash,
        certifiedByUid: params.certifiedByUid,
        certifiedAt: Timestamp.now(),
        source: params.source,
      };
      tx.set(ref, cert);
    },
  });

  return { certificationId, contentHash };
}

interface CertifyQuarterRequest {
  familyId: string;
  kidKey: string;
  quarter: string;
}

/** A teacher reviews and certifies a kid's quarter-level curriculum shape (the 9-week theme arc). */
export const certifyQuarter = onCall<CertifyQuarterRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId, kidKey, quarter } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);
  if (!isValidKidKey(kidKey)) {
    throw new HttpsError("invalid-argument", `kidKey must be one of: ${PLACEMENT_KID_KEYS.join(", ")}.`);
  }
  if (!isValidQuarter(quarter)) {
    throw new HttpsError("invalid-argument", `quarter must be one of: ${QUARTERS.join(", ")}.`);
  }

  const result = await certifyQuarterInternal({
    familyId,
    kidKey,
    quarter,
    certifiedByUid: caller.uid,
    source: "reviewed",
  });
  return result;
});

interface CertifyWeekRequest {
  familyId: string;
  kidKey: string;
  quarter: string;
  week: number;
}

/** A teacher reviews and certifies one week's actual instructional content. Requires the quarter to already be certified. */
export const certifyWeek = onCall<CertifyWeekRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const { familyId, kidKey, quarter, week } = request.data ?? {};
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  requireSameFamily(caller, familyId);
  if (!isValidKidKey(kidKey)) {
    throw new HttpsError("invalid-argument", `kidKey must be one of: ${PLACEMENT_KID_KEYS.join(", ")}.`);
  }
  if (!isValidQuarter(quarter)) {
    throw new HttpsError("invalid-argument", `quarter must be one of: ${QUARTERS.join(", ")}.`);
  }
  if (!Number.isInteger(week) || week < 1 || week > 9) {
    throw new HttpsError("invalid-argument", "week must be an integer from 1 to 9.");
  }

  const result = await certifyWeekInternal({
    familyId,
    kidKey,
    quarter,
    week,
    certifiedByUid: caller.uid,
    source: "reviewed",
  });
  return result;
});

interface BootstrapCertificationsRequest {
  familyId: string;
}

interface BootstrapResult {
  quartersCertified: { kidKey: PlacementKidKey; quarter: Quarter }[];
  weeksCertified: { kidKey: PlacementKidKey; quarter: Quarter; week: number }[];
  alreadyCurrent: { kidKey: PlacementKidKey; quarter: Quarter; week?: number }[];
}

/**
 * One-time (but safe to re-run) catch-up for curriculum content that
 * already existed before this certification system did — Q1, most
 * notably, which is live and in active use today. Purely additive and
 * idempotent: for every kid/quarter/week that has content but no current
 * certification, creates one, source "bootstrap" (honestly flagged as
 * retroactive, not a genuine line-by-line review); anything already
 * certified-and-current is left untouched and reported as skipped. Never
 * edits or deletes an existing certification, curriculumContent doc, or
 * anything else. Must be explicitly called by a signed-in teacher — no
 * certification here is fabricated without a real uid/timestamp/audit
 * trail behind it.
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

  for (const kidKey of PLACEMENT_KID_KEYS) {
    for (const quarter of QUARTERS) {
      const quarterStatus = await getQuarterCertificationStatus(familyId, kidKey, quarter);
      if (quarterStatus.currentHash === null) {
        continue; // nothing uploaded/bundled for this kid+quarter — nothing to bootstrap
      }

      if (quarterStatus.status === "certified") {
        result.alreadyCurrent.push({ kidKey, quarter });
      } else {
        await certifyQuarterInternal({
          familyId,
          kidKey,
          quarter,
          certifiedByUid: caller.uid,
          source: "bootstrap",
        });
        result.quartersCertified.push({ kidKey, quarter });
      }

      const weeks = await loadAllWeekEntries(familyId, kidKey, quarter);
      for (const weekEntry of weeks ?? []) {
        const weekStatus = await getWeeklyCertificationStatus(familyId, kidKey, quarter, weekEntry.week);
        if (weekStatus.status === "certified") {
          result.alreadyCurrent.push({ kidKey, quarter, week: weekEntry.week });
          continue;
        }
        await certifyWeekInternal({
          familyId,
          kidKey,
          quarter,
          week: weekEntry.week,
          certifiedByUid: caller.uid,
          source: "bootstrap",
        });
        result.weeksCertified.push({ kidKey, quarter, week: weekEntry.week });
      }
    }
  }

  return result;
});
