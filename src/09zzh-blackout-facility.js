/* ==========================================================================
   BLACKOUT pass 23: the facility.
   - Active terminals: each map has up to five terminals (02za, 02zb); each round the host switches on game.termActive of them at
     random (never fewer than the hacks needed). The others get a dead screen and their glow lamp goes dark.
   - Keycard (game.keycard): one active terminal is locked. A spy walks over the keycard (at least game.keycardMinD away) to unlock it.
   - Intel (game.intelN): folders on the floor. A spy walking over one adds game.intelTime seconds to the round, or (game.intelGadget
     of the time) a gadget charge.
   - Power breakers (game.breakers): a box on a wall near each active terminal. A spy holds the hack key there (game.sabotageT) to cut
     the power of the zone (game.breakerR around the terminal) for game.blackoutT seconds: its fixed lamps dim (the baked light grid is
     rebaked around them, never a new light), traps and cameras there die and merc scanners blur (R.trapDead, R.scanFuzz).
     A merc holds the use key at the box (game.restoreT) to bring it back. Then it cools down (game.breakerCd).
   - Security cameras (game.cams per active terminal): sweep on a wall. One that keeps an uncloaked spy in view for game.camSeeT
     alerts the mercs (HUD line, ping, spy exposed, the nearest merc bots go). Spies shoot it out, or hold the pistol light on the lens
     (game.camBlindHold) to blind it for game.camBlindT.
   - Spy cameras (spy key 'spycam', T, game.spyCamN each): planted on the wall in front of the spy. Mercs they see show to the spies
     as marks and minimap dots (worked out on each spy's own machine). Mercs shoot them down.
   - Bots: merc bots walk patrol routes (game.botPatrol) and go restore the power; spy bots cut their terminal's breaker first
     (game.botBreaker), pick up intel and the keycard, shoot cameras, plant spy cameras. Merc bots shoot spy cameras they spot.
   - Online, the host owns all of it: 'bo4s' (host state, about 1 per second or on change), 'bo4x' (host events), 'bo4q' (client
     requests: cut, restore, camera shot or blinded, spy camera placed or shot). Every message stays under 4 KB.
   - The objective line, the timer drain line, the hack alert and the power line stack under the score panel (no overlap).
   ========================================================================== */
