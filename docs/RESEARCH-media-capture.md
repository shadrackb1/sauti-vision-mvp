# RESEARCH: Browser media-capture stack (MediaPipe HandLandmarker + Web Speech API)

**Project:** Sauti Vision MVP — client rebuild (vanilla-JS ES modules, no build step, plain Node `http` server)
**Spike date:** 2026-10-10 · **Method:** throwaway spike per the `spike` skill — verify every URL with a real HTTP request (`curl -sIL`), cross-check API usage against official MediaPipe Tasks docs and MDN, then write integration notes. Evidence over assumption.

**Spike table (Given/When/Then):**

| #  | Spike | Validates | Result |
|----|-------|-----------|--------|
| 001 | MediaPipe Tasks Vision HandLandmarker via CDN ESM | Given a no-build page served from a local Node server, when it imports `vision_bundle.mjs` from a CDN and calls `HandLandmarker.createFromOptions` + `detectForVideo`, then hand landmarks are returned in `<50ms/frame` on a 1GB-VRAM machine | **PARTIAL** — all URLs/API facts verified via HTTP + official docs; in-browser run blocked by tooling (see §7) |
| 002 | Web Speech API live captions | Given teacher speech, when `SpeechRecognition` runs with `continuous + interimResults` and auto-restart on `end`, then captions stream live on supported Windows browsers | **VALIDATED (docs-level)** — Chrome-only in practice on Windows; fallback mandatory |
| 003 | getUserMedia webcam constraints | Given a laptop webcam, when `{video:{width:{ideal:640}…}}` is requested on a localhost page, then a stream starts without `OverconstrainedError` | **VALIDATED (docs-level)** — constraint grammar verified against MDN |

---

## 1. Verified URLs (real `curl -sIL` responses, checked 2026-10-10)

`@mediapipe/tasks-vision` **latest npm version: 1.1.0** (from `https://registry.npmjs.org/@mediapipe/tasks-vision/latest`).

| URL | HTTP | Content-Type | Size | CORS `access-control-allow-origin` |
|---|---|---|---|---|
| `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs` | **200** | `application/javascript` | — | `*` ✓ |
| `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm/vision_wasm_internal.js` | **200** | `application/javascript` | — | `*` ✓ |
| `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm/vision_wasm_internal.wasm` | **200** | `application/wasm` | — | `*` ✓ |
| `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm/vision_wasm_nosimd_internal.wasm` | **200** | `application/wasm` | — | `*` ✓ |
| `https://unpkg.com/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs` (fallback CDN) | **200** | `text/javascript` | — | `*` ✓ |
| `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` (model) | **200** | `application/octet-stream` | **7,819,105 bytes ≈ 7.5 MB** | `*` ✓ |
| `https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js` (legacy Solutions API — **do not use**) | 200 | `application/javascript` | — | served, but package frozen/deprecated |

Also verified **404s** (do not use these in the report or code — they look plausible but are dead):
- `https://storage.googleapis.com/mediapipe-assets/hand_landmarker_image.jpg` → **404**
- `https://storage.googleapis.com/mediapipe-assets/hand_landmarker.webp` → **404**
- `https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/tasks/testdata/vision/hand_landmark.jpg` → **404** (test image no longer at this path on `master`; several hand-sample image URLs in old tutorials are dead)

**Consequences:**
- Pin an exact version (`@1.1.0`) — never `@latest` in an import URL (a bad release would break the client with no build step to pin it).
- jsdelivr and unpkg both work and both send `access-control-allow-origin: *`, so a cross-origin ES-module `import` from our `http://localhost` page is fine; the same is true for the model URL, so the browser can `fetch()` the `.task` bundle directly.
- The wasm base path argument to `FilesetResolver.forVisionTasks()` is **`…/@mediapipe/tasks-vision@1.1.0/wasm`** (directory, no trailing slash needed) — the resolver picks `vision_wasm_internal.*` (SIMD) or `vision_wasm_nosimd_internal.*` (old CPUs — the Sauti machine qualifies) automatically.
- The model is **7.5 MB** — expect a multi-second first-load on classroom connections; cache it (CDN sends long-lived cache headers) and show a loading state.

