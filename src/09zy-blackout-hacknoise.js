/* ==========================================================================
   BLACKOUT pass 11: a terminal being hacked makes noise.
   - Positional beeping at the terminal (WebAudio, procedural): faster and higher as the hack fills, a data chirp now and then,
     a two-tone alarm past 50 %. Heard up to game.hackNoiseM (35 m) with a distance falloff, game.hackNoiseVol scales it.
     It stops when the spy lets go; a finished hack plays a short alarm sting heard map-wide.
   - Merc players: "TERMINAL B UNDER ATTACK" banner, a red marker on the terminal and a pulsing ring on the minimap
     (game.hackAlert: hearing = only inside the noise range, always, off). The finished-hack alarm is map-wide.
   - Merc bots inside the noise range go check the terminal (path there, look at it); this replaces 09zo's fixed-range sound events.
   - Online: every peer sends the terminals it is hacking (t: 'bohk'), the host relays them, so remote mercs hear and see it too.
   ========================================================================== */
(function () {
  const R = window.BO_RULES; if (!R || !window.BOCFG) return;
  const MERC = 0, SPY = 1;
  R.hackNoiseOn = true;
  const GM = () => (BOCFG.v && BOCFG.v.game) || BOCFG.defaults().game;
  const on = () => { try { return typeof boIsBlackout === 'function' && boIsBlackout() && MATCH.state === 'playing'; } catch (e) { return false; } };
  const A = window.BOHACK = { net: {}, beeps: 0, stings: 0, lured: 0, log: [], st: {} };
  const log = (m) => { A.log.push((MATCH.time || 0).toFixed(1) + ' ' + m); if (A.log.length > 60) A.log.shift(); };
  const V = THREE.Vector3;
  const range = () => Math.max(1, +GM().hackNoiseM || 35) * ((typeof botDiff === 'function' && botDiff().hear) || 1); // pass 17: harder bots hear further
  const vol = () => Math.max(0, GM().hackNoiseVol != null ? +GM().hackNoiseVol : 1);
  const mode = () => GM().hackAlert || 'hearing';

  /* terminals being hacked right now: local (player or bot at the pedestal) or reported by a peer in the last 1.2 s */
  function active() {
    const out = [], now = performance.now();
    for (const t of R.terminals || []) {
      if (t.hacked) continue;
      const local = t.by && t.by.alive && t.by.boInteract && t.prog > 0;
      const n = A.net[t.id], remote = n && now - n.at < 1200 && !n.done;
      if (local || remote) out.push({ t, prog: local ? t.prog : n.prog, local });
    }
    return out;
  }
  R.hackActive = active;

  /* ---------- sound ---------- */
  const listen = () => (typeof camera !== 'undefined' && camera.position) || (PL.ent && PL.ent.pos);
  function att(p, mapWide, rm = 1) {
    const L = listen(); if (!L) return 0;
    const d = Math.hypot(p.x - L.x, p.z - L.z), r = range() * rm;
    if (mapWide) return Math.max(0.22, Math.pow(Math.max(0, 1 - d / (r * 3)), 1.2));
    if (d >= r) return 0;
    return Math.pow(1 - d / r, 1.6);
  }
  const tpos = (t) => new V(t.px, 1.3, t.pz);
  function beep(t, prog) {
    if (typeof AU === 'undefined' || !AU.ready || !AU.ctx) return;
    // pass 21: louder and heard further as the hack nears done (game.hackLoud scales it, 0 = flat as before)
    const ld = Math.max(0, GM().hackLoud != null ? +GM().hackLoud : 1), rm = 1 + 0.6 * ld * prog;
    const p = tpos(t), k = att(p, false, rm) * vol() * (1 + ld * (prog * 1.2 - 0.4)); if (k < 0.004) return;
    try {
      const o = auOut(p, 0.18, k, 0.001, 8), at = AU.ctx.currentTime + 0.01, f = 880 + 900 * prog;
      tn(o, at, 0.07, f, f, 'square', 0.16);
      if (prog > 0.5) tn(o, at + 0.09, 0.07, f * 1.335, f * 1.335, 'square', 0.13); // two-tone alarm in the second half
      if (Math.random() < 0.35) nz(o, at + 0.03, 0.05, 'bandpass', 2600 + 2400 * Math.random(), 6500, 6, 0.12); // data chirp
      A.beeps++;
    } catch (err) {}
  }
  function sting(t) {
    if (typeof AU === 'undefined' || !AU.ready || !AU.ctx) return;
    const p = tpos(t), k = att(p, true) * vol(); if (k < 0.004) return;
    try {
      const o = auOut(p, 0.45, k, 0.001, 8), at = AU.ctx.currentTime + 0.01;
      for (let i = 0; i < 3; i++) { tn(o, at + i * 0.16, 0.14, 1500 - i * 260, 1350 - i * 260, 'square', 0.22); tn(o, at + i * 0.16, 0.14, 750 - i * 130, 700 - i * 130, 'sawtooth', 0.12); }
      tn(o, at + 0.5, 0.55, 520, 300, 'sawtooth', 0.18);
      A.stings++;
    } catch (err) {}
  }

  /* ---------- merc bots: hear it, go look ---------- */
  function lure(t, prog) {
    const r = range(), p = new V(t.x, 0, t.z);
    for (const m of entities) {
      if (m.off || !m.alive || m.isPlayer || m.isRemote || m.team !== MERC) continue;
      const d = Math.hypot(m.pos.x - t.px, m.pos.z - t.pz);
      if (d > r) continue;
      if (m.target && m.visible) continue; // in a firefight: stays on it
      const j = 1.5 * (1 - prog); // the louder (fuller) it gets, the better the guess
      const g = new V(t.x + (Math.random() - 0.5) * j, m.pos.y, t.z + (Math.random() - 0.5) * j);
      if (m.lastKnown) { m.lastKnown.copy(g); m.lastSeenT = MATCH.time - 1.5; }
      try { botLookAt(m, g, MATCH.time, 1.2); } catch (err) {}
      if (!(m.boInv && m.boInv.id === t.id && MATCH.time - m.boInv.at < 3)) { try { setPath(m, p); } catch (err) {} m.forceDecide = true; }
      if (!m.boInv || m.boInv.id !== t.id) { A.lured++; log('investigate ' + m.name + ' > ' + t.id + ' ' + d.toFixed(1) + ' m'); }
      m.boInv = { id: t.id, at: MATCH.time, d };
    }
  }

  /* ---------- merc HUD ---------- */
  let alertEl = null;
  function alertBuild() {
    if (alertEl || !R.hud || !R.hud.el) return alertEl;
    const css = document.createElement('style');
    css.textContent = '#boHud .bo-halert{position:absolute;left:50%;top:96px;transform:translateX(-50%);font-weight:800;font-size:14px;letter-spacing:.16em;text-transform:uppercase;padding:6px 14px;color:#ff6b5a;background:rgba(40,6,6,.72);border:1px solid rgba(255,90,80,.6);white-space:nowrap;display:none;animation:boHa 0.9s steps(2) infinite}'
      + '#boHud .bo-halert i{font-style:normal;font-weight:600;opacity:.8;margin-left:10px;letter-spacing:.08em}'
      + '#boHud .bo-halert.done{color:#ffd166;border-color:rgba(255,209,102,.7);background:rgba(40,28,4,.75);animation:none}'
      + '@keyframes boHa{0%{opacity:1}50%{opacity:.55}}';
    document.head.appendChild(css);
    alertEl = document.createElement('div'); alertEl.className = 'bo-halert';
    R.hud.el.appendChild(alertEl);
    return alertEl;
  }
  A.doneUntil = 0; A.doneTxt = '';
  function hudTick(list) {
    const el = alertBuild(); if (!el) return;
    const me = PL.ent, merc = me && me.team === MERC && me.alive, md = mode(), r = range();
    let txt = '', cls = '';
    const seen = [];
    if (merc && md !== 'off') {
      for (const a of list) {
        const d = Math.hypot(me.pos.x - a.t.px, me.pos.z - a.t.pz);
        if (md === 'always' || d <= r) seen.push({ a, d });
      }
    }
    A.st.seen = seen.map((s) => s.a.t.id);
    for (const t of R.terminals || []) { const k = 'ha' + t.id; if (R.hud.mk[k] && !seen.some((s) => s.a.t === t)) R.hud.mk[k].style.display = 'none'; }
    for (const s of seen) R.marker('ha' + s.a.t.id, 'p', 'UNDER ATTACK', Math.round(s.a.prog * 100) + '% · ' + Math.round(s.d) + ' m', s.a.t.px, 2.7, s.a.t.pz);
    if (seen.length) { seen.sort((x, y) => x.d - y.d); const s = seen[0]; txt = 'TERMINAL ' + s.a.t.id + ' UNDER ATTACK<i>' + Math.round(s.a.prog * 100) + '% · ' + Math.round(s.d) + ' m</i>'; }
    else if (me && me.team === MERC && performance.now() < A.doneUntil) { txt = A.doneTxt; cls = 'done'; }
    A.mm = seen.map((s) => s.a.t);
    el.style.display = txt ? 'block' : 'none';
    if (el._h !== txt + cls) { el.innerHTML = txt; el.className = 'bo-halert' + (cls ? ' ' + cls : ''); el._h = txt + cls; }
  }
  // minimap: a pulsing red ring at a terminal under attack (world space, inside drawMinimap's transform)
  if (typeof domMinimap === 'function') {
    const _dm = domMinimap;
    domMinimap = function (g, scale, yaw) {
      const r = _dm.apply(this, arguments);
      try {
        if (on() && A.mm && A.mm.length) {
          const ph = (performance.now() / 700) % 1;
          for (const t of A.mm) {
            g.strokeStyle = 'rgba(255,80,70,' + (0.9 * (1 - ph)).toFixed(3) + ')'; g.lineWidth = 2;
            g.beginPath(); g.arc(t.px * scale, t.pz * scale, 4 + ph * 14, 0, Math.PI * 2); g.stroke();
            g.fillStyle = '#ff5046'; g.beginPath(); g.arc(t.px * scale, t.pz * scale, 3.5, 0, Math.PI * 2); g.fill();
          }
        }
      } catch (err) {}
      return r;
    };
  }

  /* ---------- finished hack: sting map-wide, every merc gets told ---------- */
  function doneFx(t) {
    sting(t);
    A.doneTxt = 'TERMINAL ' + t.id + ' HACKED<i>ALARM</i>'; A.doneUntil = performance.now() + 3500;
    log('done ' + t.id);
  }
  const _ah = R.alarmHack;
  R.alarmHack = function (t, who) {
    const r = _ah ? _ah.apply(this, arguments) : undefined;
    try { doneFx(t); netOut(t, 1, true); } catch (err) {}
    return r;
  };

  /* ---------- online ---------- */
  const online = () => typeof NET !== 'undefined' && (NET.role === 'host' || NET.role === 'client') && MATCH.online;
  function netOut(t, prog, done) {
    if (!online()) return;
    const m = { t: 'bohk', l: [[t.id, Math.round(prog * 100) / 100, done ? 1 : 0]] };
    try { if (NET.role === 'host') netBroadcast(m, true); else netSend(m); } catch (err) {}
  }
  function netIn(m) {
    if (!m || !Array.isArray(m.l)) return;
    for (const x of m.l) {
      if (!Array.isArray(x)) continue;
      const id = String(x[0]).slice(0, 4), t = (R.terminals || []).find((q) => q.id === id); if (!t) continue;
      const prev = A.net[id];
      A.net[id] = { prog: Math.max(0, Math.min(1, +x[1] || 0)), at: performance.now(), done: !!x[2] };
      if (x[2] && !(prev && prev.done) && !t.hacked) doneFx(t);
    }
  }
  if (typeof netHostMsg === 'function') {
    const _hm = netHostMsg;
    netHostMsg = function (c, m) {
      if (m && m.t === 'bohk' && NET.role === 'host') { netIn(m); try { netBroadcast(m, true, c.peer); } catch (err) {} return; }
      return _hm.apply(this, arguments);
    };
  }
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) { if (m && m.t === 'bohk') { netIn(m); return; } return _cm.apply(this, arguments); };
  }

  /* ---------- per frame ---------- */
  let netT = 0;
  function tick(dt) {
    if (!on()) { if (alertEl) alertEl.style.display = 'none'; A.mm = null; return; }
    const list = active();
    for (const a of list) {
      const S = A.st[a.t.id] || (A.st[a.t.id] = { beepT: 0, lureT: 0 });
      S.beepT -= dt;
      if (S.beepT <= 0) { S.beepT = lerp(0.75, 0.16, a.prog); beep(a.t, a.prog); }
      S.lureT -= dt;
      if (S.lureT <= 0) { S.lureT = 1; lure(a.t, a.prog); }
    }
    for (const id in A.st) if (A.st[id] && A.st[id].beepT != null && !list.some((a) => a.t.id === id)) A.st[id].beepT = 0; // next hack beeps at once
    netT -= dt;
    if (netT <= 0 && online()) { netT = 0.4; for (const a of list) if (a.local) netOut(a.t, a.prog, false); }
    hudTick(list);
  }
  A.tick = tick;
  const _frame = frame;
  let last = null;
  frame = function (now) {
    _frame(now);
    try { const dt = Math.min(0.05, (last != null ? now - last : 16) / 1000); last = now; tick(dt); }
    catch (err) { if (!A._errN || A._errN < 5) { A._errN = (A._errN || 0) + 1; console.warn('BLACKOUT hack noise', err); } }
  };
})();
