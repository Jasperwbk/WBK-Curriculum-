import {
  CORE_SUBJECTS,
  SPECIALTY_SUBJECTS,
  type Subject,
  type SubjectType,
} from "./types";

const CORE_SET: ReadonlySet<string> = new Set(CORE_SUBJECTS);
const SPECIALTY_SET: ReadonlySet<string> = new Set(SPECIALTY_SUBJECTS);

export const ALL_SUBJECTS: readonly Subject[] = [
  ...CORE_SUBJECTS,
  ...SPECIALTY_SUBJECTS,
];

export function isValidSubject(value: string): value is Subject {
  return CORE_SET.has(value) || SPECIALTY_SET.has(value);
}

/** Mirrors which standardized list a subject came from — core or specialty. */
export function getSubjectType(subject: string): SubjectType {
  if (CORE_SET.has(subject)) return "core";
  if (SPECIALTY_SET.has(subject)) return "specialty";
  throw new Error(`Unknown subject: "${subject}". Must be one of ${ALL_SUBJECTS.join(", ")}.`);
}
