#!/usr/bin/env node
/* TEAS Study Hub validator. No dependencies.
   node tools/validate.js            errors + warnings (exit 1 on any error)
   node tools/validate.js --report   also prints blueprint coverage tables
   node tools/validate.js --quiet    errors only
   Every message starts with the item id (or file) so it can be found and fixed. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { loadBank, SECS, AREAS } = require("./lib");
const args = new Set(process.argv.slice(2));
const errors = [], warns = [];
const E = (id, m) => errors.push(`${id}: ${m}`);
const W = (id, m) => warns.push(`${id}: ${m}`);
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));

const { Q, P, D, RG } = loadBank(ROOT);
const ALL = Q.concat(P.flatMap(p => p.qs.map(q => Object.assign({ _p: p.id }, q))));
const strip = s => String(s == null ? "" : s).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const norm = s => strip(s).toLowerCase().replace(/[^a-z0-9%./ ]+/g, " ").replace(/\s+/g, " ").trim();
const exact = s => strip(s).replace(/\s+/g, " "); // punctuation, case and signs matter when comparing options

/* ---------- 1. ids and tags ---------- */
const seen = new Map();
for (const q of ALL) {
  if (!q.id) { E("(no id)", "item without an id: " + strip(q.q).slice(0, 60)); continue; }
  if (seen.has(q.id)) E(q.id, "duplicate id");
  seen.set(q.id, q);
  if (!SECS[q.sec]) { E(q.id, `unknown section "${q.sec}"`); continue; }
  if (!(Number.isInteger(q.unit) && q.unit >= 1 && q.unit <= SECS[q.sec].units)) E(q.id, `unit ${q.unit} is outside ${q.sec} (1-${SECS[q.sec].units})`);
  if (!["E", "M", "H"].includes(q.lv)) E(q.id, `level "${q.lv}" is not E, M or H`);
  if (!["mc", "ms", "fib", "ord", "hs"].includes(q.type)) E(q.id, `unknown type "${q.type}"`);
  if (!strip(q.q)) E(q.id, "empty question stem");
  if (!Array.isArray(q.e) || !q.e.length || q.e.some(x => !strip(x))) E(q.id, "missing or empty explanation steps");
}
for (const p of P) {
  if (seen.has(p.id)) E(p.id, "passage id collides with a question id");
  if (!SECS[p.sec]) E(p.id, "passage has unknown section");
  if (!strip(p.text) || !strip(p.title)) E(p.id, "passage has no title or text");
  if (!Array.isArray(p.qs) || p.qs.length < 2) E(p.id, "passage has fewer than 2 questions");
  for (const q of p.qs) if (q.sec !== p.sec) E(q.id, `question section ${q.sec} differs from its passage (${p.sec})`);
}

