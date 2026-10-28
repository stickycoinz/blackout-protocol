/* ==========================================================================
   BLACKOUT pass 8: the spy kit, on Riposte's own systems.
   - Roll i-frames (game.rollIFrames, counted from the start of the 0.6 s roll), roll cooldown and distance (09zo).
   - Gadgets with per-life charges (BOCFG.v.spy): smoke bomb G and flashbang Q (Riposte grenades: spawnNade / smokeStart / flashBang),
     silent throwing knife X or click (Riposte throwing knife: spawnThrowKnife, tunable damage, picked back up by walking over it),
     decoy noisemaker V (a thrown canister that fakes gunfire and footsteps: merc bots go look, merc players get a CONTACT ping).
   - Wall climb and ledge hang: SPACE facing a ledge (container, low roof). Low ledges vault straight up; tall ones hang first
     (SPACE again or keep holding: climb up; C, CTRL or S: drop). UAL has no climb clip: Jump_Loop / Crouch_Idle_Loop with the arms
     raised by hand (boArmsUp), see the report.
   - Shadow cloak: crouched, slow and out of lamp and torch light, bots barely see the spy and merc players see a darker body.
   - Shootable lamps: a bullet through a bulb kills that lamp in the baked lamp layers (no light is ever added or removed) and caps the
     bulb with a dark cover; every lamp comes back at the next round.
   - Spy toughness: damage taken x spyDmg, a Hit_Chest stagger that slows him for a moment.
   - Spy bots use the kit (smoke / flash / knife when spotted, decoy while hacking).
   ========================================================================== */
