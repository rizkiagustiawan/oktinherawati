/* Kontrak backend Code.gs v3: SATU BARIS per peserta di sheet "Responses"
   (30 kolom, termasuk kolom items_json). Tidak ada lagi sheet "Items". */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./helpers/gas-harness");
const { loadData } = require("./helpers/app-harness");

const SS_ID = "SS_TEST_1";

const HDR_V3 = [
  "timestamp", "nama", "wa", "semester",
  "toefl_score", "toefl_type", "section_high", "section_low",
  "q01", "q02", "q03", "q04", "q05", "q06", "q07", "q08", "q09", "q10",
  "o1", "o2",
  "total", "percent", "simple", "compound",
  "duration_sec", "violations", "violation_log",
  "user_agent", "test_version",
  "items_json"
];

function payload(over) {
  const data = loadData();
  const items = data.items.map((i) => ({
    id: i.id, type: i.sentence_type, chosen: i.key, correct: i.key, ok: true,
  }));
  return Object.assign({
    nama: "Peserta Uji",
    wa: "081234567890",
    semester: 5,
    toefl_score: 470,
    toefl_type: "ITP/PBT",
    section_high: "Reading",
    section_low: "Listening",
    q: [1, 2, 3, 4, 5, 4, 3, 2, 1, 2],
    o1: "Compound lebih sulit",
    o2: "Audio lebih pelan",
    total: 35,
    percent: 100,
    simple: "18/18 (100%)",
    compound: "17/17 (100%)",
    duration_sec: 300,
    violations: 0,
    violation_log: [],
    items,
    meta: { ua: "ua-test", finished_at: "2026-11-04T00:00:00.000Z", test: "v2 (35 items)" },
  }, over || {});
}

function fresh(over) {
  return boot(Object.assign({
    props: { RESPONSE_SS_ID: SS_ID },
    existingSheets: {
      [SS_ID]: { Responses: [] },
    },
  }, over || {}));
}

function itemsJson(row) {
  return JSON.parse(row[29]);
}

test("doGet health mengembalikan ok:true", () => {
  const h = fresh();
  const res = h.get();
  assert.equal(res.ok, true);
  assert.equal(res.service, "oktin-listening");
});

test("endpoint debug sudah tidak ada di produksi", () => {
  const h = fresh();
  const res = h.get({ diag: "1" });
  assert.equal(res.ok, true);
  assert.equal(res.ssId, undefined, "diag harus sudah dihapus");
  assert.equal(h.get({ purge: "ZZ" }).purged, undefined);
  assert.equal(h.get({ resetItems: "1" }).itemsCleared, undefined);
});

test("doPost menyimpan SATU baris Responses lengkap (v3, 30 kolom)", () => {
  const h = fresh();
  const res = h.post(payload());
  assert.deepEqual(res, { ok: true });

  const sh = h.sheet(SS_ID, "Responses");
  assert.equal(sh.getLastRow(), 2, "header + 1 data");
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  assert.deepEqual(header, HDR_V3);

  const row = sh.getRange(2, 1, 1, 30).getValues()[0];
  assert.equal(row[0], "2026-11-04T00:00:00.000Z");
  assert.equal(row[1], "Peserta Uji");
  assert.equal(row[2], "081234567890");
  assert.equal(row[3], 5);
  assert.equal(row[4], 470);
  assert.equal(row[5], "ITP/PBT");
  assert.equal(row[6], "Reading");
  assert.equal(row[7], "Listening");
  assert.equal(row[8], 1); // q01
  assert.equal(row[18], "Compound lebih sulit"); // o1
  assert.equal(row[19], "Audio lebih pelan"); // o2
  assert.equal(row[20], 35);
  assert.equal(row[21], 100);
  assert.equal(row[22], "18/18 (100%)");
  assert.equal(row[23], "17/17 (100%)");
  assert.equal(row[24], 300);
  assert.equal(row[25], 0);
  assert.equal(row[28], "v2 (35 items)");

  const parsed = itemsJson(row);
  assert.equal(parsed.length, 35);
  assert.equal(parsed[0].i, 1);
  assert.equal(parsed[0].k, 1);
  assert.equal(parsed[34].i, 35);
});

test("rincian 35 item tersimpan dalam satu kolom items_json", () => {
  const h = fresh();
  h.post(payload());
  const sh = h.sheet(SS_ID, "Responses");
  const row = sh.getRange(2, 1, 1, 30).getValues()[0];
  const parsed = itemsJson(row);
  assert.equal(parsed.length, 35);
  const ids = parsed.map((x) => x.i);
  assert.deepEqual(ids, Array.from({ length: 35 }, (_, i) => i + 1));
  assert.equal(parsed.every((x) => typeof x.t === "string"), true);
});

