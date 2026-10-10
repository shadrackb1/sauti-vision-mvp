/**
 * Restart-backoff policy for the Web Speech recognition loop.
 * Pure functions, zero dependencies, ESM (.mjs) so both Node (dynamic import
 * in tests) and the browser (import in captions.js) load the SAME file —
 * single source of truth, no build step.
 *
 * Policy: restart #0 is immediate (normal silence auto-end must not feel
 * laggy), then exponential growth capped so a persistently failing
 * recognition service degrades to a slow poll instead of a hot loop.
 */

const BASE_DELAY_MS = 500;
const CAP_MS = 8000;

/** Delay (ms) before restart attempt `attempt` (0 = first, immediate). */
export function nextRestartDelay(attempt) {
  const n = Math.max(0, Math.floor(attempt));
  if (n <= 0) return 0;
  return Math.min(CAP_MS, BASE_DELAY_MS * 2 ** (n - 1));
}
