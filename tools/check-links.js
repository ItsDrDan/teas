#!/usr/bin/env node
/* Opens every outside link the hub shows (program pages, ATI, OpenStax, YouTube thumbnails) and reports the ones
   that fail. Needs internet, so it is not part of the normal check.   node tools/check-links.js
   A 403 from a college site usually means it blocks scripts, not that the page is gone: open it in a browser. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const urls = new Set();
for (const f of ["index.html", "practice.html", "README.md", "data/learn.json", "data/bank.js"]) {
  const txt = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").filter(l => l.length < 20000).join("\n");
  for (const m of txt.matchAll(/https?:\/\/[^\s"'`<>)\\]+/g)) { const u = m[0].replace(/[.,;]+$/, ""); if (!u.includes("${") && !/fonts\.g|w3\.org|creativecommons|\/books\/$/.test(u)) urls.add(u); }
}
const vids = [...fs.readFileSync(path.join(ROOT, "index.html"), "utf8").matchAll(/\["([\w-]{11})",\s*"/g)].map(m => "https://i.ytimg.com/vi/" + m[1] + "/mqdefault.jpg");
vids.forEach(u => urls.add(u));
(async () => {
  let bad = 0; const list = [...urls].sort();
  for (const u of list) {
    let note = "";
    try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(u, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (link check)" } }); clearTimeout(t);
      if (!r.ok) note = "HTTP " + r.status; else if (r.url.replace(/\/$/, "") !== u.replace(/\/$/, "") && new URL(r.url).pathname !== new URL(u).pathname) note = "moved to " + r.url;
    } catch (e) { note = e.name === "AbortError" ? "timed out" : "failed: " + e.message; }
    if (note) { if (!note.startsWith("moved")) bad++; console.log((note.startsWith("moved") ? "  → " : "  ✗ ") + u + "  (" + note + ")"); }
  }
  console.log(`\n${list.length} links checked, ${bad} need a look.`);
  process.exit(bad ? 1 : 0);
})();
