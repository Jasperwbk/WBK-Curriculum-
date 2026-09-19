import { useState } from "react";
import { formatDiagnosticForCopy, type DiagnosticDetail } from "../lib/diagnostics";

/**
 * Expandable, copyable technical-failure panel (build-order step 11.1,
 * section 6) — sits under a normal friendly error message, never
 * replacing it. Collapsed by default so the ordinary UI stays
 * understandable; a teacher/internal user who needs to report a failure
 * (e.g. to Cory, or paste into a support conversation) expands it and
 * copies one self-contained block. Never renders anything the underlying
 * DiagnosticDetail doesn't already carry — no API keys, tokens, or
 * secrets are ever read by this component, since none are ever placed
 * into a DiagnosticDetail in the first place (see functions/src/util/
 * diagnostics.ts's sanitizeTechnicalMessage).
 */
export function DiagnosticDetails({ detail }: { detail: DiagnosticDetail }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatDiagnosticForCopy(detail));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied/unavailable — the text is still
      // visible below for manual selection, so this is a silent no-op.
    }
  }

  return (
    <details className="text-xs" style={{ color: "var(--text-muted)" }}>
      <summary className="cursor-pointer select-none">Show technical details</summary>
      <div className="mt-2 space-y-2">
        <pre
          className="whitespace-pre-wrap rounded-md border p-2 text-[11px]"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-secondary)" }}
        >
          {formatDiagnosticForCopy(detail)}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border px-2 py-1 text-[11px] font-medium"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </details>
  );
}
