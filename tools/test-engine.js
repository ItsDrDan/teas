#!/usr/bin/env node
/* Runs Scrub In's real grading, sampling, timing and save/resume code (the script inside practice.html)
   in Node with a stand-in for the page, and checks it against every item in the bank. No dependencies.
   node tools/test-engine.js */
"use strict";
const vm = require("vm"), path = require("path");
const { loadBank, SECS } = require("./lib");
const ROOT = path.resolve(__dirname, "..");

/* ---- a page stand-in: any element access works and does nothing ---- */
const els = new Map();
function el() {
  const o = { innerHTML: "", textContent: "", value: "", dataset: {}, style: {}, disabled: false, isConnected: true,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: s => get(s), querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect: () => ({ top: 0, bottom: 0, right: 0 }), scrollIntoView() {}, focus() {}, click() { if (o.onclick) o.onclick({ currentTarget: o, target: o }); },
    closest: () => null, setPointerCapture() {}, offsetWidth: 0, offsetLeft: 0, offsetTop: 0, replaceWith() {}, remove() {}, appendChild() {} };
  return o;
}
function get(s) { if (!els.has(s)) els.set(s, el()); return els.get(s); }
const store = new Map();
let NOW = 1.8e12;                        // a controllable clock
const timers = [];
class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const ctx = {
  document: { querySelector: get, querySelectorAll: () => [], addEventListener() {}, documentElement: { classList: { contains: () => false }, clientWidth: 1000, scrollWidth: 1000, style: {} }, createElement: el, createComment: el, body: el(), visibilityState: "visible" },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  location: { search: "", protocol: "file:", hash: "" }, navigator: {}, URLSearchParams, console, Math, JSON, Date: FakeDate,
  setTimeout: () => 0, clearTimeout() {}, setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval: id => { timers[id - 1] = null; },
  requestAnimationFrame() {}, innerHeight: 800, scrollX: 0, scrollY: 0, addEventListener() {}
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(loadBank.script(ROOT), ctx, { filename: "practice.html<script>" });
const run = code => vm.runInContext(code, ctx);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; if (fails <= 60) console.log("  ✗ " + msg); } };
const section = n => console.log("\n" + n);

