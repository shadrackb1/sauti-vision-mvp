"use strict";

/**
 * Domain layer for Sauti Vision (clean-architecture Phase 5).
 *
 * Business rules for the Quiet Classroom question queue and Lecture Memory,
 * with NO knowledge of HTTP, URLs, or where data lives. The HTTP layer
 * (index.js) translates requests into calls here and responses back out.
 * Persistence is injected: any object implementing the tiny store interface
 * (load() -> {questions, memory} / save(state)) works — the file-backed
 * store in index.js is one adapter.
 *
 * Every rule here is pinned by test/api-characterization.test.js and
 * test/state-concurrency.test.js. Quirks preserved deliberately:
 *  - unknown mode defaults to "later"
 *  - answer-only PATCH on a pending question keeps it pending
 *  - answeredAt refreshes when an answered question is PATCHed with an answer
 */

const QUESTION_MODES = ["now", "later", "anonymous"];
const QUESTION_STATUSES = ["pending", "answered", "deferred"];

function uid(prefix, now = Date.now()) {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

function createDomain({ store, clock = () => new Date().toISOString() } = {}) {
  if (!store || typeof store.load !== "function" || typeof store.save !== "function") {
    throw new Error("createDomain: a store with load()/save() is required");
  }

  async function withState(mutator) {
    const state = await store.load();
    const result = mutator(state);
    await store.save(state);
    return result;
  }

  function listQuestions() {
    return withState((s) => s.questions);
  }

  async function createQuestion({ text, mode }) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) throw new ValidationError("text is required");
    const question = {
      id: uid("q"),
      text: trimmed,
      mode: QUESTION_MODES.includes(mode) ? mode : "later",
      status: "pending",
      answer: null,
      createdAt: clock(),
      answeredAt: null
    };
    await withState((s) => {
      s.questions.push(question);
    });
    return question;
  }

  async function answerQuestion(id, { status, answer } = {}) {
    return withState((s) => {
      const question = s.questions.find((q) => q.id === id);
      if (!question) throw new NotFoundError("Question not found");
      if (status && QUESTION_STATUSES.includes(status)) {
        question.status = status;
        if (status !== "answered") question.answeredAt = null;
      }
      if (typeof answer === "string") {
        question.answer = answer.trim() || null;
      }
      if (question.status === "answered") question.answeredAt = clock();
      return question;
    });
  }

  function listMemory() {
    return withState((s) => s.memory);
  }

  async function saveMemoryRecord(payload = {}) {
    const record = {
      id: uid("mem"),
      title: String(payload.title || "Untitled lesson").trim(),
      subject: payload.subject || "Biology",
      form: payload.form || "Form 2",
      savedAt: clock(),
      transcript: Array.isArray(payload.transcript) ? payload.transcript : [],
      termsTouched: Array.isArray(payload.termsTouched) ? payload.termsTouched : [],
      questions: Array.isArray(payload.questions) ? payload.questions : [],
      summary: String(payload.summary || "").trim(),
      revisionQuestions: Array.isArray(payload.revisionQuestions) ? payload.revisionQuestions : []
    };
    await withState((s) => {
      s.memory.push(record);
    });
    return record;
  }

  async function getMemoryRecord(id) {
    const state = await store.load();
    const record = state.memory.find((m) => m.id === id);
    if (!record) throw new NotFoundError("Memory not found");
    return record;
  }

  return {
    listQuestions,
    createQuestion,
    answerQuestion,
    listMemory,
    saveMemoryRecord,
    getMemoryRecord
  };
}

module.exports = {
  createDomain,
  ValidationError,
  NotFoundError,
  QUESTION_MODES,
  QUESTION_STATUSES
};
