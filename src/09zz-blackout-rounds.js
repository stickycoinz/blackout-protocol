/* ==========================================================================
   BLACKOUT pass 12: real match settings, rounds, respawn and teammate spectating.
   - Match settings (Solo setup page and the online room) show BLACKOUT rules instead of Riposte's kill limit: round time, rounds to win,
     hacks, hack time, team sizes, bots, respawn (off = one life per round), respawn delay, spy lives, flashlight battery, and an
     Advanced link to the F10 editor (Gameplay tab). Values live in BOCFG.v.game (saved), the host sends them with the room state.
   - A match is several rounds: first team to game.roundsToWin. Between rounds a short banner, then everyone respawns for the next one.
     A kill limit never ends a BLACKOUT round.
   - Respawn on: players and bots come back after game.respawnDelay at their team's spawn; game.spyLives caps spy lives per round.
   - Dead: the usual death cam for game.specDelay seconds, then the camera follows a living teammate (never the other team).
     LMB / RMB, arrow keys or Space switch teammate. Spy teammates get an over the shoulder view, mercs a chase view.
   - Online: the host decides when a round ends ('bornd') and starts the next one ('bonext'); remote teammates are followed from
     their synced positions.
   ========================================================================== */
(function () {
  const R = window.BO_RULES; if (!R || !window.BOCFG) return;
  const MERC = 0, SPY = 1;
  const GM = () => Object.assign({}, BOCFG.defaults().game, (BOCFG.v && BOCFG.v.game) || {});
  const isBo = () => !!(R.on && R.on());
  const online = () => typeof MATCH !== 'undefined' && MATCH.online;
  const isClient = () => online() && typeof NET !== 'undefined' && NET.role === 'client';
  const isHost = () => online() && typeof NET !== 'undefined' && NET.role === 'host';
  const TNAME = { [MERC]: 'MERCS', [SPY]: 'SPIES' };
  const RS = R.rounds = { wins: [0, 0], n: 1, pending: false, nextAt: 0, matchDone: false, netFinal: false };
  const fmtMin = (s) => (s % 60 ? (Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')) : (s / 60) + ' min');
  const rtw = () => Math.max(1, Math.round(GM().roundsToWin));
  const css = (() => { let done = false; return () => {
    if (done) return; done = true;
    const st = document.createElement('style');
    st.textContent = '#boSpec{position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);z-index:46;display:none;min-width:300px;padding:10px 18px 12px;background:rgba(6,9,12,.78);border:1px solid rgba(255,255,255,.14);border-top:3px solid #7fd4ff;font:600 13px/1.35 system-ui,sans-serif;color:#e8eef2;text-align:center;letter-spacing:.04em;pointer-events:none}'
      + '#boSpec.merc{border-top-color:#ffb24a}#boSpec .k{font-size:11px;opacity:.7;letter-spacing:.2em}#boSpec .n{display:block;font-size:22px;letter-spacing:.08em;margin:2px 0}'
      + '#boSpec .hp{height:5px;background:rgba(255,255,255,.15);margin:6px 0 5px}#boSpec .hp i{display:block;height:100%;background:#7ee08a}'
      + '#boSpec .g{font-size:12px;opacity:.9}#boSpec .h{margin-top:7px;font-size:11px;opacity:.65;letter-spacing:.12em}#boSpec .r{margin-top:4px;font-size:12px;color:#ffd36b}'
      + '#boRound{position:fixed;left:50%;top:24vh;transform:translateX(-50%);z-index:47;display:none;padding:16px 34px;background:rgba(5,7,10,.82);border:1px solid rgba(255,255,255,.15);text-align:center;color:#eef3f6;font:700 15px/1.4 system-ui,sans-serif;letter-spacing:.12em;pointer-events:none}'
      + '#boRound b{display:block;font-size:34px;letter-spacing:.14em}#boRound .s{font-size:13px;opacity:.75;font-weight:600}#boRound .w{font-size:18px;margin-top:6px}#boRound.spy b{color:#7fd4ff}#boRound.merc b{color:#ffb24a}';
    document.head.appendChild(st);
  }; })();
  const el = (id) => { let e = document.getElementById(id); if (!e) { css(); e = document.createElement('div'); e.id = id; document.body.appendChild(e); } return e; };

  /* ---------- rounds ---------- */
  const winsTxt = () => 'MERCS ' + RS.wins[MERC] + ' - ' + RS.wins[SPY] + ' SPIES';
  R.limText = () => {
    const g = GM();
    return 'ROUND ' + RS.n + ' · FIRST TO ' + rtw() + ' · ' + RS.wins[MERC] + '-' + RS.wins[SPY] + ' · HACK ' + R.hackNeed + ' + EXTRACT · ' + (g.respawn ? 'RESPAWN ' + Math.round(g.respawnDelay) + 's' : '1 LIFE');
  };
  function banner(w, kicker, reason, final) {
    const b = el('boRound');
    b.className = w === SPY ? 'spy' : 'merc';
    b.innerHTML = '<span class="s">ROUND ' + RS.n + (kicker ? ' · ' + esc(kicker) : '') + '</span><b>' + TNAME[w] + ' WIN' + (final ? ' THE MATCH' : ' THE ROUND') + '</b>'
      + (reason ? '<span class="s">' + esc(reason) + '</span>' : '') + '<div class="w">' + winsTxt() + '</div>' + (final ? '' : '<span class="s" id="boRoundNext"></span>');
    b.style.display = final ? 'none' : 'block';
  }
  const hideBanner = () => { const b = document.getElementById('boRound'); if (b) b.style.display = 'none'; };
  function roundWon(w, kicker, reason) {
    RS.wins[w] = (RS.wins[w] || 0) + 1;
    const final = RS.wins[w] >= rtw();
    if (isHost()) { try { netBroadcast({ t: 'bornd', w, k: kicker, r: reason, wins: RS.wins.slice(), n: RS.n, f: final ? 1 : 0 }, true); } catch (err) {} }
    if (final) { RS.matchDone = true; return true; }
    RS.pending = true; RS.nextAt = MATCH.time + Math.max(2, GM().intermission);
    banner(w, kicker, reason, false);
    return false;
  }
  function nextRound() {
    RS.pending = false; RS.n++;
    hideBanner(); specOff();
    if (PL.ent && !PL.ent.alive) { try { R._respawnPlayer(); } catch (err) { console.warn('BO next round respawn', err); } }
    try { if (typeof KC !== 'undefined') { KC.pending = null; if (KC.active && typeof endKillcam === 'function') endKillcam(); } } catch (err) {}
    R.setup();
    if (isHost()) { try { netBroadcast({ t: 'bonext', n: RS.n }, true); } catch (err) {} }
    try { hudMsg('ROUND ' + RS.n + ' · ' + winsTxt(), 'big', 3); } catch (err) {}
  }
  const _sm = startMatch;
  startMatch = function () {
    RS.wins = [0, 0]; RS.n = 1; RS.pending = false; RS.matchDone = false; RS.netFinal = false; hideBanner(); specOff();
    return _sm.apply(this, arguments);
  };
  const _mf = matchFinish;
  matchFinish = function () {
    if (!isBo() || RS.matchDone || RS.netFinal || (MATCH.state !== 'playing' && MATCH.state !== 'paused')) return _mf.apply(this, arguments);
    if (isClient()) { MATCH.finSoon = false; return; } // the host decides
    if (!R.roundOver) {
      if (MATCH.timeLeft <= 0.05) { R.endRound(MERC, 'TIME UP', 'Mercs held the facility until the timer ran out'); return; }
      MATCH.finSoon = false; return; // a kill limit never ends a BLACKOUT round
    }
    if (RS.pending) return;
    if (roundWon(R.winner, R.kicker, R.reason)) return _mf.apply(this, arguments);
  };
  if (typeof matchOutcome === 'function') {
    const _mo = matchOutcome;
    matchOutcome = function () {
      const o = _mo.apply(this, arguments);
      try { if (isBo() && o && typeof o === 'object' && 'sub' in o) o.sub = (o.sub ? o.sub + ' · ' : '') + winsTxt(); } catch (err) {}
      return o;
    };
  }

  /* ---------- respawn (on) ---------- */
  const canReturn = (e, pre) => { const g = GM(); return !!g.respawn && (e.team !== SPY || !g.spyLives || (e.boDeaths || 0) + (pre ? 1 : 0) < g.spyLives); };
  // pass 16: a spy who died this very frame (his respawn not booked yet) counts too, so the last spy down never ends a respawn round
  R.spyCanReturn = () => entities.some((e) => !e.off && e.team === SPY && !e.alive && (e.boRespAt != null || (e._boWasAlive && !e.isRemote && (!isClient() || e.isPlayer) && canReturn(e, true))));
  function respawnEnt(e) {
    e.boRespAt = null;
    const l = R.spawnCount ? R.spawnCount(e.team) : 4, i = Math.floor(Math.random() * l);
    if (e.isPlayer) {
      try { if (typeof KC !== 'undefined' && KC.active && typeof endKillcam === 'function') endKillcam(); } catch (err) {}
      R._respawnPlayer();
      R.placeAt(e, e.team, i);
      if (e.team === MERC) {
        if (BOCFG.giveMercLoadout) { try { BOCFG.giveMercLoadout(); } catch (err) {} }
        if (e.model) e.model.root.visible = false; VM.root.visible = true; VM.holder.visible = true;
      } else {
        if (BOCFG.giveSpyLoadout) { try { BOCFG.giveSpyLoadout(); } catch (err) {} }
        VM.root.visible = false; VM.holder.visible = false; if (e.model) e.model.root.visible = true;
        if (typeof boEnsurePlayerKaykit === 'function') boEnsurePlayerKaykit();
      }
      specOff();
    } else {
      spawnEntity(e); e.bo = null; R.placeAt(e, e.team, i);
    }
    e.alive = true; e.health = Math.max(1, Math.round(GM().health || 100)); e.respawnT = Infinity; e.protT = 1.5; e.boRollT = 0; e.boInteract = false; e.boGad = e.boGadMax ? Object.assign({}, e.boGadMax) : null;
    if (e.team === SPY) { R.kaySpy(e); if (e.model && e.model.gun) e.model.gun.visible = false; } else R.unKay(e);
  }
  const _os = R.onSetup;
  R.onSetup = function () {
    for (const e of entities) { e.boDeaths = 0; e.boRespAt = null; e._boWasAlive = e.alive; }
    R.roundStartT = MATCH.time;
    specOff();
    if (_os) return _os.apply(this, arguments);
  };
  function respawnTick() {
    if (R.roundOver) return;
    for (const e of entities) {
      if (e.off || e.isRemote || (isClient() && !e.isPlayer)) { e._boWasAlive = e.alive; continue; }
      if (e._boWasAlive && !e.alive) { e.boDeaths = (e.boDeaths || 0) + 1; e.boRespAt = canReturn(e) ? MATCH.time + Math.max(1, GM().respawnDelay) : null; }
      e._boWasAlive = e.alive;
      if (!e.alive && e.boRespAt != null && MATCH.time >= e.boRespAt) { if (!GM().respawn) e.boRespAt = null; else { try { respawnEnt(e); } catch (err) { console.warn('BO respawn', err); e.boRespAt = null; } e._boWasAlive = e.alive; } }
    }
  }
  const deathTxt = () => { const g = GM(), on = PL.ent.boRespAt != null || canReturn(PL.ent, PL.ent._boWasAlive !== false); return on ? 'RESPAWN IN ' + Math.max(1, Math.round(g.respawnDelay)) + 's' : 'OUT FOR THIS ROUND · SPECTATING A TEAMMATE'; };
  if (typeof deathPrompt === 'function') {
    const _dp = deathPrompt;
    deathPrompt = function () {
      if (!isBo()) return _dp.apply(this, arguments);
      if (HUD.dMode === 'bo') return; HUD.dMode = 'bo';
      try { hudHtml($('death').querySelector('.skip'), esc(deathTxt())); } catch (err) {}
    };
  }
  const _sd = showDeathScreen;
  showDeathScreen = function () {
    const r = _sd.apply(this, arguments);
    try {
      if (isBo()) {
        const d = $('death'), g = GM(), bar = d.querySelector('.dbar'), on = canReturn(PL.ent, PL.ent._boWasAlive !== false);
        if (bar) bar.style.display = on ? '' : 'none';
        d.style.setProperty('--rs', Math.max(1, g.respawnDelay) + 's');
      }
    } catch (err) {}
    return r;
  };

  /* ---------- spectate teammates ---------- */
  const SPEC = window.BOSPEC = { on: false, tgt: null, cy: 0, pos: null, look: null, fov: 0 };
  function mates() {
    const me = PL.ent; if (!me) return [];
    return entities.filter((e) => e !== me && !e.off && e.alive && e.team === me.team && e.pos && e.model);
  }
  function specOff() {
    if (!SPEC.on && !SPEC.tgt) return;
    SPEC.on = false; SPEC.tgt = null;
    const h = document.getElementById('boSpec'); if (h) h.style.display = 'none';
  }
  function cycle(d) {
    const l = mates(); if (!l.length) return;
    let i = l.indexOf(SPEC.tgt); i = i < 0 ? 0 : (i + d + l.length) % l.length;
    SPEC.tgt = l[i]; SPEC.snap = true;
    try { sfxUi('tab'); } catch (err) {}
  }
  SPEC.cycle = cycle;
  const yawOf = (e) => (e.isPlayer ? PL.yaw : (e.lookYaw != null && isFinite(e.lookYaw) ? e.lookYaw : e.yaw || 0));
  function specCam(dt) {
    const t = SPEC.tgt, spy = t.team === SPY;
    if (!SPEC.pos) { SPEC.pos = new THREE.Vector3(); SPEC.look = new THREE.Vector3(); }
    const yaw = yawOf(t);
    if (SPEC.snap) SPEC.cy = yaw; else SPEC.cy += angDiff(SPEC.cy, yaw) * (1 - Math.exp(-5 * dt));
    const fx = -Math.sin(SPEC.cy), fz = -Math.cos(SPEC.cy), rx = Math.cos(SPEC.cy), rz = -Math.sin(SPEC.cy);
    const back = spy ? 2.3 : 2.8, side = spy ? 0.65 : 0.45, up = spy ? 1.85 : 2.05;
    const px = t.pos.x, py = t.pos.y + 1.45, pz = t.pos.z;
    let ix = px - fx * back + rx * side, iy = t.pos.y + up, iz = pz - fz * back + rz * side;
    let dx = ix - px, dy = iy - py, dz = iz - pz; const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    let dist = len;
    try { const h = rayWorld(px, py, pz, dx, dy, dz, len + 0.3); const hd = h && (h.t != null ? h.t : h.d != null ? h.d : h.dist); if (h && hd != null && hd < len + 0.3) dist = Math.max(0.35, hd - 0.3); } catch (err) {}
    ix = px + dx * dist; iy = py + dy * dist; iz = pz + dz * dist;
    const k = SPEC.snap ? 1 : 1 - Math.exp(-14 * dt);
    SPEC.pos.x += (ix - SPEC.pos.x) * k; SPEC.pos.y += (iy - SPEC.pos.y) * k; SPEC.pos.z += (iz - SPEC.pos.z) * k;
    const lx = px + fx * 14 + rx * side * 0.6, ly = t.pos.y + 1.35, lz = pz + fz * 14 + rz * side * 0.6;
    SPEC.look.set(lx, ly, lz); SPEC.snap = false;
    camera.position.copy(SPEC.pos); camera.lookAt(SPEC.look);
    const fov = spy ? 64 : 66;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); try { onResizeFx(); } catch (err) {} }
    if (t.model && t.model.root) t.model.root.visible = true;
  }
  function gadTxt(t) {
    if (t.team === SPY) {
      const G = t.boGad || (t.isPlayer && window.BO_SPY && BO_SPY.gad ? BO_SPY.gad(t) : null);
      if (G && typeof G === 'object') {
        const parts = Object.keys(G).filter((k) => typeof G[k] === 'number').map((k) => k.toUpperCase() + ' ' + G[k]);
        if (parts.length) return parts.join(' · ');
      }
      return 'SPY · ' + (t.boM9 ? 'M9' : 'UNARMED');
    }
    try { const a = t.arms, w = a && a.slots ? a.slots[a.cur] : null; if (w && w.def) return String(w.def.name || 'RIFLE').toUpperCase() + (w.mag != null ? ' · ' + w.mag + ' ROUNDS' : ''); } catch (err) {}
    return 'MERC';
  }
  function specHud() {
    const h = el('boSpec'), t = SPEC.tgt, l = mates(), me = PL.ent;
    h.className = t.team === SPY ? 'spy' : 'merc';
    const hp = Math.max(0, Math.round(t.health != null ? t.health : 100)), mx = Math.max(1, GM().health || 100);
    let r = '';
    if (me.boRespAt != null) r = 'RESPAWN IN ' + Math.max(0, Math.ceil(me.boRespAt - MATCH.time)) + 's';
    else r = 'OUT UNTIL NEXT ROUND';
    const html = '<span class="k">SPECTATING</span><span class="n">' + esc(t.name || 'TEAMMATE') + '</span>'
      + '<div class="hp"><i style="width:' + Math.min(100, hp / mx * 100).toFixed(0) + '%"></i></div>'
      + '<div class="g">HP ' + hp + ' · ' + esc(gadTxt(t)) + '</div><div class="r">' + r + '</div>'
      + '<div class="h">LMB / RMB · \u2190 \u2192 · SPACE  SWITCH TEAMMATE (' + (l.indexOf(t) + 1) + '/' + l.length + ')</div>';
    if (h._html !== html) { h.innerHTML = html; h._html = html; }
    h.style.display = 'block';
  }
  function specTick(dt) {
    if (!isBo() || MATCH.state !== 'playing' || !PL.ent || PL.ent.alive || (typeof KC !== 'undefined' && KC.active)) { specOff(); return; }
    const g = GM();
    if (PL.deathT < g.specDelay) { if (SPEC.on) specOff(); return; }
    const l = mates();
    if (!l.length) { specOff(); return; }
    if (!SPEC.tgt || l.indexOf(SPEC.tgt) < 0) {
      // closest teammate first
      let best = null, bd = Infinity; for (const e of l) { const d = e.pos.distanceToSquared(PL.ent.pos); if (d < bd) { bd = d; best = e; } }
      SPEC.tgt = best; SPEC.snap = true;
    }
    if (!SPEC.on) { SPEC.on = true; SPEC.snap = true; try { hideDeathScreen(); } catch (err) {} }
    specCam(dt);
    specHud();
  }
  const _udp = updateDeadPlayer;
  updateDeadPlayer = function (dt) {
    const r = _udp.apply(this, arguments);
    try { specTick(dt); } catch (err) { if (!SPEC.err) { SPEC.err = 1; console.warn('BO spectate', err); } }
    return r;
  };
  const _upf = updatePostFx;
  updatePostFx = function () {
    if (SPEC.on) { try { const U = FinalShader.uniforms; if (U.uDesat) U.uDesat.value = Math.min(U.uDesat.value, 0.1); if (U.uHurt) U.uHurt.value = 0; } catch (err) {} }
    return _upf.apply(this, arguments);
  };
  const specInput = () => SPEC.on && isBo() && PL.ent && !PL.ent.alive && MATCH.state === 'playing';
  addEventListener('keydown', (e) => {
    if (!specInput() || e.repeat) return;
    const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    let d = 0;
    if (e.code === 'ArrowRight' || e.code === 'Space' || e.code === 'KeyD') d = 1; else if (e.code === 'ArrowLeft' || e.code === 'KeyA') d = -1;
    if (!d) return;
    e.preventDefault(); e.stopImmediatePropagation(); cycle(d);
  }, true);
  addEventListener('mousedown', (e) => {
    if (!specInput() || (e.button !== 0 && e.button !== 2)) return;
    if (e.target && e.target.closest && e.target.closest('button, a, input, .lrow, #boEditor')) return;
    e.preventDefault(); e.stopImmediatePropagation(); cycle(e.button === 2 ? -1 : 1);
  }, true);

  /* ---------- per frame ---------- */
  const _fr = frame;
  frame = function (now) {
    _fr(now);
    try {
      if (!isBo()) { specOff(); hideBanner(); return; }
      if (MATCH.limit < 999) MATCH.limit = 999;
      if (MATCH.state === 'playing') respawnTick(); // pass 16: a client brings back its own player (the host is told, 'bors')
      if (RS.pending) {
        const left = RS.nextAt - MATCH.time, n = document.getElementById('boRoundNext');
        if (n) n.textContent = 'NEXT ROUND IN ' + Math.max(0, Math.ceil(left));
        MATCH.timeLeft = Math.max(0.1, left);
        if (left <= 0 && !isClient() && MATCH.state === 'playing') nextRound();
      }
      if (MATCH.state !== 'playing' && MATCH.state !== 'paused') hideBanner();
    } catch (err) { if (!RS.err || RS.err < 3) { RS.err = (RS.err || 0) + 1; console.warn('BO rounds', err); } }
  };

  /* ---------- online ---------- */
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) {
      if (m && m.t === 'bornd') {
        RS.wins = Array.isArray(m.wins) ? m.wins.slice(0, 2) : RS.wins; RS.n = m.n || RS.n;
        R.roundOver = true; R.winner = m.w; R.kicker = m.k || ''; R.reason = m.r || '';
        if (m.f) { RS.matchDone = true; return; }
        RS.pending = true; RS.nextAt = MATCH.time + 60; banner(m.w, m.k, m.r, false); return;
      }
      if (m && m.t === 'bonext') { RS.n = (m.n || RS.n + 1) - 1; nextRound(); return; }
      if (m && m.t === 'end') RS.netFinal = true;
      if (m && m.t === 'lobby' && m.bo && m.bo.game) {
        try {
          const v = JSON.parse(JSON.stringify(BOCFG.v)); v.game = Object.assign({}, v.game, m.bo.game);
          if (m.bo.fd != null) v.light = Object.assign({}, v.light, { flashDrain: m.bo.fd });
          if (!BOCFG.remote || JSON.stringify(v.game) !== JSON.stringify(BOCFG.v.game) || v.light.flashDrain !== BOCFG.v.light.flashDrain) BOCFG.replace(v, true);
        } catch (err) {}
      }
      return _cm.apply(this, arguments);
    };
  }
  if (typeof netLobbyMsg === 'function') {
    const _lm = netLobbyMsg;
    netLobbyMsg = function () {
      const m = _lm.apply(this, arguments);
      try { if (m && (NET.cfg.map === 'blackout')) m.bo = { game: BOCFG.v.game, fd: BOCFG.v.light && BOCFG.v.light.flashDrain }; } catch (err) {}
      return m;
    };
  }

  /* ---------- match settings (Solo setup page and the online room) ---------- */
  const menuMap = () => { try { return (typeof NET !== 'undefined' && NET.role && NET.role !== 'off' && NET.cfg) ? NET.cfg.map : Settings.map; } catch (err) { return ''; } };
  const boMenu = () => menuMap() === 'blackout';
  const seg = (key, label, list, cur, fmt, setter, dis, extra) => {
    const items = list.map((v) => (Array.isArray(v) ? v : [v, fmt(v)]));
    if (!items.some(([v]) => +v === +cur)) { items.push([cur, fmt(cur)]); items.sort((a, b) => a[0] - b[0]); }
    return Object.assign({ k: 'seg', full: true, key, label, items, get: () => cur, set: (v) => setter(+v), disabled: dis }, extra || {});
  };
  function boMatchRows(o) {
    const g = GM(), dis = !o.edit, diffs = DIFF.map((d, i) => [i, d.name]);
    const put = (k) => (v) => { BOCFG.set('game', k, v); if (o.online) { try { netLobbyChanged(); } catch (err) {} } };
    const rows = [];
    if (dis) rows.push({ k: 'note', text: o.note || 'Set by the host' });
    if (o.edit && o.mode !== 'tdm') setTimeout(() => { try { o.set('mode', 'tdm'); } catch (err) {} }, 0);
    rows.push(
      { k: 'info', label: 'Mode', value: 'BLACKOUT · Spies vs Mercs' },
      { k: 'note', cls: 'hint', text: 'Spies hack terminals, then reach the extraction. Mercs win by taking every spy down or by holding until the round timer runs out. Kill counts never end a round.' },
      seg('roundTime', 'Round time', [120, 180, 240, 300, 420, 600], Math.round(g.roundTime), fmtMin, put('roundTime'), dis),
      seg('roundsToWin', 'Rounds to win', [1, 2, 3, 4, 5], Math.round(g.roundsToWin), String, put('roundsToWin'), dis),
      seg('hacksNeeded', 'Hacks needed', [1, 2, 3], Math.round(g.hacksNeeded), String, put('hacksNeeded'), dis),
      seg('hackTime', 'Hack time', [3, 4.5, 6, 8, 12], g.hackTime, (v) => v + ' s', put('hackTime'), dis),
      seg('mercs', 'Mercs', [1, 2, 3, 4, 5, 6], Math.round(g.mercs), String, put('mercs'), dis),
      seg('spies', 'Spies', [1, 2, 3, 4, 5, 6], Math.round(g.spies), String, put('spies'), dis),
      { k: 'note', cls: 'hint', text: o.online ? 'Team sizes include players; bots fill the empty slots when bots are on.' : 'Team sizes include you; bots fill the rest.' },
      { k: 'seg', full: true, wide: o.online, key: 'bots', label: o.online ? 'Bots' : 'Bot difficulty', items: o.online ? [['off', 'None'], ...diffs] : diffs, get: () => (o.online && !o.bots ? 'off' : o.diff), set: (v) => o.set('bots', v), disabled: dis },
      seg('respawn', 'Respawn', [[0, 'Off · one life'], [1, 'On']], g.respawn ? 1 : 0, String, (v) => put('respawn')(!!v), dis, { wide: true }));
    if (g.respawn) rows.push(
      seg('respawnDelay', 'Respawn delay', [3, 5, 8, 10, 15, 20], Math.round(g.respawnDelay), (v) => v + ' s', put('respawnDelay'), dis),
      seg('spyLives', 'Spy lives per round', [[0, 'Unlimited'], 1, 2, 3, 5], Math.round(g.spyLives), String, put('spyLives'), dis, { wide: true }));
    else rows.push({ k: 'note', cls: 'hint', text: 'One life per round. When you die you watch a living teammate until the next round.' });
    const fd = BOCFG.v.light ? BOCFG.v.light.flashDrain : 0;
    rows.push(
      seg('flashDrain', 'Merc flashlight battery', [[0, 'Unlimited'], [1, 'Long'], [2.5, 'Medium'], [5, 'Short']], fd, (v) => v + ' %/s', (v) => { BOCFG.set('light', 'flashDrain', v); if (o.online) { try { netLobbyChanged(); } catch (err) {} } }, dis, { wide: true }),
      ...((window.BOADMIN && BOADMIN.can()) ? [{ k: 'link', key: 'boadv', label: 'Advanced settings', sub: 'Every gameplay value in the BLACKOUT editor (F10)', open: () => { try { BOEDITOR.setTab('game'); BOEDITOR.open(); } catch (err) {} }, disabled: dis }] : []));
    if (o.pubOk) rows.push({ k: 'seg', full: true, key: 'pub', label: 'Room', items: [[0, 'Private'], [1, 'Public']], get: () => (o.pub ? 1 : 0), set: (v) => o.set('pub', v), disabled: dis });
    return rows;
  }
  if (typeof matchRows === 'function') {
    const _mr = matchRows;
    matchRows = function (o) { return o && o.map === 'blackout' ? boMatchRows(o) : _mr.apply(this, arguments); };
  }
  if (typeof mapPreview === 'function') {
    const _mp = mapPreview;
    mapPreview = function (m, o) {
      if (!o || o.map !== 'blackout') return _mp.apply(this, arguments);
      const g = GM(), art = m.ok && MAP_ART[m.id];
      return (art ? `<img class="mapart" alt="" decoding="async" src="${art}">` : '<span class="mapart none"></span>')
        + `<div class="pv-t"><b>${esc(m.name)}</b><span class="pv-m">BLACKOUT · Spies vs Mercs</span><span class="pv-i">${esc('First to ' + rtw() + ' · ' + fmtMin(Math.round(g.roundTime)) + ' rounds · ' + Math.round(g.mercs) + ' v ' + Math.round(g.spies) + ' · ' + (g.respawn ? 'respawn ' + Math.round(g.respawnDelay) + ' s' : '1 life'))}</span></div>`;
    };
  }
  if (typeof soloStage === 'function') {
    const _ss = soloStage;
    soloStage = function () {
      if (Settings.map !== 'blackout') return _ss.apply(this, arguments);
      const g = GM(), me = lobbyMe([]), mine = (typeof BO !== 'undefined' && BO.role === 'spy') ? SPY : MERC;
      const N = { [MERC]: ['Hammer', 'Unit1', 'Unit2', 'Unit3', 'Unit4', 'Unit5'], [SPY]: ['Ghost', 'Shade1', 'Shade2', 'Shade3', 'Shade4', 'Shade5'] };
      const col = (t) => {
        const n = Math.round(t === MERC ? g.mercs : g.spies), rows = [];
        let j = 0; if (t === mine) { rows.push(me); j = 1; }
        for (let i = j; i < n; i++) rows.push({ k: 'player', key: 'b' + t + i, label: N[t][i % 6], bot: true });
        return { cls: t === mine ? 'ally' : 'enemy', head: TNAME[t], rows };
      };
      return { head: `<b>Players</b><span>${Math.round(g.mercs)} mercs vs ${Math.round(g.spies)} spies · first to ${rtw()}</span>`, cols: [col(MERC), col(SPY)] };
    };
  }
  if (typeof SOLO_PAGES === 'object' && SOLO_PAGES.solo) {
    const _sp = SOLO_PAGES.solo;
    SOLO_PAGES.solo = function () {
      const p = _sp.apply(this, arguments);
      if (Settings.map === 'blackout' && p) { p.rows = p.rows.filter((r) => r.key !== 'map'); p.title = 'Solo vs bots'; p.sub = 'BLACKOUT · Spies vs Mercs'; const s = p.rows.find((r) => r.key === 'setup'); if (s) s.label = 'Match settings'; }
      return p;
    };
  }
  if (typeof NET_PAGES === 'object' && NET_PAGES && NET_PAGES.lobby) {
    const _lp = NET_PAGES.lobby;
    NET_PAGES.lobby = function () {
      const p = _lp.apply(this, arguments);
      try { if (NET.cfg.map === 'blackout' && p) { p.sub = 'BLACKOUT · Spies vs Mercs'; const s = p.rows.find((r) => r.key === 'setup'); if (s) s.label = 'Match settings'; } } catch (err) {}
      return p;
    };
  }
  // Riposte mode labels say BLACKOUT when the menu map is the facility (loading screen, server list, pause)
  try {
    const T = MODES.tdm, base = { name: T.name, btn: T.btn, sub: T.sub, teams: T.teams, hint: T.hint, unit: T.unit, lim: T.lim };
    const BOL = { name: 'BLACKOUT · Spies vs Mercs', btn: 'BLACKOUT', sub: 'Spies vs Mercs', teams: 'Mercs against spies, bots fill the rest', hint: 'Spies hack terminals and extract; mercs eliminate them or hold out.', unit: 'rounds', lim: 'Rounds to win' };
    for (const k of Object.keys(base)) Object.defineProperty(T, k, { configurable: true, enumerable: true, get: () => (boMenu() ? BOL[k] : base[k]) });
  } catch (err) { console.warn('BO mode labels', err); }
  if (typeof pmSummary === 'function') {
    const _ps = pmSummary;
    pmSummary = function () {
      const r = _ps.apply(this, arguments);
      try { if (isBo()) { const s = document.querySelector('#pmSummary .ps-mt span'); if (s) s.textContent = 'BLACKOUT · Spies vs Mercs · round ' + RS.n + ' · first to ' + rtw() + ' · ' + winsTxt(); } } catch (err) {}
      return r;
    };
  }
  // PLAY screen: a Match settings card next to Solo vs bots
  if (typeof playRender === 'function' && typeof playPick === 'function') {
    const _pr = playRender, _pp = playPick;
    playRender = function () {
      const r = _pr.apply(this, arguments);
      try {
        const row = document.querySelector('#playGrid .play-card.solo'); const par = row && row.parentNode;
        if (par && !par.querySelector('[data-play="soloset"]')) {
          const g = GM();
          par.insertAdjacentHTML('beforeend', '<button class="play-card soloset" type="button" data-play="soloset"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.7a7 7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 0 0 1.7 1L11 21h4l.4-2.7a7 7 0 0 0 1.7-1l2.5 1 2-3.5ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg><b>MATCH SETTINGS</b><span>'
            + esc('First to ' + rtw() + ' · ' + fmtMin(Math.round(g.roundTime)) + ' rounds · ' + (g.respawn ? 'respawn on' : '1 life') + '. Rounds, respawn, teams, bots.') + '</span></button>');
        }
      } catch (err) {}
      return r;
    };
    playPick = function (k) {
      if (k === 'soloset') {
        try { sfxUi('click'); } catch (e) {}
        Settings.map = 'blackout';
        uiGo('solo'); setTimeout(() => { try { lmPush(LM.scr.solo, 'setup'); } catch (e) {} }, 30);
        return;
      }
      return _pp.apply(this, arguments);
    };
  }
})();
