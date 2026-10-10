/** Offline/demo fallback when the Node API is not on this origin. */

let active = false;
const store = {
  questions: [],
  memory: []
};

function parseBody(init) {
  try {
    return JSON.parse(init?.body || "{}");
  } catch {
    return {};
  }
}

const SIGNS = [
  { id: "hello", gloss: "HELLO", text: "Hello", category: "conversational" },
  { id: "yes", gloss: "YES", text: "Yes", category: "conversational" },
  { id: "no", gloss: "NO", text: "No", category: "conversational" },
  { id: "thank-you", gloss: "THANK-YOU", text: "Thank you", category: "conversational" },
  { id: "please", gloss: "PLEASE", text: "Please", category: "conversational" },
  { id: "sorry", gloss: "SORRY", text: "Sorry", category: "conversational" },
  { id: "help", gloss: "HELP", text: "Help", category: "conversational" },
  { id: "name", gloss: "NAME", text: "Name", category: "conversational" },
  { id: "understand", gloss: "UNDERSTAND", text: "I understand", category: "conversational" },
  { id: "not-understand", gloss: "NOT-UNDERSTAND", text: "I don't understand", category: "conversational" },
  { id: "repeat", gloss: "REPEAT", text: "Please repeat", category: "conversational" },
  { id: "slower", gloss: "SLOWER", text: "Slower, please", category: "conversational" },
  { id: "question", gloss: "QUESTION", text: "I have a question", category: "conversational" },
  { id: "finish", gloss: "FINISH", text: "Finished", category: "conversational" },
  { id: "more", gloss: "MORE", text: "More", category: "conversational" },
  { id: "water", gloss: "WATER", text: "Water", category: "conversational" },
  { id: "book", gloss: "BOOK", text: "Book", category: "conversational" },
  { id: "friend", gloss: "FRIEND", text: "Friend", category: "conversational" },
  { id: "teacher", gloss: "TEACHER", text: "Teacher", category: "conversational" },
  { id: "student", gloss: "STUDENT", text: "Student", category: "conversational" },
  { id: "biology", gloss: "BIOLOGY", text: "Biology", category: "education" },
  { id: "photosynthesis", gloss: "PHOTOSYNTHESIS", text: "Photosynthesis", category: "education", termId: "photosynthesis" },
  { id: "chlorophyll", gloss: "CHLOROPHYLL", text: "Chlorophyll", category: "education", termId: "chlorophyll" },
  { id: "leaf", gloss: "LEAF", text: "Leaf", category: "education", termId: "leaf" },
  { id: "sun", gloss: "SUN", text: "Sun", category: "education", termId: "sunlight" },
  { id: "energy", gloss: "ENERGY", text: "Energy", category: "education", termId: "energy" },
  { id: "plant", gloss: "PLANT", text: "Plant", category: "education", termId: "plant" },
  { id: "chemistry", gloss: "CHEMISTRY", text: "Chemistry", category: "education" },
  { id: "mathematics", gloss: "MATHEMATICS", text: "Mathematics", category: "education" },
  { id: "physics", gloss: "PHYSICS", text: "Physics", category: "education" },
  { id: "science", gloss: "SCIENCE", text: "Science", category: "education" },
  { id: "lesson", gloss: "LESSON", text: "Lesson", category: "education" },
  { id: "exam", gloss: "EXAM", text: "Exam", category: "education" },
  { id: "revision", gloss: "REVISION", text: "Revision", category: "education" },
  { id: "homework", gloss: "HOMEWORK", text: "Homework", category: "education" },
  { id: "class", gloss: "CLASS", text: "Class", category: "education" },
  { id: "answer", gloss: "ANSWER", text: "Answer", category: "education" },
  { id: "definition", gloss: "DEFINITION", text: "Definition", category: "education" },
  { id: "example", gloss: "EXAMPLE", text: "Example", category: "education" },
  { id: "glucose", gloss: "GLUCOSE", text: "Glucose", category: "education", termId: "glucose" },
  { id: "oxygen", gloss: "OXYGEN", text: "Oxygen", category: "education", termId: "oxygen" }
];

