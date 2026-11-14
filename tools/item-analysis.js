#!/usr/bin/env node
/* Find questions that may be mis-keyed or confusing, using real (anonymous) student answers.

   node tools/item-analysis.js                    fetch the last 365 days from the stats sheet
   node tools/item-analysis.js --days 90
   node tools/item-analysis.js --file items.json  use a saved copy of <stats URL>?items=1&game=teas
   node tools/item-analysis.js --min 15           answers needed before a question is judged (default 15)

   Writes item-analysis.md in the repo folder (not committed) and prints a summary.
   The data comes from games/track.js, which Scrub In and the hub call with each answer, and the
   "items" tab of the ItsDrDan Game Stats sheet (the same Apps Script the MCAT site uses).

   Flags, for the CURRENT wording of each question only (answers to an older wording are counted separately):
     POSSIBLE MIS-KEY   multiple choice: one wrong choice is picked more often than the key
     TOO HARD           under 30% correct for multiple choice (chance is 25%), under 20% for other formats
     TOO EASY           97%+ correct with 30+ answers: the wrong choices may be implausible
     DEAD DISTRACTOR    multiple choice: a wrong choice almost nobody picks (under 3% with 40+ answers)
   A flag means "look at this question", not "this question is wrong". */
"use strict";
const fs = require("fs"), path = require("path");
const { loadBank, qver } = require("./lib");
const ROOT = path.resolve(__dirname, "..");
const STATS_URL = "https://script.google.com/macros/s/AKfycbylSKoW9GE6AkN4HiC1uts3Y5Z4oUPHY7OQ88vXrjpcanooloYRTIGW9cS5n0dulp4vQg/exec";

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const days = +opt("--days", 365), file = opt("--file", null), MIN = +opt("--min", 15);
const strip = h => String(h == null ? "" : h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function analyze(data, B) {
  const bank = new Map(B.Q.map(q => [q.id, q]));
  B.P.forEach(p => p.qs.forEach(q => bank.set(q.id, Object.assign({ _p: p.id }, q))));
  const items = Array.isArray(data) ? data : (data.items || []);
  const flags = []; let old = 0, unknown = 0, judged = 0;
  for (const it of items) {
    const q = bank.get(it.item);
    if (!q) { unknown++; continue; }
    if (it.ver && it.ver !== qver(q)) { old++; continue; }
    const n = it.n; if (n < MIN) continue;
    judged++;
    const p = it.correct / n, why = [], mc = q.type === "mc";
    if (mc) {
      const picks = it.picks || [0, 0, 0, 0], tot = picks.reduce((a, b) => a + b, 0) || 1;
      const wrong = [0, 1, 2, 3].filter(i => i !== q.a).map(i => [picks[i], i]).sort((a, b) => b[0] - a[0]);
      if (wrong[0][0] > picks[q.a]) why.push(`POSSIBLE MIS-KEY: "${strip(q.o[wrong[0][1]]).slice(0, 60)}" picked ${wrong[0][0]}× vs the key ${picks[q.a]}×`);
      if (p < 0.30) why.push(`TOO HARD: ${Math.round(p * 100)}% correct`);
      if (p >= 0.97 && n >= 30) why.push(`TOO EASY: ${Math.round(p * 100)}% correct`);
      if (tot >= 40) for (const [c, i] of wrong) if (c / tot < 0.03) why.push(`DEAD DISTRACTOR: "${strip(q.o[i]).slice(0, 50)}" (${c}/${tot})`);
    } else {
      if (p < 0.20) why.push(`TOO HARD: ${Math.round(p * 100)}% correct (${q.type})`);
      if (p >= 0.97 && n >= 30) why.push(`TOO EASY: ${Math.round(p * 100)}% correct (${q.type})`);
    }
    if (why.length) flags.push({ rank: why[0].startsWith("POSSIBLE") ? 0 : why[0].startsWith("TOO HARD") ? 1 : 2, id: it.item, n, p, sessions: it.sessions, stem: strip(q.q).slice(0, 110), why });
  }
  flags.sort((a, b) => a.rank - b.rank || b.n - a.n);
  return { items: items.length, judged, old, unknown, flags };
}

async function main() {
  const B = loadBank(ROOT);
  let data;
  if (file) data = JSON.parse(fs.readFileSync(file, "utf8"));
  else { const r = await fetch(`${STATS_URL}?items=1&game=teas&days=${days}`, { redirect: "follow" }); if (!r.ok) throw new Error("stats request failed: HTTP " + r.status); data = await r.json(); }
  const R = analyze(data, B);
  if (!R.items) { console.log("No per-question answers yet. They start arriving once students use the updated site (and not from Do-Not-Track browsers)."); return; }
  const L = [`# TEAS item analysis (${data.days || days} days, generated ${data.generated || new Date().toISOString()})`, "",
    `Questions with answers: ${R.items} · judged (${MIN}+ answers, current wording): ${R.judged} · flagged: ${R.flags.length} · ` +
    `answers to older wording (skipped): ${R.old} · IDs no longer in the bank: ${R.unknown}`, "",
    "A flag means look at the question, not that it is wrong. Check the key, the wording and any figure before editing.", "",
    "| Question | Answers | Students | Correct | Stem | Why flagged |", "|---|---|---|---|---|---|",
    ...R.flags.map(f => `| ${f.id} | ${f.n} | ${f.sessions || ""} | ${Math.round(f.p * 100)}% | ${f.stem.replace(/\|/g, "/")} | ${f.why.join("; ").replace(/\|/g, "/")} |`)];
  fs.writeFileSync(path.join(ROOT, "item-analysis.md"), L.join("\n") + "\n");
  console.log(L.slice(0, 3).join("\n") + `\nReport written to ${path.join(ROOT, "item-analysis.md")}`);
}
if (require.main === module) main().catch(e => { console.error("✗ " + e.message); process.exit(1); });
module.exports = { analyze };
