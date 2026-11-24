/* Tes LIVE terhadap Google Sheets (opt-in). Menangkap bug yang tidak bisa
   ditiru stub, mis. leading zero WA yang dikonversi jadi angka oleh Sheets.
   Jalankan: LIVE=1 npm run test:live   (butuh `gws` sudah login)

   Tes ini menulis lalu menghapus datanya sendiri (diberi prefiks ZZ LIVE ...). */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const SID = process.env.SHEET_ID || "19-S1yRfQ31ezmQtK2rEYTns6MJSFaAbrEF_r25l3BqM";
const enabled = process.env.LIVE === "1";

function gws(args) {
  const out = execFileSync("gws", args, { encoding: "utf8" });
  const i = out.indexOf("{");
  if (i < 0) throw new Error("non-JSON output: " + out.slice(0, 200));
  return JSON.parse(out.slice(i));
}

function read(rng) {
  return gws(["sheets", "spreadsheets", "values", "get",
    "--params", JSON.stringify({ spreadsheetId: SID, range: rng })]).values || [];
}

const HDR_V3 = [
  "timestamp", "nama", "wa", "semester",
  "toefl_score", "toefl_type", "section_high", "section_low",
  "q01", "q02", "q03", "q04", "q05", "q06", "q07", "q08", "q09", "q10",
  "o1", "o2",
  "total", "percent", "simple", "compound",
  "duration_sec", "violations", "violation_log",
  "user_agent", "test_version",
  "items_json",
];

test("LIVE: leading zero WA tersimpan utuh di Responses", { skip: !enabled && "set LIVE=1" }, () => {
  const vals = read("Responses!C2:C1000").map((r) => r[0]).filter(Boolean).map(String);
  const bad = vals.filter((v) => /^\d{9,13}$/.test(v) && !v.startsWith("0") && v.startsWith("8"));
  assert.deepEqual(bad, [], "Responses masih menyimpan WA tanpa leading zero");
});

test("LIVE: header skema v3 (30 kolom)", { skip: !enabled && "set LIVE=1" }, () => {
  const resp = read("Responses!A1:AD1")[0] || [];
  assert.deepEqual(resp, HDR_V3);
});

test("LIVE: every baris Responses memiliki items_json dengan 35 item", { skip: !enabled && "set LIVE=1" }, () => {
  const rows = read("Responses!A2:AD2000").filter((r) => r[0]);
  const bad = rows.filter((r) => {
    const raw = r[29] || "";
    if (!raw.startsWith("[")) return true;
    try { return JSON.parse(raw).length !== 35; } catch { return true; }
  });
  assert.equal(bad.length, 0, `${bad.length} baris dengan items_json tidak valid`);
});
