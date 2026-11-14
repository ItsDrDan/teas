/* TEAS Study Hub offline support.
   Pages and data: network first (so updates show up right away), falling back to the saved copy when
   offline or when the network takes too long. Art: saved copy first. The lists below are written by
   `node tools/build.js`; bump CACHE whenever pages or data change. */
const CACHE = "teas-hub-25";
const ART_CACHE = "teas-art-1"; // survives page updates, so pictures are downloaded once
const CORE = ["./", "index.html", "practice.html", "data/bank.js", "data/daily.json", "data/search.json", "data/learn.json", "data/glossary.json", "manifest.webmanifest"];
const ART = ["assets/b_century.webp","assets/b_clock.webp","assets/b_en10.webp","assets/b_first.webp","assets/b_full.webp","assets/b_ma10.webp","assets/b_mini.webp","assets/b_pass.webp","assets/b_prof.webp","assets/b_rd10.webp","assets/b_round.webp","assets/b_s10.webp","assets/b_s5.webp","assets/b_sc10.webp","assets/dg/abdregions.webp","assets/dg/brain.webp","assets/dg/cav.webp","assets/dg/cell.webp","assets/dg/ear.webp","assets/dg/endocrine.webp","assets/dg/express_bot.webp","assets/dg/express_top.webp","assets/dg/eye.webp","assets/dg/femrep.webp","assets/dg/gi.webp","assets/dg/heart.webp","assets/dg/joint.webp","assets/dg/learn_dgA_abdreg.webp","assets/dg/learn_dgA_brain.webp","assets/dg/learn_dgA_cav.webp","assets/dg/learn_dgA_conduct.webp","assets/dg/learn_dgA_ear.webp","assets/dg/learn_dgA_ecg.webp","assets/dg/learn_dgA_eye.webp","assets/dg/learn_dgA_feedback.webp","assets/dg/learn_dgA_gi.webp","assets/dg/learn_dgA_heart.webp","assets/dg/learn_dgA_neuron.webp","assets/dg/learn_dgA_planes.webp","assets/dg/learn_dgA_resp.webp","assets/dg/learn_dgB_endocrine.webp","assets/dg/learn_dgB_femrep.webp","assets/dg/learn_dgB_joint.webp","assets/dg/learn_dgB_longbone.webp","assets/dg/learn_dgB_lymph.webp","assets/dg/learn_dgB_malerep.webp","assets/dg/learn_dgB_muscle3.webp","assets/dg/learn_dgB_nephron.webp","assets/dg/learn_dgB_nines.webp","assets/dg/learn_dgB_sarcomere.webp","assets/dg/learn_dgB_skeleton.webp","assets/dg/learn_dgB_skin.webp","assets/dg/learn_dgB_thermo.webp","assets/dg/learn_dgB_urinary.webp","assets/dg/learn_dgC_atom.webp","assets/dg/learn_dgC_cell.webp","assets/dg/learn_dgC_dna.webp","assets/dg/learn_dgC_express.webp","assets/dg/learn_dgC_expt.webp","assets/dg/learn_dgC_lab.webp","assets/dg/learn_dgC_matter.webp","assets/dg/learn_dgC_meiosis.webp","assets/dg/learn_dgC_microbes.webp","assets/dg/learn_dgC_mitosis.webp","assets/dg/learn_dgC_ph.webp","assets/dg/learn_dgC_ptable.webp","assets/dg/learn_dgC_read.webp","assets/dg/learn_dgC_rxn.webp","assets/dg/letters_dgA_abdreg.webp","assets/dg/letters_dgA_brain.webp","assets/dg/letters_dgA_cav.webp","assets/dg/letters_dgA_conduct.webp","assets/dg/letters_dgA_ear.webp","assets/dg/letters_dgA_eye.webp","assets/dg/letters_dgA_gi.webp","assets/dg/letters_dgA_heart.webp","assets/dg/letters_dgA_neuron.webp","assets/dg/letters_dgA_planes.webp","assets/dg/letters_dgA_resp.webp","assets/dg/letters_dgB_endocrine.webp","assets/dg/letters_dgB_femrep.webp","assets/dg/letters_dgB_joint.webp","assets/dg/letters_dgB_longbone.webp","assets/dg/letters_dgB_lymph.webp","assets/dg/letters_dgB_malerep.webp","assets/dg/letters_dgB_muscle3.webp","assets/dg/letters_dgB_nephron.webp","assets/dg/letters_dgB_sarcomere.webp","assets/dg/letters_dgB_skeleton.webp","assets/dg/letters_dgB_skin.webp","assets/dg/letters_dgB_urinary.webp","assets/dg/letters_dgC_cell.webp","assets/dg/letters_dgC_microbes.webp","assets/dg/letters_dgC_mitosis.webp","assets/dg/longbone.webp","assets/dg/lymph.webp","assets/dg/malerep.webp","assets/dg/meiosis.webp","assets/dg/microbes.webp","assets/dg/mitosis.webp","assets/dg/muscle3.webp","assets/dg/nephron.webp","assets/dg/neuron.webp","assets/dg/nines.webp","assets/dg/ph.webp","assets/dg/planes.webp","assets/dg/resp.webp","assets/dg/sarcomere.webp","assets/dg/skeleton.webp","assets/dg/skin.webp","assets/dg/thermo.webp","assets/dg/urinary.webp","assets/icon_game_180.png","assets/icon_game_32.png","assets/icon_hub_180.png","assets/icon_hub_192.png","assets/icon_hub_32.png","assets/icon_hub_512.png","assets/icon_hub_maskable_512.png","assets/logo_game.webp","assets/logo_hub.webp","assets/m_daily5.webp","assets/m_full_length.webp","assets/m_mini.webp","assets/m_must_know.webp","assets/m_passage_sets.webp","assets/m_programs.webp","assets/m_progress.webp","assets/m_quick_drill.webp","assets/m_study_plan.webp","assets/m_timed.webp","assets/mascot_correct.webp","assets/mascot_idle.webp","assets/mascot_oops.webp","assets/mascot_reading.webp","assets/mascot_thinking.webp","assets/mascot_victory.webp","assets/sec_en.webp","assets/sec_ma.webp","assets/sec_rd.webp","assets/sec_sc.webp"];
const SLOW_MS = 4000;

