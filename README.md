# Sauti Vision MVP

AI-powered inclusive learning and accessibility assistant for the Kenyan school environment. This MVP demonstrates the **Access Loop**: Listen → Understand → Ask → Learn → Revise.

## Quick start

```bash
node server/index.js
```

Open `http://localhost:5177`.

```bash
node --test test/*.test.js
```

## Demo path (Form 2 Biology — Photosynthesis)

1. Click **Play demo lesson** — private live captions stream teacher speech; curriculum terms are tappable chips.
2. Tap **Photosynthesis** in a caption — term drawer opens (definition, simplified, KSL note, examples, revision).
3. Click signs in the **demo sign library** (e.g. `PHOTOSYNTHESIS`, `QUESTION`) — recognized output appears; `QUESTION` queues a quiet question.
4. Switch to **Teacher** — answer queued questions without the learner interrupting.
5. Click **Save Lecture Memory** or **End lesson** — transcript, terms, Q&As, and revision questions persist.

Quiet Classroom Mode is on by default. Camera + hand overlay is optional (MediaPipe when network is available); the demo sign library is the reliable stage path.

## Layout

- `server/` — Node HTTP API + file-backed demo state
- `client/` — classroom workstation UI
- `docs/compose/spec/mvp.md` — feature spec
