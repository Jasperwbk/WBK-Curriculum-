import { initializeApp } from "firebase-admin/app";

initializeApp();

export { getDashboardData } from "./dashboard";
export { parseExtracurricular, confirmExtracurricular } from "./extracurriculars";
