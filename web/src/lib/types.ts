import type { Subject } from "./subjects";
import type { GaugeStatus } from "../components/Gauge";

export interface GaugeData {
  label: string;
  expectedHours: number;
  actualHours: number;
  balanceHours: number;
  status: GaugeStatus;
}

export interface DashboardData {
  asOf: string;
  total: GaugeData;
  core: GaugeData;
  homeCore: GaugeData;
  subjects: Record<Subject, GaugeData>;
}

export interface FamilyMember {
  uid: string;
  displayName: string;
  characterMapping: string | null;
  gradeLabel: string | null;
}