const TERMS = [
  {
    id: "photosynthesis",
    subject: "Biology",
    form: "Form 2",
    title: "Photosynthesis",
    definition: "The process by which green plants make food (glucose) using carbon dioxide and water in the presence of sunlight and chlorophyll.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "Plants use sunlight, water, and air to make their own food and release oxygen.",
    related: ["chlorophyll", "leaf", "sunlight", "energy", "glucose", "oxygen", "plant"],
    examples: [
      "A maize leaf turns sunlight into sugar the plant can use.",
      "Without light, a plant cannot photosynthesise and will starve over time."
    ],
    revisionQuestions: [
      "What is the role of chlorophyll?",
      "Write the word equation for photosynthesis.",
      "Why do plants need both light and water?"
    ]
  },
  {
    id: "chlorophyll",
    subject: "Biology",
    form: "Form 2",
    title: "Chlorophyll",
    definition: "The green pigment in plant cells that traps light energy for photosynthesis.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "The green stuff in leaves that catches sunlight so the plant can make food.",
    related: ["leaf", "photosynthesis", "sunlight"],
    examples: ["Leaves look green because they are full of chlorophyll."],
    revisionQuestions: [
      "Where in the plant cell is chlorophyll found?",
      "What would happen to photosynthesis without chlorophyll?"
    ]
  },
  {
    id: "leaf",
    subject: "Biology",
    form: "Form 2",
    title: "Leaf",
    definition: "The main photosynthetic organ of a plant; thin and broad to trap light and exchange gases.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "The flat green part of a plant where most food-making happens.",
    related: ["chlorophyll", "photosynthesis", "plant"],
    examples: ["A broad leaf has a large surface to capture light."],
    revisionQuestions: ["How does the shape of a leaf help photosynthesis?"]
  },
  {
    id: "sunlight",
    subject: "Biology",
    form: "Form 2",
    title: "Sunlight",
    definition: "Light energy from the sun that drives photosynthesis in green plants.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "The light energy plants need to make food.",
    related: ["energy", "photosynthesis", "chlorophyll"],
    examples: ["A plant kept in a dark cupboard cannot photosynthesise."],
    revisionQuestions: ["Why is sunlight necessary for photosynthesis?"]
  },
  {
    id: "energy",
    subject: "Biology",
    form: "Form 2",
    title: "Energy",
    definition: "The capacity to do work. In photosynthesis, light energy is stored as chemical energy in glucose.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "What plants store in their food after using sunlight.",
    related: ["photosynthesis", "glucose", "sunlight"],
    examples: ["Chemical energy in glucose later powers plant growth."],
    revisionQuestions: ["What energy change happens during photosynthesis?"]
  },
  {
    id: "plant",
    subject: "Biology",
    form: "Form 2",
    title: "Plant",
    definition: "A living organism that is mostly autotrophic — it can make its own food by photosynthesis.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "A living thing that grows in soil and makes its own food.",
    related: ["leaf", "photosynthesis", "glucose"],
    examples: ["Bean plants, trees, and grass are all photosynthetic plants."],
    revisionQuestions: ["Why are plants called producers in a food chain?"]
  },
  {
    id: "glucose",
    subject: "Biology",
    form: "Form 2",
    title: "Glucose",
    definition: "A simple sugar produced during photosynthesis; used by the plant for energy and growth.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "The sugar food the plant makes for itself.",
    related: ["photosynthesis", "energy"],
    examples: ["Glucose can be stored as starch in the leaf."],
    revisionQuestions: ["How does the plant use the glucose it makes?"]
  },
  {
    id: "oxygen",
    subject: "Biology",
    form: "Form 2",
    title: "Oxygen",
    definition: "A gas released as a by-product of photosynthesis; required for respiration in most living things.",
    kslNote: "Curriculum KSL representation available — validated with KSL experts in pilot.",
    simplified: "The gas plants give out when they make food.",
    related: ["photosynthesis", "plant"],
    examples: ["Bubbles on a water plant in light are oxygen from photosynthesis."],
    revisionQuestions: ["Why is oxygen released during photosynthesis?"]
  }
];

