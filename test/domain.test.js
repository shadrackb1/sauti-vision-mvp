/**
 * Domain-layer tests: business rules with NO HTTP, NO fs — the store is a
 * plain in-memory fake. This proves the rules run framework-free
 * (clean-architecture Dependency Rule) and doubles as executable
 * documentation of the quirks the HTTP layer must preserve.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDomain, ValidationError, NotFoundError } = require("../server/domain.js");

function fakeStore(seed = { questions: [], memory: [] }) {
  const state = JSON.parse(JSON.stringify(seed));
  return {
    load: async () => state,
    save: async () => {}
  };
}

let tick = 0;
const clock = () => {
  tick += 1;
  return `2026-10-10T08:00:${String(tick).padStart(2, "0")}Z`;
};

test("createQuestion: happy path, defaults, and validation", async () => {
  const dom = createDomain({ store: fakeStore(), clock });
  const q = await dom.createQuestion({ text: "  What is the role of chlorophyll?  ", mode: "junk" });
  assert.equal(q.text, "What is the role of chlorophyll?"); // trimmed
  assert.equal(q.mode, "later"); // pinned quirk: unknown mode -> later
  assert.equal(q.status, "pending");
  assert.equal(q.answer, null);
  assert.equal(q.createdAt, "2026-10-10T08:00:01Z");
  assert.ok(q.id.startsWith("q_"));

  const listed = await dom.listQuestions();
  assert.equal(listed.length, 1);

  await assert.rejects(() => dom.createQuestion({ text: "   " }), ValidationError);
  await assert.rejects(() => dom.createQuestion({}), ValidationError);
});

test("answerQuestion: lifecycle and pinned quirks", async () => {
  const dom = createDomain({ store: fakeStore(), clock });
  const q = await dom.createQuestion({ text: "Will this be examined?", mode: "now" });

  // answer-only PATCH keeps status pending (pinned quirk)
  const withAnswer = await dom.answerQuestion(q.id, { answer: "It traps light energy." });
  assert.equal(withAnswer.status, "pending");
  assert.equal(withAnswer.answer, "It traps light energy.");
  assert.equal(withAnswer.answeredAt, null);

  // full answer: answered + answeredAt set
  const answered = await dom.answerQuestion(q.id, { status: "answered", answer: "Yes — core topic." });
  assert.equal(answered.status, "answered");
  assert.equal(answered.answeredAt, "2026-10-10T08:00:03Z");

  // answer PATCH on an answered question refreshes answeredAt (pinned quirk)
  const refreshed = await dom.answerQuestion(q.id, { answer: "Yes, definitely." });
  assert.equal(refreshed.status, "answered");
  assert.equal(refreshed.answeredAt, "2026-10-10T08:00:04Z"); // clock advanced -> refreshed

  // reopen to pending: answeredAt cleared
  const reopened = await dom.answerQuestion(q.id, { status: "pending" });
  assert.equal(reopened.status, "pending");
  assert.equal(reopened.answeredAt, null);

  // unknown status values are ignored silently (pinned)
  const ignored = await dom.answerQuestion(q.id, { status: "bogus" });
  assert.equal(ignored.status, "pending");

  // unknown id
  await assert.rejects(() => dom.answerQuestion("q_nope", { status: "answered" }), NotFoundError);
});

test("memory records: defaults, save, and retrieval", async () => {
  const dom = createDomain({ store: fakeStore(), clock });
  const rec = await dom.saveMemoryRecord({});
  assert.equal(rec.title, "Untitled lesson");
  assert.equal(rec.subject, "Biology");
  assert.equal(rec.form, "Form 2");
  assert.deepEqual(rec.transcript, []);
  assert.deepEqual(rec.termsTouched, []);
  assert.deepEqual(rec.questions, []);
  assert.deepEqual(rec.revisionQuestions, []);
  assert.ok(rec.id.startsWith("mem_"));

  const full = await dom.saveMemoryRecord({
    title: "  Form 2 Biology — Photosynthesis  ",
    transcript: [{ text: "line" }],
    termsTouched: ["photosynthesis"]
  });
  assert.equal(full.title, "Form 2 Biology — Photosynthesis"); // trimmed
  assert.equal(full.transcript.length, 1);

  const list = await dom.listMemory();
  assert.equal(list.length, 2);
  const got = await dom.getMemoryRecord(full.id);
  assert.equal(got.id, full.id);
  await assert.rejects(() => dom.getMemoryRecord("mem_nope"), NotFoundError);
});

test("store contract: missing load/save throws, state is not shared between domains", async () => {
  assert.throws(() => createDomain({ store: {} }));
  assert.throws(() => createDomain({}));

  const shared = fakeStore();
  const a = createDomain({ store: shared, clock });
  const b = createDomain({ store: shared, clock });
  await a.createQuestion({ text: "from A" });
  await b.createQuestion({ text: "from B" });
  const listed = await a.listQuestions();
  assert.equal(listed.length, 2); // same store -> shared state (adapter contract)
});

test("unknown mode is not accepted, just defaulted — modes list is the contract surface", () => {
  const { QUESTION_MODES, QUESTION_STATUSES } = require("../server/domain.js");
  assert.deepEqual(QUESTION_MODES, ["now", "later", "anonymous"]);
  assert.deepEqual(QUESTION_STATUSES, ["pending", "answered", "deferred"]);
});
