import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { requireCaller, requireTeacher, requireSameFamily } from "./util/auth";
import { getSubjectType, isValidSubject, ALL_SUBJECTS } from "./subjects";
import type { ExtracurricularType, Subject, UserProfile } from "./types";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const VALID_TYPES: readonly ExtracurricularType[] = [
  "tutor",
  "class",
  "sport",
  "award",
  "other",
];

interface ParsedExtracurricular {
  type: ExtracurricularType;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  subjectTag: Subject | null;
  durationMinutes: number | null;
  notes: string;
}

interface ParseExtracurricularRequest {
  rawText: string;
}

/**
 * Step 1 of the ingestion flow: teacher drags in a plain text file (a class
 * summary, tutor's note, award announcement) and this callable asks Claude
 * to parse it into the structured extracurriculars/ fields. Nothing is
 * written to Firestore here — the teacher reviews/edits the result in the
 * UI and calls confirmExtracurricular to actually save it, keeping a human
 * in the loop to catch misreads.
 */
export const parseExtracurricular = onCall<ParseExtracurricularRequest>(
  { secrets: [anthropicApiKey] },
  async (request) => {
    const caller = await requireCaller(request);
    requireTeacher(caller);

    const rawText = request.data?.rawText;
    if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
      throw new HttpsError("invalid-argument", "rawText is required.");
    }
    if (rawText.length > 20000) {
      throw new HttpsError("invalid-argument", "rawText is too long (20,000 character max).");
    }

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });
    const today = new Date().toISOString().slice(0, 10);

    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system:
        "You extract structured extracurricular-activity records for a homeschool tracker " +
        "from a dropped-in text file (a class summary, a tutor's note, or an award announcement). " +
        "Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape: " +
        `{"type": "tutor"|"class"|"sport"|"award"|"other", "title": string, "date": "YYYY-MM-DD", ` +
        `"subjectTag": one of [${ALL_SUBJECTS.join(", ")}] or null, ` +
        `"durationMinutes": number or null (must be null when type is "award"), "notes": string}. ` +
        `If the date isn't stated, use today's date (${today}). ` +
        "If a field can't be determined, use null (empty string only for notes/title as a last resort).",
      messages: [{ role: "user", content: rawText }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new HttpsError("internal", "Claude returned no parseable text.");
    }

    let parsed: ParsedExtracurricular;
    try {
      parsed = JSON.parse(extractJson(textBlock.text));
    } catch {
      throw new HttpsError("internal", "Could not parse Claude's response as JSON.");
    }

    return sanitizeParsed(parsed);
  }
);

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in response.");
  }
  return text.slice(start, end + 1);
}

function sanitizeParsed(parsed: ParsedExtracurricular): ParsedExtracurricular {
  const type = VALID_TYPES.includes(parsed.type) ? parsed.type : "other";
  const subjectTag =
    parsed.subjectTag && isValidSubject(parsed.subjectTag) ? parsed.subjectTag : null;
  const durationMinutes =
    type === "award"
      ? null
      : typeof parsed.durationMinutes === "number" && parsed.durationMinutes >= 0
        ? parsed.durationMinutes
        : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
    ? parsed.date
    : new Date().toISOString().slice(0, 10);

  return {
    type,
    title: typeof parsed.title === "string" ? parsed.title : "",
    date,
    subjectTag,
    durationMinutes,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

interface ConfirmExtracurricularRequest {
  familyId: string;
  userId: string;
  type: ExtracurricularType;
  title: string;
  date: string; // ISO date, as reviewed/edited by the teacher
  subjectTag: Subject | null;
  durationMinutes: number | null;
  notes: string;
  sourceFileUrl: string; // the raw dropped-in file, already uploaded to Storage
}

/**
 * Step 2 of the ingestion flow: teacher confirms the (possibly edited)
 * parsed fields. Writes extracurriculars/{recordId}, and — unless this is
 * an award, which never generates hours — auto-creates a matching logs/
 * entry with location "external" and source "extracurricular" so the
 * activity flows into the same hour-tracking dashboard without double
 * data entry.
 */
export const confirmExtracurricular = onCall<ConfirmExtracurricularRequest>(async (request) => {
  const caller = await requireCaller(request);
  requireTeacher(caller);

  const data = request.data;
  if (!data) {
    throw new HttpsError("invalid-argument", "Missing request body.");
  }
  requireSameFamily(caller, data.familyId);

  const db = getFirestore();
  const targetSnap = await db.collection("users").doc(data.userId).get();
  if (!targetSnap.exists || (targetSnap.data() as UserProfile).familyId !== data.familyId) {
    throw new HttpsError("invalid-argument", "userId does not belong to this family.");
  }

  if (!VALID_TYPES.includes(data.type)) {
    throw new HttpsError("invalid-argument", "Invalid type.");
  }
  if (!data.title || typeof data.title !== "string") {
    throw new HttpsError("invalid-argument", "title is required.");
  }
  const dateObj = new Date(data.date);
  if (Number.isNaN(dateObj.getTime())) {
    throw new HttpsError("invalid-argument", "date must be a valid ISO date.");
  }
  if (data.subjectTag !== null && !isValidSubject(data.subjectTag)) {
    throw new HttpsError("invalid-argument", "subjectTag is not a standardized subject.");
  }
  // Awards have no duration by definition.
  const durationMinutes = data.type === "award" ? null : data.durationMinutes;
  if (durationMinutes !== null && (typeof durationMinutes !== "number" || durationMinutes < 0)) {
    throw new HttpsError(
      "invalid-argument",
      "durationMinutes must be a non-negative number or null."
    );
  }
  // A logged entry needs a subject to route hours into the right gauge —
  // if there are hours to log, subjectTag can't be null.
  if (durationMinutes !== null && !data.subjectTag) {
    throw new HttpsError(
      "invalid-argument",
      "subjectTag is required whenever durationMinutes is set."
    );
  }
  if (!data.sourceFileUrl || typeof data.sourceFileUrl !== "string") {
    throw new HttpsError("invalid-argument", "sourceFileUrl is required.");
  }

  const recordRef = db.collection("extracurriculars").doc();
  const shouldCreateLog = data.type !== "award" && durationMinutes !== null;
  const logRef = shouldCreateLog ? db.collection("logs").doc() : null;
  const dateTimestamp = Timestamp.fromDate(dateObj);

  await db.runTransaction(async (tx) => {
    tx.set(recordRef, {
      familyId: data.familyId,
      userId: data.userId,
      type: data.type,
      title: data.title,
      date: dateTimestamp,
      subjectTag: data.subjectTag,
      durationMinutes,
      notes: data.notes ?? "",
      sourceFileUrl: data.sourceFileUrl,
    });

    if (logRef && data.subjectTag) {
      tx.set(logRef, {
        familyId: data.familyId,
        userId: data.userId,
        date: dateTimestamp,
        subject: data.subjectTag,
        subjectType: getSubjectType(data.subjectTag),
        durationMinutes,
        location: "external",
        source: "extracurricular",
        extracurricularId: recordRef.id,
      });
    }
  });

  return { recordId: recordRef.id, logId: logRef?.id ?? null };
});
