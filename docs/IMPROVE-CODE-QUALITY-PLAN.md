# IMPROVE-CODE-QUALITY-PLAN — Sauti Vision MVP

Journey: vibe-coded prototype → hardened, demo-credible MVP (improve-code-quality skill).
Resumed from this file on any future session. A journey with a tracker is resumed, never restarted.

## Intake (inferred from user direction, 2026-10-10)

1. **App / worst case if it breaks:** CRIW 2026 demo of the Access Loop. Worst case: demo fails on stage or in the Kabarak campus pilot — public credibility, not data loss.
2. **Module changing next:** `client/js/vision.js` (real gesture classification hook) and `server/index.js` (concurrent-use safety). Core domain: captions → queue → memory (the Access Loop).
3. **Automated tests before this journey:** 2 (one HTTP smoke, one data-parse check). No client tests.
4. **Stack:** Node built-in `http` server, vanilla-JS ES-module client, JSON file persistence under `server/state/` (override `SAUTI_STATE_DIR`). No framework, no DB, no build step.
5. **Production / users:** none yet. Kabarak campus pilot is the next real-user event (learner + teacher hitting the same API concurrently).
6. **Outbound dependencies:** browser-side only — Web Speech API, MediaPipe Tasks Vision via CDN, webcam.
7. **Journey scope now:** Phases 1–6 (safety net, readability, refactor, structure, boundary, habits) + targeted feature/UX work. Phases 7–9 `deferred: no real load yet — pilot has ≤3 concurrent users`.

## Phase Status

| # | Phase (skill) | Status | Notes |
|---|---|---|---|
| 1 | Safety net (working-with-legacy-code) — GATE | done | 12 characterization tests green (14 total). Baseline committed `4d03c67`→2 commits. |
| 2 | Readability (clean-code) | pending | Score current modules, fix top smells. |
| 3 | Named refactorings (refactoring-patterns) | pending | debt-ledger smells get named transformations. |
| 4 | Deep modules (software-design-philosophy) | pending | mock-api/client data duplication is the headline. |
| 5 | Boundary (clean-architecture) | pending | extract domain (questions/memory rules) from `server/index.js` HTTP glue. |
| 6 | Habits (pragmatic-programmer) | pending | DRY the duplicated knowledge; boarding policy for hacks. |
| 7 | Production hardening (release-it) | deferred: no real load yet — pilot ≤3 users; revisit at pilot |
| 8 | Sizing (system-design) | deferred: no real load yet |
| 9 | Data layer (ddia-systems) | deferred: JSON files acceptable at pilot scale; race fix lands in Phase 2-3 as a correctness bug |

## Key Decisions

- **Commit discipline:** structure-only and behavior-only commits never mixed; tests green between every step (Phase 1 rule, applies journey-long).
- **Pinned quirks:** `answeredAt` refresh-on-answer quirk and mode-default-to-`later` are pinned in characterization tests; any fix is its own deliberate behavior-change commit with test updated in the same commit.
- **Client verification:** no jsdom harness (env constraint); the client is verified by a real-browser pass (browser_exec / dogfood) at journey milestones, not by fabricated unit coverage.
- **Scope guard:** no auth, no DB swap, no bundler, no framework migration. The CRIW demo reliability path stays: demo sign library + scripted lesson are always-first fallbacks.

## Next Actions

1. Phase 2: clean-code score for `server/index.js`, `state.js`, `vision.js`; apply top fixes.
2. Fix the questions.json/memory.json read-modify-write race (correctness, small).
3. Real gesture-classification hook in `vision.js` once the media-capture spike reports back (subagent running).
4. DRY the signs/terms/lesson duplication between `server/data/*.json` and `client/js/mock-api.js` (single source of truth: server data files).
5. Apply top UI-audit fixes once the audit subagent reports back.
6. Real-browser end-to-end pass: play demo lesson → queue question → teacher answers → save memory.
