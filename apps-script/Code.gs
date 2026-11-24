/**
 * Google Sheets backend untuk tes listening Oktin — TANPA SQL.
 * Skema v3: SATU BARIS per peserta (lebar, ringkas) di sheet "Responses",
 * rincian 35 item di kolom items_json (JSON). Tidak ada lagi sheet "Items"
 * 35 baris/peserta → hemat baris & mudah diolah sampai selesai skripsi.
 *
 * SETUP (5 menit, sekali saja):
 * 1. Buka https://script.google.com -> New Project
 * 2. Hapus isi Code.gs, tempel file ini
 * 3. Run -> setup (izinkan permission akun Google)
 * 4. Deploy -> New deployment -> Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy Web App URL (…/exec) -> tempel ke site/config.js (sheetsEndpoint)
 *
 * Data masuk otomatis ke Google Sheet baru "OKTIN Listening Responses".
 */

// ================= SKEMA v3 (30 kolom) =================
var HDR_V3 = [
  "timestamp", "nama", "wa", "semester",
  "toefl_score", "toefl_type", "section_high", "section_low",
  "q01", "q02", "q03", "q04", "q05", "q06", "q07", "q08", "q09", "q10",
  "o1", "o2",
  "total", "percent", "simple", "compound",
  "duration_sec", "violations", "violation_log",
  "user_agent", "test_version",
  "items_json"
];

function setup() {
  var ss = SpreadsheetApp.create("OKTIN Listening Responses");
  var sh = ss.getSheets()[0];
  sh.appendRow(HDR_V3);
  PropertiesService.getScriptProperties().setProperty("RESPONSE_SS_ID", ss.getId());
  Logger.log("Sheet dibuat: " + ss.getUrl());
}

// init otomatis saat POST pertama (tanpa setup manual)
function setupSilent() {
  var ss = SpreadsheetApp.create("OKTIN Listening Responses");
  ss.getSheets()[0].appendRow(HDR_V3);
  PropertiesService.getScriptProperties().setProperty("RESPONSE_SS_ID", ss.getId());
  return ss.getId();
}

// normalisasi nomor WA: buang non-digit, konversi 62 -> 0, seragamkan ke 08xx
function normWa(v) {
  var s = String(v == null ? "" : v).replace(/\D/g, "");
  if (s.indexOf("62") === 0) s = "0" + s.substring(2);
  if (s.indexOf("0") !== 0) s = "0" + s;
  return s;
}

// paksa kolom WA jadi teks agar leading zero tidak hilang (Responses kolom 3)
function forceTextWa(sh, col, label) {
  try {
    sh.getRange(1, col, Math.max(sh.getMaxRows(), 1), 1).setNumberFormat("@");
    if (label) {
      var cur = sh.getRange(1, col, 1, 1).getValues()[0][0];
      if (String(cur) !== label) sh.getRange(1, col).setValue(label);
    }
  } catch (ignored) {}
}

// migrasi header skema lama -> v3 (sekaligus geser data lama)
function ensureV3(sh) {
  var cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (cur.join("|") === HDR_V3.join("|")) return;

  var n = sh.getLastRow();
  var rows = [];
  if (n >= 2) rows = sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();

  var hasComplex = cur.indexOf("complex") !== -1 || cur.indexOf("q_likert_1to5") !== -1;
  var v2 = cur.length >= 13 && cur[7] === "compound" && cur[8] === "duration_sec";

  sh.getRange(1, 1, 1, sh.getLastColumn()).clearContent();
  sh.getRange(1, 1, 1, HDR_V3.length).setValues([HDR_V3]);
  if (rows.length === 0) return;

  var out = rows.map(function (r) {
    var x = r.slice();
    while (x.length < 18) x.push("");
    var row = new Array(HDR_V3.length).fill("");
    row[0] = x[0]; // timestamp
    row[1] = x[1]; // nama
    row[2] = x[2]; // wa
    row[3] = x[3]; // semester
    row[20] = x[4]; // total
    row[21] = x[5]; // percent
    row[22] = x[6]; // simple
    if (hasComplex) {
      // v1: compound ada di kolom 7 (complex) -> kosongkan, pakai 7 sbg compound? -> biarkan kosong
      row[24] = x[10]; row[25] = x[11]; row[26] = x[12];
      row[27] = x[16]; row[28] = x[17];
    } else if (v2) {
      row[23] = x[7]; // compound
      row[24] = x[8]; row[25] = x[9]; row[26] = x[10];
      row[27] = x[11]; row[28] = x[12];
    }
    return row;
  });
  sh.getRange(2, 1, out.length, HDR_V3.length).setValues(out);
}

function doPost(e) {
  try {
    var d;
    try {
      d = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut({ ok: false, error: "invalid_json" });
    }
    if (!d || typeof d !== "object") return jsonOut({ ok: false, error: "invalid_payload" });
    if (!d.meta || !d.meta.finished_at) return jsonOut({ ok: false, error: "missing_meta" });
    if (!Array.isArray(d.items)) return jsonOut({ ok: false, error: "missing_items" });

    var ssId = PropertiesService.getScriptProperties().getProperty("RESPONSE_SS_ID");
    if (!ssId) ssId = setupSilent();
    var ss = SpreadsheetApp.openById(ssId);
    var sh = ss.getSheetByName("Responses") || ss.insertSheet("Responses");
    ensureV3(sh);

    // kolom WA dipaksa teks setelah header final
    forceTextWa(sh, 3, "wa");

    // satu attempt per nomor WA
    var waNorm = normWa(d.wa);
    if (!waNorm) return jsonOut({ ok: false, reason: "invalid_wa" });
    var lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      var waCol = sh.getRange(2, 3, lastRow - 1, 1).getValues().flat().map(normWa);
      if (waCol.indexOf(waNorm) !== -1) return jsonOut({ ok: false, reason: "duplicate_wa" });
    }

    // ---- kuesioner (opsional; kosong bila belum dikirim) ----
    var qn = (d.questionnaire && typeof d.questionnaire === "object") ? d.questionnaire : {};
    var qArr = Array.isArray(d.q) ? d.q : (Array.isArray(qn.q) ? qn.q : []);
    var q = [];
    for (var i = 0; i < 10; i++) q.push(qArr[i] == null ? "" : qArr[i]);
    var o1 = d.o1 != null ? d.o1 : (qn.o1 != null ? qn.o1 : "");
    var o2 = d.o2 != null ? d.o2 : (qn.o2 != null ? qn.o2 : "");

    // ---- rincian item -> satu kolom JSON (ringkas) ----
    var itemsJson = JSON.stringify(d.items.map(function (it) {
      return { i: it.id, t: it.type, c: it.chosen == null ? "" : it.chosen, k: it.ok ? 1 : 0 };
    }));

    var row = [
      d.meta.finished_at, d.nama, String(waNorm), d.semester,
      d.toefl_score != null ? d.toefl_score : "",
      d.toefl_type != null ? d.toefl_type : "",
      d.section_high != null ? d.section_high : "",
      d.section_low != null ? d.section_low : "",
      q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], q[9],
      o1, o2,
      d.total, d.percent, d.simple, d.compound,
      d.duration_sec, d.violations, JSON.stringify(d.violation_log),
      d.meta.ua, d.meta.test,
      itemsJson
    ];

    var respRow = sh.getLastRow() + 1;
    sh.getRange(respRow, 1, 1, HDR_V3.length).setValues([row]);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet() { return jsonOut({ ok: true, service: "oktin-listening", time: new Date() }); }

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
