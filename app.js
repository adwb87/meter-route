/* Meter Route — app. State, map, planning, UI. Logic that needs no DOM lives in core.js. */
(() => {
'use strict';
const C = window.Core;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();
const OSRM = 'https://router.project-osrm.org';

/* ───────── Icons ───────── */
const P = {
  nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  skip: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  locate: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  route: '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>',
  sliders: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2.2" fill="var(--surface)"/><circle cx="16" cy="12" r="2.2" fill="var(--surface)"/><circle cx="8" cy="18" r="2.2" fill="var(--surface)"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
  undo: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  chevR: '<polyline points="9 6 15 12 9 18"/>',
  chevD: '<polyline points="6 9 12 15 18 9"/>',
  chevL: '<polyline points="15 6 9 12 15 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/>',
  flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  up: '<polyline points="18 15 12 9 6 15"/>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'
};
const ico = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

/* ───────── Store ───────── */
const KEY = 'meterroute.v1';
const defSettings = () => ({ dwell: 10, nav: 'google', haptics: true, returnToStart: false, start: null, satellite: false });
function loadState() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j && typeof j === 'object') return { settings: { ...defSettings(), ...(j.settings || {}) }, route: j.route || null, history: Array.isArray(j.history) ? j.history : [], seq: j.seq || 1 };
  } catch (e) { /* ignore */ }
  return { settings: defSettings(), route: null, history: [], seq: 1 };
}
let S = loadState();
let saveT;
function saveNow() { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ } }
function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 120); }
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

const U = { tab: 'route', sel: null, hist: null, histMap: null, drop: null, paste: '', coord: '', coordName: '', parsed: [], gps: null, plan: null, planning: false, undo: null, snap: 'half', peekH: 190, howOpen: false, open: {} };

/* ───────── Haptics ───────── */
const Hap = {
  el: null,
  init() {
    const l = document.createElement('label');
    l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-120px;top:-120px;width:1px;height:1px;opacity:0;pointer-events:none';
    l.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.appendChild(l); this.el = l;
  },
  fire(kind) {
    if (!S.settings.haptics) return;
    const pat = { select: 8, tap: 12, success: [14, 50, 24], warn: [30, 60, 30], heavy: [50] }[kind] || 12;
    this.last = kind;
    try { if (navigator.vibrate) { navigator.vibrate(pat); return; } } catch (e) { /* ignore */ }
    try { this.el.click(); if (Array.isArray(pat) && pat.length > 1) setTimeout(() => this.el.click(), 90); } catch (e) { /* ignore */ }
  }
};
const hap = k => Hap.fire(k);

/* ───────── Helpers ───────── */
const isDesk = () => matchMedia('(min-width:900px)').matches;
const hasLoc = j => j && j.lat != null && j.lng != null;
const J = id => S.route && S.route.jobs.find(j => j.id === id);
const todoJobs = () => { const r = S.route; return r ? r.order.map(J).filter(j => j && j.status === 'todo' && hasLoc(j)) : []; };
const fmtDate = ms => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const toLocalInput = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const nextQuarter = () => { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15); return d.getTime(); };
const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const kfmt = p => p.lat.toFixed(5) + ',' + p.lng.toFixed(5);

function newRoute() {
  return { id: 'r' + now(), createdAt: now(), departAt: nextQuarter(), startedAt: null, status: 'planning', jobs: [], order: [], optimised: false,
    returnToStart: S.settings.returnToStart, dwell: S.settings.dwell, start: S.settings.start ? { ...S.settings.start } : null, plannedSec: 0 };
}
function normaliseOrder() {
  const r = S.route; if (!r) return;
  const ids = new Set(r.jobs.map(j => j.id));
  r.order = r.order.filter(id => ids.has(id));
  r.jobs.forEach(j => { if (!r.order.includes(j.id)) r.order.push(j.id); });
}

/* ───────── Toast / modal ───────── */
let toastT;
function toast(msg, opts = {}) {
  const t = $('#toast'); clearTimeout(toastT);
  t.innerHTML = `<span>${esc(msg)}</span>` + (opts.undo ? '<button data-act="undo">Undo</button>' : '');
  t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  toastT = setTimeout(() => { t.hidden = true; U.undo = null; }, opts.ms || (opts.undo ? 6000 : 2600));
}
function modal(html) { const m = $('#modalRoot'); m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; }
function closeModal() { const m = $('#modalRoot'); m.hidden = true; m.innerHTML = ''; }
$('#modalRoot').addEventListener('click', e => { if (e.target.id === 'modalRoot') closeModal(); });

/* ───────── Map ───────── */
const map = L.map('map', { zoomControl: false, attributionControl: false, tapTolerance: 18, zoomSnap: 0.5 }).setView([52.95, -1.5], 9);
L.control.attribution({ position: 'topleft', prefix: false }).addTo(map);
const tiles = {
  street: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, HERE, Garmin, OSM contributors' }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }),
  labels: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: .85 })
};
function applyBase() { [tiles.street, tiles.sat, tiles.labels].forEach(l => map.removeLayer(l)); if (S.settings.satellite) { tiles.sat.addTo(map); tiles.labels.addTo(map); } else tiles.street.addTo(map); $('[data-act="layers"]').classList.toggle('on', !!S.settings.satellite); }
const layer = L.layerGroup().addTo(map);
let routeLine = null, gpsMarker = null, gpsCircle = null, startMarker = null;

