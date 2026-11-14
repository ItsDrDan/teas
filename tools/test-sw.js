#!/usr/bin/env node
/* Runs sw.js (the offline service worker) against a stand-in browser: a fake cache store and a network that
   can be switched off, made slow, or made to return errors. It reads the real site files from disk.
   node tools/test-sw.js      (needs Node 18+ for Request/Response)
   This checks the worker's logic. It is not a substitute for trying the installed app on a real phone. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, ".."), ORIGIN = "https://itsdrdan.github.io", SCOPE = ORIGIN + "/teas/";
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log("  ✗ " + m); } };

/* ---- fake Cache Storage ---- */
const stores = new Map();
const keyOf = r => new URL(typeof r === "string" ? r : r.url, SCOPE).href;
const noSearch = u => u.split("?")[0];
class FakeCache {
  constructor() { this.m = new Map(); }
  async match(req, o = {}) { const k = keyOf(req); if (this.m.has(k)) return this.m.get(k).clone(); if (o.ignoreSearch) for (const [u, r] of this.m) if (noSearch(u) === noSearch(k)) return r.clone(); return undefined; }
  async put(req, res) { this.m.set(keyOf(req), res); }
  async add(req) { const res = await net(req); if (!res.ok) throw new TypeError("bad response " + res.status); await this.put(req, res); }
  async addAll(reqs) { for (const r of reqs) await this.add(r); }
  async keys() { return [...this.m.keys()].map(u => ({ url: u })); }
}
const caches = {
  async open(n) { if (!stores.has(n)) stores.set(n, new FakeCache()); return stores.get(n); },
  async keys() { return [...stores.keys()]; },
  async delete(n) { return stores.delete(n); },
  async match(req, o) { for (const c of stores.values()) { const r = await c.match(req, o); if (r) return r; } return undefined; }
};
/* ---- fake network backed by the repo ---- */
const TYPES = { ".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const NET = { mode: "online", broken: new Set(), log: [], inits: [] };
async function net(req, init) {
  NET.inits.push(init || null);
  return net0(req, init);
}
async function net0(req) {
  const url = new URL(typeof req === "string" ? req : req.url, SCOPE); NET.log.push(url.pathname);
  if (NET.mode === "offline") throw new TypeError("Failed to fetch");
  if (NET.mode === "slow") await new Promise(r => setTimeout(r, 6000));
  if (NET.broken.has(url.pathname)) throw new TypeError("Failed to fetch");
  let rel = decodeURIComponent(url.pathname.replace(/^\/teas\//, "")) || "index.html";
  const f = path.join(ROOT, rel);
  const mk = (body, status, type) => { const r = new Response(body, { status, headers: { "Content-Type": type } }); Object.defineProperty(r, "type", { value: "basic" }); Object.defineProperty(r, "url", { value: url.href }); return r; };
  if (NET.mode === "404" || !f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return mk("<!DOCTYPE html><title>404</title>Not found", 404, "text/html");
  return mk(fs.readFileSync(f), 200, TYPES[path.extname(f)] || "application/octet-stream");
}
/* ---- run the worker ---- */
const handlers = {};
const self = { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, registration: { scope: SCOPE } };
class ScopedRequest extends Request { constructor(u, o) { super(typeof u === "string" ? new URL(u, SCOPE).href : u, o && o.cache ? {} : o); } } // a worker resolves relative URLs against its own folder
const ctx = vm.createContext({ self, caches, fetch: net, Request: ScopedRequest, Response, URL, Promise, setTimeout, console, location: { origin: ORIGIN } });
vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), ctx, { filename: "sw.js" });
const fire = async type => { let p; handlers[type]({ waitUntil: x => { p = x; } }); await p; };
const get = async (rel, mode = "cors") => { let p = null; const req = new Request(new URL(rel, SCOPE).href); Object.defineProperty(req, "mode", { value: mode });
  handlers.fetch({ request: req, respondWith: x => { p = x; } }); return p ? await p : null; };
const CACHE = vm.runInContext("CACHE", ctx), ART = vm.runInContext("ART", ctx), CORE = vm.runInContext("CORE", ctx);

(async () => {
  console.log("Install and activate");
  stores.set("teas-hub-1", new FakeCache()); // an old version that must be cleared
  await fire("install");
  ok(stores.has(CACHE) && stores.get(CACHE).m.size === CORE.length, `install saved ${stores.get(CACHE) ? stores.get(CACHE).m.size : 0} of ${CORE.length} core files`);
  NET.broken.add("/teas/" + ART[3]); // one picture fails to download
  await fire("activate");
  ok(!stores.has("teas-hub-1"), "an old page cache was not removed");
  const art = stores.get("teas-art-1");
  ok(art && art.m.size === ART.length - 1, `activate saved ${art ? art.m.size : 0} pictures; expected ${ART.length - 1} (one download was made to fail)`);
  NET.broken.clear(); await fire("activate");
  ok(art.m.size === ART.length, "a second activation did not pick up the picture that failed the first time");
  const before = NET.log.length; await fire("activate");
  ok(NET.log.length === before, `pictures already saved were downloaded again (${NET.log.length - before} requests)`);
  ok(ART.length > 100, `the offline art list has only ${ART.length} files`);

  console.log("Online");
  let r = await get("practice.html?mode=full", "navigate"); ok(r.status === 200 && /Scrub In/.test(await r.text()), "online page load failed");
  r = await get("data/learn.json"); ok(r.status === 200 && (await r.json()).units.length === 47, "online data load failed");
  ok(NET.inits.at(-1) && NET.inits.at(-1).cache === "no-cache", "pages and data are fetched without checking the server, so a browser-cached old copy can be shown after an update");
  ok((await get("https://fonts.googleapis.com/css2?family=Nunito")) === null, "an outside request was intercepted");

  r = await get("data/bank.js?v=abc123"); ok(r.status === 200 && /const Q = \[/.test(await r.text()), "the versioned bank did not load online");
  await new Promise(res => setTimeout(res, 20));
  const bankKeys = [...stores.get(CACHE).m.keys()].filter(k => k.includes("bank.js"));
  ok(bankKeys.length === 1 && !bankKeys[0].includes("?"), `the bank is saved under ${bankKeys.length} names (${bankKeys.join(", ")}); old versions would pile up`);

  console.log("Offline");
  NET.mode = "offline";
  r = await get("practice.html?mode=full&section=sc", "navigate"); ok(r.status === 200 && /Scrub In/.test(await r.text()), "Scrub In did not open offline (with a query string)");
  r = await get("index.html", "navigate"); ok(r.status === 200 && /TEAS Study Hub/.test(await r.text()), "the hub did not open offline");
  r = await get("", "navigate"); ok(r.status === 200 && /TEAS Study Hub/.test(await r.text()), "the site root did not open offline");
  r = await get("some-old-page.html", "navigate"); ok(r.status === 200 && /TEAS Study Hub/.test(await r.text()), "an unknown page did not fall back to the hub offline");
  r = await get("data/bank.js?v=some-newer-stamp"); ok(r.status === 200 && /const Q = \[/.test(await r.text()), "the question bank was not available offline under a new version stamp");
  for (const f of ["data/daily.json", "data/search.json", "data/learn.json", "data/glossary.json"]) { r = await get(f); let good = false; try { good = r.status === 200 && typeof (await r.json()) === "object"; } catch (e) {} ok(good, `${f} was not served as JSON offline`); }
  r = await get("data/not-saved.json"); const body = await r.text();
  ok(r.status === 503 && !/<html|<!doctype/i.test(body), `a data file that was never saved came back as status ${r.status} with ${/<html|<!doctype/i.test(body) ? "an HTML page" : "text"}; it must be a plain 503 so the app shows its offline message`);
  r = await get(ART.find(a => a.includes("/dg/"))); ok(r.status === 200 && r.headers.get("Content-Type") === "image/webp", "a diagram that was never viewed is not available offline");
  r = await get("assets/dg/none.webp"); ok(r.status === 503, "a missing picture offline did not return a clean error");

  console.log("Bad responses and slow connections");
  NET.mode = "404";
  r = await get("data/learn.json"); ok(r.status === 404, "a 404 from the server was hidden");
  NET.mode = "offline";
  r = await get("data/learn.json"); let stillGood = false; try { stillGood = (await r.json()).units.length === 47; } catch (e) {}
  ok(stillGood, "a 404 reply overwrote the saved copy of learn.json");
  NET.mode = "slow"; const t0 = Date.now();
  r = await get("practice.html", "navigate"); const waited = Date.now() - t0;
  ok(r.status === 200 && waited < 5500, `on a stalled connection the saved page took ${waited} ms to appear (limit is about 4 s)`);

  console.log(`\n${fails ? "✗ " + fails + " of " + checks + " offline checks failed" : "✓ all " + checks + " offline checks passed"}`);
  process.exit(fails ? 1 : 0);
})();
