import { initializeApp } from "firebase-admin/app";

initializeApp();

export { getDashboardData } from "./dashboard";
export { parseExtracurricular, confirmExtracurricular } from "./extracurriculars";
export { generatePlan } from "./dayPlans";
export { submitPlacementTest, submitPrintableCheckIn, submitPlacementResponses } from "./placementTest";
export { submitCheckIn } from "./checkIn";
export { certifyQuarter, certifyWeek, bootstrapExistingCertifications, designateDay } from "./certification";
export {
  generateProposedDays,
  checkProposedDayStaleness,
  approveProposedDay,
  saveProposedDayDraft,
  getGenerationTargetDate,
  // setAssessmentEligibility was built and tested in step 5 but never
  // actually wired into this export list — caught during step 6 while
  // adding its own exports below; it would never have been deployable
  // until now.
  setAssessmentEligibility,
} from "./proposedDays";
export {
  openEvidencePacket,
  saveEvidencePacketDraft,
  approveEvidencePacket,
  approveEvidencePackets,
  reconcileEvidencePacket,
  recordHistoricalFigureRetention,
} from "./evidencePackets";
export { updateFamilyClosingWords } from "./familySettings";
export { assignPresentationIdentity } from "./identity/presentationIdentity";
export {
  createHelpRequest,
  respondToHelpRequest,
  escalateHelpRequest,
  resolveHelpRequest,
} from "./identity/helpRequests";
export {
  createQualityIssue,
  quarantineContentVersion,
  releaseQuarantine,
  resolveQualityIssue,
  updateQualityIssueSeverity,
} from "./curriculumQualityIssues";
