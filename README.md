# Sauti Vision MVP

> **AI-powered inclusive learning and accessibility assistant for Kenyan classrooms** — demonstrating the **Access Loop**: **Listen → Understand → Ask → Learn → Revise**.

[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)]()
[![MVP Status](https://img.shields.io/badge/MVP-delivered-success)]()

---

## Overview

**Sauti Vision** bridges the accessibility gap for deaf and hard-of-hearing learners in mainstream Kenyan classrooms. This MVP delivers a complete **classroom workstation** that connects real-time communication (captions + Kenyan Sign Language) to curriculum-aligned learning — without disrupting the lesson.

### The Access Loop

| Stage | What Happens | UI Evidence |
|-------|--------------|-------------|
| **Listen** | Teacher speech streamed as private live captions; curriculum terms highlighted as tappable chips | Caption stream with underlined term chips |
| **Understand** | Tap a term chip → term drawer opens with definition, simplified explanation, KSL note, examples, revision questions | Term drawer (side panel) |
| **Ask** | Learner submits questions via **Quiet Classroom Mode** (queued silently) or recognized `QUESTION` sign | Question queue (learner) / Teacher dashboard |
| **Learn** | Recognized curriculum signs (e.g., `PHOTOSYNTHESIS`) auto-open term drawer; conversational signs surface as toasts | Sign recognition toast + term drawer |
| **Revise** | End lesson → **Lecture Memory** saved: full transcript, terms encountered, Q&A log, revision questions | `memory.json` export |

---

## Quick Start

```bash
# 1. Install Node ≥18
# 2. Start the API server
node server/index.js

# 3. Open the classroom workstation
open http://localhost:5177
```

### Run Tests

```bash
node --test test/*.test.js
```

All tests pass (domain logic, API characterization, state concurrency, data parity, backoff, pose classification).

---

## Demo Path (Form 2 Biology — Photosynthesis)

1. **Play demo lesson** — scripted captions stream; curriculum terms (`photosynthesis`, `chlorophyll`, `leaf`, `sunlight`, `energy`, `plant`) appear as tappable chips
2. **Tap a term chip** — term drawer opens with: definition, simplified explanation, KSL note, related terms, examples, revision questions
3. **Click signs in the demo sign library** — recognized output appears; `QUESTION` sign queues a quiet question
4. **Switch to Teacher view** — answer queued questions without learner interruption
5. **Click "Save Lecture Memory" or "End lesson"** — transcript, terms, Q&As, and revision questions persist to `server/state/memory.json`

> **Quiet Classroom Mode** is on by default. Camera + hand overlay (MediaPipe Hands) is optional and loads when network permits; the **demo sign library** is the reliable stage path for demos.

---

## Architecture

```
sauti-vision-mvp/
├── client/                    # Classroom workstation (single-page)
│   ├── index.html             # App shell + Access Loop nav
│   ├── css/styles.css         # Design system (CSS custom properties)
│   └── js/
│       ├── app.js             # Bootstrap, wiring, role switch
│       ├── state.js           # Reactive state + API client
│       ├── captions.js        # Web Speech API + demo script player
│       ├── vision.js          # MediaPipe Hands + demo sign library
│       ├── queue.js           # Learner question queue (Quiet Mode)
│       ├── memory.js          # Lecture Memory + term drawer
│       ├── mock-api.js        # Offline fallback (works w/o server)
│       ├── backoff.mjs        # Exponential backoff for API calls
│       └── pose.mjs           # Hand landmark → sign classification
├── server/                    # Node HTTP API (zero-framework)
│   ├── index.js               # HTTP adapter (routing, static files, store adapter)
│   ├── domain.js              # Pure business logic (Quiet Classroom queue, Lecture Memory)
│   └── data/                  # Curriculum-aligned seed data
│       ├── terms.json         # 8 Form 2 Biology terms (definitions, KSL notes, revision Qs)
│       ├── signs.json         # 40 KSL glosses (conversational + education categories)
│       └── lesson.json        # Photosynthesis demo script
├── test/                      # Node native test runner
│   ├── api-characterization.test.js
│   ├── api.test.js
│   ├── backoff.test.js
│   ├── client-linkterms.test.js
│   ├── data-parity.test.js
│   ├── domain.test.js
│   ├── pose.test.js
│   └── state-concurrency.test.js
└── docs/compose/spec/mvp.md   # Feature spec + journey log
```

### Clean Architecture Boundary

```
┌─────────────────────────────────────────────────────────────┐
│  HTTP Layer (server/index.js)                               │
│  • Routing, request parsing, status mapping                 │
│  • File-backed store adapter (SAUTI_STATE_DIR)              │
│  • Static file serving (client/)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Domain Layer (server/domain.js)                            │
│  • createQuestion / answerQuestion / listQuestions          │
│  • saveMemoryRecord / listMemory                            │
│  • ValidationError / NotFoundError                          │
│  • Zero HTTP / FS / clock dependencies (injected)           │
└─────────────────────────────────────────────────────────────┘
```

**Why this matters**: Swapping the transport (e.g., Fastify, Express) or the store (e.g., SQLite, PostgreSQL) touches **only** `index.js`. Every business rule is unit-testable in isolation.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (`{ ok: true }`) |
| `GET` | `/api/signs` | Full KSL sign library |
| `GET` | `/api/terms` | Curriculum terms (Form 2 Biology) |
| `GET` | `/api/lesson/script` | Demo lesson script for caption player |
| `GET` | `/api/questions` | All questions (learner + teacher) |
| `POST` | `/api/questions` | Create question (`{ text, mode }`) |
| `PATCH` | `/api/questions/:id` | Answer/defer question (`{ status, answer }`) |
| `GET` | `/api/memory` | Lecture Memory records |
| `POST` | `/api/memory` | Save Lecture Memory (`{ transcript, terms, questions, revisionQuestions }`) |
| `POST` | `/api/lesson/reset` | Clear questions + memory (new lesson) |

### Question Modes
- `now` — ask immediately (interrupts)
- `later` — queue silently (default, Quiet Mode)
- `anonymous` — queue without learner identity

### Question Statuses
- `pending` → `answered` / `deferred`

---

## Data Model

### Term (`server/data/terms.json`)
```json
{
  "id": "photosynthesis",
  "subject": "Biology",
  "form": "Form 2",
  "title": "Photosynthesis",
  "definition": "The process by which green plants make food...",
  "kslNote": "Curriculum KSL representation available — validated with KSL experts in pilot.",
  "simplified": "Plants use sunlight, water, and air to make their own food and release oxygen.",
  "related": ["chlorophyll", "leaf", "sunlight", "energy", "glucose", "oxygen", "plant"],
  "examples": ["A maize leaf turns sunlight into sugar the plant can use."],
  "revisionQuestions": [
    "What is the role of chlorophyll?",
    "Write the word equation for photosynthesis.",
    "Why do plants need both light and water?"
  ]
}
```

### Sign (`server/data/signs.json`)
```json
{
  "id": "photosynthesis",
  "gloss": "PHOTOSYNTHESIS",
  "text": "Photosynthesis",
  "category": "education",
  "termId": "photosynthesis"
}
```
Categories: `conversational` | `education` (curriculum-linked signs carry `termId`)

---

## Client-Side Modules

| Module | Responsibility |
|--------|----------------|
| `state.js` | Reactive store, API client (`api()`), toast, loop progress (`markLoop`/`resetLoop`) |
| `captions.js` | Web Speech API live captions + scripted demo lesson player |
| `vision.js` | MediaPipe Hands loader + demo sign library fallback; emits `{ id, gloss, text, category, termId }` |
| `queue.js` | Learner question UI (Quiet Mode), `addFromSign()`, `renderQuestions()` |
| `memory.js` | Term drawer, Lecture Memory save/end-lesson, lesson reset |
| `mock-api.js` | In-memory API mirror so UI works offline (`file://` or no server) |
| `backoff.mjs` | Exponential backoff + jitter for resilient API calls |
| `pose.mjs` | Hand landmark → sign classification (wrist-index-middle geometry) |

---

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `5177` | HTTP server port |
| `SAUTI_STATE_DIR` | `server/state/` | Directory for `questions.json`, `memory.json` (use temp dir for test isolation) |

---

## Testing

```bash
# Full suite
node --test test/*.test.js

# Single file
node --test test/domain.test.js
```

**Test isolation**: Each test file sets `SAUTI_STATE_DIR` to a unique temp directory — demos never pollute each other.

### Test Coverage
- **Domain logic**: `createQuestion`, `answerQuestion`, validation, status transitions, `answeredAt` refresh quirk
- **API characterization**: Contract tests pinning HTTP behavior (status codes, payload shapes)
- **State concurrency**: Concurrent `PATCH`/`POST` on questions & memory
- **Data parity**: `terms.json` ↔ `signs.json` `termId` linkage verified
- **Backoff**: Retry policy + jitter bounds
- **Pose classification**: Geometry rules for `QUESTION`, `PHOTOSYNTHESIS`, etc.

---

## Deployment

### Docker (production-ready)
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=5177
EXPOSE 5177
CMD ["node", "server/index.js"]
```

```bash
docker build -t sauti-vision-mvp .
docker run -p 5177:5177 -v $(pwd)/server/state:/app/server/state sauti-vision-mvp
```

### Vercel / Netlify (static + serverless)
- `client/` → static hosting
- `server/index.js` → rewrite as serverless functions (or use the mock API fallback)

### Systemd (Linux VM)
```ini
# /etc/systemd/system/sauti-vision.service
[Unit]
Description=Sauti Vision MVP
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/sauti-vision-mvp
Environment=PORT=5177
Environment=SAUTI_STATE_DIR=/var/lib/sauti-vision
ExecStart=/usr/bin/node server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## Roadmap (Post-MVP)

| Area | Next Steps |
|------|------------|
| **Curriculum** | Expand terms/signs to Form 1–4 Biology, Chemistry, Physics, Mathematics |
| **KSL** | Integrate validated KSL video dictionary; replace gloss-only with video snippets |
| **MediaPipe** | On-device hand landmark model (WASM) — remove network dependency |
| **Offline** | Service Worker + IndexedDB for full offline classroom operation |
| **Auth** | Learner/teacher accounts, class rosters, multi-device sync |
| **Analytics** | Teacher dashboard: term engagement, question frequency, revision completion |
| **Localization** | Kiswahili UI, regional curriculum alignment |
| **Hardware** | Raspberry Pi 4 + USB camera kit for low-cost classroom deployment |

---

## Contributing

```bash
# 1. Fork & clone
# 2. Create feature branch
git checkout -b feat/your-feature

# 3. Make changes (follow existing patterns)
# 4. Run tests
node --test test/*.test.js

# 5. Open PR with clear description + screenshots for UI changes
```

### Code Style
- **ES Modules** in `client/js/` (`.mjs` where top-level await needed)
- **CommonJS** in `server/` (Node native, zero deps)
- **No framework** — vanilla JS, native `http`, Web APIs
- **Tests** use Node `--test` runner (no Jest/Vitest)

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- **Kenya Institute of Curriculum Development (KICD)** — curriculum alignment reference
- **Kenyan Sign Language Research Project (KSLRP)** — KSL gloss validation
- **MediaPipe** — hand landmark detection
- **CRIW 2026** — MVP demonstration context

---

## Contact

**Shadrack Biwott** — [@shadrackb1](https://github.com/shadrackb1)  
Project: [github.com/shadrackb1/sauti-vision-mvp](https://github.com/shadrackb1/sauti-vision-mvp)

> *Sauti* (Swahili): **voice, sound, vote** — every learner deserves to be heard.