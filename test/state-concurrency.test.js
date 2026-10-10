/**
 * Concurrency invariant: the question queue and memory store must never lose
 * an update when teacher and learner hit the API at the same moment (the
 * exact situation a classroom pilot creates). Today all state file reads and
 * writes are synchronous after a single body-read await, so mutations are
 * atomic per event-loop turn — this test PINS that invariant so a future
 * refactor to async fs (or a framework) cannot silently regress it.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("../server/index.js");

function startServer() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sauti-conc-"));
  process.env.SAUTI_STATE_DIR = tmp;
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}`, tmp });
    });
  });
}

function stop({ server }) {
  return new Promise((resolve) => {
    server.close(() => {
      delete process.env.SAUTI_STATE_DIR;
      resolve();
    });
  });
}

async function post(base, pathname, payload) {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { status: res.status, body: await res.json() };
}

test("12 parallel question POSTs all persist — no lost updates", async () => {
  const ctx = await startServer();
  try {
    const N = 12;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        post(ctx.base, "/api/questions", { text: `Question ${i} about chlorophyll`, mode: "later" })
      )
    );
    assert.ok(results.every((r) => r.status === 201), `some POSTs failed: ${results.map((r) => r.status).join(",")}`);

    const res = await fetch(`${ctx.base}/api/questions`);
    const { questions } = await res.json();
    assert.equal(questions.length, N, `expected ${N} persisted questions, found ${questions.length}`);

    const texts = new Set(questions.map((q) => q.text));
    for (let i = 0; i < N; i++) {
      assert.ok(texts.has(`Question ${i} about chlorophyll`), `missing: Question ${i}`);
    }
  } finally {
    await stop(ctx);
  }
});

test("parallel question POSTs + answer PATCHes interleave without corruption", async () => {
  const ctx = await startServer();
  try {
    const created = await post(ctx.base, "/api/questions", { text: "Will this be examined?", mode: "now" });
    const target = created.body.question.id;

    const work = [];
    for (let i = 0; i < 6; i++) {
      work.push(post(ctx.base, "/api/questions", { text: `Parallel ${i}`, mode: "later" }));
    }
    const patch = fetch(`${ctx.base}/api/questions/${target}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "answered", answer: "Yes — core Form 2 topic." })
    }).then((r) => r.json());
    work.push(patch);

    await Promise.all(work);

    const res = await fetch(`${ctx.base}/api/questions`);
    const { questions } = await res.json();
    assert.equal(questions.length, 7, `expected 7 persisted questions, found ${questions.length}`);
    const answered = questions.find((q) => q.id === target);
    assert.equal(answered.status, "answered");
    assert.equal(answered.answer, "Yes — core Form 2 topic.");
  } finally {
    await stop(ctx);
  }
});

test("parallel memory POSTs all persist", async () => {
  const ctx = await startServer();
  try {
    const N = 8;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        post(ctx.base, "/api/memory", { title: `Lesson ${i}`, transcript: [{ text: `line ${i}` }] })
      )
    );
    assert.ok(results.every((r) => r.status === 201));

    const res = await fetch(`${ctx.base}/api/memory`);
    const { memory } = await res.json();
    assert.equal(memory.length, N, `expected ${N} records, found ${memory.length}`);
  } finally {
    await stop(ctx);
  }
});
