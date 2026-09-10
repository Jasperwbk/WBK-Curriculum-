export const CORE_SUBJECTS = [
  "reading_language_arts",
  "math",
  "science",
  "social_studies_history",
] as const;

export const SPECIALTY_SUBJECTS = [
  "bushcraft_outdoor_skills",
  "homestead_skills",
  "nature_identification",
  "spiritual_cultural",
] as const;

export type Subject = (typeof CORE_SUBJECTS)[number] | (typeof SPECIALTY_SUBJECTS)[number];

export const ALL_SUBJECTS: readonly Subject[] = [...CORE_SUBJECTS, ...SPECIALTY_SUBJECTS];

export type SubjectType = "core" | "specialty";

const CORE_SET: ReadonlySet<string> = new Set(CORE_SUBJECTS);

export function getSubjectType(subject: string): SubjectType {
  return CORE_SET.has(subject) ? "core" : "specialty";
}

const SUBJECT_LABELS: Record<Subject, string> = {
  reading_language_arts: "Reading / Language Arts",
  math: "Math",
  science: "Science",
  social_studies_history: "Social Studies / History",
  bushcraft_outdoor_skills: "Bushcraft / Outdoor Skills",
  homestead_skills: "Homestead Skills",
  nature_identification: "Nature Identification",
  spiritual_cultural: "Spiritual / Cultural",
};

export function subjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject as Subject] ?? subject;
}

export type Location = "home" | "field" | "external";

export const LOCATION_LABELS: Record<Location, string> = {
  home: "Home (on-property)",
  field: "Field (on-property, off-structure)",
  external: "External (off-property)",
};
