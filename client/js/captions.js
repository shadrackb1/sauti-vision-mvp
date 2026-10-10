import { state, markLoop, linkTerms, formatTime, toast } from "./state.js";

export function initCaptions({ onTermClick }) {
  const stream = document.getElementById("captionStream");
  const status = document.getElementById("captionStatus");
  const banner = document.getElementById("captionBanner");
  const btnMic = document.getElementById("btnMic");
  const btnDemo = document.getElementById("btnDemoLesson");
  const bannerDemo = document.getElementById("bannerDemo");

  let recognition = null;
  let demoTimer = null;
  let demoIndex = 0;
  let micOn = false;

  stream.addEventListener("click", (e) => {
    const btn = e.target.closest(".term-chip");
    if (btn && onTermClick) onTermClick(btn.dataset.term);
  });

  function clearEmpty() {
    const empty = stream.querySelector(".caption-empty");
    if (empty) empty.remove();
  }

  function appendLine(text, live = false) {
    clearEmpty();
    stream.querySelectorAll(".caption-line.is-live").forEach((el) => el.classList.remove("is-live"));
    const line = document.createElement("p");
    line.className = "caption-line" + (live ? " is-live" : "");
    line.innerHTML = `<span class="meta">${formatTime(new Date().toISOString())}</span>${linkTerms(text)}`;
    stream.appendChild(line);
    stream.scrollTop = stream.scrollHeight;
    state.transcript.push({ at: new Date().toISOString(), text });
    markLoop("listen");
  }

  function setCaptionStatus(msg) {
    status.textContent = msg;
  }

  function stopDemo() {
    if (demoTimer) {
      clearTimeout(demoTimer);
      demoTimer = null;
    }
  }

  function playDemoLesson() {
    stopDemo();
    stopMic();
    const lesson = state.lesson;
    if (!lesson || !lesson.utterances?.length) {
      toast("Demo lesson not loaded");
      return;
    }
    demoIndex = 0;
    setCaptionStatus("Playing demo lesson");
    stream.innerHTML = "";
    state.transcript = [];

    const step = () => {
      if (demoIndex >= lesson.utterances.length) {
        setCaptionStatus("Demo lesson complete");
        toast("Demo lesson finished — try a term or queue a question");
        return;
      }
      const u = lesson.utterances[demoIndex++];
      appendLine(u.text, true);
      demoTimer = setTimeout(step, 2400);
    };
    step();
  }

  function setupSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      banner.hidden = false;
      btnMic.disabled = true;
      setCaptionStatus("Speech API unavailable — use demo lesson");
      return;
    }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-KE";

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText.trim()) appendLine(finalText.trim(), true);
      if (interim.trim()) setCaptionStatus(`Listening… ${interim.trim()}`);
    };

    recognition.onerror = (e) => {
      setCaptionStatus(`Captions error: ${e.error}`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        banner.hidden = false;
      }
    };

    recognition.onend = () => {
      if (micOn) {
        try {
          recognition.start();
        } catch {
          /* already started */
        }
      } else {
        setCaptionStatus("Captions stopped");
        btnMic.textContent = "Start captions";
      }
    };
  }

  function startMic() {
    if (!recognition) return;
    stopDemo();
    micOn = true;
    btnMic.textContent = "Stop captions";
    setCaptionStatus("Listening to teacher speech…");
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }

  function stopMic() {
    micOn = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
    btnMic.textContent = "Start captions";
  }

  btnMic.addEventListener("click", () => {
    if (micOn) stopMic();
    else startMic();
  });
  btnDemo.addEventListener("click", playDemoLesson);
  bannerDemo.addEventListener("click", playDemoLesson);

  setupSpeech();

  return {
    playDemoLesson,
    stopDemo,
    stopMic,
    appendLine
  };
}
