/* ==========================================================================
   BLACKOUT pass 21: hacking tension.
   - Hold to hack (the hack key). Moving faster than game.hackMoveTol, shooting or taking a hit pauses the hack for a moment;
     the progress is kept (no cooldown unless game.hackDecay is set) and it never goes back below a locked checkpoint.
   - Checkpoints (game.hackChecks): at each one the hack stops and a needle sweeps across a dial. Tap the hack key (or fire) while the
     needle is in the green zone to lock the checkpoint in. A miss (wrong moment or too slow) sounds a loud alarm heard map wide,
     exposes the spy's exact position to the mercs for game.hackRevealT seconds and costs game.hackMissLoss progress, never below the
     last locked checkpoint. Spy bots play it too (game.botCrack success chance).
   - While a terminal is being hacked its beacon flashes faster and its beeps get louder as it nears done (09zy), and every
     game.hackPingT seconds the mercs get a rough area ping (a circle around a point near the spy, not the spot) on the HUD and the
     minimap; merc bots are sent to search it.
   - Round timer pressure: no hack progress for game.drainIdle seconds makes the round timer drain game.drainMul times faster.
     When it runs out the mercs win (09zz).
   - Online, the host owns locks, penalties, alarms, pings, reveals and the timer: 'bo2s' (host state, about 4 per second),
     'bo2x' (host event: alarm), 'bo2q' (client: checkpoint locked / needle missed). Every message stays far under 4 KB.
   ========================================================================== */
