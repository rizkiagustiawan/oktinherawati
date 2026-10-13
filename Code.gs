/**
 * Google Sheets backend untuk tes listening Oktin — TANPA SQL.
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
function setup() {
  const ss = SpreadsheetApp.create("OKTIN Listening Responses");
  const sh = ss.getSheets()[0];
  sh.appendRow([
    "timestamp", "nama", "wa", "semester", "total", "percent",
    "simple", "complex", "deixis", "reference",
    "duration_sec", "violations", "violation_log",
    "q_likert_1to5", "q_factors", "q_hardest",
    "user_agent", "test_version"
  ]);
  Logger.log("Sheet dibuat: " + ss.getUrl());
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName("Responses") || ss.insertSheet("Responses");
    if (sh.getLastRow() === 0) {
      sh.appendRow([
        "timestamp", "nama", "wa", "semester", "total", "percent",
        "simple", "complex", "deixis", "reference",
        "duration_sec", "violations", "violation_log",
        "q_likert_1to5", "q_factors", "q_hardest",
        "user_agent", "test_version"
      ]);
    }
    // satu attempt per nomor WA
    const waCol = sh.getRange(2, 3, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat().map(String);
    if (waCol.includes(String(d.wa))) {
      return jsonOut({ ok: false, reason: "duplicate_wa" });
    }
    sh.appendRow([
      d.meta.finished_at, d.nama, d.wa, d.semester, d.total, d.percent,
      d.simple, d.complex, d.deixis, d.reference,
      d.duration_sec, d.violations, JSON.stringify(d.violation_log),
      JSON.stringify(d.questionnaire.likert_1to5),
      JSON.stringify(d.questionnaire.factors), d.questionnaire.hardest,
      d.meta.ua, d.meta.test
    ]);
    // rincian per item ke sheet kedua
    let shi = ss.getSheetByName("Items") || ss.insertSheet("Items");
    if (shi.getLastRow() === 0) {
      shi.appendRow(["nama", "wa", "item_id", "type", "focus", "chosen", "correct", "ok"]);
    }
    d.items.forEach(function (it) {
      shi.appendRow([d.nama, d.wa, it.id, it.type, it.focus, it.chosen || "", it.correct, it.ok ? 1 : 0]);
    });
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
