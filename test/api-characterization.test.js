/**
 * Characterization tests: pin the CURRENT behavior of the Sauti Vision MVP API
 * before any rebuild changes (working-with-legacy-code Phase 1 safety net).
 * These assert what the code does today — not what a spec says it should do.
 * Quirks are pinned with a BUG note and get fixed as separate, deliberate changes.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("../server/index.js");

const DATA_DIR = path.join(__dirname, "..", "server", "data");

function startServer() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sauti-char-"));
  process.env.SAUTI_STATE_DIR = tmp;
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}`, tmp });
    });
  });
}

function stop({ server, tmp }) {
  return new Promise((resolve) => {
    server.close(() => {
      delete process.env.SAUTI_STATE_DIR;
      resolve();
    });
  });
}

async function json(base, pathName, options) {
  const res = await fetch(`${base}${pathName}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, body };
}

test("health endpoint shape", async () => {
  const ctx = await startServer();
  try {
    const { status, body } = await json(ctx.base, "/api/health");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "sauti-vision-mvp");
    assert.ok(typeof body.time === "string");
  } finally {
    await stop(ctx);
  }
});

test("signs vocabulary: size, shape, and category split", async () => {
  const ctx = await startServer();
  try {
    const { status, body } = await json(ctx.base, "/api/signs");
    assert.equal(status, 200);
    const signs = body.signs;
    assert.ok(Array.isArray(signs) && signs.length >= 40, `expected >=40 signs, got ${signs.length}`);
    for (const s of signs) {
      assert.ok(s.id && s.gloss && s.text, `sign missing core fields: ${JSON.stringify(s)}`);
      assert.ok(["conversational", "education"].includes(s.category), `unexpected category: ${s.category}`);
    }
    const edu = signs.filter((s) => s.category === "education").length;
    const conv = signs.filter((s) => s.category === "conversational").length;
    assert.ok(edu >= 20, `expected >=20 education signs, got ${edu}`);
    assert.ok(conv >= 15, `expected >=15 conversational signs, got ${conv}`);
  } finally {
    await stop(ctx);
  }
});

test("terms library: full card shape for every term", async () => {
  const ctx = await startServer();
  try {
    const { body } = await json(ctx.base, "/api/terms");
    const terms = body.terms;
    assert.ok(terms.length >= 7, `expected >=7 terms, got ${terms.length}`);
    for (const t of terms) {
      for (const field of ["id", "subject", "form", "title", "definition", "kslNote", "simplified", "related", "examples", "revisionQuestions"]) {
        assert.ok(t[field] !== undefined, `term ${t.id} missing field ${field}`);
      }
    }
    const ids = new Set(terms.map((t) => t.id));
    for (const t of terms) {
      for (const r of t.related) {
        assert.ok(ids.has(r), `term ${t.id} references unknown related id: ${r}`);
      }
    }
  } finally {
    await stop(ctx);
  }
});

test("sign.termId values must resolve to real curriculum terms (cross-file integrity)", async () => {
  const signs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "signs.json"), "utf8"));
  const terms = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "terms.json"), "utf8"));
  const ids = new Set(terms.map((t) => t.id));
  for (const s of signs) {
    if (s.termId) {
      assert.ok(ids.has(s.termId), `sign ${s.id} points at missing term ${s.termId}`);
    }
  }
});

test("term lookup: found and 404", async () => {
  const ctx = await startServer();
  try {
    const ok = await json(ctx.base, "/api/terms/photosynthesis");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.term.title, "Photosynthesis");

    const missing = await json(ctx.base, "/api/terms/does-not-exist");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "Term not found");
  } finally {
    await stop(ctx);
  }
});

test("lesson script: utterances and suggested questions", async () => {
  const ctx = await startServer();
  try {
    const { status, body } = await json(ctx.base, "/api/lesson/script");
    assert.equal(status, 200);
    const lesson = body.lesson;
    assert.ok(lesson.utterances.length >= 10);
    assert.ok(lesson.utterances.every((u) => u.speaker === "teacher" && u.text));
    assert.ok(Array.isArray(lesson.suggestedQuestions) && lesson.suggestedQuestions.length >= 3);
  } finally {
    await stop(ctx);
  }
});

test("questions: validation, defaults, and lifecycle", async () => {
  const ctx = await startServer();
  try {
    // Empty body -> 400 with explicit error
    const empty = await json(ctx.base, "/api/questions", { method: "POST", body: JSON.stringify({}) });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, "text is required");

    // Invalid JSON -> 400
    const invalid = await fetch(`${ctx.base}/api/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json"
    });
    assert.equal(invalid.status, 400);

    // Unknown mode silently defaults to "later" (pinned quirk)
    const created = await json(ctx.base, "/api/questions", {
      method: "POST",
      body: JSON.stringify({ text: "What is the role of chlorophyll?", mode: "junk-mode" })
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.question.mode, "later");
    assert.equal(created.body.question.status, "pending");
    assert.equal(created.body.question.answer, null);
    assert.ok(created.body.question.id.startsWith("q_"));

    // Answer-only PATCH on a pending question: stays pending (pinned quirk)
    const id = created.body.question.id;
    const answerOnly = await json(ctx.base, `/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ answer: "It traps light energy." })
    });
    assert.equal(answerOnly.status, 200);
    assert.equal(answerOnly.body.question.status, "pending");
    assert.equal(answerOnly.body.question.answer, "It traps light energy.");
    assert.equal(answerOnly.body.question.answeredAt, null);

    // Full answer: status -> answered, answeredAt set
    const answered = await json(ctx.base, `/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "answered", answer: "It traps light energy for the leaf." })
    });
    assert.equal(answered.body.question.status, "answered");
    assert.ok(answered.body.question.answeredAt);

    // Reopen to pending: answeredAt cleared
    const reopened = await json(ctx.base, `/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "pending" })
    });
    assert.equal(reopened.body.question.status, "pending");
    assert.equal(reopened.body.question.answeredAt, null);

    // Unknown id -> 404
    const missing = await json(ctx.base, "/api/questions/q_nope", {
      method: "PATCH",
      body: JSON.stringify({ status: "answered" })
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "Question not found");
  } finally {
    await stop(ctx);
  }
});

test("answeredAt is refreshed by a no-op answer PATCH on an answered question (pinned quirk)", async () => {
  const ctx = await startServer();
  try {
    const created = await json(ctx.base, "/api/questions", {
      method: "POST",
      body: JSON.stringify({ text: "Will this be examined?", mode: "now" })
    });
    const id = created.body.question.id;
    const first = await json(ctx.base, `/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "answered", answer: "Yes." })
    });
    await new Promise((r) => setTimeout(r, 10)); // ensure clock advances
    const second = await json(ctx.base, `/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ answer: "Yes, it is a core topic." })
    });
    // BUG(pinned): answering again with no status rewrites answeredAt even
    // though the question never left "answered" state. Fix is a deliberate
    // behavior change, not part of any refactor.
    assert.equal(second.body.question.status, "answered");
    assert.ok(second.body.question.answeredAt > first.body.question.answeredAt);
  } finally {
    await stop(ctx);
  }
});

test("memory: defaults, persistence, and retrieval", async () => {
  const ctx = await startServer();
  try {
    // Minimal body -> all defaults applied (pinned)
    const minimal = await json(ctx.base, "/api/memory", { method: "POST", body: JSON.stringify({}) });
    assert.equal(minimal.status, 201);
    const rec = minimal.body.record;
    assert.equal(rec.title, "Untitled lesson");
    assert.equal(rec.subject, "Biology");
    assert.equal(rec.form, "Form 2");
    assert.deepEqual(rec.transcript, []);
    assert.deepEqual(rec.termsTouched, []);
    assert.deepEqual(rec.questions, []);
    assert.deepEqual(rec.revisionQuestions, []);
    assert.ok(rec.id.startsWith("mem_"));

    const full = await json(ctx.base, "/api/memory", {
      method: "POST",
      body: JSON.stringify({
        title: "Form 2 Biology — Photosynthesis",
        transcript: [{ at: "2026-10-10T08:00:00Z", text: "Today we are learning about photosynthesis." }],
        termsTouched: ["photosynthesis"],
        questions: [],
        summary: "Key terms covered.",
        revisionQuestions: ["What is the role of chlorophyll?"]
      })
    });
    assert.equal(full.body.record.transcript.length, 1);

    const list = await json(ctx.base, "/api/memory");
    assert.equal(list.body.memory.length, 2);

    const one = await json(ctx.base, `/api/memory/${full.body.record.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.record.title, "Form 2 Biology — Photosynthesis");

    const missing = await json(ctx.base, "/api/memory/mem_nope");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "Memory not found");
  } finally {
    await stop(ctx);
  }
});

test("unknown API route returns JSON 404", async () => {
  const ctx = await startServer();
  try {
    const { status, body } = await json(ctx.base, "/api/nope");
    assert.equal(status, 404);
    assert.equal(body.error, "Not found");
  } finally {
    await stop(ctx);
  }
});

test("static serving: shell, assets, MIME types, and path-traversal guard", async () => {
  const ctx = await startServer();
  try {
    const home = await fetch(`${ctx.base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type"), /text\/html/);
    assert.match(await home.text(), /Sauti Vision/);

    const css = await fetch(`${ctx.base}/css/styles.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);

    const js = await fetch(`${ctx.base}/js/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type"), /text\/javascript/);

    // Traversal attempts must not expose anything outside client/
    const escapes = ["/../package.json", "/..%2f..%2fserver%2findex.js", "/..\\..\\server\\index.js"];
    for (const esc of escapes) {
      const res = await fetch(`${ctx.base}${esc}`);
      assert.ok(res.status !== 200, `traversal ${esc} returned 200`);
      const text = await res.text();
      assert.ok(!text.includes("createServer"), `traversal ${esc} leaked server code`);
    }

    const missing = await fetch(`${ctx.base}/no-such-file.png`);
    assert.equal(missing.status, 404);

    const post = await fetch(`${ctx.base}/`, { method: "POST" });
    assert.equal(post.status, 405);
  } finally {
    await stop(ctx);
  }
});

test("data files: signs, terms, and lesson all parse and stay consistent", () => {
  const signs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "signs.json"), "utf8"));
  const terms = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "terms.json"), "utf8"));
  const lesson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "lesson.json"), "utf8"));

  const signIds = new Set(signs.map((s) => s.id));
  assert.equal(signIds.size, signs.length, "duplicate sign ids");
  const termIds = new Set(terms.map((t) => t.id));
  assert.equal(termIds.size, terms.length, "duplicate term ids");
  assert.ok(lesson.utterances.length >= 5);
});
