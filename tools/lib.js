/* Shared helpers for the TEAS tools: read and write the question bank (data/bank.js) and describe the blueprint. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const BANK = "data/bank.js";
// Q = stand-alone questions, P = passages/data sets with their questions, D = diagrams, RG = names of diagram regions
function loadBank(root) {
  const src = fs.readFileSync(path.join(root, BANK), "utf8");
  const ctx = vm.createContext({});
  try { vm.runInContext(src + "\n;globalThis.__B={Q,P,D,RG};", ctx, { filename: BANK }); }
  catch (e) { throw new Error(`${BANK} could not be read: ${e.message}`); }
  return JSON.parse(JSON.stringify(ctx.__B));
}
// Write the bank back, one question, passage or diagram per line, so edits show up as small diffs.
function saveBank(root, B) {
  const head = fs.readFileSync(path.join(root, BANK), "utf8").match(/^\/\*[\s\S]*?\*\//);
  const arr = (n, a) => `const ${n} = [\n${a.map(x => JSON.stringify(x)).join(",\n")}\n];`;
  const obj = (n, o) => `const ${n} = {\n${Object.entries(o).map(([k, v]) => JSON.stringify(k) + ":" + JSON.stringify(v)).join(",\n")}\n};`;
  fs.writeFileSync(path.join(root, BANK), [head ? head[0] : "", arr("Q", B.Q), arr("P", B.P), obj("D", B.D), obj("RG", B.RG)].join("\n") + "\n");
}
// practice.html's own code (the bank is no longer inside it)
loadBank.code = root => fs.readFileSync(path.join(root, "practice.html"), "utf8");
// what the browser runs: the bank file, then the page's inline app script
loadBank.script = root => { const html = loadBank.code(root); const i = html.indexOf('<script>\n"use strict";'); const j = html.indexOf("</script>", i); if (i < 0) throw new Error("practice.html: app script not found"); return fs.readFileSync(path.join(root, BANK), "utf8") + "\n" + html.slice(i + 8, j); };

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
// Short fingerprint of a question's wording (same as qver() in practice.html and index.html), so stats
// collected before an edit aren't mixed with answers to the new wording.
function qver(q) { let h = 2166136261 >>> 0; const s = String(q.q) + "|" + (q.o || []).join("|"); for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
module.exports = { loadBank, saveBank, qver, SECS, AREAS, BANK };
