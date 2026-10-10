import { state, markLoop, api, toast, escapeHtml, formatTime, resetLoop } from "./state.js";

export function initMemory({ captions, onLessonReset }) {
  const btnSave = document.getElementById("btnMemory");
  const btnShow = document.getElementById("btnShowMemory");
  const status = document.getElementById("memoryStatus");
  const dialog = document.getElementById("memoryDialog");
  const body = document.getElementById("memoryBody");
  const btnEnd = document.getElementById("btnEndLesson");

  let lastRecord = null;

  function buildPayload() {
    const termsTouched = [...new Set(state.termsTouched)];
    const revision = [];
    for (const id of termsTouched) {
      const term = state.terms.get(id);
      if (term) revision.push(...(term.revisionQuestions || []));
    }
    const summaryBits = [];
    if (termsTouched.length) {
      summaryBits.push(`Key terms: ${termsTouched.map((id) => state.terms.get(id)?.title || id).join(", ")}.`);
    }
    const answered = state.questions.filter((q) => q.status === "answered");
    if (answered.length) summaryBits.push(`${answered.length} question(s) answered during the lesson.`);
    if (state.transcript.length) summaryBits.push(`${state.transcript.length} caption line(s) captured.`);

    return {
      title: state.lesson?.title || "Untitled lesson",
      subject: state.lesson?.subject || "Biology",
      form: state.lesson?.form || "Form 2",
      transcript: state.transcript.slice(),
      termsTouched,
      questions: state.questions.slice(),
      summary: summaryBits.join(" "),
      revisionQuestions: [...new Set(revision)]
    };
  }

  function renderRecord(record) {
    body.innerHTML = `
      <section>
        <h3>${escapeHtml(record.title)}</h3>
        <p class="meta">${escapeHtml(record.subject)} · ${escapeHtml(record.form)} · saved ${formatTime(record.savedAt)}</p>
        <p>${escapeHtml(record.summary)}</p>
      </section>
      <section>
        <h3>Transcript</h3>
        <ol>${(record.transcript || [])
          .map((t) => `<li>${escapeHtml(t.text)}</li>`)
          .join("") || "<li>No captions captured.</li>"}</ol>
      </section>
      <section>
        <h3>Key terms</h3>
        <ul>${(record.termsTouched || [])
          .map((id) => {
            const t = state.terms.get(id);
            return `<li><strong>${escapeHtml(t?.title || id)}</strong> — ${escapeHtml(t?.definition || "")}</li>`;
          })
          .join("") || "<li>No terms opened.</li>"}</ul>
      </section>
      <section>
        <h3>Questions & answers</h3>
        <ul>${(record.questions || [])
          .map(
            (q) =>
              `<li><strong>${escapeHtml(q.mode)}</strong>: ${escapeHtml(q.text)}${
                q.answer ? ` — ${escapeHtml(q.answer)}` : " — (pending)"
              }</li>`
          )
          .join("") || "<li>No questions queued.</li>"}</ul>
      </section>
      <section>
        <h3>Revision questions</h3>
        <ol>${(record.revisionQuestions || []).map((q) => `<li>${escapeHtml(q)}</li>`).join("") || "<li>Open terms to generate revision questions.</li>"}</ol>
      </section>
    `;
  }

  async function save() {
    try {
      const payload = buildPayload();
      const { record } = await api("/api/memory", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      lastRecord = record;
      status.textContent = `Saved ${record.id} · ${record.termsTouched.length} terms · ${record.questions.length} questions`;
      markLoop("revise");
      toast("Lecture Memory saved");
      renderRecord(record);
      dialog.showModal();
      return record;
    } catch (err) {
      toast(err.message);
      return null;
    }
  }

  async function showLast() {
    if (lastRecord) {
      renderRecord(lastRecord);
      dialog.showModal();
      return;
    }
    const { memory } = await api("/api/memory");
    if (!memory.length) {
      status.textContent = "No Lecture Memory yet.";
      toast("End the lesson to save a Lecture Memory.");
      return;
    }
    lastRecord = memory[memory.length - 1];
    renderRecord(lastRecord);
    dialog.showModal();
  }

  btnSave.addEventListener("click", save);
  btnShow.addEventListener("click", showLast);
  btnEnd.addEventListener("click", async () => {
    captions.stopDemo();
    captions.stopMic();
    await save();
    state.transcript = [];
    state.termsTouched = [];
    state.questions = [];
    onLessonReset?.();
    resetLoop();
    toast("Lesson ended and memory saved");
    status.textContent = "Lesson ended. Memory saved. Start again when ready.";
  });

  return { save, showLast, buildPayload };
}

export function initTermDrawer() {
  const empty = document.getElementById("termEmpty");
  const card = document.getElementById("termCard");

  function openTerm(termId) {
    const term = state.terms.get(termId);
    if (!term) {
      empty.hidden = false;
      card.hidden = true;
      empty.textContent = "Term not found in this lesson library.";
      return;
    }
    if (!state.termsTouched.includes(term.id)) state.termsTouched.push(term.id);
    empty.hidden = true;
    card.hidden = false;
    card.innerHTML = `
      <span class="badge">${escapeHtml(term.subject)} · ${escapeHtml(term.form)}</span>
      <h3>${escapeHtml(term.title)}</h3>
      <dl>
        <dt>Definition</dt>
        <dd>${escapeHtml(term.definition)}</dd>
        <dt>Simplified</dt>
        <dd>${escapeHtml(term.simplified)}</dd>
        <dt>KSL</dt>
        <dd>${escapeHtml(term.kslNote)}</dd>
        <dt>Examples</dt>
        <dd><ul>${(term.examples || []).map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></dd>
        <dt>Related</dt>
        <dd>${(term.related || []).map((r) => escapeHtml(r)).join(", ")}</dd>
        <dt>Revision</dt>
        <dd><ul>${(term.revisionQuestions || []).map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></dd>
      </dl>
      <div class="term-actions">
        <button type="button" class="btn" data-related="${escapeHtml(term.related?.[0] || "")}">Open related</button>
      </div>
    `;
    card.querySelector("[data-related]")?.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.related;
      if (id) openTerm(id);
    });
  }

  return { openTerm };
}
