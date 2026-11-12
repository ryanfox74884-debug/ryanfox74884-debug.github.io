/* Sillage service worker: offline app shell, morning pick, notification buttons (phone + Galaxy Watch). */
const VERSION = 'sillage-125c33d500';
const SHELL = ['./', './index.html', './manifest.webmanifest', './core.js', './icon-192.png', './icon-512.png', './badge-96.png'];
importScripts('./core.js');

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'sillage-fonts').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { // network first, offline falls back to the cached app
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.origin === location.origin) { e.respondWith(caches.match(req).then((hit) => hit || fetch(req))); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { // fonts: cache after first load
    e.respondWith(caches.open('sillage-fonts').then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { c.put(req, r.clone()); return r; }))));
  }
  // Weather and climate APIs always go to the network (the app keeps its own copy of the latest forecast).
});

const kv = () => self.FPI.KV.idbBackend();
const wearingOpts = (d, body) => ({ body: body || 'How strong does it seem right now? Tap any time; it’s logged against the hour.', tag: 'wearing', silent: true, icon: 'icon-192.png', badge: 'badge-96.png',
  data: Object.assign({}, d, { type: 'wearing' }), actions: [{ action: 'strong', title: 'Still noticeable' }, { action: 'faint', title: 'Faint / gone' }] });

async function queue(item) { const db = await kv(); const inbox = (await db.get('fpi.inbox')) || []; inbox.push(item); await db.set('fpi.inbox', inbox); }
async function tellClients() { const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); cs.forEach((c) => c.postMessage({ type: 'inbox' })); return cs; }
async function openApp(hash) {
  const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (cs.length) { await cs[0].focus(); cs[0].postMessage({ type: 'inbox' }); return; }
  await self.clients.openWindow('./#' + (hash || 'today'));
}

self.addEventListener('notificationclick', (e) => {
  const n = e.notification, d = n.data || {}; n.close();
  e.waitUntil((async () => {
    const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.type === 'sotd' && e.action === 'wear') {
      await queue({ type: 'wear', fragId: d.fragId, date: d.date, at: Date.now() });
      await self.registration.showNotification(`Wearing ${d.name}`, wearingOpts({ date: d.date, name: d.name }, `Logged as today’s wear at ${t}. Tap a button later to check in.`));
      await tellClients(); return;
    }
    if (d.type === 'wearing' && (e.action === 'strong' || e.action === 'faint')) {
      await queue({ type: 'checkin', level: e.action === 'strong' ? 3 : 1, at: Date.now(), date: d.date });
      await self.registration.showNotification(`Wearing ${d.name}`, wearingOpts(d, `Check-in saved at ${t}: ${e.action === 'strong' ? 'still noticeable' : 'faint or gone'}. Tap again later.`));
      await tellClients(); return;
    }
    await openApp(d.type === 'wearing' ? 'journal' : 'today');
  })());
});

// Morning pick on days you don't open the app (Android decides the exact timing; roughly once a day)
self.addEventListener('periodicsync', (e) => { if (e.tag === 'sillage-morning') e.waitUntil(morning()); });
async function morning() {
  const F = self.FPI, db = await kv();
  const settings = await db.get('fpi.settings'); if (!settings || !settings.notify || settings.notify.morning === false) return;
  const today = F.U.dateKey(); const h = new Date().getHours(); const n = (await db.get('fpi.notify')) || {};
  if (n.date === today || h < 5 || h >= 12) return;
  const frags = Object.values((await db.get('fpi.frags')) || {}), journal = Object.values((await db.get('fpi.journal')) || {});
  let weather = null; try { weather = await F.Weather.fetchForecast(settings.location); } catch (err) { /* score without weather */ }
  const full = Object.assign(F.Catalog.defaultSettings(), settings);
  const rec = F.Engine.recommend({ settings: full, frags, journal, weather, date: today, occasion: 'day' });
  const r = rec.primary; if (!r) return;
  const w = weather && weather.current;
  await self.registration.showNotification(`Scent of the day: ${r.frag.name}`, { body: `${r.sprays} spray${r.sprays > 1 ? 's' : ''} · ${r.application.spots.slice(0, 2).join(', ').toLowerCase()}${w ? ` · ${Math.round(w.tempF)}°F, dew ${Math.round(w.dewF)}°` : ''}`,
    tag: 'sotd', icon: 'icon-192.png', badge: 'badge-96.png', data: { type: 'sotd', fragId: r.id, name: r.frag.name, date: today, sprays: r.sprays },
    actions: [{ action: 'wear', title: 'Wear it' }, { action: 'open', title: 'See options' }] });
  await db.set('fpi.notify', Object.assign(n, { date: today }));
}
