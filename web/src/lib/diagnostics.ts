import { BUILD_SHA, BUILD_TIME } from "./buildInfo";

/**
 * Client-side counterpart to functions/src/util/diagnostics.ts (build-
 * order step 11.1, section 6). A Firebase callable's HttpsError `details`
 * argument arrives on the caught error as `.details` (Firebase JS SDK's
 * FunctionsError) — when a callable used throwDiagnosticError, that IS a
 * DiagnosticDetail already; extractDiagnosticDetail recognizes that shape
 * and passes it through unchanged. For any other failure (a plain
 * permission-denied, a network error, an error thrown before this
 * codebase's diagnostic wrapping existed) it builds the best available
 * fallback instead of showing nothing — a stage name, the Firebase error
 * code if there is one, and the caught message, sanitized the same way.
 */
export interface DiagnosticDetail {
  errorId: string;
  stage: string;
  code: string;
  timestamp: string;
  providerStatus?: number;
  technicalMessage: string;
}

function isDiagnosticDetail(value: unknown): value is DiagnosticDetail {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).errorId === "string" &&
    typeof (value as Record<string, unknown>).stage === "string" &&
    typeof (value as Record<string, unknown>).code === "string"
  );
}

/** Same redaction rule as the functions-side sanitizer — a defense-in-depth backstop for a fallback path that never had access to structured diagnostics. */
function sanitize(message: string): string {
  return message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

function newErrorId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function extractDiagnosticDetail(err: unknown, fallbackStage: string): DiagnosticDetail {
  const details = err && typeof err === "object" ? (err as { details?: unknown }).details : undefined;
  if (isDiagnosticDetail(details)) {
    return details;
  }

  const firebaseCode = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  const message = err instanceof Error && err.message ? err.message : "An unexpected error occurred.";

  return {
    errorId: newErrorId(),
    stage: fallbackStage,
    code: typeof firebaseCode === "string" ? firebaseCode : "UNKNOWN",
    timestamp: new Date().toISOString(),
    technicalMessage: sanitize(message),
  };
}

/** A single copy-paste-ready text block — everything needed to report a failure, nothing that shouldn't leave the browser. */
export function formatDiagnosticForCopy(detail: DiagnosticDetail): string {
  const lines = [
    `Error ID: ${detail.errorId}`,
    `Stage: ${detail.stage}`,
    `Code: ${detail.code}`,
    `Timestamp: ${detail.timestamp}`,
    ...(detail.providerStatus !== undefined ? [`Provider status: ${detail.providerStatus}`] : []),
    `Message: ${detail.technicalMessage}`,
    `Build: ${BUILD_SHA} (${BUILD_TIME})`,
  ];
  return lines.join("\n");
}
