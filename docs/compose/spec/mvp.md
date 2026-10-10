---
feature: mvp
status: delivered
updated: 2026-09-22
branch: feat/mvp
commits: 4d03c67..working-tree
---

# Sauti Vision MVP

## Report

**What was built** — A full-stack classroom workstation MVP that demonstrates the Sauti Vision Access Loop (Listen → Understand → Ask → Learn → Revise). The Node API serves curriculum terms, a Form 2 Biology lesson script, a KSL demo sign library, Quiet Classroom questions, and file-backed Lecture Memory. The client streams private captions (Web Speech + demo lesson), turns curriculum terms into tappable chips, accepts camera/demo signs, queues questions without interrupting class, lets the teacher answer on a dashboard, and saves a post-lesson Lecture Memory.

**Verification** — `node --test test/*.test.js` PASS (2 tests); smoke GET `/api/health`, `/api/signs`, `/api/terms`, `/api/lesson/script`, `/`, `/css/styles.css`, `/js/app.js` all 200. Reviewer pass on critical learner-queue refresh; re-review confirmed fixes (double markLoop, mock answeredAt, lesson-reset UI refresh completed after re-review).

**Journey log**
- Full stack (Node `http`) + camera/demo sign library chosen over static-only and calibrate-then-recognize for CRIW demo reliability.
- Client includes `mock-api.js` fallback so the UI still demos when opened without `node server/index.js`.
- Teacher → learner queue refresh was the one critical review finding; wired via `onQuestionsChanged`.
- Tests isolate state with `SAUTI_STATE_DIR` temp dirs so demos are not polluted.
- Spec module names (`data-ui.js`, `teacher.js`) collapsed into `state.js` / `queue.js` / `app.js` — behavior unchanged.

## [S1] Problem

Deaf learners in regular Kenyan classrooms cannot fully follow lessons, ask questions without interrupting, or revise like hearing peers. Existing KSL tools translate speech or teach signs but do not connect communication to curriculum learning and quiet classroom participation. The CRIW 2026 MVP must demonstrate the Access Loop end to end: Listen → Understand → Ask → Learn → Revise.

## [S2] Design

### Product shape

Full-stack web app: Node API + browser client.

- **Server** (`server/`): Node built-in `http` (no framework). Serves `client/` statically and a small JSON API. State is file-backed under `server/state/` (override with `SAUTI_STATE_DIR`).
- **Client** (`client/`): single-page classroom workstation. Web Speech API for captions (with scripted demo fallback). Camera + hand landmark overlay (MediaPipe when available) and a **demo sign library** for reliable stage recognition. Offline mock API fallback in `client/js/mock-api.js`.

### Access Loop stages (UI contract)

| Stage | Trigger | UI evidence |
|-------|---------|-------------|
| Listen | Teacher speech / demo lesson | Live caption stream, terms underlined as chips |
| Understand | Term chip tap or recognized curriculum sign | Term drawer: definition, KSL note, simplified, related, examples, revision |
| Ask | Learner submits question | Quiet Classroom Mode queues instead of interrupting |
| Learn | Term drawer + teacher answer | Knowledge panel + answer card (queue refreshes for learner) |
| Revise | End lesson / open Lecture Memory | Session record: transcript, terms, Q&As, revision |

### Quiet Classroom Mode

Default **on**. Learner question submit modes: `now`, `later`, `anonymous`. Teacher dashboard lists pending questions and can mark answered. Learner never needs to interrupt the lesson.

### API

| Method | Path | Body / result |
|--------|------|----------------|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/signs` | Vocabulary: id, gloss, text, category (conversational \| education) |
| GET | `/api/terms` | Curriculum terms (Biology Form 2 focus) |
| GET | `/api/terms/:id` | Full term card |
| GET | `/api/lesson/script` | Demo lesson utterances for Form 2 Photosynthesis |
| GET | `/api/questions` | All queue items |
| POST | `/api/questions` | `{ text, mode: now\|later\|anonymous }` → created item |
| PATCH | `/api/questions/:id` | `{ status: pending\|answered\|deferred, answer? }` |
| GET | `/api/memory` | Saved lecture records |
| POST | `/api/memory` | Persist a session record → saved record with id |
| GET | `/api/memory/:id` | One record |

### Client modules

- `client/js/state.js` — shared state, Access Loop, `linkTerms`, `api()` helper
- `client/js/mock-api.js` — offline/demo API fallback
- `client/js/captions.js` — Web Speech + demo script player
- `client/js/vision.js` — camera start/stop, hand canvas, recognition event bus
- `client/js/queue.js` — Quiet Mode question form + learner queue + teacher answers
- `client/js/memory.js` — term drawer + Lecture Memory save/view
- `client/js/app.js` — shell, role switch, wiring

### Error and empty behavior

- Captions unavailable → banner offers **Play demo lesson** (scripted).
- Camera denied / MediaPipe missing → camera panel error + demo sign library remains fully usable.
- Empty question queue → “No questions yet. Sign or type one — it stays quiet.”
- Empty memory → “End the lesson to save a Lecture Memory.”

### Visual system

```
SUBJECT   Sauti Vision classroom workstation; job: follow + participate without interrupting
COLOR     --ink #0B1F2A   --paper #F2F5F7
          --pulse #FF6B35 (live voice/captions)   --calm #2EC4B6 (recognized / learn)
          --quiet #DDE5EA  --haze #5C6B73  --warn #C23B22
TYPE      display: Georgia, 'Times New Roman', serif — lesson titles only
          body: 'Segoe UI', system-ui — 16/1.55
          data: Consolas, 'Cascadia Code', monospace — times, confidence
LAYOUT    3-zone workstation: top instrument strip (Access Loop),
          center caption stream (hero), right rail (queue + term drawer),
          bottom camera / sign library
SIGNATURE Access Loop ribbon lights Listen→Understand→Ask→Learn→Revise
RISK      caption stream is teleprompter-like (no card grid); terms are inline chips
```

## [S3] Out of Scope

- Trained KSL recognition models or large vocabulary ASR
- Real interpreter replacement or legal compliance certification
- Auth, multi-tenant schools, production deployment
- Healthcare / government surfaces (long-term vision only)
- Native mobile apps

## Tasks

- [x] T1: Scaffold Node server, static client shell, health API — acceptance: `GET /api/health` returns ok and `client/index.html` loads (covers: S2)
- [x] T2: Curriculum data + signs/lesson API — acceptance: signs, terms, lesson script endpoints return JSON (covers: S2)
- [x] T3: Captions + demo lesson player — acceptance: demo script streams into caption UI with term chips (covers: S2)
- [x] T4: Camera vision + demo sign library — acceptance: library emits recognized-sign events; camera overlay when MediaPipe available (covers: S2)
- [x] T5: Quiet Classroom queue + teacher answers — acceptance: question modes queue/answer via API (covers: S2)
- [x] T6: Term drawer + Lecture Memory — acceptance: term tap opens card; end lesson saves memory record (covers: S2)
- [x] T7: Access Loop wiring + empty/error states + verify run — acceptance: full demo path works; server starts; no placeholder residue (covers: S2)
