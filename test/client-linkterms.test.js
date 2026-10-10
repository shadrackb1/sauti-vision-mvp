/**
 * Pins the term-chip linking behavior of client/js/state.js#linkTerms —
 * the core "tap a term inside a caption" demo path. client/js/package.json
 * declares ESM so Node can import the real browser module (no copy, no
 * mocking). linkTerms is pure: it touches only escapeHtml and state.terms.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

test("linkTerms: chips, case, safety, longest-first (pins core demo path)", async () => {
  const { state, linkTerms } = await import("../client/js/state.js");

  state.terms = new Map([
    ["photosynthesis", { id: "photosynthesis", title: "Photosynthesis" }],
    ["leaf", { id: "leaf", title: "Leaf" }],
    ["chlorophyll", { id: "chlorophyll", title: "Chlorophyll" }]
  ]);

  // Single term — chipped with its term id
  assert.equal(
    linkTerms("Today we are learning about photosynthesis."),
    'Today we are learning about <button type="button" class="term-chip" data-term="photosynthesis">photosynthesis</button>.'
  );

  // Case-insensitive match, original case preserved in the label
  assert.equal(
    linkTerms("Photosynthesis is key."),
    '<button type="button" class="term-chip" data-term="photosynthesis">Photosynthesis</button> is key.'
  );

  // Multiple different terms in one line, all chipped
  const two = linkTerms("The leaf contains chlorophyll.");
  assert.ok(two.includes('data-term="leaf"'));
  assert.ok(two.includes('data-term="chlorophyll"'));

  // No terms present — plain escaped text, no buttons
  assert.equal(linkTerms("Nothing to see here."), "Nothing to see here.");

  // Caption text is escaped — a raw tag never reaches the DOM as markup
  const hostile = linkTerms("<script>alert(1)</script> photosynthesis");
  assert.ok(!hostile.includes("<script>"));
  assert.ok(hostile.includes("&lt;script&gt;")); // escaped entity form survives
  assert.ok(hostile.includes('data-term="photosynthesis"'));

  // Empty vocabulary — safe no-op
  const saved = state.terms;
  state.terms = new Map();
  assert.equal(linkTerms("photosynthesis"), "photosynthesis");
  state.terms = saved;
});
