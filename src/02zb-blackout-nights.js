/* ==========================================================================
   BLACKOUT pass 17: every playable Riposte map gets a night version ('bo_<id>'), built like Khamsin Night (02za-blackout.js):
   the same level, nav, covers and materials (inherited through the prototype), a moonlit atmosphere, the map's own street lamps
   lit, three hack terminals, the HACK SPAWN extract near the spy base, mercs on the Alpha side (+z) and spies on the Bravo side (-z).
   Fixed light set: every added light is BAKED (LAMPS, fixed: 1). No runtime light is added or removed.
   Terminals stand on bot points of interest (walkable by construction) in the middle third of the map, one per lane when it can,
   moved to the nearest spot with a clear footprint and a clear place to stand. The extract sits between the spy spawns and the centre.
   ========================================================================== */
const BO_NIGHT_SKY = {
  zen: [0.006, 0.009, 0.022], mid: [0.018, 0.024, 0.045], hor: [0.045, 0.05, 0.075], gnd: [0.012, 0.012, 0.016],
  glow: [0.06, 0.07, 0.1], halo: [0.1, 0.11, 0.14], disk: [1.4, 1.5, 1.8],
  cloudLo: [0.02, 0.024, 0.032], cloudHi: [0.035, 0.04, 0.05],
};
function boNightAtmo(A0, o) {
  // the BLACKOUT night sky; a map's own sky features (volcano, sea, ridges) stay, darkened
  const sky = Object.assign({}, A0.sky, ATMO_BLACKOUT.sky, BO_NIGHT_SKY);
  const dk = (c, k) => (Array.isArray(c) ? c.map((v) => v * k) : c);
  if (sky.ridgeSnow) sky.ridgeSnow = dk(sky.ridgeSnow, 0.16);
  if (sky.ridgeRock) sky.ridgeRock = dk(sky.ridgeRock, 0.2);
  const sun = (A0.sun || [-0.35, 0.6, 0.45]).slice(); if (sun[1] < 0.45) sun[1] = 0.6; // moon high enough to light the streets
  return Object.assign({}, A0, {
    sun, sunColor: 0x7d92c8, sunI: 0.3, vmSun: 0x6a7aa0,
    fog: [0.03, 0.035, 0.055], fogD: 0.012, fogSun: 0.08,
    hemi: [0x3a4a74, 0x18141a, 0.42], vmHemi: [0x34426a, 0x100c10],
    sky, envGround: 0x0c0e14, hdri: null,
    lit: true, lamps: 2.6, winLit: 0.3,
    bounce: [0.06, 0.07, 0.09], dust: [0.12, 0.12, 0.13], motes: [0.12, 0.13, 0.16],
    grade: Object.assign({}, A0.grade, { lo: [0.86, 0.93, 1.1], hi: [1.06, 0.98, 0.9], exp: 1.22 }),
    rays: [0.12, 0.14, 0.18], bloom: [0.5, 0.55, 0.9],
  }, o || {});
}

