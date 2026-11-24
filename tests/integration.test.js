/* Integrasi: payload yang DIHASILKAN frontend (app.js) harus diterima &
   tersimpan penuh oleh backend (Code.gs). Ini menjawab kekhawatiran utama:
   "jangan sampai data tidak masuk ke database ketika user menyelesaikan semua soal". */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { boot: bootFrontend } = require("./helpers/app-harness");
const { boot: bootBackend } = require("./helpers/gas-harness");

function seedBackend() {
  return bootBackend({ props: {}, existingSheets: {} });
}

test("payload frontend nyata -> backend menyimpan semua 35 item + kuesioner", async () => {
  const fe = bootFrontend();
  const { fillForm, fillQuestionnaire, runAllItems } = require("./helpers/app-harness");
  await fillForm(fe);
  runAllItems(fe, "correct");
  await fillQuestionnaire(fe);

  // ambil payload persis yang dikirim frontend
  assert.equal(fe.fetch.calls.length, 1);
  const payload = JSON.parse(fe.fetch.calls[0].opts.body);

  // payload membawa data latar ITP + kuesioner
  assert.equal(payload.toefl_score, 470);
  assert.equal(payload.toefl_type, "ITP / Paper-Based Test (PBT)");
  assert.equal(payload.section_high, "Reading");
  assert.equal(payload.section_low, "Listening");
  assert.equal(payload.questionnaire.q.length, 10);
  assert.equal(payload.questionnaire.o1.length > 0, true);

  // kirim ke backend kosong (auto-setup)
  const be = seedBackend();
  const bePayload = JSON.parse(JSON.stringify(payload));
  const res = be.post(bePayload);
  assert.deepEqual(res, { ok: true });

  const id = be.props.get("RESPONSE_SS_ID");
  assert.ok(id, "backend harus menyimpan sheet id");

  assert.equal(be.sheet(id, "Responses").getLastRow(), 2);
  const row = be.sheet(id, "Responses").getRange(2, 1, 1, 30).getValues()[0];

  // data latar ITP (kolom 5-8) & kuesioner (kolom 9-20)
  assert.equal(row[4], 470, "toefl_score");
  assert.equal(row[5], "ITP / Paper-Based Test (PBT)", "toefl_type");
  assert.equal(row[6], "Reading", "section_high");
  assert.equal(row[7], "Listening", "section_low");
  assert.equal(row[8], 1, "q01");
  assert.equal(row[17], 5, "q10");
  assert.equal(row[18], "Compound sentences are harder to understand.", "o1");
  assert.equal(row[19], "Speak a bit slower.", "o2");

  const parsed = JSON.parse(row[29]);
  assert.equal(parsed.length, 35, "items_json memuat 35 item");
  assert.equal(parsed[0].i, 1);
  assert.equal(parsed[0].k, 1);
});

test("seluruh 35 mahasiswa (subjek penelitian) mengalir ke sheet tanpa ada yang hilang", async () => {
  const { makeClock, boot } = require("./helpers/app-harness");
  const be = seedBackend();
  const received = [];

  for (let s = 0; s < 35; s++) {
    const fe = boot({
      clock: makeClock(),
      fetch: async (url, opts) => {
        received.push({ url, body: opts.body });
        return { ok: true, status: 200 };
      },
    });
    const { fillForm, fillQuestionnaire, runAllItems } = require("./helpers/app-harness");
    await fillForm(fe, { wa: "08" + String(120000000 + s) });
    runAllItems(fe, (i) => (i % 3 === 0 ? "wrong" : "correct"));
    await fillQuestionnaire(fe);

    const payload = JSON.parse(received[received.length - 1].body);
    const res = be.post(payload);
    assert.deepEqual(res, { ok: true }, "siswa " + (s + 1) + ": " + JSON.stringify(res));
  }

  const id = be.props.get("RESPONSE_SS_ID");
  assert.equal(be.sheet(id, "Responses").getLastRow(), 36, "header + 35 mahasiswa");

  // spot-check: baris peserta pertama & ke-35 memuat 35 item di items_json
  for (const r of [2, 36]) {
    const row = be.sheet(id, "Responses").getRange(r, 1, 1, 30).getValues()[0];
    const parsed = JSON.parse(row[29]);
    assert.equal(parsed.length, 35);
  }
});

test("skor per tipe dari frontend konsisten dgn hitungan backend", async () => {
  const be = seedBackend();
  const fe = bootFrontend();
  const { fillForm, fillQuestionnaire, runAllItems } = require("./helpers/app-harness");
  await fillForm(fe);
  runAllItems(fe, "correct");
  await fillQuestionnaire(fe);

  const payload = JSON.parse(fe.fetch.calls[0].opts.body);
  assert.equal(payload.simple, "18/18 (100%)");
  assert.equal(payload.compound, "17/17 (100%)");

  const res = be.post(payload);
  assert.equal(res.ok, true);
  const id = be.props.get("RESPONSE_SS_ID");
  const row = be.sheet(id, "Responses").getRange(2, 1, 1, 30).getValues()[0];
  assert.equal(row[22], "18/18 (100%)", "kolom simple");
  assert.equal(row[23], "17/17 (100%)", "kolom compound");
});