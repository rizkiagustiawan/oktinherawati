/* Menjalankan site/app.js di vm sandbox dengan DOM stub + jam virtual.
   Jam virtual membuat timer 30 detik deterministik dan instan. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { makeDocument } = require("./dom");

const SITE = path.resolve(__dirname, "..", "..", "site");

function loadData() {
  const src = fs.readFileSync(path.join(SITE, "data.js"), "utf8");
  const box = {};
  vm.runInNewContext(src, { window: box });
  return box.TEST_DATA;
}

function makeFetch(handler) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts });
    if (handler) return handler(url, opts, calls);
    return { ok: true, status: 200, text: async () => '{"ok":true}' };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

function makeAudioClass(registry) {
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.onended = null;
      this.onerror = null;
      this.paused = true;
      this.playCalls = 0;
      registry.push(this);
    }
    play() {
      this.playCalls++;
      this.paused = false;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    finish() {
      this.paused = true;
      if (typeof this.onended === "function") this.onended();
    }
    fail() {
      this.paused = true;
      if (typeof this.onerror === "function") this.onerror();
    }
  }
  return FakeAudio;
}

/* Virtual clock: setTimeout/setInterval yang dipicu manual. */
function makeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();

  const clock = {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { fn, at: now + (ms || 0), every: null });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) {
      const id = ++seq;
      timers.set(id, { fn, at: now + (ms || 0), every: ms || 1 });
      return id;
    },
    clearInterval(id) { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      let guard = 0;
      for (;;) {
        if (++guard > 100000) throw new Error("clock runaway");
        let nextId = null;
        let nextAt = Infinity;
        for (const [id, t] of timers) {
          if (t.at <= target && t.at < nextAt) { nextAt = t.at; nextId = id; }
        }
        if (nextId === null) break;
        const t = timers.get(nextId);
        now = t.at;
        if (t.every === null) timers.delete(nextId);
        else t.at = now + t.every;
        t.fn();
      }
      now = target;
    },
    tick(ms) { clock.advance(ms || 1000); },
  };
  return clock;
}

