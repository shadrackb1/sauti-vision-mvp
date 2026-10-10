/**
 * Restart-backoff policy for the Web Speech recognition loop.
 * Loads the SAME ESM module the browser uses (client/js/backoff.mjs) via
 * dynamic import — single source of truth, no duplication.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

test("backoff policy: immediate first restart, exponential growth, capped", async () => {
  const { nextRestartDelay } = await import("../client/js/backoff.mjs");

  // First restart immediate — silence auto-end must not feel laggy
  assert.equal(nextRestartDelay(0), 0);
  assert.equal(nextRestartDelay(-3), 0);

  // Exponential growth
  assert.equal(nextRestartDelay(1), 500);
  assert.equal(nextRestartDelay(2), 1000);
  assert.equal(nextRestartDelay(3), 2000);
  assert.equal(nextRestartDelay(4), 4000);

  // Capped — a dead recognition service becomes a slow poll, not a hot loop
  assert.equal(nextRestartDelay(5), 8000);
  assert.equal(nextRestartDelay(50), 8000);
  assert.equal(nextRestartDelay(1000), 8000);

  // Robustness: fractional counts floor, never throw
  assert.equal(nextRestartDelay(2.9), 1000);
});