/* ---------- spot finding, at build time (COL and RAMPS hold what the base map built so far) ---------- */
function boFloorAt(x, z, yRef) {
  let g = VOID.on ? VOID.floor : (RELIEF.on ? reliefAt(x, z) : 0);
  try { if (typeof WATER !== 'undefined' && WATER.on && typeof waterAt === 'function' && waterAt(x, z)) return null; } catch (e) {}
  for (const c of COL) {
    if (c.ray || c.inv || x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
    if (c.y1 <= yRef + 0.6 && c.y1 > g) g = c.y1;
  }
  for (const rp of RAMPS) {
    if (x < rp.x0 || x > rp.x1 || z < rp.z0 || z > rp.z1) continue;
    const h = rampHeight(rp, x, z); if (h <= yRef + 0.6 && h > g) g = h;
  }
  if (VOID.on && g <= VOID.floor + 1) return null;
  return g;
}
function boBoxClear(x0, x1, y0, y1, z0, z1) {
  for (const c of COL) {
    if (c.ray || c.x1 <= x0 || c.x0 >= x1 || c.z1 <= z0 || c.z0 >= z1 || c.y1 <= y0 || c.y0 >= y1) continue;
    return false;
  }
  for (const rp of RAMPS) if (!(rp.x1 <= x0 || rp.x0 >= x1 || rp.z1 <= z0 || rp.z0 >= z1)) return false;
  // physics props (crates, barrels, bins) already placed by the map
  try {
    if (typeof PHYS !== 'undefined') for (const b of PHYS.bodies) {
      if (!b.state || b.pooled) continue;
      const r = b.rad || 0.5, px = b.p.x, pz = b.p.z;
      if (b.p.y + r <= y0 || b.p.y - r >= y1) continue;
      const qx = Math.max(x0, Math.min(x1, px)), qz = Math.max(z0, Math.min(z1, pz));
      if ((qx - px) * (qx - px) + (qz - pz) * (qz - pz) < r * r) return false;
    }
  } catch (e) {}
  return true;
}
const BO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
/* nearest spot to (x, z) with a free 1.2 x 1.2 m footprint on a flat floor and a free place to stand 1 m away; f: facing (towards that place) */
function boFindSpot(x, z, yRef, toX, toZ, maxR, half) {
  const hw = half || 0.6;
  for (let r = 0; r <= (maxR || 7); r += 0.5) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r * 5));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      if (cx < MAP.x0 + 2 || cx > MAP.x1 - 2 || cz < MAP.z0 + 2 || cz > MAP.z1 - 2) continue;
      const g = boFloorAt(cx, cz, yRef); if (g == null || Math.abs(g - yRef) > 2.5) continue;
      let flat = true;
      for (const [dx, dz] of [[hw, hw], [-hw, hw], [hw, -hw], [-hw, -hw], [hw, 0], [-hw, 0], [0, hw], [0, -hw]]) { const h = boFloorAt(cx + dx, cz + dz, g); if (h == null || Math.abs(h - g) > 0.12) { flat = false; break; } }
      if (!flat || !boBoxClear(cx - hw, cx + hw, g + 0.12, g + 2.0, cz - hw, cz + hw)) continue;
      // the side the spy hacks from: clear, same floor; prefer the one facing the centre of the map
      let best = null, bs = -9;
      for (const [fx, fz] of BO_DIRS) {
        const sx = cx + fx * 1.15, sz = cz + fz * 1.15, h = boFloorAt(sx, sz, g);
        if (h == null || Math.abs(h - g) > 0.25 || !boBoxClear(sx - 0.35, sx + 0.35, h + 0.3, h + 1.8, sz - 0.35, sz + 0.35)) continue;
        const dl = Math.hypot(toX - cx, toZ - cz) || 1, sc = (fx * (toX - cx) + fz * (toZ - cz)) / dl + (Math.abs(fx) + Math.abs(fz) < 1.2 ? 0.05 : 0);
        if (sc > bs) { bs = sc; best = [fx, fz]; }
      }
      if (best) return { x: cx, z: cz, y: g, fx: best[0], fz: best[1] };
    }
  }
  return null;
}
function boNearPoiY(D, x, z) {
  let b = null, bd = 1e9;
  for (const p of D.poi || []) { const d = Math.hypot(p[0] - x, p[2] - z); if (d < bd) { bd = d; b = p; } }
  return b && bd < 18 ? b[1] : (VOID.on && b ? b[1] : 0);
}
/* three terminals: points of interest in the middle third, spread across the lanes, at least 12 m apart */
function boPickTerminals(D) {
  const B = D.bounds, cz = (B.z0 + B.z1) / 2, hz = (B.z1 - B.z0) / 2, cx = (B.x0 + B.x1) / 2;
  const mid = D.dom && D.dom[1] ? D.dom[1] : [cx, cz];
  const pois = (D.poi || []).filter((p) => Math.abs(p[2] - cz) <= hz * 0.34);
  const cands = [];
  // ground POIs first (p[4] marks a held post such as a balcony), then the domination points
  for (const p of pois.filter((p) => !p[4]).concat(pois.filter((p) => p[4]))) cands.push([p[0], p[1], p[2]]);
  for (const d of D.dom || []) cands.push([d[0], 0, d[1]]);
  const xs = cands.map((c) => c[0]); const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const order = [
    cands.slice().sort((a, b) => (a[0] - xMin + Math.abs(a[2] - cz) * 0.5) - (b[0] - xMin + Math.abs(b[2] - cz) * 0.5)), // west lane
    cands.slice().sort((a, b) => (xMax - a[0] + Math.abs(a[2] - cz) * 0.5) - (xMax - b[0] + Math.abs(b[2] - cz) * 0.5)), // east lane
    cands.slice().sort((a, b) => Math.hypot(a[0] - mid[0], a[2] - mid[1]) - Math.hypot(b[0] - mid[0], b[2] - mid[1])), // middle
  ];
  const out = [];
  for (const list of order) {
    for (const c of list) {
      const y = c[1] || boNearPoiY(D, c[0], c[2]);
      if (out.some((o) => Math.hypot(o.x - c[0], o.z - c[2]) < 12)) continue;
      const s = boFindSpot(c[0], c[2], y, mid[0], mid[1], 5);
      if (s && !out.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 12)) { out.push(s); break; }
    }
  }
  out.sort((a, b) => a.x - b.x); // A west, B middle, C east
  return out;
}
/* pass 23: up to two more terminals (D, E) so each round can switch on a random subset. Points of interest in the middle half,
   at least 12 m from every terminal already placed; the first three keep their old spots. */
