import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import { buildDiagnosticDetail, classifyAnthropicError, sanitizeTechnicalMessage, throwDiagnosticError } from "./diagnostics";

test("buildDiagnosticDetail produces a stable shape with a fresh errorId and ISO timestamp each call", () => {
  const a = buildDiagnosticDetail("plan-generation", "PLAN-GEN-AUTH", "invalid x-api-key");
  const b = buildDiagnosticDetail("plan-generation", "PLAN-GEN-AUTH", "invalid x-api-key");
  assert.notEqual(a.errorId, b.errorId);
  assert.equal(a.stage, "plan-generation");
  assert.equal(a.code, "PLAN-GEN-AUTH");
  assert.equal(a.technicalMessage, "invalid x-api-key");
  assert.ok(!Number.isNaN(Date.parse(a.timestamp)));
  assert.equal("providerStatus" in a, false);
});

test("buildDiagnosticDetail includes providerStatus only when supplied", () => {
  const withStatus = buildDiagnosticDetail("plan-generation", "PLAN-GEN-AUTH", "denied", 401);
  assert.equal(withStatus.providerStatus, 401);
});

test("sanitizeTechnicalMessage redacts anything shaped like an Anthropic API key", () => {
  assert.equal(
    sanitizeTechnicalMessage("Authentication failed for key sk-ant-api03-verysecretvalue123"),
    "Authentication failed for key [redacted]"
  );
});

test("sanitizeTechnicalMessage truncates an excessively long message", () => {
  const long = "x".repeat(2000);
  assert.equal(sanitizeTechnicalMessage(long).length, 500);
});

test("throwDiagnosticError throws an HttpsError whose details carry the full DiagnosticDetail", () => {
  assert.throws(
    () => throwDiagnosticError("internal", "Couldn't generate a plan.", "plan-generation", "PLAN-GEN-AUTH", "bad key", 401),
    (err: unknown) => {
      assert.ok(err instanceof HttpsError);
      assert.equal(err.code, "internal");
      assert.equal(err.message, "Couldn't generate a plan.");
      const details = err.details as ReturnType<typeof buildDiagnosticDetail>;
      assert.equal(details.stage, "plan-generation");
      assert.equal(details.code, "PLAN-GEN-AUTH");
      assert.equal(details.providerStatus, 401);
      return true;
    }
  );
});

test("classifyAnthropicError maps 401/403 to PLAN-GEN-AUTH — the exact shape the ANTHROPIC_API_KEY outage should have surfaced as", () => {
  assert.equal(classifyAnthropicError({ status: 401, message: "invalid x-api-key" }).code, "PLAN-GEN-AUTH");
  assert.equal(classifyAnthropicError({ status: 403, message: "forbidden" }).code, "PLAN-GEN-AUTH");
});

test("classifyAnthropicError maps 429 to PLAN-GEN-RATE-LIMIT", () => {
  assert.equal(classifyAnthropicError({ status: 429, message: "rate limited" }).code, "PLAN-GEN-RATE-LIMIT");
});

test("classifyAnthropicError maps any other numeric provider status to PLAN-GEN-PROVIDER-ERROR", () => {
  assert.equal(classifyAnthropicError({ status: 500, message: "server error" }).code, "PLAN-GEN-PROVIDER-ERROR");
});

test("classifyAnthropicError falls back to PLAN-GEN-UNKNOWN with no providerStatus for a non-API-shaped error", () => {
  const result = classifyAnthropicError(new Error("network timeout"));
  assert.equal(result.code, "PLAN-GEN-UNKNOWN");
  assert.equal(result.providerStatus, undefined);
  assert.equal(result.technicalMessage, "network timeout");
});

test("classifyAnthropicError never throws on a non-Error, non-object input", () => {
  assert.doesNotThrow(() => classifyAnthropicError("a plain string"));
  assert.doesNotThrow(() => classifyAnthropicError(null));
  assert.doesNotThrow(() => classifyAnthropicError(undefined));
});
