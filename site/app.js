/* TOEFL-Like Listening Part A — static test app (no SQL, no backend required)
   Flow: form -> 35 items (audio once + 30s) -> score + submit */
(function () {
  "use strict";
  const D = window.TEST_DATA, C = window.APP_CONFIG;
  const $ = (s) => document.querySelector(s);
  const state = {
    student: null, idx: 0, answers: {}, order: {}, violations: [],
    startedAt: 0, timer: null, timeLeft: 0, playing: false, audio: new Audio(),
    submitted: false, qn: [], questionnaire: null
  };

  /* ---------- helpers ---------- */
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    window.scrollTo(0, 0);
  }
  function seed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffle(arr, s) { const a = arr.slice(); let x = s || 12345; for (let i = a.length - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) >>> 0; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const fmtPct = (n, d) => d ? Math.round((n / d) * 100) + "%" : "—";

  /* ---------- anti-cheat ---------- */
  function violation(type) {
    state.violations.push({ t: Date.now() - state.startedAt, type });
    $("#tViol").textContent = "⚠ " + state.violations.length;
  }
  function initAntiCheat() {
    document.addEventListener("visibilitychange", () => { if (document.hidden && inTest()) violation("tab_switch"); });
    window.addEventListener("blur", () => { if (inTest() && !document.fullscreenElement) violation("window_blur"); });
    document.addEventListener("contextmenu", (e) => { if (inTest()) e.preventDefault(); });
    document.addEventListener("copy cut", (e) => { if (inTest()) e.preventDefault(); });
    document.addEventListener("keydown", (e) => { if (inTest() && (e.key === "F12" || (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) || (e.ctrlKey && ["u", "U"].includes(e.key)))) { e.preventDefault(); violation("devtools_key"); } });
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && inTest()) { $("#fsOverlay").classList.remove("hidden"); violation("fullscreen_exit"); }
      else $("#fsOverlay").classList.add("hidden");
    });
    $("#btnFsBack").addEventListener("click", () => document.documentElement.requestFullscreen().catch(() => {}));
  }
  const inTest = () => $("#scr-test").classList.contains("active");

  /* ---------- registration ---------- */
  $("#regForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#fName").value.trim();
    let waRaw = $("#fWa").value.replace(/\D/g, "");
    let wa = waRaw.replace(/^62/, "0");
    if (wa[0] !== "0") wa = "0" + wa;
    const sem = parseInt($("#fSem").value, 10);
    if (name.length < 3) return err("#formErr", "Nama minimal 3 karakter.");
    if (/^08\d{8,12}$/.test(wa) === false) return err("#formErr", "Nomor WA tidak valid (format 08xxxxxxxxxx).");
    if (!sem || sem < 4 || sem > 7) return err("#formErr", "Semester harus 4-7 (kriteria subjek penelitian).");
    const lockKey = "oktin_done_" + wa;
    if (localStorage.getItem(lockKey) && new URLSearchParams(location.search).get("reset") !== "1") {
      return show("#scr-locked");
    }
    if (localStorage.getItem(lockKey) && new URLSearchParams(location.search).get("reset") === "1") {
      localStorage.removeItem(lockKey);
    }
    state.student = { name, wa, sem, ua: navigator.userAgent.slice(0, 160) };
    state.startedAt = Date.now();
    startFullscreen().then(() => beginTest());
    show("#scr-test");
  });
  function err(sel, msg) { $(sel).textContent = msg; }
  function startFullscreen() {
    return document.documentElement.requestFullscreen().catch(() => {});
  }

  /* ---------- test flow ---------- */
  function beginTest() { initAntiCheat(); renderQuestion(); }

  function renderQuestion() {
    const it = D.items[state.idx];
    clearInterval(state.timer);
    state.playing = false;
    $("#tProgress").textContent = `Soal ${state.idx + 1}/${D.items.length}`;
    $("#tViol").textContent = "⚠ " + state.violations.length;
    $("#itemTag").textContent = `${it.sentence_type} sentence · implicature`;
    $("#itemNum").textContent = `Number ${state.idx + 1}`;
    $("#stage-play").classList.remove("hidden");
    $("#stage-ans").classList.add("hidden");
    const btn = $("#btnPlay");
    btn.disabled = false; btn.textContent = "▶ Play Audio";
    btn.onclick = playAudio;
    state.audio = new Audio(it.audio);
    state.audio.onended = onAudioEnd;
    state.audio.onerror = onAudioEnd;
  }

  function playAudio() {
    if (state.playing) return;
    state.playing = true;
    const btn = $("#btnPlay");
    btn.disabled = true; btn.textContent = "🔊 Playing…";
    state.audio.play().catch(() => onAudioEnd());
  }

  function onAudioEnd() {
    if (!inTest() || !$("#stage-ans").classList.contains("hidden")) return;
    state.playing = false;
    $("#stage-play").classList.add("hidden");
    $("#stage-ans").classList.remove("hidden");
    const it = D.items[state.idx];
    $("#qText").textContent = it.question;
    const s = seed(state.student.wa + ":" + it.id);
    const opts = shuffle(it.options, s);
    state.order[it.id] = opts;
    const wrap = $("#opts");
    wrap.innerHTML = "";
    ["A", "B", "C", "D"].forEach((L, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.innerHTML = `<span class="key">${L}</span>${opts[i]}`;
      b.onclick = () => {
        wrap.querySelectorAll(".opt").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
        state.answers[it.id] = opts[i];
      };
      wrap.appendChild(b);
    });
    // restore selection on re-render (not possible: no back) — start 30s timer
    state.timeLeft = D.answerSeconds;
    paintTimer();
    state.timer = setInterval(() => {
      state.timeLeft -= 1; paintTimer();
      if (state.timeLeft <= 0) { nextItem(); }
    }, 1000);
  }

  function paintTimer() {
    $("#countdown").textContent = state.timeLeft;
    $("#tTimer").textContent = state.timeLeft + "s";
    $("#tTimer").classList.toggle("low", state.timeLeft <= 10);
    $("#countdown").classList.toggle("low", state.timeLeft <= 10);
  }

  function nextItem() {
    clearInterval(state.timer);
    if (state.answers[D.items[state.idx].id] === undefined) state.answers[D.items[state.idx].id] = null;
    state.idx += 1;
    if (state.idx >= D.items.length) return endTest();
    renderQuestion();
  }

  /* ---------- end of test ---------- */
  function endTest() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    renderQuestionnaire();
  }

  /* ---------- post-test questionnaire ---------- */
  function renderQuestionnaire() {
    const Q = D.questionnaire;
    if (!Q) return finishAndScore();
    const wrap = $("#qnLikert");
    wrap.innerHTML = "";
    state.qn = [];
    Q.items.forEach((text, i) => {
      const row = document.createElement("div");
      row.classList.add("qrow");
      const p = document.createElement("p");
      p.textContent = (i + 1) + ". " + text;
      row.appendChild(p);
      const scale = document.createElement("div");
      scale.classList.add("scale");
      Q.scale.forEach((labelText, j) => {
        const v = j + 1;
        const label = document.createElement("label");
        const inp = document.createElement("input");
        inp.type = "radio";
        inp.name = "qnLikert";
        inp.value = String(v);
        inp.addEventListener("click", () => { state.qn[i] = v; });
        const num = document.createElement("span");
        num.classList.add("num");
        num.textContent = String(v);
        label.appendChild(inp);
        label.appendChild(num);
        label.appendChild(document.createTextNode(labelText));
        scale.appendChild(label);
      });
      row.appendChild(scale);
      wrap.appendChild(row);
    });
    show("#scr-qn");
  }

  function collectQuestionnaire() {
    const score = parseInt($("#qnScore").value, 10);
    const type = $("#qnType").value;
    const high = $("#qnHigh").value;
    const low = $("#qnLow").value;
    if (!score || score < 310 || score >= 500) return err("#qnErr", "Your latest TOEFL score must be below 500 (research criterion).");
    if (!type) return err("#qnErr", "Please select the TOEFL test type.");
    if (!high) return err("#qnErr", "Please choose the section with your highest score.");
    if (!low) return err("#qnErr", "Please choose the section with your lowest score.");
    if (high === low) return err("#qnErr", "Highest and lowest sections must be different.");
    if (!state.qn || state.qn.length !== 10 || state.qn.some((v) => !v)) return err("#qnErr", "Please answer all 10 statements.");
    const o1 = $("#qnO1").value.trim();
    if (o1.length < 5) return err("#qnErr", "Please answer open question 1 briefly.");
    state.questionnaire = {
      score, type, high, low,
      q: state.qn.slice(),
      o1, o2: $("#qnO2").value.trim()
    };
    finishAndScore();
  }

  /* ---------- scoring + submit ---------- */
  function finishAndScore() {
    const res = computeResult();
    renderScore(res);
    show("#scr-score");
    localStorage.setItem("oktin_done_" + state.student.wa, JSON.stringify({ at: Date.now(), score: res.total }));
    submitResult(res);
  }

  function computeResult() {
    let total = 0, sSimpleC = 0, sSimpleN = 0, sCompC = 0, sCompN = 0;
    const items = D.items.map((it) => {
      const chosen = state.answers[it.id] === undefined ? null : state.answers[it.id];
      const ok = chosen === it.key;
      total += ok ? 1 : 0;
      if (it.sentence_type === "simple") { sSimpleN++; if (ok) sSimpleC++; } else { sCompN++; if (ok) sCompC++; }
      return { id: it.id, type: it.sentence_type, chosen, correct: it.key, ok };
    });
    const qn = state.questionnaire || {};
    return {
      nama: state.student.name, wa: state.student.wa, semester: state.student.sem,
      toefl_score: qn.score != null ? qn.score : "",
      toefl_type: qn.type || "",
      section_high: qn.high || "",
      section_low: qn.low || "",
      questionnaire: qn.q ? { q: qn.q, o1: qn.o1 || "", o2: qn.o2 || "" } : null,
      total, percent: Math.round((total / D.items.length) * 100),
      simple: `${sSimpleC}/${sSimpleN} (${fmtPct(sSimpleC, sSimpleN)})`,
      compound: `${sCompC}/${sCompN} (${fmtPct(sCompC, sCompN)})`,
      duration_sec: Math.round((Date.now() - state.startedAt) / 1000),
      violations: state.violations.length,
      violation_log: state.violations,
      items,
      meta: { ua: state.student.ua, finished_at: new Date().toISOString(), test: "TOEFL-like Part A implicature v2 (35 items)" }
    };
  }

  function renderScore(r) {
    $("#scoreTotal").textContent = `${r.total}/${D.items.length}`;
    $("#scorePct").textContent = r.percent + "%";
    $("#stSimple").textContent = r.simple;
    $("#stCompound").textContent = r.compound;
    $("#rName").textContent = r.nama;
    $("#rSem").textContent = r.semester;
    $("#rDur").textContent = Math.floor(r.duration_sec / 60) + "m " + (r.duration_sec % 60) + "s";
    $("#rViol").textContent = r.violations === 0 ? "bersih ✓" : r.violations + " kejadian (dicatat)";
    window.__LAST_RESULT = r;
    // WA fallback
    const txt = `HASIL TOEFL-LIKE LISTENING PART A%0A%0ANama: ${encodeURIComponent(r.nama)}%0AWA: ${r.wa}%0ASemester: ${r.semester}%0A%0ASkor: ${r.total}/${D.items.length} (${r.percent}%)%0ASimple: ${encodeURIComponent(r.simple)}%0ACompound: ${encodeURIComponent(r.compound)}%0APelanggaran integritas: ${r.violations}`;
    if (C.whatsappTarget) {
      $("#btnWa").href = `https://wa.me/${C.whatsappTarget}?text=${txt}`;
      $("#btnWa").classList.remove("hidden");
    }
    $("#btnCopy").onclick = () => {
      navigator.clipboard.writeText(decodeURIComponent(txt.replace(/%0A/g, "\n"))).then(() => { $("#btnCopy").textContent = "✅ Tersalin"; });
    };
    $("#btnRetry").onclick = () => submitResult(r);
  }

  function submitResult(r) {
    const el = $("#rSubmit");
    if (!C.sheetsEndpoint) {
      el.textContent = "⚠ Endpoint Google Sheets belum diisi (lihat SETUP.md). Gunakan tombol Salin/WhatsApp.";
      return;
    }
    el.textContent = "⏳ Mengirim…";
    fetch(C.sheetsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(r)
    }).then((resp) => {
      if (resp.ok) el.textContent = "✅ Tersimpan ke Google Sheets";
      else throw new Error("HTTP " + resp.status);
    }).catch(() => {
      // CORS-safe fallback: fire and forget
      return fetch(C.sheetsEndpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(r) })
        .then(() => { el.textContent = "✅ Terkirim (verifikasi di Sheet)"; })
        .catch(() => { el.textContent = "❌ Gagal kirim — pakai tombol Salin/WhatsApp. Data juga tersimpan lokal."; });
    });
  }

  /* ---------- locked screen if attempt exists ---------- */
  (function init() {
    $("#qnForm").addEventListener("submit", (e) => {
      e.preventDefault();
      collectQuestionnaire();
    });
    const wa = new URLSearchParams(location.search).get("wa");
    if (wa && localStorage.getItem("oktin_done_" + wa)) show("#scr-locked");
  })();
})();
