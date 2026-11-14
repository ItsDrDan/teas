#!/usr/bin/env node
/* Re-reads each nursing program's own page (the PROGRAMS list in index.html) and reports what may have changed.

   node tools/check-programs.js            check every program; write program-check.md; update tools/programs-snapshot.json
   node tools/check-programs.js --dry      check without updating the snapshot

   For each program it reports:
     UNREACHABLE    the page didn't load (some colleges block scripts: open it in a browser)
     MINIMUM?       the minimum shown on the hub (e.g. 62%) doesn't appear near "TEAS" on the page anymore
     CHANGED        the TEAS sentences on the page differ from the last check (the changed sentences are listed)
     NO CHANGE      the TEAS sentences are the same as last time
   It never edits the hub. A person reads the report, opens the page, and updates index.html (row text and its
   "checked" date). GitHub runs this each January and August (.github/workflows/programs.yml) and opens an issue. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), SNAP = path.join(__dirname, "programs-snapshot.json");
const dry = process.argv.includes("--dry");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const m = html.match(/const PROGRAMS=(\[[\s\S]*?\n\]);/);
if (!m) { console.error("✗ PROGRAMS list not found in index.html"); process.exit(1); }
const PROGRAMS = Function("return " + m[1])();

const text = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, ". ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&#\d+;|&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
// sentences about the TEAS (or ATI), which is where minimums, attempts and deadlines are written
const teasLines = t => [...new Set(t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => /\bTEAS\b|\bATI\b/i.test(s) && s.length > 15 && s.length < 600))];

async function get(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Accept": "text/html,application/xhtml+xml" } });
    const body = await r.text();
    return { status: r.status, url: r.url, body };
  } catch (e) { return { status: 0, error: e.name === "AbortError" ? "timed out" : e.message }; }
  finally { clearTimeout(timer); }
}

(async () => {
  const old = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, "utf8")) : { programs: {} };
  const snap = { checked: new Date().toISOString().slice(0, 10), programs: {} }, rows = [];
  let attention = 0;
  for (const p of PROGRAMS) {
    const r = await get(p.l), prev = old.programs[p.n];
    if (!r.status || r.status >= 400 || !r.body) {
      attention++; rows.push({ p, s: "UNREACHABLE", note: r.error || `HTTP ${r.status}. Some college sites block scripts; open the page in a browser.` });
      if (prev) snap.programs[p.n] = prev; continue;
    }
    const lines = teasLines(text(r.body)), min = parseFloat(p.need);
    const minSeen = lines.some(s => new RegExp(`\\b${min}(\\.0)?\\s*(%|percent|or (higher|better|above)|\\b)`, "i").test(s));
    snap.programs[p.n] = { url: r.url, lines };
    const added = prev ? lines.filter(s => !prev.lines.includes(s)) : [], removed = prev ? prev.lines.filter(s => !lines.includes(s)) : [];
    const notes = [];
    let s = !prev ? "FIRST CHECK" : added.length || removed.length ? "CHANGED" : "NO CHANGE";
    if (!lines.length) notes.push("No sentence on this page mentions the TEAS. The page may have moved, or the details may be in a PDF or another page.");
    else if (!minSeen && !p.minIn) notes.push(`The ${p.need} minimum shown on the hub doesn't appear in the page's TEAS sentences. It may be in a linked PDF, or it may have changed.`);
    const info = [];
    if (!minSeen && p.minIn) info.push(`The ${p.need} minimum is stated in ${p.minIn}, not on this page; check it there.`);
    // other percentages written as a minimum ("70%", "a score of 73") in the TEAS sentences
    const other = [...new Set(lines.flatMap(x => [...x.matchAll(/\b(\d{2}(?:\.\d)?)\s*%/g)].map(k => +k[1])))].filter(v => v >= 55 && v <= 90 && v !== min);
    if (other.length) info.push(`The TEAS sentences also mention ${other.map(v => v + "%").join(", ")}. Usually these are ranking points or old rules, but confirm the minimum is still ${p.need}.`);
    if (r.url.replace(/\/$/, "").toLowerCase() !== p.l.replace(/\/$/, "").toLowerCase()) notes.push(`The page now redirects to ${r.url}`);
    if (s === "CHANGED" || notes.length) attention++;
    rows.push({ p, s: notes.length && s === "NO CHANGE" ? "LOOK" : s, notes, info, added, removed, lines });
  }
  const L = [`# Program requirement check, ${snap.checked}`, "",
    `${PROGRAMS.length} programs checked; ${attention} need a look. Nothing on the hub was changed. For each flagged program, open its page, compare it with the row in index.html (PROGRAMS), update the text if needed, and set "checked" to today's date.`, ""];
  for (const r of rows) {
    L.push(`## ${r.p.n}: ${r.s}`, "", `Hub says: minimum ${r.p.need}. Page: ${r.p.l}`, "");
    if (r.note) L.push(r.note, "");
    for (const n of r.notes || []) L.push("- " + n);
    for (const n of r.info || []) L.push("- (note) " + n);
    if ((r.notes || []).length || (r.info || []).length) L.push("");
    if (r.added && r.added.length) L.push("New or reworded on the page:", ...r.added.map(x => "> " + x), "");
    if (r.removed && r.removed.length) L.push("No longer on the page:", ...r.removed.map(x => "> ~~" + x + "~~"), "");
    if (r.s === "FIRST CHECK") L.push(`${r.lines.length} TEAS sentence(s) saved for next time.`, "");
  }
  fs.writeFileSync(path.join(ROOT, "program-check.md"), L.join("\n") + "\n");
  if (!dry) fs.writeFileSync(SNAP, JSON.stringify(snap, null, 1) + "\n");
  console.log(rows.map(r => `${r.s.padEnd(12)} ${r.p.n}`).join("\n"));
  console.log(`\n${attention} of ${PROGRAMS.length} need a look. Report: ${path.join(ROOT, "program-check.md")}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `attention=${attention}\n`);
})();
