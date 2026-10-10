import { state, markLoop, api, toast, escapeHtml, formatTime } from "./state.js";

export function initQueue({ onChanged }) {
  const form = document.getElementById("askForm");
  const textEl = document.getElementById("askText");
  const list = document.getElementById("queueList");
  const empty = document.getElementById("queueEmpty");
  const status = document.getElementById("queueStatus");

  async function refresh() {
    const { questions } = await api("/api/questions");
    state.questions = questions;
    render();
    onChanged?.(questions);
  }

  function render() {
    const items = state.questions;
    const pending = items.filter((q) => q.status === "pending").length;
    status.textContent = pending ? `${pending} waiting` : "Queue clear";
    empty.hidden = items.length > 0;
    list.innerHTML = "";
    for (const q of [...items].reverse()) {
      const li = document.createElement("li");
      li.className = "queue-item" + (q.status === "answered" ? " is-answered" : "");
      const modeLabel = q.mode === "anonymous" ? "anonymous" : q.mode;
      li.innerHTML = `
        <div class="q-meta">
          <span>${escapeHtml(modeLabel)}</span>
          <span>${formatTime(q.createdAt)}</span>
        </div>
        <p>${escapeHtml(q.text)}</p>
        ${q.answer ? `<p class="q-answer"><strong>Answer:</strong> ${escapeHtml(q.answer)}</p>` : ""}
      `;
      list.appendChild(li);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    if (!text) return;
    const mode = form.querySelector('input[name="askMode"]:checked')?.value || "later";
    try {
      await api("/api/questions", {
        method: "POST",
        body: JSON.stringify({ text, mode })
      });
      textEl.value = "";
      markLoop("ask");
      toast(state.quietMode ? "Question queued quietly" : "Question submitted");
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  });

  return {
    refresh,
    renderQuestions(qs = state.questions) {
      state.questions = qs;
      render();
    },
    async addFromSign(sign) {
      if (sign.id !== "question") return;
      const text = "I have a question";
      await api("/api/questions", {
        method: "POST",
        body: JSON.stringify({ text, mode: state.quietMode ? "later" : "now" })
      });
      markLoop("ask");
      toast("QUESTION sign → queued");
      await refresh();
    }
  };
}

export function initTeacher({ getQuestions, onQuestionsChanged }) {
  const block = document.getElementById("teacherBlock");
  const list = document.getElementById("teacherList");
  const status = document.getElementById("teacherStatus");

  function render(questions = getQuestions()) {
    if (block.hidden) return;
    const pending = questions.filter((q) => q.status === "pending");
    status.textContent = `${pending.length} pending`;
    list.innerHTML = "";
    if (!questions.length) {
      list.innerHTML = `<li class="empty-note">No questions yet. Learner questions appear here without interrupting the lesson.</li>`;
      return;
    }
    for (const q of [...questions].reverse()) {
      const li = document.createElement("li");
      li.className = "teacher-item";
      li.innerHTML = `
        <div class="q-meta">
          <span>${escapeHtml(q.mode)}</span>
          <span>${escapeHtml(q.status)}</span>
        </div>
        <p>${escapeHtml(q.text)}</p>
        ${q.answer ? `<p><strong>Answer:</strong> ${escapeHtml(q.answer)}</p>` : ""}
        <div class="answer-row">
          <input type="text" placeholder="Type answer for learner" value="${escapeHtml(q.answer || "")}" data-id="${escapeHtml(q.id)}" />
          <button type="button" class="btn btn-primary" data-answer="${escapeHtml(q.id)}">Answer</button>
        </div>
      `;
      list.appendChild(li);
    }

    list.querySelectorAll("[data-answer]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.answer;
        const input = list.querySelector(`input[data-id="${id}"]`);
        const answer = input?.value?.trim();
        if (!answer) {
          toast("Type an answer first");
          return;
        }
        await api(`/api/questions/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "answered", answer })
        });
        toast("Answer saved");
        await refreshTeacher();
        onQuestionsChanged?.(state.questions);
      });
    });
  }

  async function refreshTeacher() {
    const { questions } = await api("/api/questions");
    state.questions = questions;
    render(questions);
  }

  return {
    render,
    refresh: refreshTeacher,
    show() {
      block.hidden = false;
      render();
    },
    hide() {
      block.hidden = true;
    }
  };
}
