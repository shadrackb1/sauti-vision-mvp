# TECH-DEBT.md — Debt Ledger

## Debt Ledger

| # | Item | Location | Type | Risk | Effort | Priority | Status |
|---|---|---|---|---|---|---|---|
| D1 | Landmarks are drawn but never classified — "recognition" is demo-library clicks only; the AI claim has no gesture path | `client/js/vision.js` (drawHands/tick) | missing feature / honesty gap | high (core pitch) | M | P1 | open — blocked on media-capture spike (subagent), then rule-based classifier hook |
| D2 | Read-modify-write race on questions.json/memory.json — two concurrent requests lose an update | `server/index.js` (readJson/writeJson + POST/PATCH handlers) | correctness | high at pilot (teacher + learner concurrent), low solo | S | P1 | open |
| D3 | Signs/terms/lesson data duplicated between `server/data/*.json` and `client/js/mock-api.js` (~320 lines) — data edits must be made twice | `client/js/mock-api.js` | DRY / knowledge duplication | medium (data drift breaks parity silently) | S | P1 | open |
| D4 | `answeredAt` refreshed by answer-only PATCH on already-answered question (pinned in tests) | `server/index.js` PATCH handler | quirk → candidate behavior fix | low | S | P3 | pinned; fix only as deliberate change |
| D5 | Unknown `mode` silently defaults to `later` (pinned) | `server/index.js` POST /api/questions | quirk | low | S | P3 | pinned; acceptable (lenient client) |
| D6 | No security headers (X-Content-Type-Options, etc.) on responses | `server/index.js` sendJson/serveStatic | hardening | low (localhost demo) | S | P3 | open |
| D7 | Web Speech auto-restart loop: `onend` → `start()` on every end event while micOn; no backoff if service repeatedly errors | `client/js/captions.js` (setupSpeech/onend) | robustness | medium (spins in bad network) | S | P2 | open |
| D8 | `lang = "en-KE"` may be unsupported in some engines (falls back to default) | `client/js/captions.js` | platform quirk | low | S | P3 | open — verify in spike results |
| D9 | Server binds all interfaces by default (`listen(PORT)` without host) | `server/index.js` require.main block | exposure | low (demo LAN use may actually want this) | S | P3 | open — note: pilot over LAN may require 0.0.0.0, document instead of "fix" |
| D10 | `linkTerms` rebuilds term list per call with O(n²) find inside map | `client/js/state.js` | perf smell (n=7, irrelevant today) | low | S | P4 | open — fold into Phase 2 pass |
| D11 | Client modules have zero automated coverage; verification relies on milestone browser passes | `client/js/*` | test gap | medium | M | P2 | open — milestone browser pass recorded in TESTING.md |
| D12 | Empty-state / error-copy UX and a11y gaps | client shell | UX | medium | S/M | P2 | open — blocked on UI audit (subagent) |

## Sprout / Wrap Register

(none yet — new code sprouted untested would be listed here with a payback note)

## Adopted Conventions

(to be recorded at Phase 2/6 — naming, error-handling, commit discipline already fixed by Phase 1 rule)
