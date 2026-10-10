/** Shared state and tiny helpers for the classroom shell. */

export const state = {
  role: "learner",
  quietMode: true,
  signs: [],
  terms: new Map(),
  lesson: null,
  transcript: [],
  termsTouched: [],
  questions: [],
  loop: {
    listen: false,
    understand: false,
    ask: false,
    learn: false,
    revise: false
  }
};

export const loopOrder = ["listen", "understand", "ask", "learn", "revise"];

export function markLoop(stage) {
  if (!(stage in state.loop)) return;
  state.loop[stage] = true;
  renderLoop();
}

export function resetLoop() {
  for (const k of loopOrder) state.loop[k] = false;
  renderLoop();
}

export function renderLoop() {
  const nodes = document.querySelectorAll(".loop-step");
  let activeSet = false;
  nodes.forEach((node) => {
    const stage = node.dataset.stage;
    node.classList.toggle("is-done", !!state.loop[stage]);
    const isActive = !state.loop[stage] && !activeSet;
    if (isActive && Object.values(state.loop).some(Boolean)) {
      node.classList.add("is-active");
      activeSet = true;
    } else {
      node.classList.remove("is-active");
    }
  });
}

export async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

/** Split caption text and wrap known curriculum terms as chips. */
export function linkTerms(text) {
  const escaped = escapeHtml(text);
  // Longest titles first so "Photosynthesis" wins over a shorter overlapping
  // title, and one combined regex pass avoids O(n_terms) rewrites per call.
  const titles = [...state.terms.values()]
    .map((t) => t.title)
    .sort((a, b) => b.length - a.length);
  if (!titles.length) return escaped;
  const pattern = titles
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`\\b(${pattern})\\b`, "gi");
  return escaped.replace(re, (match) => {
    const term = [...state.terms.values()].find((t) =>
      t.title.toLowerCase() === match.toLowerCase()
    );
    if (!term) return match;
    return `<button type="button" class="term-chip" data-term="${escapeHtml(term.id)}">${match}</button>`;
  });
}