## 2. HandLandmarker — paste-ready integration sketch (vanilla ES module, no bundler)

Follows the official MediaPipe Tasks Vision Web JS guide (developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js): `FilesetResolver.forVisionTasks(wasmBase)` → `HandLandmarker.createFromOptions(fileset, …)` → `detectForVideo(video, timestamp)` in a `requestAnimationFrame` loop with a `lastVideoTime` guard.

```js
// client/js/hand-tracking.js — vanilla ES module, imported from a <script type="module">
// Served from http://localhost — a secure context, so getUserMedia works.
import {
  FilesetResolver,
  HandLandmarker,
  DrawingUtils,
  HandLandmarkerConnections, // v1.1.0 exports this (old @mediapipe/hands did not)
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export async function createHandTracker(videoEl, canvasEl) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const handLandmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "CPU",        // see §4: CPU is the safe default on the GTX 650
    },
    runningMode: "VIDEO",      // required for detectForVideo
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  // --- webcam ---
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false, // SpeechRecognition opens its own mic channel; avoid double-request
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  // --- overlay ---
  const ctx = canvasEl.getContext("2d");           // overlay canvas: 2d is fine — never pass
  const draw = new DrawingUtils(ctx);              // THIS canvas to MediaPipe (GPU ctx clash)
  let lastVideoTime = -1;                          // skip duplicate frames
  let lastTs = -1;                                 // detectForVideo timestamps MUST increase

  function loop() {
    if (videoEl.currentTime !== lastVideoTime && videoEl.readyState >= 2) {
      const ts = performance.now();                // monotonically increasing clock
      if (ts > lastTs) {                            // paranoia guard: equal ts throws
        const result = handLandmarker.detectForVideo(videoEl, ts);
        lastTs = ts;
        lastVideoTime = videoEl.currentTime;
        if (canvasEl.width !== videoEl.videoWidth) { // match only when metadata is real
          canvasEl.width = videoEl.videoWidth;
          canvasEl.height = videoEl.videoHeight;
        }
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        for (const lm of result.landmarks ?? []) {
          draw.drawConnectors(lm, HandLandmarkerConnections, { color: "#00FF00", lineWidth: 3 });
          draw.drawLandmarks(lm, { color: "#FF0000", lineWidth: 1 });
        }
        // → demo gesture hook: classify(lm, result.handedness) goes here (KSL demo signs)
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return handLandmarker; // caller keeps a ref for handLandmarker.close() on teardown
}
```

Result shape per official docs: `{ landmarks: [ [ {x,y,z(,visibility)} × 21 ] ], worldLandmarks: [ … metric, hand-center-relative ], handedness: [ [ { categoryName: 'Left'|'Right', score } ] ], handednesses (alias) }`. Normalized `landmarks` are what we draw; `worldLandmarks` (real-metric 3D, meters — unavailable in legacy `@mediapipe/hands`) can later make KSL gesture checks depth-invariant.

## 3. Web Speech API — paste-ready captioning sketch

`SpeechRecognition`/`webkitSpeechRecognition`, `continuous` + `interimResults`, and the auto-restart-on-`end` pattern are verified against MDN (`/Web/API/SpeechRecognition`, `/Web/API/Web_Speech_API/Using_the_Web_Speech_API`).

```js
// client/js/captions.js
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const captionsSupported = typeof SpeechRecognition === "function";

export function startCaptions(onCaption /* (finalText, interimText) => void */) {
  if (!captionsSupported) return null;                 // caller falls back to scripted captions (§6)

  let recognition, running = true;
  const restart = () => {                              // Chrome ends the session on silence,
    if (running) try { recognition.start();            // 'no-speech', and ~network hiccups —
    catch {} /* already started */ };                  // restart keeps captions continuous.

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US"; // TODO: "sw-KE" if the Chrome service supports it — verify at runtime

  recognition.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
    }
    if (final || interim) onCaption(final, interim);
  };
  recognition.onend = restart;                        // fires after every stop — incl. silence
  recognition.onerror = (e) => {
    // 'no-speech' (silence) + 'aborted' → restart via onend. Fatal ones stop the loop:
    if (["not-allowed", "service-not-allowed", "audio-capture",
         "language-not-supported", "network"].includes(e.error)) {
      running = false;                                 // → caller should flip to fallback mode
    }
  };
  recognition.start();                                 // triggers the mic-permission prompt on first use
  return { stop() { running = false; recognition.stop(); } };
}
```

