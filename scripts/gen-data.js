/* Regenerasi site/data.js dari items.json (single source of truth).
   Jalankan: bun scripts/gen-data.js
   - menambahkan path audio per item (audio/itemNN.mp3)
   - menyalin questionnaire, introUrl, answerSeconds
   Format output: window.TEST_DATA = {...}; (compact JSON, satu baris)
*/
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const itemsPath = path.join(root, "items.json");
const outPath = path.join(root, "site", "data.js");

const src = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
const data = {
  items: src.items.map((it) => ({
    ...it,
    audio: `audio/item${String(it.id).padStart(2, "0")}.mp3`,
  })),
  questionnaire: src.questionnaire,
  introUrl: "audio/intro.mp3",
  answerSeconds: 30,
};

fs.writeFileSync(outPath, "window.TEST_DATA = " + JSON.stringify(data) + ";\n");
console.log("OK -> site/data.js (" + data.items.length + " items, questionnaire: " + (data.questionnaire ? "ada" : "null") + ")");
