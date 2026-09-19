import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

// Build identifier (build-order step 11.1, section 7) — proving exactly
// which source commit a deployed build came from, without an emulator or
// live Firebase access, was a real, disclosed gap in the prior pre-
// deployment audit. Computed once per `vite build`/`vite dev` invocation
// (never per-request), then injected as literal string constants via
// `define` — see web/src/lib/buildInfo.ts for the typed read side. Falls
// back to "unknown" rather than failing the build when git isn't
// available (e.g. a source archive with no .git directory).
function shortGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __WBK_BUILD_SHA__: JSON.stringify(shortGitSha()),
    __WBK_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
