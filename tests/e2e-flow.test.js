/* E2E: simulasi lengkap peserta dari isi form sampai submit ke backend.
   Fokus: memastikan 35 soal dijawab berujung pada payload lengkap yang TERKIRIM. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  boot, makeFetch, makeStorage, fillForm, fillQuestionnaire, answerCurrentItem, runAllItems,
} = require("./helpers/app-harness");

test("form menolak nomor WA tidak valid", async () => {
  const h = boot();
  await fillForm(h, { wa: "12345" });
  assert.equal(h.activeScreen(), "scr-form");
  assert.match(h.doc.getElementById("formErr").textContent, /tidak valid/i);
});

test("form menolak semester di luar 4-7", async () => {
  const h = boot();
  await fillForm(h, { sem: 2 });
  assert.equal(h.activeScreen(), "scr-form");
  assert.match(h.doc.getElementById("formErr").textContent, /4-7/);
});

test("nomor WA 628xx dan 08xx dinormalisasi ke format 08xx", async () => {
  const h = boot();
  await fillForm(h, { wa: "6281234567890" });
  runAllItems(h, "correct");
  await fillQuestionnaire(h);
  const payload = JSON.parse(h.fetch.calls.at(-1).opts.body);
  assert.equal(payload.wa, "081234567890");
});

test("setelah form valid, layar tes aktif dan soal 1 tampil", async () => {
  const h = boot();
  await fillForm(h);
  assert.equal(h.activeScreen(), "scr-test");
  assert.equal(h.doc.getElementById("tProgress").textContent, "Soal 1/35");
});

test("alur penuh 35 soal + kuesioner mengirim payload berisi seluruh item", async () => {
  const h = boot();
  await fillForm(h);
  runAllItems(h, "correct");

  // setelah soal selesai, layar kuesioner muncul dulu (belum ada submit)
  assert.equal(h.activeScreen(), "scr-qn");
  assert.equal(h.fetch.calls.length, 0, "belum boleh submit sebelum kuesioner");

  await fillQuestionnaire(h);

  assert.equal(h.activeScreen(), "scr-score");
  assert.equal(h.fetch.calls.length, 1, "harus tepat satu kali submit");
  const payload = JSON.parse(h.fetch.calls[0].opts.body);

  assert.equal(payload.items.length, 35, "semua 35 item harus ikut terkirim");
  assert.equal(payload.total, 35);
  assert.equal(payload.percent, 100);
  assert.equal(payload.simple, "18/18 (100%)");
  assert.equal(payload.compound, "17/17 (100%)");
  assert.equal(payload.wa, "081234567891");
  assert.equal(payload.semester, 5);
  assert.ok(payload.meta.finished_at, "timestamp harus ada");
  assert.equal(payload.meta.test.includes("35"), true);

  // data latar ITP + kuesioner ikut terkirim
  assert.equal(payload.toefl_score, 470);
  assert.equal(payload.toefl_type, "ITP / Paper-Based Test (PBT)");
  assert.equal(payload.section_high, "Reading");
  assert.equal(payload.section_low, "Listening");
  assert.ok(payload.questionnaire, "questionnaire harus ada");
  assert.equal(payload.questionnaire.q.length, 10);
  assert.equal(payload.questionnaire.o1.length > 0, true);
  assert.equal(payload.questionnaire.o2.length > 0, true);

  const ids = payload.items.map((i) => i.id).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: 35 }, (_, i) => i + 1));
});

test("kuesioner menolak skor TOEFL >= 500 (kriteria inklusi)", async () => {
  const h = boot();
  await fillForm(h);
  runAllItems(h, "correct");
  await fillQuestionnaire(h, { score: 520 });
  assert.equal(h.activeScreen(), "scr-qn", "tetap di kuesioner");
  assert.match(h.doc.getElementById("qnErr").textContent, /below 500/i);
  assert.equal(h.fetch.calls.length, 0);
});

test("kuesioner menolak section tertinggi = terendah", async () => {
  const h = boot();
  await fillForm(h);
  runAllItems(h, "correct");
  await fillQuestionnaire(h, { high: "Reading", low: "Reading" });
  assert.equal(h.activeScreen(), "scr-qn");
  assert.match(h.doc.getElementById("qnErr").textContent, /different/i);
});

test("kuesioner menolak Likert yang belum lengkap", async () => {
  const h = boot();
  await fillForm(h);
  runAllItems(h, "correct");
  await fillQuestionnaire(h, { q: [1, 2, 3, 4, 5, 1, 2, 3, 4, undefined] });
  assert.equal(h.activeScreen(), "scr-qn");
  assert.match(h.doc.getElementById("qnErr").textContent, /all 10/i);
});

test("jawaban salah tercatat dan menurunkan skor per tipe", async () => {
  const h = boot();
  await fillForm(h);
  // item 1-17 = compound, 18-35 = simple
  runAllItems(h, (i) => (i < 17 ? "correct" : "wrong"));
  await fillQuestionnaire(h);

  const payload = JSON.parse(h.fetch.calls[0].opts.body);
  assert.equal(payload.compound, "17/17 (100%)");
  assert.equal(payload.simple, "0/18 (0%)");
  assert.equal(payload.total, 17);
});

test("soal yang dibiarkan kosong dihitung salah, tetap terkirim", async () => {
  const h = boot();
  await fillForm(h);
  runAllItems(h, (i) => (i === 0 ? "skip" : "correct"));
  await fillQuestionnaire(h);

  const payload = JSON.parse(h.fetch.calls[0].opts.body);
  assert.equal(payload.items.length, 35);
  assert.equal(payload.items[0].chosen, null);
  assert.equal(payload.items[0].ok, false);
  assert.equal(payload.total, 34);
});

test("timer habis otomatis pindah ke soal berikutnya", async () => {
  const h = boot();
  await fillForm(h);
  answerCurrentItem(h, "correct");
  assert.equal(h.doc.getElementById("tProgress").textContent, "Soal 1/35");
  h.clock.advance(30000);
  assert.equal(h.doc.getElementById("tProgress").textContent, "Soal 2/35");
});

test("audio gagal tetap lanjut ke tahap jawab", async () => {
  const h = boot();
  await fillForm(h);
  h.doc.getElementById("btnPlay").click();
  h.lastAudio().fail();
  const opts = h.doc.getElementById("opts").children;
  assert.equal(opts.length, 4, "opsi harus tetap muncul saat audio error");
});

test("audio hanya bisa diputar sekali per soal", async () => {
  const h = boot();
  await fillForm(h);
  const btn = h.doc.getElementById("btnPlay");
  btn.click();
  btn.click();
  btn.click();
  assert.equal(h.lastAudio().playCalls, 1);
});

test("satu attempt per WA: submit kedua diblokir", async () => {
  const storage = makeStorage();
  const h = boot({ localStorage: storage });
  await fillForm(h);
  runAllItems(h, "correct");
  await fillQuestionnaire(h);
  assert.ok(storage.getItem("oktin_done_081234567891"), "lock WA harus tersimpan");

  const h2 = boot({ localStorage: storage });
  await fillForm(h2);
  assert.equal(h2.activeScreen(), "scr-locked");
});

test("?reset=1 membuka kembali attempt yang terkunci", async () => {
  const storage = makeStorage({ "oktin_done_081234567891": "{}" });
  const h = boot({ localStorage: storage, search: "?reset=1" });
  await fillForm(h);
  assert.equal(h.activeScreen(), "scr-test");
});

test("backend error tetap menyimpan hasil lokal & memberi pesan", async () => {
  const fetch = makeFetch(async () => { throw new Error("network down"); });
  const h = boot({ fetch });
  await fillForm(h);
  runAllItems(h, "correct");
  await fillQuestionnaire(h);
  await new Promise((r) => setImmediate(r));
  assert.match(h.doc.getElementById("rSubmit").textContent, /Gagal|Salin|WhatsApp/i);
  assert.ok(h.storage.getItem("oktin_done_081234567891"));
});

test("tombol kirim ulang mengirim ulang payload yang sama", async () => {
  const h = boot();
  await fillForm(h);
  runAllItems(h, "correct");
  await fillQuestionnaire(h);
  assert.equal(h.fetch.calls.length, 1);
  h.doc.getElementById("btnRetry").click();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.fetch.calls.length, 2);
  const a = JSON.parse(h.fetch.calls[0].opts.body);
  const b = JSON.parse(h.fetch.calls[1].opts.body);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(a.questionnaire, b.questionnaire);
});

test("keluar fullscreen mencatat pelanggaran", async () => {
  const h = boot();
  await fillForm(h);
  h.doc.fullscreenElement = null;
  h.doc.dispatch("fullscreenchange");
  assert.equal(h.doc.getElementById("tViol").textContent, "⚠ 1");
});

test("pindah tab saat tes mencatat pelanggaran terkirim", async () => {
  const h = boot();
  await fillForm(h);
  h.doc.hidden = true;
  h.doc.dispatch("visibilitychange");
  h.doc.hidden = false;
  runAllItems(h, "correct");
  await fillQuestionnaire(h);
  const payload = JSON.parse(h.fetch.calls[0].opts.body);
  assert.ok(payload.violations >= 1, "minimal satu pelanggaran tab_switch");
  const types = payload.violation_log.map((v) => v.type);
  assert.ok(types.includes("tab_switch"), "tab_switch harus tercatat: " + types.join(","));
});