function pinIcon(cls, inner, size = 32) { return L.divIcon({ className: '', html: `<div class="pin ${cls}"><span>${inner}</span></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }); }

function syncMap() {
  layer.clearLayers();
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  if (startMarker) { startMarker = null; }
  if (U.histMap) { drawHistoryMap(); return; }
  const r = S.route; if (!r) return;
  const plan = U.plan, order = plan && plan.ids ? plan.ids : todoJobs().map(j => j.id);
  const nextId = r.status === 'running' && order.length ? order[0] : (order[0] || null);
  if (plan && plan.geom && plan.geom.length > 1 && order.length) {
    L.polyline(plan.geom, { color: '#fff', weight: 9, opacity: .9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer);
    routeLine = L.polyline(plan.geom, { color: '#0d7c91', weight: 5, opacity: .95, lineCap: 'round', lineJoin: 'round', dashArray: plan.geomEst ? '2 10' : null, interactive: false }).addTo(layer);
  }
  const org = origin();
  if (org && r.start && r.status === 'planning') {
    startMarker = L.marker([org.lat, org.lng], { icon: pinIcon('start', ico('home'), 34), draggable: true, zIndexOffset: 400, title: 'Start' }).addTo(layer);
    startMarker.on('dragend', () => { const p = startMarker.getLatLng(); setStart({ lat: p.lat, lng: p.lng, label: 'Start pin' }); });
  }
  r.jobs.forEach(j => {
    if (!hasLoc(j)) return;
    if (j.status === 'todo' && j.propLat != null && C.haversine({ lat: j.propLat, lng: j.propLng }, j) > 12) {
      L.polyline([[j.propLat, j.propLng], [j.lat, j.lng]], { color: '#475569', weight: 2, dashArray: '4 5', opacity: .9, interactive: false }).addTo(layer);
      L.marker([j.propLat, j.propLng], { icon: L.divIcon({ className: '', html: '<div class="prop"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), interactive: false, keyboard: false }).addTo(layer);
    }
    let cls = '', inner = '';
    const idx = order.indexOf(j.id);
    if (j.status === 'done') { cls = 'done'; inner = ico('check'); }
    else if (j.status === 'skipped') { cls = 'skip'; inner = '–'; }
    else { cls = idx === 0 ? 'next' : ''; inner = idx >= 0 ? idx + 1 : '•'; }
    if (j.src === 'pin') cls += ' free';
    if (U.sel === j.id) cls += ' sel';
    const size = cls.includes('next') ? 38 : 32;
    const m = L.marker([j.lat, j.lng], { icon: pinIcon(cls, inner, size), draggable: true, zIndexOffset: j.id === nextId ? 300 : (U.sel === j.id ? 500 : 100), title: j.name }).addTo(layer);
    m.on('click', () => selectJob(j.id, { pan: false }));
    m.on('dragstart', () => { hap('select'); });
    m.on('dragend', () => { const p = m.getLatLng(); movePin(j.id, p.lat, p.lng); });
  });
}

function drawHistoryMap() {
  const e = S.history.find(h => h.id === U.histMap); if (!e) return;
  const done = e.jobs.filter(j => j.status === 'done').sort((a, b) => a.doneAt - b.doneAt);
  const pts = []; if (e.start) pts.push([e.start.lat, e.start.lng]);
  done.forEach(j => { if (j.lat != null) pts.push([j.lat, j.lng]); });
  if (pts.length > 1) { L.polyline(pts, { color: '#fff', weight: 8, opacity: .9, interactive: false }).addTo(layer); L.polyline(pts, { color: '#15803d', weight: 4, opacity: .9, interactive: false }).addTo(layer); }
  done.forEach((j, i) => { if (j.lat != null) L.marker([j.lat, j.lng], { icon: pinIcon('done hist', i + 1, 26), interactive: false }).bindTooltip(j.name).addTo(layer); });
  e.jobs.filter(j => j.status !== 'done' && j.lat != null).forEach(j => L.marker([j.lat, j.lng], { icon: pinIcon('skip hist', '–', 26), interactive: false }).addTo(layer));
  const all = e.jobs.filter(j => j.lat != null).map(j => [j.lat, j.lng]);
  if (all.length) map.fitBounds(L.latLngBounds(all), { paddingTopLeft: [40, 80], paddingBottomRight: [isDesk() ? 40 : 84, sheetPad() + 24], maxZoom: 16 });
}

const sheetPad = () => (isDesk() ? 0 : $('#sheet').offsetHeight);
function focusLL(ll, z) {
  z = z || Math.max(map.getZoom(), 17);
  const pad = sheetPad() / 2;
  const pt = map.project(L.latLng(ll), z).add([0, pad]);
  map.setView(map.unproject(pt, z), z, { animate: true });
}
function fitAll() {
  const pts = todoJobs().map(j => [j.lat, j.lng]);
  const org = origin(); if (org) pts.push([org.lat, org.lng]);
  if (U.gps) pts.push([U.gps.lat, U.gps.lng]);
  if (!pts.length) { const r = S.route; if (r) r.jobs.filter(hasLoc).forEach(j => pts.push([j.lat, j.lng])); }
  if (!pts.length) return;
  map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 70], paddingBottomRight: [isDesk() ? 40 : 84, sheetPad() + 24], maxZoom: 17, animate: true });
}

map.on('click', e => {
  if (U.drop) { placePin(e.latlng); return; }
  if (!isDesk() && (U.snap === 'half' || U.snap === 'full')) setSnap('peek');
});
map.on('contextmenu', e => { if (!U.histMap) { hap('heavy'); placePin(e.latlng, true); } });

/* GPS */
function setGps(p) {
  U.gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: now() };
  const ll = [U.gps.lat, U.gps.lng];
  if (!gpsMarker) {
    gpsMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="gps"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
    gpsCircle = L.circle(ll, { radius: U.gps.acc, color: '#2563eb', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
  } else { gpsMarker.setLatLng(ll); gpsCircle.setLatLng(ll).setRadius(U.gps.acc); }
}
function locateMe(pan) {
  if (!navigator.geolocation) { toast('Location is not available on this device'); return Promise.resolve(null); }
  return new Promise(res => navigator.geolocation.getCurrentPosition(
    p => { setGps(p); if (pan) focusLL([U.gps.lat, U.gps.lng], 16); res(U.gps); },
    () => { toast('Could not get your location. Check location permission.'); res(null); },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 15000 }));
}
let watchId = null;
function syncWatch() {
  const want = S.route && S.route.status === 'running' && navigator.geolocation;
  if (want && watchId == null) watchId = navigator.geolocation.watchPosition(setGps, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
  if (!want && watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
}

/* ───────── Routing & planning ───────── */
const pairCache = new Map();
async function getJSON(url, ms = 12000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function getMatrix(pts) {
  const n = pts.length, keys = pts.map(kfmt);
  const T = Array.from({ length: n }, () => new Array(n).fill(0)), D = Array.from({ length: n }, () => new Array(n).fill(0));
  let missing = false;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const c = pairCache.get(keys[i] + '>' + keys[j]);
    if (c) { T[i][j] = c.t; D[i][j] = c.d; } else missing = true;
  }
  let est = false;
  if (missing && n > 1) {
    try {
      if (n > 90) throw new Error('too many');
      const coords = pts.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
      const j = await getJSON(`${OSRM}/table/v1/driving/${coords}?annotations=duration,distance`);
      if (j.code !== 'Ok') throw new Error(j.code);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        if (a === b) continue;
        let t = j.durations[a][b], d = j.distances[a][b];
        if (t == null || d == null) { d = C.haversine(pts[a], pts[b]) * 1.35; t = d / 11; est = true; }
        else pairCache.set(keys[a] + '>' + keys[b], { t, d });
        T[a][b] = t; D[a][b] = d;
      }
    } catch (e) {
      est = true;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b && !pairCache.has(keys[a] + '>' + keys[b])) { const d = C.haversine(pts[a], pts[b]) * 1.35; T[a][b] = d / 11; D[a][b] = d; }
    }
  }
  return { t: (i, j) => T[i][j], d: (i, j) => D[i][j], est };
}

function origin() {
  const r = S.route; if (!r) return null;
  if (r.status === 'running') {
    if (U.gps && now() - U.gps.t < 300000) return { lat: U.gps.lat, lng: U.gps.lng, label: 'My location' };
    const done = r.jobs.filter(j => j.status === 'done' && hasLoc(j)).sort((a, b) => b.doneAt - a.doneAt)[0];
    if (done) return { lat: done.lat, lng: done.lng, label: 'Last completed stop' };
  }
  return r.start ? { lat: r.start.lat, lng: r.start.lng, label: r.start.label || 'Start' } : null;
}

let planSeq = 0, replanT = null;
function replanSoon(opts) { clearTimeout(replanT); replanT = setTimeout(() => replan(opts), 500); }

async function replan({ reopt = false } = {}) {
  const r = S.route; const my = ++planSeq;
  if (!r) { U.plan = null; U.planning = false; render(); return; }
  normaliseOrder();
  let todo = todoJobs();
  if (!todo.length) { U.plan = { ids: [], legSeq: [], retLeg: { t: 0, d: 0 }, closed: false, hasStart: false, est: false, geom: null, sched: C.schedule([], () => ({ t: 0, d: 0 }), r.status === 'running' ? now() : r.departAt, 0, false, false) }; U.planning = false; render(); return; }
  U.planning = true; renderBody();
  const org = origin();
  const pts = [org || { lat: todo[0].lat, lng: todo[0].lng }, ...todo];
  const M = await getMatrix(pts);
  if (my !== planSeq) return;
  const nodeOf = new Map(todo.map((j, i) => [j.id, i + 1]));
  const cost = (i, j) => M.t(i, j);
  const closed = !!r.returnToStart && !!org;
  if (reopt || !r.optimised) {
    const o = C.optimise(todo.length, cost, { closed, freeStart: !org });
    todo = o.map(i => todo[i - 1]); r.optimised = true;
  } else {
    // cheapest insertion for jobs added since the last plan
    const fresh = todo.filter(j => j._new), base = todo.filter(j => !j._new);
    if (fresh.length) {
      fresh.forEach(f => {
        const fn = nodeOf.get(f.id); let best = null;
        for (let k = 0; k <= base.length; k++) {
          const prev = k === 0 ? 0 : nodeOf.get(base[k - 1].id), next = k === base.length ? (closed ? 0 : null) : nodeOf.get(base[k].id);
          const delta = cost(prev, fn) + (next == null ? 0 : cost(fn, next) - cost(prev, next));
          if (!best || delta < best.delta) best = { k, delta };
        }
        base.splice(best.k, 0, f);
      });
      todo = base;
    }
  }
  r.jobs.forEach(j => { delete j._new; });
  const nonTodo = r.order.filter(id => !todo.some(j => j.id === id));
  const done = nonTodo.map(J).filter(j => j && j.status === 'done').sort((a, b) => a.doneAt - b.doneAt).map(j => j.id);
  r.order = [...done, ...todo.map(j => j.id), ...nonTodo.filter(id => !done.includes(id))];
  const legSeq = []; let prev = 0;
  todo.forEach(j => { const nd = nodeOf.get(j.id); legSeq.push({ t: M.t(prev, nd), d: M.d(prev, nd) }); prev = nd; });
  const retLeg = closed ? { t: M.t(prev, 0), d: M.d(prev, 0) } : { t: 0, d: 0 };
  U.plan = { ids: todo.map(j => j.id), legSeq, retLeg, closed, hasStart: !!org, est: M.est, geom: null, originLabel: org ? org.label : null };
  rebuildSchedule();
  U.planning = false; save(); render();
  // road line (best effort)
  const linePts = (org ? [org] : []).concat(todo);
  if (closed) linePts.push(org);
  if (linePts.length > 1) {
    let geom = null, geomEst = false;
    try {
      const coords = linePts.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
      const j = await getJSON(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`, 15000);
      geom = j.routes[0].geometry.coordinates.map(([x, y]) => [y, x]);
    } catch (e) { geom = linePts.map(p => [p.lat, p.lng]); geomEst = true; }
    if (my === planSeq && U.plan) { U.plan.geom = geom; U.plan.geomEst = geomEst; syncMap(); }
  }
}
function rebuildSchedule() {
  const r = S.route, p = U.plan; if (!r || !p || !p.ids) return;
  const seq = p.ids.map((_, i) => i + 1);
  const base = r.status === 'running' ? now() : r.departAt;
  p.sched = C.schedule(seq, (a, b) => (b === 0 ? p.retLeg : p.legSeq[b - 1]), base, r.dwell * 60, p.closed, p.hasStart);
}