self.addEventListener("install", e => {
  // {cache:"reload"} skips the browser's HTTP cache so a new version never saves an old page
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k.startsWith("teas-hub-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // Save the diagrams and icons for offline use. One missing or failed file must not block the rest.
    const art = await caches.open(ART_CACHE);
    const have = new Set((await art.keys()).map(r => r.url));
    for (const u of ART) {
      const url = new URL(u, self.registration.scope).href;
      if (have.has(url)) continue;
      try { const res = await fetch(url); if (res.ok) await art.put(url, res); } catch (err) { /* offline or blocked: it will be saved the first time it is viewed */ }
    }
  })());
});

// Data files carry a version stamp (data/bank.js?v=…). Save them under the plain name so old versions don't pile up.
const keyOf = req => { const u = new URL(req.url); return u.pathname.includes("/data/") ? u.origin + u.pathname : req; };
const put = (name, req, res) => { if (res && res.ok && res.type === "basic") { const cp = res.clone(); caches.open(name).then(c => c.put(keyOf(req), cp)).catch(() => {}); } return res; };
const offlineReply = () => new Response("Offline and not saved on this device.", {status: 503, statusText: "Offline", headers: {"Content-Type": "text/plain; charset=utf-8"}});

async function networkFirst(req, fallbackPage) {
  const cache = await caches.open(CACHE);
  const saved = async () => (await cache.match(keyOf(req))) || (await cache.match(req, {ignoreSearch: true})) || (fallbackPage ? await cache.match(fallbackPage) : undefined);
  // "no-cache" asks the server every time (a quick 304 when nothing changed), so the browser's own cache
  // can't hand back a page from before an update
  const net = fetch(req.url, {cache: "no-cache", credentials: "same-origin"}).then(res => put(CACHE, req, res));
  // on a very slow connection, show the saved copy now and let the download finish in the background
  const slow = new Promise(r => setTimeout(r, SLOW_MS)).then(saved);
  try {
    const first = await Promise.race([net, slow]);
    if (first) return first;
    return await net;
  } catch (err) {
    return (await saved()) || offlineReply();
  }
}
async function artFirst(req) {
  const hit = await caches.match(req, {ignoreSearch: true});
  if (hit) return hit;
  try { return put(ART_CACHE, req, await fetch(req)); } catch (err) { return offlineReply(); }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts, brand kit, videos and stats go straight to the network
  if (url.pathname.includes("/assets/")) { e.respondWith(artFirst(req)); return; }
  // A page falls back to the hub; data files never do, so the app sees a clear "offline" error instead of HTML.
  if (req.mode === "navigate") { e.respondWith(networkFirst(req, url.pathname.endsWith("practice.html") ? "practice.html" : "index.html")); return; }
  e.respondWith(networkFirst(req, null));
});