(function () {
  const R = window.BO_RULES; if (!R || !window.BOCFG) return;
  const MERC = 0, SPY = 1, V = THREE.Vector3;
  const GM = () => Object.assign({}, BOCFG.defaults().game, (BOCFG.v && BOCFG.v.game) || {});
  const T = window.BOTENSE = { pings: [], reveals: [], idle: 0, mul: 1, mg: null, log: [], misses: 0, locks: 0, alarms: 0, pingN: 0, sent: {}, got: {} };
  const lg = (s) => { T.log.push(((MATCH && MATCH.time) || 0).toFixed(1) + ' ' + s); if (T.log.length > 80) T.log.shift(); };
  const bo = () => { try { return typeof boIsBlackout === 'function' && !!boIsBlackout(); } catch (e) { return false; } };
  const playing = () => bo() && MATCH.state === 'playing';
  const online = () => typeof NET !== 'undefined' && MATCH.online && NET.on && (NET.role === 'host' || NET.role === 'client');
  const isCl = () => online() && NET.role === 'client';
  const auth = () => !isCl(); // the host, or a solo game
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  const cnt = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const bcast = (m) => { cnt(T.sent, m.t); try { netBroadcast(m, true); } catch (e) {} };
  const toHost = (m) => { cnt(T.sent, m.t); try { netSend(m); } catch (e) {} };
  const nid = (e) => { try { return netIdOf(e) || ''; } catch (err) { return ''; } };
  const hyp = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const K = (id) => (window.BOKEYS ? BOKEYS.K(id) : ({ hack: 'E', fire: 'LMB' })[id] || id);

  /* ---------- checkpoints ---------- */
  function cps() { const n = Math.max(0, Math.round(GM().hackChecks)); const l = []; for (let i = 1; i <= n; i++) l.push(i / (n + 1)); return l; }
  function nextCp(t) { for (const c of cps()) if (c > (t.lock || 0) + 1e-4) return c; return null; }
  function cpIndex(c) { const l = cps(); return Math.max(0, l.findIndex((x) => Math.abs(x - c) < 1e-3)); }

  /* ---------- what pauses a hack: a move, a shot, a hit ---------- */
  const _fireRay = fireRay;
  fireRay = function (shooter) { if (shooter) shooter.boShotAt = MATCH.time; return _fireRay.apply(this, arguments); };
  function hitTrack() {
    for (const e of entities) {
      if (e.off) continue;
      if (e.alive && e._boHp != null && e.health < e._boHp - 0.01) e.boHitAt = MATCH.time;
      e._boHp = e.alive ? e.health : null;
    }
  }
  function pauseWhy(e) {
    const g = GM(), now = MATCH.time;
    if ((e.boHitAt || -99) > now - g.hackHitPause) return 'HIT';
    if ((e.boShotAt || -99) > now - g.hackHitPause) return 'SHOT FIRED';
    if (g.hackMoveTol > 0 && Math.hypot(e.vel.x, e.vel.z) > g.hackMoveTol) return 'MOVING';
    return '';
  }

  /* ---------- the hack step (called by 09zo for the player and for spy bots) ---------- */
  R.hackStep = function (e, t, k) {
    if (!t || t.hacked) return null;
    const pct = Math.floor(t.prog * 100) + '%';
    const why = pauseWhy(e);
    e.boHackPause = why;
    if (why) return { prompt: 'HACK PAUSED · ' + why + ' · ' + pct };
    if (e.isPlayer && T.mg && T.mg.t === t) return { prompt: 'CHECKPOINT · STOP THE NEEDLE IN THE GREEN' };
    if (!e.isPlayer && e.boMg) return { prompt: '' };
    const c = nextCp(t);
    let p = t.prog + k;
    if (c != null && p >= c - 1e-4) {
      t.prog = Math.max(t.prog, c);
      if (e.isPlayer) mgStart(e, t, c);
      else if (k > 0) e.boMg = { t, c, at: MATCH.time + rand(0.7, 1.6) };
      return { prompt: 'CHECKPOINT · STOP THE NEEDLE IN THE GREEN' };
    }
    t.prog = Math.min(1, Math.max(t.prog, p));
    return { prompt: 'HACKING TERMINAL ' + t.id + '… ' + Math.floor(t.prog * 100) + '%' };
  };

  /* ---------- the needle game (player) ---------- */
  function mgStart(e, t, c) {
    if (T.mg && T.mg.t === t) return;
    const g = GM(), i = cpIndex(c);
    const w = Math.max(0.04, g.hackZone * Math.pow(0.85, i));
    const z0 = rand(0.12, 0.88 - w);
    T.mg = { t, c, i, z0, z1: z0 + w, ph: Math.random() * 2, sp: g.hackNeedle * (1 + 0.2 * i), t0: MATCH.time, end: MATCH.time + g.hackMgTime, flash: 0, res: '' };
    mgSound('start');
    lg('needle ' + t.id + ' cp ' + c.toFixed(2));
  }
  const needle = (ph) => { const x = ph % 2; return x < 1 ? x : 2 - x; };
  function mgStop() {
    const M = T.mg; if (!M || M.res) return;
    const x = needle(M.ph);
    if (x >= M.z0 && x <= M.z1) mgWin(M); else mgMiss(M, 'MISSED');
  }
  function mgWin(M) {
    M.res = 'ok'; M.resAt = performance.now();
    lockIn(M.t, M.c, PL.ent);
    mgSound('ok');
    setTimeout(() => { if (T.mg === M) T.mg = null; }, 350);
  }
  function mgMiss(M, why) {
    M.res = 'miss'; M.resAt = performance.now();
    lg('needle miss ' + M.t.id + ' ' + why);
    miss(M.t, PL.ent);
    setTimeout(() => { if (T.mg === M) T.mg = null; }, 600);
  }
  function mgTick(dt) {
    const M = T.mg; if (!M) return;
    const e = PL.ent;
    if (!playing() || !e || !e.alive || e.team !== SPY || M.t.hacked) { T.mg = null; return; }
    const d = Math.min(hyp(e.pos.x, e.pos.z, M.t.x, M.t.z), hyp(e.pos.x, e.pos.z, M.t.px, M.t.pz));
    if (d > 2.4) { T.mg = null; lg('needle left'); return; } // walked away: no penalty, it starts again at the terminal
    if (M.res) return;
    M.ph += dt * M.sp * 2;
    if (MATCH.time > M.end) mgMiss(M, 'TOO SLOW');
  }
  // input: a fresh press of the hack key, or the fire key / button (a click then never fires the M9)
  const MB = ['LMB', 'MMB', 'RMB', 'Mouse4', 'Mouse5'];
  const keyOf = (id) => (window.BOKEYS ? BOKEYS.code(id) : ({ hack: 'KeyE', fire: 'LMB' })[id]);
  addEventListener('keydown', (ev) => {
    if (!T.mg || T.mg.res || ev.repeat) return;
    if (typeof CHAT !== 'undefined' && CHAT.open) return;
    if (ev.code === keyOf('hack') || ev.code === keyOf('fire')) mgStop();
  }, true);
  addEventListener('mousedown', (ev) => {
    if (!T.mg || T.mg.res) return;
    const c = MB[ev.button]; if (!c) return;
    if (c === keyOf('fire') || c === keyOf('hack')) { ev.preventDefault(); ev.stopImmediatePropagation(); mgStop(); }
  }, true);
  // spy bots: a moment to aim, then a hit or a miss
  function botMgTick() {
    for (const b of entities) {
      const M = b.boMg; if (!M) continue;
      if (b.off || !b.alive || !b.boInteract || M.t.hacked || b.isRemote) { b.boMg = null; continue; }
      if (MATCH.time < M.at) continue;
      b.boMg = null;
      if (Math.random() < GM().botCrack) lockIn(M.t, M.c, b); else { lg('bot miss ' + b.name + ' ' + M.t.id); miss(M.t, b); }
    }
  }

  /* ---------- lock, miss, alarm (the host decides) ---------- */
  function lockIn(t, c, who) {
    t.lock = Math.max(t.lock || 0, c); t.prog = Math.max(t.prog, c); T.locks++;
    lg('lock ' + t.id + ' ' + c.toFixed(2) + ' ' + (who ? who.name : ''));
    if (who && who.isPlayer) { try { hudMsg('CHECKPOINT LOCKED · ' + Math.round(c * 100) + '%', 'xp', 1.5); } catch (e) {} }
    if (isCl() && who === PL.ent) toHost({ t: 'bo2q', k: 'lk', id: t.id, c: r2(c) });
  }
  function penalty(t) { const g = GM(); t.prog = Math.max(t.lock || 0, t.prog - g.hackMissLoss); }
  function miss(t, who) {
    T.misses++;
    if (isCl()) { penalty(t); toHost({ t: 'bo2q', k: 'ms', id: t.id }); alarmFx(t, who, true); return; }
    penalty(t);
    alarm(t, who);
  }
  function alarm(t, who) {
    T.alarms++;
    const g = GM();
    if (who && g.hackRevealT > 0) addReveal(who, g.hackRevealT);
    if (online()) bcast({ t: 'bo2x', k: 'al', id: t.id, w: nid(who) });
    alarmFx(t, who, false);
    // merc bots: straight to the spy
    if (who) for (const m of entities) {
      if (m.off || !m.alive || m.isPlayer || m.isRemote || m.team !== MERC) continue;
      sendBot(m, who.pos, 0.5, true);
    }
    lastHost = 0;
  }
  function alarmFx(t, who, self) {
    siren(t);
    beaconAlarm(t);
    const me = PL.ent;
    try {
      if (me && me.team === MERC) hudMsg('ALARM · TERMINAL ' + t.id + ' · SPY EXPOSED', 'enemy', 3);
      else if (me && who === me) hudMsg('NEEDLE MISSED · ALARM · YOU ARE EXPOSED', 'enemy', 2.5);
      else if (me) hudMsg('ALARM AT TERMINAL ' + t.id, 'enemy', 2);
    } catch (e) {}
    if (self) lg('alarm (asked host) ' + t.id);
  }
  function addReveal(e, sec) {
    const until = MATCH.time + sec, r = T.reveals.find((x) => x.e === e);
    if (r) r.until = Math.max(r.until, until); else T.reveals.push({ e, until });
  }

  /* ---------- merc bots: go and look ---------- */
  function sendBot(m, p, jit, force) {
    if (!force && m.target && m.visible) return;
    const g = new V(p.x + (Math.random() - 0.5) * jit, m.pos.y, p.z + (Math.random() - 0.5) * jit);
    if (m.lastKnown) { m.lastKnown.copy(g); m.lastSeenT = MATCH.time - 1; }
    try { botLookAt(m, g, MATCH.time, 1.5); } catch (e) {}
    try { setPath(m, g); } catch (e) {}
    m.forceDecide = true;
    if (R.onBotAlert) { try { R.onBotAlert(m, g, force); } catch (e) {} } // pass 22: a merc bot may throw a flare there
  }
  R.sendBot = sendBot;

  /* ---------- area pings while a terminal is being hacked (host) ---------- */
  const pingAt = {};
  function pingTick(dt) {
    const g = GM(), list = R.hackActive ? R.hackActive() : [];
    for (const a of list) {
      const id = a.t.id;
      if (pingAt[id] == null) pingAt[id] = MATCH.time + Math.min(2, g.hackPingT * 0.3);
      if (MATCH.time < pingAt[id]) continue;
      pingAt[id] = MATCH.time + g.hackPingT;
      // a point near the spy (or the terminal), the circle covers him but is not centred on him
      const who = a.t.by && a.t.by.alive ? a.t.by : null, sx = who ? who.pos.x : a.t.x, sz = who ? who.pos.z : a.t.z;
      const r = g.hackPingR, ang = Math.random() * Math.PI * 2, off = Math.random() * r * 0.7;
      addPing(sx + Math.cos(ang) * off, sz + Math.sin(ang) * off, r, g.hackPingLife, 'h');
      // merc bots: the closest two search the area
      const bots = entities.filter((m) => !m.off && m.alive && !m.isPlayer && !m.isRemote && m.team === MERC).sort((x, y) => hyp(x.pos.x, x.pos.z, sx, sz) - hyp(y.pos.x, y.pos.z, sx, sz));
      for (const m of bots.slice(0, 2)) sendBot(m, { x: sx + Math.cos(ang) * off, z: sz + Math.sin(ang) * off }, r, false);
    }
    for (const id in pingAt) if (!list.some((a) => a.t.id === id)) delete pingAt[id];
  }
  function addPing(x, z, r, life, k) {
    T.pingN++;
    T.pings.push({ x, z, r, until: MATCH.time + life, k: k || 'h', n: T.pingN });
    if (T.pings.length > 12) T.pings.shift();
    lastHost = 0;
    const me = PL.ent;
    if (me && me.team === MERC && me.alive) pingSound();
  }
  R.addPing = addPing; R.addReveal = addReveal;

  /* ---------- round timer pressure (host) ---------- */
  let lastSum = -1;
  function drainTick(dt) {
    const g = GM();
    const sum = R.terminals.reduce((a, t) => a + (t.hacked ? 1 : t.prog), 0);
    const hold = (typeof playHold === 'function' && playHold()) || R.roundOver || (R.rounds && R.rounds.pending);
    if (lastSum < 0 || sum > lastSum + 1e-4) T.idle = 0; else if (!hold) T.idle += dt;
    lastSum = sum;
    T.mul = T.idle > g.drainIdle ? Math.max(1, g.drainMul) : 1;
    if (T.mul > 1 && !hold && MATCH.timeLeft > 0) MATCH.timeLeft = Math.max(0, MATCH.timeLeft - dt * (T.mul - 1));
  }

  /* ---------- host state out, client state in ---------- */
  let lastHost = 0, lastSig = '';
  function stateOut() {
    const now = performance.now();
    const m = {
      t: 'bo2s', k: R.terminals.map((t) => [t.id, r2(t.lock || 0)]), i: Math.round(T.idle), m: r1(T.mul),
      p: T.pings.filter((p) => p.until > MATCH.time).map((p) => [r1(p.x), r1(p.z), r1(p.r), r1(p.until - MATCH.time), p.k, p.n]),
      r: T.reveals.filter((r) => r.until > MATCH.time).map((r) => [nid(r.e), r1(r.until - MATCH.time)]).filter((x) => x[0]),
    };
    const sig = JSON.stringify([m.k, m.m, m.p.map((p) => p[5]), m.r.map((r) => r[0])]);
    if (sig !== lastSig || now - lastHost > 1000) { lastSig = sig; lastHost = now; bcast(m); }
  }
  function stateIn(m) {
    cnt(T.got, 'bo2s');
    if (!playing()) return;
    if (Array.isArray(m.k)) for (const x of m.k.slice(0, 16)) { const t = R.terminals.find((q) => q.id === String(x[0])); if (t) t.lock = Math.max(0, Math.min(1, +x[1] || 0)); }
    T.idle = +m.i || 0; T.mul = Math.max(1, +m.m || 1);
    if (Array.isArray(m.p)) {
      const had = new Set(T.pings.map((p) => p.n));
      T.pings = m.p.slice(0, 12).filter(Array.isArray).map((p) => ({ x: +p[0] || 0, z: +p[1] || 0, r: Math.max(1, Math.min(60, +p[2] || 5)), until: MATCH.time + Math.max(0, Math.min(30, +p[3] || 0)), k: String(p[4] || 'h').slice(0, 2), n: p[5] | 0 }));
      const me = PL.ent;
      if (me && me.team === MERC && me.alive && T.pings.some((p) => !had.has(p.n))) pingSound();
    }
    if (Array.isArray(m.r)) {
      T.reveals = [];
      for (const x of m.r.slice(0, 12)) { if (!Array.isArray(x)) continue; const e = netEntity(String(x[0])); if (e) T.reveals.push({ e, until: MATCH.time + Math.max(0, Math.min(30, +x[1] || 0)) }); }
    }
  }
  function eventIn(m) {
    cnt(T.got, 'bo2x');
    if (!playing()) return;
    if (m.k === 'al') {
      const t = R.terminals.find((q) => q.id === String(m.id)); if (!t) return;
      const who = m.w ? netEntity(String(m.w)) : null;
      if (who === PL.ent) return; // my own miss: already played here
      alarmFx(t, who, false);
    }
  }
  function hostIn(c, m) {
    cnt(T.got, 'bo2q');
    if (!playing()) return;
    const who = NET.remotes.get(c.peer) || null;
    const t = R.terminals.find((q) => q.id === String(m.id)); if (!t || t.hacked) return;
    if (!who || !who.alive || who.team !== SPY) return;
    if (m.k === 'lk') {
      const c0 = +m.c, ok = cps().find((x) => Math.abs(x - c0) < 0.01);
      if (ok != null) { t.lock = Math.max(t.lock || 0, ok); t.prog = Math.max(t.prog, ok); lg('client lock ' + t.id + ' ' + ok.toFixed(2)); lastHost = 0; }
    } else if (m.k === 'ms') { penalty(t); lg('client miss ' + t.id); alarm(t, who); }
  }
  if (typeof netHostMsg === 'function') {
    const _hm = netHostMsg;
    netHostMsg = function (c, m) {
      if (m && m.t === 'bo2q' && NET.role === 'host') { const pl = NET.players.get(c.peer); if (pl && pl.conn === c) { try { hostIn(c, m); } catch (e) { console.warn('BO tension in', e); } } return; }
      return _hm.apply(this, arguments);
    };
  }
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) {
      if (m && m.t === 'bo2s') { try { stateIn(m); } catch (e) {} return; }
      if (m && m.t === 'bo2x') { try { eventIn(m); } catch (e) {} return; }
      return _cm.apply(this, arguments);
    };
  }

  /* ---------- sound ---------- */
  const auOk = () => typeof AU !== 'undefined' && AU.ready && AU.ctx;
  function siren(t) {
    if (!auOk()) return;
    try {
      const L = (typeof camera !== 'undefined' && camera.position) || PL.ent.pos, p = new V(t.px, 1.6, t.pz);
      const d = Math.hypot(p.x - L.x, p.z - L.z), k = Math.max(0.35, 1 - d / 160) * Math.max(0, GM().hackNoiseVol != null ? +GM().hackNoiseVol : 1);
      const o = auOut(p, 0.5, k, 0.0005, 30), at = AU.ctx.currentTime + 0.01;
      for (let i = 0; i < 4; i++) { tn(o, at + i * 0.5, 0.25, 620, 1250, 'square', 0.2); tn(o, at + i * 0.5 + 0.25, 0.25, 1250, 620, 'square', 0.2); tn(o, at + i * 0.5, 0.5, 310, 330, 'sawtooth', 0.12); }
    } catch (e) {}
  }
  function mgSound(k) {
    if (!auOk()) return;
    try {
      const o = uiOut(0.5), at = AU.ctx.currentTime + 0.005;
      if (k === 'start') { tn(o, at, 0.08, 1400, 1400, 'square', 0.12); tn(o, at + 0.1, 0.08, 1800, 1800, 'square', 0.12); }
      else if (k === 'ok') { tn(o, at, 0.07, 900, 1800, 'triangle', 0.22); tn(o, at + 0.08, 0.12, 1800, 2600, 'triangle', 0.2); }
    } catch (e) {}
  }
  function pingSound() {
    if (!auOk()) return;
    try { const o = uiOut(0.4), at = AU.ctx.currentTime + 0.005; tn(o, at, 0.12, 2100, 1900, 'sine', 0.2); tn(o, at + 0.16, 0.18, 2100, 1700, 'sine', 0.14); } catch (e) {}
  }

  /* ---------- terminal beacons: flash faster as the hack fills, strobe on an alarm ---------- */
  const BEA = { map: '', list: new Map(), tex: null };
  function beaconTex() {
    if (BEA.tex) return BEA.tex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,120,100,0.8)'); gr.addColorStop(1, 'rgba(255,40,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    BEA.tex = new THREE.CanvasTexture(c); return BEA.tex;
  }
  function termY(t) {
    try { const D = window.BO_NIGHT_DIAG && BO_NIGHT_DIAG[CURMAP.id]; const q = D && D.terms.find((x) => x[0] === t.id); if (q) return q[2]; } catch (e) {}
    try { return groundHeight(t.px, t.pz, (typeof gy0 === 'function' ? gy0(t.px, t.pz) : 0) + 4, 0.2); } catch (e) { return 0; }
  }
  function beaconsBuild() {
    const id = CURMAP && CURMAP.id;
    if (BEA.map === id && BEA.list.size === R.terminals.length) return;
    for (const b of BEA.list.values()) { scene.remove(b.g); }
    BEA.list.clear(); BEA.map = id;
    for (const t of R.terminals) {
      const y = termY(t) + 1.95;
      const g = new THREE.Group(); g.position.set(t.px, y, t.pz); g.name = 'boBeacon' + t.id;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1e }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex(), color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(1.1, 1.1, 1.1);
      g.add(core, halo); g.visible = false; scene.add(g);
      BEA.list.set(t.id, { g, core, halo, alarmUntil: 0 });
    }
  }
  function beaconAlarm(t) { const b = BEA.list.get(t.id); if (b) b.alarmUntil = performance.now() + Math.max(1500, GM().hackRevealT * 1000); }
  function beaconTick() {
    const act = R.hackActive ? R.hackActive() : [], now = performance.now();
    for (const t of R.terminals) {
      const b = BEA.list.get(t.id); if (!b) continue;
      const a = act.find((x) => x.t === t), alarmOn = now < b.alarmUntil;
      if (!playing() || t.hacked || (!a && !alarmOn)) { if (b.g.visible) b.g.visible = false; continue; }
      const prog = a ? a.prog : 0, hz = alarmOn ? 10 : lerp(1.4, 9, prog);
      const on = Math.sin(now / 1000 * hz * Math.PI * 2) > (alarmOn ? -0.2 : 0.1);
      b.g.visible = true; b.core.visible = on; b.halo.visible = on;
      const s = alarmOn ? 2.2 : 0.9 + prog * 1.0; b.halo.scale.set(s, s, s);
    }
  }

  /* ---------- HUD: the needle dial, pause, timer pressure, pings and reveals ---------- */
  let H = null;
  function hudBuild() {
    if (H || !R.hud || !R.hud.el) return H;
    const css = document.createElement('style');
    css.textContent = '#boHud .bo-mg{position:absolute;left:50%;bottom:calc(21.5% + 62px);transform:translateX(-50%);width:340px;padding:10px 14px 12px;background:rgba(6,10,14,.82);border:1px solid rgba(79,209,181,.5);display:none;text-align:center;font-weight:800;letter-spacing:.12em;font-size:12px}'
      + '#boHud .bo-mg .d{position:relative;height:22px;margin:8px 0 6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25)}'
      + '#boHud .bo-mg .z{position:absolute;top:0;bottom:0;background:rgba(79,209,181,.55);box-shadow:0 0 10px rgba(79,209,181,.7)}'
      + '#boHud .bo-mg .n{position:absolute;top:-5px;bottom:-5px;width:3px;margin-left:-1px;background:#fff;box-shadow:0 0 6px #fff}'
      + '#boHud .bo-mg .s{font-weight:600;font-size:11px;opacity:.75;letter-spacing:.08em}#boHud .bo-mg.ok{border-color:#4fd1b5;background:rgba(10,40,32,.85)}#boHud .bo-mg.miss{border-color:#ff5046;background:rgba(50,8,8,.88)}'
      + '#boHud .bo-mg .t{height:3px;background:rgba(255,255,255,.12);margin-top:6px}#boHud .bo-mg .t i{display:block;height:100%;background:#ffd166}'
      + '#boHud .bo-drain{position:absolute;left:50%;top:92px;transform:translateX(-50%);font-weight:800;font-size:12px;letter-spacing:.14em;padding:4px 12px;white-space:nowrap;display:none;color:#ffd166;background:rgba(40,28,4,.7);border:1px solid rgba(255,209,102,.45)}'
      + '#boHud .bo-drain.hot{margin:0;height:auto;min-width:0;padding:4px 12px;gap:0;color:#ff6b5a;background:rgba(40,6,6,.75);border-color:rgba(255,90,80,.6);animation:boHa .8s steps(2) infinite}'
      // pass 23: the objective, drain, hack alert and facility banners are stacked under the score panel by 09zzh (no fixed tops)
      + '#boHud .bo-mk.pg{color:#ff9a3c}#boHud .bo-mk.rv{color:#ff3b30;font-size:13px}'
      + '#boHud .bo-bar .cp{position:absolute;top:-3px;bottom:-3px;width:2px;background:#ffd166}#boHud .bo-bar .cp.l{background:#4fd1b5}#boHud .bo-bar{overflow:visible}';
    document.head.appendChild(css);
    H = {};
    H.mg = document.createElement('div'); H.mg.className = 'bo-mg';
    H.mg.innerHTML = '<div class="h"></div><div class="d"><div class="z"></div><div class="n"></div></div><div class="s"></div><div class="t"><i></i></div>';
    H.drain = document.createElement('div'); H.drain.className = 'bo-drain';
    R.hud.el.appendChild(H.mg); R.hud.el.appendChild(H.drain);
    return H;
  }
  function hudTick() {
    const h = hudBuild(); if (!h) return;
    const me = PL.ent, g = GM();
    // needle
    const M = T.mg;
    if (M && playing()) {
      h.mg.style.display = 'block';
      h.mg.className = 'bo-mg' + (M.res ? ' ' + M.res : '');
      const n = cps().length, hd = M.res === 'ok' ? 'CHECKPOINT LOCKED' : M.res === 'miss' ? 'ALARM · YOU ARE EXPOSED' : 'TERMINAL ' + M.t.id + ' · CHECKPOINT ' + (M.i + 1) + ' / ' + n;
      const q = h.mg.children;
      if (q[0]._t !== hd) { q[0].textContent = hd; q[0]._t = hd; }
      q[1].children[0].style.left = (M.z0 * 100) + '%'; q[1].children[0].style.width = ((M.z1 - M.z0) * 100) + '%';
      q[1].children[1].style.left = (needle(M.ph) * 100) + '%';
      const sub = 'TAP ' + K('hack') + ' OR ' + K('fire') + ' IN THE GREEN';
      if (q[2]._t !== sub) { q[2].textContent = sub; q[2]._t = sub; }
      q[3].firstChild.style.width = Math.max(0, Math.min(100, (M.end - MATCH.time) / g.hackMgTime * 100)) + '%';
    } else h.mg.style.display = 'none';
    // checkpoint ticks on the hack bar
    try {
      const bar = R.hud.el.querySelector('.bo-bar'), t = me && me.team === SPY && R.terminalNear ? R.terminalNear(me, 2.2) : null;
      const sig = t ? t.id + cps().join() + (t.lock || 0) : '';
      if (bar && bar._cp !== sig) {
        bar.querySelectorAll('.cp').forEach((x) => x.remove()); bar._cp = sig;
        if (t) for (const c of cps()) { const d = document.createElement('span'); d.className = 'cp' + (c <= (t.lock || 0) + 1e-4 ? ' l' : ''); d.style.left = (c * 100) + '%'; bar.appendChild(d); }
      }
    } catch (e) {}
    // timer pressure
    let dt = '', hot = false;
    if (playing() && !R.roundOver) {
      if (T.mul > 1) { dt = 'NO HACK PROGRESS · TIMER DRAINING ×' + T.mul.toFixed(1).replace(/\.0$/, ''); hot = true; }
      else if (T.idle > g.drainIdle - 15 && T.idle > 3) dt = (me && me.team === SPY ? 'HACK SOMETHING · ' : 'SPIES STALLING · ') + 'TIMER SPEEDS UP IN ' + Math.max(0, Math.ceil(g.drainIdle - T.idle)) + 's';
    }
    h.drain.style.display = dt ? 'block' : 'none';
    if (h.drain._t !== dt) { h.drain.textContent = dt; h.drain._t = dt; h.drain.className = 'bo-drain' + (hot ? ' hot' : ''); }
    // merc markers: area pings and exposed spies
    const merc = me && me.team === MERC;
    const keep = new Set();
    if (playing() && merc) {
      for (const p of T.pings) {
        if (p.until <= MATCH.time) continue;
        const key = 'pg' + p.n; keep.add(key);
        R.marker(key, 'pg', p.k === 'h' ? 'SPY ACTIVITY' : String(p.lab || 'ALERT'), '~' + Math.round(p.r) + ' m · ' + Math.round(hyp(me.pos.x, me.pos.z, p.x, p.z)) + ' m', p.x, 1.6, p.z);
      }
      for (const r of T.reveals) {
        if (r.until <= MATCH.time || !r.e || r.e.off || !r.e.alive) continue;
        const key = 'rv' + (nid(r.e) || r.e.id); keep.add(key);
        R.marker(key, 'rv', 'SPY EXPOSED', Math.ceil(r.until - MATCH.time) + 's · ' + Math.round(hyp(me.pos.x, me.pos.z, r.e.pos.x, r.e.pos.z)) + ' m', r.e.pos.x, r.e.pos.y + 2.3, r.e.pos.z);
      }
    }
    for (const k in R.hud.mk) if ((k.startsWith('pg') || k.startsWith('rv')) && !keep.has(k)) R.hud.mk[k].style.display = 'none';
    T.mmPings = merc ? T.pings.filter((p) => p.until > MATCH.time) : [];
    T.mmRev = merc ? T.reveals.filter((r) => r.until > MATCH.time && r.e && r.e.alive) : [];
  }
  if (typeof domMinimap === 'function') {
    const _dm = domMinimap;
    domMinimap = function (g, scale) {
      const r = _dm.apply(this, arguments);
      try {
        if (playing()) {
          const ph = (performance.now() / 900) % 1;
          for (const p of T.mmPings || []) {
            g.save(); g.setLineDash([4, 3]); g.strokeStyle = 'rgba(255,154,60,' + (0.55 + 0.35 * (1 - ph)).toFixed(2) + ')'; g.lineWidth = 2;
            g.beginPath(); g.arc(p.x * scale, p.z * scale, Math.max(4, p.r * scale), 0, Math.PI * 2); g.stroke();
            g.fillStyle = 'rgba(255,154,60,0.12)'; g.fill(); g.restore();
          }
          for (const rv of T.mmRev || []) {
            g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(rv.e.pos.x * scale, rv.e.pos.z * scale, 4.5, 0, Math.PI * 2); g.fill();
            g.strokeStyle = 'rgba(255,59,48,' + (1 - ph).toFixed(2) + ')'; g.lineWidth = 2; g.beginPath(); g.arc(rv.e.pos.x * scale, rv.e.pos.z * scale, 5 + ph * 12, 0, Math.PI * 2); g.stroke();
          }
        }
      } catch (e) {}
      return r;
    };
  }

  /* ---------- round setup ---------- */
  const _os = R.onSetup;
  R.onSetup = function () {
    const r = _os ? _os.apply(this, arguments) : undefined;
    T.pings = []; T.reveals = []; T.idle = 0; T.mul = 1; T.mg = null; lastSum = -1;
    for (const k in pingAt) delete pingAt[k];
    for (const e of entities) { e.boMg = null; e.boHitAt = -99; e.boShotAt = -99; }
    try { beaconsBuild(); } catch (e) { console.warn('BO beacons', e); }
    return r;
  };

  /* ---------- per frame ---------- */
  let last = null;
  const _fr = frame;
  frame = function (now) {
    _fr(now);
    try {
      const dt = Math.min(0.05, (last != null ? now - last : 16) / 1000); last = now;
      if (!bo()) { if (H) { H.mg.style.display = 'none'; H.drain.style.display = 'none'; } T.mg = null; return; }
      if (MATCH.state === 'playing') {
        if (BEA.map !== (CURMAP && CURMAP.id)) beaconsBuild();
        hitTrack();
        mgTick(dt);
        if (auth()) {
          botMgTick(); pingTick(dt); drainTick(dt);
          // exposed spies: merc bots keep getting the exact spot
          for (const r of T.reveals) {
            if (r.until <= MATCH.time || !r.e || !r.e.alive) continue;
            r.bt = (r.bt || 0) - dt; if (r.bt > 0) continue; r.bt = 0.6;
            for (const m of entities) if (!m.off && m.alive && !m.isPlayer && !m.isRemote && m.team === MERC) sendBot(m, r.e.pos, 0.3, false);
          }
          if (online()) stateOut();
        }
        T.pings = T.pings.filter((p) => p.until > MATCH.time - 0.5);
        T.reveals = T.reveals.filter((r) => r.until > MATCH.time - 0.5);
      }
      beaconTick();
      hudTick();
    } catch (err) { if (!T.err || T.err < 5) { T.err = (T.err || 0) + 1; console.warn('BO tension', err); } }
  };
  T.cps = cps; T.mgStop = mgStop; T.miss = miss; T.lockIn = lockIn; T.needle = needle;
})();