/* ───────── Job actions ───────── */
function mkJob(p) {
  const j = { id: 'j' + (S.seq++), ref: p.ref || '', name: p.name || 'Stop', addr: p.addr || '', postcode: p.postcode || '', notes: p.notes || '',
    e: p.e == null ? null : p.e, n: p.n == null ? null : p.n, propLat: p.lat == null ? null : p.lat, propLng: p.lng == null ? null : p.lng,
    lat: p.lat == null ? null : p.lat, lng: p.lng == null ? null : p.lng, src: p.src || 'xy', noteRef: p.noteRef || null, issues: p.issues ? [...p.issues] : [], status: 'todo' };
  if (p.noteRef && (p.noteRef.distFromXY == null || p.noteRef.distFromXY <= 1500)) { j.lat = p.noteRef.lat; j.lng = p.noteRef.lng; j.src = 'note'; }
  j.origLat = j.lat; j.origLng = j.lng; j.origSrc = j.src;
  return j;
}
function addJobs(list, { quiet } = {}) {
  if (!S.route) S.route = newRoute();
  const r = S.route; const fresh = []; let dup = 0;
  let upgraded = 0;
  list.forEach(p => {
    const same = p.ref && r.jobs.find(j => j.ref === p.ref);
    if (same) {
      // a corrected re-read replaces a job that was added with a bad or missing location
      if (p.lat != null && (same.src === 'postcode' || same.lat == null || (same.issues && same.issues.some(x => /misread/i.test(x))))) {
        const fixed = mkJob(p); Object.assign(same, { ...fixed, id: same.id, status: same.status }); same._new = r.status === 'running'; upgraded++;
      } else dup++;
      return;
    }
    if (p.lat != null && r.jobs.some(j => j.propLat != null && j.name === p.name && C.haversine({ lat: j.propLat, lng: j.propLng }, p) < 3)) { dup++; return; }
    const j = mkJob(p); j._new = r.status === 'running'; r.jobs.push(j); r.order.push(j.id); fresh.push(j);
  });
  if ((fresh.length || upgraded) && r.status === 'planning') r.optimised = false;
  save();
  if (!quiet) toast(fresh.length || upgraded ? `Added ${pl(fresh.length, 'job')}` + (upgraded ? ` · ${upgraded} corrected` : '') + (dup ? ` · ${dup} already in route` : '') : `Nothing new to add (${dup} already in route)`);
  if (fresh.length || upgraded) { hap('success'); U.tab = 'route'; U.paste = ''; U.parsed = []; U.coord = ''; U.coordName = ''; replan({}).then(() => fitAll()); verifyPostcodes(fresh); }
  return fresh;
}
async function verifyPostcodes(jobs) {
  const withPc = jobs.filter(j => /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(j.postcode));
  if (!withPc.length) return;
  try {
    const res = await fetch('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postcodes: withPc.map(j => j.postcode) }) });
    const data = await res.json(); let gained = false, changed = false;
    (data.result || []).forEach((it, i) => {
      const j = withPc[i]; if (!it || !it.result) return;
      const pc = { lat: it.result.latitude, lng: it.result.longitude }; j.pcLat = pc.lat; j.pcLng = pc.lng;
      if (j.propLat == null && j.lat == null) {
        j.propLat = j.lat = pc.lat; j.propLng = j.lng = pc.lng; j.src = 'postcode'; j.origLat = j.lat; j.origLng = j.lng; j.origSrc = 'postcode';
        j.issues = j.issues.filter(x => !/coordinates/i.test(x)); j.issues.push('Using the postcode centre. Drag the pin to the meter.'); gained = changed = true;
      } else if (j.propLat != null) {
        const d = C.haversine({ lat: j.propLat, lng: j.propLng }, pc);
        if (d > 6000 && !j.issues.some(x => /postcode/.test(x))) { j.issues.push(`Coordinates are ${(d / 1000).toFixed(0)} km from the postcode. Check the numbers.`); changed = true; }
      }
    });
    if (changed) { save(); if (gained) { const r = S.route; if (r && r.status === 'planning') r.optimised = false; replan({}); } else render(); }
  } catch (e) { /* offline: skip the check */ }
}

function setStatus(id, status) {
  const j = J(id), r = S.route; if (!j || !r) return;
  pushUndo(status === 'done' ? 'Marked done' : 'Skipped');
  j.status = status; j.doneAt = status === 'done' ? now() : null; j.skippedAt = status === 'skipped' ? now() : null;
  if (U.sel === id) U.sel = null;
  save(); hap(status === 'done' ? 'success' : 'warn');
  toast(status === 'done' ? `Done · ${j.name}` : `Skipped · ${j.name}`, { undo: true });
  replan({}).then(() => { const nx = todoJobs()[0]; if (nx && r.status === 'running') focusLL([nx.lat, nx.lng], Math.max(map.getZoom(), 16)); });
}
function restoreJob(id) {
  const j = J(id), r = S.route; if (!j || !r) return;
  j.status = 'todo'; j.doneAt = j.skippedAt = null;
  r.order = r.order.filter(x => x !== id); r.order.push(id); j._new = false;
  save(); hap('tap'); toast('Back in the route'); replan({});
}
function makeNext(id) {
  const r = S.route; if (!r) return; const todo = todoJobs(); if (!todo.length) return;
  r.order = r.order.filter(x => x !== id); const first = r.order.indexOf(todo.find(j => j.id !== id).id);
  r.order.splice(first < 0 ? 0 : first, 0, id); save(); hap('tap'); toast('Now the next stop'); replan({});
}
function removeJob(id) {
  const r = S.route; if (!r) return; pushUndo('Removed');
  r.jobs = r.jobs.filter(j => j.id !== id); r.order = r.order.filter(x => x !== id); if (U.sel === id) U.sel = null;
  save(); hap('warn'); closeModal(); toast('Removed', { undo: true });
  if (!r.jobs.length && r.status === 'planning') { S.route = null; U.plan = null; save(); render(); } else replan({});
}
function pushUndo(label) { const r = S.route; if (r) U.undo = { label, route: JSON.stringify(r) }; }
function doUndo() {
  if (!U.undo) return; const snap = JSON.parse(U.undo.route); S.route = snap; U.undo = null; save(); hap('tap'); $('#toast').hidden = true; replan({});
}
function movePin(id, lat, lng) {
  const j = J(id); if (!j) return;
  j.lat = lat; j.lng = lng; j.src = j.src === 'pin' ? 'pin' : 'moved';
  const g = C.latLngToEN(lat, lng); if (j.src === 'pin') { j.e = Math.round(g.e); j.n = Math.round(g.n); j.propLat = lat; j.propLng = lng; }
  j.issues = j.issues.filter(x => !/postcode centre/.test(x));
  hap('tap'); save(); toast(j.src === 'pin' ? 'Pin moved' : 'Pin moved. You can reset it in the stop details.'); replanSoon({ reopt: S.route.status === 'planning' }); render();
}
function placePin(ll, fromLong) {
  const d = U.drop; U.drop = null; updateBanner(); $('#map').classList.remove('dropping');
  if (d && d.type === 'start') { setStart({ lat: ll.lat, lng: ll.lng, label: 'Start pin' }); hap('success'); return; }
  if (d && d.type === 'job') {
    const j = J(d.id); if (j) { j.lat = j.propLat = j.origLat = ll.lat; j.lng = j.propLng = j.origLng = ll.lng; j.src = 'pin'; j.origSrc = 'pin'; j.issues = []; const g = C.latLngToEN(ll.lat, ll.lng); j.e = Math.round(g.e); j.n = Math.round(g.n); if (S.route.status === 'running') j._new = true; else S.route.optimised = false; save(); hap('success'); toast('Location set'); replan({}); }
    return;
  }
  if (!S.route) S.route = newRoute();
  const r = S.route, g = C.latLngToEN(ll.lat, ll.lng);
  const count = r.jobs.filter(j => j.src === 'pin').length + 1;
  const j = mkJob({ name: 'Pin ' + count, lat: ll.lat, lng: ll.lng, e: Math.round(g.e), n: Math.round(g.n), src: 'pin' });
  j._new = r.status === 'running'; r.jobs.push(j); r.order.push(j.id); if (r.status === 'planning') r.optimised = false;
  U.sel = j.id; U.tab = 'route'; save(); hap('success'); toast('Pin dropped. Drag it to adjust.'); replan({}); if (U.snap === 'full') setSnap('half');
}
function setStart(s) {
  S.settings.start = s; const r = S.route; if (r) { r.start = { ...s }; if (r.status === 'planning') r.optimised = false; }
  save(); toast('Start point set'); replan({}); closeModal();
}
function selectJob(id, { pan = true } = {}) {
  U.sel = id; U.tab = 'route'; U.hist = null; if (U.snap === 'peek' && !isDesk()) setSnap('half');
  render();
  const j = J(id); if (pan && j && hasLoc(j)) focusLL([j.lat, j.lng]);
  setTimeout(() => { const el = $(`.stop[data-id="${id}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
}

/* ───────── Route lifecycle ───────── */
async function startRoute() {
  const r = S.route; if (!r || !todoJobs().length) return;
  if (!r.start && !U.gps && navigator.geolocation) await locateMe(false);
  r.status = 'running'; r.startedAt = now(); r.plannedSec = U.plan && U.plan.sched ? U.plan.sched.totalSec : 0;
  U.sel = null; save(); syncWatch(); hap('heavy'); setSnap('peek');
  await replan({}); const nx = todoJobs()[0]; if (nx) focusLL([nx.lat, nx.lng], 16);
}
function legDist(a, b) { const c = pairCache.get(kfmt(a) + '>' + kfmt(b)); return c ? c.d : C.haversine(a, b) * 1.3; }
function finishRoute() {
  const r = S.route; if (!r) return;
  r.jobs.forEach(j => { if (j.status === 'todo') { j.status = 'skipped'; j.skippedAt = now(); j.unvisited = true; } });
  const done = r.jobs.filter(j => j.status === 'done' && hasLoc(j)).sort((a, b) => a.doneAt - b.doneAt);
  let distM = 0, prev = r.start && r.status === 'running' ? r.start : null;
  done.forEach(j => { if (prev) distM += legDist(prev, j); prev = j; });
  const finishedAt = now(), startedAt = r.startedAt || r.createdAt;
  const entry = { id: r.id, date: startedAt, startedAt, finishedAt, plannedSec: r.plannedSec || 0, distM, start: r.start || null, dwell: r.dwell,
    completed: r.jobs.filter(j => j.status === 'done').length, skipped: r.jobs.filter(j => j.status === 'skipped').length, total: r.jobs.length,
    jobs: r.jobs.map(j => ({ name: j.name, addr: j.addr, postcode: j.postcode, notes: j.notes, ref: j.ref, lat: j.lat, lng: j.lng, e: j.e, n: j.n, status: j.status, doneAt: j.doneAt || null, unvisited: !!j.unvisited, src: j.src })) };
  S.history.unshift(entry); S.route = null; U.plan = null; U.sel = null; U.undo = null; $('#toast').hidden = true; save(); syncWatch();
  hap('heavy'); render(); showResult(entry);
}

/* ───────── Views ───────── */
function startLabel(r) { const o = origin(); return r && r.start ? (r.start.label || 'Start set') : (o ? o.label : 'Not set'); }
function hlNotes(text) {
  let out = esc(text);
  C.findGridRefs(text).forEach(g => { const e = esc(g.raw); out = out.replace(e, `<span class="hl">${e}</span>`); });
  return out;
}
const srcChip = j => ({ note: '<span class="chip accent">' + ico('target') + 'Meter point from notes</span>', moved: '<span class="chip warn">Pin moved by you</span>', postcode: '<span class="chip warn">Postcode centre</span>', pin: '<span class="chip">Dropped pin</span>' }[j.src] || '');

function emptyRoute() {
  return `<div class="row sb" style="margin-bottom:6px"><div class="h1">Meter Route</div><button class="icon-btn" data-act="settings" aria-label="Settings">${ico('sliders')}</button></div><div id="peekEnd"></div>
  <div class="empty"><div class="art">${ico('route')}</div><h2>Plan your day in a minute</h2>
  <p>Photograph the job screens, read them with your phone's text reader, paste the text here. Every job lands on the map and the route orders itself.</p>
  <div class="stack" style="margin-top:18px"><button class="btn primary lg block" data-act="tab" data-tab="add">${ico('plus')} Add jobs</button>
  <button class="btn block" data-act="dropmode">${ico('pin')} Drop pins on the map</button>
  <button class="btn block ghost" data-act="sample">Try sample jobs</button></div></div>`;
}

function stopRow(j, i, p) {
  const st = p && p.sched ? p.sched.stops[i] : null;
  const selc = U.sel === j.id ? ' sel' : '';
  const next = i === 0;
  const issue = j.issues && j.issues.length ? `<span class="chip warn" style="margin-left:6px">Check</span>` : '';
  const eta = st ? `<div class="eta"><b>${C.fmtClock(st.arrive)}</b><span>${p.hasStart || i > 0 ? C.fmtDurShort(st.legT) + ' · ' + C.fmtMiles(st.legD) : 'first'}</span></div>` : `<div class="eta"><b class="skeleton">00:00</b></div>`;
  return `<div class="stop${selc}" data-act="sel" data-id="${j.id}"><div class="num${next && S.route.status === 'running' ? ' next' : ''}">${i + 1}</div>
    <div class="grow"><div class="t">${esc(j.name)}${issue}</div><div class="s">${esc(j.postcode)}${j.notes ? ' · ' + esc(j.notes) : ''}</div></div>${eta}</div>${U.sel === j.id ? stopDetail(j) : ''}`;
}
function stopDetail(j) {
  const r = S.route, running = r.status === 'running';
  const dms = hasLoc(j) ? C.dmsString(j.lat, j.lng) : '';
  const issues = (j.issues || []).map(x => `<div class="chip warn" style="white-space:normal">${esc(x)}</div>`).join('');
  return `<div class="stopx">
    ${j.addr ? `<div class="muted" style="font-size:13px">${esc(j.addr)} ${esc(j.postcode)}</div>` : ''}
    ${j.notes ? `<div class="notes">${hlNotes(j.notes)}</div>` : '<div class="faint">No notes on this job</div>'}
    <div class="row" style="flex-wrap:wrap;gap:6px">${srcChip(j)}</div>${issues}
    <div class="kv">${j.ref ? `<span>Ref ${esc(j.ref)}</span>` : ''}${j.e != null && j.src !== 'note' ? `<span>E ${j.e} · N ${j.n}</span>` : ''}${dms ? `<span>${esc(dms)}</span>` : ''}</div>
    <div class="acts">
      ${hasLoc(j) ? `<button class="btn primary sm" data-act="nav" data-id="${j.id}">${ico('nav')} Navigate</button>` : ''}
      ${hasLoc(j) && j.status === 'todo' ? `<button class="btn ok sm" data-act="done" data-id="${j.id}">${ico('check')} Done</button><button class="btn warn sm" data-act="skip" data-id="${j.id}">${ico('skip')} Skip</button>` : ''}
      ${hasLoc(j) && j.status === 'todo' && todoJobs()[0] && todoJobs()[0].id !== j.id ? `<button class="btn sm" data-act="makenext" data-id="${j.id}">${ico('up')} Make next</button>` : ''}
      ${j.status !== 'todo' ? `<button class="btn sm" data-act="restore" data-id="${j.id}">${ico('undo')} Put back</button>` : ''}
      <button class="btn sm" data-act="edit" data-id="${j.id}">${ico('edit')} Edit</button>
      ${!hasLoc(j) ? `<button class="btn primary sm" data-act="placejob" data-id="${j.id}">${ico('pin')} Place on map</button>` : ''}
    </div></div>`;
}

function groupBlock(key, title, jobs, rowFn) {
  if (!jobs.length) return '';
  const open = U.open[key];
  return `<div class="section-h" data-act="toggle" data-key="${key}" style="cursor:pointer"><div class="eyebrow">${title} · ${jobs.length}</div><span class="faint" style="transform:rotate(${open ? 180 : 0}deg);display:grid">${ico('chevD')}</span></div>${open ? jobs.map(rowFn).join('') : ''}`;
}
const plainRow = (j, label) => `<div class="stop dim${U.sel === j.id ? ' sel' : ''}" data-act="sel" data-id="${j.id}"><div class="num ${j.status === 'done' ? 'done' : j.status === 'skipped' ? 'skip' : 'noloc'}">${j.status === 'done' ? ico('check') : j.status === 'skipped' ? '–' : '?'}</div>
  <div class="grow"><div class="t">${esc(j.name)}</div><div class="s">${esc(j.postcode)}${j.doneAt ? ' · done ' + C.fmtClock(j.doneAt) : ''}${!hasLoc(j) ? ' · needs a location' : ''}</div></div>
  <button class="btn sm" data-act="${hasLoc(j) ? 'restore' : 'placejob'}" data-id="${j.id}">${hasLoc(j) ? 'Put back' : 'Place'}</button></div>${U.sel === j.id ? stopDetail(j) : ''}`;

function stopLists(r) {
  const p = U.plan, ids = p && p.ids ? p.ids : todoJobs().map(j => j.id);
  const todo = ids.map(J).filter(Boolean);
  const doneJ = r.jobs.filter(j => j.status === 'done').sort((a, b) => b.doneAt - a.doneAt);
  const skipJ = r.jobs.filter(j => j.status === 'skipped');
  const noLoc = r.jobs.filter(j => j.status === 'todo' && !hasLoc(j));
  const running = r.status === 'running';
  const list = running ? todo.slice(1) : todo;
  let html = '';
  if (list.length) html += `<div class="section-h"><div class="eyebrow">${running ? 'Up next' : 'Stops'} · ${list.length}</div>${running ? '' : '<span class="faint" style="font-size:12px">Tap a stop for details</span>'}</div>` + list.map((j, k) => stopRow(j, running ? k + 1 : k, p)).join('');
  html += groupBlock('noloc', 'Needs a location', noLoc, j => plainRow(j));
  html += groupBlock('skipped', 'Skipped', skipJ, j => plainRow(j));
  html += groupBlock('done', 'Done', doneJ, j => plainRow(j));
  return html;
}

function summaryChips(p, r) {
  if (!p || !p.sched) return '';
  const s = p.sched;
  return `<span class="chip">${ico('flag')}Finish ${C.fmtClock(s.finish)}</span><span class="chip">${ico('route')}${C.fmtMiles(s.distM)}</span><span class="chip">${ico('pin')}${pl(p.ids.length, 'stop')}</span>${p.est ? '<span class="chip">Estimated</span>' : ''}`;
}

function viewPlanning(r) {
  const p = U.plan, s = p && p.sched, todo = todoJobs().length;
  const total = s && todo ? C.fmtDur(s.totalSec) : '—';
  return `<div class="row sb" style="margin-bottom:12px"><div class="eyebrow">${esc(fmtDate(r.departAt))} · route plan</div>
    <div class="row" style="gap:2px"><button class="icon-btn" data-act="reoptimise" aria-label="Re-optimise">${ico('refresh')}</button><button class="icon-btn" data-act="settings" aria-label="Settings">${ico('sliders')}</button></div></div>
  <div class="hero"><div class="eyebrow">Estimated time for this route</div>
    <div class="big ${U.planning && !s ? 'skeleton' : ''}" style="margin-top:6px">${esc(total)}</div>
    <div class="meta">${U.planning && !s ? '<span class="chip"><span class="spin"></span> Working out the best order</span>' : summaryChips(p, r)}</div>
    <button class="btn nav block lg" data-act="start" ${todo ? '' : 'disabled'}>${ico('nav')} Start route</button></div><div id="peekEnd"></div>
  ${s && todo ? `<div class="stats"><div class="stat"><b>${C.fmtDur(s.driveSec)}</b><span>Driving</span></div><div class="stat"><b>${C.fmtDur(s.dwellSec)}</b><span>On site</span></div><div class="stat"><b>${C.fmtClock(r.departAt)}</b><span>Leave</span></div></div>` : ''}
  <div class="card" style="margin-top:14px"><div class="setgrid" style="margin-top:0">
    <div class="field full"><label for="depart">Departure</label><input class="input" id="depart" type="datetime-local" value="${toLocalInput(r.departAt)}" data-in="depart"></div>
    <div class="field"><label>Start point</label><button class="btn sm" data-act="startopts" style="justify-content:flex-start">${ico('home')}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(startLabel(r))}</span></button></div>
    <div class="field"><label>Time at each stop</label><div class="stepper"><button data-act="dwell" data-d="-1" aria-label="Less time">−</button><b>${r.dwell} min</b><button data-act="dwell" data-d="1" aria-label="More time">+</button></div></div>
    <div class="setrow full"><div><b>Return to start</b><div class="faint" style="font-size:12px">Include the drive back at the end</div></div><button class="switch ${r.returnToStart ? 'on' : ''}" data-act="return" aria-label="Return to start" role="switch" aria-checked="${r.returnToStart}"></button></div>
  </div></div>${stopLists(r)}`;
}

function viewRunning(r) {
  const p = U.plan, s = p && p.sched, todo = todoJobs();
  const done = r.jobs.filter(j => j.status === 'done').length, skipped = r.jobs.filter(j => j.status === 'skipped').length, total = r.jobs.length;
  const next = todo[0], st = s && s.stops[0];
  const pct = n => total ? (n / total * 100).toFixed(1) : 0;
  const head = `<div class="row sb" style="margin-bottom:10px"><div class="grow"><div class="eyebrow">Route in progress · started ${C.fmtClock(r.startedAt)}</div>
    <div style="font-weight:700;margin-top:2px">${done} of ${total} done${skipped ? ` · ${skipped} skipped` : ''}${s && todo.length ? ` · finish ≈ ${C.fmtClock(s.finish)}` : ''}</div></div>
    <div class="row" style="gap:2px"><button class="icon-btn" data-act="reoptimise" aria-label="Re-optimise">${ico('refresh')}</button><button class="icon-btn" data-act="settings" aria-label="Settings">${ico('sliders')}</button></div></div>
    <div class="progress" style="margin-bottom:14px"><i class="p-done" style="width:${pct(done)}%"></i><i class="p-skip" style="width:${pct(skipped)}%"></i></div>`;
  let hero;
  if (next) {
    hero = `<div class="hero"><div class="row sb"><div class="eyebrow">Next stop · ${done + skipped + 1} of ${total}</div>${st ? `<span class="chip">${ico('clock')}${C.fmtClock(st.arrive)}</span>` : ''}</div>
      <div class="name">${esc(next.name)}</div><div class="addr">${esc([next.addr && next.addr !== next.name ? next.addr.replace(next.name + ', ', '') : '', next.postcode].filter(Boolean).join(' · '))}</div>
      <div class="meta">${st ? `<span class="chip">${C.fmtDurShort(st.legT)} drive</span><span class="chip">${C.fmtMiles(st.legD)}</span>` : ''}${next.src === 'note' ? '<span class="chip">Meter point from notes</span>' : ''}${next.src === 'moved' ? '<span class="chip">Pin moved</span>' : ''}${p && p.est ? '<span class="chip">Estimated</span>' : ''}</div>
      ${next.notes ? `<div class="notes">${hlNotes(next.notes)}</div>` : ''}
      <button class="btn nav block lg" data-act="nav" data-id="${next.id}">${ico('nav')} Navigate</button>
      <div class="acts"><button class="btn done" data-act="done" data-id="${next.id}">${ico('check')} Done</button><button class="btn" data-act="skip" data-id="${next.id}">${ico('skip')} Skip</button></div></div>`;
  } else {
    hero = `<div class="hero idle"><div class="eyebrow">${done + skipped === total ? 'Every stop handled' : 'Nothing left to route'}</div><div class="name" style="margin-top:6px">${done} of ${total} completed</div>
      <button class="btn primary block lg" style="margin-top:14px" data-act="finish">${ico('flag')} Finish route</button></div>`;
  }
  return head + hero + '<div id="peekEnd"></div>' + stopLists(r) +
    `<div class="stack" style="margin-top:22px"><button class="btn block" data-act="reoptimise">${ico('refresh')} Re-optimise remaining stops</button><button class="btn block ghost" data-act="finish">${ico('flag')} Finish route</button></div>`;
}

function viewRoute() { const r = S.route; if (!r || !r.jobs.length) return emptyRoute(); return r.status === 'running' ? viewRunning(r) : viewPlanning(r); }

function viewAdd() {
  return `<div class="row sb" style="margin-bottom:6px"><div class="h1">Add jobs</div><button class="icon-btn" data-act="settings" aria-label="Settings">${ico('sliders')}</button></div><div id="peekEnd"></div>
  <div class="stack" style="margin-top:12px">
   <div class="card"><div class="h2">Paste text from your photos</div><p class="muted" style="font-size:13.5px;margin:4px 0 12px">Run the Shortcut on your job photos, then paste the result here. Each job is picked out, converted and checked.</p>
     <textarea class="input" id="paste" data-in="paste" placeholder="Paste the text here" spellcheck="false" autocapitalize="off">${esc(U.paste)}</textarea>
     <div class="row" style="margin-top:10px"><button class="btn sm" data-act="pasteclip">${ico('clip')} Paste</button>${U.paste ? `<button class="btn sm ghost" data-act="clearpaste">Clear</button>` : ''}</div>
     <div id="pvBox">${previewHtml()}</div></div>
   <details class="how" ${U.howOpen ? 'open' : ''} data-act="how"><summary>One-time setup: the Shortcut ${ico('chevD')}</summary>
     <ol><li>Open <b>Shortcuts</b> on your iPhone and tap <code>+</code>.</li><li>Add <b>Select Photos</b> and switch on <b>Select Multiple</b>.</li><li>Add <b>Extract Text from Image</b>.</li><li>Add <b>Combine Text</b>. Set it to <b>Custom</b> and type <code>=====</code> as the separator.</li><li>Add <b>Copy to Clipboard</b>. Name it <b>Read jobs</b>.</li></ol>
     <p class="faint" style="font-size:12.5px;margin-top:10px">Run it, pick your job photos, then come back here and tap Paste. The reading happens on the phone. Nothing is uploaded.</p></details>
   <div class="card"><div class="h2">Add one by coordinates</div><p class="muted" style="font-size:13.5px;margin:4px 0 12px">Type easting and northing, a grid reference like <b>SK 418944 340367</b>, or latitude and longitude.</p>
     <div class="stack" style="gap:8px"><input class="input" id="coord" data-in="coord" placeholder="418977 340437" value="${esc(U.coord)}" inputmode="text" autocapitalize="characters"><input class="input" id="coordName" data-in="coordName" placeholder="Name (optional)" value="${esc(U.coordName)}">
     <button class="btn primary" data-act="addcoord">${ico('plus')} Add to route</button></div></div>
   <div class="card"><div class="h2">Drop pins freely</div><p class="muted" style="font-size:13.5px;margin:4px 0 12px">Tap the map to drop a pin, or press and hold anywhere. Drag any pin to move it.</p><button class="btn" data-act="dropmode">${ico('pin')} Drop a pin</button></div>
  </div>`;
}
function previewHtml() {
  const list = U.parsed; if (!U.paste.trim()) return '';
  if (!list.length) return `<div class="chip warn" style="margin-top:12px;white-space:normal">Couldn't find any jobs in that text. Check you pasted the whole result.</div>`;
  const good = list.filter(j => j.lat != null).length;
  return `<div style="margin-top:14px"><div class="row sb"><div class="h2">Found ${pl(list.length, 'job')}</div>${good < list.length ? `<span class="chip warn">${list.length - good} need checking</span>` : '<span class="chip ok">All plotted</span>'}</div>
   ${list.map(j => `<div class="pv"><div class="num ${j.lat == null ? 'noloc' : ''}">${j.lat == null ? '?' : ico('check')}</div><div class="grow"><div class="t">${esc(j.name)}</div><div class="s">${esc(j.postcode)}${j.e != null ? ` · E ${j.e} N ${j.n}` : ''}</div>
     <div class="tag">${j.noteRef ? `<span class="chip accent">${ico('target')}Meter point in notes</span>` : ''}${j.issues.map(x => `<span class="chip warn" style="white-space:normal">${esc(x)}</span>`).join('')}</div></div></div>`).join('')}
   <button class="btn primary lg block" style="margin-top:12px" data-act="addparsed">${ico('plus')} Add ${pl(list.length, 'job')} to route</button></div>`;
}

function viewHistory() {
  if (U.hist) return viewHistDetail(S.history.find(h => h.id === U.hist));
  if (!S.history.length) return `<div class="h1" style="margin-bottom:6px">History</div><div id="peekEnd"></div><div class="empty"><div class="art">${ico('history')}</div><h2>No finished routes yet</h2><p>When you finish a route it is saved here, with how many stops you completed and how long it took.</p></div>`;
  return `<div class="h1" style="margin-bottom:4px">History</div><div id="peekEnd"></div><div class="muted" style="font-size:13px;margin-bottom:12px">${pl(S.history.length, 'route')} saved on this phone</div><div class="stack">` +
    S.history.map(h => `<button class="hcard" data-act="histopen" data-id="${h.id}"><div class="row sb"><div class="eyebrow">${esc(fmtDate(h.date))}</div><span class="chip ${h.completed === h.total ? 'ok' : ''}">${h.completed} of ${h.total}</span></div>
      <div class="big2" style="margin-top:6px">${C.fmtDur((h.finishedAt - h.startedAt) / 1000)}</div><div class="muted" style="font-size:13px">${C.fmtClock(h.startedAt)}–${C.fmtClock(h.finishedAt)} · ${C.fmtMiles(h.distM)}${h.skipped ? ` · ${h.skipped} skipped` : ''}</div></button>`).join('') + '</div>';
}
function viewHistDetail(h) {
  if (!h) { U.hist = null; return viewHistory(); }
  const done = h.jobs.filter(j => j.status === 'done').sort((a, b) => a.doneAt - b.doneAt), skip = h.jobs.filter(j => j.status !== 'done');
  const actual = (h.finishedAt - h.startedAt) / 1000, avg = done.length ? actual / done.length : 0;
  return `<div class="row" style="margin-bottom:6px"><button class="icon-btn" data-act="histback" aria-label="Back">${ico('chevL')}</button><div class="grow"><div class="eyebrow">${esc(fmtDate(h.date))}</div><div class="h2">${h.completed} of ${h.total} stops completed</div></div></div><div id="peekEnd"></div>
   <div class="stats"><div class="stat"><b>${C.fmtDur(actual)}</b><span>Time taken</span></div><div class="stat"><b>${C.fmtMiles(h.distM)}</b><span>Driving</span></div><div class="stat"><b>${avg ? C.fmtDur(avg) : '—'}</b><span>Per stop</span></div></div>
   ${h.plannedSec ? `<div class="muted" style="font-size:13px;margin-top:10px">Planned ${C.fmtDur(h.plannedSec)} · took ${C.fmtDur(actual)} · ${C.fmtClock(h.startedAt)} to ${C.fmtClock(h.finishedAt)}</div>` : ''}
   <div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn sm primary" data-act="histmap" data-id="${h.id}">${ico('pin')} Show on map</button>${skip.length ? `<button class="btn sm" data-act="histreuse" data-id="${h.id}" data-w="skipped">${ico('undo')} Re-plan ${skip.length} skipped</button>` : ''}<button class="btn sm" data-act="histreuse" data-id="${h.id}" data-w="all">${ico('refresh')} Repeat route</button></div>
   <div class="section-h"><div class="eyebrow">Completed · ${done.length}</div></div>
   ${done.map((j, i) => `<div class="stop" style="cursor:default"><div class="num done">${i + 1}</div><div class="grow"><div class="t">${esc(j.name)}</div><div class="s">${esc(j.postcode)}</div></div><div class="eta"><b>${C.fmtClock(j.doneAt)}</b></div></div>`).join('')}
   ${skip.length ? `<div class="section-h"><div class="eyebrow">Skipped · ${skip.length}</div></div>` + skip.map(j => `<div class="stop dim" style="cursor:default"><div class="num skip">–</div><div class="grow"><div class="t">${esc(j.name)}</div><div class="s">${esc(j.postcode)}${j.unvisited ? ' · not reached' : ''}</div></div></div>`).join('') : ''}
   <button class="btn bad block" style="margin-top:20px" data-act="histdel" data-id="${h.id}">${ico('trash')} Delete this route</button>`;
}

/* ───────── Render ───────── */
function render() { renderTabs(); renderBody(); renderChrome(); syncMap(); syncWatch(); }
function renderTabs() {
  const defs = [['route', 'route', 'Route'], ['add', 'plus', 'Add jobs'], ['history', 'history', 'History']];
  $$('#tabs button').forEach((b, i) => { b.innerHTML = ico(defs[i][1]) + `<span>${defs[i][2]}</span>`; b.classList.toggle('on', U.tab === defs[i][0]); b.dataset.tab = defs[i][0]; });
}
function renderBody() {
  const body = $('#sheetBody');
  const viewKey = [U.tab, U.hist || '', S.route ? S.route.status : 'none', S.route && S.route.jobs.length ? 'jobs' : 'empty'].join('|');
  const top = viewKey === U.viewKey ? body.scrollTop : 0; U.viewKey = viewKey;
  const focusId = document.activeElement && document.activeElement.id;
  const html = U.tab === 'route' ? viewRoute() : U.tab === 'add' ? viewAdd() : viewHistory();
  body.innerHTML = html; body.scrollTop = top;
  if (focusId && ['paste', 'coord', 'coordName'].includes(focusId)) { const el = document.getElementById(focusId); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ } } }
  measurePeek();
}
function renderChrome() {
  $('[data-act="layers"]').innerHTML = ico('layers'); $('[data-act="locate"]').innerHTML = ico('locate'); $('[data-act="fit"]').innerHTML = ico('fit');
  const dm = $('[data-act="dropmode"]'); dm.innerHTML = ico('pin'); dm.classList.toggle('on', !!U.drop);
  updateBanner();
}
function updateBanner() {
  const b = $('#banner'); let msg = '', act = 'canceldrop', label = 'Cancel';
  if (U.histMap) { msg = 'Viewing a past route'; act = 'closehistmap'; label = 'Close'; }
  else if (U.drop) { const d = U.drop; msg = d.type === 'start' ? 'Tap the map to set your start' : d.type === 'job' ? `Tap the map to place “${(J(d.id) || {}).name || 'stop'}”` : 'Tap the map to drop a pin'; }
  if (!msg) { b.hidden = true; return; }
  b.hidden = false; b.innerHTML = `<span>${esc(msg)}</span><button data-act="${act}">${label}</button>`;
  $('#map').classList.toggle('dropping', !!U.drop);
}
function measurePeek() {
  if (isDesk()) return;
  const mk = $('#peekEnd'), navH = $('#tabs').offsetHeight;
  U.peekH = Math.min(innerHeight * .62, 26 + (mk ? mk.offsetTop : 90) + 12 + navH);
  if (U.snap === 'peek') layoutSheet();
}

/* ───────── Sheet snapping ───────── */
const snapH = s => { const H = innerHeight; return s === 'full' ? Math.round(H * .92) : s === 'half' ? Math.round(Math.max(H * .5, Math.min(H * .6, U.peekH + 60))) : Math.round(U.peekH); };
function layoutSheet() {
  const sh = $('#sheet'), app = $('#app');
  if (isDesk()) { sh.style.height = ''; app.style.setProperty('--sheet-h', '100%'); app.classList.remove('sheet-full'); return; }
  const h = snapH(U.snap); sh.style.height = h + 'px'; sh.dataset.snap = U.snap; app.style.setProperty('--sheet-h', h + 'px'); app.classList.toggle('sheet-full', U.snap === 'full');
}
function setSnap(s) { U.snap = s; layoutSheet(); }
(function dragSetup() {
  const grab = $('#grab'), sh = $('#sheet'); let y0, h0, moved, tY;
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; h0 = sh.offsetHeight; moved = false; tY = e.timeStamp; sh.classList.add('dragging'); grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', e => { if (y0 == null) return; const dy = y0 - e.clientY; if (Math.abs(dy) > 4) moved = true; const h = Math.max(U.peekH * .8, Math.min(innerHeight * .94, h0 + dy)); sh.style.height = h + 'px'; $('#app').style.setProperty('--sheet-h', h + 'px'); });
  const end = e => {
    if (y0 == null) return; sh.classList.remove('dragging');
    const dy = y0 - e.clientY, dt = Math.max(1, e.timeStamp - tY), v = dy / dt; y0 = null;
    if (!moved) { setSnap(U.snap === 'peek' ? 'half' : U.snap === 'half' ? 'full' : 'half'); hap('select'); return; }
    const h = sh.offsetHeight, opts = ['peek', 'half', 'full'].map(s => [s, Math.abs(snapH(s) - (h + v * 160))]).sort((a, b) => a[1] - b[1]);
    setSnap(opts[0][0]); hap('select');
  };
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
})();
addEventListener('resize', () => { layoutSheet(); map.invalidateSize(); });

/* ───────── Modals ───────── */
function settingsModal() {
  const s = S.settings;
  modal(`<div class="head"><div class="h1">Settings</div><button class="icon-btn" data-act="closemodal" aria-label="Close">${ico('x')}</button></div>
   <div class="stack" style="gap:18px">
    <div class="setrow"><div><b>Haptic feedback</b><div class="faint" style="font-size:12px">Taps, done, skip and finish</div></div><button class="switch ${s.haptics ? 'on' : ''}" data-act="sethaptics" role="switch" aria-checked="${s.haptics}" aria-label="Haptics"></button></div>
    <div class="field"><label>Navigation app</label><div class="row" style="gap:8px">${[['google', 'Google'], ['apple', 'Apple'], ['waze', 'Waze']].map(([k, n]) => `<button class="btn sm ${s.nav === k ? 'primary' : ''}" style="flex:1" data-act="setnav" data-v="${k}">${n}</button>`).join('')}</div></div>
    <div class="setrow"><div><b>Default time at each stop</b><div class="faint" style="font-size:12px">Used for new routes</div></div><div class="stepper"><button data-act="setdwell" data-d="-1">−</button><b>${s.dwell} min</b><button data-act="setdwell" data-d="1">+</button></div></div>
    <div class="setrow"><div><b>Return to start by default</b></div><button class="switch ${s.returnToStart ? 'on' : ''}" data-act="setreturn" role="switch" aria-checked="${s.returnToStart}" aria-label="Return to start"></button></div>
    <div class="field"><label>Home / start point</label><div class="row" style="gap:8px"><button class="btn sm" style="flex:1" data-act="startopts">${ico('home')} ${s.start ? esc(s.start.label || 'Set') : 'Not set'}</button></div></div>
    <button class="btn bad" data-act="clearall">${ico('trash')} Erase all data on this phone</button>
   </div>`);
}
function startOptsModal() {
  modal(`<div class="head"><div class="h1">Start point</div><button class="icon-btn" data-act="closemodal" aria-label="Close">${ico('x')}</button></div>
   <p class="muted" style="margin-bottom:14px">Where you set off from. Drive times and the route order are worked out from here.</p>
   <div class="stack" style="gap:10px"><button class="btn lg" data-act="startgps">${ico('locate')} Use my current location</button><button class="btn lg" data-act="startdrop">${ico('pin')} Drop it on the map</button>${S.settings.start ? `<button class="btn ghost" data-act="startclear">Clear start point</button>` : ''}</div>`);
}
function editModal(id) {
  const j = J(id); if (!j) return;
  modal(`<div class="head"><div class="h1">Edit stop</div><button class="icon-btn" data-act="closemodal" aria-label="Close">${ico('x')}</button></div>
   <div class="stack" style="gap:14px"><div class="field"><label for="e_name">Name</label><input class="input" id="e_name" value="${esc(j.name)}"></div>
   <div class="field"><label for="e_notes">Notes</label><textarea class="input" id="e_notes" style="min-height:90px;font-family:inherit;font-size:15px">${esc(j.notes)}</textarea></div>
   ${j.noteRef && j.propLat != null ? `<div class="field"><label>Navigate to</label><div class="row" style="gap:8px"><button class="btn sm ${j.src === 'note' ? 'primary' : ''}" style="flex:1" data-act="srcpick" data-id="${j.id}" data-v="note">Meter point (${esc(j.noteRef.raw)})</button><button class="btn sm ${j.src === 'xy' ? 'primary' : ''}" style="flex:1" data-act="srcpick" data-id="${j.id}" data-v="xy">Property X/Y</button></div></div>` : ''}
   <div class="row" style="gap:10px"><div class="field grow"><label for="e_e">Easting (X)</label><input class="input" id="e_e" inputmode="numeric" value="${j.e == null ? '' : j.e}"></div><div class="field grow"><label for="e_n">Northing (Y)</label><input class="input" id="e_n" inputmode="numeric" value="${j.n == null ? '' : j.n}"></div></div>
   ${hasLoc(j) ? `<div class="faint" style="font-size:12.5px">${esc(C.dmsString(j.lat, j.lng))} · <a href="https://www.google.com/maps/search/?api=1&query=${j.lat},${j.lng}" target="_blank" rel="noopener" style="color:var(--accent)">Check in Google Maps</a></div>` : ''}
   ${j.src === 'moved' ? `<button class="btn sm warn" data-act="resetpin" data-id="${j.id}">${ico('undo')} Reset pin to original position</button>` : ''}
   </div><div class="foot"><button class="btn bad" data-act="remove" data-id="${j.id}">${ico('trash')}</button><button class="btn primary" style="flex:3" data-act="saveedit" data-id="${j.id}">Save</button></div>`);
}
function reoptModal() {
  const r = S.route, sk = r.jobs.filter(j => j.status === 'skipped' && hasLoc(j)).length, org = origin();
  modal(`<div class="head"><div class="h1">Re-optimise</div><button class="icon-btn" data-act="closemodal" aria-label="Close">${ico('x')}</button></div>
   <p class="muted">Re-order the ${pl(todoJobs().length, 'remaining stop')} to find the quickest way round${org ? ` from <b>${esc(org.label.toLowerCase())}</b>` : ''}.</p>
   ${sk ? `<div class="setrow" style="margin-top:16px"><div><b>Also include ${pl(sk, 'skipped stop')}</b></div><button class="switch" id="incSkip" data-act="toggleinc" role="switch" aria-checked="false" aria-label="Include skipped"></button></div>` : ''}
   <div class="foot"><button class="btn" data-act="closemodal">Cancel</button><button class="btn primary" data-act="doreopt">${ico('refresh')} Re-optimise</button></div>`);
}
function finishModal() {
  const r = S.route, todo = r.jobs.filter(j => j.status === 'todo').length, done = r.jobs.filter(j => j.status === 'done').length;
  modal(`<div class="head"><div class="h1">Finish route?</div><button class="icon-btn" data-act="closemodal" aria-label="Close">${ico('x')}</button></div>
   <p class="muted">${done} of ${r.jobs.length} stops completed.${todo ? ` The ${pl(todo, 'stop')} you haven't reached will be saved as skipped.` : ''}</p>
   <div class="foot"><button class="btn" data-act="closemodal">Keep going</button><button class="btn primary" data-act="dofinish">${ico('flag')} Finish &amp; save</button></div>`);
}
function showResult(h) {
  const actual = (h.finishedAt - h.startedAt) / 1000;
  modal(`<div class="celebrate"><div class="ring">${ico('check')}</div><div class="eyebrow">Route complete</div><div class="num-big">${h.completed}<span style="font-size:26px;color:var(--ink-3);letter-spacing:-.02em"> / ${h.total}</span></div><div class="muted" style="margin-top:4px">${h.completed === h.total ? 'Every stop completed' : `${pl(h.completed, 'stop')} completed`}</div></div>
   <div class="stats"><div class="stat"><b>${C.fmtDur(actual)}</b><span>Time taken</span></div><div class="stat"><b>${C.fmtMiles(h.distM)}</b><span>Driving</span></div><div class="stat"><b>${h.skipped}</b><span>Skipped</span></div></div>
   ${h.plannedSec ? `<div class="muted" style="text-align:center;font-size:13px;margin-top:10px">Planned ${C.fmtDur(h.plannedSec)} · ${C.fmtClock(h.startedAt)} to ${C.fmtClock(h.finishedAt)}</div>` : ''}
   <div class="foot" style="flex-direction:column">${h.skipped ? `<button class="btn" data-act="histreuse" data-id="${h.id}" data-w="skipped">${ico('undo')} Plan a new route with the ${h.skipped} skipped</button>` : ''}<button class="btn primary lg" data-act="viewhist" data-id="${h.id}">View in history</button></div>`);
}
function confirmDlg(title, body, okLabel, act, extra = '') {
  modal(`<div class="head"><div class="h1">${esc(title)}</div></div><p class="muted">${esc(body)}</p><div class="foot"><button class="btn" data-act="closemodal">Cancel</button><button class="btn bad" data-act="${act}" ${extra}>${esc(okLabel)}</button></div>`);
}

/* ───────── Navigation links ───────── */
function navUrl(j) {
  const a = j.lat.toFixed(6), b = j.lng.toFixed(6), n = S.settings.nav;
  if (n === 'apple') return `https://maps.apple.com/?daddr=${a},${b}&dirflg=d`;
  if (n === 'waze') return `https://waze.com/ul?ll=${a},${b}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${a},${b}&travelmode=driving`;
}

/* ───────── Events ───────── */
const A = {
  tab(el) { U.tab = el.dataset.tab; U.hist = null; U.histMap = null; hap('select'); if (U.snap === 'peek' && !isDesk()) setSnap('half'); render(); $('#sheetBody').scrollTop = 0; },
  layers() { S.settings.satellite = !S.settings.satellite; save(); applyBase(); hap('select'); },
  locate() { hap('tap'); locateMe(true); },
  fit() { hap('select'); fitAll(); },
  dropmode() { hap('tap'); U.drop = U.drop ? null : { type: 'new' }; renderChrome(); if (U.drop && U.snap !== 'peek' && !isDesk()) setSnap('peek'); },
  canceldrop() { U.drop = null; renderChrome(); },
  sel(el) { hap('select'); const id = el.dataset.id; if (U.sel === id) { U.sel = null; render(); } else selectJob(id); },
  nav(el) { const j = J(el.dataset.id); if (!j || !hasLoc(j)) return; hap('tap'); window.open(navUrl(j), '_blank', 'noopener'); },
  done(el) { setStatus(el.dataset.id, 'done'); },
  skip(el) { setStatus(el.dataset.id, 'skipped'); },
  restore(el) { restoreJob(el.dataset.id); },
  makenext(el) { makeNext(el.dataset.id); },
  placejob(el) { U.drop = { type: 'job', id: el.dataset.id }; hap('tap'); renderChrome(); if (!isDesk()) setSnap('peek'); },
  edit(el) { hap('tap'); editModal(el.dataset.id); },
  undo() { doUndo(); },
  toggle(el) { const k = el.dataset.key; U.open[k] = !U.open[k]; hap('select'); renderBody(); },
  start() { startRoute(); },
  reoptimise() {
    hap('tap'); const r = S.route; if (!r) return;
    if (r.status === 'running') reoptModal(); else { r.optimised = false; replan({ reopt: true }); toast('Route re-optimised'); }
  },
  toggleinc(el) { const on = el.classList.toggle('on'); el.setAttribute('aria-checked', on); hap('select'); },
  async doreopt() {
    const inc = $('#incSkip') && $('#incSkip').classList.contains('on'); closeModal(); const r = S.route;
    if (inc) r.jobs.forEach(j => { if (j.status === 'skipped' && hasLoc(j)) { j.status = 'todo'; j.skippedAt = null; } });
    if (navigator.geolocation) await locateMe(false);
    hap('success'); await replan({ reopt: true }); toast('Route re-optimised from ' + ((origin() || {}).label || 'start').toLowerCase());
    const nx = todoJobs()[0]; if (nx) focusLL([nx.lat, nx.lng], Math.max(map.getZoom(), 15));
  },
  dwell(el) { const r = S.route; r.dwell = Math.max(1, Math.min(180, r.dwell + +el.dataset.d)); hap('select'); rebuildSchedule(); save(); renderBody(); },
  return() { const r = S.route; r.returnToStart = !r.returnToStart; hap('select'); r.optimised = false; save(); replan({ reopt: true }); },
  startopts() { hap('tap'); startOptsModal(); },
  async startgps() { const g = await locateMe(true); if (g) setStart({ lat: g.lat, lng: g.lng, label: 'My location' }); },
  startdrop() { closeModal(); U.drop = { type: 'start' }; renderChrome(); if (!isDesk()) setSnap('peek'); },
  startclear() { S.settings.start = null; if (S.route) { S.route.start = null; S.route.optimised = false; } save(); closeModal(); replan({ reopt: true }); },
  finish() { hap('tap'); const r = S.route; if (!r) return; if (r.jobs.some(j => j.status === 'todo')) finishModal(); else finishRoute(); },
  dofinish() { closeModal(); finishRoute(); },
  settings() { hap('tap'); settingsModal(); },
  closemodal() { closeModal(); },
  sethaptics() { S.settings.haptics = !S.settings.haptics; save(); if (S.settings.haptics) hap('success'); settingsModal(); },
  setnav(el) { S.settings.nav = el.dataset.v; save(); hap('select'); settingsModal(); },
  setdwell(el) { S.settings.dwell = Math.max(1, Math.min(180, S.settings.dwell + +el.dataset.d)); save(); hap('select'); settingsModal(); },
  setreturn() { S.settings.returnToStart = !S.settings.returnToStart; save(); hap('select'); settingsModal(); },
  clearall() { confirmDlg('Erase everything?', 'This deletes the current route, your history and your settings from this phone. It cannot be undone.', 'Erase all', 'doclear'); },
  doclear() { localStorage.removeItem(KEY); S = loadState(); U.plan = null; U.sel = null; U.hist = null; U.histMap = null; closeModal(); applyBase(); render(); toast('All data erased'); },
  sample() { addJobs(window.SAMPLE_JOBS ? C.parseJobs(window.SAMPLE_JOBS) : []); },
  pasteclip: async () => { try { const t = await navigator.clipboard.readText(); if (!t) { toast('Clipboard is empty'); return; } U.paste = t; hap('tap'); parseNow(); renderBody(); } catch (e) { toast('Press and hold in the box, then choose Paste'); $('#paste') && $('#paste').focus(); } },
  clearpaste() { U.paste = ''; U.parsed = []; renderBody(); },
  addparsed() { addJobs(U.parsed); },
  addcoord() {
    const p = C.parseCoordInput(U.coord); if (!p) { hap('warn'); toast('Could not read those coordinates'); return; }
    addJobs([{ name: U.coordName.trim() || 'Stop at ' + (p.kind === 'latlng' ? p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) : Math.round(p.e) + ' ' + Math.round(p.n)), lat: p.lat, lng: p.lng, e: Math.round(p.e), n: Math.round(p.n), src: 'xy' }]);
  },
  how(el, e) { /* details toggles itself; remember state */ setTimeout(() => { U.howOpen = el.open; }, 0); },
  histopen(el) { hap('select'); U.hist = el.dataset.id; renderBody(); $('#sheetBody').scrollTop = 0; },
  histback() { U.hist = null; U.histMap = null; render(); },
  histmap(el) { U.histMap = el.dataset.id; hap('tap'); setSnap('peek'); render(); },
  closehistmap() { U.histMap = null; render(); fitAll(); },
  viewhist(el) { closeModal(); U.tab = 'history'; U.hist = el.dataset.id; if (U.snap === 'peek' && !isDesk()) setSnap('half'); render(); },
  histdel(el) { confirmDlg('Delete this route?', 'It will be removed from your history.', 'Delete', 'dohistdel', `data-id="${el.dataset.id}"`); },
  dohistdel(el) { S.history = S.history.filter(h => h.id !== el.dataset.id); U.hist = null; U.histMap = null; save(); closeModal(); hap('warn'); render(); toast('Route deleted'); },
  histreuse(el) {
    const h = S.history.find(x => x.id === el.dataset.id); if (!h) return; closeModal();
    const list = h.jobs.filter(j => (el.dataset.w === 'all' || j.status !== 'done') && j.lat != null).map(j => ({ name: j.name, addr: j.addr, postcode: j.postcode, notes: j.notes, ref: '', lat: j.lat, lng: j.lng, e: j.e, n: j.n, src: j.src === 'note' || j.src === 'moved' ? 'moved' : j.src }));
    U.hist = null; U.histMap = null; U.tab = 'route';
    const fresh = addJobs(list, { quiet: true }); toast(`${pl(fresh.length, 'job')} added to your route`);
    fresh.forEach(j => { j.origLat = j.lat; j.origLng = j.lng; });
  },
  srcpick(el) {
    const j = J(el.dataset.id); if (!j) return;
    if (el.dataset.v === 'note') { j.lat = j.noteRef.lat; j.lng = j.noteRef.lng; j.src = 'note'; } else { j.lat = j.propLat; j.lng = j.propLng; j.src = 'xy'; }
    j.origLat = j.lat; j.origLng = j.lng; j.origSrc = j.src; hap('select'); save(); editModal(j.id); if (S.route.status === 'planning') S.route.optimised = false; replan({});
  },
  resetpin(el) { const j = J(el.dataset.id); if (!j) return; j.lat = j.origLat; j.lng = j.origLng; j.src = j.origSrc; hap('tap'); save(); editModal(j.id); replan({});},
  remove(el) { removeJob(el.dataset.id); },
  saveedit(el) {
    const j = J(el.dataset.id); if (!j) return;
    j.name = $('#e_name').value.trim() || j.name; j.notes = $('#e_notes').value.trim();
    const ev = $('#e_e').value.trim(), nv = $('#e_n').value.trim();
    if (ev && nv && !C.inGB(+ev, +nv)) { hap('warn'); toast('Those numbers are outside Great Britain'); return; }
    let moved = false;
    if (ev && nv && (+ev !== j.e || +nv !== j.n)) {
      const p = C.enToLatLng(+ev, +nv); j.e = +ev; j.n = +nv; j.propLat = j.lat = j.origLat = p.lat; j.propLng = j.lng = j.origLng = p.lng; j.src = j.origSrc = 'xy'; j.issues = []; j.noteRef = null; moved = true;
    }
    const refs = C.findGridRefs(j.notes);
    if (refs.length && (moved || !j.noteRef || j.noteRef.raw !== refs[0].raw)) {
      const q = C.enToLatLng(refs[0].e, refs[0].n), d = j.propLat != null ? C.haversine({ lat: j.propLat, lng: j.propLng }, q) : 0;
      j.noteRef = { e: refs[0].e, n: refs[0].n, lat: q.lat, lng: q.lng, raw: refs[0].raw, distFromXY: d };
      if (d <= 1500) { j.lat = j.origLat = q.lat; j.lng = j.origLng = q.lng; j.src = j.origSrc = 'note'; moved = true; }
    }
    if (moved && S.route.status === 'planning') S.route.optimised = false;
    save(); closeModal(); hap('success'); replan({}); toast('Saved');
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.tagName === 'DETAILS') { A.how(el, e); return; }
  if (el.matches('summary') || e.target.closest('summary')) return;
  const f = A[el.dataset.act]; if (!f) return;
  if (el.closest('.stop') && e.target.closest('button') && e.target.closest('button') !== el) return; // inner buttons handle themselves
  e.stopPropagation(); f(el, e);
});
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.in; if (!k) return;
  if (k === 'paste') { U.paste = e.target.value; clearTimeout(parseT); parseT = setTimeout(() => { parseNow(); const b = $('#pvBox'); if (b) b.innerHTML = previewHtml(); }, 250); }
  if (k === 'coord') U.coord = e.target.value;
  if (k === 'coordName') U.coordName = e.target.value;
});
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.in === 'depart') {
    const t = new Date(e.target.value).getTime(); const r = S.route; if (!r || isNaN(t)) return;
    r.departAt = t; save(); hap('select'); rebuildSchedule(); renderBody();
  }
});
let parseT; function parseNow() { U.parsed = C.parseJobs(U.paste); }

/* ───────── Boot ───────── */
function boot() {
  Hap.init(); applyBase(); layoutSheet();
  normaliseOrder();
  render(); setSnap(S.route && S.route.status === 'running' ? 'peek' : 'half');
  if (S.route && S.route.jobs.length) replan({}).then(() => { if (!U.sel) fitAll(); });
  setInterval(() => { const r = S.route; if (r && r.status === 'running' && U.plan && !document.hidden && $('#modalRoot').hidden && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) { rebuildSchedule(); if (U.tab === 'route') renderBody(); } }, 30000);
  if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.MeterRoute = { S: () => S, U, map, A, replan, addJobs, C };
boot();
})();