**Verified behavior facts:**
- **Network:** MDN (SpeechRecognition page): on Chrome, recognition uses a *server-based engine* — audio is sent to a web service, so **it will not work offline**; a dropped connection surfaces as an `error` of type `"network"`. New: Chrome 139+ ships **on-device recognition** (`SpeechRecognition.available()`/`.install()` statics, `processLocally = true`, one-time language-pack download; then offline works) — Chrome-team verified via the Chrome 139 release note + Chromium source; still recent/experimental, treat as enhancement only.
- **Silence:** after some seconds of silence Chrome fires `"no-speech"` then `end`; auto-restart handles it. The session also ends on its own periodically — that's why restart-on-`end` is mandatory, not optional.
- **Mic permission:** first `start()` triggers the browser's "use your microphone" prompt exactly like `getUserMedia`; denial arrives as `"not-allowed"`. Requires a secure context — `http://localhost` / `http://127.0.0.1` count as secure; `file://` does **not** (`navigator.mediaDevices` is `undefined` there). Start from a user gesture (button), never on page load.
- **Windows browser support (verified via caniuse + MDN + Microsoft Q&A):** Chrome ✅ (constructor since 33; on-device since 139). **Edge: the interface exists (Chromium base) but recognition reliably fails** with `language-not-supported` / `network` — widely reported on Microsoft Q&A (2023–2025); treat Edge as unsupported. Firefox: disabled by default, no recognition service — unsupported. Safari 14.1+ ✅ (macOS/iOS, not our Windows target). **Practical matrix: Chrome-only on Windows.**

## 4. GPU vs CPU delegate on the target machine (1 GB-VRAM GTX 650)

