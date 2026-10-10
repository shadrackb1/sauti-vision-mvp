"use strict";

/**
 * HTTP adapter (clean-architecture Phase 5).
 * Routing, request parsing, and status mapping ONLY — every business rule
 * lives in server/domain.js. Swapping the transport (or the file store for a
 * real DB) touches this file and nothing else.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { createDomain, ValidationError, NotFoundError } = require("./domain.js");

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

/** File-backed store adapter: the only place that knows persistence details. */
function createFileStore() {
  function ensureState() {
    const dir = stateDir();
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ["questions.json", "memory.json"]) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) fs.writeFileSync(p, "[]", "utf8");
    }
  }

  return {
    ensureState,
    async load() {
      ensureState();
      const dir = stateDir();
      const read = (name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
        } catch {
          return [];
        }
      };
      return { questions: read("questions.json"), memory: read("memory.json") };
    },
    async save(state) {
      ensureState();
      const dir = stateDir();
      fs.writeFileSync(path.join(dir, "questions.json"), JSON.stringify(state.questions, null, 2), "utf8");
      fs.writeFileSync(path.join(dir, "memory.json"), JSON.stringify(state.memory, null, 2), "utf8");
    }
  };
}

function readData(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return null;
  }
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

function parseRoute(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  const questionMatch = p.match(/^\/api\/questions\/([a-z0-9_]+)$/i);
  const termMatch = p.match(/^\/api\/terms\/([a-z0-9-]+)$/i);
  const memoryMatch = p.match(/^\/api\/memory\/([a-z0-9_]+)$/i);
  return { p, questionMatch, termMatch, memoryMatch };
}

async function handleApi(req, res, url, domain) {
  const { p, questionMatch, termMatch, memoryMatch } = parseRoute(url.pathname);
  const method = req.method || "GET";

  if (method === "GET" && p === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "sauti-vision-mvp", time: new Date().toISOString() });
  }

  if (method === "GET" && p === "/api/signs") {
    return sendJson(res, 200, { signs: readData("signs.json") || [] });
  }

  if (method === "GET" && p === "/api/terms") {
    return sendJson(res, 200, { terms: readData("terms.json") || [] });
  }

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
    return sendJson(res, 200, { questions: await domain.listQuestions() });
  }

  if (method === "POST" && p === "/api/questions") {
    const body = await parseJsonBody(req, res);
    if (body === undefined) return; // response already sent
    try {
      const question = await domain.createQuestion(body);
      return sendJson(res, 201, { question });
    } catch (err) {
      if (err instanceof ValidationError) return sendJson(res, 400, { error: err.message });
      throw err;
    }
  }

  if (method === "PATCH" && questionMatch) {
    const body = await parseJsonBody(req, res);
    if (body === undefined) return;
    try {
      const question = await domain.answerQuestion(questionMatch[1], body);
      return sendJson(res, 200, { question });
    } catch (err) {
      if (err instanceof NotFoundError) return sendJson(res, 404, { error: err.message });
      throw err;
    }
  }

  if (method === "GET" && p === "/api/memory") {
    return sendJson(res, 200, { memory: await domain.listMemory() });
  }

  if (method === "POST" && p === "/api/memory") {
    const body = await parseJsonBody(req, res);
    if (body === undefined) return;
    const record = await domain.saveMemoryRecord(body);
    return sendJson(res, 201, { record });
  }

  if (method === "GET" && memoryMatch) {
    try {
      const record = await domain.getMemoryRecord(memoryMatch[1]);
      return sendJson(res, 200, { record });
    } catch (err) {
      if (err instanceof NotFoundError) return sendJson(res, 404, { error: err.message });
      throw err;
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

/** Parse a JSON body; on invalid JSON respond 400 and return undefined. */
async function parseJsonBody(req, res) {
  try {
    return await readBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return undefined;
  }
}

function createServer() {
  const store = createFileStore();
  store.ensureState();
  const domain = createDomain({ store });
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      try {
        await handleApi(req, res, url, domain);
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

module.exports = { createServer, ensureState: createFileStore().ensureState };
