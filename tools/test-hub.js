#!/usr/bin/env node
/* Runs the hub page's real study-plan code (the script inside index.html) in Node and checks the plans it builds.
   node tools/test-hub.js */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const i = html.indexOf('<script>\n"use strict";'), j = html.indexOf("</script>", i);
if (i < 0) throw new Error("index.html: app script not found");

const els = new Map();
function el() { const o = { innerHTML: "", textContent: "", value: "", dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  querySelector: s => get(s), querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, focus() {}, closest: () => null }; return o; }
function get(s) { if (!els.has(s)) els.set(s, el()); return els.get(s); }
const store = new Map();
let NOW = Date.UTC(2026, 10, 16, 18);  // a Monday afternoon
class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const ctx = { document: { querySelector: get, querySelectorAll: () => [], getElementById: get, addEventListener() {}, documentElement: { classList: { contains: () => false } }, body: el() },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  location: { hash: "#/", search: "" }, navigator: {}, console, Math, JSON, Date: FakeDate, URLSearchParams, setTimeout: () => 0, requestAnimationFrame() {}, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false }) };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(html.slice(i + 8, j), ctx, { filename: "index.html<script>" });
const run = c => vm.runInContext(c, ctx);

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; if (fails <= 40) console.log("  ✗ " + m); } };
const ALLU = run("ORDERS.flatMap(s=>SEC[s].u.map((_,i)=>'u-'+s+'-'+(i+1)))");
const dateIn = d => { const t = new Date(NOW + d * 864e5); return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0"); };
const build = (days, hrs, old) => { ctx.__a = [dateIn(days), String(hrs), old || null]; return run("buildPlan(...__a)"); };
const units = P => P.weeks.flatMap(w => w.items.filter(x => x.k === "unit"));
const MIN = run("MIN");
const setDiag = d => { const st = JSON.parse(store.get("scrubin_v1") || "{}"); if (d) st.diag = d; else delete st.diag; store.set("scrubin_v1", JSON.stringify(st)); };

console.log("Every combination of test date (1-16 weeks) and weekly hours");
for (const hrs of [4, 8, 12, 20]) for (let wk = 1; wk <= 17; wk++) {
  const P = build(wk * 7 - 2, hrs), tag = `${hrs} h/week, test in ${wk} weeks`;
  const ids = units(P).map(x => x.id).concat(P.extra.map(x => `u-${x.s}-${x.u}`));
  ok(ids.length === 47 && new Set(ids).size === 47 && ALLU.every(u => ids.includes(u)), `${tag}: units are missing or repeated (${ids.length} placed)`);
  P.weeks.forEach((w, k) => { const m = w.items.reduce((n, x) => n + MIN[x.k], 0);
    if (w.ph === "Content") { ok(m <= hrs * 60 || w.items.filter(x => x.k === "unit").length <= 1, `${tag}: week ${k + 1} needs ${m} min, more than ${hrs * 60}`); ok(w.items.filter(x => x.k === "unit").length <= P.cap[k], `${tag}: week ${k + 1} is over its unit room`); }
    else ok(m <= Math.max(hrs * 60 * 1.2, MIN.full + 1, MIN.light + 1), `${tag}: practice week ${k + 1} needs ${m} min`); });
  const cw = P.weeks.filter(w => w.ph === "Content").map(w => w.items.filter(x => x.k === "unit").length);
  if (!P.extra.length) ok(Math.max(...cw) - Math.min(...cw) <= 2, `${tag}: units bunched up (${cw.join(", ")} per week)`);
  ok(P.weeks.at(-1).items.some(x => x.k === "light"), `${tag}: no light final week`);
  if (wk >= 3) ok(P.weeks.some(w => w.items.some(x => x.k === "full")), `${tag}: no full practice test`);
  ok(P.weeks.filter(w => w.ph === "Content").every(w => w.items.some(x => x.k === "review")), `${tag}: a content week has no missed-question review`);
}
{ const P = build(12 * 7, 20); ok(!P.extra.length, "20 h/week with 12 weeks still leaves units out"); }
{ const P = build(6 * 7, 4); ok(P.extra.length > 20, `4 h/week with 6 weeks fits ${units(P).length} units; that should leave many out`);
  const kept = new Set(units(P).map(x => x.id)); const w = run("(s,u)=>unitWeight(s,u)");
  const minKept = Math.min(...units(P).map(x => w(x.s, x.u))), maxLeft = Math.max(...P.extra.map(x => w(x.s, x.u)));
  ok(minKept >= maxLeft, `when units are left out, a less-tested unit was kept over a more-tested one (${minKept} vs ${maxLeft})`);
  ctx.__P = P; const adv = run("fitAdvice(__P)"); ok(/hours a week/.test(adv) && /test date/.test(adv), "no advice on how to fit the left-out units"); }

console.log("Diagnostic results come first");
{ setDiag({ date: "2026-11-15", pct: 60, per: 2, units: { "sc:2": 0, "ma:7": 0.5, "rd:1": 0, "en:3": 1 }, sec: {} });
  for (const hrs of [4, 8]) { const P = build(42, hrs); const u = units(P);
    ok(u[0].weak && u[1].weak && u[2].weak && !u[3].weak, `${hrs} h: flagged units are not first (${u.slice(0, 4).map(x => x.id)})`);
    ok(u[2].id === "u-ma-7", `${hrs} h: a unit with 1 of 2 right should come after units with 0 of 2 (got ${u.slice(0, 3).map(x => x.id)})`);
    ok(P.weeks[0].items[0].k === "diagredo", `${hrs} h: week 1 still asks for a diagnostic that was already taken`); }
  setDiag(null); }

console.log("Rebuilding keeps finished units");
{ const P1 = build(56, 8); const fin = units(P1).slice(0, 7).map(x => x.id); fin.forEach(id => P1.done[id] = true); P1.done["d5-0"] = true;
  NOW += 10 * 864e5; const P2 = build(46, 8, P1);
  ok(fin.every(id => P2.doneUnits.includes(id)), "finished units were not carried over");
  ok(units(P2).every(x => !fin.includes(x.id)) && !P2.extra.some(x => fin.includes(`u-${x.s}-${x.u}`)), "finished units were scheduled again");
  ok(units(P2).length + P2.extra.length === 40, `rebuild placed ${units(P2).length + P2.extra.length} of the 40 units left`);
  ok(!P2.done["d5-0"], "a weekly checkmark from the old plan carried into the new week 1");
  const P3 = build(40, 8, P2); ok(fin.every(id => P3.doneUnits.includes(id)), "finished units were lost on a second rebuild"); }

console.log("Rendering");
for (const P of [build(42, 8), build(14, 4), { date: dateIn(30), hrs: "8", made: dateIn(-3), done: { "u-sc-1": true }, weeks: [{ n: 1, ph: "Content", items: [{ id: "u-sc-1", k: "unit", s: "sc", u: 1 }, { id: "d5-0", k: "daily" }] }, { n: 2, ph: "Final week", items: [{ id: "light-1", k: "light" }] }] }]) {
  ctx.__P = P; let html = "", err = null; try { run("renderPlan(__P)"); html = run('document.querySelector("#planOut").innerHTML'); } catch (e) { err = e.message; }
  ok(!err && /Week 1/.test(html) && !/undefined|NaN/.test(html), `renderPlan failed: ${err || (html.match(/.{0,40}(undefined|NaN).{0,40}/) || [""])[0]}`);
}

console.log(`\n${fails ? "✗ " + fails + " of " + checks + " plan checks failed" : "✓ all " + checks + " plan checks passed"}`);
process.exit(fails ? 1 : 0);