/* ---- 1. every keyed answer grades correct; near misses grade wrong ---- */
section("Grading: every item's key, and deliberate wrong answers");
const ALLQ = run("ALLQ");
ctx.__t = { ALLQ };
const g = (q, resp, moved) => { ctx.__q = q; ctx.__r = resp; ctx.__m = moved; return run("(()=>{const v=newView(__q);v.resp=__r;v.moved=__m;return {ok:grade(v),ans:answered(v),v};})()"); };
const count = { mc: 0, ms: 0, fib: 0, ord: 0, hs: 0 };
for (const q of ALLQ) {
  count[q.type]++;
  if (q.type === "mc") {
    ok(g(q, q.a).ok, `${q.id}: keyed choice is graded wrong`);
    q.o.forEach((_, i) => { if (i !== q.a) ok(!g(q, i).ok, `${q.id}: distractor ${i + 1} is graded correct`); });
    ok(!g(q, null).ans, `${q.id}: counts as answered with nothing chosen`);
  } else if (q.type === "ms") {
    ok(g(q, q.a.slice()).ok, `${q.id}: full keyed set is graded wrong`);
    ok(g(q, q.a.slice().reverse()).ok, `${q.id}: keyed set in another click order is graded wrong`);
    if (q.a.length > 1) ok(!g(q, q.a.slice(1)).ok, `${q.id}: a partial selection earns credit`);
    const extra = q.o.findIndex((_, i) => !q.a.includes(i));
    if (extra >= 0) ok(!g(q, q.a.concat([extra])).ok, `${q.id}: key plus one wrong option earns credit`);
    ok(!g(q, []).ok && !g(q, []).ans, `${q.id}: empty selection is accepted`);
  } else if (q.type === "fib") {
    for (const a of q.a) {
      ok(g(q, a).ok, `${q.id}: accepted answer "${a}" is graded wrong`);
      ok(g(q, "  " + a + " ").ok, `${q.id}: "${a}" with spaces around it is graded wrong`);
      if (q.u) ok(g(q, a + " " + q.u).ok, `${q.id}: "${a} ${q.u}" (answer typed with its unit) is graded wrong`);
    }
    const num = run("parseNum")(q.a[0]);
    if (num !== null) {
      ok(g(q, String(num)).ok, `${q.id}: ${num} is graded wrong`);
      if (Number.isInteger(num)) ok(g(q, num + ".0").ok, `${q.id}: "${num}.0" is graded wrong`);
      if (Math.abs(num) >= 1000) ok(g(q, num.toLocaleString("en-US")).ok, `${q.id}: "${num.toLocaleString("en-US")}" with a comma is graded wrong`);
      const accepted = q.a.map(run("parseNum")).filter(x => x !== null);
      for (const wrong of [num * 1.01, num + 1, num * 10, num / 10, -num || 1]) {
        if (accepted.some(a => Math.abs(a - wrong) <= 1e-9 + Math.abs(a) * 1e-6)) continue;
        ok(!g(q, String(+wrong.toPrecision(10))).ok, `${q.id}: wrong value ${+wrong.toPrecision(10)} is graded correct (key ${q.a[0]})`);
      }
    }
    ok(!g(q, "").ok && !g(q, "   ").ans, `${q.id}: blank entry is accepted`);
    ok(!g(q, "abc xyz").ok, `${q.id}: nonsense text is graded correct`);
    for (const k of Object.keys(q.mx || {})) ok(!g(q, k).ok, `${q.id}: slip note "${k}" can never show, because that entry is graded correct`);
  } else if (q.type === "ord") {
    const n = q.o.length, id = [...Array(n).keys()];
    ok(g(q, id, true).ok, `${q.id}: keyed order is graded wrong`);
    ok(!g(q, id.slice().reverse(), true).ok, `${q.id}: reversed order is graded correct`);
    const sw = id.slice(); [sw[0], sw[1]] = [sw[1], sw[0]];
    ok(!g(q, sw, true).ok, `${q.id}: order with two items swapped earns credit`);
    for (let k = 0; k < 25; k++) { const v = run("newView")(q); ok(!v.resp.every((x, i) => x === i), `${q.id}: starts already in the right order`); ok(v.resp.slice().sort().join() === id.join(), `${q.id}: starting order loses or repeats an item`); if (fails > 60) break; }
  } else if (q.type === "hs") {
    ok(g(q, q.a).ok, `${q.id}: keyed spot is graded wrong`);
    ok(!g(q, q.a + "_x").ok && !g(q, null).ans, `${q.id}: another spot or no spot is accepted`);
  }
  // feedback renders for right and wrong answers, with the correct letter after shuffling
  ctx.__q = q;
  const fb = run(`(()=>{const v=newView(__q);const t=__q.type;v.resp=t==="mc"?(__q.a+1)%__q.o.length:t==="ms"?[__q.o.findIndex((_,i)=>!__q.a.includes(i))].filter(i=>i>=0):t==="fib"?"zzz":t==="ord"?v.order.slice():"nope";v.moved=true;return {html:feedbackHTML(v,false),v,ok:feedbackHTML(v,true)};})()`);
  ok(typeof fb.html === "string" && fb.html.includes("Not quite") && !/undefined|NaN|\[object/.test(fb.html.replace(/<svg[\s\S]*?<\/svg>/g, "")), `${q.id}: wrong-answer feedback is malformed`);
  if (q.type === "mc") { const pos = fb.v.order.indexOf(q.a); ok(fb.html.includes(`The answer is ${"ABCDEF"[pos]}.`), `${q.id}: feedback names the wrong letter after shuffling`); }
  ok(fb.ok.includes("Correct!"), `${q.id}: right-answer feedback is malformed`);
}
console.log(`  graded ${ALLQ.length} items: ` + Object.entries(count).map(([k, n]) => `${k} ${n}`).join(" · "));

/* ---- 2. number parsing ---- */
section("Fill-in number parsing");
const pn = run("parseNum");
for (const [inp, want] of [["12", 12], [" 12 ", 12], ["1,250", 1250], ["$6.35", 6.35], ["25%", 25], ["-3", -3], ["−3", -3], ["–3", -3], [".5", 0.5], ["0.50", 0.5], ["3/4", 0.75], ["1 1/2", 1.5], ["-1 1/2", -1.5], ["7.", 7], ["", null], ["abc", null], ["1.2.3", null], ["1/0", Infinity], ["12 mL", null], ["1e3", null], ["--4", null]])
  ok(pn(inp) === want || (want !== null && Math.abs(pn(inp) - want) < 1e-12), `parseNum(${JSON.stringify(inp)}) gave ${pn(inp)}, expected ${want}`);
const fq = { id: "t", sec: "ma", unit: 1, lv: "E", type: "fib", q: "", o: [], a: ["0.75"], e: [""] };
for (const [inp, want] of [["0.75", true], [".75", true], ["3/4", true], ["6/8", true], ["0.750", true], ["0.76", false], ["0.7500001", true], ["0.7501", false], ["75", false], ["1/0", false], ["0.75 0.75", false]])
  ok(g(fq, inp).ok === want, `fill-in key 0.75, typed ${JSON.stringify(inp)}: graded ${!want}, expected ${want}`);
const fu = Object.assign({}, fq, { a: ["8"], u: "mL" });
for (const [inp, want] of [["8", true], ["8 mL", true], ["8mL", true], ["8 ml", true], ["8.0 mL", true], ["80 mL", false], ["8 L", true], ["mL", false]])
  ok(g(fu, inp).ok === want, `fill-in key 8 mL, typed ${JSON.stringify(inp)}: graded ${!want}, expected ${want}`);
// "8 L" is accepted on purpose: the unit is printed beside the box, so only the number is graded.

/* ---- 3. practice-test sampling ---- */
section("Practice test and diagnostic sampling (300 draws each)");
for (const s of Object.keys(SECS)) {
  for (let k = 0; k < 300; k++) {
    ctx.__s = s; const full = run("sampleSection(__s,1)"), mini = run("sampleSection(__s,10/SEC[__s].q)");
    ok(full.length === SECS[s].items, `full test ${s}: drew ${full.length} questions, expected ${SECS[s].items}`);
    ok(mini.length === 10, `mini test ${s}: drew ${mini.length} questions, expected 10`);
    ok(new Set(full.map(q => q.id)).size === full.length, `full test ${s}: a question is repeated`);
    ok(full.every(q => q.sec === s && !q.x), `full test ${s}: drew an off-section or Beyond-the-TEAS item`);
    if (k < 20) { const areas = run("SEC[__s].areas"); for (const [n, units, want] of areas) { const got = full.filter(q => units.includes(q.unit)).length; ok(Math.abs(got - want) <= 6, `full test ${s}: "${n}" got ${got} questions, blueprint share is ${want}`); } }
    if (fails > 60) break;
  }
}
for (const per of [1, 2]) for (let k = 0; k < 100; k++) {
  ctx.__p = per; const d = run("diagItems(__p)"); ok(d.length === 47 * per, `diagnostic (${per}/unit): ${d.length} questions, expected ${47 * per}`);
  ok(new Set(d.map(q => q.id)).size === d.length, `diagnostic (${per}/unit) repeats a question`);
  const per2 = {}; d.forEach(q => { per2[q.sec + q.unit] = (per2[q.sec + q.unit] || 0) + 1; }); ok(Object.values(per2).every(n => n === per), `diagnostic (${per}/unit) does not cover every unit evenly`);
  ok(d.every(q => !q.x && ["mc", "ms", "fib"].includes(q.type)), `diagnostic drew a Beyond-the-TEAS or figure-tap item`);
}

/* ---- 4. clock: real time, background tabs, sleep ---- */
section("Section clock");
const tickN = (n, stepMs) => { for (let i = 0; i < n; i++) { NOW += stepMs; timers.filter(Boolean).forEach(f => f()); } };
run(`mode="timed";TEST=null;runBlock({items:Q.slice(0,5),secs:600,title:"t",run:"timed",onDone:B=>{globalThis.__done=B;}})`);
tickN(20, 500); ok(Math.abs(run("T.left") - 590) < 0.01, `after 10 s of ticks the clock shows ${run("T.left")} s left, expected 590`);
tickN(1, 60000); ok(Math.abs(run("T.left") - 530) < 0.01, `a throttled background tab (one tick per minute) was charged ${590 - run("T.left")} s, expected 60`);
tickN(1, 3600000); ok(Math.abs(run("T.left") - 530) < 0.01, `an hour asleep was charged to the section (left ${run("T.left")} s)`);
run("T.views[0].resp=T.views[0].q.type==='mc'?T.views[0].q.a:T.views[0].resp");
tickN(1, 100000); tickN(1, 100000); tickN(1, 100000); tickN(1, 100000); tickN(1, 100000); tickN(1, 31000);
ok(ctx.__done && ctx.__done.timedOut === true, "the section did not end when time ran out");
ok(ctx.__done && ctx.__done.res.length === 5 && ctx.__done.res.slice(1).every(r => r === false), "unanswered questions were not scored as wrong at time-out");

/* ---- 5. save and resume a full test ---- */
section("Save and resume");
store.delete("scrubin_run_v1"); ctx.__done = null;
run(`mode="full";TEST={kind:"full",k:0,results:[]};nextTest();`);
ok(run("T.items.length") === 45 && run("T.secs") === 3300, "full test section 1 is not 45 questions in 55 minutes");
// answer the first 10 correctly (whatever the format), flag one, move on
run(`for(let k=0;k<10;k++){const v=T.views[k],q=v.q;v.resp=q.type==="mc"?q.a:q.type==="ms"?q.a.slice():q.type==="fib"?q.a[0]:q.type==="ord"?q.o.map((_,i)=>i):q.a;if(q.type==="ord")v.moved=true;} T.flag[3]=true; T.i=7; showTQ();`);
tickN(240, 500); // two minutes pass
const before = run("JSON.stringify({ids:T.views.map(v=>v.q.id),resp:T.views.map(v=>v.resp),order:T.views.map(v=>v.order),left:Math.round(T.left),flag:T.flag,i:T.i})");
run("saveRun()");
ok(store.has("scrubin_run_v1"), "nothing was saved for a test in progress");
// simulate a reload: forget everything in memory, then resume from storage
run("clearInterval(T.iv);T=null;TEST=null;runLive=false;mode='drill';");
ok(run("!!loadRun()"), "saved run could not be read back");
NOW += 3 * 3600 * 1000; // three hours later
run("resumeRun()");
const after = run("JSON.stringify({ids:T.views.map(v=>v.q.id),resp:T.views.map(v=>v.resp),order:T.views.map(v=>v.order),left:Math.round(T.left),flag:T.flag,i:T.i})");
ok(before === after, "resumed test differs from the saved one (questions, answers, option order, time left, flags or position)");
ok(run("mode") === "full" && run("TEST.kind") === "full" && run("TEST.k") === 0, "resume lost which test and section was running");
// finish section 1: only the 10 answered should be right, and it should move to the break screen with a save
run("finishBlock()");
ok(run("TEST.results.length") === 1 && run("TEST.results[0].B.score") === 10 && run("TEST.k") === 1, `section 1 scored ${run("TEST.results[0]&&TEST.results[0].B.score")} (expected 10 of 45) or did not advance`);
const mid = JSON.parse(store.get("scrubin_run_v1") || "null");
ok(mid && mid.cur === null && mid.k === 1 && mid.results.length === 1, "the finished section was not saved before the next one started");
run("T=null;TEST=null;runLive=false;resumeRun()");
ok(run("TEST&&TEST.k") === 1 && run("TEST.results[0].B.score") === 10, "resume between sections lost the finished section");
run("nextTest()"); ok(run("T.items.length") === 38 && run("T.secs") === 57 * 60 && run("T.title").includes("Math"), "section 2 is not Math, 38 questions, 57 minutes");
run("finishBlock();nextTest();"); ok(run("T.items.length") === 50 && run("T.secs") === 3600, "section 3 is not Science, 50 questions, 60 minutes");
run("finishBlock();nextTest();"); ok(run("T.items.length") === 37 && run("T.secs") === 37 * 60, "section 4 is not English, 37 questions, 37 minutes");
const nAns0 = run("S.ans");
run("finishBlock()");
ok(!store.has("scrubin_run_v1"), "a finished test is still offered for resume");
const t = run("S.tests[S.tests.length-1]");
ok(t && t.k === "full" && Math.abs(t.p - Math.round(10 / 170 * 1000) / 10) < 1e-9, `full test recorded ${t && t.p}%, expected ${Math.round(10 / 170 * 1000) / 10}% (10 of 170)`);
ok(run("S.ans") === nAns0, "blank questions were added to the answered count");
// a saved run from an older bank must be refused, not crash
store.set("scrubin_run_v1", JSON.stringify({ v: 1, run: "timed", at: NOW, kind: null, k: 0, results: [], cur: { ids: ["no-such-id"], order: [[0, 1, 2, 3]], resp: [null], moved: [0], struck: [[]], tm: [0], flag: [false], i: 0, left: 100, secs: 600, title: "x" } }));
run("T=null;TEST=null;resumeRun()"); ok(!store.has("scrubin_run_v1") && run("T") === null, "a saved run with a deleted question was not discarded cleanly");
store.set("scrubin_run_v1", "{not json"); ok(run("loadRun()") === null, "corrupt saved data was not ignored");

/* ---- 6. missed-question review schedule ---- */
section("Missed-question schedule (1, 3, 7 days)");
{ const q = ALLQ.find(x => x.type === "mc"); ctx.__q = q; run("S.miss={};mode='drill';");
  const day = () => run("dayN()"), miss = () => run("S.miss[__q.id]");
  run("record(__q,false)"); ok(miss() && miss().b === 0 && miss().due === day(), "a miss in a drill is not due the same day");
  run("mode='missed';record(__q,false)"); ok(miss().due === day() + 1, "a miss during review does not come back the next day");
  NOW += 864e5; run("record(__q,true)"); ok(miss().b === 1 && miss().due === day() + 3, "first correct review does not schedule 3 days out");
  run("mode='drill';record(__q,true)"); ok(miss().b === 1, "a correct answer before the due date moved the card forward");
  NOW += 3 * 864e5; run("record(__q,true)"); ok(miss().b === 2 && miss().due === day() + 7, "second correct review does not schedule 7 days out");
  NOW += 7 * 864e5; run("record(__q,true)"); ok(!miss(), "third correct review did not retire the card");
  run("record(__q,false)"); NOW += 864e5; run("mode='missed';record(__q,true)"); NOW += 3 * 864e5; run("record(__q,false)"); ok(miss().b === 0, "missing a card again did not reset it");
}

/* ---- 7. calculator ---- */
section("Calculator");
const calc = keys => { run("Object.assign(CALC,{cur:'0',acc:null,op:null,fresh:true,mem:0,mrc:false})"); for (const k of keys.split(" ")) { ctx.__k = k; run("calcPress(__k)"); } return run("CALC.cur"); };
for (const [keys, want] of [
  ["2 + 3 =", "5"], ["9 − 4 =", "5"], ["6 × 7 =", "42"], ["8 ÷ 2 =", "4"], ["1 ÷ 0 =", "Error"], ["0 ÷ 0 =", "Error"],
  ["2 + 3 × 4 =", "20"],                      // no order of operations: works left to right, like a basic calculator
  ["0 . 1 + 0 . 2 =", "0.3"], ["1 . 5 . 2 + 1 =", "2.52"], ["1 2 ⌫ 3 =", "13"], ["5 ⌫ ⌫", "0"], ["7 C 3 + 1 =", "4"],
  ["2 0 0 × 1 5 % =", "30"], ["2 0 0 + 1 5 % =", "230"], ["2 0 0 − 1 5 % =", "170"], ["5 0 %", "0.5"],
  ["8 1 √", "9"], ["2 √", "1.41421356237"], ["0 − 4 = √", "Error"],
  ["5 m+ 3 m+ C mrc", "8"], ["9 m+ 4 m− C mrc", "5"], ["9 m+ mc C mrc", "0"], ["7 m+ mrc mrc C mrc", "0"],
  ["3 + + − 1 =", "2"], ["4 × = ", "16"], ["2 + 3 = × 4 =", "20"], ["2 + 3 = 7 + 1 =", "8"], ["− 5 =", "-5"],
  ["1 2 3 4 5 6 7 8 9 0 1 2 3 4", "123456789012"], ["1 ÷ 3 =", "0.333333333333"], ["9 9 9 9 9 9 × 9 9 9 9 9 9 =", "999998000001"]
]) ok(calc(keys.trim()) === want, `calculator: ${keys} gave ${calc(keys.trim())}, expected ${want}`);

console.log(`\n${fails ? "✗ " + fails + " of " + checks + " checks failed" : "✓ all " + checks.toLocaleString("en-US") + " engine checks passed"}`);
process.exit(fails ? 1 : 0);