function boot(options = {}) {
  const doc = makeDocument();
  const data = options.data || loadData();
  const config = Object.assign(
    { sheetsEndpoint: "https://example.test/exec", whatsappTarget: "", answerSeconds: 30 },
    options.config || {}
  );
  const clock = options.clock || makeClock();
  const audioRegistry = [];
  const FakeAudio = makeAudioClass(audioRegistry);
  const fetch = options.fetch || makeFetch();
  const storage = options.localStorage || makeStorage();

  const windowListeners = {};
  const location = {
    search: options.search || "",
    href: "https://example.test/",
  };

  const windowObj = {
    TEST_DATA: data,
    APP_CONFIG: config,
    scrollTo() {},
    addEventListener(type, fn) { (windowListeners[type] = windowListeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      const a = windowListeners[type] || [];
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    navigator: { userAgent: "node-test", clipboard: { writeText: async () => {} } },
    location,
    localStorage: storage,
    document: doc,
    Audio: FakeAudio,
    fetch,
    URLSearchParams,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    console: { log() {}, warn() {}, error() {} },
  };
  windowObj.window = windowObj;
  windowObj.self = windowObj;

  const sandbox = {
    window: windowObj,
    document: doc,
    navigator: windowObj.navigator,
    localStorage: storage,
    location,
    fetch,
    Audio: FakeAudio,
    URLSearchParams,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    console: windowObj.console,
    Promise,
    JSON,
    Object,
    Array,
    String,
    Number,
    Math,
    Date,
    parseInt,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    Error,
  };
  sandbox.globalThis = sandbox;
  windowObj.globalThis = windowObj;

  const code = fs.readFileSync(path.join(SITE, "app.js"), "utf8");
  vm.runInNewContext(code, sandbox, { filename: "app.js" });

  const h = {
    doc,
    data,
    config,
    sandbox,
    windowObj,
    clock,
    fetch,
    storage,
    audioRegistry,
    location,
    fireWindow(type) {
      (windowListeners[type] || []).slice().forEach((fn) => fn({ type }));
    },
    activeScreen() {
      return (doc.querySelectorAll(".screen").find((s) => s.classList.contains("active")) || {}).id;
    },
    lastAudio() {
      return audioRegistry[audioRegistry.length - 1];
    },
  };
  return h;
}

/* Interaksi tingkat peserta. */
async function fillForm(h, o = {}) {
  h.doc.getElementById("fName").value = o.name || "Mahasiswa Uji";
  h.doc.getElementById("fWa").value = o.wa || "081234567891";
  h.doc.getElementById("fSem").value = String(o.sem === undefined ? 5 : o.sem);
  h.doc.getElementById("fConsent").checked = true;
  h.doc.getElementById("regForm").dispatch("submit");
  // startFullscreen().then(beginTest) -> butuh satu microtask
  await new Promise((r) => setImmediate(r));
  return h;
}

/* Isi kuesioner post-test (layar scr-qn) lalu submit.
   Default: nilai valid (skor 470, ITP/PBT, tinggi=Reading, rendah=Listening,
   Likert bergantian 1..5, o1/o2 terisi). */
async function fillQuestionnaire(h, o = {}) {
  h.doc.getElementById("qnScore").value = String(o.score === undefined ? 470 : o.score);
  h.doc.getElementById("qnType").value = o.type || "ITP / Paper-Based Test (PBT)";
  h.doc.getElementById("qnHigh").value = o.high || "Reading";
  h.doc.getElementById("qnLow").value = o.low || "Listening";
  h.doc.getElementById("qnO1").value = o.o1 || "Compound sentences are harder to understand.";
  h.doc.getElementById("qnO2").value = o.o2 || "Speak a bit slower.";

  const rows = h.doc.getElementById("qnLikert").children || [];
  const qArr = Array.isArray(o.q) ? o.q : null;
  rows.forEach((row, i) => {
    const scale = row.children.find((c) => c.classList.contains("scale"));
    if (!scale) return;
    const want = qArr ? qArr[i] : (i % 5) + 1;
    if (want == null) return; // biarkan kosong (untuk uji validasi)
    const label = scale.children.find((c) => c.children && c.children[0] && c.children[0].value === String(want));
    if (!label) return;
    const inp = label.children[0];
    inp.checked = true;
    inp.click();
  });

  h.doc.getElementById("qnForm").dispatch("submit");
  await new Promise((r) => setImmediate(r));
  return h;
}

function currentItem(h) {
  const label = h.doc.getElementById("tProgress").textContent || "";
  const m = label.match(/Soal (\d+)\//);
  const idx = m ? parseInt(m[1], 10) - 1 : 0;
  return h.data.items[idx];
}

function optionText(el) {
  // opsi dirender sebagai: <span class="key">A</span>TEXT
  return String(el.innerHTML || "").replace(/^<span class="key">[A-D]<\/span>/, "");
}

function answerCurrentItem(h, mode) {
  const btn = h.doc.getElementById("btnPlay");
  btn.click();
  const audio = h.lastAudio();
  if (audio && mode !== "audio-error") audio.finish();
  else if (audio) audio.fail();

  const it = currentItem(h);
  const opts = h.doc.getElementById("opts").children;

  if (mode === "correct" || mode === undefined) {
    const target = opts.find((o) => optionText(o) === it.key);
    if (target) target.click();
  } else if (mode === "wrong") {
    const target = opts.find((o) => optionText(o) !== it.key);
    if (target) target.click();
  } else if (mode === "skip") { /* biarkan kosong */ }
  return { optCount: opts.length, key: it.key };
}

function runAllItems(h, plan) {
  const n = h.data.items.length;
  for (let i = 0; i < n; i++) {
    const mode = typeof plan === "function" ? plan(i) : (plan || "correct");
    answerCurrentItem(h, mode);
    h.clock.advance(h.data.answerSeconds * 1000);
  }
}

module.exports = {
  boot, loadData, makeFetch, makeStorage, makeAudioClass, makeClock,
  fillForm, fillQuestionnaire, answerCurrentItem, currentItem, optionText, runAllItems, SITE,
};