function boMoreTerminals(D, have, n) {
  const B = D.bounds; if (!B) return [];
  const cz = (B.z0 + B.z1) / 2, hz = (B.z1 - B.z0) / 2, mid = D.dom && D.dom[1] ? D.dom[1] : [(B.x0 + B.x1) / 2, cz];
  const cands = (D.poi || []).filter((p) => Math.abs(p[2] - cz) <= hz * 0.5).map((p) => [p[0], p[1], p[2], p[4] ? 1 : 0]);
  for (const d of D.dom || []) cands.push([d[0], 0, d[1], 0]);
  cands.sort((a, b) => a[3] - b[3] || Math.abs(a[2] - cz) - Math.abs(b[2] - cz));
  const all = have.slice(), out = [];
  for (const c of cands) {
    if (out.length >= n) break;
    if (all.some((o) => Math.hypot(o.x - c[0], o.z - c[2]) < 12)) continue;
    const y = c[1] || boNearPoiY(D, c[0], c[2]);
    const s = boFindSpot(c[0], c[2], y, mid[0], mid[1], 4);
    if (s && !all.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 12)) { all.push(s); out.push(s); }
  }
  return out;
}
function boPickExtract(D) {
  const B = D.bounds, cz = (B.z0 + B.z1) / 2, mid = D.dom && D.dom[1] ? D.dom[1] : [(B.x0 + B.x1) / 2, cz];
  const sp = (D.spawns || []).map(([x, z]) => [x, -z]); // Bravo side: spies
  if (!sp.length) return null;
  const sx = sp.reduce((a, p) => a + p[0], 0) / sp.length, sz = sp.reduce((a, p) => a + p[1], 0) / sp.length;
  const tx = sx + (mid[0] - sx) * 0.22, tz = sz + (mid[1] - sz) * 0.22;
  const y = boNearPoiY(D, tx, tz);
  return boFindSpot(tx, tz, y, mid[0], mid[1], 10, 1.9) || boFindSpot(sx, sz, boNearPoiY(D, sx, sz), mid[0], mid[1], 10, 1.9) || boFindSpot(tx, tz, y, mid[0], mid[1], 10, 1.2);
}

/* the look of a terminal and of the extract (same as Khamsin Night) */
function boBuildTerminal(t) {
  const { x, z, y, fx, fz } = t, rot = Math.atan2(fx, fz);
  boxC('steel', x, y, z, 0.7, 1.05, 0.5, { rot, tint: [0.12, 0.14, 0.16] });
  boxC('steel', x - fx * 0.17, y + 1.05, z - fz * 0.17, 0.66, 0.55, 0.08, { rot, collide: false, tint: [0.1, 0.11, 0.13] });
  boxC('boScreen', x - fx * 0.125, y + 1.12, z - fz * 0.125, 0.54, 0.4, 0.02, { rot, collide: false });
  boxC('boScreen', x + fx * 0.05, y + 1.05, z + fz * 0.05, 0.5, 0.012, 0.3, { rot, collide: false });
  boxC('boRed', x - fx * 0.17, y + 1.62, z - fz * 0.17, 0.12, 0.06, 0.06, { rot, collide: false });
  LAMPS.push({ x: x + fx * 0.45, y: y + 1.9, z: z + fz * 0.45, c: [0.3, 0.9, 0.8], p: 0.2, r: 3.0, down: 0, fixed: 1 });
}
function boBuildExtract(E) {
  const r = E.r, y = E.y || 0;
  for (const [cx, cz, w, d] of [[E.x, E.z - r, 2 * r, 0.1], [E.x, E.z + r, 2 * r, 0.1], [E.x - r, E.z, 0.1, 2 * r], [E.x + r, E.z, 0.1, 2 * r]])
    boxC('boRed', cx, y + 0.015, cz, w, 0.012, d, { collide: false });
  boxC('steel', E.x + r + 0.25, y, E.z, 0.12, 2.2, 0.12, { collide: false, tint: [0.15, 0.15, 0.17] });
  boxC('boRed', E.x + r + 0.25, y + 2.2, E.z, 0.2, 0.14, 0.2, { collide: false });
  LAMPS.push({ x: E.x, y: y + 2.4, z: E.z, c: [1.0, 0.14, 0.1], p: 1.4, r: 5.5, down: 0, fixed: 1 });
}
function boNightMats(M, B) {
  if (B.materials) B.materials.call(B, M);
  MAT.boScreen = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.3, 2.4, 1.95) }); MAT.boScreen.userData.noShadow = true;
  MAT.boRed = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.8, 0.2, 0.14) }); MAT.boRed.userData.noShadow = true;
}