test("dari payload frontend nyata, semua item tersimpan tanpa ada yang hilang", () => {
  const h = fresh();
  const p = payload();
  p.items[0].ok = false;
  p.items[0].chosen = null;
  p.items[1].chosen = null;
  p.items[1].ok = false;
  h.post(p);
  const sh = h.sheet(SS_ID, "Responses");
  const row = sh.getRange(2, 1, 1, 30).getValues()[0];
  const parsed = itemsJson(row);
  assert.equal(parsed.length, 35);
  assert.equal(parsed.filter((x) => x.k === 1).length, 33);
  assert.equal(parsed.filter((x) => x.k !== 1).length, 2);
});

test("dedup: WA sama ditolak", () => {
  const h = fresh();
  assert.deepEqual(h.post(payload()), { ok: true });
  assert.deepEqual(h.post(payload()), { ok: false, reason: "duplicate_wa" });
  assert.equal(h.sheet(SS_ID, "Responses").getLastRow(), 2);
});

test("dedup lintas format: 08xx, 628xx, +62 semuanya dianggap sama", () => {
  const h = fresh();
  assert.equal(h.post(payload({ wa: "081234567890" })).ok, true);
  assert.equal(h.post(payload({ wa: "6281234567890" })).reason, "duplicate_wa");
  assert.equal(h.post(payload({ wa: "+62 812-3456-7890" })).reason, "duplicate_wa");
  assert.equal(h.post(payload({ wa: "81234567890" })).reason, "duplicate_wa");
  assert.equal(h.sheet(SS_ID, "Responses").getLastRow(), 2);
});

test("WA disimpan dalam format 08xx (leading zero tidak hilang)", () => {
  const h = fresh();
  h.post(payload({ wa: "6281234567890" }));
  const wa = h.sheet(SS_ID, "Responses").getRange(2, 3, 1, 1).getValues()[0][0];
  assert.equal(wa, "081234567890");
});

test("WA berbeda diterima", () => {
  const h = fresh();
  assert.equal(h.post(payload({ wa: "081200000001" })).ok, true);
  assert.equal(h.post(payload({ wa: "081200000002" })).ok, true);
  assert.equal(h.sheet(SS_ID, "Responses").getLastRow(), 3);
});

test("payload rusak mengembalikan error, tidak membuat baris", () => {
  const h = fresh();
  const res = h.post({ nama: "x" });
  assert.equal(res.ok, false);
  assert.match(res.error, /missing_meta/);
  assert.equal(h.sheet(SS_ID, "Responses").getLastRow(), 0, "tidak boleh ada baris header pun");
});

test("items non-array ditolak", () => {
  const h = fresh();
  const res = h.post(Object.assign(payload(), { items: "bukan-array" }));
  assert.equal(res.ok, false);
  assert.match(res.error, /missing_items/);
  assert.equal(h.sheet(SS_ID, "Responses").getLastRow(), 0);
});

test("sheet baru dibuat otomatis bila belum ada (tanpa setup manual)", () => {
  const h = boot({ props: {}, existingSheets: {} });
  const res = h.post(payload());
  assert.deepEqual(res, { ok: true });
  assert.equal(h.created(), 1);
  const id = h.props.get("RESPONSE_SS_ID");
  assert.ok(id, "RESPONSE_SS_ID harus disimpan");
  assert.equal(h.sheet(id, "Responses").getLastRow(), 2);
});

test("header skema lama (complex/deixis/q_*) dimigrasi otomatis ke v3", () => {
  const legacyHeader = [
    "timestamp", "nama", "wa", "semester", "total", "percent",
    "simple", "complex", "deixis", "reference",
    "duration_sec", "violations", "violation_log",
    "q_likert_1to5", "q_factors", "q_hardest",
    "user_agent", "test_version",
  ];
  const legacyRow = [
    "old-ts", "Lama", "081299999999", 4, 30, 100,
    "15/15 (100%)", "15/15 (100%)", "8/8 (100%)", "8/8 (100%)",
    200, 0, "[]", "[1,2,3]", "[]", "Simple", "ua-old", "v1",
  ];
  const h = boot({
    props: { RESPONSE_SS_ID: SS_ID },
    existingSheets: { [SS_ID]: { Responses: [legacyHeader, legacyRow] } },
  });

  h.post(payload({ wa: "081200000009" }));

  const sh = h.sheet(SS_ID, "Responses");
  const header = sh.getRange(1, 1, 1, 30).getValues()[0];
  assert.deepEqual(header, HDR_V3);

  const migrated = sh.getRange(2, 1, 1, 30).getValues()[0];
  assert.equal(migrated[1], "Lama");
  assert.equal(migrated[22], "15/15 (100%)");
  assert.equal(migrated[27], "ua-old");
  assert.equal(sh.getLastRow(), 3, "baris lama tetap ada + 1 baru");
});

test("100 submit berurutan semuanya masuk (tidak ada yang hilang)", () => {
  const h = fresh();
  for (let i = 0; i < 100; i++) {
    const wa = "0812000" + String(10000 + i);
    const res = h.post(payload({ wa, total: i, percent: i }));
    assert.equal(res.ok, true, "submit ke-" + i + " gagal: " + JSON.stringify(res));
  }
  assert.equal(h.sheet(SS_ID, "Responses").getLastRow(), 101);
});
