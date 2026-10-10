# TESTING.md — Test Strategy & Safety Net Map

## Test Strategy

- **Server (API + static):** characterization tests via `node:test`, exercising the real `createServer()` over loopback HTTP with isolated `SAUTI_STATE_DIR` temp dirs. Command: `npm test`.
- **Data integrity:** cross-file checks (sign.termId → term ids, duplicate ids, parse) so a bad data edit fails CI, not the demo.
- **Client:** no DOM harness in this environment. Client behavior is verified by a real-browser pass at milestones (play demo lesson → tap term → queue question → teacher answer → save Lecture Memory). Findings from that pass become regression notes here.
- **Rule:** every behavior change ships with the test that pins it updated in the same commit. Structure-only commits keep all tests green untouched.

## Safety Net Map

| Module | Pinned behaviors | Test files | Gaps |
|---|---|---|---|
| `server/index.js` — health | shape `{ok, service, time}` | `test/api-characterization.test.js` | — |
| `server/index.js` — signs/terms/lesson GET | array shapes, term card fields, related-id integrity, 404 on unknown term | same + `test/api.test.js` | — |
| `server/index.js` — questions POST/PATCH | 400 empty/invalid body, mode default `later` (pinned quirk), full lifecycle pending→answered→pending, answeredAt set/cleared, answer-only PATCH keeps status `pending` (pinned quirk), answeredAt refreshed by answer PATCH on answered item (pinned quirk), 404 unknown id | same | PATCH body validation breadth (unknown status values ignored — pinned implicitly) |
| `server/index.js` — memory POST/GET | defaults for all fields, list, fetch by id, 404 | same | — |
| `server/index.js` — static serving | `/`, css/js MIME, 404 missing, 405 non-GET, traversal attempts (`/../package.json`, encoded, backslash) blocked | same | — |
| `server/data/*.json` | parse, no duplicate ids, sign.termId resolves, lesson shape | same | content edits still need eyes (data is copy) |
| `client/js/*` | NOT unit-pinned — real-browser milestone passes | (milestone notes below) | all DOM behavior |

## Characterization Backlog

- Client `state.js#linkTerms` term-chip regex behavior (title match, longest-first, case-insensitive) — pin when a DOM harness exists or via browser-assert script.
- `mock-api.js` parity with server responses (it duplicates business rules — tracked as debt; when deduped, parity is enforced by construction instead of tests).

## Real-Browser Milestone Notes

(to be filled at each milestone pass — date, what path was walked, what broke)
