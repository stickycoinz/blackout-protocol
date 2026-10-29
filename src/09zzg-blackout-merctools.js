/* ==========================================================================
   BLACKOUT pass 22: merc tools, no safe shadows.
   - Motion scanner (merc key 'scan', Z): held (or toggled, game.scanToggle). A battery (game.scanTime, recharge game.scanRecharge).
     Every game.scanPulse seconds it shows moving spies inside game.scanR as blips; a crouch-walking spy only shows game.scanCrouch of the
     time; a spy standing still in the dark longer than game.scanStillT shows as a faint, offset blip. Spies near a scanning merc hear it.
   - Traps: tripwire ('trip', X: thin wire at ankle height, game.tripN each) and laser mine ('lmine', B: red beam at chest height that
     blows up, game.mineN each). A spy crossing one sounds the alarm and is exposed (game.trapRevealT). Spies disarm a trap by holding the
     hack key at its device (game.disarmT) or shoot the device.
   - Flare ('flare', V, game.flareN each): thrown, it lights a game.flareR area for game.flareT seconds from the fixed light pool
     (flashLights: one entry held per burning flare, never a new light). A spy in its light cannot cloak.
   - Merc bots scan, place traps near terminals and flare alert spots; spy bots disarm traps they see.
   - Online: the host owns the traps, flares and charges: 'bo3s' (host state), 'bo3x' (host event: trap set off, device destroyed),
     'bo3q' (client: place, throw, disarm, shot, scanner on/off). The scanner itself runs on the merc's own machine.
   ========================================================================== */
