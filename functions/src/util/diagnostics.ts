import { HttpsError } from "firebase-functions/v2/https";

/**
 * Structured failure diagnostics for internal/family-test use (build-order
 * step 11.1, section 6) — the earlier ANTHROPIC_API_KEY outage surfaced to
 * the teacher only as "Couldn't generate a plan. Try again," which gave no
 * way to tell a bad secret apart from a bad model id, a network blip, or
 * anything else. This module gives every AI-call failure a stable,
 * copyable shape instead: a subsystem/stage, a short controlled error
 * code, a timestamp, the provider's own HTTP status when available, and a
 * SANITIZED technical message — never the raw stack trace, never a secret
 * value.
 *
 * The object built here is attached to HttpsError's `details` field, which
 * Firebase's client SDK delivers back on the caught FunctionsError as-is
 * (`error.details`) — it is NOT part of the message shown by default,
 * so a normal UI can keep showing a friendly message while an expandable
 * "technical details" panel reads this object directly. See
 * web/src/lib/diagnostics.ts for the client-side counterpart.
 */

export type DiagnosticStage = "plan-generation" | "plan-publication";

export type DiagnosticErrorCode =
  | "PLAN-GEN-AUTH"
  | "PLAN-GEN-RATE-LIMIT"
  | "PLAN-GEN-PROVIDER-ERROR"
  | "PLAN-GEN-PARSE-ERROR"
  | "PLAN-GEN-UNKNOWN"
  | "PLAN-PUBLISH-VALIDATION"
  | "PLAN-PUBLISH-UNKNOWN";

export interface DiagnosticDetail {
  errorId: string;
  stage: DiagnosticStage;
  code: DiagnosticErrorCode;
  timestamp: string; // ISO
  providerStatus?: number;
  technicalMessage: string;
}

/** A short, non-guessable-but-not-cryptographic id for correlating a client-reported failure with server logs — not a security token, just a label. */
function newErrorId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Technical messages are shown verbatim in the client's expandable detail
 * panel, so this is the one place that must guarantee nothing secret-
 * shaped ever passes through — a defense-in-depth backstop, not the only
 * safeguard (callers should already avoid handing this raw SDK internals
 * that might embed a key). Anthropic API keys always start with
 * "sk-ant-"; this is redacted unconditionally regardless of source.
 */
export function sanitizeTechnicalMessage(message: string): string {
  return message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

export function buildDiagnosticDetail(
  stage: DiagnosticStage,
  code: DiagnosticErrorCode,
  technicalMessage: string,
  providerStatus?: number
): DiagnosticDetail {
  return {
    errorId: newErrorId(),
    stage,
    code,
    timestamp: new Date().toISOString(),
    ...(providerStatus !== undefined ? { providerStatus } : {}),
    technicalMessage: sanitizeTechnicalMessage(technicalMessage),
  };
}

/** Throws an HttpsError carrying a DiagnosticDetail in `details` — the one place a diagnosable failure becomes the error the client actually receives. */
export function throwDiagnosticError(
  httpsCode: ConstructorParameters<typeof HttpsError>[0],
  userMessage: string,
  stage: DiagnosticStage,
  code: DiagnosticErrorCode,
  technicalMessage: string,
  providerStatus?: number
): never {
  throw new HttpsError(httpsCode, userMessage, buildDiagnosticDetail(stage, code, technicalMessage, providerStatus));
}

/**
 * Classifies an error thrown by the Anthropic SDK into a controlled
 * DiagnosticErrorCode. The SDK's APIError subclasses expose a numeric
 * `.status` (HTTP status from the provider) — 401/403 is exactly the
 * "bad or missing API key" shape the ANTHROPIC_API_KEY outage produced;
 * this is deliberately checked by STATUS CODE, never by string-matching
 * the message (which could vary or, in principle, echo request content).
 */
export function classifyAnthropicError(err: unknown): {
  code: DiagnosticErrorCode;
  providerStatus?: number;
  technicalMessage: string;
} {
  const status = typeof err === "object" && err !== null && "status" in err ? (err as { status: unknown }).status : undefined;
  const providerStatus = typeof status === "number" ? status : undefined;
  const technicalMessage = err instanceof Error ? err.message : "Unknown error contacting the AI provider.";

  if (providerStatus === 401 || providerStatus === 403) {
    return { code: "PLAN-GEN-AUTH", providerStatus, technicalMessage };
  }
  if (providerStatus === 429) {
    return { code: "PLAN-GEN-RATE-LIMIT", providerStatus, technicalMessage };
  }
  if (typeof providerStatus === "number") {
    return { code: "PLAN-GEN-PROVIDER-ERROR", providerStatus, technicalMessage };
  }
  return { code: "PLAN-GEN-UNKNOWN", technicalMessage };
}
