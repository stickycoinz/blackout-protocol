/* ==========================================================================
   BLACKOUT online (pass 16). The host owns the objective, every machine sees the spy kit.
   - 'bost' (host, 4 per second): round, hacks needed, each terminal's progress and hacked flag. Clients follow it, so the
     extract opens on every machine as soon as the host counts the hacks (a client hack reaches the host through 'bohk').
   - 'boxt' (client): "I finished extracting". The host checks the extract is open and the spy stands in the ring, then ends
     the round for everyone ('bornd'); a refusal comes back as 'boxn' with the reason, shown to the spy.
   - Clients never decide a round (endRound asks the host instead). 'bors' tells the host a remote spy is waiting to respawn.
   - Spy gadgets ride Riposte's numbered state events: smoke, flash and knife as 'nade' (the stock path, so flash stuns and
     smoke clouds happen on every machine), decoys as 'bodc', shot out lamps as 'bol'.
   - 'boa' (8 per second while it changes): each local spy's roll, takedown, climb, stagger, hack kneel and cloak, so the
     UAL body plays the same move on every screen. Remote spies wear the UAL body too.
   - BLACKOUT bot roster online: the host keeps the editor's team sizes minus the humans (no stock 6 a side), clients run none.
   Every message stays far under 4 KB.
   ========================================================================== */