(function () {
  const R = window.BO_RULES; if (!R || !window.BOCFG) return;
  const MERC = 0, SPY = 1, V = THREE.Vector3;
  const GM = () => Object.assign({}, BOCFG.defaults().game, (BOCFG.v && BOCFG.v.game) || {});
  const M = window.BOMERC = { dev: [], flares: [], blips: [], scanning: new Set(), bat: 1, scanOn: false, log: [], sent: {}, got: {}, trig: 0, kills: 0, dis: null, nid: 0 };
  const lg = (s) => { M.log.push(((MATCH && MATCH.time) || 0).toFixed(1) + ' ' + s); if (M.log.length > 80) M.log.shift(); };
  const bo = () => { try { return typeof boIsBlackout === 'function' && !!boIsBlackout(); } catch (e) { return false; } };
  const playing = () => bo() && MATCH.state === 'playing';
  const online = () => typeof NET !== 'undefined' && MATCH.online && NET.on && (NET.role === 'host' || NET.role === 'client');
  const isCl = () => online() && NET.role === 'client';
  const auth = () => !isCl();
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  const cnt = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const bcast = (m) => { cnt(M.sent, m.t); try { netBroadcast(m, true); } catch (e) {} };
  const toHost = (m) => { cnt(M.sent, m.t); try { netSend(m); } catch (e) {} };
  const nid = (e) => { try { return (e && netIdOf(e)) || ''; } catch (err) { return ''; } };
  const ent = (id) => { try { return id ? netEntity(String(id)) : null; } catch (e) { return null; } };
  const hyp = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const K = (id) => (window.BOKEYS ? BOKEYS.K(id) : id);
  const alive = (e) => e && !e.off && e.alive;
  const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

  /* ---------- charges (host) ---------- */
  function charges(e) {
    const g = GM();
    if (!e.boMt || e.boMt.round !== R.roundId) e.boMt = { round: R.roundId, trip: Math.round(g.tripN), mine: Math.round(g.mineN), flare: Math.round(g.flareN) };
    return e.boMt;
  }
  R.roundId = R.roundId || 0;

  /* ---------- geometry ---------- */
  function gy(x, z, y) { try { return groundHeight(x, z, y + 1.2, 0.2); } catch (e) { return y; } }
  // a wire or a beam from (x, y0, z) along (dx, dz) at height h: stops at a wall or where the floor changes
  function span(x, y0, z, dx, dz, h, maxL) {
    const l0 = Math.hypot(dx, dz) || 1; dx /= l0; dz /= l0;
    let L = 0; const a = new V(x, y0 + h, z), b = new V();
    for (let s = 0.25; s <= maxL + 1e-6; s += 0.25) {
      b.set(x + dx * s, y0 + h, z + dz * s);
      if (!lineClear(a, b)) break;
      if (Math.abs(gy(b.x, b.z, y0) - y0) > 0.35) break;
      L = s;
    }
    return { dx, dz, L: Math.max(0, L - 0.1) };
  }
  const H_TRIP = 0.16, H_LASER = 0.95;
  function devHeight(d) { return d.g === 'trip' ? H_TRIP : H_LASER; }
  function devPt(d) { return new V(d.x, d.y + (d.g === 'trip' ? 0.15 : H_LASER), d.z); } // the device itself (shoot it / disarm it)

  /* ---------- traps: place, trigger, remove ---------- */
  function placeAuth(owner, g, x, y, z, dx, dz) {
    const c = charges(owner), G = GM();
    const key = g === 'trip' ? 'trip' : 'mine';
    if (!(c[key] > 0)) return 'NO ' + (g === 'trip' ? 'TRIPWIRES' : 'LASER MINES') + ' LEFT';
    if (M.dev.length >= 30) return 'TOO MANY TRAPS';
    // a device right at a terminal (or the extract) could never be disarmed: the spy's hack key works the terminal there
    if (tooClose(x, z)) return 'TOO CLOSE TO A TERMINAL · STEP BACK';
    const y0 = gy(x, z, y);
    const sp = span(x, y0, z, dx, dz, g === 'trip' ? H_TRIP : H_LASER, g === 'trip' ? G.tripLen : G.mineLen);
    if (sp.L < 1.2) return 'NO ROOM HERE · FACE AN OPEN SPACE';
    c[key]--;
    M.nid++;
    const d = { id: 'd' + M.nid + Math.floor(Math.random() * 99), g, x, y: y0, z, dx: sp.dx, dz: sp.dz, L: sp.L, own: owner, at: MATCH.time };
    M.dev.push(d); lastHost = 0;
    lg('place ' + g + ' ' + owner.name + ' L' + sp.L.toFixed(1));
    sfxPlace(devPt(d));
    return d;
  }
  function tooClose(x, z) {
    for (const t of R.terminals || []) if (!t.hacked && Math.min(hyp(x, z, t.x, t.z), t.px != null ? hyp(x, z, t.px, t.pz) - 0.35 : 99) < 2.2) return true;
    try { const X = R.extractPt && R.extractPt(); if (X && hyp(x, z, X.x, X.z) < X.r + 0.6) return true; } catch (e) {}
    return false;
  }
  function trigger(d, spy) {
    if (!M.dev.includes(d)) return;
    removeDev(d);
    M.trig++;
    lg('trap ' + d.g + ' ' + (spy ? spy.name : ''));
    const G = GM();
    if (spy && R.addReveal && G.trapRevealT > 0) R.addReveal(spy, G.trapRevealT);
    // the charge goes off where the beam or wire was broken
    let t = spy ? (spy.pos.x - d.x) * d.dx + (spy.pos.z - d.z) * d.dz : 0; t = Math.max(0, Math.min(d.L, t));
    const bx = d.x + d.dx * t, bz = d.z + d.dz * t;
    if (online()) bcast({ t: 'bo3x', k: 'tr', id: d.id, g: d.g, w: nid(spy), p: [r1(bx), r1(d.y), r1(bz)] });
    trapFx(d.g, new V(bx, d.y, bz), spy);
    if (d.g === 'mine') blast(new V(bx, d.y + H_LASER, bz), d.own);
    if (spy) for (const m of entities) if (alive(m) && !m.isPlayer && !m.isRemote && m.team === MERC && R.sendBot) R.sendBot(m, spy.pos, 0.6, true);
  }
  function removeDev(d) { const i = M.dev.indexOf(d); if (i >= 0) M.dev.splice(i, 1); devVis(d, true); lastHost = 0; if (isCl()) (M.gone || (M.gone = new Map())).set(d.id, MATCH.time + 3); }
  function destroy(d, why) {
    if (!M.dev.includes(d)) return;
    removeDev(d); lg('destroy ' + d.g + ' ' + why);
    if (online()) bcast({ t: 'bo3x', k: 'rm', id: d.id, g: d.g, why, p: [r1(d.x), r1(d.y), r1(d.z)] });
    rmFx(d.g, new V(d.x, d.y, d.z), why);
  }
  // the blast hurts the entities this machine owns (its player, and the host's bots); each machine runs it for its own
  function blast(p, own) {
    const G = GM(); if (!(G.mineDmg > 0) || !(G.mineBlastR > 0)) return;
    for (const e of entities) {
      if (!alive(e) || e.team !== SPY) continue;
      if (!(e === PL.ent || (!e.isRemote && auth()))) continue;
      const c = chestPt(e, new V()), dd = c.distanceTo(p);
      if (dd > G.mineBlastR || !lineClear(p, c)) continue;
      const dmg = G.mineDmg * Math.pow(1 - dd / G.mineBlastR, 0.8) + 8;
      try { applyDamage(e, dmg, own && alive(own) ? own : null, 'Laser mine', false, c.clone().sub(p).normalize()); } catch (err) { e.health -= dmg; }
    }
  }
  const segD = (px, pz, d, skip) => {
    let t = ((px - d.x) * d.dx + (pz - d.z) * d.dz);
    if (t < skip) return 99;
    t = Math.min(d.L, t);
    return hyp(px, pz, d.x + d.dx * t, d.z + d.dz * t);
  };
  // a spy that moved across the line since the last check (a jump of a network update, or a fast frame) also breaks it
  const LASTP = new Map();
  function crossed(s, d, skip) {
    const o = LASTP.get(s); if (!o || hyp(o.x, o.z, s.pos.x, s.pos.z) > 6) return false;
    const side = (x, z) => (x - d.x) * d.dz - (z - d.z) * d.dx;
    const a = side(o.x, o.z), b = side(s.pos.x, s.pos.z);
    if (a === 0 || (a > 0) === (b > 0)) return false;
    const k = a / (a - b), x = o.x + (s.pos.x - o.x) * k, z = o.z + (s.pos.z - o.z) * k;
    const t = (x - d.x) * d.dx + (z - d.z) * d.dz;
    return t >= skip && t <= d.L;
  }
  function trapTick() {
    for (const d of M.dev.slice()) {
      if (MATCH.time - d.at < 0.8) continue; // arming
      const h = d.y + devHeight(d);
      for (const s of entities) {
        if (!alive(s) || s.team !== SPY) continue;
        if (d.g === 'trip' ? (s.pos.y > h + 0.35 || s.pos.y < h - 0.8) : (s.pos.y > h || s.pos.y + 1.85 < h)) continue;
        if (segD(s.pos.x, s.pos.z, d, 0.4) < 0.3 || crossed(s, d, 0.4)) { trigger(d, s); break; }
      }
    }
    LASTP.clear();
    for (const s of entities) if (alive(s) && s.team === SPY) LASTP.set(s, { x: s.pos.x, z: s.pos.z });
  }

  /* ---------- flares ---------- */
  function flareAuth(owner, ox, oy, oz, tx, ty, tz) {
    const c = charges(owner); if (!(c.flare > 0)) return 'NO FLARES LEFT';
    c.flare--;
    const G = GM(), d = hyp(ox, oz, tx, tz);
    if (d > G.flareRange) { const k = G.flareRange / d; tx = ox + (tx - ox) * k; tz = oz + (tz - oz) * k; ty = oy + (ty - oy) * k; }
    const y = gy(tx, tz, Math.max(ty, oy - 6) + 0.6);
    M.nid++;
    const f = { id: 'f' + M.nid + Math.floor(Math.random() * 99), ox, oy, oz, x: tx, y, z: tz, t0: MATCH.time, own: owner };
    M.flares.push(f); lastHost = 0;
    lg('flare ' + owner.name + ' ' + Math.round(d) + ' m');
    sfxThrow(new V(ox, oy, oz));
    return f;
  }
  const FLY = 0.8;
  const flareLit = (f) => MATCH.time >= f.t0 + FLY && MATCH.time < f.t0 + FLY + GM().flareT;
  function flarePos(f, out) {
    const u = Math.min(1, (MATCH.time - f.t0) / FLY);
    return out.set(lerp(f.ox, f.x, u), lerp(f.oy, f.y + 0.12, u) + Math.sin(u * Math.PI) * Math.min(6, 1 + hyp(f.ox, f.oz, f.x, f.z) * 0.25), lerp(f.oz, f.z, u));
  }
  // pass 22 hook in the cloak (09zt): a spy inside a burning flare's light is lit
  const _lc = new V(), _lp = new V();
  // chest point from the position (a bot skeleton is only posed when it is drawn)
  function chestPt(e, out) { const k = 1 - (e.crouchAmt || 0) * 0.33; return out.set(e.pos.x, e.pos.y + 1.15 * k, e.pos.z); }
  R.extraLight = function (e) {
    if (!M.flares.length) return false;
    const r = GM().flareR * 0.8;
    for (const f of M.flares) {
      if (!flareLit(f)) continue;
      if (hyp(e.pos.x, e.pos.z, f.x, f.z) > r || Math.abs(e.pos.y - f.y) > 5) continue;
      if (lineClear(_lp.set(f.x, f.y + 0.5, f.z), chestPt(e, _lc))) return true;
    }
    return false;
  };
  // the fixed light pool: one flashLights entry held per burning flare (no light is ever added)
  function flareLights() {
    const n = (typeof RQ !== 'undefined' && RQ.q && RQ.q.lights) || 0, G = GM();
    const lit = M.flares.filter(flareLit).slice(0, Math.max(0, Math.min(2, n - 1)));
    for (const f of lit) {
      let L = f.L && f.L.t > 0 && f.L._boFlare === f ? f.L : null;
      if (!L) { for (let i = 0; i < n; i++) if (flashLights[i].t <= 0) { L = flashLights[i]; break; } }
      if (!L) continue;
      f.L = L; L._boFlare = f;
      const left = f.t0 + FLY + G.flareT - MATCH.time, fade = Math.min(1, left / 1.5);
      const flick = 0.82 + 0.18 * Math.sin(performance.now() / 47 + f.x) * Math.sin(performance.now() / 113);
      L.light.position.set(f.x, f.y + 0.45, f.z); L.light.distance = G.flareR; L.light.color.setHex(0xff5a3c);
      L.peak = G.flareI * fade * flick; L.dur = 1; L.t = 1;
      try { FLASH_HOLD.t = 2; } catch (e) {}
    }
  }

  /* ---------- scanner ---------- */
  const SPD = new Map(); // entity -> {x, z, v, still}
  function speedTick(dt) {
    for (const e of entities) {
      if (e.off || e.team !== SPY) continue;
      let s = SPD.get(e); if (!s) { s = { x: e.pos.x, z: e.pos.z, v: 0, still: 0 }; SPD.set(e, s); }
      const v = dt > 0 ? hyp(e.pos.x, e.pos.z, s.x, s.z) / dt : 0;
      s.v = s.v + (Math.min(12, v) - s.v) * Math.min(1, dt * 6); s.x = e.pos.x; s.z = e.pos.z;
      s.still = s.v < 0.25 && !e.boLit && e.alive ? s.still + dt : 0;
    }
  }
  function scanFrom(src, range, fuzz) {
    const G = GM(), out = [];
    for (const e of entities) {
      if (!alive(e) || e.team !== SPY) continue;
      const d = hyp(e.pos.x, e.pos.z, src.x, src.z); if (d > range || Math.abs(e.pos.y - src.y) > 8) continue;
      const s = SPD.get(e) || { v: 0, still: 0 };
      const fz = R.scanFuzz ? R.scanFuzz(e.pos.x, e.pos.z) : 0; // pass 23: a blacked-out zone blurs the scanner
      if (s.v > G.scanMinV) {
        const ch = (e.crouch ? G.scanCrouch : 1) * (fz ? 0.6 : 1);
        if (Math.random() < ch) out.push({ e, faint: !!fz, j: fz ? 3.5 : 0.6 + (fuzz || 0) });
      } else if (s.still > G.scanStillT && Math.random() < 0.5) out.push({ e, faint: true, j: 2.5 + (fz ? 2 : 0) });
    }
    return out;
  }
  function blipAdd(b) {
    const G = GM(), a = Math.random() * Math.PI * 2, r = Math.random() * b.j;
    M.blips.push({ x: b.e.pos.x + Math.cos(a) * r, y: b.e.pos.y, z: b.e.pos.z + Math.sin(a) * r, faint: b.faint, until: MATCH.time + G.scanBlip * (b.faint ? 0.7 : 1), n: ++M.nid });
    if (M.blips.length > 16) M.blips.shift();
  }
  let pulseT = 0, scanHeld = false;
  function scanTick(dt) {
    const G = GM(), me = PL.ent;
    const ok = alive(me) && me.team === MERC && !(window.BOEDITOR && BOEDITOR.isOpen()) && !(typeof CHAT !== 'undefined' && CHAT.open);
    const k = !!KEYS.BoScan;
    let want;
    if (G.scanToggle >= 1) { if (k && !scanHeld) M.scanOn = !M.scanOn; want = M.scanOn; } else want = k;
    scanHeld = k;
    if (!ok) want = false;
    if (M.bat <= 0.001) M.empty = true;
    if (M.empty && M.bat > 0.25) M.empty = false;
    const on = want && !M.empty;
    if (on) M.bat = Math.max(0, M.bat - dt / Math.max(0.5, G.scanTime)); else M.bat = Math.min(1, M.bat + dt / Math.max(0.5, G.scanRecharge));
    if (G.scanToggle >= 1 && M.empty) M.scanOn = false;
    if (on !== M.active) {
      M.active = on;
      if (isCl()) toHost({ t: 'bo3q', k: 'sc', on: on ? 1 : 0 });
      else if (me) { if (on) M.scanning.add(me); else M.scanning.delete(me); lastHost = 0; }
      if (on) pulseT = 0.15;
    }
    if (on) {
      pulseT -= dt;
      if (pulseT <= 0) {
        pulseT = G.scanPulse; M.pulseAt = performance.now();
        sfxScan(me.pos, true);
        for (const b of scanFrom(me.pos, G.scanR, 0)) blipAdd(b);
      }
    }
    M.blips = M.blips.filter((b) => b.until > MATCH.time);
  }
  // others' scanners: a spy hears the ping of a scanning merc nearby
  const otherPulse = new Map();
  function scanHearTick(dt) {
    const G = GM();
    for (const m of M.scanning) {
      if (!alive(m) || m === PL.ent) continue;
      const t = (otherPulse.get(m) || 0) - dt;
      if (t <= 0) { otherPulse.set(m, G.scanPulse); sfxScan(m.pos, false); } else otherPulse.set(m, t);
    }
  }

  /* ---------- merc bots: scan, place traps, flare ---------- */
  function mercBotTick(dt) {
    const G = GM();
    for (const m of entities) {
      if (!alive(m) || m.isPlayer || m.isRemote || m.team !== MERC) continue;
      // scanner: a pulse every 2.5 s when no spy is in sight
      m.boScanT = (m.boScanT || rand(0, 2.5)) - dt;
      if (m.boScanT <= 0) {
        m.boScanT = 2.5;
        if (!(m.target && m.visible)) {
          const hits = scanFrom(m.pos, G.scanR * 0.8, 1);
          if (hits.length) { M.scanning.add(m); m.boScanUntil = MATCH.time + 1.5; const h = hits[0]; if (R.sendBot) R.sendBot(m, h.e.pos, h.j * 1.5, false); lg('bot scan ' + m.name + ' > ' + h.e.name); }
        }
      }
      if (m.boScanUntil && MATCH.time > m.boScanUntil) { M.scanning.delete(m); m.boScanUntil = 0; }
      // traps near an open terminal
      if (G.botTraps >= 1 && !(m.target && m.visible) && MATCH.time - (MATCH.startAt || 0) > 6) {
        m.boTrapT = (m.boTrapT == null ? rand(2, 10) : m.boTrapT) - dt;
        const c = charges(m);
        if (m.boTrapT <= 0 && (c.trip > 0 || c.mine > 0)) {
          const near = R.terminals.find((t) => !t.hacked && hyp(t.x, t.z, m.pos.x, m.pos.z) < 9);
          // not at a terminal: try again shortly; after a while without one, walk to a terminal no trap covers yet
          m.boTrapT = near ? rand(8, 16) : 0.6;
          if (!near) {
            m.boTrapIdle = (m.boTrapIdle || 0) + 0.6;
            if (m.boTrapIdle > 20) {
              m.boTrapIdle = 0;
              const open = R.terminals.filter((t) => !t.hacked && !M.dev.some((d) => hyp(d.x, d.z, t.x, t.z) < 7));
              let tg = null, td = Infinity; for (const t of open) { const dd = hyp(t.x, t.z, m.pos.x, m.pos.z); if (dd < td) { td = dd; tg = t; } }
              if (tg) { try { setPath(m, new V(tg.x + rand(-2, 2), m.pos.y, tg.z + rand(-2, 2))); m.forceDecide = true; lg('bot to trap ' + m.name + ' > ' + tg.id); } catch (e) {} }
            }
          } else m.boTrapIdle = 0;
          if (near) {
            const g = c.mine > 0 && Math.random() < 0.5 ? 'mine' : c.trip > 0 ? 'trip' : 'mine';
            // the device goes where the bot stands, or a few steps away when it stands at the terminal itself
            let ox = m.pos.x, oz = m.pos.z, oy = m.pos.y;
            if (tooClose(ox, oz)) {
              ox = null;
              const eye = entEye(m, new V());
              for (let i = 0; i < 12 && ox == null; i++) {
                const a = i * Math.PI / 6 + rand(-0.15, 0.15), r = rand(2.6, 4), x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r, y = gy(x, z, m.pos.y);
                if (Math.abs(y - m.pos.y) > 0.4 || tooClose(x, z) || !lineClear(eye, new V(x, y + 0.5, z))) continue;
                ox = x; oz = z; oy = y;
              }
            }
            let best = null;
            if (ox != null) for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + rand(-0.2, 0.2), sp = span(ox, oy, oz, Math.cos(a), Math.sin(a), g === 'trip' ? H_TRIP : H_LASER, g === 'trip' ? G.tripLen : G.mineLen); if (sp.L > 2.2 && (!best || sp.L > best.L)) best = Object.assign(sp, { a }); }
            if (best) placeAuth(m, g, ox, oy, oz, best.dx, best.dz);
          }
        }
      }
    }
  }
  R.onBotAlert = function (m, g) {
    const G = GM(); if (!auth() || !alive(m)) return;
    if ((m.boFlareAt || -99) > MATCH.time) return;
    const d = hyp(m.pos.x, m.pos.z, g.x, g.z);
    if (d < 7 || d > G.flareRange || Math.random() > G.botFlare) { m.boFlareAt = MATCH.time + 3; return; }
    const c = charges(m); if (!(c.flare > 0)) return;
    m.boFlareAt = MATCH.time + 20;
    const e = entEye(m, new V());
    const r = flareAuth(m, e.x, e.y, e.z, g.x, g.y != null ? g.y : m.pos.y, g.z);
    if (typeof r === 'object') lg('bot flare ' + m.name);
  };

  /* ---------- spy bots: disarm the traps they see ---------- */
  const _ba = R.botAbil;
  R.botAbil = function (b, S, threat, td, dt) {
    try {
      const hacking = S.term && S.term.by === b && S.term.prog > 0.45 && !S.term.hacked;
      if (!threat && S.mode !== 'evade' && !hacking && M.dev.length) {
        let best = null, bd = Infinity;
        for (const d of M.dev) {
          const dd = hyp(d.x, d.z, b.pos.x, b.pos.z), see = d.g === 'mine' ? 10 : 3.5;
          if (dd > see || Math.abs(d.y - b.pos.y) > 2 || dd > bd) continue;
          if (d.g === 'mine' && !lineClear(entEye(b, new V()), devPt(d))) continue;
          best = d; bd = dd;
        }
        if (best) {
          S.mode = 'disarm'; S.dev = best;
          let ax = best.x - best.dx * 0.75, az = best.z - best.dz * 0.75;
          if (Math.abs(gy(ax, az, best.y) - best.y) > 0.3) { ax = best.x - best.dz * 0.75; az = best.z + best.dx * 0.75; }
          S.goal = new V(ax, best.y, az);
        } else if (S.mode === 'disarm') { S.mode = 'hack'; S.dev = null; }
      }
    } catch (e) { console.warn('BO spy bot disarm', e); }
    return _ba ? _ba.apply(this, arguments) : undefined;
  };
  function spyBotDisarmTick(dt) {
    const G = GM();
    for (const b of entities) {
      if (!alive(b) || b.isPlayer || b.isRemote || b.team !== SPY) continue;
      const S = b.bo; if (!S || S.mode !== 'disarm' || !S.dev) { if (b.boDis) b.boDis = 0; continue; }
      const d = S.dev; if (!M.dev.includes(d)) { S.mode = 'hack'; S.dev = null; b.boDis = 0; continue; }
      if (hyp(b.pos.x, b.pos.z, d.x, d.z) > 1.4) { b.boDis = 0; continue; }
      b.boDis = (b.boDis || 0) + dt / Math.max(0.3, G.disarmT);
      if (b.boDis >= 1) { b.boDis = 0; S.mode = 'hack'; S.dev = null; S.decideT = 0; destroy(d, 'disarmed'); }
    }
  }

  /* ---------- the player: merc keys, spy disarm ---------- */
  const prev = {};
  const press = (c) => { const n = !!KEYS[c], w = !!prev[c]; return n && !w; };
  function mercInput() {
    const me = PL.ent; if (!alive(me) || me.team !== MERC) return;
    if (window.BOEDITOR && BOEDITOR.isOpen()) return;
    if (typeof CHAT !== 'undefined' && CHAT.open) return;
    const yaw = PL.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const [c, g] of [['BoTrip', 'trip'], ['BoMine', 'mine']]) {
      if (!press(c)) continue;
      if (!me.onGround && Math.abs(me.pos.y - gy(me.pos.x, me.pos.z, me.pos.y)) > 0.3) { placeMsg('STAND ON THE GROUND TO PLACE IT', g); continue; }
      if (isCl()) { toHost({ t: 'bo3q', k: 'pl', g, p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)], d: [r2(fx), r2(fz)] }); M.pending = MATCH.time; }
      else { const r = placeAuth(me, g, me.pos.x, me.pos.y, me.pos.z, fx, fz); placeMsg(r, g); }
    }
    if (press('BoFlare')) {
      const e = camera.position.clone(), f = camFwd(new V()), G = GM();
      let t = G.flareRange;
      try { const w = rayWorld(e.x, e.y, e.z, f.x, f.y, f.z, G.flareRange, 1); if (w) t = Math.max(1, w.t - 0.4); } catch (err) {}
      const tx = e.x + f.x * t, ty = e.y + f.y * t, tz = e.z + f.z * t;
      if (isCl()) toHost({ t: 'bo3q', k: 'fl', o: [r2(e.x), r2(e.y), r2(e.z)], p: [r2(tx), r2(ty), r2(tz)] });
      else { const r = flareAuth(me, e.x, e.y, e.z, tx, ty, tz); if (typeof r === 'string') hudMsg(r, 'info', 1.5); }
    }
  }
  function placeMsg(r, g) {
    if (typeof r === 'string') { lg('refused ' + g + ': ' + r); try { hudMsg(r, 'info', 1.6); } catch (e) {} return; }
    try { hudMsg((g === 'trip' ? 'TRIPWIRE' : 'LASER MINE') + ' SET · ' + r.L.toFixed(1) + ' m', 'xp', 1.4); } catch (e) {}
  }
  function nearDev(e, r) { let best = null, bd = r; for (const d of M.dev) { const dd = hyp(e.pos.x, e.pos.z, d.x, d.z); if (dd < bd && Math.abs(e.pos.y - d.y) < 1.5) { bd = dd; best = d; } } return best; }
  function spyDisarm(dt) {
    const me = PL.ent, G = GM();
    M.disPrompt = '';
    if (!alive(me) || me.team !== SPY) { M.dis = null; return; }
    const d = nearDev(me, 1.4);
    if (!d || (R.terminalNear && R.terminalNear(me)) || (R.extractOpen && R.extractOpen() && R.extractPt && hyp(me.pos.x, me.pos.z, R.extractPt().x, R.extractPt().z) < R.extractPt().r)) { M.dis = null; return; }
    const name = d.g === 'trip' ? 'TRIPWIRE' : 'LASER MINE';
    if (!KEYS.KeyE) { M.dis = null; M.disPrompt = 'HOLD ' + K('hack') + ': DISARM ' + name + ' · OR SHOOT IT'; return; }
    if (!M.dis || M.dis.d !== d) M.dis = { d, p: 0 };
    if (Math.hypot(me.vel.x, me.vel.z) > Math.max(0.6, G.hackMoveTol || 0.6)) { M.disPrompt = 'DISARM PAUSED · MOVING'; return; }
    M.dis.p = Math.min(1, M.dis.p + dt / Math.max(0.3, G.disarmT));
    M.disPrompt = 'DISARMING ' + name + '… ' + Math.floor(M.dis.p * 100) + '%';
    if (M.dis.p >= 1) {
      M.dis = null;
      if (isCl()) { toHost({ t: 'bo3q', k: 'dis', id: d.id }); removeDev(d); }
      else destroy(d, 'disarmed');
      try { hudMsg(name + ' DISARMED', 'xp', 1.5); } catch (e) {}
    }
  }
  const _sp = R.spyPrompt;
  R.spyPrompt = function (e) { const a = _sp ? _sp(e) : ''; if (a) return a; return M.disPrompt || ''; };

  /* ---------- shots: a spy shoots a trap's device ---------- */
  const _fireRay = fireRay;
  fireRay = function (shooter, origin, dir) {
    try {
      if (playing() && shooter && shooter.team === SPY && M.dev.length && (shooter === PL.ent || (!shooter.isRemote && auth()))) {
        const w = rayWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 120, 1), wt = w ? w.t : 120;
        let hit = null, ht = wt + 0.2;
        for (const d of M.dev) {
          const p = devPt(d), px = p.x - origin.x, py = p.y - origin.y, pz = p.z - origin.z, t = px * dir.x + py * dir.y + pz * dir.z;
          if (t <= 0 || t > ht) continue;
          const qx = px - dir.x * t, qy = py - dir.y * t, qz = pz - dir.z * t;
          if (qx * qx + qy * qy + qz * qz < 0.28 * 0.28) { hit = d; ht = t; }
        }
        if (hit) { if (isCl()) { toHost({ t: 'bo3q', k: 'sh', id: hit.id }); removeDev(hit); rmFx(hit.g, new V(hit.x, hit.y, hit.z), 'shot'); } else destroy(hit, 'shot'); }
      }
    } catch (e) { console.warn('BO trap shot', e); }
    return _fireRay.apply(this, arguments);
  };

  /* ---------- net ---------- */
  let lastHost = 0, lastSig = '';
  function stateOut() {
    const now = performance.now();
    const mercs = entities.filter((e) => !e.off && e.team === MERC);
    const m = {
      t: 'bo3s',
      d: M.dev.slice(0, 30).map((d) => [d.id, d.g === 'trip' ? 0 : 1, r2(d.x), r2(d.y), r2(d.z), r2(d.dx), r2(d.dz), r1(d.L), nid(d.own)]),
      f: M.flares.slice(-6).map((f) => [f.id, r1(f.ox), r1(f.oy), r1(f.oz), r1(f.x), r1(f.y), r1(f.z), r1(MATCH.time - f.t0)]),
      s: [...M.scanning].filter(alive).map(nid).filter(Boolean).slice(0, 12),
      n: mercs.map((e) => { const c = charges(e); return [nid(e), c.trip, c.mine, c.flare]; }).filter((x) => x[0]).slice(0, 12),
    };
    const sig = JSON.stringify([m.d.map((x) => x[0]), m.f.map((x) => x[0]), m.s, m.n]);
    if (sig !== lastSig || now - lastHost > 1500) { lastSig = sig; lastHost = now; bcast(m); }
  }
  function stateIn(m) {
    cnt(M.got, 'bo3s');
    if (!playing()) return;
    if (Array.isArray(m.d)) {
      const keep = new Set();
      for (const x of m.d.slice(0, 30)) {
        if (!Array.isArray(x)) continue;
        const id = String(x[0]).slice(0, 12); keep.add(id);
        if (M.dev.some((d) => d.id === id)) continue;
        if (M.gone && M.gone.has(id)) continue; // I disarmed / shot it, the host has not caught up yet
        const dx = num(x[5]), dz = num(x[6]), l = Math.hypot(dx, dz) || 1;
        M.dev.push({ id, g: x[1] ? 'mine' : 'trip', x: num(x[2]), y: num(x[3]), z: num(x[4]), dx: dx / l, dz: dz / l, L: Math.max(0, Math.min(30, num(x[7]))), own: ent(x[8]), at: MATCH.time - 1 });
        const d = M.dev[M.dev.length - 1]; sfxPlace(devPt(d));
      }
      for (const d of M.dev.slice()) if (!keep.has(d.id)) removeDev(d);
    }
    if (Array.isArray(m.f)) {
      const keep = new Set();
      for (const x of m.f.slice(0, 6)) {
        if (!Array.isArray(x)) continue;
        const id = String(x[0]).slice(0, 12); keep.add(id);
        if (M.flares.some((f) => f.id === id)) continue;
        M.flares.push({ id, ox: num(x[1]), oy: num(x[2]), oz: num(x[3]), x: num(x[4]), y: num(x[5]), z: num(x[6]), t0: MATCH.time - Math.max(0, Math.min(60, num(x[7]))) });
        if (num(x[7]) < 0.5) sfxThrow(new V(num(x[1]), num(x[2]), num(x[3])));
      }
      M.flares = M.flares.filter((f) => keep.has(f.id) || MATCH.time - f.t0 < 0.6);
    }
    if (Array.isArray(m.s)) { M.scanning = new Set(m.s.slice(0, 12).map(ent).filter(Boolean)); }
    if (Array.isArray(m.n)) for (const x of m.n.slice(0, 12)) { const e = Array.isArray(x) && ent(x[0]); if (e) e.boMt = { round: R.roundId, trip: x[1] | 0, mine: x[2] | 0, flare: x[3] | 0 }; }
  }
  function eventIn(m) {
    cnt(M.got, 'bo3x');
    if (!playing()) return;
    const d = M.dev.find((q) => q.id === String(m.id));
    if (d) removeDev(d);
    const p = Array.isArray(m.p) ? new V(num(m.p[0]), num(m.p[1]), num(m.p[2])) : null;
    if (m.k === 'tr') {
      const spy = ent(m.w);
      if (p) trapFx(m.g === 'mine' ? 'mine' : 'trip', p, spy);
      if (m.g === 'mine' && p) blast(new V(p.x, p.y + H_LASER, p.z), d && d.own);
    } else if (m.k === 'rm' && p) rmFx(m.g === 'mine' ? 'mine' : 'trip', p, String(m.why || ''));
    else if (m.k === 'no') { try { hudMsg(String(m.s || '').slice(0, 60), 'info', 1.6); } catch (e) {} }
    else if (m.k === 'ok') { try { hudMsg(String(m.s || '').slice(0, 60), 'xp', 1.4); } catch (e) {} }
  }
  function hostIn(c, m) {
    cnt(M.got, 'bo3q');
    if (!playing()) return;
    const who = NET.remotes.get(c.peer) || null; if (!alive(who)) return;
    const pl = NET.players.get(c.peer);
    const reply = (k, s) => { try { netSendTo(pl, { t: 'bo3x', k, s }); } catch (e) {} };
    if (who.team === MERC) {
      if (m.k === 'pl' && Array.isArray(m.p) && Array.isArray(m.d)) {
        const x = num(m.p[0]), y = num(m.p[1]), z = num(m.p[2]);
        if (hyp(x, z, who.pos.x, who.pos.z) > 3) return;
        const g = m.g === 'trip' ? 'trip' : 'mine', r = placeAuth(who, g, x, y, z, num(m.d[0]), num(m.d[1], 1));
        if (typeof r === 'string') reply('no', r); else reply('ok', (g === 'trip' ? 'TRIPWIRE' : 'LASER MINE') + ' SET · ' + r.L.toFixed(1) + ' m');
      } else if (m.k === 'fl' && Array.isArray(m.o) && Array.isArray(m.p)) {
        const o = m.o.map((v) => num(v)), p = m.p.map((v) => num(v));
        if (hyp(o[0], o[2], who.pos.x, who.pos.z) > 4) return;
        const r = flareAuth(who, o[0], o[1], o[2], p[0], p[1], p[2]); if (typeof r === 'string') reply('no', r);
      } else if (m.k === 'sc') { if (m.on) M.scanning.add(who); else M.scanning.delete(who); lastHost = 0; }
    } else if (who.team === SPY) {
      const d = M.dev.find((q) => q.id === String(m.id)); if (!d) return;
      if (m.k === 'dis' && hyp(who.pos.x, who.pos.z, d.x, d.z) < 2.5) destroy(d, 'disarmed');
      else if (m.k === 'sh' && hyp(who.pos.x, who.pos.z, d.x, d.z) < 130) destroy(d, 'shot');
    }
  }
  if (typeof netHostMsg === 'function') {
    const _hm = netHostMsg;
    netHostMsg = function (c, m) {
      if (m && m.t === 'bo3q' && NET.role === 'host') { const pl = NET.players.get(c.peer); if (pl && pl.conn === c) { try { hostIn(c, m); } catch (e) { console.warn('BO merc tools in', e); } } return; }
      return _hm.apply(this, arguments);
    };
  }
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) {
      if (m && m.t === 'bo3s') { try { stateIn(m); } catch (e) { console.warn('BO bo3s', e); } return; }
      if (m && m.t === 'bo3x') { try { eventIn(m); } catch (e) {} return; }
      return _cm.apply(this, arguments);
    };
  }

  /* ---------- sound ---------- */
  const auOk = () => typeof AU !== 'undefined' && AU.ready && AU.ctx;
  function sfxScan(p, mine) {
    if (!auOk()) return;
    try {
      if (mine) { const o = uiOut(0.32), at = AU.ctx.currentTime + 0.005; tn(o, at, 0.22, 1650, 1200, 'sine', 0.16); tn(o, at + 0.02, 0.35, 825, 600, 'sine', 0.06); }
      else { const o = auOut(new V(p.x, p.y + 1.2, p.z), 0.2, 0.9, 1.2, 4), at = AU.ctx.currentTime + 0.005; tn(o, at, 0.22, 1650, 1200, 'sine', 0.2); }
    } catch (e) {}
  }
  function sfxPlace(p) { if (!auOk()) return; try { const o = auOut(p, 0.1, 0.7, 1.4, 3), at = AU.ctx.currentTime + 0.005; tn(o, at, 0.05, 2400, 2400, 'square', 0.1); tn(o, at + 0.08, 0.05, 3200, 3200, 'square', 0.1); nz(o, at, 0.08, 'highpass', 3000, 3000, 1, 0.08); } catch (e) {} }
  function sfxThrow(p) { if (!auOk()) return; try { const o = auOut(p, 0.1, 0.8, 1.2, 4), at = AU.ctx.currentTime + 0.005; nz(o, at, 0.25, 'bandpass', 900, 2400, 2, 0.2); nz(o, at + 0.8, 0.6, 'highpass', 4000, 2500, 1, 0.25); } catch (e) {} }
  function sfxTrap(p) {
    if (!auOk()) return;
    try {
      const L = camera.position, d = Math.hypot(p.x - L.x, p.z - L.z), k = Math.max(0.3, 1 - d / 140);
      const o = auOut(p, 0.5, k, 0.0005, 30), at = AU.ctx.currentTime + 0.01;
      for (let i = 0; i < 6; i++) { tn(o, at + i * 0.18, 0.12, 1900, 1900, 'square', 0.2); tn(o, at + i * 0.18 + 0.09, 0.08, 1400, 1400, 'square', 0.16); }
    } catch (e) {}
  }
  function sfxBlast(p) { try { explosionFx(p); sfxExplosion(p); } catch (e) {} }

  /* ---------- effects ---------- */
  function trapFx(g, p, spy) {
    sfxTrap(p);
    if (g === 'mine') sfxBlast(new V(p.x, p.y + 0.6, p.z));
    else { try { flashLight(new V(p.x, p.y + 0.6, p.z), 6, 10, 0.4, 0xff3020); } catch (e) {} }
    const me = PL.ent, name = g === 'trip' ? 'TRIPWIRE' : 'LASER MINE';
    try {
      if (me && me.team === MERC) hudMsg(name + ' TRIPPED · SPY EXPOSED', 'enemy', 3);
      else if (me && spy === me) hudMsg('YOU TRIPPED A ' + name + ' · EXPOSED', 'enemy', 2.5);
      else if (me) hudMsg(name + ' TRIPPED', 'enemy', 2);
    } catch (e) {}
  }
  function rmFx(g, p, why) {
    if (why === 'shot') { try { FX.spark && FX.spark.spawn && FX.spark.spawn(p.x, p.y + 0.5, p.z); } catch (e) {} }
    if (auOk()) { try { const o = auOut(new V(p.x, p.y + 0.5, p.z), 0.1, 0.6, 1.4, 3), at = AU.ctx.currentTime; tn(o, at, 0.18, 1800, 300, 'sawtooth', 0.12); } catch (e) {} }
    const me = PL.ent;
    if (me && me.team === MERC && hyp(me.pos.x, me.pos.z, p.x, p.z) < 40) { try { hudMsg((g === 'trip' ? 'TRIPWIRE' : 'LASER MINE') + ' ' + (why === 'shot' ? 'SHOT OUT' : 'DISARMED'), 'info', 1.6); } catch (e) {} }
  }

  /* ---------- visuals: traps and flares ---------- */
  const VIS = new Map();
  let glowTex = null;
  function glow() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
  }
  const MATS = {};
  function mats() {
    if (MATS.body) return MATS;
    MATS.body = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.6, metalness: 0.4 });
    MATS.wire = new THREE.LineBasicMaterial({ color: 0x9aa3ab, transparent: true, opacity: 0.55 });
    MATS.beam = new THREE.MeshBasicMaterial({ color: 0xff2418, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    MATS.led = new THREE.SpriteMaterial({ map: glow(), color: 0xff2a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    MATS.ledG = new THREE.SpriteMaterial({ map: glow(), color: 0x3aff7a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    MATS.flare = new THREE.SpriteMaterial({ map: glow(), color: 0xff5a3c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    MATS.stick = new THREE.MeshBasicMaterial({ color: 0xff7050 });
    // a glow disc on the ground under a burning flare: the area reads as lit even on quality profiles with no light pool (low, ultra-light)
    MATS.pool = new THREE.MeshBasicMaterial({ map: glow(), color: 0xff5a3c, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
    return MATS;
  }
  function devBuild(d) {
    const m = mats(), g = new THREE.Group(); g.name = 'boTrap';
    const h = devHeight(d), ex = d.dx * d.L, ez = d.dz * d.L;
    if (d.g === 'trip') {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), m.body); post.position.set(d.x, d.y + 0.15, d.z);
      const post2 = post.clone(); post2.position.set(d.x + ex, d.y + 0.15, d.z + ez);
      const geo = new THREE.BufferGeometry().setFromPoints([new V(d.x, d.y + h, d.z), new V(d.x + ex, d.y + h, d.z + ez)]);
      const line = new THREE.Line(geo, m.wire);
      const led = new THREE.Sprite(m.ledG); led.scale.set(0.12, 0.12, 0.12); led.position.set(d.x, d.y + 0.32, d.z);
      g.add(post, post2, line, led); g.userData.led = led;
    } else {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 6), m.body); post.position.set(d.x, d.y + h / 2, d.z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.14), m.body); box.position.set(d.x, d.y + h, d.z); box.rotation.y = Math.atan2(d.dx, d.dz);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, d.L, 5, 1, true), m.beam);
      beam.position.set(d.x + ex / 2, d.y + h, d.z + ez / 2); beam.quaternion.setFromUnitVectors(new V(0, 1, 0), new V(d.dx, 0, d.dz));
      const dot = new THREE.Sprite(m.led); dot.scale.set(0.25, 0.25, 0.25); dot.position.set(d.x + ex, d.y + h, d.z + ez);
      const led = new THREE.Sprite(m.led); led.scale.set(0.16, 0.16, 0.16); led.position.set(d.x, d.y + h + 0.08, d.z);
      g.add(post, box, beam, dot, led); g.userData.led = led; g.userData.beam = beam;
    }
    scene.add(g); VIS.set(d, g);
  }
  function devVis(d, rm) {
    const g = VIS.get(d); if (!g) return;
    if (rm) { scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); VIS.delete(d); }
  }
  const FV = new Map();
  function visTick() {
    for (const d of M.dev) if (!VIS.has(d)) devBuild(d);
    for (const [d] of VIS) if (!M.dev.includes(d)) devVis(d, true);
    const now = performance.now();
    for (const [d, g] of VIS) {
      const led = g.userData.led; if (led) led.visible = Math.floor(now / 600 + d.x) % 2 === 0;
      if (g.userData.beam) { const off = R.trapDead && R.trapDead(d); g.userData.beam.visible = !off; } // pass 23: a blacked-out zone kills the beam
    }
    // flares
    const G = GM(), m = mats();
    for (const f of M.flares) {
      let v = FV.get(f);
      if (!v) {
        v = new THREE.Group(); const s = new THREE.Sprite(m.flare); s.scale.set(1.4, 1.4, 1.4);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 6), m.stick); st.rotation.z = Math.PI / 2;
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.pool.clone()); pool.rotation.x = -Math.PI / 2; pool.renderOrder = 2;
        v.add(s, st); v.userData.s = s; v.userData.pool = pool; scene.add(v, pool); FV.set(f, v);
      }
      flarePos(f, v.position);
      const lit = flareLit(f), fly = MATCH.time < f.t0 + FLY;
      const sc = fly ? 0.6 : lit ? 1.6 + 0.4 * Math.sin(now / 60 + f.x) : 0;
      v.userData.s.scale.set(sc, sc, sc); v.visible = fly || lit;
      if (!fly) v.position.y = f.y + 0.1;
      const pool = v.userData.pool;
      if (pool) {
        pool.visible = lit;
        if (lit) {
          const left = f.t0 + FLY + G.flareT - MATCH.time, k = Math.min(1, left / 1.5) * (0.85 + 0.15 * Math.sin(now / 53 + f.z));
          const d = G.flareR * 1.4; pool.scale.set(d, d, 1); pool.position.set(f.x, f.y + 0.06, f.z);
          pool.material.opacity = 0.28 * k;
        }
      }
    }
    M.flares = M.flares.filter((f) => MATCH.time < f.t0 + FLY + G.flareT + 0.5);
    for (const [f, v] of FV) if (!M.flares.includes(f)) { scene.remove(v); if (v.userData.pool) { scene.remove(v.userData.pool); v.userData.pool.geometry.dispose(); v.userData.pool.material.dispose(); } FV.delete(f); }
  }
  function clearAll() {
    for (const d of M.dev.slice()) devVis(d, true);
    for (const [d] of VIS) devVis(d, true);
    for (const [f, v] of FV) { scene.remove(v); if (v.userData.pool) { scene.remove(v.userData.pool); v.userData.pool.geometry.dispose(); v.userData.pool.material.dispose(); } }
    FV.clear(); M.dev = []; M.flares = []; M.blips = []; M.scanning.clear(); M.bat = 1; M.dis = null; M.active = false; M.scanOn = false;
    for (const f of flashLights) if (f._boFlare) { f._boFlare = null; f.t = 0; }
  }

  /* ---------- HUD ---------- */
  let H = null;
  function hudBuild() {
    if (H || !R.hud || !R.hud.el) return H;
    const css = document.createElement('style');
    css.textContent = '#boHud .bo-scan{position:absolute;right:16px;bottom:104px;font-weight:800;font-size:11px;letter-spacing:.14em;padding:5px 10px;background:rgba(10,14,18,.6);border:1px solid rgba(120,220,255,.35);color:#9fe6ff;display:none;min-width:150px}'
      + '#boHud .bo-scan i{display:block;height:3px;margin-top:4px;background:rgba(255,255,255,.12)}#boHud .bo-scan i b{display:block;height:100%;background:#9fe6ff}#boHud .bo-scan.on{border-color:#9fe6ff;box-shadow:0 0 10px rgba(120,220,255,.35)}#boHud .bo-scan.low i b{background:#ff6b5a}'
      + '#boHud .bo-mk.sc{color:#9fe6ff}#boHud .bo-mk.sc.f{color:#9fe6ff;opacity:.55}#boHud .bo-mk.tr{color:#7a8590;font-size:10px}'
      + '#boHud .bo-keys em.z{opacity:.4}';
    document.head.appendChild(css);
    H = { scan: document.createElement('div') }; H.scan.className = 'bo-scan'; R.hud.el.appendChild(H.scan);
    return H;
  }
  function hudTick() {
    const h = hudBuild(); if (!h) return;
    const me = PL.ent, merc = playing() && alive(me) && me.team === MERC;
    if (merc) {
      h.scan.style.display = 'block';
      const t = 'SCANNER ' + (M.active ? 'ON' : M.empty ? 'RECHARGING' : 'READY') + ' · ' + K('scan');
      if (h.scan._t !== t) { h.scan.innerHTML = t + '<i><b></b></i>'; h.scan._t = t; }
      h.scan.className = 'bo-scan' + (M.active ? ' on' : '') + (M.bat < 0.25 ? ' low' : '');
      const b = h.scan.querySelector('i b'); if (b) b.style.width = Math.round(M.bat * 100) + '%';
    } else h.scan.style.display = 'none';
    const keep = new Set();
    if (merc) {
      for (const b of M.blips) { const k = 'sc' + b.n; keep.add(k); R.marker(k, 'sc' + (b.faint ? ' f' : ''), b.faint ? '◦' : '◉', b.faint ? 'FAINT' : 'MOTION', b.x, b.y + 1.0, b.z); }
      for (const d of M.dev) { const dd = hyp(me.pos.x, me.pos.z, d.x, d.z); if (dd > 30) continue; const k = 'tr' + d.id; keep.add(k); R.marker(k, 'tr', d.g === 'trip' ? 'WIRE' : 'MINE', Math.round(dd) + ' m', d.x, d.y + 0.6, d.z); }
    }
    for (const k in R.hud.mk) if ((k.startsWith('sc') || k.startsWith('tr')) && !keep.has(k)) R.hud.mk[k].style.display = 'none';
    // the spy's disarm bar (09zo draws the prompt through R.spyPrompt; the bar is ours)
    try {
      const bar = R.hud.el.querySelector('.bo-bar');
      if (bar && M.dis && M.disPrompt && R.hud.prompt === M.disPrompt) { bar.style.display = 'block'; bar.firstChild.style.width = Math.round(M.dis.p * 100) + '%'; }
    } catch (e) {}
  }
  if (typeof domMinimap === 'function') {
    const _dm = domMinimap;
    domMinimap = function (g, scale) {
      const r = _dm.apply(this, arguments);
      try {
        if (playing()) {
          const me = PL.ent, merc = me && me.team === MERC;
          if (merc) {
            for (const b of M.blips) { g.fillStyle = b.faint ? 'rgba(159,230,255,.45)' : '#9fe6ff'; g.beginPath(); g.arc(b.x * scale, b.z * scale, b.faint ? 5 : 3.5, 0, Math.PI * 2); g.fill(); }
            if (M.active && M.pulseAt) { const u = Math.min(1, (performance.now() - M.pulseAt) / 700); g.strokeStyle = 'rgba(159,230,255,' + (0.6 * (1 - u)).toFixed(2) + ')'; g.lineWidth = 1.5; g.beginPath(); g.arc(me.pos.x * scale, me.pos.z * scale, GM().scanR * scale * u, 0, Math.PI * 2); g.stroke(); }
            g.strokeStyle = 'rgba(160,170,180,.8)'; g.lineWidth = 1.5;
            for (const d of M.dev) { g.beginPath(); g.moveTo(d.x * scale, d.z * scale); g.lineTo((d.x + d.dx * d.L) * scale, (d.z + d.dz * d.L) * scale); g.stroke(); }
          }
          for (const f of M.flares) if (flareLit(f)) { g.fillStyle = 'rgba(255,90,60,.18)'; g.beginPath(); g.arc(f.x * scale, f.z * scale, GM().flareR * 0.8 * scale, 0, Math.PI * 2); g.fill(); }
        }
      } catch (e) {}
      return r;
    };
  }
  // the key bar: merc tools with their charges
  const _kh = R.keysHtml;
  R.keysHtml = function (spy, me) {
    const base = _kh ? _kh(spy, me) : '';
    const kb = (k) => '<b>' + k + '</b>';
    if (spy) return base + '<br>' + kb(K('hack')) + 'hold at a trap: disarm (or shoot it)';
    const c = (me && me.boMt) || { trip: 0, mine: 0, flare: 0 }, n = (v) => '<em' + (v > 0 ? '' : ' class="z"') + '>×' + v + '</em>';
    return base + '<br>' + kb(K('scan')) + 'scanner &nbsp;' + kb(K('trip')) + 'tripwire ' + n(c.trip) + ' &nbsp;' + kb(K('lmine')) + 'laser mine ' + n(c.mine) + ' &nbsp;' + kb(K('flare')) + 'flare ' + n(c.flare);
  };

  /* ---------- round setup ---------- */
  const _os = R.onSetup;
  R.onSetup = function () {
    const r = _os ? _os.apply(this, arguments) : undefined;
    R.roundId = (R.roundId || 0) + 1;
    clearAll();
    for (const e of entities) { e.boMt = null; e.boScanT = null; e.boTrapT = null; e.boFlareAt = 0; e.boDis = 0; }
    if (auth()) for (const e of entities) if (!e.off && e.team === MERC) charges(e);
    lastHost = 0;
    return r;
  };

  /* ---------- per frame ---------- */
  let last = null;
  const _fr = frame;
  frame = function (now) {
    _fr(now);
    try {
      const dt = Math.min(0.05, (last != null ? now - last : 16) / 1000); last = now;
      if (!bo()) { if (M.dev.length || M.flares.length) clearAll(); if (H) H.scan.style.display = 'none'; return; }
      if (MATCH.state === 'playing') {
        speedTick(dt);
        if (!(typeof playHold === 'function' && playHold()) && !R.roundOver) {
          mercInput(); scanTick(dt); spyDisarm(dt);
          if (auth()) { trapTick(); mercBotTick(dt); spyBotDisarmTick(dt); if (online()) stateOut(); }
        }
        scanHearTick(dt);
        if (M.gone) for (const [id, t] of M.gone) if (MATCH.time > t) M.gone.delete(id);
      }
      for (const k in KEYS) prev[k] = KEYS[k];
      visTick(); flareLights(); hudTick();
    } catch (err) { if (!M.err || M.err < 5) { M.err = (M.err || 0) + 1; console.warn('BO merc tools', err); } }
  };
  M.LASTP = LASTP; M.crossed = crossed; M.removeDev = removeDev; M.placeAuth = placeAuth; M.flareAuth = flareAuth; M.trigger = trigger; M.destroy = destroy; M.scanFrom = scanFrom; M.span = span; M.charges = charges; M.tooClose = tooClose;
})();