- The GPU delegate runs inference in **WebGL2** (Emscripten-initialized context). On old/limited GPUs, init fails with the documented error: `StartGraph failed … "kGpuService" … emscripten_webgl_create_context() returned error 0` (mediapipe issue #4327) — the classic failure on machines like the Kepler-era GTX 650.
- A canvas passed to MediaPipe must be **uninitialized or WebGL2**; a canvas that already has a `2d` context makes GPU init return `null` and blow up (same issue thread). Our overlay needs `2d`, so we don't pass any canvas and we don't force GPU.
- Community-reported: forcing GPU can add ~30 s to model load on some machines vs near-instant CPU (issue #5447); MediaPipe maintainers state the default picks GPU only when available, and even then XNNPACK/CPU lines appear in the console (issue #4711).
- **Decision: `delegate: "CPU"` hard-coded for the MVP** (XNNPACK wasm path — reliable everywhere, and the nosimd wasm variant auto-selected on the old CPU), 640×480 input, `numHands: 2`. GPU delegate = post-MVP experiment behind a toggle with try/catch fallback to CPU.

## 5. getUserMedia constraints for a laptop webcam

- Use `{ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: … }` — `ideal` (a preference) not `exact` (a requirement), so an odd webcam can't cause `OverconstrainedError`; MDN documents `exact` as hard-fail.
- 640×480 halves per-frame pixel work vs 720p — right choice for the GTX 650 + old CPU.
- Error names to handle (MDN): `NotAllowedError` (permission denied), `NotFoundError` (no camera), `NotReadableError` (camera busy), `OverconstrainedError`, and `navigator.mediaDevices === undefined` (insecure context / `file://`).
- Release tracks with `stream.getTracks().forEach(t => t.stop())` when switching to fallback.

## 6. Fallback design (graceful degradation — both features)

```
Speech/captions:
  captionsSupported (feature-detect §3) && mic granted?
    ├─ yes → live Web Speech captions (Chrome: server-based, needs internet)
    └─ no  → SCRIPTED LESSON CAPTIONS: a timed array of lesson lines
             ({ t: 0, text: "Good morning class…" }, …) replayed to the same
             onCaption() sink — identical UI, zero API risk on Edge/Firefox/offline.

Hand tracking:
  getUserMedia ok && model+wasm load ok?
    ├─ yes → live HandLandmarker overlay + classify() hook (demo KSL gestures)
    └─ no  → DEMO SIGN LIBRARY: canned landmark arrays (21-point skeletons) or
             SVG hand illustrations per sign, played as an animated overlay with
             sign names + descriptions — teaches the same lesson content.

Both fallbacks share the real pipeline's interfaces (onCaption(final, interim)
and draw(landmarks)), so the rest of the client never knows which mode is live.
```

## 7. Honest status of the in-browser verification

An end-to-end in-browser spike page was built (ESM import → wasm fileset → model download → `detect()`/`detectForVideo()` → GPU-delegate probe → SpeechRecognition + getUserMedia probes) at `%LOCALAPPDATA%/Temp/sv-spike/` and served from `http://127.0.0.1:8123` (server reachable, HTTP 200 confirmed). **The automated browser driver timed out 3× (~21 min, both local-profile and cloud backends) in this environment, so the in-browser run is UNVERIFIED.** Everything checkable without a live tab was verified: all URLs with real HTTP statuses (§1), CORS on every URL, the exact `createFromOptions`/`detectForVideo` grammar against the official Google guide, and the wasm variant selection. The code sketch is the official documented pattern, not invented.

**Re-run instruction:** `cd "$LOCALAPPDATA/Temp/sv-spike" && node server.js`, open `http://127.0.0.1:8123/` in Chrome, allow camera+mic; the page logs every step to `window.__SPIKE.log`.

## 8. Pitfall list (ranked)

1. **Speech recognition is Chrome-only in practice on Windows** — Edge's `SpeechRecognition` exists but always errors (`language-not-supported`/`network`); Firefox is disabled by default. And even in Chrome it's **server-based → needs internet** (Chrome 139+ on-device is the exception, still new). Feature-detect + scripted-caption fallback is non-negotiable.
2. **GPU delegate on old hardware** — WebGL2 context init fails on the GTX 650-class GPU (`emscripten_webgl_create_context … error 0`), and a canvas with a `2d` context breaks GPU mode entirely. Hard-code `delegate: "CPU"`; never pass the 2d overlay canvas to MediaPipe.
3. **`detectForVideo` timestamps must be strictly increasing** (`performance.now()` + guard) and duplicate video frames must be skipped (`lastVideoTime`) — otherwise it throws; the official samples all carry this guard.
4. **Legacy `@mediapipe/hands` (Solutions API) is frozen/deprecated** — many tutorials use it; use `@mediapipe/tasks-vision` (note: `@mediapipe/vision` doesn't exist — npm 404 trap).
5. **Version pinning + dead URLs** — pin `@1.1.0`; the model is 7.5 MB (show a loading state; CDN cache covers repeat visits); several widely-linked `mediapipe-assets` sample images are 404.
6. **Secure context** — serve from `localhost`/`127.0.0.1` (secure) — opening `index.html` via `file://` kills `getUserMedia` and the mic prompt.

## Verdict: PARTIAL (docs+URL-VERIFIED; live-run pending)

- **What's verified:** every URL + status + CORS (§1); API grammar matches official docs; delegate decision; Web Speech support matrix; constraints grammar; fallback design.
- **What's not:** the 7.5 MB model load + inference inside this environment's browser (tooling timeout, §7).
- **Recommendation for the build:** proceed with the sketches in §2–§3 with CPU delegate, Chrome as the demo browser, and both fallbacks wired from day one; schedule a 15-minute manual in-browser smoke test in Chrome as the first build task.