/* ---------- 2. per-type integrity ---------- */
const imgRefs = new Set();
const collectImgs = (id, html) => { for (const m of String(html || "").matchAll(/(?:href|src)="(assets\/[^"]+)"/g)) { imgRefs.add(m[1]); if (!exists(m[1])) E(id, `missing image ${m[1]}`); } };
const hsRegions = html => [...new Set([...String(html || "").matchAll(/data-hs="([^"]+)"/g)].map(m => m[1]))];
const numRe = /^-?(\d+\.?\d*|\.\d+)$/;
const parseNum = s => { s = String(s).trim().replace(/[−–]/g, "-").replace(/,/g, "").replace(/^\$/, "").replace(/%$/, ""); let m = s.match(/^(-?\d+)\s+(\d+)\/(\d+)$/); if (m) return (+m[1]) + (m[1].startsWith("-") ? -1 : 1) * (+m[2] / +m[3]); m = s.match(/^(-?\d*\.?\d+)\/(\d*\.?\d+)$/); if (m) return +m[1] / +m[2]; return numRe.test(s) ? parseFloat(s) : null; };

for (const q of ALL) {
  const t = q.type, o = q.o || [];
  collectImgs(q.id, q.fig); collectImgs(q.id, q.hx); collectImgs(q.id, q.q);
  if (t === "mc" || t === "ms") {
    if (t === "mc" && o.length !== 4) (o.length === 3 && o.every(x => /^[A-F]$/.test(strip(x))) ? W : E)(q.id, `multiple choice has ${o.length} options (TEAS uses 4)`);
    if (t === "ms" && (o.length < 4 || o.length > 6)) W(q.id, `select-all has ${o.length} options`);
    const no = o.map(exact);
    no.forEach((x, i) => { if (!x && !/<svg|<img/.test(o[i])) E(q.id, `option ${i + 1} is empty`); if (x && no.indexOf(x) !== i) E(q.id, `options ${no.indexOf(x) + 1} and ${i + 1} are the same: "${strip(o[i])}"`); });
    // numerically equal options (0.5 vs 1/2 vs 50%) are legitimate only when the stem asks for a form
    if (t === "mc") { if (!(Number.isInteger(q.a) && q.a >= 0 && q.a < o.length)) E(q.id, `answer index ${JSON.stringify(q.a)} is not one of the options`); }
    else {
      if (!Array.isArray(q.a) || !q.a.length) E(q.id, "select-all has no keyed answers");
      else {
        if (new Set(q.a).size !== q.a.length) E(q.id, "select-all key lists an option twice");
        if (q.a.some(i => !(Number.isInteger(i) && i >= 0 && i < o.length))) E(q.id, "select-all key points outside the options");
        if (q.a.length === o.length) W(q.id, "select-all keys every option");
        if (q.a.length === 1) W(q.id, "select-all has only one correct option");
      }
    }
    if (q.w) {
      if (q.w.length !== o.length) E(q.id, `"why wrong" notes (${q.w.length}) don't line up with options (${o.length})`);
      const right = t === "mc" ? [q.a] : (q.a || []);
      q.w.forEach((x, i) => { if (right.includes(i) && strip(x)) E(q.id, `a "why this is wrong" note is attached to correct option ${i + 1}`); if (!right.includes(i) && !strip(x)) W(q.id, `distractor ${i + 1} has no "why wrong" note`); });
    } else W(q.id, "no per-choice notes (w)");
    // shuffle hazards
    const lettered = o.every(x => /^[A-F]$/.test(strip(x)));
    o.forEach((x, i) => { if (/\b(all|none) of the above\b|\bboth [A-D] and [A-D]\b|\b[A-D] and [A-D] only\b/i.test(strip(x))) E(q.id, `option ${i + 1} ("${strip(x)}") depends on choice order, but choices are shuffled`); });
    if (!lettered) for (const [k, txt] of [["explanation", (q.e || []).join(" ")], ["notes", (q.w || []).join(" ")], ["tip", q.t || ""], ["stem", q.q]]) {
      const m = strip(txt).match(/\b(?:choices?|options?|answers?)\s+\(?[A-D]\)?(?=[\s.,;:)]|$)/);
      if (m) E(q.id, `${k} refers to a fixed letter ("${m[0]}"), but choices are shuffled`);
    }
  }
  if (t === "fib") {
    if (!Array.isArray(q.a) || !q.a.length || q.a.some(a => !String(a).trim())) { E(q.id, "fill-in has no accepted answer"); continue; }
    const nums = q.a.map(parseNum);
    if (nums.some(n => n !== null) && nums.some(n => n === null)) W(q.id, `accepted answers mix numbers and text: ${JSON.stringify(q.a)}`);
    const nn = nums.filter(n => n !== null);
    if (nn.length > 1 && nn.some(n => Math.abs(n - nn[0]) > 1e-9 + Math.abs(nn[0]) * 1e-6)) W(q.id, `accepted numeric answers differ in value: ${JSON.stringify(q.a)} (intended only when rounding is ambiguous)`);
    for (const k of Object.keys(q.mx || {})) if (!strip(q.mx[k])) E(q.id, `slip note for "${k}" is empty`); // whether a slip note collides with a right answer is tested with the real grader in tools/test-engine.js
    if (nn.length && !q.u && !/\b(round|nearest|decimal|whole number|percent|fraction|how many|what is|value|type|enter)\b/i.test(strip(q.q))) W(q.id, "numeric fill-in with no unit label and no format instruction in the stem");
  }
  if (t === "ord") {
    if (o.length < 3) E(q.id, `ordered response has only ${o.length} items`);
    const no = o.map(exact); no.forEach((x, i) => { if (no.indexOf(x) !== i) E(q.id, `ordered items ${no.indexOf(x) + 1} and ${i + 1} are identical`); });
    if (q.a != null) W(q.id, "ordered response carries an 'a' field; the authored order is the key");
  }
  if (t === "hs") {
    let regs;
    if (q.hx) regs = hsRegions(q.hx);
    else if (q.dg) {
      if (!D[q.dg]) { E(q.id, `diagram "${q.dg}" does not exist`); continue; }
      regs = hsRegions(D[q.dg].svg);
      if (RG[q.dg]) { if (!RG[q.dg][q.a]) W(q.id, `no region name for the keyed spot "${q.a}"`); }
      else W(q.id, `diagram ${q.dg} has no region names for feedback`);
    } else { E(q.id, "hot spot has neither a diagram (dg) nor inline figure (hx)"); continue; }
    if (regs.length < 2) E(q.id, `hot spot has ${regs.length} clickable region(s)`);
    if (!regs.includes(q.a)) E(q.id, `keyed spot "${q.a}" is not a clickable region (regions: ${regs.join(", ")})`);
    for (const k of Object.keys(q.wh || {})) { if (!regs.includes(k)) E(q.id, `wrong-spot note "${k}" is not a region`); if (k === q.a) E(q.id, "wrong-spot note is attached to the correct spot"); }
    if (q.hx && q.hx.startsWith("<svg") && !/role="img"|aria-label|<title>/.test(q.hx)) W(q.id, "inline hot-spot figure has no accessible name");
  }
  if (q.dg) { if (!D[q.dg]) E(q.id, `diagram "${q.dg}" does not exist`); if (!["none", "names", "letters"].includes(q.show)) E(q.id, `diagram label mode "${q.show}" is not none, names or letters`); }
  if (q.fig && /<svg/.test(q.fig) && !/role="img"|aria-label|<title>/.test(q.fig)) W(q.id, "figure has no accessible name (aria-label or <title>)");
  // unbalanced markup shows up as broken layout
  for (const [k, txt] of [["stem", q.q], ["explanation", (q.e || []).join(" ")], ["options", o.join(" ")]]) {
    for (const tag of ["b", "i", "sub", "sup", "u", "table", "span"]) {
      const op = (String(txt).match(new RegExp("<" + tag + "(\\s[^>]*)?>", "g")) || []).length, cl = (String(txt).match(new RegExp("</" + tag + ">", "g")) || []).length;
      if (op !== cl) E(q.id, `${k} has unbalanced <${tag}> tags (${op} open, ${cl} close)`);
    }
  }
}
/* ---------- 3. diagrams ---------- */
for (const [k, d] of Object.entries(D)) {
  collectImgs("diagram " + k, d.svg);
  if (!strip(d.title)) E("diagram " + k, "no title (used as its accessible name)");
  if (/OpenStax/.test(d.svg + (d.art || "")) && !/OpenStax .+\(CC BY/.test(d.credit || "")) W("diagram " + k, "looks OpenStax-derived but has no license credit");
  const regs = hsRegions(d.svg);
  for (const r of Object.keys(RG[k] || {})) if (!regs.includes(r)) W("diagram " + k, `region name "${r}" has no matching clickable region`);
  if (!ALL.some(q => q.dg === k)) W("diagram " + k, "not used by any question");
}
/* ---------- 4. duplicates ---------- */
{ const by = new Map();
  for (const q of ALL) { const k = exact(q.q) + "|" + (q.hx || "") + "|" + (q.dg || "") + "|" + (q._p || "") + "|" + norm(q.fig ? q.fig.replace(/<[^>]+>/g, m => /<text/.test(m) ? " " : "") : "").slice(0, 200) + "|" + (q.o || []).map(exact).sort().join("|"); if (by.has(k)) E(q.id, `identical stem and options as ${by.get(k)}`); else by.set(k, q.id); } }

/* ---------- 5. mirrors: daily.json, search.json, HUB counts ---------- */
const index = read("index.html");
{ let daily; try { daily = JSON.parse(read("data/daily.json")); } catch (e) { E("data/daily.json", "is not valid JSON: " + e.message); daily = []; }
  const qById = new Map(Q.map(q => [q.id, q]));
  for (const d of daily) { const q = qById.get(d.id); if (!q) { E("data/daily.json", `${d.id} is not in the bank (run node tools/build.js)`); continue; }
    for (const k of Object.keys(d)) if (JSON.stringify(d[k]) !== JSON.stringify(q[k])) { E("data/daily.json", `${d.id} field "${k}" differs from practice.html (run node tools/build.js)`); break; } }
  const want = Q.filter(q => q.type === "mc" && !q.dg && !q.hx).length;
  if (daily.length !== want) E("data/daily.json", `${daily.length} items; the bank has ${want} stand-alone multiple-choice items (run node tools/build.js)`);
  for (const s of Object.keys(SECS)) for (const lv of ["E", "M", "H"]) if (!daily.some(q => q.sec === s && q.lv === lv && !q.x)) W("data/daily.json", `no ${lv} item for ${s}; the Daily 5 will fall back to another level`);
}
{ const m = index.match(/const HUB=(\{.*?\});/); if (!m) E("index.html", "HUB counts not found"); else { const HUB = JSON.parse(m[1]);
    for (const s of Object.keys(SECS)) { const c = Array.from({ length: SECS[s].units }, (_, i) => ALL.filter(q => q.sec === s && q.unit === i + 1).length);
      if (JSON.stringify(c) !== JSON.stringify(HUB.counts[s])) E("index.html", `HUB.counts.${s} is ${JSON.stringify(HUB.counts[s])}, bank has ${JSON.stringify(c)}`);
      if (HUB.secCount[s] !== c.reduce((a, b) => a + b, 0)) E("index.html", `HUB.secCount.${s} is ${HUB.secCount[s]}, bank has ${c.reduce((a, b) => a + b, 0)}`); }
    if (HUB.total !== ALL.length) E("index.html", `HUB.total is ${HUB.total}, bank has ${ALL.length}`);
    if (HUB.passages !== P.length) E("index.html", `HUB.passages is ${HUB.passages}, bank has ${P.length}`); } }
{ let idx; try { idx = JSON.parse(read("data/search.json")); } catch (e) { E("data/search.json", "is not valid JSON: " + e.message); idx = []; }
  for (const s of Object.keys(SECS)) for (let u = 1; u <= SECS[s].units; u++) { const row = idx.find(r => r.s === s && r.u === u); const n = ALL.filter(q => q.sec === s && q.unit === u).length;
    if (!row) E("data/search.json", `no entry for ${s} unit ${u}`); else if (row.t.length !== n) E("data/search.json", `${s} unit ${u} indexes ${row.t.length} items, bank has ${n} (stale index)`); } }

/* ---------- 6. lessons, flashcards, glossary ---------- */
{ let L; try { L = JSON.parse(read("data/learn.json")); } catch (e) { E("data/learn.json", "is not valid JSON: " + e.message); L = { units: [], cards: [] }; }
  for (const s of Object.keys(SECS)) for (let u = 1; u <= SECS[s].units; u++) {
    const c = L.units.filter(x => x.sec === s && x.unit === u);
    if (c.length !== 1) { E("data/learn.json", `${s} unit ${u} has ${c.length} lessons (need exactly 1)`); continue; }
    const l = c[0];
    if (!Array.isArray(l.big) || l.big.length < 3) E("data/learn.json", `${s} unit ${u} lesson has fewer than 3 key points`);
    if (!l.example || !strip(l.example.q) || !(l.example.steps || []).length) E("data/learn.json", `${s} unit ${u} lesson has no worked example`);
    if (!strip(l.trap)) E("data/learn.json", `${s} unit ${u} lesson has no common trap`);
    for (const f of l.figs || []) { if (!exists(f.src)) E("data/learn.json", `${s} unit ${u} figure ${f.src} is missing`); if (!strip(f.cap)) E("data/learn.json", `${s} unit ${u} figure ${f.src} has no caption (alt text)`); }
    for (const c of l.check || []) { if (!(Array.isArray(c.o) && c.o.length >= 3 && Number.isInteger(c.a) && c.a >= 0 && c.a < c.o.length && strip(c.q) && strip(c.why))) E("data/learn.json", `${s} unit ${u} has a malformed check-yourself question`); }
    for (const [ls, lu] of l.next || []) if (!SECS[ls] || !(lu >= 1 && lu <= SECS[ls].units)) E("data/learn.json", `${s} unit ${u} links to a lesson that does not exist (${ls} ${lu})`);
  }
  const fronts = new Map();
  L.cards.forEach((c, i) => { const id = `card ${i + 1} (${c.sec} u${c.unit})`;
    if (!SECS[c.sec] || !(c.unit >= 1 && c.unit <= SECS[c.sec].units)) E("data/learn.json", `${id} has an invalid section or unit`);
    if (!strip(c.f) || !strip(c.b)) E("data/learn.json", `${id} has an empty side`);
    if (c.img && !exists(c.img)) E("data/learn.json", `${id} image ${c.img} is missing`);
    const k = c.sec + c.unit + "|" + norm(c.f) + "|" + (c.img || ""); if (fronts.has(k)) E("data/learn.json", `${id} repeats the front of card ${fronts.get(k)}: "${strip(c.f).slice(0, 50)}"`); else fronts.set(k, i + 1);
    if (strip(c.b).length > 260) W("data/learn.json", `${id} answer is ${strip(c.b).length} characters; a card should have one retrieval target ("${strip(c.f).slice(0, 40)}")`);
  });
}
{ let G; try { G = JSON.parse(read("data/glossary.json")); } catch (e) { E("data/glossary.json", "is not valid JSON: " + e.message); G = []; }
  const en = new Set();
  G.forEach((r, i) => { if (!Array.isArray(r) || r.length !== 4 || !SECS[r[0]] || r.slice(1).some(x => !String(x).trim())) E("data/glossary.json", `row ${i + 1} is malformed`); else { const k = r[0] + "|" + r[1].toLowerCase(); if (en.has(k)) E("data/glossary.json", `"${r[1]}" is listed twice`); en.add(k); } }); }
{ // nursing program requirements live in index.html as PROGRAMS; each row needs a source link and the date it was read
  const m = index.match(/const PROGRAMS=(\[[\s\S]*?\n\]);/);
  if (!m) E("index.html", "PROGRAMS list not found");
  else { let PR = []; try { PR = Function("return " + m[1])(); } catch (e) { E("index.html", "PROGRAMS could not be read: " + e.message); }
    if (PR.length < 5) E("index.html", `only ${PR.length} programs listed`);
    for (const p of PR) { const id = "program " + (p.n || "?");
      if (!p.n || !p.p || !strip(p.d)) E(id, "missing name, program or details");
      if (!/^https:\/\//.test(p.l || "")) E(id, "source link is missing or not https");
      const min = parseFloat(p.need); if (!(min >= 40 && min <= 100)) E(id, `minimum score "${p.need}" is not a percent between 40 and 100`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.checked || "")) { E(id, "no verification date (checked: YYYY-MM-DD)"); continue; }
      const age = (Date.now() - new Date(p.checked + "T12:00:00").getTime()) / 864e5;
      if (age > 180) W(id, `last checked ${Math.round(age)} days ago; open ${p.l} and re-verify`); } } }

/* ---------- 7. offline shell and links ---------- */
{ const sw = read("sw.js"); const m = sw.match(/const CORE\s*=\s*(\[[^\]]*\])/); if (!m) E("sw.js", "CORE list not found"); else for (const f of JSON.parse(m[1])) if (f !== "./" && !exists(f)) E("sw.js", `precaches ${f}, which does not exist`);
  const m2 = sw.match(/const ART\s*=\s*(\[[^\]]*\])/); if (m2) { const art = JSON.parse(m2[1]); for (const f of art) if (!exists(f)) E("sw.js", `precaches ${f}, which does not exist`);
    for (const f of imgRefs) if (!art.includes(f)) E("sw.js", `${f} is used by a question but is not in the offline art list (run node tools/build.js)`); }
  const man = JSON.parse(read("manifest.webmanifest")); for (const i of man.icons || []) if (!exists(i.src)) E("manifest.webmanifest", `icon ${i.src} is missing`); }
{ const modes = ["drill", "missed", "passage", "timed", "mini", "full", "sheet", "diag"];
  for (const f of ["index.html", "practice.html", "data/learn.json"]) { const txt = f === "practice.html" ? loadBank.code(ROOT) : read(f);
    for (const m of txt.matchAll(/practice\.html\?([^"'`\s<]+)/g)) { if (m[1].includes("${")) continue; const sp = new URLSearchParams(m[1].replace(/&amp;/g, "&"));
      if (sp.get("mode") && !modes.includes(sp.get("mode"))) E(f, `link to unknown practice mode "${sp.get("mode")}"`);
      if (sp.get("section") && !SECS[sp.get("section")]) E(f, `link to unknown section "${sp.get("section")}"`); }
    for (const m of txt.matchAll(/mode:"([a-z]+)"/g)) if (f === "index.html" && !modes.includes(m[1])) E(f, `link to unknown practice mode "${m[1]}"`);
    for (const m of txt.matchAll(/(?:src|href)=\\?"(assets\/[^"\\$]+)\\?"/g)) if (!exists(m[1])) E(f, `missing asset ${m[1]}`); }
  const routes = ["", "sec", "daily", "plan", "programs", "score", "learn", "cards", "report", "testday", "glossary", "search"];
  for (const m of index.matchAll(/href="#\/([a-z]*)/g)) if (!routes.includes(m[1])) E("index.html", `link to unknown page #/${m[1]}`); }

/* ---------- 8. answer-length cue (per section) ---------- */
const cue = {};
for (const q of ALL) if (q.type === "mc" && q.o.length === 4) { const len = q.o.map(x => strip(x).length); const mx = Math.max(...len); const c = cue[q.sec] || (cue[q.sec] = { n: 0, long: 0 }); c.n++; if (len[q.a] === mx && len.filter(l => l === mx).length === 1) c.long++; }
for (const [s, c] of Object.entries(cue)) { const p = c.long / c.n * 100; if (p > 30) W("bank", `${SECS[s].name}: the longest option is the key in ${p.toFixed(0)}% of multiple-choice items (chance is 25%); test-wise students can exploit this`); }

/* ---------- report ---------- */
if (args.has("--report")) {
  const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : "0.0") + "%";
  console.log(`\nBank: ${ALL.length} questions (${Q.length} stand-alone + ${ALL.length - Q.length} on ${P.length} passages/data sets); ${ALL.filter(q => q.x).length} flagged Beyond the TEAS\n`);
  console.log("Section / content area                               scored   TEAS%   bank   bank%    E    M    H");
  for (const s of Object.keys(SECS)) { const inS = ALL.filter(q => q.sec === s && !q.x);
    for (const [n, k, units] of AREAS[s]) { const a = inS.filter(q => units.includes(q.unit)); const lv = l => a.filter(q => q.lv === l).length;
      console.log(`${(SECS[s].name + " · " + n).padEnd(52)} ${String(k).padStart(6)}  ${pct(k, SECS[s].scored).padStart(6)}  ${String(a.length).padStart(5)}  ${pct(a.length, inS.length).padStart(6)}  ${String(lv("E")).padStart(3)}  ${String(lv("M")).padStart(3)}  ${String(lv("H")).padStart(3)}`); } }
  console.log("\nPer unit (questions; E/M/H; formats)");
  for (const s of Object.keys(SECS)) for (let u = 1; u <= SECS[s].units; u++) { const a = ALL.filter(q => q.sec === s && q.unit === u); const c = k => a.filter(q => q.type === k).length;
    console.log(`  ${s} ${String(u).padStart(2)}  ${String(a.length).padStart(4)}   ${a.filter(q => q.lv === "E").length}/${a.filter(q => q.lv === "M").length}/${a.filter(q => q.lv === "H").length}`.padEnd(30) + `mc ${c("mc")} · ms ${c("ms")} · fib ${c("fib")} · ord ${c("ord")} · hs ${c("hs")}`); }
  console.log("\nFormats by section");
  for (const s of Object.keys(SECS)) { const a = ALL.filter(q => q.sec === s); console.log(`  ${SECS[s].name.padEnd(9)} ` + ["mc", "ms", "fib", "ord", "hs"].map(k => `${k} ${a.filter(q => q.type === k).length} (${pct(a.filter(q => q.type === k).length, a.length)})`).join(" · ")); }
  console.log("\nLongest-option-is-key rate: " + Object.entries(cue).map(([s, c]) => `${s} ${pct(c.long, c.n)}`).join(" · "));
}
if (!args.has("--quiet") && warns.length) { console.log(`\n${warns.length} warning(s):`); for (const w of warns) console.log("  ! " + w); }
if (errors.length) { console.log(`\n${errors.length} error(s):`); for (const e of errors) console.log("  ✗ " + e); process.exit(1); }
console.log(`\n✓ ${ALL.length} questions, ${P.length} passages, ${Object.keys(D).length} diagrams: no errors${warns.length ? `, ${warns.length} warning(s)` : ""}.`);
