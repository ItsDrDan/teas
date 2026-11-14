/* Shared helpers for the TEAS tools: read the bank out of practice.html and describe the blueprint. */
"use strict";
const fs = require("fs"), path = require("path");

// The bank lives in practice.html as four one-line constants.
const NAMES = ["Q", "P", "D", "RG"];
function loadBank(root) {
  const lines = fs.readFileSync(path.join(root, "practice.html"), "utf8").split("\n");
  const out = {};
  for (const n of NAMES) {
    const pre = "const " + n + " = ";
    const l = lines.find(x => x.startsWith(pre));
    if (!l) throw new Error(`practice.html: line "${pre}…" not found`);
    try { out[n] = JSON.parse(l.slice(pre.length).replace(/;\s*$/, "")); }
    catch (e) { throw new Error(`practice.html: ${n} is not valid JSON (${e.message})`); }
  }
  return out;
}
// practice.html without the data lines (for link checks and for running the engine)
loadBank.code = root => fs.readFileSync(path.join(root, "practice.html"), "utf8").split("\n").filter(l => !NAMES.some(n => l.startsWith("const " + n + " = "))).join("\n");
// the page's inline app script, data included
loadBank.script = root => { const html = fs.readFileSync(path.join(root, "practice.html"), "utf8"); const i = html.indexOf('<script>\n"use strict";'); const j = html.indexOf("</script>", i); if (i < 0) throw new Error("practice.html: app script not found"); return html.slice(i + 8, j); };

// ATI TEAS 7: items, scored items and minutes per section; scored items per content area.
const SECS = {
  rd: { name: "Reading", units: 10, items: 45, scored: 39, min: 55 },
  ma: { name: "Math", units: 10, items: 38, scored: 34, min: 57 },
  sc: { name: "Science", units: 19, items: 50, scored: 44, min: 60 },
  en: { name: "English", units: 8, items: 37, scored: 33, min: 37 }
};
const AREAS = {
  rd: [["Key ideas & details", 15, [1, 2, 3, 4]], ["Craft & structure", 9, [5, 6, 7]], ["Integration of knowledge & ideas", 15, [8, 9, 10]]],
  ma: [["Numbers & algebra", 18, [1, 2, 3, 4, 5, 6]], ["Measurement & data", 16, [7, 8, 9, 10]]],
  sc: [["Human anatomy & physiology", 18, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]], ["Biology", 9, [11, 12, 13, 19]], ["Chemistry", 8, [14, 15, 16]], ["Scientific reasoning", 9, [17, 18]]],
  en: [["Conventions of standard English", 12, [1, 2, 3]], ["Knowledge of language", 11, [4, 5, 6]], ["Vocabulary in writing", 10, [7, 8]]]
};
module.exports = { loadBank, SECS, AREAS };