(function () {
  const MERC = 0, SPY = 1, R = window.BO_RULES, A = window.BO_SPY;
  if (!R || !A || typeof NET === 'undefined') return;
  const N = window.BO_NET = { log: [], sent: {}, got: {}, maxLen: 0, denied: '' };
  const lg = (s) => { N.log.push(((MATCH && MATCH.time) || 0).toFixed(1) + ' ' + s); if (N.log.length > 60) N.log.shift(); };
  const bo = () => { try { return !!(R.on && R.on()); } catch (e) { return false; } };
  const on = () => bo() && MATCH.online && NET.on && (NET.role === 'host' || NET.role === 'client');
  const isHost = () => on() && NET.role === 'host', isCl = () => on() && NET.role === 'client';
  const GM = () => (window.BOCFG && BOCFG.v && BOCFG.v.game) || {};
  const r2 = (x) => Math.round(x * 100) / 100;
  const cnt = (o, k, m) => { o[k] = (o[k] || 0) + 1; if (m) { const l = JSON.stringify(m).length; if (l > N.maxLen) N.maxLen = l; } };
  const bcast = (m, ex) => { cnt(N.sent, m.t, m); try { netBroadcast(m, true, ex); } catch (e) {} };
  const toHost = (m) => { cnt(N.sent, m.t, m); try { netSend(m); } catch (e) {} };
  R.netClientOn = isCl;

  /* ---------- clients never end a round ---------- */
  let xtAt = -9;
  R.netEndGuard = function (team, kicker) {
    if (!isCl()) return false;
    if (team === SPY && kicker === 'SPIES EXTRACTED' && performance.now() - xtAt > 400) {
      xtAt = performance.now();
      const e = PL.ent;
      toHost({ t: 'boxt', x: r2(e.pos.x), z: r2(e.pos.z) });
      lg('ask extract');
    }
    return true;
  };

  /* ---------- host: objective state out ---------- */
  function stateMsg() {
    return { t: 'bost', n: R.hackNeed, h: R.terminals.map((t) => [t.id, r2(t.hacked ? 1 : t.prog), t.hacked ? 1 : 0]), o: R.roundOver ? 1 : 0 };
  }
  let lastSig = '', lastAt = 0;
  function hostTick() {
    const m = stateMsg(), sig = JSON.stringify(m.h) + m.n + m.o, now = performance.now();
    if (sig !== lastSig || now - lastAt > 250) { lastSig = sig; lastAt = now; bcast(m); }
    rosterTrim();
    remoteResp();
  }
  /* a remote spy who just died may come back (respawn on, lives left): the host waits for him before calling SPIES ELIMINATED;
     his own machine confirms or cancels with 'bors' */
  function remoteResp() {
    const g = GM();
    for (const e of entities) {
      if (!e.isRemote || e.remoteBot || e.off) continue;
      if (e._boNetAlive && !e.alive) {
        e.boDeaths = (e.boDeaths || 0) + 1;
        const ok = !!g.respawn && (e.team !== SPY || !g.spyLives || e.boDeaths < g.spyLives);
        e.boRespAt = ok ? MATCH.time + Math.max(1, g.respawnDelay || 5) + 4 : null;
      }
      if (e.alive) e.boRespAt = null;
      else if (e.boRespAt != null && MATCH.time > e.boRespAt + 6) e.boRespAt = null; // never came back: stop waiting
      e._boNetAlive = e.alive;
    }
  }
  /* ---------- client: objective state in ---------- */
  function stateIn(m) {
    cnt(N.got, 'bost');
    if (!bo() || MATCH.state !== 'playing' || !Array.isArray(m.h)) return;
    if (typeof m.n === 'number' && m.n >= 1) R.hackNeed = Math.min(R.terminals.length || 1, Math.round(m.n));
    const wasOpen = R.extractOpen();
    for (const x of m.h.slice(0, 16)) {
      if (!Array.isArray(x)) continue;
      const t = R.terminals.find((q) => q.id === String(x[0])); if (!t) continue;
      if (x[2] && !t.hacked) {
        t.hacked = true; t.prog = 1; t.by = null;
        lg('host says ' + t.id + ' hacked');
        try { if (window.BO_TERM_FX) BO_TERM_FX(t); } catch (e) {}
        try { if (R.netHackFx) R.netHackFx(t); } catch (e) {}
      } else if (!x[2] && t.hacked) {
        // a hack the host has not counted yet (still on its way) stays; an old one (previous round) goes
        if (!t.netAt || performance.now() - t.netAt > 3000) { t.hacked = false; t.prog = 0; }
      }
      if (!t.hacked && !(t.by === PL.ent && PL.ent.boInteract)) t.prog = Math.max(0, Math.min(1, +x[1] || 0));
      if (t.hacked && x[2]) t.netAt = 0;
    }
    if (!wasOpen && R.extractOpen()) openFx();
  }
  function openFx() {
    try { hudMsg('EXTRACT OPEN · REACH HACK SPAWN', PL.ent.team === SPY ? 'xp' : 'enemy', 4); } catch (e) {}
    lg('extract open');
  }
  R.netOpenFx = openFx;
  // a hack finished on this machine waits for the host's count before 'bost' may undo it
  const _ah = R.alarmHack;
  R.alarmHack = function (t) { if (t) t.netAt = performance.now(); return _ah ? _ah.apply(this, arguments) : undefined; };

  /* ---------- host: client hacks and extract requests ---------- */
  function hackIn(c, m) {
    if (!Array.isArray(m.l)) return;
    const who = NET.remotes.get(c.peer) || null;
    for (const x of m.l.slice(0, 8)) {
      if (!Array.isArray(x)) continue;
      const t = R.terminals.find((q) => q.id === String(x[0]).slice(0, 4)); if (!t || t.hacked || t.locked) continue; // pass 23: a locked terminal needs the keycard
      const p = Math.max(0, Math.min(1, +x[1] || 0));
      if (p > t.prog) t.prog = p;
      if (x[2]) {
        const wasOpen = R.extractOpen();
        t.hacked = true; t.prog = 1; t.by = null;
        lg('client hack ' + t.id + ' by ' + (who ? who.name : c.peer));
        try { hudMsg('TERMINAL ' + t.id + ' HACKED (' + R.hackedCount() + '/' + R.hackNeed + ')', PL.ent.team === SPY ? 'xp' : 'enemy', 3); } catch (e) {}
        try { if (window.BO_TERM_FX) BO_TERM_FX(t); } catch (e) {}
        try { if (R.alarmHack) R.alarmHack(t, who); } catch (e) {}
        if (!wasOpen && R.extractOpen()) openFx();
        lastSig = '';
      }
    }
  }
  function extractIn(c, m) {
    cnt(N.got, 'boxt');
    const e = NET.remotes.get(c.peer);
    let why = '';
    if (!bo() || MATCH.state !== 'playing') why = 'NO ROUND';
    else if (R.roundOver) why = '';
    else if (!e || !e.alive) why = 'YOU ARE DOWN';
    else if (e.team !== SPY) why = 'ONLY SPIES EXTRACT';
    else if (!R.extractOpen()) why = 'HOST COUNTS ' + R.hackedCount() + '/' + R.hackNeed + ' HACKS';
    else {
      const X = R.extractPt ? R.extractPt() : { x: 0, z: 0, r: 2.2 };
      const d = Math.min(Math.hypot(e.pos.x - X.x, e.pos.z - X.z), Math.hypot((+m.x || 0) - X.x, (+m.z || 0) - X.z) + 1.5);
      if (d > X.r + 3) why = 'NOT IN THE EXTRACT RING';
    }
    if (R.roundOver) return;
    if (why) { lg('extract denied ' + why); try { netSendTo(NET.players.get(c.peer), { t: 'boxn', w: why }); } catch (err) {} return; }
    lg('extract by ' + e.name);
    R.endRound(SPY, 'SPIES EXTRACTED', e.name + ' extracted with the data');
  }

  /* ---------- host: BLACKOUT bot roster (the editor's team sizes, minus every human) ---------- */
  let trimAt = 0;
  function rosterTrim() {
    const now = performance.now(); if (now - trimAt < 1500) return; trimAt = now;
    const g = GM(), hum = [0, 0];
    for (const e of entities) if ((e.isPlayer || (e.isRemote && !e.remoteBot)) && !e.off && (e.team === MERC || e.team === SPY)) hum[e.team]++;
    for (const t of [MERC, SPY]) {
      const want = NET.cfg.bots ? Math.max(0, Math.round(t === SPY ? (g.spies != null ? g.spies : 2) : (g.mercs != null ? g.mercs : 2)) - hum[t]) : 0;
      let act = entities.filter((b) => b.netBot && !b.off && b.team === t);
      while (act.length > want) {
        const b = act.find((x) => !x.alive) || act[act.length - 1];
        try { netBotOff(b); } catch (e) {}
        b.off = true; act = act.filter((x) => x !== b); lg('roster: ' + b.name + ' off');
      }
    }
  }
  const _scr = R.spyCanReturn;
  R.spyCanReturn = function () {
    if (_scr && _scr()) return true;
    if (!isHost()) return false;
    remoteResp();
    return entities.some((e) => e.isRemote && !e.remoteBot && !e.off && e.team === SPY && !e.alive && e.boRespAt != null);
  };
  if (typeof netRebalanceBots === 'function') {
    const _rb = netRebalanceBots;
    netRebalanceBots = function () {
      if (bo() && NET.role === 'host' && MATCH.state !== 'menu' && R.active) { trimAt = 0; return rosterTrim(); }
      return _rb.apply(this, arguments);
    };
  }

  /* ---------- spy kit events (Riposte's numbered state events, sent several times) ---------- */
  const local = (e) => e && (e === PL.ent || e.netBot);
  A.netThrow = function (e, type, p, v, fuse) {
    if (!on() || !local(e)) return;
    const ev = { px: r2(p.x), py: r2(p.y), pz: r2(p.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z) };
    if (type === 'decoy') netEvent(Object.assign({ k: 'bodc' }, ev), e);
    else netEvent(Object.assign({ k: 'nade', fu: r2(fuse || 0), ty: type }, ev), e);
    cnt(N.sent, 'ev_' + type);
  };
  A.netLamp = function (shooter, L) {
    if (!on() || !local(shooter)) return;
    const i = A.lamps.indexOf(L); if (i < 0) return;
    netEvent({ k: 'bol', l: i }, shooter); cnt(N.sent, 'ev_lamp');
  };
  if (typeof netEventIn === 'function') {
    const _ei = netEventIn;
    netEventIn = function (e, ev) {
      if (ev && bo()) {
        if (ev.k === 'bol') { cnt(N.got, 'ev_lamp'); const L = A.lamps[ev.l | 0]; if (L && !L.broken) try { A.lampBreak(L); } catch (err) {} return; }
        if (ev.k === 'bodc') {
          cnt(N.got, 'ev_decoy');
          const p = new THREE.Vector3(numOr(ev.px), numOr(ev.py), numOr(ev.pz)), v = new THREE.Vector3(clamp(numOr(ev.vx), -40, 40), clamp(numOr(ev.vy), -40, 40), clamp(numOr(ev.vz), -40, 40));
          try { if (!NADE_MAT) nadeWarm(); spawnNade(e, p, v, 1.1, 'decoy'); } catch (err) {}
          return;
        }
        if (ev.k === 'nade') {
          cnt(N.got, 'ev_' + ev.ty);
          if (e.team === SPY && ev.ty === 'smoke') { const S = (BOCFG.v && BOCFG.v.spy) || {}; if (S.smokeLife) SMOKE.life = S.smokeLife; }
          if (e.team === SPY && e.model && e.model._boKay) { e.boThrowT = 0.4; try { boKayOneShot(e.model, 'Punch_Jab', 0.42, 0.05); } catch (err) {} }
        }
      }
      return _ei.apply(this, arguments);
    };
  }

  /* ---------- spy moves: roll, takedown, climb, stagger, hack kneel, cloak ---------- */
  function animOf(e) {
    const f = (e.boRollT > 0 ? 1 : 0) | (e.boTakedownT > 0 ? 2 : 0) | (e.boInteract ? 4 : 0) | (e.boStagT > 0 ? 8 : 0) | (e.boCloakOn ? 16 : 0) | (e.boClimb ? 32 : 0) | (e.boTorch ? 64 : 0);
    return [netIdOf(e), f, e.boAnim ? String(e.boAnim).slice(0, 24) : '', e.boAnimT != null ? Math.round(e.boAnimT * 100) : -1, Math.round((e.boArmsUp || 0) * 100)];
  }
  const lastA = new Map(); let aAt = 0;
  function animOut() {
    const now = performance.now(); if (now - aAt < 125) return; aAt = now;
    const l = [];
    for (const e of entities) {
      if (e.off || e.team !== SPY || !local(e)) continue;
      const a = animOf(e); if (!a[0]) continue;
      const s = a.join('|'), p = lastA.get(a[0]);
      if (s === (p && p.s) && now - p.at < 1000) continue;
      lastA.set(a[0], { s, at: now }); l.push(a);
    }
    if (!l.length) return;
    const m = { t: 'boa', l: l.slice(0, 12) };
    if (NET.role === 'host') bcast(m); else toHost(m);
  }
  function animIn(m, from) {
    cnt(N.got, 'boa');
    if (!Array.isArray(m.l)) return;
    for (const a of m.l.slice(0, 12)) {
      if (!Array.isArray(a) || typeof a[0] !== 'string') continue;
      const e = netEntity(a[0]); if (!e || !e.isRemote) continue;
      if (from && e.peer !== from && !(e.remoteBot)) continue; // a client speaks only for himself
      const f = a[1] | 0;
      if (f & 1) { if (!(e.boRollT > 0)) { e.boRollT = 0.6; e.boRollAt = MATCH.time; } } else e.boRollT = 0;
      if (f & 2) { if (!(e.boTakedownT > 0)) e.boTakedownT = 0.7; }
      e.boInteract = !!(f & 4);
      if ((f & 8) && !(e.boStagT > 0)) { e.boStagT = 0.4; try { if (e.model && e.model._boKay) boKayOneShot(e.model, 'Hit_Chest', 0.4, 0.05); } catch (err) {} }
      e.boCloakNet = (f & 16) ? 1 : 0;
      e.boClimb = (f & 32) ? (e.boClimb || { net: true }) : null;
      e.boTorch = !!(f & 64); // pass 19: the pistol light
      e.boAnim = typeof a[2] === 'string' && a[2] ? a[2] : null;
      e.boAnimT = typeof a[3] === 'number' && a[3] >= 0 ? a[3] / 100 : null;
      e.boArmsUp = typeof a[4] === 'number' ? Math.max(0, Math.min(1, a[4] / 100)) : 0;
    }
  }

  /* ---------- remote bodies: spies wear the UAL body on every screen ---------- */
  let bodAt = 0;
  function bodies() {
    const now = performance.now(); if (now - bodAt < 500) return; bodAt = now;
    for (const e of entities) {
      if (!e.isRemote || !e.model) continue;
      if (e.team === SPY) { if (!e.model._boWantKay) R.kaySpy(e); if (e.model.gun) e.model.gun.visible = false; }
      else if (e.model._boKay) R.unKay(e);
    }
  }
  /* ---------- client: tell the host when my spy waits to respawn ---------- */
  let rsLast = null;
  function respOut() {
    const w = PL.ent && !PL.ent.alive && PL.ent.boRespAt != null ? 1 : 0;
    if (w !== rsLast) { rsLast = w; toHost({ t: 'bors', w }); }
  }

  /* ---------- per frame ---------- */
  const _fr = frame;
  frame = function (now) {
    _fr(now);
    try {
      if (!on() || MATCH.state !== 'playing') { rsLast = null; return; }
      bodies(); animOut();
      if (NET.role === 'host') hostTick(); else respOut();
    } catch (err) { if (!N.err || N.err < 5) { N.err = (N.err || 0) + 1; console.warn('BO net', err); } }
  };

  /* ---------- messages ---------- */
  if (typeof netHostMsg === 'function') {
    const _hm = netHostMsg;
    netHostMsg = function (c, m) {
      if (m && NET.role === 'host' && typeof m.t === 'string' && m.t.startsWith('bo')) {
        const pl = NET.players.get(c.peer);
        if (pl && pl.conn === c) {
          if (m.t === 'boxt') { extractIn(c, m); return; }
          if (m.t === 'boa') { animIn(m, c.peer); try { netBroadcast(m, true, c.peer); } catch (err) {} return; }
          if (m.t === 'bors') { cnt(N.got, 'bors'); const e = NET.remotes.get(c.peer); if (e && !e.alive) e.boRespAt = m.w ? MATCH.time + Math.max(1, GM().respawnDelay || 5) + 4 : null; return; }
          if (m.t === 'bohk' && bo()) { cnt(N.got, 'bohk'); try { hackIn(c, m); } catch (err) { console.warn('BO hack in', err); } }
        }
      }
      return _hm.apply(this, arguments);
    };
  }
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) {
      if (m && m.t === 'bost') { stateIn(m); return; }
      if (m && m.t === 'boa') { animIn(m, null); return; }
      if (m && m.t === 'boxn') { cnt(N.got, 'boxn'); N.denied = String(m.w || '').slice(0, 60); lg('extract denied: ' + N.denied); try { hudMsg('EXTRACT REFUSED · ' + N.denied, 'enemy', 2); } catch (e) {} return; }
      return _cm.apply(this, arguments);
    };
  }
})();
