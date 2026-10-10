import { state, markLoop, toast, escapeHtml } from "./state.js";

export function initVision({ onSign }) {
  const btnCamera = document.getElementById("btnCamera");
  const video = document.getElementById("video");
  const overlay = document.getElementById("overlay");
  const hint = document.getElementById("cameraHint");
  const status = document.getElementById("visionStatus");
  const recognized = document.getElementById("recognized");
  const vocabGrid = document.getElementById("vocabGrid");
  const filters = document.querySelectorAll(".chip-filter");

  let stream = null;
  let mediaPipe = null;
  let filter = "all";
  let lastHitAt = 0;

  function renderVocab() {
    vocabGrid.innerHTML = "";
    const signs = state.signs.filter((s) => filter === "all" || s.category === filter);
    for (const sign of signs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vocab-btn";
      btn.dataset.sign = sign.id;
      btn.setAttribute("role", "listitem");
      btn.innerHTML = `<span class="gloss">${escapeHtml(sign.gloss)}</span><span class="text">${escapeHtml(sign.text)}</span>`;
      btn.addEventListener("click", () => fireSign(sign.id, "demo-library"));
      vocabGrid.appendChild(btn);
    }
    if (!signs.length) {
      vocabGrid.innerHTML = `<p class="empty-note">No signs in this filter.</p>`;
    }
  }

  function fireSign(signId, source = "demo") {
    const sign = state.signs.find((s) => s.id === signId);
    if (!sign) return;

    recognized.innerHTML = `
      <p class="recognized-label">Recognized</p>
      <p class="gloss">${escapeHtml(sign.gloss)}</p>
      <p class="text-out">${escapeHtml(sign.text)}</p>
      <p class="conf">${escapeHtml(source)} · ${new Date().toLocaleTimeString()}</p>
    `;
    status.textContent = `Matched ${sign.gloss}`;
    markLoop("understand");

    vocabGrid.querySelectorAll(".vocab-btn").forEach((b) => {
      b.classList.toggle("is-hit", b.dataset.sign === signId);
    });
    lastHitAt = Date.now();
    onSign?.(sign);
  }

  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      filters.forEach((b) => b.classList.toggle("is-active", b === btn));
      renderVocab();
    });
  });

  function clearOverlay() {
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function drawHands(hands) {
    const ctx = overlay.getContext("2d");
    clearOverlay();
    const w = overlay.width;
    const h = overlay.height;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2EC4B6";
    ctx.fillStyle = "#FF6B35";
    for (const hand of hands) {
      for (const lm of hand) {
        const x = (1 - lm.x) * w;
        const y = lm.y * h;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (hands.length) {
      status.textContent = `Hand tracked · use library to confirm sign`;
    }
  }

  async function loadMediaPipe() {
    // Optional enhancement; demo library works without it.
    try {
      const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14").catch(() => null);
      if (!vision) {
        hint.textContent = "Hand overlay unavailable offline — demo library still works.";
        return null;
      }
      const { FilesetResolver, HandLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      const landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
      return landmarker;
    } catch {
      hint.textContent = "Hand overlay unavailable — demo library still works.";
      return null;
    }
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 400, facingMode: "user" },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      hint.textContent = "Hand tracking active when available. Tap a sign to confirm meaning.";
      btnCamera.textContent = "Stop camera";
      status.textContent = "Camera on";
      mediaPipe = await loadMediaPipe();
      if (mediaPipe) requestAnimationFrame(tick);
    } catch (err) {
      hint.textContent = "Camera permission denied. Use the demo sign library below.";
      status.textContent = "Camera unavailable";
      toast("Camera unavailable — demo library ready");
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    clearOverlay();
    btnCamera.textContent = "Start camera";
    status.textContent = "Camera off";
    hint.textContent = "Camera off — use the sign library for reliable demos.";
    mediaPipe = null;
  }

  function tick() {
    if (!mediaPipe || !stream) return;
    if (video.readyState >= 2) {
      const result = mediaPipe.detectForVideo(video, performance.now());
      const hands = result?.landmarks || [];
      drawHands(hands);
    }
    requestAnimationFrame(tick);
  }

  btnCamera.addEventListener("click", () => {
    if (stream) stopCamera();
    else startCamera();
  });

  renderVocab();

  return {
    fireSign,
    renderVocab,
    stopCamera
  };
}
