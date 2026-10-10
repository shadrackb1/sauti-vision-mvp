"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const CLIENT_DIR = path.join(ROOT, "..", "client");
const PORT = Number(process.env.PORT || 5177);

function stateDir() {
  return process.env.SAUTI_STATE_DIR
    ? path.resolve(process.env.SAUTI_STATE_DIR)
    : path.join(ROOT, "state");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function ensureState() {
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ["questions.json", "memory.json"]) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, "[]", "utf8");
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function readData(name) {
  return readJson(path.join(DATA_DIR, name), null);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  const safe = path
    .normalize(rel)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(CLIENT_DIR, safe);
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60"
    });
    res.end(buf);
  });
}

async function handleApi(req, res, url) {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method || "GET";

  if (method === "GET" && p === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "sauti-vision-mvp", time: new Date().toISOString() });
  }

  if (method === "GET" && p === "/api/signs") {
    const signs = readData("signs.json") || [];
    return sendJson(res, 200, { signs });
  }

  if (method === "GET" && p === "/api/terms") {
    const terms = readData("terms.json") || [];
    return sendJson(res, 200, { terms });
  }

  const termMatch = p.match(/^\/api\/terms\/([a-z0-9-]+)$/i);
  if (method === "GET" && termMatch) {
    const terms = readData("terms.json") || [];
    const term = terms.find((t) => t.id === termMatch[1]);
    if (!term) return sendJson(res, 404, { error: "Term not found" });
    return sendJson(res, 200, { term });
  }

  if (method === "GET" && p === "/api/lesson/script") {
    const lesson = readData("lesson.json");
    if (!lesson) return sendJson(res, 404, { error: "Lesson not found" });
    return sendJson(res, 200, { lesson });
  }

  if (method === "GET" && p === "/api/questions") {
    const questions = readJson(path.join(stateDir(), "questions.json"), []);
    return sendJson(res, 200, { questions });
  }

  if (method === "POST" && p === "/api/questions") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
    const text = String(body.text || "").trim();
    const mode = ["now", "later", "anonymous"].includes(body.mode) ? body.mode : "later";
    if (!text) return sendJson(res, 400, { error: "text is required" });
    const questions = readJson(path.join(stateDir(), "questions.json"), []);
    const item = {
      id: uid("q"),
      text,
      mode,
      status: "pending",
      answer: null,
      createdAt: new Date().toISOString(),
      answeredAt: null
    };
    questions.push(item);
    writeJson(path.join(stateDir(), "questions.json"), questions);
    return sendJson(res, 201, { question: item });
  }

  const qMatch = p.match(/^\/api\/questions\/([a-z0-9_]+)$/i);
  if (method === "PATCH" && qMatch) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
    const questions = readJson(path.join(stateDir(), "questions.json"), []);
    const item = questions.find((q) => q.id === qMatch[1]);
    if (!item) return sendJson(res, 404, { error: "Question not found" });
    if (body.status && ["pending", "answered", "deferred"].includes(body.status)) {
      item.status = body.status;
      if (body.status !== "answered") item.answeredAt = null;
    }
    if (typeof body.answer === "string") {
      item.answer = body.answer.trim() || null;
    }
    if (item.status === "answered") item.answeredAt = new Date().toISOString();
    writeJson(path.join(stateDir(), "questions.json"), questions);
    return sendJson(res, 200, { question: item });
  }

  if (method === "GET" && p === "/api/memory") {
    const memory = readJson(path.join(stateDir(), "memory.json"), []);
    return sendJson(res, 200, { memory });
  }

  if (method === "POST" && p === "/api/memory") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
    const title = String(body.title || "Untitled lesson").trim();
    const record = {
      id: uid("mem"),
      title,
      subject: body.subject || "Biology",
      form: body.form || "Form 2",
      savedAt: new Date().toISOString(),
      transcript: Array.isArray(body.transcript) ? body.transcript : [],
      termsTouched: Array.isArray(body.termsTouched) ? body.termsTouched : [],
      questions: Array.isArray(body.questions) ? body.questions : [],
      summary: String(body.summary || "").trim(),
      revisionQuestions: Array.isArray(body.revisionQuestions) ? body.revisionQuestions : []
    };
    const memory = readJson(path.join(stateDir(), "memory.json"), []);
    memory.push(record);
    writeJson(path.join(stateDir(), "memory.json"), memory);
    return sendJson(res, 201, { record });
  }

  const mMatch = p.match(/^\/api\/memory\/([a-z0-9_]+)$/i);
  if (method === "GET" && mMatch) {
    const memory = readJson(path.join(stateDir(), "memory.json"), []);
    const record = memory.find((m) => m.id === mMatch[1]);
    if (!record) return sendJson(res, 404, { error: "Memory not found" });
    return sendJson(res, 200, { record });
  }

  return sendJson(res, 404, { error: "Not found" });
}

function createServer() {
  ensureState();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      try {
        await handleApi(req, res, url);
      } catch (err) {
        sendJson(res, 500, { error: err.message || "Server error" });
      }
      return;
    }
    if ((req.method || "GET") !== "GET" && (req.method || "GET") !== "HEAD") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }
    serveStatic(req, res, decodeURIComponent(url.pathname));
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Sauti Vision MVP running at http://localhost:${PORT}`);
  });
}

module.exports = { createServer, ensureState };
