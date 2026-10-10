import { state, api, toast, markLoop, resetLoop } from "./state.js";
import { ensureApiFallback, isMock } from "./mock-api.js";
import { initCaptions } from "./captions.js";
import { initVision } from "./vision.js";
import { initQueue, initTeacher } from "./queue.js";
import { initMemory, initTermDrawer } from "./memory.js";

async function boot() {
  await ensureApiFallback();
  const [health, signsRes, termsRes, lessonRes, questionsRes] = await Promise.all([
    api("/api/health").catch(() => null),
    api("/api/signs"),
    api("/api/terms"),
    api("/api/lesson/script"),
    api("/api/questions")
  ]);

  if (!health?.ok) toast("API health check failed");

  state.signs = signsRes.signs || [];
  state.terms = new Map((termsRes.terms || []).map((t) => [t.id, t]));
  state.lesson = lessonRes.lesson;
  state.questions = questionsRes.questions || [];

  document.getElementById("lessonTitle").textContent =
    state.lesson?.title || "Form 2 Biology — Photosynthesis";
  document.getElementById("lessonSub").textContent =
    "Quiet Classroom Mode · private captions on this device";

  const drawer = initTermDrawer();
  const teacher = initTeacher({
    getQuestions: () => state.questions,
    onQuestionsChanged: (qs) => {
      queue.renderQuestions(qs);
    }
  });
  const queue = initQueue({
    onChanged: (qs) => teacher.render(qs)
  });
  const vision = initVision({
    onSign: (sign) => {
      if (sign.termId) {
        drawer.openTerm(sign.termId);
      }
      if (sign.id === "question") {
        queue.addFromSign(sign);
      }
      if (["understand", "not-understand", "repeat", "slower", "help"].includes(sign.id)) {
        toast(`Sign: ${sign.text}`);
      }
      if (sign.termId || sign.category === "education") {
        markLoop("learn");
      }
    }
  });
  const captions = initCaptions({
    onTermClick: (termId) => {
      drawer.openTerm(termId);
      markLoop("understand");
      markLoop("learn");
    }
  });
  initMemory({
    captions,
    onLessonReset: () => {
      queue.renderQuestions([]);
      teacher.render([]);
    }
  });

  await queue.refresh();
  teacher.render(state.questions);

  // Role switch
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.role = btn.dataset.role;
      document.querySelectorAll(".role-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (state.role === "teacher") teacher.show();
      else teacher.hide();
    });
  });

  const quiet = document.getElementById("quietMode");
  quiet.addEventListener("change", () => {
    state.quietMode = quiet.checked;
    document.getElementById("lessonSub").textContent = state.quietMode
      ? "Quiet Classroom Mode · private captions on this device"
      : "Live participation · questions can interrupt when needed";
    toast(state.quietMode ? "Quiet Classroom Mode on" : "Quiet Classroom Mode off");
  });

  resetLoop();
  if (isMock()) {
    toast("Preview mode — demo data loaded (run node server for saved state)");
  } else {
    toast("Sauti Vision ready — play the demo lesson");
  }
}

boot().catch((err) => {
  console.error(err);
  toast(err.message || "Failed to start app");
});
