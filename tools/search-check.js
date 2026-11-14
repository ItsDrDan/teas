// Shared by tools/test-hub.js: run every query in tools/search-queries.json through the hub's real search.
// Each entry is [what a student might type, the unit that should come up] ("sc:9"), or a section ("ma").
module.exports = function (run, fs, path, ROOT) {
  run("SIDX=" + fs.readFileSync(path.join(ROOT, "data/search.json"), "utf8") + ";VOCAB=null;");
  const Q = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/search-queries.json"), "utf8"));
  const res = Q.map(([q, want]) => { const r = run("searchUnits(" + JSON.stringify(q) + ")"); const ks = r.out.map(x => x.u.s + ":" + x.u.u);
    const i = want.includes(":") ? ks.indexOf(want) : ks.findIndex(k => k.startsWith(want + ":")); return { q, want, i, ks: ks.slice(0, 3), fixed: r.fixed }; });
  return res;
};
