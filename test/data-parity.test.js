/**
 * Data parity: the client's offline mock (mock-api.js) duplicates the server's
 * JSON data files. This test pins them together so the copy can never drift —
 * a data edit must land in server/data/*.json AND be mirrored here, or this
 * fails. (True single-source dedup would need a build step; declined for the
 * no-build demo. Parity-by-test is the pragmatic guard.)
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { SIGNS, TERMS, LESSON } = require("../client/js/mock-api.js");

const DATA_DIR = path.join(__dirname, "..", "server", "data");
const serverSigns = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "signs.json"), "utf8"));
const serverTerms = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "terms.json"), "utf8"));
const serverLesson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "lesson.json"), "utf8"));

test("mock signs match server signs.json exactly", () => {
  assert.deepEqual(SIGNS, serverSigns);
});

test("mock terms match server terms.json exactly", () => {
  assert.deepEqual(TERMS, serverTerms);
});

test("mock lesson matches server lesson.json exactly", () => {
  assert.deepEqual(LESSON, serverLesson);
});