/* diagnostics, read by the tests: what each night map placed */
window.BO_NIGHT_DIAG = {};
function boNightMap(base, name, tag) {
  const B = MAP_DEFS[base], info = MAPS.find((m) => m.id === base);
  if (!B || !info || !info.ok) return;
  const id = 'bo_' + base, S = { terms: [], ext: null };
  const sound = B.sound && B.sound.spots ? Object.assign({}, B.sound, { spots: B.sound.spots.filter((s) => !/rooster|dove|donkey|bird|cicada|gull|seagull/.test(s.id)) }) : B.sound;
  MAP_DEFS[id] = Object.assign(Object.create(B), {
    atmo: boNightAtmo(B.atmo),
    skyPhoto: null, // daylight photos would light the sky: procedural night sky instead
    sound,
    materials(M) { boNightMats(M, B); },
    build() {
      B.build.call(this);
      S.terms = boPickTerminals(B).slice(0, 3);
      try { S.terms = S.terms.concat(boMoreTerminals(B, S.terms, 2)); } catch (err) { console.warn('BO more terminals', err); }
      const ids = ['A', 'B', 'C', 'D', 'E'];
      S.terms.forEach((t, i) => { t.id = ids[i]; boBuildTerminal(t); });
      const e = boPickExtract(B);
      S.ext = e ? { x: e.x, z: e.z, y: e.y, r: 1.6 } : null;
      if (S.ext) boBuildExtract(S.ext);
      // named zones for the HUD location line, ahead of the map's own
      const Z = S.terms.map((t) => ['Terminal ' + t.id, t.x - 2.5, t.x + 2.5, t.z - 2.5, t.z + 2.5]);
      if (S.ext) Z.push(['HACK SPAWN', S.ext.x - 3, S.ext.x + 3, S.ext.z - 3, S.ext.z + 3]);
      ZONES.unshift(...Z);
    },
    after() {
      if (B.after) B.after.call(this);
      const merc = SPAWNS[0].map((p) => p.slice()), spy = SPAWNS[1].map((p) => p.slice());
      window.BLACKOUT_SPAWNS = { merc, spy };
      window.BO_TERMINALS = S.terms.map((t) => ({ id: t.id, x: t.x + t.fx * 0.75, z: t.z + t.fz * 0.75, px: t.x, pz: t.z }));
      window.BO_EXTRACT = S.ext ? { x: S.ext.x, z: S.ext.z, r: S.ext.r } : null;
      // check every placement against the finished world (props included): the floor under it must be where it was built
      const chk = (x, z, y) => { try { return Math.abs(groundHeight(x, z, y + 1.2, 0.2) - y) < 0.35 ? 1 : 0; } catch (err) { return -1; } };
      BO_NIGHT_DIAG[id] = {
        terms: S.terms.map((t) => [t.id, +t.x.toFixed(1), +t.y.toFixed(2), +t.z.toFixed(1), chk(t.x + t.fx * 1.15, t.z + t.fz * 1.15, t.y)]),
        ext: S.ext ? [+S.ext.x.toFixed(1), +S.ext.y.toFixed(2), +S.ext.z.toFixed(1), chk(S.ext.x, S.ext.z, S.ext.y)] : null,
        merc: merc.length, spy: spy.length,
      };
      try { if (typeof boLightsArm === 'function') boLightsArm(true); } catch (err) { console.warn('boLightsArm', err); }
    },
    // Simoun: no daytime sandstorm cycle at night (smStorm blends ATMO_SIMOUN, the full sun, into the lights each frame)
    update(t, dt) { if (base === 'simoun') { if (typeof smLife === 'function') smLife((typeof SMP !== 'undefined' && SMP.life) || [], t); } else if (B.update) B.update.call(this, t, dt); },
    unload() { try { if (typeof boLightsArm === 'function') boLightsArm(false); } catch (err) {} if (B.unload) B.unload.call(this); },
  });
  MAPS.push({ id, name: name || (info.name + ' Night'), tag: tag || ((typeof info.tag === 'string' ? info.tag : '') + ' · night ops'), ok: true, boBase: base,
    desc: info.name + ' after dark. Spies hack 2 of 3 terminals, then reach the HACK SPAWN. Mercs hunt with flashlights.' });
}
/* Every playable Riposte map except Khamsin (it already has its hand-placed night version, 'blackout').
   A map listed in BO_NIGHT_SKIP is left out, with the reason. */
const BO_NIGHT_SKIP = {};
for (const m of MAPS.slice()) {
  if (!m.ok || m.id === 'sable' || boMapOn(m.id) || BO_NIGHT_SKIP[m.id]) continue;
  try { boNightMap(m.id); } catch (e) { console.warn('BO night map', m.id, e); }
}
