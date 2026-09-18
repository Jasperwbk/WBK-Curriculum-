import { initializeApp } from "firebase-admin/app";

initializeApp();

export { getDashboardData } from "./dashboard";
export { parseExtracurricular, confirmExtracurricular } from "./extracurriculars";
export { generatePlan } from "./dayPlans";
export { submitPlacementTest, submitPrintableCheckIn, submitPlacementResponses } from "./placementTest";
export { submitCheckIn } from "./checkIn";
export { certifyQuarter, certifyWeek, bootstrapExistingCertifications, designateDay } from "./certification";
export { generateProposedDays, checkProposedDayStaleness, approveProposedDay } from "./proposedDays";
