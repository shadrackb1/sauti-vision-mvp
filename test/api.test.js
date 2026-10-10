const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("../server/index.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

test("health, data APIs, questions, and memory", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sauti-state-"));
  process.env.SAUTI_STATE_DIR = tmp;
  const server = createServer();
  const base = await listen(server);
  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);

    const signs = await fetch(`${base}/api/signs`).then((r) => r.json());
    assert.ok(signs.signs.length >= 20);
    assert.ok(signs.signs.some((s) => s.category === "education"));

    const terms = await fetch(`${base}/api/terms`).then((r) => r.json());
    assert.ok(terms.terms.some((t) => t.id === "photosynthesis"));

    const lesson = await fetch(`${base}/api/lesson/script`).then((r) => r.json());
    assert.ok(lesson.lesson.utterances.length >= 5);

    const created = await fetch(`${base}/api/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "What is the role of chlorophyll?", mode: "later" })
    }).then((r) => r.json());
    assert.equal(created.question.status, "pending");

    const patched = await fetch(`${base}/api/questions/${created.question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "answered", answer: "It traps light energy." })
    }).then((r) => r.json());
    assert.equal(patched.question.status, "answered");
    assert.match(patched.question.answer, /light energy/i);

    const mem = await fetch(`${base}/api/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Form 2 Biology — Photosynthesis",
        transcript: [{ text: "Today we are learning about photosynthesis." }],
        termsTouched: ["photosynthesis"],
        questions: [patched.question],
        summary: "Key terms covered.",
        revisionQuestions: ["What is the role of chlorophyll?"]
      })
    }).then((r) => r.json());
    assert.ok(mem.record.id);
    assert.equal(mem.record.termsTouched[0], "photosynthesis");

    const html = await fetch(`${base}/`).then((r) => r.text());
    assert.match(html, /Sauti Vision/);
  } finally {
    server.close();
    delete process.env.SAUTI_STATE_DIR;
  }
});

test("signs and terms files exist and parse", () => {
  const dataDir = path.join(__dirname, "..", "server", "data");
  for (const name of ["signs.json", "terms.json", "lesson.json"]) {
    const raw = fs.readFileSync(path.join(dataDir, name), "utf8");
    JSON.parse(raw);
  }
});
