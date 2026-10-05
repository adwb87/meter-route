/* Meter Route — core logic (pure functions, no DOM). Works in browser (window.Core) and Node (module.exports). */
(function (root) {
  'use strict';

  const RAD = Math.PI / 180, DEG = 180 / Math.PI;

  /* ───────── Coordinates: OSGB36 grid <-> WGS84 ───────── */
  const AIRY = { a: 6377563.396, b: 6356256.909 };
  const WGS = { a: 6378137, b: 6356752.314245 };
  // OSGB36 -> WGS84 Helmert (position vector); same values as proj4 towgs84
  const H = { tx: 446.448, ty: -125.157, tz: 542.06, s: -20.489, rx: 0.15, ry: 0.247, rz: 0.842 };

  function helmert(x, y, z, p) {
    const s = p.s / 1e6 , rx = (p.rx / 3600) * RAD, ry = (p.ry / 3600) * RAD, rz = (p.rz / 3600) * RAD;
    return [
      p.tx + x * (1 + s) - y * rz + z * ry,
      p.ty + x * rz + y * (1 + s) - z * rx,
      p.tz - x * ry + y * rx + z * (1 + s)
    ];
  }
  function toCart(phi, lam, el) {
    const e2 = 1 - (el.b * el.b) / (el.a * el.a);
    const nu = el.a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    return [nu * Math.cos(phi) * Math.cos(lam), nu * Math.cos(phi) * Math.sin(lam), nu * (1 - e2) * Math.sin(phi)];
  }
  function toGeo(x, y, z, el) {
    const e2 = 1 - (el.b * el.b) / (el.a * el.a);
    const p = Math.hypot(x, y);
    let phi = Math.atan2(z, p * (1 - e2));
    for (let i = 0; i < 8; i++) {
      const nu = el.a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
      phi = Math.atan2(z + e2 * nu * Math.sin(phi), p);
    }
    return [phi, Math.atan2(y, x)];
  }

  const TM = { F0: 0.9996012717, phi0: 49 * RAD, lam0: -2 * RAD, N0: -100000, E0: 400000 };

  function gridToAiry(E, N) {
    const { a, b } = AIRY, { F0, phi0, lam0, N0, E0 } = TM;
    const e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;
    let phi = phi0, M = 0;
    do {
      phi = (N - N0 - M) / (a * F0) + phi;
      const Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (phi - phi0);
      const Mb = (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(phi - phi0) * Math.cos(phi + phi0);
      const Mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (phi - phi0)) * Math.cos(2 * (phi + phi0));
      const Md = (35 / 24) * n3 * Math.sin(3 * (phi - phi0)) * Math.cos(3 * (phi + phi0));
      M = b * F0 * (Ma - Mb + Mc - Md);
    } while (Math.abs(N - N0 - M) >= 1e-5);
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const nu = (a * F0) / Math.sqrt(1 - e2 * sinP * sinP);
    const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinP * sinP, 1.5);
    const eta2 = nu / rho - 1;
    const tanP = Math.tan(phi), tan2 = tanP * tanP, tan4 = tan2 * tan2, tan6 = tan4 * tan2;
    const secP = 1 / cosP, nu3 = nu ** 3, nu5 = nu ** 5, nu7 = nu ** 7;
    const VII = tanP / (2 * rho * nu);
    const VIII = (tanP / (24 * rho * nu3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
    const IX = (tanP / (720 * rho * nu5)) * (61 + 90 * tan2 + 45 * tan4);
    const X = secP / nu;
    const XI = (secP / (6 * nu3)) * (nu / rho + 2 * tan2);
    const XII = (secP / (120 * nu5)) * (5 + 28 * tan2 + 24 * tan4);
    const XIIA = (secP / (5040 * nu7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);
    const dE = E - E0;
    const lat = phi - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
    const lon = lam0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;
    return [lat, lon];
  }

  function airyToGrid(phi, lam) {
    const { a, b } = AIRY, { F0, phi0, lam0, N0, E0 } = TM;
    const e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const nu = (a * F0) / Math.sqrt(1 - e2 * sinP * sinP);
    const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinP * sinP, 1.5);
    const eta2 = nu / rho - 1;
    const Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (phi - phi0);
    const Mb = (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(phi - phi0) * Math.cos(phi + phi0);
    const Mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (phi - phi0)) * Math.cos(2 * (phi + phi0));
    const Md = (35 / 24) * n3 * Math.sin(3 * (phi - phi0)) * Math.cos(3 * (phi + phi0));
    const M = b * F0 * (Ma - Mb + Mc - Md);
    const cos3 = cosP ** 3, cos5 = cosP ** 5, tan2 = Math.tan(phi) ** 2, tan4 = tan2 * tan2;
    const I = M + N0, II = (nu / 2) * sinP * cosP, III = (nu / 24) * sinP * cos3 * (5 - tan2 + 9 * eta2);
    const IIIA = (nu / 720) * sinP * cos5 * (61 - 58 * tan2 + tan4);
    const IV = nu * cosP, V = (nu / 6) * cos3 * (nu / rho - tan2);
    const VI = (nu / 120) * cos5 * (5 - 18 * tan2 + tan4 + 14 * eta2 - 58 * tan2 * eta2);
    const dl = lam - lam0;
    return [E0 + IV * dl + V * dl ** 3 + VI * dl ** 5, I + II * dl ** 2 + III * dl ** 4 + IIIA * dl ** 6];
  }

  /** British National Grid easting/northing (metres) -> {lat, lng} WGS84 (about 5 m accuracy). */
  function enToLatLng(E, N) {
    const [phi, lam] = gridToAiry(E, N);
    const [x, y, z] = toCart(phi, lam, AIRY);
    const [x2, y2, z2] = helmert(x, y, z, H);
    const [p2, l2] = toGeo(x2, y2, z2, WGS);
    return { lat: p2 * DEG, lng: l2 * DEG };
  }
  /** {lat,lng} WGS84 -> {e, n} British National Grid. */
  function latLngToEN(lat, lng) {
    const [x, y, z] = toCart(lat * RAD, lng * RAD, WGS);
    const inv = { tx: -H.tx, ty: -H.ty, tz: -H.tz, s: -H.s, rx: -H.rx, ry: -H.ry, rz: -H.rz };
    const [x2, y2, z2] = helmert(x, y, z, inv);
    const [p2, l2] = toGeo(x2, y2, z2, AIRY);
    const [e, n] = airyToGrid(p2, l2);
    return { e, n };
  }

  /* ───────── Grid references ───────── */
  const GRID_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; // no I
  function letterPairToOrigin(pair) {
    const l1 = GRID_LETTERS.indexOf(pair[0].toUpperCase());
    const l2 = GRID_LETTERS.indexOf(pair[1].toUpperCase());
    if (l1 < 0 || l2 < 0) return null;
    const e100 = ((l1 - 2) % 5) * 5 + (l2 % 5);
    const n100 = 19 - Math.floor(l1 / 5) * 5 - Math.floor(l2 / 5);
    if (e100 < 0 || e100 > 6 || n100 < 0 || n100 > 12) return null;
    return { e: e100 * 100000, n: n100 * 100000 };
  }

  function inGB(e, n) { return e >= 0 && e <= 700000 && n >= 0 && n <= 1300000; }

  /**
   * Find grid references written in free text, e.g. "SK 418944 340367", "SK 189 403", "SK1894 4036".
   * Six-digit pairs are treated as full eastings/northings (that is how the tablet writes them).
   * Returns [{e, n, raw}]
   */
  function findGridRefs(text) {
    const out = [];
    if (!text) return out;
    const re = /\b([A-HJ-Z][A-HJ-Z])\s*(\d{1,6})(?:\s+|[-,]\s*)(\d{1,6})\b|\b([A-HJ-Z][A-HJ-Z])\s*(\d{4,10})\b/gi;
    let m;
    while ((m = re.exec(text))) {
      let pair, a, b;
      if (m[1]) { pair = m[1]; a = m[2]; b = m[3]; }
      else {
        pair = m[4]; const d = m[5];
        if (d.length % 2) continue;
        a = d.slice(0, d.length / 2); b = d.slice(d.length / 2);
      }
      const origin = letterPairToOrigin(pair);
      if (!origin) continue;
      let e, n;
      if (a.length === 6 && b.length === 6) { e = +a; n = +b; }               // full E/N with a stray prefix
      else if (a.length === b.length && a.length <= 5) {
        const scale = Math.pow(10, 5 - a.length);
        e = origin.e + +a * scale; n = origin.n + +b * scale;
      } else continue;
      if (inGB(e, n)) out.push({ e, n, raw: m[0].replace(/\s+/g, ' ').trim() });
    }
    return out;
  }

  /** Parse a single coordinate string typed/pasted by the user. Returns {lat,lng,e,n,kind} or null. */
  function parseCoordInput(str) {
    if (!str) return null;
    const s = str.trim();
    // lat, lng
    let m = s.match(/^(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)$/);
    if (m) {
      const lat = +m[1], lng = +m[2];
      if (lat > 49 && lat < 61 && lng > -9 && lng < 3) { const g = latLngToEN(lat, lng); return { lat, lng, e: g.e, n: g.n, kind: 'latlng' }; }
    }
    // E N  (full)
    m = s.match(/^(\d{4,6})\s*[,\s]\s*(\d{4,7})$/);
    if (m && inGB(+m[1], +m[2])) { const p = enToLatLng(+m[1], +m[2]); return { ...p, e: +m[1], n: +m[2], kind: 'en' }; }
    // grid ref with letters
    const refs = findGridRefs(s);
    if (refs.length) { const r = refs[0]; const p = enToLatLng(r.e, r.n); return { ...p, e: r.e, n: r.n, kind: 'gridref' }; }
    return null;
  }

  /* ───────── Distance & formatting ───────── */
  function haversine(a, b) {
    const R = 6371000, dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.round(sec / 60);
    if (m < 1) return '<1 min';
    const h = Math.floor(m / 60), mm = m % 60;
    if (!h) return mm + ' min';
    return h + ' h ' + String(mm).padStart(2, '0') + ' min';
  }
  function fmtDurShort(sec) {
    const m = Math.round(sec / 60);
    if (m < 1) return '<1m';
    const h = Math.floor(m / 60), mm = m % 60;
    return h ? h + 'h ' + String(mm).padStart(2, '0') + 'm' : mm + 'm';
  }
  function fmtMiles(m) {
    const mi = m / 1609.344;
    if (mi < 0.1) return Math.round(m * 1.09361) + ' yd';
    return (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' mi';
  }
  function fmtClock(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function dmsString(lat, lng) {
    const f = (v, p, n) => {
      const h = v >= 0 ? p : n; v = Math.abs(v);
      const d = Math.floor(v), mf = (v - d) * 60, mi = Math.floor(mf), s = ((mf - mi) * 60).toFixed(1);
      return d + '°' + String(mi).padStart(2, '0') + "'" + String(s).padStart(4, '0') + '"' + h;
    };
    return f(lat, 'N', 'S') + ' ' + f(lng, 'E', 'W');
  }

  /* ───────── Parse the text the iPhone/Mac text reader produces ───────── */
  const LABELS = [
    ['companyAlt', /^company\s*name\s*\(\s*alt\s*\)\s*(.*)$/i],
    ['company', /^company\s*name\s*(.*)$/i],
    ['addr1', /^address\s*line\s*1\s*(.*)$/i],
    ['addr2', /^address\s*line\s*2\s*(.*)$/i],
    ['addr3', /^address\s*line\s*3\s*(.*)$/i],
    ['addr4', /^address\s*line\s*4\s*(.*)$/i],
    ['addr5', /^address\s*line\s*5\s*(.*)$/i],
    ['postcode', /^post\s*code\s*(.*)$/i],
    ['x', /^meter\s*co[\s-]*ord\w*\s*x\b\s*(.*)$/i],
    ['y', /^meter\s*co[\s-]*ord\w*\s*y\b\s*(.*)$/i],
    ['location', /^meter\s*location\s*(.*)$/i],
    ['end', /^have\s*you\s*arrived\s*(.*)$/i]
  ];
  const SEP_RE = /^\s*([=\-_*#~]{3,})\s*$/;
  const REF_RE = /^\d{6,}[A-Z]{0,2}\d{0,4}$/;

  function cleanDigits(s) {
    if (!s) return '';
    const t = s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5').replace(/[^\d]/g, '');
    return t;
  }

  function splitBlocks(lines) {
    // 1) explicit separators
    const blocks = [[]];
    let sawSep = false;
    for (const l of lines) {
      if (SEP_RE.test(l)) { sawSep = true; blocks.push([]); } else blocks[blocks.length - 1].push(l);
    }
    if (sawSep) return blocks.filter(b => b.some(x => x.trim()));
    // 2) split on each "Company Name" line (exact), keeping a job reference line above it with its block
    const starts = [];
    lines.forEach((l, i) => { if (/^company\s*name\s*$/i.test(l.trim())) starts.push(i); });
    const xs = lines.filter(l => /^meter\s*co[\s-]*ord\w*\s*x\b/i.test(l.trim())).length;
    if (starts.length <= 1 && xs <= 1) return [lines];
    if (starts.length > 1) {
      const cuts = starts.map(i => (i > 0 && REF_RE.test(lines[i - 1].replace(/\s+/g, '')) ? i - 1 : i));
      cuts[0] = 0;
      return cuts.map((c, k) => lines.slice(c, k + 1 < cuts.length ? cuts[k + 1] : lines.length));
    }
    return [lines];
  }

  function parseBlock(lines) {
    const f = { addr: [] };
    let cur = null;
    let ref = '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (!ref && REF_RE.test(line.replace(/\s+/g, '')) && !cur) { ref = line.replace(/\s+/g, ''); continue; }
      if (/^field\s*is\s*required$/i.test(line)) { cur = null; continue; }
      let hit = false;
      for (const [key, re] of LABELS) {
        const m = line.match(re);
        if (m) {
          // Don't treat free text starting with "Company Name" etc. in a value as a label unless it's a clean label line
          cur = key; hit = true;
          if (key === 'end') { cur = null; break; }
          if (m[1] && m[1].trim()) f[key] = ((f[key] || '') + ' ' + m[1]).trim();
          break;
        }
      }
      if (hit) continue;
      if (!cur) continue;
      f[cur] = ((f[cur] || '') + ' ' + line).trim();
    }
    return { f, ref };
  }

  const PC_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/;
  function normPostcode(s) {
    if (!s) return '';
    let t = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (t.length < 5 || t.length > 7) return s.toUpperCase().trim();
    return t.slice(0, -3) + ' ' + t.slice(-3);
  }

  /**
   * Parse text produced by "Extract Text from Image" over one or many job screens.
   * Returns [{ref, name, addr, postcode, e, n, lat, lng, notes, noteRef, issues[]}]
   */
  function parseJobs(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const blocks = splitBlocks(lines);
    const jobs = [];
    for (const b of blocks) {
      const { f, ref } = parseBlock(b);
      if (!f.x && !f.y && !f.postcode && !f.addr1 && !f.location) continue; // nothing job-like
      const issues = [];
      const addrParts = [f.addr1, f.addr2, f.addr3, f.addr4, f.addr5].filter(Boolean).map(s => s.replace(/\s+/g, ' ').trim());
      const postcode = normPostcode(f.postcode || '');
      if (postcode && !PC_RE.test(postcode)) issues.push('Postcode looks misread (' + postcode + ')');
      const ex = cleanDigits(f.x), ny = cleanDigits(f.y);
      let e = null, n = null, lat = null, lng = null;
      if (ex && ny) {
        e = +ex; n = +ny;
        if (!inGB(e, n) || ex.length < 5 || ny.length < 5) { issues.push('Coordinates look misread (' + ex + ', ' + ny + ')'); e = n = null; }
        else { const p = enToLatLng(e, n); lat = p.lat; lng = p.lng; }
      } else issues.push('No coordinates found');
      const notes = (f.location || '').replace(/\s+/g, ' ').trim();
      let noteRef = null;
      const refs = findGridRefs(notes);
      if (refs.length) {
        const r = refs[0], p = enToLatLng(r.e, r.n);
        noteRef = { e: r.e, n: r.n, lat: p.lat, lng: p.lng, raw: r.raw };
        if (lat != null) {
          noteRef.distFromXY = haversine({ lat, lng }, p);
          if (noteRef.distFromXY > 1500) issues.push('Grid ref in notes is ' + Math.round(noteRef.distFromXY) + ' m from X/Y — check which is right');
        }
      }
      jobs.push({
        ref, name: addrParts[0] || (f.company && !/^n\/?a$/i.test(f.company.trim()) ? f.company : '') || postcode || 'Job',
        addr: addrParts.join(', '), company: f.company && !/^n\/?a$/i.test(f.company.trim()) ? f.company.trim() : '',
        postcode, e, n, lat, lng, notes, noteRef, issues
      });
    }
    return jobs;
  }

  /* ───────── Route optimisation ───────── */
  // cost(i,j): seconds from node i to node j. Node 0 is the start. Returns order of node indices 1..n.
  function pathCost(order, cost, closed, hasStart) {
    let c = 0, prev = 0;
    for (const j of order) { c += cost(prev, j); prev = j; }
    if (closed) c += cost(prev, 0);
    return c;
  }
  function nearestNeighbour(n, cost, rnd) {
    const left = new Set(); for (let i = 1; i <= n; i++) left.add(i);
    const order = []; let cur = 0;
    while (left.size) {
      let cand = [...left].map(j => [j, cost(cur, j)]).sort((a, b) => a[1] - b[1]);
      let pick = cand[0][0];
      if (rnd && cand.length > 1 && Math.random() < rnd) pick = cand[Math.min(cand.length - 1, 1 + Math.floor(Math.random() * Math.min(2, cand.length - 1)))][0];
      order.push(pick); left.delete(pick); cur = pick;
    }
    return order;
  }
  function improve(order, cost, closed) {
    let best = pathCost(order, cost, closed);
    let improved = true, guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      // 2-opt
      for (let i = 0; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          const c = pathCost(cand, cost, closed);
          if (c + 1e-6 < best) { order = cand; best = c; improved = true; }
        }
      }
      // or-opt (move one node)
      for (let i = 0; i < order.length; i++) {
        const node = order[i], rest = order.slice(0, i).concat(order.slice(i + 1));
        for (let k = 0; k <= rest.length; k++) {
          if (k === i) continue;
          const cand = rest.slice(0, k).concat([node], rest.slice(k));
          const c = pathCost(cand, cost, closed);
          if (c + 1e-6 < best) { order = cand; best = c; improved = true; break; }
        }
      }
    }
    return { order, cost: best };
  }
  /**
   * @param n number of stops (nodes 1..n), node 0 = start
   * @param cost (i,j)=>seconds
   * @param opts {closed:boolean, freeStart:boolean}  freeStart: ignore the start node (route may begin at any stop)
   */
  function optimise(n, cost, opts) {
    opts = opts || {};
    if (n <= 1) return n === 1 ? [1] : [];
    const c = opts.freeStart ? (i, j) => (i === 0 ? 0 : cost(i, j)) : cost;
    const closed = !!opts.closed && !opts.freeStart;
    let best = null;
    const tries = n <= 12 ? 12 : n <= 40 ? 24 : 10;
    for (let t = 0; t < tries; t++) {
      const seed = nearestNeighbour(n, c, t === 0 ? 0 : 0.45);
      const r = improve(seed, c, closed);
      if (!best || r.cost < best.cost) best = r;
    }
    return best.order;
  }

  /**
   * Build a timetable. order: node indices; legs: (i,j)=>{t,d}.
   * Returns {stops:[{node, arrive, depart, legT, legD}], driveSec, dwellSec, distM, finish, totalSec}
   */
  function schedule(order, legs, startMs, dwellSec, closed, hasStart) {
    let t = startMs, prev = 0, driveSec = 0, distM = 0, dwell = 0;
    const stops = [];
    order.forEach((j, idx) => {
      const L = (idx === 0 && !hasStart) ? { t: 0, d: 0 } : legs(prev, j);
      t += L.t * 1000; driveSec += L.t; distM += L.d;
      const arrive = t; t += dwellSec * 1000; dwell += dwellSec;
      stops.push({ node: j, arrive, depart: t, legT: L.t, legD: L.d });
      prev = j;
    });
    if (closed && order.length && hasStart) { const L = legs(prev, 0); t += L.t * 1000; driveSec += L.t; distM += L.d; }
    return { stops, driveSec, dwellSec: dwell, distM, finish: t, totalSec: (t - startMs) / 1000 };
  }

  const api = {
    enToLatLng, latLngToEN, findGridRefs, parseCoordInput, parseJobs, haversine,
    fmtDur, fmtDurShort, fmtMiles, fmtClock, dmsString, optimise, schedule, pathCost, inGB, normPostcode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