(function () {
  const R = window.BO_RULES; if (!R || !window.BOCFG) return;
  const MERC = 0, SPY = 1, V = THREE.Vector3, TAU = Math.PI * 2;
  const GM = () => Object.assign({}, BOCFG.defaults().game, (BOCFG.v && BOCFG.v.game) || {});
  const F = window.BOFAC = { all: [], act: [], lock: '', kc: null, intel: [], brk: [], cams: [], sc: [], scLeft: new Map(), log: [], sent: {}, got: {}, nid: 0, rid: '', alerts: 0, picks: 0, cuts: 0, restores: 0, maxMsg: 0, seen: [] };
  const lg = (s) => { F.log.push(((MATCH && MATCH.time) || 0).toFixed(1) + ' ' + s); if (F.log.length > 80) F.log.shift(); };
  const bo = () => { try { return typeof boIsBlackout === 'function' && !!boIsBlackout(); } catch (e) { return false; } };
  const playing = () => bo() && MATCH.state === 'playing';
  const online = () => typeof NET !== 'undefined' && MATCH.online && NET.on && (NET.role === 'host' || NET.role === 'client');
  const isCl = () => online() && NET.role === 'client';
  const auth = () => !isCl();
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  const cnt = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const bcast = (m) => { cnt(F.sent, m.t); try { const s = JSON.stringify(m).length; if (s > F.maxMsg) F.maxMsg = s; netBroadcast(m, true); } catch (e) {} };
  const toHost = (m) => { cnt(F.sent, m.t); try { netSend(m); } catch (e) {} };
  const nid = (e) => { try { return (e && netIdOf(e)) || ''; } catch (err) { return ''; } };
  const ent = (id) => { try { return id ? netEntity(String(id)) : null; } catch (e) { return null; } };
  const hyp = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const K = (id) => (window.BOKEYS ? BOKEYS.K(id) : id);
  const alive = (e) => e && !e.off && e.alive;
  const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
  const sid = (x) => String(x == null ? '' : x).slice(0, 8);
  const mine = (e) => e && (e === PL.ent || (!e.isRemote && auth())); // this machine runs that entity
  function gy(x, z, y) { try { return groundHeight(x, z, y + 1.2, 0.2); } catch (e) { return y; } }
  function chest(e, out) { const k = 1 - (e.crouchAmt || 0) * 0.33; return out.set(e.pos.x, e.pos.y + 1.15 * k, e.pos.z); }
  const angD = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const termY = (t) => { try { return groundHeight(t.px, t.pz, (typeof gy0 === 'function' ? gy0(t.px, t.pz) : 0) + 4, 0.2); } catch (e) { return 0; } };

  /* ---------- the power: zones ---------- */
  function zoneDark(x, z) { const r = GM().breakerR; for (const b of F.brk) if (b.st === 1 && hyp(x, z, b.tx, b.tz) < r) return b; return null; }
  F.zoneDark = zoneDark;
  R.trapDead = (d) => !!(d && zoneDark(d.x, d.z));
  R.scanFuzz = (x, z) => (zoneDark(x, z) ? 1 : 0);
  R.keycardPos = () => F.kc;
  const camDead = (c) => !!(c.dead || MATCH.time < (c.blindU || 0) || zoneDark(c.x, c.z));

  /* ---------- placement (host) ---------- */
  function navPts(test, n, tries) {
    const out = []; if (!NAV || !NAV.count) return out;
    for (let k = 0; k < (tries || 600) && out.length < n; k++) {
      const i = (Math.random() * NAV.count) | 0, p = { x: NAV.nx[i], y: NAV.ny[i], z: NAV.nz[i] };
      if (typeof gy0 === 'function' && Math.abs(p.y - gy0(p.x, p.z)) > 0.6) continue; // ground floor: roofs and ledges are for climbing, not for loot
      if (test(p, out)) out.push(p);
    }
    return out;
  }
  // a spot on a wall h m above a walkable node rmin..rmax from (cx, cz)
  function wallSpot(cx, cy, cz, rmin, rmax, h, test) {
    const pts = navPts((p) => { const d = hyp(p.x, p.z, cx, cz); return d >= rmin && d <= rmax && Math.abs(p.y - cy) < 1.6; }, 40, 900);
    for (const p of pts) {
      const a0 = Math.random() * TAU;
      for (let j = 0; j < 8; j++) {
        const a = a0 + j * TAU / 8, dx = Math.cos(a), dz = Math.sin(a);
        let hit; try { hit = rayWorld(p.x, p.y + h, p.z, dx, 0, dz, 1.6, 1); } catch (e) { hit = null; }
        if (!hit || hit.t < 0.3 || Math.abs(hit.ny) > 0.3) continue;
        let nx = hit.nx, nz = hit.nz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        if (nx * dx + nz * dz > -0.6) continue;
        const t = hit.t, wx = p.x + dx * t, wz = p.z + dz * t;
        const s = { x: wx + nx * 0.06, y: p.y + h, z: wz + nz * 0.06, nx, nz, gy: p.y, sx: wx + nx * 0.7, sz: wz + nz * 0.7 };
        if (Math.abs(gy(s.sx, s.sz, p.y) - p.y) > 0.4) continue;
        if (test && !test(s)) continue;
        return s;
      }
    }
    return null;
  }
  const farFromAll = (x, z, d) => ![...F.brk, ...F.cams, ...F.intel].some((o) => hyp(o.x, o.z, x, z) < d) && !(F.kc && hyp(F.kc.x, F.kc.z, x, z) < d);
  function hostSetup() {
    const G = GM();
    const all = F.all.slice();
    const n = Math.max(1, Math.min(all.length, Math.max(Math.round(G.termActive), Math.round(G.hacksNeeded))));
    const act = shuffle(all.slice()).slice(0, n).sort((a, b) => (a.id < b.id ? -1 : 1));
    R.terminals = act; F.act = act.map((t) => t.id);
    R.hackNeed = Math.max(1, Math.min(Math.round(G.hacksNeeded), act.length));
    for (const t of all) t.locked = false;
    F.lock = ''; F.kc = null;
    if (G.keycard >= 1 && act.length) {
      const t = act[(Math.random() * act.length) | 0];
      let best = null, bd = -1;
      const pts = navPts((p) => hyp(p.x, p.z, t.px, t.pz) >= G.keycardMinD && !all.some((o) => hyp(p.x, p.z, o.px, o.pz) < 5), 6, 900);
      if (pts.length) best = pts[(Math.random() * pts.length) | 0];
      else for (const p of navPts(() => true, 30, 300)) { const d = hyp(p.x, p.z, t.px, t.pz); if (d > bd) { bd = d; best = p; } }
      if (best) { t.locked = true; F.lock = t.id; F.kc = { x: r2(best.x), y: r2(best.y), z: r2(best.z) }; }
    }
    F.brk = []; F.cams = []; F.intel = [];
    for (const t of act) {
      const ty = termY(t);
      if (G.breakers >= 1) {
        const s = wallSpot(t.px, ty, t.pz, 6, 14, 1.3, (s) => farFromAll(s.x, s.z, 4) && !act.some((o) => hyp(o.px, o.pz, s.x, s.z) < 5));
        if (s) F.brk.push({ id: t.id, x: r2(s.x), y: r2(s.y), z: r2(s.z), nx: r2(s.nx), nz: r2(s.nz), sx: r2(s.sx), sy: r2(s.gy), sz: r2(s.sz), tx: r2(t.px), tz: r2(t.pz), st: 0, until: 0, cd: 0, p: 0 });
      }
      for (let k = 0; k < Math.round(G.cams); k++) {
        const tp = new V(t.px, ty + 1.1, t.pz);
        const s = wallSpot(t.px, ty, t.pz, 4, 11, 2.7, (s) => farFromAll(s.x, s.z, 3) && lineClear(new V(s.x + s.nx * 0.3, s.y, s.z + s.nz * 0.3), tp));
        if (!s) continue;
        const dx = t.px - s.x, dz = t.pz - s.z, hd = Math.hypot(dx, dz);
        F.cams.push({ id: t.id + (k + 1), x: r2(s.x + s.nx * 0.18), y: r2(s.y), z: r2(s.z + s.nz * 0.18), yaw: r2(Math.atan2(-dx, -dz)), pit: r2(-Math.atan2(s.y - (ty + 0.9), hd)), ph: r2(Math.random() * TAU), dead: 0, blindU: 0, seen: new Map(), alertU: 0 });
      }
    }
    const ip = navPts((p, out) => !all.some((o) => hyp(p.x, p.z, o.px, o.pz) < 6) && !out.some((o) => hyp(p.x, p.z, o.x, o.z) < 12) && !(F.kc && hyp(p.x, p.z, F.kc.x, F.kc.z) < 8), Math.round(G.intelN), 1500);
    ip.forEach((p, i) => F.intel.push({ id: 'i' + i, x: r2(p.x), y: r2(p.y), z: r2(p.z) }));
    F.rid = Math.random().toString(36).slice(2, 7);
    lg('setup act ' + F.act.join('') + ' lock ' + F.lock + ' brk ' + F.brk.length + ' cams ' + F.cams.length + ' intel ' + F.intel.length);
    lastSig = ''; lastHost = 0;
  }

  /* ---------- round setup (every machine) ---------- */
  const _os = R.onSetup;
  R.onSetup = function () {
    const r = _os ? _os.apply(this, arguments) : undefined;
    try {
      F.all = R.terminals.slice(); F.act = F.all.map((t) => t.id); F.lock = ''; F.kc = null; F.intel = []; F.brk = []; F.cams = []; F.sc = []; F.scLeft.clear(); F.seen = [];
      F.alerts = 0; F.picks = 0; F.cuts = 0; F.restores = 0; F.rid = '';
      for (const e of entities) { e.boCutP = 0; e.boScT = 0; }
      if (auth()) hostSetup();
      patrolRoute = null;
    } catch (err) { console.warn('BO facility setup', err); }
    return r;
  };
  function applyActive(ids) {
    if (!F.all.length) return;
    const set = new Set(ids);
    const now = R.terminals.map((t) => t.id).join('');
    const want = F.all.filter((t) => set.has(t.id));
    if (want.length && want.map((t) => t.id).join('') !== now) { R.terminals = want; patrolRoute = null; }
    F.act = want.map((t) => t.id);
  }

  /* ---------- host actions ---------- */
  function cut(b, who) {
    const G = GM(); if (!b || b.st === 1 || MATCH.time < b.cd) return false;
    b.st = 1; b.until = MATCH.time + G.blackoutT; b.p = 0; F.cuts++;
    lg('cut ' + b.id + ' by ' + (who ? who.name : '?'));
    if (online()) bcast({ t: 'bo4x', k: 'cut', id: b.id });
    powerFx(b, false); lastHost = 0;
    restoreBot(b);
    return true;
  }
  function restore(b, who, auto) {
    if (!b || b.st !== 1) return false;
    b.st = 0; b.cd = MATCH.time + GM().breakerCd; b.p = 0; F.restores++;
    lg('restore ' + b.id + (auto ? ' (timer)' : ' by ' + (who ? who.name : '?')));
    if (online()) bcast({ t: 'bo4x', k: 'on', id: b.id, a: auto ? 1 : 0 });
    powerFx(b, true, auto); lastHost = 0;
    for (const m of entities) if (m.boRestore === b) m.boRestore = null;
    return true;
  }
  function camKill(c, why) {
    if (!c || c.dead) return;
    c.dead = 1; lg('cam ' + c.id + ' ' + why);
    if (online()) bcast({ t: 'bo4x', k: 'ck', id: c.id });
    camFx(c, 'dead'); lastHost = 0;
  }
  function camBlind(c) {
    if (!c || c.dead) return;
    c.blindU = MATCH.time + GM().camBlindT; lg('cam ' + c.id + ' blinded');
    if (online()) bcast({ t: 'bo4x', k: 'cb', id: c.id, s: r1(GM().camBlindT) });
    camFx(c, 'blind'); lastHost = 0;
  }
  function camAlert(c, spy) {
    const G = GM(); F.alerts++;
    lg('cam ' + c.id + ' saw ' + spy.name);
    if (R.addReveal && G.camRevealT > 0) R.addReveal(spy, G.camRevealT);
    if (R.addPing) R.addPing(spy.pos.x, spy.pos.z, 3, 4, 'h');
    if (online()) bcast({ t: 'bo4x', k: 'ca', id: c.id, w: nid(spy) });
    alertFx(c, spy);
    const bots = entities.filter((m) => alive(m) && !m.isPlayer && !m.isRemote && m.team === MERC).sort((a, b) => hyp(a.pos.x, a.pos.z, spy.pos.x, spy.pos.z) - hyp(b.pos.x, b.pos.z, spy.pos.x, spy.pos.z));
    for (const m of bots.slice(0, 2)) if (R.sendBot) R.sendBot(m, spy.pos, 3, true);
  }
  function pickIntel(it, spy) {
    const G = GM(); const i = F.intel.indexOf(it); if (i < 0) return;
    F.intel.splice(i, 1); F.picks++;
    let gname = '';
    if (Math.random() < G.intelGadget) { const ks = ['smoke', 'flash', 'knife', 'decoy']; const mx = spy.boGadMax || {}; const ok = ks.filter((k) => (mx[k] || 0) > 0); gname = (ok.length ? ok : ks)[(Math.random() * (ok.length || 4)) | 0]; }
    else { try { MATCH.timeLeft += G.intelTime; } catch (e) {} }
    lg('intel ' + it.id + ' ' + spy.name + ' ' + (gname || '+' + G.intelTime + 's'));
    if (online()) bcast({ t: 'bo4x', k: 'in', id: it.id, w: nid(spy), g: gname, s: G.intelTime });
    intelFx(spy, gname, G.intelTime); lastHost = 0;
  }
  function pickKey(spy) {
    const t = R.terminals.find((q) => q.id === F.lock); F.kc = null; F.lock = ''; if (t) t.locked = false;
    lg('keycard ' + spy.name + ' unlocks ' + (t ? t.id : '?'));
    if (online()) bcast({ t: 'bo4x', k: 'kc', id: t ? t.id : '', w: nid(spy) });
    keyFx(t ? t.id : '', spy); lastHost = 0;
  }
  function placeSpyCam(own, x, y, z, nx, nz) {
    const G = GM(), left = scLeft(own);
    if (!(left > 0)) return 'NO SPY CAMERAS LEFT';
    if (F.sc.length >= 12) return 'TOO MANY CAMERAS';
    if (Math.hypot(x - own.pos.x, z - own.pos.z, y - own.pos.y - 1) > 4.5) return 'TOO FAR · GET CLOSER TO THE WALL';
    F.scLeft.set(own, left - 1);
    const c = { id: 's' + (++F.nid) + ((Math.random() * 9) | 0), x: r2(x), y: r2(y), z: r2(z), nx: r2(nx), nz: r2(nz), own };
    F.sc.push(c); lg('spycam ' + own.name); lastHost = 0;
    return c;
  }
  function scLeft(e) { if (!F.scLeft.has(e)) F.scLeft.set(e, Math.round(GM().spyCamN)); return F.scLeft.get(e); }
  function scKill(c, why) {
    const i = F.sc.indexOf(c); if (i < 0) return;
    F.sc.splice(i, 1); lg('spycam ' + c.id + ' ' + why);
    if (online()) bcast({ t: 'bo4x', k: 'sk', id: c.id, p: [c.x, c.y, c.z] });
    sparkFx(c); lastHost = 0;
  }

  /* ---------- host tick ---------- */
  let camT = 0, botT = 0;
  const _c = new V(), _e = new V();
  function hostTick(dt) {
    const G = GM();
    for (const b of F.brk) if (b.st === 1 && MATCH.time >= b.until) restore(b, null, true);
    // pickups
    for (const s of entities) {
      if (!alive(s) || s.team !== SPY) continue;
      for (const it of F.intel.slice()) if (hyp(s.pos.x, s.pos.z, it.x, it.z) < 1.2 && Math.abs(s.pos.y - it.y) < 1.6) pickIntel(it, s);
      if (F.kc && hyp(s.pos.x, s.pos.z, F.kc.x, F.kc.z) < 1.2 && Math.abs(s.pos.y - F.kc.y) < 1.6) pickKey(s);
    }
    // cameras, 10 per second
    camT -= dt;
    if (camT <= 0) {
      const step = 0.1 - Math.min(0, camT); camT = 0.1;
      for (const c of F.cams) {
        if (camDead(c)) { c.seen.clear(); c.see = 0; continue; }
        const yaw = camYaw(c, G), fov = G.camFov * Math.PI / 180;
        _c.set(c.x, c.y, c.z); let any = 0;
        for (const s of entities) {
          if (!alive(s) || s.team !== SPY) { c.seen.delete(s); continue; }
          chest(s, _e);
          const dx = _e.x - c.x, dz = _e.z - c.z, d = Math.hypot(dx, dz);
          let ok = d < G.camR && d > 0.3 && Math.abs(angD(Math.atan2(-dx, -dz), yaw)) < fov;
          if (ok) { const va = Math.atan2(_e.y - c.y, d); ok = Math.abs(va - c.pit) < 0.7; }
          if (ok && G.camCloak >= 1 && s.boCloakOn) ok = false;
          if (ok) ok = lineClear(_c, _e);
          if (!ok) { c.seen.delete(s); continue; }
          const v = (c.seen.get(s) || 0) + step; c.seen.set(s, v); any = 1;
          if (v >= G.camSeeT && MATCH.time > c.alertU) { c.alertU = MATCH.time + 4; camAlert(c, s); }
        }
        c.see = any;
      }
      blindTick(step, true);
    }
    // bots, 4 per second
    botT -= dt;
    if (botT <= 0) { const st = 0.25 - Math.min(0, botT); botT = 0.25; botTick(st, G); }
  }
  // the pistol light on a camera lens (local player; the host also checks its spy bots)
  const _lp = new V(), _ld = new V();
  function blindTick(step, host) {
    const G = GM(), L = window.BOSPYLIGHT; if (!L) return;
    const range = (BOCFG.v && BOCFG.v.spy && BOCFG.v.spy.torchRange) || 20;
    const cone = Math.cos(Math.min(40, ((BOCFG.v && BOCFG.v.spy && BOCFG.v.spy.torchAngle) || 13) * 1.2) * Math.PI / 180); // inside the beam
    const who = host ? entities.filter((e) => alive(e) && e.team === SPY && mine(e)) : [PL.ent];
    for (const c of F.cams) {
      if (camDead(c)) { c.lt = 0; continue; }
      let on = false;
      for (const e of who) {
        if (!alive(e) || !L.on(e)) continue;
        try { L.pose(e, _lp, _ld); } catch (err) { continue; }
        const dx = c.x - _lp.x, dy = c.y - _lp.y, dz = c.z - _lp.z, d = Math.hypot(dx, dy, dz);
        if (d > range || d < 0.3) continue;
        if ((dx * _ld.x + dy * _ld.y + dz * _ld.z) / d < cone) continue;
        if (!lineClear(_lp, _c.set(c.x - dx / d * 0.25, c.y - dy / d * 0.25, c.z - dz / d * 0.25))) continue;
        on = true; break;
      }
      c.lt = on ? (c.lt || 0) + step : 0;
      if (c.lt >= G.camBlindHold) {
        c.lt = 0;
        if (host) camBlind(c); else { toHost({ t: 'bo4q', k: 'bl', id: c.id }); c.blindU = MATCH.time + G.camBlindT; camFx(c, 'blind'); }
      }
    }
  }
  function camYaw(c, G) { return c.yaw + (G.camSweep * Math.PI / 180) * Math.sin(MATCH.time * 0.5 * G.camSpeed + c.ph); }

  /* ---------- bots (host) ---------- */
  function restoreBot(b) {
    let best = null, bd = Infinity;
    for (const m of entities) {
      if (!alive(m) || m.isPlayer || m.isRemote || m.team !== MERC) continue;
      if (m.target && m.visible) continue;
      const d = hyp(m.pos.x, m.pos.z, b.sx, b.sz); if (d < bd) { bd = d; best = m; }
    }
    if (best) { best.boRestore = b; goRestore(best, b); lg('bot ' + best.name + ' to restore ' + b.id); }
  }
  function goRestore(m, b) {
    const g = new V(b.sx, b.sy, b.sz); g.hold = true; g.holdFor = GM().restoreT + 2; g.look = new V(b.x, b.y, b.z);
    m.tactic = 'roam'; m.holdT = 0;
    try { setPath(m, g); } catch (e) {}
    m.boRestoreGoal = g;
  }
  const scT = new Map();
  function botTick(dt, G) {
    for (const m of entities) {
      if (!alive(m) || m.isPlayer || m.isRemote) continue;
      if (m.team === MERC) {
        // restore the power
        const b = m.boRestore;
        if (b) {
          if (b.st !== 1) { m.boRestore = null; m.boRestP = 0; }
          else if (m.target && m.visible) { m.boRestP = 0; }
          else if (hyp(m.pos.x, m.pos.z, b.sx, b.sz) < 1.3) {
            m.holdT = Math.max(m.holdT || 0, 1); m.boRestP = (m.boRestP || 0) + dt / Math.max(0.3, G.restoreT);
            if (m.boRestP >= 1) { m.boRestP = 0; restore(b, m); }
          } else if (m.goal !== m.boRestoreGoal || !m.path) goRestore(m, b);
        } else for (const k of F.brk) if (k.st === 1 && !entities.some((o) => o.boRestore === k && alive(o))) { restoreBot(k); break; }
        // shoot a spy camera it spots
        if (!(m.target && m.visible)) for (const c of F.sc) {
          const d = hyp(m.pos.x, m.pos.z, c.x, c.z); if (d > 12) { scT.delete(m); continue; }
          const eye = entEye(m, new V()); if (!lineClear(eye, new V(c.x + c.nx * 0.15, c.y, c.z + c.nz * 0.15))) continue;
          const t = (scT.get(m) || 0) + dt; scT.set(m, t);
          if (t > 1.5) { scT.delete(m); scKill(c, 'shot by ' + m.name); shotSnd(m.pos, false); }
          break;
        }
      } else if (m.team === SPY) {
        const S = m.bo; if (!S) continue;
        // cut the breaker
        if (S.mode === 'breaker' && S.brk) {
          const b = S.brk;
          if (b.st === 1 || MATCH.time < b.cd) { S.mode = 'hack'; S.brk = null; S.decideT = 0; m.boCutP = 0; }
          else if (hyp(m.pos.x, m.pos.z, b.sx, b.sz) < 1.0) {
            m.boCutP = (m.boCutP || 0) + dt / Math.max(0.3, G.sabotageT);
            if (m.boCutP >= 1) { m.boCutP = 0; cut(b, m); S.mode = 'hack'; S.brk = null; S.decideT = 0; }
          }
        }
        // shoot a live camera that is watching
        if (m.boM9 && !m.boRoll) for (const c of F.cams) {
          if (camDead(c)) continue;
          const d = hyp(m.pos.x, m.pos.z, c.x, c.z); if (d > 15) continue;
          const eye = entEye(m, new V()); if (!lineClear(eye, new V(c.x, c.y, c.z))) continue;
          m.boCamT = (m.boCamT || 0) + dt;
          if (m.boCamT > 1.2) { m.boCamT = 0; camKill(c, 'shot by ' + m.name); shotSnd(m.pos, true); }
          break;
        }
        // plant a spy camera near its terminal
        if (S.term && S.mode === 'hack' && scLeft(m) > 0 && (m.boScT || 0) < MATCH.time && hyp(m.pos.x, m.pos.z, S.term.x, S.term.z) < 8) {
          m.boScT = MATCH.time + 25;
          if (!F.sc.some((c) => c.own === m && hyp(c.x, c.z, S.term.x, S.term.z) < 12)) {
            const tp = new V(S.term.px, termY(S.term) + 1.2, S.term.pz);
            for (let j = 0; j < 8; j++) {
              const a = j * TAU / 8, dx = Math.cos(a), dz = Math.sin(a);
              let hit; try { hit = rayWorld(m.pos.x, m.pos.y + 2.1, m.pos.z, dx, 0, dz, 2.5, 1); } catch (e) { hit = null; }
              if (!hit || Math.abs(hit.ny) > 0.3) continue;
              let nx = hit.nx, nz = hit.nz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
              const x = m.pos.x + dx * hit.t + nx * 0.05, z = m.pos.z + dz * hit.t + nz * 0.05;
              if (!lineClear(new V(x + nx * 0.2, m.pos.y + 2.1, z + nz * 0.2), tp)) continue;
              const r = placeSpyCam(m, x, m.pos.y + 2.1, z, nx, nz); if (typeof r === 'object') break;
            }
          }
        }
      }
    }
  }
  // spy bots: decide to cut the breaker, pick up intel on the way
  const _ba = R.botAbil;
  R.botAbil = function (b, S, threat, td, dt) {
    const r = _ba ? _ba.apply(this, arguments) : undefined;
    try {
      const G = GM();
      if (S.mode === 'hack' && S.term && !S.term.locked && !threat && S.term.prog < 0.3) {
        const k = F.brk.find((q) => q.id === S.term.id);
        if (k && k.st === 0 && MATCH.time >= k.cd) {
          if (S.brkFor !== S.term.id) { S.brkFor = S.term.id; S.brkPlan = Math.random() < G.botBreaker; }
          if (S.brkPlan) { S.mode = 'breaker'; S.brk = k; S.goal = new V(k.sx, k.sy, k.sz); }
        } else if (k && k.st === 1) S.brkPlan = false;
      }
      if ((S.mode === 'hack' || S.mode === 'intel') && !threat && !(S.term && S.term.by === b && S.term.prog > 0.05)) {
        let best = null, bd = 12;
        for (const it of F.intel) { const d = hyp(it.x, it.z, b.pos.x, b.pos.z); if (d < bd && Math.abs(it.y - b.pos.y) < 1.6) { bd = d; best = it; } }
        if (best) { S.mode = 'intel'; S.goal = new V(best.x, best.y, best.z); } else if (S.mode === 'intel') S.mode = 'hack';
      }
    } catch (err) { console.warn('BO facility bot', err); }
    return r;
  };
  // merc bots: patrol a loop through the active terminals, breakers and the extract instead of holding a spot
  let patrolRoute = null;
  function route() {
    if (patrolRoute) return patrolRoute;
    const pts = [];
    for (const t of R.terminals) pts.push({ x: t.x, z: t.z });
    for (const b of F.brk) pts.push({ x: b.sx, z: b.sz });
    try { const X = R.extractPt(); if (X) pts.push({ x: X.x + X.r + 1.5, z: X.z }); } catch (e) {}
    if (!pts.length) return (patrolRoute = []);
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
    pts.sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
    for (const p of pts) p.y = gy(p.x, p.z, typeof gy0 === 'function' ? gy0(p.x, p.z) + 3 : 3);
    return (patrolRoute = pts);
  }
  F.route = () => route();
  const _pg = pickGoal;
  pickGoal = function (b, now) {
    try {
      if (playing() && b.team === MERC && !b.isRemote && GM().botPatrol >= 1) {
        if (b.boRestore && b.boRestore.st === 1) { goRestore(b, b.boRestore); return b.boRestoreGoal; }
        const pts = route();
        if (pts.length) {
          if (Math.random() < 0.2) { const g = _pg(b, now); if (g && !g.hold) return g; }
          const dir = (b.id || 0) % 2 ? -1 : 1, n = pts.length;
          b.boPat = b.boPat == null ? ((b.id || 0) * 3) % n : (b.boPat + dir + n) % n;
          const p = pts[b.boPat]; b.boPatN = (b.boPatN || 0) + 1;
          return new V(p.x + rand(-1.5, 1.5), p.y, p.z + rand(-1.5, 1.5));
        }
      }
    } catch (e) { console.warn('BO patrol', e); }
    return _pg(b, now);
  };

  /* ---------- the player: breakers, spy camera key ---------- */
  const prevK = {};
  F.sp = ''; F.mp = ''; F.prog = -1;
  function nearBrk(me, r) { let best = null, bd = r; for (const b of F.brk) { const d = hyp(me.pos.x, me.pos.z, b.sx, b.sz); if (d < bd && Math.abs(me.pos.y - b.sy) < 1.5) { bd = d; best = b; } } return best; }
  function playerTick(dt) {
    const me = PL.ent, G = GM();
    F.sp = ''; F.mp = ''; F.prog = -1;
    if (!alive(me) || (window.BOEDITOR && BOEDITOR.isOpen()) || (typeof CHAT !== 'undefined' && CHAT.open)) { if (me) me.boCutP = 0; return; }
    const b = nearBrk(me, 1.5), held = !!KEYS.KeyE;
    if (me.team === SPY) {
      if (b && !(R.terminalNear && R.terminalNear(me))) {
        if (b.st === 1) F.sp = 'ZONE ' + b.id + ' BLACKED OUT · ' + Math.ceil(b.until - MATCH.time) + ' s';
        else if (MATCH.time < b.cd) F.sp = 'BREAKER ' + b.id + ' RESETTING · ' + Math.ceil(b.cd - MATCH.time) + ' s';
        else if (!held) { me.boCutP = 0; F.sp = 'HOLD ' + K('hack') + ': CUT THE POWER · ZONE ' + b.id; }
        else {
          me.boCutP = (me.boCutP || 0) + dt / Math.max(0.3, G.sabotageT); F.prog = me.boCutP;
          F.sp = 'CUTTING THE POWER… ' + Math.floor(me.boCutP * 100) + '%';
          if (me.boCutP >= 1) { me.boCutP = 0; if (isCl()) toHost({ t: 'bo4q', k: 'cut', id: b.id }); else cut(b, me); }
        }
      } else me.boCutP = 0;
      if (KEYS.BoSpyCam && !prevK.BoSpyCam) spyCamKey(me);
    } else if (me.team === MERC) {
      if (b && b.st === 1) {
        if (!held) { me.boRestP = 0; F.mp = 'HOLD ' + K('use') + ': RESTORE POWER · ZONE ' + b.id; }
        else {
          me.boRestP = (me.boRestP || 0) + dt / Math.max(0.3, G.restoreT); F.prog = me.boRestP;
          F.mp = 'RESTORING POWER… ' + Math.floor(me.boRestP * 100) + '%';
          if (me.boRestP >= 1) { me.boRestP = 0; if (isCl()) toHost({ t: 'bo4q', k: 'on', id: b.id }); else restore(b, me); }
        }
      } else me.boRestP = 0;
    }
    prevK.BoSpyCam = !!KEYS.BoSpyCam;
  }
  function spyCamKey(me) {
    const o = new V(), f = new V();
    entEye(me, o); camFwd(f);
    const reach = 3.2;
    let hit; try { hit = rayWorld(o.x, o.y, o.z, f.x, f.y, f.z, reach, 1); } catch (e) { hit = null; }
    if (!hit || Math.abs(hit.ny) > 0.45) { scMsg('AIM AT A WALL WITHIN 3 M'); return; }
    let nx = hit.nx, nz = hit.nz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const x = o.x + f.x * hit.t + nx * 0.05, y = o.y + f.y * hit.t, z = o.z + f.z * hit.t + nz * 0.05;
    if (Math.hypot(x - me.pos.x, z - me.pos.z) > 3.6) { scMsg('AIM AT A WALL WITHIN 3 M'); return; }
    if (isCl()) toHost({ t: 'bo4q', k: 'sp', p: [r2(x), r2(y), r2(z)], n: [r2(nx), r2(nz)] });
    else { const r = placeSpyCam(me, x, y, z, nx, nz); scMsg(r); }
  }
  function scMsg(r) { try { if (typeof r === 'string') hudMsg(r, 'info', 1.6); else hudMsg('SPY CAMERA PLANTED', 'xp', 1.4); } catch (e) {} }

  /* ---------- shots: spies shoot cameras, mercs shoot spy cameras ---------- */
  const _fireRay = fireRay;
  fireRay = function (shooter, origin, dir) {
    try {
      if (playing() && shooter && mine(shooter) && (F.cams.length || F.sc.length)) {
        const w = rayWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 120, 1), wt = w ? w.t : 120;
        const test = (x, y, z, r) => { const px = x - origin.x, py = y - origin.y, pz = z - origin.z, t = px * dir.x + py * dir.y + pz * dir.z; if (t <= 0 || t > wt + 0.3) return -1; const qx = px - dir.x * t, qy = py - dir.y * t, qz = pz - dir.z * t; return qx * qx + qy * qy + qz * qz < r * r ? t : -1; };
        if (shooter.team === SPY) {
          for (const c of F.cams) if (!c.dead && test(c.x, c.y, c.z, 0.3) > 0) { if (isCl()) { toHost({ t: 'bo4q', k: 'cs', id: c.id }); c.dead = 1; camFx(c, 'dead'); } else camKill(c, 'shot by ' + shooter.name); break; }
        } else if (shooter.team === MERC) {
          for (const c of F.sc) if (test(c.x + c.nx * 0.06, c.y, c.z + c.nz * 0.06, 0.25) > 0) { if (isCl()) { toHost({ t: 'bo4q', k: 'ss', id: c.id }); sparkFx(c); } else scKill(c, 'shot by ' + shooter.name); break; }
        }
      }
    } catch (e) { console.warn('BO facility shot', e); }
    return _fireRay.apply(this, arguments);
  };

  /* ---------- net ---------- */
  let lastHost = 0, lastSig = '';
  function stateOut() {
    const now = performance.now();
    const m = {
      t: 'bo4s', r: F.rid, a: F.act, l: F.lock, k: F.kc ? [F.kc.x, F.kc.y, F.kc.z] : 0,
      i: F.intel.slice(0, 10).map((q) => [q.id, q.x, q.y, q.z]),
      b: F.brk.slice(0, 6).map((q) => [q.id, q.x, q.y, q.z, q.nx, q.nz, q.sx, q.sy, q.sz, q.tx, q.tz, q.st, r1(Math.max(0, q.until - MATCH.time)), r1(Math.max(0, q.cd - MATCH.time))]),
      c: F.cams.slice(0, 12).map((q) => [q.id, q.x, q.y, q.z, q.yaw, q.pit, q.ph, q.dead ? 1 : 0, r1(Math.max(0, (q.blindU || 0) - MATCH.time)), q.see ? 1 : 0]),
      s: F.sc.slice(0, 12).map((q) => [q.id, q.x, q.y, q.z, q.nx, q.nz, nid(q.own)]),
      q: entities.filter((e) => !e.off && e.team === SPY).map((e) => [nid(e), scLeft(e)]).filter((x) => x[0]).slice(0, 8),
    };
    const sig = JSON.stringify([m.r, m.a, m.l, m.k, m.i.map((x) => x[0]), m.b.map((x) => x[11]), m.c.map((x) => [x[7], x[8] > 0, x[9]]), m.s.map((x) => x[0]), m.q]);
    if (sig !== lastSig || now - lastHost > 1000) { lastSig = sig; lastHost = now; bcast(m); }
  }
  function stateIn(m) {
    cnt(F.got, 'bo4s');
    if (!playing()) return;
    F.rid = sid(m.r);
    if (Array.isArray(m.a)) applyActive(m.a.slice(0, 6).map(sid));
    F.lock = sid(m.l);
    for (const t of R.terminals) t.locked = !!F.lock && t.id === F.lock;
    F.kc = Array.isArray(m.k) ? { x: num(m.k[0]), y: num(m.k[1]), z: num(m.k[2]) } : null;
    if (Array.isArray(m.i)) F.intel = m.i.slice(0, 10).filter(Array.isArray).map((x) => ({ id: sid(x[0]), x: num(x[1]), y: num(x[2]), z: num(x[3]) }));
    if (Array.isArray(m.b)) {
      const old = new Map(F.brk.map((b) => [b.id, b]));
      F.brk = m.b.slice(0, 6).filter(Array.isArray).map((x) => {
        const id = sid(x[0]), o = old.get(id) || {};
        return Object.assign(o, { id, x: num(x[1]), y: num(x[2]), z: num(x[3]), nx: num(x[4]), nz: num(x[5]), sx: num(x[6]), sy: num(x[7]), sz: num(x[8]), tx: num(x[9]), tz: num(x[10]), st: x[11] ? 1 : 0, until: MATCH.time + Math.min(300, num(x[12])), cd: MATCH.time + Math.min(300, num(x[13])) });
      });
    }
    if (Array.isArray(m.c)) {
      const old = new Map(F.cams.map((c) => [c.id, c]));
      F.cams = m.c.slice(0, 12).filter(Array.isArray).map((x) => {
        const id = sid(x[0]), o = old.get(id) || { seen: new Map() };
        return Object.assign(o, { id, x: num(x[1]), y: num(x[2]), z: num(x[3]), yaw: num(x[4]), pit: num(x[5]), ph: num(x[6]), dead: x[7] ? 1 : 0, blindU: MATCH.time + Math.min(60, num(x[8])), see: x[9] ? 1 : 0 });
      });
    }
    if (Array.isArray(m.s)) {
      F.sc = m.s.slice(0, 12).filter(Array.isArray).map((x) => ({ id: sid(x[0]), x: num(x[1]), y: num(x[2]), z: num(x[3]), nx: num(x[4]), nz: num(x[5]), own: ent(x[6]) }));
    }
    if (Array.isArray(m.q)) for (const x of m.q.slice(0, 8)) { const e = Array.isArray(x) && ent(x[0]); if (e) F.scLeft.set(e, x[1] | 0); }
  }
  function eventIn(m) {
    cnt(F.got, 'bo4x');
    if (!playing()) return;
    const b = F.brk.find((q) => q.id === sid(m.id)), c = F.cams.find((q) => q.id === sid(m.id));
    if (m.k === 'cut' && b) { b.st = 1; b.until = MATCH.time + GM().blackoutT; powerFx(b, false); }
    else if (m.k === 'on' && b) { b.st = 0; b.cd = MATCH.time + GM().breakerCd; powerFx(b, true, !!m.a); }
    else if (m.k === 'ck' && c) { c.dead = 1; camFx(c, 'dead'); }
    else if (m.k === 'cb' && c) { c.blindU = MATCH.time + Math.min(60, num(m.s, 8)); camFx(c, 'blind'); }
    else if (m.k === 'ca' && c) { const s = ent(m.w); alertFx(c, s); }
    else if (m.k === 'in') {
      const i = F.intel.findIndex((q) => q.id === sid(m.id)); if (i >= 0) F.intel.splice(i, 1);
      intelFx(ent(m.w), String(m.g || '').slice(0, 8), num(m.s));
    } else if (m.k === 'kc') { F.kc = null; F.lock = ''; for (const t of R.terminals) t.locked = false; keyFx(sid(m.id), ent(m.w)); }
    else if (m.k === 'sk') { const i = F.sc.findIndex((q) => q.id === sid(m.id)); const q = i >= 0 ? F.sc.splice(i, 1)[0] : null; if (q) sparkFx(q); }
    else if (m.k === 'no') { try { hudMsg(String(m.s || '').slice(0, 60), 'info', 1.6); } catch (e) {} }
    else if (m.k === 'ok') { try { hudMsg(String(m.s || '').slice(0, 60), 'xp', 1.4); } catch (e) {} }
  }
  function hostIn(c, m) {
    cnt(F.got, 'bo4q');
    if (!playing()) return;
    const who = NET.remotes.get(c.peer) || null; if (!alive(who)) return;
    const pl = NET.players.get(c.peer);
    const reply = (k, s) => { try { netSendTo(pl, { t: 'bo4x', k, s }); } catch (e) {} };
    const b = F.brk.find((q) => q.id === sid(m.id)), cam = F.cams.find((q) => q.id === sid(m.id));
    if (who.team === SPY) {
      if (m.k === 'cut' && b && hyp(who.pos.x, who.pos.z, b.sx, b.sz) < 2.5) { if (!cut(b, who)) reply('no', 'BREAKER NOT READY'); }
      else if (m.k === 'cs' && cam && hyp(who.pos.x, who.pos.z, cam.x, cam.z) < 130) camKill(cam, 'shot by ' + who.name);
      else if (m.k === 'bl' && cam && hyp(who.pos.x, who.pos.z, cam.x, cam.z) < 90) camBlind(cam);
      else if (m.k === 'sp' && Array.isArray(m.p) && Array.isArray(m.n)) {
        const r = placeSpyCam(who, num(m.p[0]), num(m.p[1]), num(m.p[2]), num(m.n[0]), num(m.n[1], 1));
        if (typeof r === 'string') reply('no', r); else reply('ok', 'SPY CAMERA PLANTED');
      }
    } else if (who.team === MERC) {
      if (m.k === 'on' && b && hyp(who.pos.x, who.pos.z, b.sx, b.sz) < 2.5) restore(b, who);
      else if (m.k === 'ss') { const q = F.sc.find((x) => x.id === sid(m.id)); if (q && hyp(who.pos.x, who.pos.z, q.x, q.z) < 130) scKill(q, 'shot by ' + who.name); }
    }
  }
  if (typeof netHostMsg === 'function') {
    const _hm = netHostMsg;
    netHostMsg = function (c, m) {
      if (m && m.t === 'bo4q' && NET.role === 'host') { const pl = NET.players.get(c.peer); if (pl && pl.conn === c) { try { hostIn(c, m); } catch (e) { console.warn('BO facility in', e); } } return; }
      return _hm.apply(this, arguments);
    };
  }
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) {
      if (m && m.t === 'bo4s') { try { stateIn(m); } catch (e) { console.warn('BO bo4s', e); } return; }
      if (m && m.t === 'bo4x') { try { eventIn(m); } catch (e) { console.warn('BO bo4x', e); } return; }
      return _cm.apply(this, arguments);
    };
  }

  /* ---------- sound and messages ---------- */
  const auOk = () => typeof AU !== 'undefined' && AU.ready && AU.ctx;
  const me0 = () => PL.ent;
  function powerFx(b, on, auto) {
    if (auOk()) {
      try {
        const o = auOut(new V(b.x, b.y, b.z), 0.6, 1, 0.02, 12), at = AU.ctx.currentTime + 0.01;
        if (on) { tn(o, at, 0.6, 60, 120, 'sawtooth', 0.25); tn(o, at + 0.05, 0.5, 120, 240, 'sine', 0.12); }
        else { nz(o, at, 0.12, 'bandpass', 2400, 600, 2, 0.4); tn(o, at, 0.9, 120, 40, 'sawtooth', 0.3); }
      } catch (e) {}
    }
    const me = me0(); if (!me) return;
    try {
      if (!on) hudMsg(me.team === MERC ? 'POWER CUT · ZONE ' + b.id + ' · RESTORE IT AT THE BREAKER' : 'POWER CUT · ZONE ' + b.id + ' · ' + Math.round(GM().blackoutT) + ' s OF DARK', me.team === MERC ? 'enemy' : 'xp', 2.6);
      else hudMsg('POWER BACK · ZONE ' + b.id + (auto ? '' : ' · RESTORED'), me.team === MERC ? 'xp' : 'info', 2);
    } catch (e) {}
  }
  function alertTone() {
    if (!auOk()) return;
    try { const o = uiOut(0.35), at = AU.ctx.currentTime + 0.005; for (let i = 0; i < 3; i++) tn(o, at + i * 0.16, 0.1, 1320, 1320, 'square', 0.12); } catch (e) {}
  }
  function alertFx(c, spy) {
    const me = me0(); if (!me) return;
    if (me.team === MERC) { alertTone(); try { hudMsg('CAMERA ' + c.id + ' · SPY SPOTTED', 'enemy', 2.6); } catch (e) {} }
    else if (spy === me) { try { hudMsg('A CAMERA SAW YOU · EXPOSED', 'enemy', 2.2); } catch (e) {} }
    c.flash = performance.now();
  }
  function camFx(c, what) {
    if (what === 'dead') sparkFx(c);
    const me = me0();
    if (me && me.team === MERC && hyp(me.pos.x, me.pos.z, c.x, c.z) < 60) { try { hudMsg('CAMERA ' + c.id + (what === 'dead' ? ' DOWN' : ' BLINDED'), 'info', 1.6); } catch (e) {} }
    if (me && me.team === SPY && what === 'blind' && hyp(me.pos.x, me.pos.z, c.x, c.z) < 40) { try { hudMsg('CAMERA ' + c.id + ' BLINDED', 'xp', 1.4); } catch (e) {} }
  }
  function sparkFx(c) {
    try { FX.spark && FX.spark.spawn && FX.spark.spawn(c.x, c.y, c.z); } catch (e) {}
    if (auOk()) { try { const o = auOut(new V(c.x, c.y, c.z), 0.1, 0.6, 1.4, 3), at = AU.ctx.currentTime; tn(o, at, 0.18, 1800, 300, 'sawtooth', 0.12); nz(o, at, 0.1, 'highpass', 3000, 3000, 1, 0.1); } catch (e) {} }
  }
  function shotSnd(p, quiet) {
    if (!auOk()) return;
    try { const o = auOut(new V(p.x, p.y + 1.3, p.z), quiet ? 0.2 : 0.6, 1, quiet ? 0.6 : 0.05, quiet ? 4 : 20), at = AU.ctx.currentTime; nz(o, at, 0.08, 'bandpass', quiet ? 1800 : 900, 600, 1, 0.3); } catch (e) {}
  }
  function intelFx(spy, g, s) {
    const me = me0(); if (!me) return;
    if (spy && mine(spy) && g) { const gd = spy.boGad; if (gd) { gd[g] = (gd[g] || 0) + 1; if (spy.boGadMax) spy.boGadMax[g] = Math.max(spy.boGadMax[g] || 0, gd[g]); } }
    const GN = { smoke: 'SMOKE BOMB', flash: 'FLASHBANG', knife: 'THROWING KNIFE', decoy: 'DECOY' };
    try {
      if (me.team === SPY) hudMsg('INTEL' + (spy === me ? '' : ' · ' + (spy ? spy.name : '')) + ' · ' + (g ? '+1 ' + (GN[g] || g) : '+' + Math.round(s) + ' s ON THE CLOCK'), 'xp', 2);
      else if (!g) hudMsg('SPIES TOOK INTEL · +' + Math.round(s) + ' s', 'info', 1.8);
    } catch (e) {}
    if (auOk() && spy && me.team === SPY) { try { const o = uiOut(0.3), at = AU.ctx.currentTime; tn(o, at, 0.08, 880, 880, 'sine', 0.12); tn(o, at + 0.09, 0.12, 1320, 1320, 'sine', 0.12); } catch (e) {} }
  }
  function keyFx(id, spy) {
    const me = me0(); if (!me) return;
    try { hudMsg(me.team === SPY ? 'KEYCARD' + (spy && spy !== me ? ' (' + spy.name + ')' : '') + ' · TERMINAL ' + id + ' UNLOCKED' : 'SPIES HAVE THE KEYCARD · TERMINAL ' + id + ' OPEN', me.team === SPY ? 'xp' : 'enemy', 2.4); } catch (e) {}
  }

  /* ---------- lamps: blackout and dead terminals (the baked light grid, rebaked one lamp per frame) ---------- */
  const reQ = []; const termLamp = new Map();
  function lampOf(t) {
    if (termLamp.has(t)) return termLamp.get(t);
    const fx = (t.x - t.px) / 0.75, fz = (t.z - t.pz) / 0.75, x = t.px + fx * 0.45, z = t.pz + fz * 0.45;
    let best = null, bd = 0.35;
    for (const l of LAMPS) { const d = hyp(l.x, l.z, x, z); if (d < bd && l.p <= 0.25) { bd = d; best = l; } }
    termLamp.set(t, best); return best;
  }
  let lampMapGen = -1;
  function lampTick() {
    if (lampMapGen !== LAMPS.length) { termLamp.clear(); lampMapGen = LAMPS.length; }
    const G = GM(), off = new Set();
    const act = new Set(F.act);
    if (playing()) for (const t of F.all) if (!act.has(t.id)) { const l = lampOf(t); if (l) off.add(l); }
    const dark = playing() ? F.brk.filter((b) => b.st === 1) : [];
    let X = null; try { X = R.extractPt && R.extractPt(); } catch (e) {}
    for (const l of LAMPS) {
      let want = null;
      if (off.has(l)) want = 0;
      else if (dark.length && !(X && hyp(l.x, l.z, X.x, X.z) < 1.2) && dark.some((b) => hyp(l.x, l.z, b.tx, b.tz) < G.breakerR)) want = G.blackoutDim;
      if ((l.boDim == null ? null : l.boDim) !== want) { l.boDim = want; if (!reQ.includes(l)) reQ.push(l); }
    }
    const A = window.BO_SPY;
    if (reQ.length && A && A.lampRebake) {
      const l = reQ[0];
      let ok = false; try { ok = A.lampRebake(l); } catch (e) { ok = true; }
      if (ok || (l.boTry = (l.boTry || 0) + 1) > 30) { reQ.shift(); l.boTry = 0; }
    }
  }
  F.reQ = reQ;

  /* ---------- visuals ---------- */
  let glowTex = null;
  function glow() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
  }
  const MT = {};
  function mats() {
    if (MT.box) return MT;
    MT.box = new THREE.MeshBasicMaterial({ color: 0x2a2f33 }); MT.dark = new THREE.MeshBasicMaterial({ color: 0x070809 });
    MT.yel = new THREE.MeshBasicMaterial({ color: 0x8a6a10 }); MT.cam = new THREE.MeshBasicMaterial({ color: 0x3a4045 });
    MT.folder = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.6, 1.15, 0.25) });
    MT.card = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.3, 1.6, 2.0) });
    const sp = (c) => new THREE.SpriteMaterial({ map: glow(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    MT.g = sp(0x3aff7a); MT.r = sp(0xff2a1a); MT.a = sp(0xffb020); MT.y = sp(0xffd166); MT.c = sp(0x5fd8ff);
    MT.cone = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    MT.coneR = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    MT.coneS = new THREE.MeshBasicMaterial({ color: 0x3aff7a, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    return MT;
  }
  const VIS = new Map(); // object -> group
  function coneGeo(L, ang) { const g = new THREE.ConeGeometry(Math.tan(ang) * L, L, 18, 1, true); g.translate(0, -L / 2, 0); g.rotateX(Math.PI / 2); return g; }
  function build(o, kind) {
    const m = mats(), g = new THREE.Group(); g.name = 'boFac';
    if (kind === 'brk') {
      const yaw = Math.atan2(o.nx, o.nz);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.16), m.box); box.position.set(o.x + o.nx * 0.08, o.y, o.z + o.nz * 0.08); box.rotation.y = yaw;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.162), m.yel); stripe.position.set(o.x + o.nx * 0.08, o.y + 0.26, o.z + o.nz * 0.08); stripe.rotation.y = yaw;
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.06), m.dark); lever.position.set(o.x + o.nx * 0.19, o.y - 0.05, o.z + o.nz * 0.19); lever.rotation.y = yaw;
      const led = new THREE.Sprite(m.g); led.scale.set(0.16, 0.16, 0.16); led.position.set(o.x + o.nx * 0.18, o.y + 0.18, o.z + o.nz * 0.18);
      g.add(box, stripe, lever, led); g.userData = { led, lever };
    } else if (kind === 'cam' || kind === 'sc') {
      const G = GM(), spy = kind === 'sc';
      const body = new THREE.Mesh(new THREE.BoxGeometry(spy ? 0.09 : 0.16, spy ? 0.07 : 0.13, spy ? 0.12 : 0.32), spy ? m.dark : m.cam);
      const head = new THREE.Group(); head.position.set(o.x, o.y, o.z); head.rotation.order = 'YXZ'; head.add(body); body.position.z = spy ? -0.03 : -0.1;
      const led = new THREE.Sprite(spy ? m.g : m.r); led.scale.set(spy ? 0.07 : 0.12, spy ? 0.07 : 0.12, 1); led.position.set(0, spy ? 0.05 : 0.09, spy ? -0.08 : -0.22); head.add(led);
      const L = spy ? Math.min(G.spyCamR, 9) : Math.min(G.camR, 12), ang = (spy ? G.spyCamFov : G.camFov) * Math.PI / 180;
      const cone = new THREE.Mesh(coneGeo(L, Math.min(1.2, ang)), spy ? m.coneS : m.cone); cone.renderOrder = 3; head.add(cone);
      if (!spy) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), m.box); arm.position.set(o.x - Math.sin(o.yaw) * -0.0, o.y + 0.08, o.z); g.add(arm); }
      g.add(head); g.userData = { head, led, cone, L, ang };
      if (spy) head.rotation.set(-0.15, Math.atan2(-o.nx, -o.nz), 0);
    } else if (kind === 'intel') {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.24), m.folder); const s = new THREE.Sprite(m.y); s.scale.set(0.7, 0.7, 1); s.position.y = 0.15;
      const h = new THREE.Group(); h.add(f, s); h.position.set(o.x, o.y + 0.35, o.z); g.add(h); g.userData = { h };
    } else if (kind === 'kc') {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.15), m.card); const s = new THREE.Sprite(m.c); s.scale.set(0.6, 0.6, 1); s.position.y = 0.1;
      const h = new THREE.Group(); h.add(f, s); h.position.set(o.x, o.y + 0.4, o.z); g.add(h); g.userData = { h };
    } else if (kind === 'off') { // a dead terminal: black over the screen and keyboard
      const fx = (o.x - o.px) / 0.75, fz = (o.z - o.pz) / 0.75, rot = Math.atan2(fx, fz), y = termY(o);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.44, 0.03), m.dark); a.position.set(o.px - fx * 0.105, y + 1.12, o.pz - fz * 0.105); a.rotation.y = rot;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.02, 0.33), m.dark); b.position.set(o.px + fx * 0.05, y + 1.058, o.pz + fz * 0.05); b.rotation.y = rot;
      g.add(a, b);
    }
    scene.add(g); return g;
  }
  function unbuild(o) { const g = VIS.get(o); if (!g) return; scene.remove(g); g.traverse((q) => { if (q.geometry) q.geometry.dispose(); }); VIS.delete(o); }
  function visTick() {
    const want = new Map(), on = playing();
    if (on) {
      for (const b of F.brk) want.set(b, 'brk');
      for (const c of F.cams) want.set(c, 'cam');
      for (const c of F.sc) want.set(c, 'sc');
      for (const i of F.intel) want.set(i, 'intel');
      if (F.kc) want.set(F.kc, 'kc');
      const act = new Set(F.act); for (const t of F.all) if (!act.has(t.id)) want.set(t, 'off');
    }
    for (const [o] of VIS) if (!want.has(o)) unbuild(o);
    for (const [o, k] of want) if (!VIS.has(o)) { const g = build(o, k); g.userData.kind = k; VIS.set(o, g); }
    if (!on) return;
    const G = GM(), now = performance.now(), m = mats(), me = PL.ent, spyMe = me && me.team === SPY;
    for (const [o, g] of VIS) {
      const u = g.userData, k = u.kind;
      if (k === 'brk') {
        const cd = MATCH.time < o.cd;
        u.led.material = o.st === 1 ? m.r : cd ? m.a : m.g;
        u.led.visible = o.st === 1 ? Math.floor(now / 350) % 2 === 0 : true;
        u.lever.position.y = o.y + (o.st === 1 ? -0.14 : -0.05);
      } else if (k === 'cam') {
        const dead = camDead(o);
        u.head.rotation.set(o.pit, camYaw(o, G), 0);
        u.cone.visible = !dead; u.cone.material = o.see || (o.flash && now - o.flash < 1500) ? m.coneR : m.cone;
        u.led.visible = !dead && Math.floor(now / 500) % 2 === 0;
        if (o.dead && !u.tilt) { u.tilt = 1; u.head.rotation.x = -0.9; }
        if (o.dead) u.head.rotation.x = -0.9;
      } else if (k === 'sc') {
        u.cone.visible = spyMe; u.led.visible = Math.floor(now / 900) % 3 === 0; u.led.material = spyMe ? m.g : m.r;
      } else if (k === 'intel' || k === 'kc') {
        u.h.rotation.y = now / 600; u.h.position.y = o.y + 0.35 + Math.sin(now / 400) * 0.05;
      }
    }
  }

  /* ---------- spy cameras: what they see (each spy's own machine) ---------- */
  let seeT = 0;
  function spyCamSee(dt) {
    const me = PL.ent; if (!me || me.team !== SPY) { F.seen = []; return; }
    seeT -= dt; if (seeT > 0) return; seeT = 0.2;
    const G = GM(), out = [], fov = G.spyCamFov * Math.PI / 180, cp = new V(), mp = new V();
    for (const c of F.sc) {
      const yaw = Math.atan2(-c.nx, -c.nz); cp.set(c.x + c.nx * 0.1, c.y, c.z + c.nz * 0.1);
      for (const m of entities) {
        if (!alive(m) || m.team !== MERC || out.some((s) => s.e === m)) continue;
        chest(m, mp); const dx = mp.x - cp.x, dz = mp.z - cp.z, d = Math.hypot(dx, dz);
        if (d > G.spyCamR || Math.abs(angD(Math.atan2(-dx, -dz), yaw)) > fov || !lineClear(cp, mp)) continue;
        out.push({ e: m, x: m.pos.x, y: m.pos.y, z: m.pos.z, c: c.id });
      }
    }
    F.seen = out;
  }

  /* ---------- HUD ---------- */
  let H = null;
  function hudBuild() {
    if (H || !R.hud || !R.hud.el) return H;
    const css = document.createElement('style');
    css.textContent = '#boHud .bo-fac{position:absolute;left:50%;top:150px;transform:translateX(-50%);font-weight:800;font-size:12px;letter-spacing:.14em;padding:4px 12px;white-space:nowrap;display:none;color:#ff9a5a;background:rgba(30,12,4,.72);border:1px solid rgba(255,140,80,.5)}'
      + '#boHud .bo-fp{position:absolute;left:50%;bottom:24%;transform:translateX(-50%);font-weight:700;font-size:15px;letter-spacing:.08em;text-transform:uppercase;padding:8px 16px;background:rgba(10,14,18,.72);border-left:3px solid #ffd166;white-space:nowrap;display:none}'
      + '#boHud .bo-fb{position:absolute;left:50%;bottom:21.5%;transform:translateX(-50%);width:220px;height:6px;background:rgba(255,255,255,.12);display:none}#boHud .bo-fb i{display:block;height:100%;width:0;background:#ffd166}'
      + '#boHud .bo-mk.brk{color:#ffd166;font-size:10px}#boHud .bo-mk.brk.dk{color:#ff6b5a}#boHud .bo-mk.cam{color:#ff6b5a;font-size:10px}#boHud .bo-mk.cam.off{color:#7a8590}'
      + '#boHud .bo-mk.int{color:#ffd166;font-size:10px}#boHud .bo-mk.kc{color:#5fd8ff}#boHud .bo-mk.sn{color:#ff5a5a}#boHud .bo-mk.scm{color:#3aff7a;font-size:10px}#boHud .bo-mk.t.lk{color:#5fd8ff}';
    document.head.appendChild(css);
    H = { fac: document.createElement('div'), fp: document.createElement('div'), fb: document.createElement('div') };
    H.fac.className = 'bo-fac'; H.fp.className = 'bo-fp'; H.fb.className = 'bo-fb'; H.fb.innerHTML = '<i></i>';
    R.hud.el.appendChild(H.fac); R.hud.el.appendChild(H.fp); R.hud.el.appendChild(H.fb);
    // restack as soon as one of the banners shows, hides or changes size (whatever module drew it)
    try {
      const BAN = /\bbo-(obj|drain|halert|fac)\b/;
      new MutationObserver((ms) => { for (const m of ms) { const t = m.target; if (t && t.nodeType === 1 && BAN.test(t.className || '')) { layout(); return; } if (t && t.nodeType === 3 && t.parentNode && BAN.test(t.parentNode.className || '')) { layout(); return; } } })
        .observe(R.hud.el, { attributes: true, attributeFilter: ['style', 'class'], subtree: true, childList: true, characterData: true });
    } catch (e) {}
    return H;
  }
  const _sp = R.spyPrompt;
  R.spyPrompt = function (e) { const a = _sp ? _sp(e) : ''; if (a) return a; return F.sp || ''; };
  let layT = 0;
  function layout() {
    // stack the top banners under the score panel: objective, timer drain, hack alert, power line
    const el = R.hud && R.hud.el; if (!el || el.style.display === 'none') return;
    const sc = document.querySelector('.score');
    let top = 64;
    try { if (sc) { const r = sc.getBoundingClientRect(); if (r.height > 0 && r.bottom < innerHeight * 0.4) top = Math.max(top, Math.round(r.bottom + 6)); } } catch (e) {}
    for (const q of ['.bo-obj', '.bo-drain', '.bo-halert', '.bo-fac']) {
      const b = [...document.querySelectorAll('#boHud ' + q)].find((x) => getComputedStyle(x).display !== 'none'); if (!b) continue;
      if (b.style.top !== top + 'px') b.style.top = top + 'px';
      top += b.offsetHeight + 4;
    }
    F.lay = top;
  }
  F.layout = layout;
  function hudTick(dt) {
    const h = hudBuild(); if (!h) return;
    const on = playing(), me = PL.ent, spy = me && me.team === SPY, merc = me && me.team === MERC, G = GM();
    // power line
    let ft = '';
    if (on) { const d = F.brk.filter((b) => b.st === 1); if (d.length) ft = 'BLACKOUT · ZONE ' + d.map((b) => b.id + ' ' + Math.max(0, Math.ceil(b.until - MATCH.time)) + ' s').join(' · ZONE '); }
    h.fac.style.display = ft ? 'block' : 'none'; if (h.fac._t !== ft) { h.fac.textContent = ft; h.fac._t = ft; }
    // merc prompt
    const mp = on && merc && me.alive ? F.mp : '';
    h.fp.style.display = mp ? 'block' : 'none'; if (h.fp._t !== mp) { h.fp.textContent = mp; h.fp._t = mp; }
    h.fb.style.display = mp && F.prog >= 0 ? 'block' : 'none'; if (mp && F.prog >= 0) h.fb.firstChild.style.width = Math.round(F.prog * 100) + '%';
    // the spy's cut bar (09zo shows the prompt through R.spyPrompt)
    try { const bar = R.hud.el.querySelector('.bo-bar'); if (bar && spy && F.sp && R.hud.prompt === F.sp && F.prog >= 0) { bar.style.display = 'block'; bar.firstChild.style.width = Math.round(F.prog * 100) + '%'; } } catch (e) {}
    // markers
    const keep = new Set(), mk = (k, cls, l, s, x, y, z) => { keep.add(k); R.marker(k, cls, l, s, x, y, z); };
    if (on && me) {
      const dist = (x, z) => Math.round(hyp(me.pos.x, me.pos.z, x, z));
      for (const b of F.brk) {
        const d = dist(b.x, b.z);
        if (b.st === 1) mk('fb' + b.id, 'brk dk', 'BREAKER ' + b.id, (merc ? 'RESTORE · ' : 'DARK · ') + d + ' m', b.x, b.y + 0.6, b.z);
        else if (d < 30) mk('fb' + b.id, 'brk', 'BREAKER ' + b.id, d + ' m', b.x, b.y + 0.6, b.z);
      }
      if (spy) {
        for (const c of F.cams) { const d = dist(c.x, c.z); if (d < 28) mk('fc' + c.id, 'cam' + (camDead(c) ? ' off' : ''), 'CAM', c.dead ? 'DOWN' : camDead(c) ? 'OFF' : d + ' m', c.x, c.y + 0.35, c.z); }
        for (const i of F.intel) { const d = dist(i.x, i.z); if (d < 35) mk('fi' + i.id, 'int', 'INTEL', d + ' m', i.x, i.y + 0.8, i.z); }
        if (F.kc) mk('fk', 'kc', 'KEYCARD', 'TERMINAL ' + F.lock + ' · ' + dist(F.kc.x, F.kc.z) + ' m', F.kc.x, F.kc.y + 0.9, F.kc.z);
        for (const s of F.seen) mk('fs' + nid(s.e) + s.e.name, 'sn', '◆', 'CAM ' + dist(s.x, s.z) + ' m', s.x, s.y + 2.1, s.z);
        for (const c of F.sc) { const d = dist(c.x, c.z); if (d < 40) mk('fsc' + c.id, 'scm', 'SPY CAM', d + ' m', c.x, c.y + 0.3, c.z); }
      }
    }
    const act = new Set(F.act);
    for (const k in R.hud.mk) {
      if (k[0] === 'f' && /^f(b|c|i|k|s)/.test(k) && !keep.has(k)) R.hud.mk[k].style.display = 'none';
      if (k[0] === 't' && k.length <= 3 && F.all.length && !act.has(k.slice(1)) && F.all.some((t) => t.id === k.slice(1))) R.hud.mk[k].style.display = 'none';
    }
    layT -= dt; if (layT <= 0) { layT = 0.1; layout(); }
  }
  // the key bar
  const _kh = R.keysHtml;
  R.keysHtml = function (spy, me) {
    const base = _kh ? _kh(spy, me) : '', kb = (k) => '<b>' + k + '</b>';
    if (spy) { const n = me ? (F.scLeft.has(me) ? F.scLeft.get(me) : Math.round(GM().spyCamN)) : 0; return base + '<br>' + kb(K('spycam')) + 'spy camera <em' + (n > 0 ? '' : ' class="z"') + '>×' + n + '</em> &nbsp;' + kb(K('hack')) + 'hold at a breaker: cut the power'; }
    return base + '<br>' + kb(K('use')) + 'hold at a breaker: restore the power';
  };
  if (typeof domMinimap === 'function') {
    const _dm = domMinimap;
    domMinimap = function (g, scale) {
      const r = _dm.apply(this, arguments);
      try {
        if (playing()) {
          const me = PL.ent, spy = me && me.team === SPY, G = GM();
          for (const b of F.brk) {
            if (b.st === 1) { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(b.tx * scale, b.tz * scale, G.breakerR * scale, 0, TAU); g.fill(); }
            g.fillStyle = b.st === 1 ? '#ff6b5a' : '#ffd166'; g.fillRect(b.x * scale - 3, b.z * scale - 3, 6, 6);
          }
          for (const c of F.cams) { g.fillStyle = camDead(c) ? 'rgba(140,150,160,.6)' : spy ? '#ff6b5a' : '#cfe8ff'; g.beginPath(); g.arc(c.x * scale, c.z * scale, 2.5, 0, TAU); g.fill(); }
          if (spy) {
            for (const i of F.intel) { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(i.x * scale, i.z * scale, 2.5, 0, TAU); g.fill(); }
            if (F.kc) { g.fillStyle = '#5fd8ff'; g.fillRect(F.kc.x * scale - 3, F.kc.z * scale - 3, 6, 6); }
            for (const c of F.sc) { g.fillStyle = '#3aff7a'; g.beginPath(); g.arc(c.x * scale, c.z * scale, 2.5, 0, TAU); g.fill(); }
            for (const s of F.seen) { g.fillStyle = '#ff5a5a'; g.beginPath(); g.arc(s.x * scale, s.z * scale, 4, 0, TAU); g.fill(); }
          }
        }
      } catch (e) {}
      return r;
    };
  }

  /* ---------- per frame ---------- */
  let last = null;
  const _fr = frame;
  frame = function (now) {
    _fr(now);
    try {
      const dt = Math.min(0.05, (last != null ? now - last : 16) / 1000); last = now;
      if (!bo()) { if (VIS.size) visTick(); if (H) { H.fac.style.display = 'none'; H.fp.style.display = 'none'; H.fb.style.display = 'none'; } lampTick(); return; }
      if (MATCH.state === 'playing') {
        if (!(typeof playHold === 'function' && playHold()) && !R.roundOver) {
          playerTick(dt);
          if (auth()) hostTick(dt);
          else { F.ct = (F.ct || 0) - dt; if (F.ct <= 0) { F.ct = 0.1; blindTick(0.1, false); } }
          spyCamSee(dt);
        }
        if (auth() && online()) stateOut();
      }
      lampTick(); visTick(); hudTick(dt);
    } catch (err) { if (!F.err || F.err < 5) { F.err = (F.err || 0) + 1; console.warn('BO facility', err); } }
  };
  F.cut = cut; F.restore = restore; F.camKill = camKill; F.camBlind = camBlind; F.placeSpyCam = placeSpyCam; F.scKill = scKill; F.camYaw = (c) => camYaw(c, GM()); F.camDead = camDead;
})();
