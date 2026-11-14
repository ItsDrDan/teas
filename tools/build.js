#!/usr/bin/env node
/* Rebuilds everything that is derived from the question bank in practice.html:
     data/daily.json   the Daily 5 pool (stand-alone multiple-choice items)
     data/search.json  the topic search index (one row per unit)
     index.html        the HUB question counts
     sw.js             the list of art saved for offline use
   node tools/build.js           write the files
   node tools/build.js --check   change nothing; exit 1 if any file is out of date (used by CI) */
"use strict";
const fs = require("fs"), path = require("path");
const { loadBank, SECS } = require("./lib");
const ROOT = path.resolve(__dirname, ".."), check = process.argv.includes("--check");
const { Q, P } = loadBank(ROOT);
const ALL = Q.concat(P.flatMap(p => p.qs.map(q => Object.assign({ _p: p }, q))));
const stale = [];
function out(file, text) {
  const f = path.join(ROOT, file), old = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  if (old === text) return;
  stale.push(file); if (!check) fs.writeFileSync(f, text);
}
// Daily 5: only what the hub page uses
const DAILY_KEYS = ["id", "sec", "unit", "lv", "type", "q", "o", "a", "e", "t", "w", "x", "fig"];
const daily = Q.filter(q => q.type === "mc" && !q.dg && !q.hx).map(q => { const o = {}; for (const k of DAILY_KEYS) if (q[k] !== undefined) o[k] = q[k]; return o; });
out("data/daily.json", JSON.stringify(daily));
// Search: stem + choices + explanation, lower-case, no markup
const text = s => String(s == null ? "" : s).replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const idx = [];
for (const s of Object.keys(SECS)) for (let u = 1; u <= SECS[s].units; u++)
  idx.push({ s, u, t: ALL.filter(q => q.sec === s && q.unit === u).map(q => text([q._p ? q._p.title : "", q.q, (q.o || []).join(" "), (q.e || []).join(" "), q.t || ""].join(" "))) });
out("data/search.json", JSON.stringify(idx));
// Hub counts
const counts = {}, secCount = {};
for (const s of Object.keys(SECS)) { counts[s] = Array.from({ length: SECS[s].units }, (_, i) => ALL.filter(q => q.sec === s && q.unit === i + 1).length); secCount[s] = counts[s].reduce((a, b) => a + b, 0); }
const HUB = { counts, passages: P.length, total: ALL.length, secCount };
{ const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"); const re = /const HUB=\{.*?\};/; if (!re.test(html)) throw new Error("index.html: HUB line not found"); out("index.html", html.replace(re, () => "const HUB=" + JSON.stringify(HUB) + ";")); }
// Offline art list
{ const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + "/" + e.name) : e.name.startsWith(".") ? [] : [d + "/" + e.name]);
  const art = walk("assets").filter(f => f !== "assets/og.png").sort();
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"); const re = /const ART = \[[^\]]*\];/; if (!re.test(sw)) throw new Error("sw.js: ART line not found"); out("sw.js", sw.replace(re, () => "const ART = " + JSON.stringify(art) + ";")); }
if (check) { if (stale.length) { console.log("✗ out of date (run node tools/build.js): " + stale.join(", ")); process.exit(1); } console.log("✓ derived files are up to date"); }
else console.log(stale.length ? "rebuilt: " + stale.join(", ") + "\nRemember to bump CACHE in sw.js before publishing." : "nothing to rebuild");