(function () {
  const MERC = 0, SPY = 1, R = window.BO_RULES;
  if (!R) return;
  const on = () => { try { return typeof boIsBlackout === 'function' && boIsBlackout() && MATCH.state === 'playing'; } catch (e) { return false; } };
  const SP = () => (window.BOCFG && BOCFG.v && BOCFG.v.spy) || BOCFG.defaults().spy;
  const GM = () => (window.BOCFG && BOCFG.v && BOCFG.v.game) || {};
  const A = window.BO_SPY = { lamps: [], decoys: [], prev: {}, log: [], lampHits: 0, lured: 0 };
  const log = (m) => { A.log.push((MATCH.time || 0).toFixed(1) + ' ' + m); if (A.log.length > 80) A.log.shift(); };
  const V = THREE.Vector3, _a = new V(), _b = new V(), _c = new V();
  const pk = (c) => !!KEYS[c] && !A.prev[c];

  /* ---------- charges ---------- */
  function fillGadgets(e) {
    const S = SP(), G = (e.isPlayer && BOCFG.v.loadout.spy.gadgets) || { smoke: true, flash: true, knife: true, decoy: true };
    e.boGad = { smoke: G.smoke ? S.smokeN : 0, flash: G.flash ? S.flashN : 0, knife: G.knife ? S.knifeN : 0, decoy: G.decoy ? S.decoyN : 0 };
    e.boGadMax = Object.assign({}, e.boGad);
  }
  const gad = (e) => e.boGad || (fillGadgets(e), e.boGad);
  R.onSetup = function () {
    for (const e of entities) {
      e.boClimb = null; e.boAnim = null; e.boAnimT = null; e.boArmsUp = 0; e.boStagT = 0; e.boCloak = 0; e.boRollAt = -99;
      if (e.team === SPY) fillGadgets(e);
    }
    for (const d of A.decoys) if (d.mesh) scene.remove(d.mesh);
    A.decoys.length = 0;
    lampsRestore();
    if (window.BOLOADOUT && BOLOADOUT.onRound) try { BOLOADOUT.onRound(); } catch (err) { console.warn('BO loadout screen', err); }
  };

  /* ---------- aiming and throwing ---------- */
  function camAim(maxD) {
    const f = camFwd(_a).clone().normalize(), c = camera.position;
    const w = rayWorld(c.x, c.y, c.z, f.x, f.y, f.z, maxD || 80, 1);
    const eh = rayEntities(c, f, w ? w.t : maxD || 80, PL.ent);
    const t = eh ? eh.t : w ? w.t : maxD || 80;
    return c.clone().addScaledVector(f, t);
  }
  function handPos(e, dir) {
    const p = entChest(e, new V()); p.y += 0.25;
    const h = _b.set(dir.x, 0, dir.z); if (h.lengthSq() < 1e-6) h.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)); h.normalize();
    const w = rayWorld(p.x, p.y, p.z, h.x, 0, h.z, 0.6, 1), k = w ? Math.max(0, w.t - 0.15) : 0.5;
    p.x += h.x * k; p.z += h.z * k;
    return p;
  }
  function throwAnim(e) {
    e.boThrowT = 0.4;
    try { if (e.model && e.model._boKay && !e.boClimb) boKayOneShot(e.model, 'Punch_Jab', 0.42, 0.05); } catch (err) {}
    try { sfxMech('throw', 0, entEye(e, new V())); } catch (err) {}
  }
  /* grenade-type gadget: player throws along his aim, a bot lobs it onto a point */
  function throwNadeType(e, type, target) {
    if (!NADE_MAT) nadeWarm();
    let p, v;
    if (target) {
      p = handPos(e, _c.set(target.x - e.pos.x, 0, target.z - e.pos.z));
      const dx = target.x - p.x, dz = target.z - p.z, d = Math.max(0.5, Math.hypot(dx, dz));
      const vt = clamp(d * 0.9, 6, 19), tt = d / vt, vy = ((target.y - p.y) + 0.5 * NADE.g * tt * tt) / tt;
      v = new V((dx / d) * vt, clamp(vy, 1.5, 13), (dz / d) * vt);
    } else {
      const aim = camAim(60), f0 = aim.clone().sub(camera.position).normalize();
      p = handPos(e, f0);
      const f = aim.sub(p).normalize();
      v = f.multiplyScalar(NADE.speed * 0.9); v.y += NADE.up;
    }
    const fuse = type === 'decoy' ? 1.1 : Math.max(0.7, nadeFuse(type) - 0.2);
    if (type === 'smoke') SMOKE.life = SP().smokeLife;
    spawnNade(e, p, v, fuse, type);
    if (A.netThrow) try { A.netThrow(e, type, p, v, fuse); } catch (err) {}
    throwAnim(e);
    log(e.name + ' throws ' + type);
  }
  function throwKnife(e, target) {
    const K = THROW_KNIFE;
    const aim = target ? target.clone() : camAim(70);
    const p = handPos(e, _c.set(aim.x - e.pos.x, 0, aim.z - e.pos.z));
    const to = aim.clone().sub(p), dist = Math.max(0.5, to.length()), T = dist / K.speed;
    const v = to.normalize().multiplyScalar(K.speed); v.y += 0.5 * K.g * T;
    spawnThrowKnife(e, p, v);
    if (A.netThrow) try { A.netThrow(e, 'knife', p, v, 0); } catch (err) {}
    throwAnim(e);
    log(e.name + ' throws knife');
  }
  function useGadget(e, k) {
    const g = gad(e);
    if (!(g[k] > 0)) { if (e.isPlayer) try { hudMsg('NO ' + ({ smoke: 'SMOKE BOMBS', flash: 'FLASHBANGS', knife: 'KNIVES', decoy: 'DECOYS' })[k] + ' LEFT', 'enemy', 1); } catch (err) {} return false; }
    if ((e.boThrowAt || -9) > MATCH.time - 0.45) return false;
    e.boThrowAt = MATCH.time; g[k]--;
    if (k === 'knife') throwKnife(e); else throwNadeType(e, k);
    return true;
  }
  R.onSpyClick = (e) => { if (!e.boClimb) useGadget(e, 'knife'); };

  /* knife: damage from the editor; every spy picks his own stuck knives back up */
  const _applyDamage = applyDamage;
  applyDamage = function (victim, dmg, attacker, weapon, head, dir, srcPos, life) {
    if (on() && victim && victim.alive) {
      const fromNet = typeof NET !== 'undefined' && !!NET.hitQ; // pass 16: a hit from the net was already scaled by the shooter
      if (!fromNet && attacker && attacker.team === SPY && weapon === NET_WSPECIAL.tknife) dmg = SP().knifeDmg * (head ? 1.5 : 1);
      if (victim.team === SPY && (!attacker || attacker.team !== SPY)) {
        const ifr = GM().rollIFrames != null ? GM().rollIFrames : 0.35;
        if (victim.boRollAt != null && MATCH.time - victim.boRollAt < ifr) { A.iframeHits = (A.iframeHits || 0) + 1; log('i-frame dodge ' + victim.name); return; }
        if (!fromNet) dmg *= SP().spyDmg;
        const st = SP().stagger;
        if (st > 0 && dmg > 0) {
          victim.boStagT = st;
          try { if (victim.model && victim.model._boKay && !victim.boClimb && !(victim.boRollT > 0)) boKayOneShot(victim.model, head ? 'Hit_Head' : 'Hit_Chest', Math.max(0.3, st), 0.05); } catch (err) {}
        }
      }
    }
    return _applyDamage(victim, dmg, attacker, weapon, head, dir, srcPos, life);
  };
  function knifePickup() {
    if (!SP().knifePick) return;
    for (let i = TKNIVES.length - 1; i >= 0; i--) {
      const k = TKNIVES[i], e = k.owner;
      if (!k.stuck || !e || !e.alive || e.team !== SPY || !e.boGad) continue;
      if (e.boGad.knife >= (e.boGadMax ? e.boGadMax.knife : 99)) continue;
      if (Math.hypot(e.pos.x - k.p.x, e.pos.z - k.p.z) < 1.3 && Math.abs(e.pos.y + 0.8 - k.p.y) < 1.8) {
        e.boGad.knife++; tknifeDrop(i);
        if (e.isPlayer) { try { sfxMech('pickup'); hudMsg('KNIFE RECOVERED', 'ally', 1); } catch (err) {} }
      }
    }
  }

  /* flashbang thrown by a spy: the editor's stun time and radius */
  const _flashBang = flashBang;
  flashBang = function (p, owner) {
    if (!on() || !owner || owner.team !== SPY) return _flashBang(p, owner);
    const m = FLASH.max, r = FLASH.r, S = SP();
    FLASH.max = S.flashStun; FLASH.r = S.flashR;
    // spies are trained for their own flash: a spy player is not whited out by it (mercs and bots are)
    const me = PL.ent, keep = me && me.team === SPY ? [PL.flashT, PL.flashD, PL.flashI] : null;
    try { return _flashBang(p, owner); } finally {
      FLASH.max = m; FLASH.r = r;
      if (keep) { PL.flashT = keep[0]; PL.flashD = keep[1]; PL.flashI = keep[2]; }
    }
  };
  /* decoy: no blast, a noisemaker */
  const _nadeBurst = nadeBurst;
  nadeBurst = function (type, p, owner, life) {
    if (type !== 'decoy') return _nadeBurst(type, p, owner, life);
    const g = groundHeight(p.x, p.z, p.y + 0.3);
    A.decoys.push({ id: (A.decoyN = (A.decoyN || 0) + 1), p: new V(p.x, Math.max(g, p.y - 0.3) + 0.1, p.z), owner, t: 0, life: SP().decoyTime, nextT: 0.1, burst: 0 });
    log('decoy live');
  };
  function decoyTick(dt) {
    const S = SP(), me = PL.ent;
    for (let i = A.decoys.length - 1; i >= 0; i--) {
      const d = A.decoys[i]; d.t += dt; d.nextT -= dt;
      if (d.t > d.life) { if (R.hud.mk && R.hud.mk['dc' + d.id]) R.hud.mk['dc' + d.id].style.display = 'none'; A.decoys.splice(i, 1); continue; }
      if (d.nextT <= 0) {
        // bursts of 2 to 4 suppressed-pistol shots, or footsteps, every 0.6 to 1.4 s
        const shots = Math.random() < 0.6;
        d.nextT = shots ? rand(0.9, 1.6) : rand(0.5, 0.9);
        try { if (shots) { const n = 1 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) setTimeout(() => { try { sfxGun('pistol', d.p, null); } catch (err) {} }, k * rand(90, 170)); } else sfxStep(d.p, 0.45, 'gravel'); } catch (err) {}
        soundEvents.push({ pos: d.p.clone(), team: SPY, who: d.owner, t: MATCH.time, loud: true }); while (soundEvents.length > 60) soundEvents.shift();
        for (const m of entities) {
          if (m.off || !m.alive || m.isPlayer || m.team !== MERC || m.isRemote) continue;
          if (Math.hypot(m.pos.x - d.p.x, m.pos.z - d.p.z) > S.decoyRange) continue;
          if (m.target && m.visible) continue; // a merc in a firefight stays on it
          if (m.lastKnown) { m.lastKnown.set(d.p.x, m.pos.y, d.p.z); m.lastSeenT = MATCH.time - 1.5; }
          try { setPath(m, d.p); } catch (err) {}
          m.forceDecide = true; if (!d.lured) { d.lured = true; A.lured++; log('decoy lures ' + m.name); }
        }
      }
      // fake ping for a merc player
      if (me && me.team === MERC && R.marker) {
        const dd = Math.round(Math.hypot(me.pos.x - d.p.x, me.pos.z - d.p.z));
        R.marker('dc' + d.id, 'p', 'CONTACT', 'MOVEMENT · ' + dd + ' m', d.p.x, d.p.y + 1.6, d.p.z);
      } else if (R.hud.mk && R.hud.mk['dc' + d.id]) R.hud.mk['dc' + d.id].style.display = 'none';
    }
  }

  /* ---------- climb and ledge hang ---------- */
  const NOMV = { landed: 0, jumped: false, slid: false };
  function ledgeProbe(e) {
    const S = SP(); if (!S.climb) return null;
    const yaw = e.isPlayer ? PL.yaw : e.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), y0 = e.pos.y;
    let best = null;
    for (const d of [0.3, 0.45, 0.6, 0.75]) {
      const x = e.pos.x + fx * d, z = e.pos.z + fz * d;
      for (const c of queryBoxes(x - 0.02, z - 0.02, x + 0.02, z + 0.02)) {
        if (c.ray || c.inv) continue;
        if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
        const h = c.y1 - y0;
        if (h < 0.75 || h > S.climbH + 0.05 || c.y0 > y0 + 1.4) continue;
        if (!best || c.y1 < best.top) best = { top: c.y1, d, c };
      }
      if (best) break;
    }
    if (!best) return null;
    // a standing spot on top, with head room, and the space above the climber free
    const top = best.top;
    let face = best.d;
    for (let t = 0; t <= best.d; t += 0.05) { const x = e.pos.x + fx * t, z = e.pos.z + fz * t, c = best.c; if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) { face = t; break; } }
    for (const ex of [0.45, 0.65, 0.9]) {
      const x1 = e.pos.x + fx * (face + ex), z1 = e.pos.z + fz * (face + ex);
      const gh = groundHeight(x1, z1, top + 0.2, 0.3, true);
      if (Math.abs(gh - top) > 0.12) continue;
      if (ceilingAbove(x1, z1, top + 0.05, 0.3) < top + 1.25) continue;
      if (ceilingAbove(e.pos.x, e.pos.z, y0 + 0.3, 0.3) < top + 0.6) return null;
      return { top, h: top - y0, x1, z1, hx: e.pos.x + fx * Math.max(0, face - 0.34), hz: e.pos.z + fz * Math.max(0, face - 0.34), fx, fz };
    }
    return null;
  }
  A.ledgeProbe = ledgeProbe;
  A.climbStart = (e, L) => climbStart(e, L);
  function climbStart(e, L) {
    const hang = L.h > 1.9;
    e.boClimb = { st: hang ? 'reach' : 'up', t: 0, age: 0, top: L.top, x1: L.x1, z1: L.z1, hx: L.hx, hz: L.hz, ys: e.pos.y, xs: e.pos.x, zs: e.pos.z,
      hy: Math.max(e.pos.y, L.top - 2.05), held: 0 };
    e.vy = 0; e.vel.set(0, 0, 0); e.crouch = false; if (e.isPlayer) PL.crouchToggle = false;
    log((hang ? 'hang ' : 'vault ') + e.name + ' h=' + L.h.toFixed(2));
  }
  function climbEnd(e, drop) {
    e.boClimb = null; e.boAnim = null; e.boAnimT = null; e.boArmsUp = 0;
    if (drop) { e.onGround = false; e.vy = -0.5; if (e.isPlayer) PL.crouchToggle = false; }
  }
  const ease = (t) => t * t * (3 - 2 * t);
  function climbMove(e, dt) {
    const C = e.boClimb, S = SP(), I = e.input || {};
    C.t += dt; C.age += dt;
    e.vel.set(0, 0, 0); e.vy = 0; e.sprinting = false; e.slideT = 0;
    if (!e.alive || C.age > 15 || !S.climb) { climbEnd(e, true); return NOMV; }
    const jumpEdge = !!I.jump && !e._boJ; e._boJ = !!I.jump;
    const yaw = Math.atan2(-(C.x1 - C.hx), -(C.z1 - C.hz));
    if (e.isPlayer) e.yaw = PL.yaw; else e.yaw = yaw;
    if (C.st === 'reach') { // jump up to the hang
      const k = Math.min(1, C.t / 0.28);
      e.pos.set(lerp(C.xs, C.hx, k), lerp(C.ys, C.hy, ease(k)), lerp(C.zs, C.hz, k));
      e.onGround = false; e.boAnim = 'Jump_Loop'; e.boAnimT = 0.45; e.boArmsUp = k;
      if (k >= 1) { C.st = 'hang'; C.t = 0; }
      if (I.jump) C.held += dt; else C.held = -99;
      return NOMV;
    }
    if (C.st === 'hang') {
      e.pos.set(C.hx, C.hy, C.hz); e.onGround = false;
      e.boAnim = 'Jump_Loop'; e.boAnimT = 0.45 + Math.sin(C.age * 2.2) * 0.03; e.boArmsUp = 1;
      if (I.jump) C.held += dt; else C.held = -99;
      if (jumpEdge || C.held > 0.35) { C.st = 'up'; C.t = 0; C.ys = e.pos.y; C.xs = e.pos.x; C.zs = e.pos.z; return NOMV; }
      if ((I.crouch && C.age > 0.3) || I.mz < -0.5 || (e.isPlayer && (KEYS.ControlLeft || KEYS.KeyC) && C.age > 0.3)) { log('drop ' + e.name); climbEnd(e, true); }
      return NOMV;
    }
    // climbing up: body rises to the ledge (arms up, then pushing), then rolls onto the top
    const T = Math.max(0.3, S.climbTime), k = Math.min(1, C.t / T);
    if (k < 0.55) {
      const u = ease(k / 0.55);
      e.pos.set(lerp(C.xs, C.hx, u), lerp(C.ys, C.top - 0.75, u), lerp(C.zs, C.hz, u));
      e.boAnim = 'Jump_Loop'; e.boAnimT = 0.45; e.boArmsUp = 1 - u * 0.6;
    } else {
      const u = ease((k - 0.55) / 0.45);
      e.pos.set(lerp(C.hx, C.x1, u), lerp(C.top - 0.75, C.top, Math.min(1, u * 1.6)), lerp(C.hz, C.z1, u));
      e.boAnim = 'Crouch_Idle_Loop'; e.boAnimT = 0.3; e.boArmsUp = 0.4 * (1 - u);
    }
    e.onGround = false;
    if (k >= 1) { e.pos.set(C.x1, C.top, C.z1); e.onGround = true; e.vy = 0; climbEnd(e, false); log('climbed ' + e.name + ' y=' + e.pos.y.toFixed(2)); }
    return NOMV;
  }
  const _ctlMove = ctlMove;
  ctlMove = function (e, dt) {
    if (!on() || !e || e.team !== SPY) return _ctlMove(e, dt);
    if (e.boClimb) return climbMove(e, dt);
    const I = e.input || {};
    if (e.isPlayer && e.alive && I.jump && !e._boJ && !(e.boRollLeft > 0) && !playHold()) {
      const L = ledgeProbe(e);
      if (L) { e._boJ = true; climbStart(e, L); return climbMove(e, dt); }
    }
    e._boJ = !!I.jump;
    if (e.boStagT > 0 && e.arms) {
      const w = armsW(e), d = w && w.def;
      if (d) { const m = d.move; d.move = m * SP().staggerSlow; try { return _ctlMove(e, dt); } finally { d.move = m; } }
    }
    return _ctlMove(e, dt);
  };

  /* ---------- shadow cloak ---------- */
  const _lc = new THREE.Color();
  function litByTorch(s) {
    const L = BOCFG.v.light, rng = L.flashRange * 0.85, cosA = Math.cos(Math.min(1.4, (L.flashAngle * 1.35) * Math.PI / 180));
    const sc = entChest(s, _c);
    for (const m of entities) {
      if (m.off || !m.alive || m.team !== MERC) continue;
      if (m.isPlayer && !BO.flashOn) continue;
      const eye = m.isPlayer ? camera.position : entEye(m, _a);
      const dx = sc.x - eye.x, dy = sc.y - eye.y, dz = sc.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d > rng || d < 0.01) continue;
      let fx, fy, fz;
      if (m.isPlayer) { const f = camFwd(_b); fx = f.x; fy = f.y; fz = f.z; } else { const p = m.pitch || 0, y = m.lookYaw != null ? m.lookYaw : m.yaw; fx = -Math.sin(y) * Math.cos(p); fy = Math.sin(p); fz = -Math.cos(y) * Math.cos(p); }
      if ((dx * fx + dy * fy + dz * fz) / d < cosA) continue;
      if (lineClear(eye, sc)) return true;
    }
    return false;
  }
  function lightLevel(e) { lampAt(e.pos.x, e.pos.y + 1.0, e.pos.z, _lc); return (_lc.r + _lc.g + _lc.b) / 3; }
  A.lightLevel = lightLevel;
  function cloakTick(dt) {
    const S = SP();
    for (const e of entities) {
      if (e.off || e.team !== SPY) continue;
      e.boCloakT = (e.boCloakT || 0) - dt;
      if (e.boCloakT <= 0) {
        e.boCloakT = 0.12;
        const spd = Math.hypot(e.vel.x, e.vel.z);
        e.boLight = lightLevel(e);
        e.boLit = e.boLight >= S.cloakDark || litByTorch(e);
        if (e.isRemote && e.boCloakNet != null) e.boCloakOn = !!(S.cloak && e.alive && e.boCloakNet); // pass 16: the spy's own machine decides
        else e.boCloakOn = !!(S.cloak && e.alive && e.crouch && !e.boClimb && !(e.boRollLeft > 0) && !e.boInteract && spd <= S.cloakSpeed && !e.boLit);
      }
      e.boCloak = clamp((e.boCloak || 0) + (e.boCloakOn ? dt / 0.5 : -dt / 0.2), 0, 1);
      // looks: darker for a merc player watching; a little darker for the spy player himself, so he knows
      const K = e.model && e.model._boKay; if (!K) continue;
      const me = PL.ent, f = me && me.team === MERC ? lerp(1, S.cloakBody, e.boCloak) : lerp(1, 0.55, e.boCloak);
      if (Math.abs((K._cloakF == null ? 1 : K._cloakF) - f) < 0.01) continue;
      K._cloakF = f;
      for (const m of K.bodyMats) {
        if (!m.userData.boC) { m.userData.boC = m.color.clone(); m.userData.boE = m.emissive.clone(); }
        m.color.copy(m.userData.boC).multiplyScalar(f); m.emissive.copy(m.userData.boE).multiplyScalar(f);
      }
      for (const m of K.goggleMats) { if (m.userData.boI == null) m.userData.boI = m.emissiveIntensity; m.emissiveIntensity = m.userData.boI * lerp(0.15, 1, f); }
    }
  }
  R.cloakMul = (s) => (s.boCloak > 0 ? lerp(1, SP().cloakK, s.boCloak) : 1);

  /* ---------- shootable lamps ---------- */
  let CAP = null;
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V();
  function lampsInit() {
    A.lamps = [];
    if (CAP) { scene.remove(CAP); CAP = null; }
    if (typeof LAMPS === 'undefined' || !LAMPS.length) return;
    LAMPS.forEach((l, i) => { if (!l.fixed && l.p > 0) A.lamps.push({ l, i, broken: false }); });
    if (!A.lamps.length) return;
    // dark covers for broken bulbs, one instanced mesh made at map load (compiled with the map), all hidden by scale
    CAP = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0a0a0b }), A.lamps.length);
    CAP.name = 'boLampCaps'; CAP.frustumCulled = false;
    A.lamps.forEach((L, k) => { _m4.compose(_s.set(L.l.x, L.l.y + 0.08, L.l.z), _q, _b.set(0.001, 0.001, 0.001)); CAP.setMatrixAt(k, _m4); });
    CAP.instanceMatrix.needsUpdate = true;
    scene.add(CAP);
    log('lamps ' + A.lamps.length);
  }
  if (typeof boLightsArm === 'function') {
    const _arm = boLightsArm;
    boLightsArm = function (v) { const r = _arm(v); try { if (v) lampsInit(); else { if (CAP) scene.remove(CAP); CAP = null; A.lamps = []; } } catch (err) { console.warn('BO lamps', err); } return r; };
  }
  /* recompute the lamp layers around one lamp (same maths as the bake in 02e-light.js), broken lamps left out */
  function lampRebake(lamp) {
    const L = LIGHT; if (!L.data || !L.nyL || !L.tex) return false;
    const t0 = performance.now(), d = L.d, nx = L.nx, ny = L.ny, nz = L.nz, nyL = L.nyL, out = L.data, dd = d * d;
    const cl = (l) => [(l.x - L.x0) / d, l.y / d, (l.z - L.z0) / d, l.r / d];
    const [lx0, ly0, lz0, R0] = cl(lamp);
    const xa = Math.max(0, Math.floor(lx0 - R0) - 1), xb = Math.min(nx - 1, Math.ceil(lx0 + R0) + 1);
    const za = Math.max(0, Math.floor(lz0 - R0) - 1), zb = Math.min(nz - 1, Math.ceil(lz0 + R0) + 1);
    const ya = 0, yb = Math.min(nyL - 1, Math.ceil(ly0 + R0) + 1);
    const act = []; let Rm = 0;
    for (const l of LAMPS) {
      if (l.boBroken) continue;
      const c = cl(l); if (c[0] + c[3] < xa - 1 || c[0] - c[3] > xb + 1 || c[2] + c[3] < za - 1 || c[2] - c[3] > zb + 1 || c[1] - c[3] > yb + 1) continue;
      act.push([c[0], c[1], c[2], l.c[0] * l.p, l.c[1] * l.p, l.c[2] * l.p, c[3], l.down || 0]); Rm = Math.max(Rm, c[3]);
    }
    // occlusion for the region the rays can cross
    const ox0 = Math.max(0, Math.floor(xa - Rm) - 2), ox1 = Math.min(nx - 1, Math.ceil(xb + Rm) + 2), oz0 = Math.max(0, Math.floor(za - Rm) - 2), oz1 = Math.min(nz - 1, Math.ceil(zb + Rm) + 2);
    const W = ox1 - ox0 + 1, D = oz1 - oz0 + 1, H = nyL, occ = new Uint8Array(W * D * H);
    for (const b of OCC) {
      const op = Math.round(clamp(b.k === undefined ? 1 : b.k, 0, 1) * 255); if (!op) continue;
      const ix0 = Math.max(ox0, Math.floor((b.x0 - L.x0) / d + 0.15)), ix1 = Math.min(ox1, Math.ceil((b.x1 - L.x0) / d - 0.15) - 1);
      const iz0 = Math.max(oz0, Math.floor((b.z0 - L.z0) / d + 0.15)), iz1 = Math.min(oz1, Math.ceil((b.z1 - L.z0) / d - 0.15) - 1);
      const iy0 = Math.max(0, Math.floor(b.y0 / d + 0.15)), iy1 = Math.min(H - 1, ny - 1, Math.ceil(b.y1 / d - 0.15) - 1);
      if (ix0 > ix1 || iz0 > iz1 || iy0 > iy1) continue;
      for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
        const row = (iy * D + iz - oz0) * W - ox0;
        for (let ix = ix0; ix <= ix1; ix++) if (occ[row + ix] < op) occ[row + ix] = op;
      }
    }
    if (RELIEF.on) for (let iz = oz0; iz <= oz1; iz++) for (let ix = ox0; ix <= ox1; ix++) {
      const top = Math.min(H, ny, Math.floor(reliefAt(L.x0 + (ix + 0.5) * d, L.z0 + (iz + 0.5) * d) / d));
      for (let iy = 0; iy < top; iy++) occ[(iy * D + iz - oz0) * W + ix - ox0] = 255;
    }
    const OI = (X, Y, Z) => (X < ox0 || X > ox1 || Z < oz0 || Z > oz1 || Y < 0 || Y >= H ? -1 : (Y * D + Z - oz0) * W + X - ox0);
    const tw = xb - xa + 1, tz = zb - za + 1, th = yb - ya + 1, E = new Float32Array(tw * tz * th * 3);
    for (const lp of act) {
      const [lx, ly, lz, cr, cg, cb, R, dn] = lp, R2 = R * R;
      const l0 = ly >= 0 && ly < ny && lx >= 0 && lx < nx && lz >= 0 && lz < nz ? (((ly | 0) * nz + (lz | 0)) * nx + (lx | 0)) : -1;
      const x0 = Math.max(xa, Math.floor(lx - R)), x1 = Math.min(xb, Math.ceil(lx + R)), z0 = Math.max(za, Math.floor(lz - R)), z1 = Math.min(zb, Math.ceil(lz + R));
      const y0 = Math.max(ya, Math.floor(ly - R)), y1 = Math.min(yb, Math.ceil(ly + R));
      for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const dx = ix + 0.5 - lx, dy = iy + 0.5 - ly, dz = iz + 0.5 - lz, q2 = dx * dx + dy * dy + dz * dz;
        if (q2 > R2) continue;
        const oi = OI(ix, iy, iz); if (oi >= 0 && occ[oi] >= 128) continue;
        const i = (iy * nz + iz) * nx + ix;
        const n = Math.ceil(Math.sqrt(q2) * 2); let T = 1, prev = -1;
        for (let st = 1; st < n && T > 0.03; st++) {
          const t = st / n, X = (lx + dx * t) | 0, Y = (ly + dy * t) | 0, Z = (lz + dz * t) | 0, j = (Y * nz + Z) * nx + X;
          if (j === prev || j === i || j === l0) continue;
          prev = j; const q = OI(X, Y, Z), op = q >= 0 ? occ[q] : 0; if (op) T *= 1 - op / 255;
        }
        if (T <= 0.03) continue;
        const u = q2 / R2, w = 1 - u * u, o = (((iy - ya) * tz + iz - za) * tw + ix - xa) * 3;
        const f = ((T * w * w) / (q2 * dd + 0.35)) * (1 - dn + dn * 2.5 * Math.max(0, -dy / Math.sqrt(q2 + 1e-6)));
        E[o] += cr * f; E[o + 1] += cg * f; E[o + 2] += cb * f;
      }
    }
    const base = nx * ny * nz * 4, LM = LAMP_MAX, DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];
    const EI = (X, Y, Z) => (((Y - ya) * tz + Z - za) * tw + X - xa) * 3;
    let changed = 0;
    for (let iy = ya; iy <= yb; iy++) for (let iz = za; iz <= zb; iz++) for (let ix = xa; ix <= xb; ix++) {
      // edge cells of the box keep their bytes unless they sit on the grid border (their neighbours are outside the box)
      if ((ix === xa && xa > 0) || (ix === xb && xb < nx - 1) || (iz === za && za > 0) || (iz === zb && zb < nz - 1) || (iy === yb && yb < nyL - 1)) continue;
      const e0 = EI(ix, iy, iz); let r = E[e0], g = E[e0 + 1], b = E[e0 + 2];
      const oi = OI(ix, iy, iz);
      if (oi >= 0 && occ[oi] >= 128) {
        r = g = b = 0; let n = 0;
        for (let k = 0; k < 6; k++) {
          const X = ix + DX[k], Y = iy + DY[k], Z = iz + DZ[k]; if (X < 0 || X >= nx || Y < 0 || Y >= nyL || Z < 0 || Z >= nz) continue;
          const q = OI(X, Y, Z); if (q >= 0 && occ[q] >= 128) continue;
          const ej = EI(X, Y, Z); r += E[ej]; g += E[ej + 1]; b += E[ej + 2]; n++;
        }
        if (n) { r /= n; g /= n; b /= n; }
      }
      const o = base + ((iy * nz + iz) * nx + ix) * 4;
      const nr = Math.round(Math.sqrt(Math.min(r / LM, 1)) * 255), ng = Math.round(Math.sqrt(Math.min(g / LM, 1)) * 255), nb = Math.round(Math.sqrt(Math.min(b / LM, 1)) * 255);
      if (out[o] !== nr || out[o + 1] !== ng || out[o + 2] !== nb) changed++;
      out[o] = nr; out[o + 1] = ng; out[o + 2] = nb;
    }
    L.tex.needsUpdate = true;
    A.lastRebake = { ms: Math.round(performance.now() - t0), changed, lamps: act.length };
    return true;
  }
  A.lampRebake = lampRebake;
  function lampBreak(L, at) {
    if (L.broken) return;
    L.broken = true; L.l.boBroken = true; A.lampHits++;
    const p = new V(L.l.x, L.l.y + 0.08, L.l.z);
    try { lampRebake(L.l); } catch (err) { console.warn('BO lamp rebake', err); }
    if (CAP) { const k = A.lamps.indexOf(L); _m4.compose(p, _q, _b.set(0.21, 0.21, 0.21)); CAP.setMatrixAt(k, _m4); CAP.instanceMatrix.needsUpdate = true; }
    try { impactFx(p, new V(0, -1, 0), 'metal', false, true); sfxImpact(p, 'metal'); } catch (err) {}
    try { for (let i = 0; i < 10; i++) FX.flash.spawn(p.x, p.y, p.z, rand(-2, 2), rand(-1, 2), rand(-2, 2), 0.05, 0.25, 0.4, 1, 0.9, 0.6, 1, 0); } catch (err) {}
    soundEvents.push({ pos: p.clone(), team: -1, who: null, t: MATCH.time, loud: false }); while (soundEvents.length > 60) soundEvents.shift();
    log('lamp ' + L.i + ' shot out (' + (A.lastRebake ? A.lastRebake.ms + ' ms' : '') + ')');
  }
  A.lampBreak = lampBreak;
  function lampsRestore() {
    for (const L of A.lamps) {
      if (!L.broken) continue;
      L.broken = false; L.l.boBroken = false;
      try { lampRebake(L.l); } catch (err) {}
      if (CAP) { const k = A.lamps.indexOf(L); _m4.compose(_s.set(L.l.x, L.l.y + 0.08, L.l.z), _q, _b.set(0.001, 0.001, 0.001)); CAP.setMatrixAt(k, _m4); CAP.instanceMatrix.needsUpdate = true; }
    }
  }
  A.lampsRestore = lampsRestore;
  const _fireRay = fireRay;
  fireRay = function (shooter, origin, dir, def, muzzle, tracer, dmgMul) {
    if (on() && A.lamps.length && SP().lamps) {
      try {
        const w = rayWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 300, 1), wt = w ? w.t : 300;
        const eh = rayEntities(origin, dir, wt, shooter), endT = eh ? eh.t : wt;
        let hit = null, ht = endT;
        for (const L of A.lamps) {
          if (L.broken) continue;
          const px = L.l.x - origin.x, py = L.l.y + 0.08 - origin.y, pz = L.l.z - origin.z, t = px * dir.x + py * dir.y + pz * dir.z;
          if (t <= 0 || t > ht + 0.3) continue;
          const qx = px - dir.x * t, qy = py - dir.y * t, qz = pz - dir.z * t;
          if (qx * qx + qy * qy + qz * qz < 0.3 * 0.3) { hit = L; ht = t; }
        }
        if (hit) { lampBreak(hit); if (A.netLamp) try { A.netLamp(shooter, hit); } catch (err) {} }
      } catch (err) { console.warn('BO lamp hit', err); }
    }
    return _fireRay(shooter, origin, dir, def, muzzle, tracer, dmgMul);
  };

  /* ---------- spy bots use the kit ---------- */
  R.botAbil = function (b, S, threat, td) {
    const cfg = SP(); if (!cfg.botGadgets || !b.alive || b.boClimb) return;
    if ((b.boGadAt || -99) > MATCH.time) return;
    const g = gad(b);
    b.boGadAt = MATCH.time + 0.5;
    if (threat && td < 18) {
      const eye = entEye(b, new V()), tc = entChest(threat, new V()), clear = lineClear(eye, tc);
      const r = Math.random();
      if (g.flash > 0 && td > 4 && td < 15 && clear && r < 0.35) { g.flash--; b.yaw = Math.atan2(-(tc.x - b.pos.x), -(tc.z - b.pos.z)); throwNadeType(b, 'flash', new V(tc.x, tc.y - 1, tc.z)); b.boGadAt = MATCH.time + 3.5; return; }
      if (g.knife > 0 && td < 16 && clear && r < 0.6) { g.knife--; b.yaw = Math.atan2(-(tc.x - b.pos.x), -(tc.z - b.pos.z)); throwKnife(b, tc); b.boGadAt = MATCH.time + 2; return; }
      if (g.smoke > 0 && td < 13 && r < 0.85) {
        g.smoke--; const dx = threat.pos.x - b.pos.x, dz = threat.pos.z - b.pos.z, l = Math.hypot(dx, dz) || 1;
        throwNadeType(b, 'smoke', new V(b.pos.x + dx / l * 2.5, b.pos.y, b.pos.z + dz / l * 2.5)); b.boGadAt = MATCH.time + 6; return;
      }
      return;
    }
    if (S.mode === 'hack' && S.term && g.decoy > 0 && Math.hypot(b.pos.x - S.term.x, b.pos.z - S.term.z) < 6) {
      let m = null, md = 40;
      for (const o of entities) { if (o.off || !o.alive || o.team !== MERC) continue; const d = Math.hypot(o.pos.x - S.term.x, o.pos.z - S.term.z); if (d < md) { md = d; m = o; } }
      if (m && md > 9) {
        const dx = S.term.x - m.pos.x, dz = S.term.z - m.pos.z, l = Math.hypot(dx, dz) || 1, sgn = Math.random() < 0.5 ? 1 : -1;
        let tx = S.term.x + (-dz / l) * 12 * sgn, tz = S.term.z + (dx / l) * 12 * sgn;
        if (!lineClear(entEye(b, new V()), new V(tx, 1.2, tz))) { tx = S.term.x + (-dz / l) * 7 * sgn; tz = S.term.z + (dx / l) * 7 * sgn; }
        g.decoy--; throwNadeType(b, 'decoy', new V(tx, 0.2, tz)); b.boGadAt = MATCH.time + 10;
      }
    }
  };

  /* ---------- player input, HUD text ---------- */
  function playerTick() {
    const e = PL.ent; if (!e || !e.alive || e.team !== SPY || playHold()) return;
    if (window.BOEDITOR && BOEDITOR.isOpen()) return;
    if (window.BOLOADOUT && BOLOADOUT.isOpen()) return;
    if (pk('KeyG')) useGadget(e, 'smoke');
    if (pk('KeyQ')) useGadget(e, 'flash');
    if (pk('KeyX') && !e.boClimb) useGadget(e, 'knife');
    if (pk('KeyV')) useGadget(e, 'decoy');
  }
  R.spyPrompt = (e) => {
    if (e.boClimb) return e.boClimb.st === 'up' ? 'CLIMBING' : 'HANGING · ' + BK('jump') + ': CLIMB UP · ' + BK('crouchT') + ' / ' + BK('back') + ': DROP';
    if (e.onGround && SP().climb) { const L = ledgeProbe(e); if (L) return BK('jump') + ': ' + (L.h > 1.9 ? 'GRAB LEDGE' : 'VAULT') + ' (' + L.h.toFixed(1) + ' m)'; }
    return '';
  };
  const kb = (k) => '<b>' + k + '</b>';
  const BK = (id) => (window.BOKEYS ? BOKEYS.K(id) : ({ jump: 'SPACE', crouchT: 'C', back: 'S' })[id] || id);
  R.keysHtml = (spy, me) => {
    if (!spy) return kb('LMB') + 'fire &nbsp;' + kb('RMB') + 'aim &nbsp;' + kb('R') + 'reload &nbsp;' + kb('1') + kb('2') + 'weapons &nbsp;' + kb('L') + 'flashlight<br>'
      + kb('SHIFT') + 'sprint &nbsp;' + kb('C') + 'crouch &nbsp;' + kb('SPACE') + 'jump &nbsp;' + kb('TAB') + 'scores &nbsp;' + kb('F9') + 'loadout &nbsp;' + (window.BOADMIN && BOADMIN.can() ? kb('F10') + 'editor &nbsp;' : '') + '<i>shoot lamps out to kill the light</i>';
    const g = (me && me.boGad) || { smoke: 0, flash: 0, knife: 0, decoy: 0 }, n = (k) => '<em' + (g[k] > 0 ? '' : ' class="z"') + '>×' + g[k] + '</em>';
    return kb('E') + 'hack / takedown / extract &nbsp;' + kb('F') + kb('LMB') + 'takedown &nbsp;' + kb('ALT') + 'roll (i-frames)<br>'
      + kb('G') + 'smoke ' + n('smoke') + ' &nbsp;' + kb('Q') + 'flashbang ' + n('flash') + ' &nbsp;' + kb('X') + kb('LMB') + 'knife ' + n('knife') + ' &nbsp;' + kb('V') + 'decoy ' + n('decoy') + '<br>'
      + kb('SPACE') + 'climb / hang &nbsp;' + kb('C') + kb('CTRL') + 'crouch (cloak in shadow) &nbsp;' + kb('SHIFT') + 'sprint &nbsp;' + kb('TAB') + 'scores &nbsp;' + kb('F9') + 'loadout' + (window.BOADMIN && BOADMIN.can() ? ' &nbsp;' + kb('F10') + 'editor' : '');
  };
  R.stateText = (spy, me) => {
    if (!spy) return BO.flashOn ? 'FLASHLIGHT ON' : 'FLASHLIGHT OFF';
    if (!me) return '';
    if (me.boClimb) return me.boClimb.st === 'up' ? 'CLIMBING' : 'HANGING';
    if (me.boStagT > 0) return 'HIT';
    if (me.boRollLeft > 0) return 'ROLL';
    if (me.boCloak > 0.5) return 'CLOAKED';
    if (me.crouch) return me.boLit ? 'SNEAKING · LIT' : 'SNEAKING';
    return me.sprinting ? 'SPRINTING' : 'WALKING';
  };

  function tick(dt) {
    if (!on()) { A.prev = Object.assign({}, KEYS); return; }
    for (const e of entities) {
      if (e.boStagT > 0) e.boStagT -= dt;
      if (e.boClimb && (!e.alive || e.off)) climbEnd(e, true);
      if (!e.boClimb && (e.boAnim || e.boArmsUp)) { e.boAnim = null; e.boAnimT = null; e.boArmsUp = 0; }
    }
    playerTick();
    knifePickup();
    decoyTick(dt);
    cloakTick(dt);
    A.prev = Object.assign({}, KEYS);
  }
  A.tick = tick;
  const _frame = frame;
  let last = null;
  frame = function (now) {
    _frame(now);
    try { const dt = Math.min(0.05, (last != null ? now - last : 16) / 1000); last = now; tick(dt); }
    catch (err) { if (!A._errN || A._errN < 5) { A._errN = (A._errN || 0) + 1; console.warn('BLACKOUT spy tick', err); } }
  };
})();
