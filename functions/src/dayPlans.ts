import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";
import { requireCaller, requireTeacher } from "./util/auth";
import { ALL_SUBJECTS } from "./subjects";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

interface GeneratePlanRequest {
  date: string; // ISO date the plan is for
  studentNames: string[]; // display names, for personalizing tone/content
  prompt: string; // teacher's free-text description of the day
}

interface GeneratedPlan {
  title: string;
  summary: string;
  planText: string;
}

/**
 * Generates a draft day plan from the teacher's free-text description —
 * anything from an ordinary school day to "Friday we're camping at X, light
 * on the education, more on fun." Nothing is written to Firestore here; the
 * teacher reviews/edits the result in the UI and saves it themselves
 * (mirrors the human-in-the-loop pattern already used for extracurricular
 * ingestion), which becomes the dayPlans/{planId} doc students only see on
 * or after its date.
 */
export const generatePlan = onCall<GeneratePlanRequest>(
  { secrets: [anthropicApiKey] },
  async (request) => {
    const caller = await requireCaller(request);
    requireTeacher(caller);

    const { date, studentNames, prompt } = request.data ?? {};
    if (!date || typeof date !== "string" || Number.isNaN(new Date(date).getTime())) {
      throw new HttpsError("invalid-argument", "A valid date is required.");
    }
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new HttpsError("invalid-argument", "A description of the day is required.");
    }
    if (prompt.length > 4000) {
      throw new HttpsError("invalid-argument", "Description is too long (4,000 character max).");
    }
    const names = Array.isArray(studentNames) ? studentNames.filter((n) => typeof n === "string") : [];

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system:
        "You write a single day's homeschool plan for a family, from the teacher's own description of " +
        "the day. The description might be an ordinary school day, or something special like a field trip, " +
        "trip, or holiday — match your tone and educational weight to what the teacher actually asked for " +
        "(e.g. 'light on the education, more on fun' means keep it short, playful, and low-pressure; a " +
        "request for a regular focused day means a fuller plan). Where it fits naturally, weave in 1-3 " +
        `concrete learning objectives and mention one of these standardized subjects if relevant: ${ALL_SUBJECTS.join(", ")}. ` +
        "Include a short, optional worksheet or reflection-question idea only if it fits the day's tone — " +
        "skip it for a pure-fun day. " +
        "Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape: " +
        '{"title": string (short, e.g. "Camping Trip: Nature & Fire Safety"), ' +
        '"summary": string (one sentence), ' +
        '"planText": string (the full plan, plain text with blank lines between sections, ' +
        "no markdown headers)}.",
      messages: [
        {
          role: "user",
          content:
            `Date: ${date}\n` +
            (names.length > 0 ? `Kids involved: ${names.join(", ")}\n` : "") +
            `Teacher's description: ${prompt}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new HttpsError("internal", "Claude returned no parseable text.");
    }

    let parsed: GeneratedPlan;
    try {
      parsed = JSON.parse(extractJson(textBlock.text));
    } catch {
      throw new HttpsError("internal", "Could not parse Claude's response as JSON.");
    }

    return {
      title: typeof parsed.title === "string" ? parsed.title : "Day plan",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      planText: typeof parsed.planText === "string" ? parsed.planText : "",
    };
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