const LESSON = {
  id: "form2-biology-photosynthesis",
  title: "Form 2 Biology — Photosynthesis",
  subject: "Biology",
  form: "Form 2",
  topic: "Photosynthesis",
  utterances: [
    { speaker: "teacher", text: "Good morning class. Today we are learning about photosynthesis." },
    { speaker: "teacher", text: "Photosynthesis is how green plants make their own food." },
    { speaker: "teacher", text: "They use sunlight, water, and carbon dioxide." },
    { speaker: "teacher", text: "Chlorophyll in the leaf traps light energy." },
    { speaker: "teacher", text: "The plant produces glucose and releases oxygen." },
    { speaker: "teacher", text: "Look at the maize leaf on the board. This is where most photosynthesis happens." },
    { speaker: "teacher", text: "Chlorophyll is the green pigment inside the leaf cells." },
    { speaker: "teacher", text: "Energy from sunlight is stored in glucose as chemical energy." },
    { speaker: "teacher", text: "Will this be examined? Yes. Photosynthesis is a core Form 2 topic." },
    { speaker: "teacher", text: "Write the word equation in your books, then we will revise together." }
  ]
};

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function isMock() {
  return active;
}

export async function ensureApiFallback() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.ok && data.service === "sauti-vision-mvp") {
      active = false;
      return false;
    }
  } catch {
    /* fall through to mock */
  }
  active = true;
  return true;
}

export function mockFetch(input, init) {
  const url = new URL(input, window.location.href);
  const method = (init?.method || "GET").toUpperCase();
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const json = (status, body) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body
    });

  if (path === "/api/health") return json(200, { ok: true, service: "sauti-vision-mvp-mock" });
  if (path === "/api/signs") return json(200, { signs: SIGNS });
  if (path === "/api/terms") return json(200, { terms: TERMS });
  if (path === "/api/lesson/script") return json(200, { lesson: LESSON });

  const termMatch = path.match(/^\/api\/terms\/([a-z0-9-]+)$/i);
  if (termMatch) {
    const term = TERMS.find((t) => t.id === termMatch[1]);
    return term ? json(200, { term }) : json(404, { error: "Term not found" });
  }

  if (path === "/api/questions" && method === "GET") {
    return json(200, { questions: store.questions });
  }
  if (path === "/api/questions" && method === "POST") {
    const body = parseBody(init);
    const item = {
      id: uid("q"),
      text: String(body.text || "").trim(),
      mode: ["now", "later", "anonymous"].includes(body.mode) ? body.mode : "later",
      status: "pending",
      answer: null,
      createdAt: new Date().toISOString(),
      answeredAt: null
    };
    if (!item.text) return json(400, { error: "text is required" });
    store.questions.push(item);
    return json(201, { question: item });
  }
  const qMatch = path.match(/^\/api\/questions\/([a-z0-9_]+)$/i);
  if (qMatch && method === "PATCH") {
    const body = parseBody(init);
    const item = store.questions.find((q) => q.id === qMatch[1]);
    if (!item) return json(404, { error: "Question not found" });
    if (body.status && ["pending", "answered", "deferred"].includes(body.status)) {
      item.status = body.status;
      if (body.status !== "answered") item.answeredAt = null;
    }
    if (typeof body.answer === "string") item.answer = body.answer.trim() || null;
    if (item.status === "answered") item.answeredAt = new Date().toISOString();
    return json(200, { question: item });
  }

  if (path === "/api/memory" && method === "GET") return json(200, { memory: store.memory });
  if (path === "/api/memory" && method === "POST") {
    const body = parseBody(init);
    const record = {
      id: uid("mem"),
      title: body.title || "Untitled lesson",
      subject: body.subject || "Biology",
      form: body.form || "Form 2",
      savedAt: new Date().toISOString(),
      transcript: body.transcript || [],
      termsTouched: body.termsTouched || [],
      questions: body.questions || [],
      summary: body.summary || "",
      revisionQuestions: body.revisionQuestions || []
    };
    store.memory.push(record);
    return json(201, { record });
  }
  const mMatch = path.match(/^\/api\/memory\/([a-z0-9_]+)$/i);
  if (mMatch) {
    const record = store.memory.find((m) => m.id === mMatch[1]);
    return record ? json(200, { record }) : json(404, { error: "Memory not found" });
  }

  return json(404, { error: "Not found" });
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (active && String(url).includes("/api/")) {
    return mockFetch(input, init);
  }
  try {
    return await realFetch(input, init);
  } catch (err) {
    if (String(url).includes("/api/")) {
      active = true;
      return mockFetch(input, init);
    }
    throw err;
  }
};

export { SIGNS, TERMS, LESSON };
