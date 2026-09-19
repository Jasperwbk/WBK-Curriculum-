/**
 * Build/version identifier (build-order step 11.1, section 7) — the prior
 * pre-deployment audit found no reliable way to prove which source commit
 * a deployed build was actually serving. `__WBK_BUILD_SHA__`/
 * `__WBK_BUILD_TIME__` are literal string constants injected at build
 * time by vite.config.ts's `define` (a short git SHA + the moment `vite
 * build` ran) — never a runtime value, never anything read from the
 * environment or a secret. Declared here (not a separate .d.ts) per
 * Vite's own documented pattern for typed `define` constants.
 */
declare const __WBK_BUILD_SHA__: string;
declare const __WBK_BUILD_TIME__: string;

export const BUILD_SHA: string = typeof __WBK_BUILD_SHA__ !== "undefined" ? __WBK_BUILD_SHA__ : "dev";
export const BUILD_TIME: string = typeof __WBK_BUILD_TIME__ !== "undefined" ? __WBK_BUILD_TIME__ : "unknown";

/** A short, human-scannable label for an unobtrusive teacher/internal footer — never shown to students. */
export function buildLabel(): string {
  return `${BUILD_SHA} · ${BUILD_TIME === "unknown" ? "unknown build time" : new Date(BUILD_TIME).toLocaleString()}`;
}
