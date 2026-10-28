/* ==========================================================================
   BLACKOUT rules (pass 6): Spies vs Mercs on the Khamsin BLACKOUT map.
   Team 0 = MERCS (first person, guns, flashlight). Team 1 = SPIES (Quaternius UAL body, third person, unarmed by default).
   Spies win: hack the needed number of terminals (hold E), then EXTRACT at HACK SPAWN (hold E inside the ring).
   Mercs win: kill every spy, or hold out until the timer runs out.
   One life each. Spies and mercs are always opposing teams (team match forced, whatever mode the menu last used).
   Spy actions (player): E hack / takedown / extract, F or left click takedown, R roll, C/Ctrl crouch-sneak, Shift sprint.
   Spy bots: Riposte navigation (setPath / pathDir / ctlMove / botBump) toward terminals, sneak behind unaware mercs for
   takedowns, roll away when spotted, extract once enough terminals are down.
   Tunables live in BOCFG.v.game (09zq-blackout-cfg.js, editable with the F10 editor).
   ========================================================================== */
(function () {
  const MERC = 0, SPY = 1;
  const GAME_DEF = { roundTime: 240, hackTime: 4.5, hacksNeeded: 2, takedownRange: 1.8, health: 100, spySpeed: 1, mercSpeed: 1, mercs: 2, spies: 2, extractTime: 1.5, spyStealth: 0.55, botHack: 0.35, botDelay: 12, rollIFrames: 0.35, rollCd: 1.1, rollDist: 3.1 };
  const G = () => Object.assign({}, GAME_DEF, (window.BOCFG && BOCFG.v && BOCFG.v.game) || {});
  const R = window.BO_RULES = {
    active: false, terminals: [], roundOver: false, winner: -1, reason: '', kicker: '', extractProg: 0,
    takedowns: 0, log: [], hackNeed: 2, hackTime: 4.5, prevKeys: {}, clickT: 0, rollCd: 0,
  };
  const boOn = () => typeof CURMAP !== 'undefined' && CURMAP && boMapOn(CURMAP.id);
  R.on = boOn;
  const spyRole = () => typeof BO !== 'undefined' && BO.role === 'spy';
  const log = (s) => { R.log.push(((typeof MATCH !== 'undefined' && MATCH.time) || 0).toFixed(1) + ' ' + s); if (R.log.length > 200) R.log.shift(); };
  const hyp2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  /* ---------- teams: always opposing, never friendly fire ---------- */
  const _allied = allied;
  allied = function (a, b) {
    if (boOn() && a && b) return a === b || a.team === b.team;
    return _allied(a, b);
  };
  const _applyDamage = applyDamage;
  applyDamage = function (victim, dmg, attacker, weapon, head, dir, srcPos, life) {
    if (boOn() && victim && attacker && attacker !== victim && victim.team === attacker.team) return; // no team kills in BLACKOUT
    // player health setting: scale incoming damage (online, once, on the shooter's machine: a hit arriving from the net is already scaled)
    if (boOn() && typeof dmg === 'number' && !(typeof NET !== 'undefined' && NET.hitQ)) dmg *= 100 / Math.max(1, G().health);
    return _applyDamage(victim, dmg, attacker, weapon, head, dir, srcPos, life);
  };
  // whatever mode the menu last used (free-for-all made everyone an enemy, so a merc could only kill his teammate), BLACKOUT is a team match
  const _startMatch = startMatch;
  startMatch = function (opt = {}) {
    const bo = boOn() && !(opt && opt.online);
    const keep = Settings.mode;
    if (bo) Settings.mode = 'tdm';
    let r;
    try { r = _startMatch(opt); } finally { if (bo) Settings.mode = keep; }
    if (boOn()) { try { boSetupRound(); } catch (err) { console.warn('BLACKOUT setup', err); } }
    return r;
  };
  const _killLimit = typeof killLimitReached === 'function' ? killLimitReached : null;
  if (_killLimit) killLimitReached = function () { return boOn() ? false : _killLimit.apply(this, arguments); };
  if (typeof checkKillLimit === 'function') { const _ck = checkKillLimit; checkKillLimit = function () { if (boOn()) return; return _ck.apply(this, arguments); }; }

  /* one life: no respawns in BLACKOUT */
  if (typeof respawnPlayer === 'function') {
    const _rp = respawnPlayer; R._respawnPlayer = _rp;
    // pass 16: a killcam ending after the next round already brought the player back must not kill him again
    respawnPlayer = function () { if (boOn()) { if (PL.ent && !PL.ent.alive) PL.ent.respawnT = Infinity; return; } return _rp.apply(this, arguments); };
  }

  /* speed settings: spies and mercs move at their own multiplier (scales the weapon mobility for this one move) */
  const _ctlMove = ctlMove;
  ctlMove = function (ent, dt) {
    if (!boOn() || !ent || !ent.arms) return _ctlMove(ent, dt);
    const g = G(), k = ent.team === SPY ? g.spySpeed : g.mercSpeed;
    const w = armsW(ent), d = w && w.def;
    if (!d || !(k > 0) || k === 1) return _ctlMove(ent, dt);
    const m = d.move; d.move = m * k;
    try { return _ctlMove(ent, dt); } finally { d.move = m; }
  };

  /* mercs see spies less easily: the spy's dark suit (crouched even less). Scales the awareness a merc bot gains on a spy. */
  const _botSense = botSense;
  botSense = function (b, now) {
    if (!boOn() || b.team !== MERC) return _botSense(b, now);
    const before = new Map();
    for (const e of entities) if (e.team === SPY && e.alive) before.set(e, b.aw.get(e) || 0);
    _botSense(b, now);
    const k0 = G().spyStealth;
    for (const [e, a0] of before) {
      const a1 = b.aw.get(e) || 0;
      if (a1 > a0) {
        const d = hyp2(e.pos.x, e.pos.z, b.pos.x, b.pos.z);
        let k = d < 2.5 ? 1 : k0 * (e.crouch ? 0.6 : 1) * (e.sprinting ? 1.5 : 1) * (R.cloakMul ? R.cloakMul(e, b) : 1);
        const lit = !!(window.BOSPYLIGHT && BOSPYLIGHT.on(e)); // pass 19: a lit pistol light gives the spy away
        if (lit) k = Math.max(k, BOSPYLIGHT.see());
        b.aw.set(e, Math.min(1, a0 + (a1 - a0) * Math.min(lit ? 3 : 1, k)));
      }
    }
  };

  /* ---------- result ---------- */
  const _matchOutcome = matchOutcome, _finKicker = finKicker;
  matchOutcome = function () {
    if (!boOn()) return _matchOutcome();
    const w = R.winner >= 0 ? R.winner : MERC, me = PL.ent;
    if (R.winner < 0 && (MATCH.state !== 'playing' || MATCH.timeLeft <= 0)) { R.winner = MERC; R.kicker = 'TIME UP'; R.reason = 'Mercs held the facility until the timer ran out'; }
    return { result: me && w === me.team ? 'win' : 'loss', winner: w, sub: R.reason || 'Mercs held the facility until the timer ran out' };
  };
  // scoreboards: bots switched off for this round are not listed; the mode reads as BLACKOUT, not team deathmatch
  const _boardList = boardList;
  boardList = function (t) { const l = _boardList(t); return boOn() ? l.filter((x) => !x.off) : l; };
  const _modeDef = modeDef, BO_MODE_DEF = Object.assign({}, MODES.tdm, { name: 'BLACKOUT · Spies vs Mercs' });
  modeDef = function () { return boOn() && !MATCH.online ? BO_MODE_DEF : _modeDef(); };
  finKicker = function () { return boOn() ? (R.kicker || 'TIME UP') : _finKicker(); };
  function endRound(team, kicker, reason) {
    if (R.roundOver || MATCH.state !== 'playing') return;
    if (R.netEndGuard && R.netEndGuard(team, kicker, reason)) return; // pass 16: online clients never decide a round, they ask the host
    R.roundOver = true; R.winner = team; R.kicker = kicker; R.reason = reason;
    log('END ' + (team === SPY ? 'SPIES' : 'MERCS') + ' ' + kicker);
    try { matchFinish(); } catch (err) { console.warn('BLACKOUT finish', err); }
  }
  R.endRound = endRound;

  /* ---------- round setup ---------- */
  function terminalsFresh() {
    const src = window.BO_TERMINALS || [];
    R.terminals = src.map((t) => ({ id: t.id, x: t.x, z: t.z, px: t.px != null ? t.px : t.x, pz: t.pz != null ? t.pz : t.z, hacked: false, prog: 0, by: null }));
  }
  function spawnList(team) {
    const S = window.BLACKOUT_SPAWNS || {};
    const l = team === SPY ? (S.spy || window.BO_SPY_SPAWNS) : (S.merc || window.BO_MERC_SPAWNS);
    return (l && l.length) ? l.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])) : [[0, team === SPY ? -40 : 40]];
  }
  function placeAt(e, team, i) {
    const l = spawnList(team), p = l[i % l.length], ring = Math.floor(i / l.length);
    const x = p[0] + ring * 1.3, z = p[1];
    // pass 17: the floor comes from the nav graph like Riposte's own spawns (spawnSpot), so raised islands (Stratus) and dunes (Simoun) work
    let sp = null;
    try { if (typeof spawnSpot === 'function' && typeof NAV !== 'undefined' && NAV.nx && NAV.nx.length) sp = spawnSpot(e, x, z, null); } catch (err) { sp = null; }
    if (sp && Math.hypot(sp.x - x, sp.z - z) < 4) e.pos.copy(sp); else e.pos.set(x, groundHeight(x, z, (typeof gy0 === 'function' ? gy0(x, z) : 0) + 4, 0.3), z);
    e.vel.set(0, 0, 0); e.vy = 0;
    // face the middle of the map (Khamsin: straight down Main Street, as before)
    const dm = CURMAP.def && CURMAP.def.dom && CURMAP.def.dom[1], tx = dm ? dm[0] : 0, tz = dm ? dm[1] : 0;
    const yaw = CURMAP.id === 'blackout' ? (team === SPY ? Math.PI : 0) : Math.atan2(e.pos.x - tx, e.pos.z - tz);
    e.yaw = yaw; if (e.lookYaw !== undefined) e.lookYaw = yaw;
    if (e.isPlayer) { PL.yaw = yaw; PL.pitch = 0; }
  }
  function kaySpy(e) {
    if (!e || !e.model) return;
    e.model._boWantKay = true;
    if (e.model.gun) e.model.gun.visible = false; // hidden, never removed (ctlShoot, ragdoll, killcam and net read model.gun)
    if (!e.model._boKay && typeof boAttachKaykit === 'function') {
      const go = () => { try { if (!e.model._boKay) { boAttachKaykit(e.model, 0x2a3e48); if (e.model.lod) { if (e.model.lod.hi) e.model.lod.hi.visible = false; if (e.model.lod.lo) e.model.lod.lo.visible = false; } } } catch (err) { console.warn('BO kay', err); } };
      if (typeof BO !== 'undefined' && BO.kaykit) go(); else if (typeof boLoadKaykit === 'function') boLoadKaykit().then(go).catch(() => {});
    }
  }
  function unKay(e) {
    if (!e || !e.model || !e.model._boKay) return;
    try {
      const K = e.model._boKay;
      if (K.holder && K.holder.parent) K.holder.parent.remove(K.holder);
      e.model._boKay = null; e.model._boWantKay = false;
      if (e.model.lod) { if (e.model.lod.hi) e.model.lod.hi.visible = true; if (e.model.lod.lo) e.model.lod.lo.visible = true; }
    } catch (err) {}
  }
  const NAMES = { [MERC]: ['Hammer', 'Unit1', 'Unit2', 'Unit3', 'Unit4', 'Unit5'], [SPY]: ['Ghost', 'Shade1', 'Shade2', 'Shade3', 'Shade4', 'Shade5'] };
  function boSetupRound() {
    const g = G();
    R.active = true; R.roundOver = false; R.winner = -1; R.reason = ''; R.kicker = ''; R.extractProg = 0; R.takedowns = 0; R.prevKeys = {}; R.rollCd = 0;
    R.hackNeed = Math.round(g.hacksNeeded); R.hackTime = g.hackTime;
    terminalsFresh(); R.hackNeed = Math.max(1, Math.min(R.terminals.length || 1, R.hackNeed));
    log('setup role=' + (spyRole() ? 'spy' : 'merc'));
    const myTeam = spyRole() ? SPY : MERC, other = 1 - myTeam;
    const want = { [MERC]: Math.round(g.mercs), [SPY]: Math.round(g.spies) };
    PL.ent.team = myTeam;
    const bots = entities.filter((e) => !e.isPlayer && !e.isRemote);
    for (const e of bots) { e.off = true; e.alive = false; e.respawnT = Infinity; e.target = null; if (e.model) { e.model.rag = null; e.model.root.visible = false; } e.bo = null; }
    const counts = { [myTeam]: 1, [other]: 0 }, idx = { [myTeam]: 1, [other]: 0 };
    // pass 16 online: the host counts every human (remote players by their team); a client runs no bots of its own
    const netOn = MATCH.online && typeof NET !== 'undefined' && NET.on, netCl = netOn && NET.role !== 'host';
    if (netOn) {
      for (const e of entities) if (e.isRemote && !e.remoteBot && !e.off && (e.team === MERC || e.team === SPY)) { counts[e.team]++; idx[e.team]++; }
      if (!NET.cfg.bots) { want[MERC] = Math.min(want[MERC], counts[MERC]); want[SPY] = Math.min(want[SPY], counts[SPY]); }
    }
    if (!netCl) for (const e of bots) {
      let t = -1;
      if (counts[myTeam] < want[myTeam]) t = myTeam; else if (counts[other] < want[other]) t = other;
      if (t < 0) break;
      e.team = t; e.off = false; e.name = NAMES[t][idx[t] % 6]; counts[t]++; idx[t]++;
    }
    // bodies: spies on the UAL mannequin, mercs on Riposte soldiers
    for (const e of entities) {
      if (e.off) continue;
      if (e.team === SPY) kaySpy(e); else unKay(e);
    }
    if (netOn && !netCl) for (const e of bots) if (e.off && e.netBot) { try { netBotOff(e); } catch (err) {} e.off = true; }
    soldierLookAll();
    const n = { [MERC]: 0, [SPY]: 0 };
    PL.ent.alive = true; PL.ent.off = false; PL.ent.respawnT = 0;
    for (const e of [PL.ent].concat(bots)) {
      if (e.off) continue;
      if (!e.isPlayer) { try { spawnEntity(e); } catch (err) { console.warn('BO spawn', err); } }
      if (!e.isPlayer && netOn && !netCl && !e.netBot && typeof NET !== 'undefined') { e.netBot = true; e.netId = NET.me + '~b' + e.id; e.netQ = { seq: 0, list: [] }; }
      placeAt(e, e.team, n[e.team]++);
      e.alive = true; e.health = 100; e.respawnT = Infinity; e.protT = 0; e.boRollT = 0; e.boInteract = false;
      if (e.team === SPY && e.model && e.model.gun) e.model.gun.visible = false;
    }
    document.querySelectorAll('.score .row').forEach((r, t) => { r.classList.toggle('a', t === myTeam); r.classList.toggle('b', t !== myTeam); });
    MATCH.timeLeft = Math.max(30, g.roundTime); MATCH.limit = 999; MATCH.score = [0, 0];
    if (myTeam === MERC) {
      if (window.BOCFG && BOCFG.giveMercLoadout) { try { BOCFG.giveMercLoadout(); } catch (err) { console.warn('BO loadout', err); } }
      if (PL.ent.model) PL.ent.model.root.visible = false;
      VM.root.visible = true; VM.holder.visible = true;
    } else {
      if (window.BOCFG && BOCFG.giveSpyLoadout) { try { BOCFG.giveSpyLoadout(); } catch (err) { console.warn('BO loadout', err); } }
      VM.root.visible = false; VM.holder.visible = false;
      if (PL.ent.model) PL.ent.model.root.visible = true;
      if (typeof boEnsurePlayerKaykit === 'function') boEnsurePlayerKaykit();
    }
    try { if (typeof fpvLeave === 'function' && PILOT && PILOT.d) fpvLeave(); } catch (err) {}
    rebrand();
    hudShow(true);
    if (R.onSetup) { try { R.onSetup(); } catch (err) { console.warn('BO setup hook', err); } }
  }
  R.setup = boSetupRound; R.placeAt = placeAt; R.kaySpy = kaySpy; R.unKay = unKay; R.spawnCount = (team) => spawnList(team).length;

  /* ---------- team names / score line ---------- */
  const TEAM_NAMES0 = TEAM_NAMES.slice();
  let branded = false;
  function rebrand() {
    if (!boOn()) { if (branded) { TEAM_NAMES[0] = TEAM_NAMES0[0]; TEAM_NAMES[1] = TEAM_NAMES0[1]; branded = false; } return; }
    branded = true; TEAM_NAMES[0] = 'MERCS'; TEAM_NAMES[1] = 'SPIES';
    document.querySelectorAll('.score .row span').forEach((s, i) => { s.textContent = TEAM_NAMES[i]; });
  }

  /* ---------- helpers ---------- */
  const hackedCount = () => R.terminals.filter((t) => t.hacked).length;
  const teamAlive = (t) => entities.filter((e) => !e.off && e.alive && e.team === t);
  const extractOpen = () => hackedCount() >= R.hackNeed;
  function extractPt() { const E = window.BO_EXTRACT || { x: 0, z: -36, r: 1.6 }; return { x: E.x, z: E.z, r: Math.max(2.2, E.r || 0) }; }
  function terminalNear(e, r = 1.6) {
    let best = null, bd = r;
    for (const t of R.terminals) {
      if (t.hacked) continue;
      const d = Math.min(hyp2(e.pos.x, e.pos.z, t.x, t.z), hyp2(e.pos.x, e.pos.z, t.px, t.pz) - 0.35);
      if (d < bd) { best = t; bd = d; }
    }
    return best;
  }
  /* is this merc unaware of the spy? bots: low awareness or looking away; the player: the spy is outside his view */
  function mercUnaware(m, s) {
    const fx = -Math.sin(m.isPlayer ? PL.yaw : m.yaw), fz = -Math.cos(m.isPlayer ? PL.yaw : m.yaw);
    const dx = s.pos.x - m.pos.x, dz = s.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    const facing = (dx * fx + dz * fz) / d;
    if (m.isPlayer) return facing < 0.2;
    return facing < 0.1 || (m.aw && (m.aw.get(s) || 0) < 0.5);
  }
  function takedownTarget(s) {
    const range = G().takedownRange;
    let best = null, bd = range;
    for (const m of entities) {
      if (m.off || !m.alive || m === s || m.team === s.team) continue;
      const d = hyp2(m.pos.x, m.pos.z, s.pos.x, s.pos.z);
      if (d > bd || Math.abs(m.pos.y - s.pos.y) > 1.2) continue;
      const fx = -Math.sin(m.isPlayer ? PL.yaw : m.yaw), fz = -Math.cos(m.isPlayer ? PL.yaw : m.yaw);
      const behind = ((s.pos.x - m.pos.x) * fx + (s.pos.z - m.pos.z) * fz) / (d || 1) < 0.15;
      if (!behind && !mercUnaware(m, s)) continue;
      best = m; bd = d;
    }
    return best;
  }
  R.takedownTarget = takedownTarget;
  function doTakedown(s, m) {
    if (!s || !m || !m.alive) return false;
    s.boTakedownT = 0.7;
    if (s.model && typeof boKayOneShot === 'function' && s.model._boKay) boKayOneShot(s.model, 'Punch_Cross', 0.7, 0.06);
    s.yaw = Math.atan2(-(m.pos.x - s.pos.x), -(m.pos.z - s.pos.z));
    if (s.isPlayer) PL.yaw = s.yaw;
    const dir = new THREE.Vector3(m.pos.x - s.pos.x, 0, m.pos.z - s.pos.z); if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
    m.protT = 0;
    // pass 16: a remote victim dies on his own machine (Riposte net hit); a local one dies here
    if (m.isRemote) applyDamage(m, 250, s, NET_WSPECIAL.knife, false, dir); else killEnt(m, s, NET_WSPECIAL.knife, false, dir, s.spawnAt);
    s.score = (s.score || 0) + 50;
    R.takedowns++;
    log('TAKEDOWN ' + s.name + ' > ' + m.name);
    try { sfxMech('knife'); } catch (err) {}
    if (s.isPlayer) { try { xpPopup('+150', 'TAKEDOWN', 'kill'); hitFeedback(false, true); } catch (err) {} try { hudMsg('TAKEDOWN: ' + m.name, 'xp', 2); } catch (err) {} }
    return true;
  }
  R.doTakedown = doTakedown;
  function finishHack(t, who) {
    t.hacked = true; t.prog = 1; t.by = null;
    log('HACK ' + t.id + ' by ' + (who ? who.name : '?'));
    try { hudMsg('TERMINAL ' + t.id + ' HACKED (' + hackedCount() + '/' + R.hackNeed + ')' + (extractOpen() ? ' · EXTRACT OPEN · REACH HACK SPAWN' : ''), PL.ent.team === SPY ? 'xp' : 'enemy', 3); } catch (err) {}
    if (who && who.isPlayer) { try { xpPopup('+200', 'TERMINAL ' + t.id); } catch (err) {} }
    if (window.BO_TERM_FX) try { BO_TERM_FX(t); } catch (err) {}
    try { if (R.alarmHack) R.alarmHack(t, who); } catch (err) {}
  }
  /* roll: a short dash in the move (or facing) direction, UAL Roll clip; cooldown 1 s */
  function startRoll(e, dx, dz) {
    if ((e.boRollCd || 0) > 0 || !e.onGround) return false;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { dx = -Math.sin(e.isPlayer ? PL.yaw : e.yaw); dz = -Math.cos(e.isPlayer ? PL.yaw : e.yaw); } else { dx /= l; dz /= l; }
    const gg = G();
    e.boRollT = 0.6; e.boRollCd = Math.max(0.6, gg.rollCd != null ? gg.rollCd : 1.1); e.boRollDir = [dx, dz]; e.boRollAt = MATCH.time;
    log('ROLL ' + e.name);
    return true;
  }
  R.startRoll = startRoll;
  function rollTick(e, dt) {
    if (e.boRollCd > 0) e.boRollCd -= dt;
    if (!(e.boRollLeft > 0) && e.boRollT > 0 && e.boRollDir) e.boRollLeft = 0.55;
    if (e.boRollLeft > 0 && e.boRollDir) {
      // the stock curve covers about 3.1 m; rollDist scales it
      const rd = G().rollDist, sk = rd > 0 ? rd / 3.1 : 1;
      const sp = 6.2 * sk * Math.min(1, e.boRollLeft / 0.2 + 0.4);
      e.pos.x += e.boRollDir[0] * sp * dt; e.pos.z += e.boRollDir[1] * sp * dt;
      collideCircle(e.pos, 0.34, 1.2);
      e.boRollLeft -= dt;
      e.crouch = true;
      if (e.boRollLeft <= 0) { e.boRollDir = null; e.boRollLeft = 0; }
    }
  }

  /* ---------- player spy input ---------- */
  const SPY_KEYS = new Set(['KeyE', 'KeyF', 'KeyR', 'AltLeft', 'KeyG', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyX', 'KeyV', 'KeyB']);
  const _onKey = onKey;
  onKey = function (e, down) {
    if (boOn() && spyRole() && MATCH.state === 'playing' && PL.ent && PL.ent.alive && !(typeof CHAT !== 'undefined' && CHAT.open)) {
      const c = keyCanon(e.code);
      const armedKey = c === 'Digit1' || c === 'Digit2' || c === 'KeyR'; // weapon keys and reload reach Riposte when the spy carries the M9
      if (c && SPY_KEYS.has(c) && (!armedKey || !(window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed()))) {
        if (pointerActive()) KEYS[c] = down;
        if (e.preventDefault) e.preventDefault();
        return;
      }
    }
    return _onKey(e, down);
  };
  addEventListener('mousedown', (e) => {
    if (e.button === 0 && boOn() && spyRole() && MATCH.state === 'playing' && pointerActive()) R.clickT = performance.now();
  }, true);
  const BK = (id) => (window.BOKEYS ? BOKEYS.K(id) : ({ hack: 'E', takedown: 'F' })[id] || id);
  const pressed = R.pressed = (c) => { const now = !!KEYS[c], was = !!R.prevKeys[c]; return now && !was; };

  function playerSpyTick(dt) {
    const e = PL.ent; if (!e || !e.alive || e.team !== SPY) { R.extractProg = 0; return; }
    const g = G();
    const holdE = !!(KEYS.KeyE || (typeof TOUCH !== 'undefined' && TOUCH.use));
    const clicked = R.clickT && performance.now() - R.clickT < 250 && !(window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed());
    let prompt = '', prog = -1;
    // left Alt (rebindable): roll
    if (pressed('AltLeft')) {
      const fw = (KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0), st = (KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0);
      const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
      startRoll(e, fx * fw + rx * st, fz * fw + rz * st);
    }
    // extract
    const X = extractPt(), inX = extractOpen() && hyp2(e.pos.x, e.pos.z, X.x, X.z) < X.r;
    const td = takedownTarget(e);
    const term = terminalNear(e);
    e.boInteract = false;
    if (inX) {
      if (holdE) { R.extractProg = Math.min(1, R.extractProg + dt / Math.max(0.2, g.extractTime)); e.boInteract = true; }
      else R.extractProg = Math.max(0, R.extractProg - dt);
      prompt = holdE ? 'EXTRACTING… ' + Math.floor(R.extractProg * 100) + '%' : 'HOLD ' + BK('hack') + ': EXTRACT'; prog = R.extractProg;
      if (R.extractProg >= 1 && R.netClientOn && R.netClientOn()) prompt = 'EXTRACTING… 100% · CONFIRMING WITH HOST';
      if (R.extractProg >= 1) { log('EXTRACT player'); endRound(SPY, 'SPIES EXTRACTED', e.name + ' extracted with the data'); }
    } else {
      R.extractProg = Math.max(0, R.extractProg - dt);
      if (td && (pressed('KeyE') || pressed('KeyF') || clicked)) { doTakedown(e, td); R.clickT = 0; }
      else if (td) prompt = BK('hack') + ' / ' + BK('takedown') + (window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed() ? '' : ' / CLICK') + ': TAKEDOWN ' + td.name;
      else if (term) {
        if (holdE) {
          e.boInteract = true; term.by = e;
          term.prog = Math.min(1, term.prog + dt / Math.max(0.3, g.hackTime));
          prompt = 'HACKING TERMINAL ' + term.id + '… ' + Math.floor(term.prog * 100) + '%';
          if (term.prog >= 1 && !term.hacked) finishHack(term, e);
        } else prompt = 'HOLD ' + BK('hack') + ': HACK TERMINAL ' + term.id;
        prog = term.prog;
      }
    }
    if (clicked && !td && !inX && R.onSpyClick) { try { R.onSpyClick(e); } catch (err) { console.warn('BO click', err); } }
    if (clicked) R.clickT = 0;
    if (R.spyPrompt) { const sp2 = R.spyPrompt(e); if (sp2 && !prompt) prompt = sp2; }
    HUD_BO.prompt = prompt; HUD_BO.prog = prog;
  }

  /* ---------- spy bots ---------- */
  function spyBot(b, dt, now) {
    if (b.isRemote || b.off) return;
    if (!b.alive) { animSoldier(b, dt); return; }
    if (b.aggr === undefined) initTactics(b);
    const I = b.input;
    I.fire = false; I.firePressed = false; I.ads = false; I.jump = false; I.reload = false;
    if (playHold() || R.roundOver) { I.mx = 0; I.mz = 0; I.sprint = false; ctlMove(b, dt); animSoldier(b, dt); return; }
    const g = G(), S = b.bo || (b.bo = { mode: 'hack', decideT: 0, goal: null, goalKey: '', term: null, tgt: null, evadeT: 0, stuckT: 0, lastX: b.pos.x, lastZ: b.pos.z, xT: 0 });
    b.senseT = (b.senseT || 0) - dt; if (b.senseT <= 0) { b.senseT = rand(0.15, 0.25); botSense(b, now); }
    rollTick(b, dt);
    // threat: a merc who has me in sight (bot: spotted me; player: I am near his crosshair)
    let threat = null, td = Infinity;
    for (const m of entities) {
      if (m.off || !m.alive || m.team !== MERC) continue;
      const d = hyp2(m.pos.x, m.pos.z, b.pos.x, b.pos.z);
      const sees = m.isPlayer ? (!mercUnaware(m, b) && d < 30 && lineClear(entEye(m, new THREE.Vector3()), entChest(b, new THREE.Vector3())))
        : ((m.target === b && m.visible) || (m.aw && (m.aw.get(b) || 0) > 0.85));
      if (sees && d < td) { threat = m; td = d; }
    }
    S.decideT -= dt;
    if (S.decideT <= 0) {
      S.decideT = 0.35;
      const hacked = hackedCount();
      // 1) takedown: an unaware merc close by
      let prey = null, pd = 11;
      for (const m of entities) {
        if (m.off || !m.alive || m.team !== MERC) continue;
        const d = hyp2(m.pos.x, m.pos.z, b.pos.x, b.pos.z);
        if (d < pd && mercUnaware(m, b) && Math.abs(m.pos.y - b.pos.y) < 1.5) { prey = m; pd = d; }
      }
      const hacking = S.term && S.term.by === b && S.term.prog > 0.45 && !S.term.hacked;
      if (threat && td < 14 && !hacking && !(prey === threat)) {
        S.mode = 'evade'; S.evadeT = 2.5;
        const dx = b.pos.x - threat.pos.x, dz = b.pos.z - threat.pos.z, l = Math.hypot(dx, dz) || 1;
        if ((b.boRollCd || 0) <= 0 && td < 10 && Math.random() < 0.6) startRoll(b, dz / l * (Math.random() < 0.5 ? 1 : -1), -dx / l * (Math.random() < 0.5 ? 1 : -1));
        S.goal = new THREE.Vector3(b.pos.x + dx / l * 9, b.pos.y, b.pos.z + dz / l * 9);
      } else if (S.mode === 'evade' && S.evadeT > 0) {
        // keep running
      } else if (prey && !hacking) {
        S.mode = 'stalk'; S.tgt = prey;
        const fx = -Math.sin(prey.isPlayer ? PL.yaw : prey.yaw), fz = -Math.cos(prey.isPlayer ? PL.yaw : prey.yaw);
        S.goal = new THREE.Vector3(prey.pos.x - fx * 0.8, prey.pos.y, prey.pos.z - fz * 0.8);
      } else if (hacked >= R.hackNeed) {
        S.mode = 'extract'; const X = extractPt(); S.goal = new THREE.Vector3(X.x, 0, X.z);
      } else {
        S.mode = 'hack';
        if (!S.term || S.term.hacked || (S.term.by && S.term.by !== b && S.term.by.alive && S.term.by.boInteract)) {
          let bt = null, bd = Infinity;
          for (const t of R.terminals) {
            if (t.hacked) continue;
            const claimed = entities.some((o) => o !== b && o.alive && o.team === SPY && o.bo && o.bo.term === t);
            const d = hyp2(t.x, t.z, b.pos.x, b.pos.z) + (claimed ? 40 : 0);
            if (d < bd) { bd = d; bt = t; }
          }
          S.term = bt;
        }
        S.goal = S.term ? new THREE.Vector3(S.term.x, 0, S.term.z) : null;
      }
      if (R.botAbil) { try { R.botAbil(b, S, threat, td, dt); } catch (err) { console.warn('BO bot gadget', err); } }
    }
    if (S.evadeT > 0) S.evadeT -= dt;
    // pass 10: a spy bot carrying the M9 shoots back at a merc who has it in sight (aims for the head, the body armor eats body hits)
    let fight = null;
    const armed = !!(b.boM9 && b.arms && window.BOCFG && BOCFG.v.spy.botGun !== false && !b.boRoll);
    if (armed && threat && td < 16) {
      const eye = entEye(b, new THREE.Vector3()), hd = entHead(threat, new THREE.Vector3());
      if (lineClear(eye, hd)) fight = { m: threat, eye, hd };
    }
    if (fight) {
      S.fightT = (S.fightT || 0) + dt;
      const dx = fight.hd.x - fight.eye.x, dy = fight.hd.y - fight.eye.y, dz = fight.hd.z - fight.eye.z, hl = Math.hypot(dx, dz) || 1;
      if (!S.aimErr || (S.aimErrT = (S.aimErrT || 0) - dt) <= 0) { S.aimErrT = 0.5; S.aimErr = [rand(-1, 1) * 0.05, rand(-1, 1) * 0.05]; }
      S.fYaw = Math.atan2(-dx, -dz) + S.aimErr[0]; S.fPitch = Math.atan2(dy, hl) + S.aimErr[1];
      S.shotT = (S.shotT || 0) - dt;
      if (S.fightT > 0.35 && S.shotT <= 0 && Math.abs(angDiff(b.yaw, S.fYaw)) < 0.12) { I.firePressed = true; I.fire = true; S.shotT = rand(0.32, 0.6); }
      if (b.arms) { const w = b.arms.slots[b.arms.cur]; if (w && w.mag <= 0 && !b.arms.reload) I.reload = true; }
    } else {
      S.fightT = 0;
      // out of a fight, an armed spy bot tops up a half-empty M9
      if (armed && b.arms) { const w = b.arms.slots[b.arms.cur]; if (w && w.def && w.mag < w.def.mag * 0.5 && w.reserve > 0 && !b.arms.reload) I.reload = true; }
    }
    if (S.mode === 'stalk' && S.tgt && S.tgt.alive) {
      const m = S.tgt, d = hyp2(m.pos.x, m.pos.z, b.pos.x, b.pos.z);
      if (d <= g.takedownRange && takedownTarget(b) === m) { doTakedown(b, m); S.mode = 'hack'; S.tgt = null; S.decideT = 0.5; }
    }
    // movement along the nav path
    let wishX = 0, wishZ = 0, sprint = false, crouch = false, arrive = 0.45, faceX = null, faceZ = null;
    b.boInteract = false;
    if (S.goal) {
      const key = S.goal.x.toFixed(0) + ',' + S.goal.z.toFixed(0);
      b.repathT = (b.repathT || 0) - dt;
      if (key !== S.goalKey || b.repathT <= 0) { setPath(b, S.goal); S.goalKey = key; b.repathT = S.mode === 'stalk' ? 0.6 : 2.5; }
      const dd = hyp2(S.goal.x, S.goal.z, b.pos.x, b.pos.z);
      if (S.mode === 'hack' && S.term && dd < 0.6) {
        // at the terminal: kneel and hack, facing the pedestal
        b.boInteract = true; faceX = S.term.px - b.pos.x; faceZ = S.term.pz - b.pos.z;
        S.term.by = b; S.term.prog = Math.min(1, S.term.prog + (MATCH.time - (MATCH.startAt || 0) < g.botDelay ? 0 : g.botHack) * dt / Math.max(0.3, g.hackTime));
        if (S.term.prog >= 1 && !S.term.hacked) { finishHack(S.term, b); S.term = null; S.decideT = 0; }
      } else if (S.mode === 'extract' && dd < extractPt().r - 0.4) {
        S.xT += dt; b.boInteract = true;
        if (S.xT >= g.extractTime) { log('EXTRACT ' + b.name); endRound(SPY, 'SPIES EXTRACTED', b.name + ' extracted with the data'); }
      } else if (dd > arrive) {
        const pd = pathDir(b);
        if (pd) { wishX = pd[0]; wishZ = pd[1]; } else { wishX = (S.goal.x - b.pos.x) / dd; wishZ = (S.goal.z - b.pos.z) / dd; }
        if (S.mode !== 'extract') S.xT = 0;
      }
      // pace: sprint when nobody is around or when running away, sneak (crouched) close to mercs
      let nearMerc = Infinity;
      for (const m of entities) if (!m.off && m.alive && m.team === MERC) nearMerc = Math.min(nearMerc, hyp2(m.pos.x, m.pos.z, b.pos.x, b.pos.z));
      if (S.mode === 'evade') sprint = true;
      else if (S.mode === 'stalk') crouch = nearMerc > 2.2;
      else if (nearMerc < 13) crouch = true;
      else sprint = nearMerc > 22;
    }
    // face the move (or the terminal); turn rate like a player
    let want = b.yaw;
    if (fight) { sprint = false; want = S.fYaw; }
    else if (faceX !== null) want = Math.atan2(-faceX, -faceZ);
    else if (Math.hypot(wishX, wishZ) > 0.1) want = Math.atan2(-wishX, -wishZ);
    b.yaw += angDiff(b.yaw, want) * Math.min(1, dt * (fight ? 14 : 9)); b.lookYaw = b.yaw; b.pitch = fight ? S.fPitch : 0;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    let lx = wishX * rx + wishZ * rz, lz = wishX * fx + wishZ * fz;
    const ll = Math.hypot(lx, lz); if (ll > 1) { lx /= ll; lz /= ll; }
    if (b.boInteract) { lx = 0; lz = 0; sprint = false; crouch = false; }
    I.mx = lx; I.mz = lz; I.sprint = sprint && !crouch; I.crouch = crouch; b.wantCrouch = crouch;
    if (fight) { b.boInteract = false; I.sprint = false; }
    const px0 = b.pos.x, pz0 = b.pos.z;
    ctlMove(b, dt);
    if (armed && b.arms) { try { ctlWeapon(b, dt, now); } catch (err) { console.warn('BO spy M9', err); } }
    try { botBump(b, dt, px0, pz0, now); } catch (err) {}
    // stuck: re-path, then try another terminal
    S.stuckT += dt;
    if (S.stuckT > 1.5) {
      const moved = hyp2(b.pos.x, b.pos.z, S.lastX, S.lastZ);
      if (moved < 0.5 && Math.hypot(wishX, wishZ) > 0.3) { b.path = null; S.goalKey = ''; S.stuckN = (S.stuckN || 0) + 1; if (S.stuckN > 2 && S.mode === 'hack') { S.term = null; S.stuckN = 0; } }
      else S.stuckN = 0;
      S.lastX = b.pos.x; S.lastZ = b.pos.z; S.stuckT = 0;
    }
    const v = Math.hypot(b.vel.x, b.vel.z);
    b.stepAcc = (b.stepAcc || 0) + v * dt;
    if (b.stepAcc > (b.sprinting ? 2.8 : 2.2)) { b.stepAcc = 0; if (!b.crouch) try { sfxStep(b.pos, b.sprinting ? 0.3 : 0.18, surfaceAt(b.pos)); } catch (err) {} }
    animSoldier(b, dt);
  }
  const _updateBot = updateBot;
  updateBot = function (b, dt, now) {
    if (boOn() && b && b.team === SPY && !b.isRemote && (!MATCH.online || (typeof NET !== 'undefined' && NET.role === 'host'))) return spyBot(b, dt, now);
    if (boOn() && b && !b.alive && !b.off) { animSoldier(b, dt); return; } // one life: dead mercs stay down
    return _updateBot(b, dt, now);
  };
  R.spyBot = spyBot;

  /* ---------- HUD: prompt, progress, objective, controls, world markers ---------- */
  const HUD_BO = R.hud = { prompt: '', prog: -1, el: null };
  function hudBuild() {
    if (HUD_BO.el) return HUD_BO.el;
    const css = document.createElement('style');
    css.textContent = `
#boHud{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:inherit;color:#e8ecef;display:none}
#boHud .bo-prompt{position:absolute;left:50%;bottom:24%;transform:translateX(-50%);font-weight:700;font-size:15px;letter-spacing:.08em;text-transform:uppercase;padding:8px 16px;background:rgba(10,14,18,.72);border-left:3px solid #4fd1b5;white-space:nowrap;display:none}
#boHud .bo-bar{position:absolute;left:50%;bottom:21.5%;transform:translateX(-50%);width:220px;height:6px;background:rgba(255,255,255,.12);display:none}
#boHud .bo-bar i{display:block;height:100%;width:0;background:#4fd1b5}
#boHud .bo-obj{position:absolute;left:50%;top:64px;transform:translateX(-50%);font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;padding:5px 12px;background:rgba(10,14,18,.55);white-space:nowrap}
#boHud .bo-keys{position:absolute;left:16px;bottom:16px;font-size:12px;letter-spacing:.06em;opacity:.85;padding:6px 10px;background:rgba(10,14,18,.5);line-height:1.6}
#boHud .bo-keys b{display:inline-block;min-width:18px;padding:0 5px;margin-right:4px;border:1px solid rgba(255,255,255,.35);text-align:center;font-weight:700}
#boHud .bo-mk{position:absolute;transform:translate(-50%,-100%);font-weight:800;font-size:12px;letter-spacing:.1em;text-align:center;white-space:nowrap;text-shadow:0 1px 3px #000}
#boHud .bo-mk i{display:block;font-style:normal;font-weight:600;font-size:10px;opacity:.85}
#boHud .bo-mk.t{color:#4fd1b5}#boHud .bo-mk.h{color:#7a8590}#boHud .bo-mk.x{color:#ffd166}#boHud .bo-mk.x.edge{font-size:1.15em;text-shadow:0 0 8px #000,0 0 14px #ffd166}#boHud .bo-mk.p{color:#ff5a5a}
#boHud .bo-state{position:absolute;right:16px;bottom:16px;font-weight:800;font-size:12px;letter-spacing:.14em;padding:6px 10px;background:rgba(10,14,18,.5)}`;
    document.head.appendChild(css);
    const el = document.createElement('div'); el.id = 'boHud';
    el.innerHTML = '<div class="bo-obj"></div><div class="bo-prompt"></div><div class="bo-bar"><i></i></div><div class="bo-keys"></div><div class="bo-state"></div><div class="bo-mks"></div>';
    document.body.appendChild(el);
    HUD_BO.el = el; HUD_BO.mk = {};
    return el;
  }
  function hudShow(on) { const el = hudBuild(); el.style.display = on ? 'block' : 'none'; }
  const _pv = new THREE.Vector3();
  function marker(key, cls, label, sub, x, y, z) {
    let m = HUD_BO.mk[key];
    if (!m) { m = document.createElement('div'); m.className = 'bo-mk'; HUD_BO.el.querySelector('.bo-mks').appendChild(m); HUD_BO.mk[key] = m; }
    _pv.set(x, y, z).project(camera);
    let vis = _pv.z < 1 && Math.abs(_pv.x) < 1.1 && Math.abs(_pv.y) < 1.1, px = _pv.x, py = _pv.y, edge = false;
    // pass 16: the extract marker never leaves the screen, it sticks to the edge pointing the way
    if (!vis && cls === 'x') { if (_pv.z >= 1) { px = -px; py = -py; } const k = Math.max(Math.abs(px), Math.abs(py), 1e-3) / 0.86; px /= k; py /= k; vis = edge = true; }
    m.style.display = vis ? 'block' : 'none';
    if (!vis) return;
    m.className = 'bo-mk ' + cls + (edge ? ' edge' : '');
    const sx = (px * 0.5 + 0.5) * innerWidth; let sy = (-py * 0.5 + 0.5) * innerHeight;
    if (cls === 'p') { // pass 9: a ping (decoy) steps up above any marker it would cover
      for (let k = 0; k < 4; k++) { let hit = false; for (const o in HUD_BO.mk) { const q = HUD_BO.mk[o]; if (q === m || q.style.display === 'none' || q._x == null) continue; if (Math.abs(q._x - sx) < 110 && Math.abs(q._y - sy) < 30) { hit = true; break; } } if (!hit) break; sy -= 32; }
    }
    m._x = sx; m._y = sy;
    m.style.left = sx + 'px'; m.style.top = sy + 'px';
    const html = label + '<i>' + sub + '</i>'; if (m._h !== html) { m.innerHTML = html; m._h = html; }
  }
  function hudTick() {
    const el = hudBuild();
    const playing = MATCH.state === 'playing' && boOn();
    el.style.display = playing ? 'block' : 'none';
    if (!playing) return;
    const me = PL.ent, spy = me && me.team === SPY, g = G();
    const hk = hackedCount(), sa = teamAlive(SPY).length, ma = teamAlive(MERC).length;
    const obj = el.querySelector('.bo-obj');
    const txt = spy
      ? (extractOpen() ? 'EXTRACT OPEN · REACH HACK SPAWN' : 'HACK TERMINALS ' + hk + '/' + R.hackNeed) + ' · MERCS LEFT ' + ma
      : (extractOpen() ? 'STOP THE EXTRACT AT HACK SPAWN' : 'DEFEND TERMINALS ' + hk + '/' + R.hackNeed + ' HACKED') + ' · SPIES LEFT ' + sa;
    if (obj._t !== txt) { obj.textContent = txt; obj._t = txt; }
    const p = el.querySelector('.bo-prompt'), bar = el.querySelector('.bo-bar');
    const pr = spy && me.alive ? HUD_BO.prompt : '';
    p.style.display = pr ? 'block' : 'none'; if (p._t !== pr) { p.textContent = pr; p._t = pr; }
    bar.style.display = pr && HUD_BO.prog >= 0 ? 'block' : 'none'; bar.firstChild.style.width = Math.round(Math.max(0, HUD_BO.prog) * 100) + '%';
    const keys = el.querySelector('.bo-keys');
    const kt = spy ? '<b>E</b>hack / takedown / extract &nbsp;<b>F</b><b>LMB</b>takedown<br><b>SHIFT</b>sprint &nbsp;<b>C</b><b>CTRL</b>crouch-sneak &nbsp;<b>ALT</b>roll'
      : '<b>LMB</b>fire &nbsp;<b>RMB</b>aim &nbsp;<b>R</b>reload &nbsp;<b>L</b>flashlight';
    const kt2 = R.keysHtml ? R.keysHtml(spy, me) : kt;
    if (keys._t !== kt2) { keys.innerHTML = kt2; keys._t = kt2; }
    if (false) { keys.innerHTML = kt; keys._t = kt; }
    const st = el.querySelector('.bo-state');
    const stt = R.stateText ? R.stateText(spy, me) : spy ? (me.boRollLeft > 0 ? 'ROLL' : me.crouch ? 'SNEAKING' : me.sprinting ? 'SPRINTING' : 'WALKING') : (BO.flashOn ? 'FLASHLIGHT ON' : 'FLASHLIGHT OFF');
    if (st._t !== stt) { st.textContent = stt; st._t = stt; }
    // world markers: terminals (both roles), extract ring once open
    for (const t of R.terminals) {
      const d = me ? Math.round(hyp2(me.pos.x, me.pos.z, t.px, t.pz)) : 0;
      marker('t' + t.id, t.hacked ? 'h' : 't', 'TERMINAL ' + t.id, t.hacked ? 'HACKED' : (t.prog > 0.01 ? Math.round(t.prog * 100) + '% · ' : '') + d + ' m', t.px, 1.9, t.pz);
    }
    const X = extractPt();
    if (extractOpen()) marker('x', 'x', 'EXTRACT', (me ? Math.round(hyp2(me.pos.x, me.pos.z, X.x, X.z)) : 0) + ' m', X.x, 2.2, X.z);
    else if (HUD_BO.mk.x) HUD_BO.mk.x.style.display = 'none';
  }

  /* ---------- per frame ---------- */
  /* terminal alarm: a terminal being hacked makes noise (quiet at first, loud past 40 %), merc bots hear it and come;
     a finished hack is heard by every merc. Merc bots with nothing better to do patrol the terminals still standing. */
  const _snd = (p, who, loud) => { soundEvents.push({ pos: new THREE.Vector3(p.x, 1.2, p.z), team: SPY, who, t: MATCH.time, loud: !!loud }); while (soundEvents.length > 60) soundEvents.shift(); };
  function alarmTick(dt) {
    if (R.hackNoiseOn) return; // pass 11: 09zy owns the hack noise (sound, merc alert, bot investigation)
    for (const t of R.terminals) {
      if (t.hacked || !(t.by && t.by.alive && t.by.boInteract)) { t.alarmT = 0; continue; }
      t.alarmT = (t.alarmT || 0) - dt;
      if (t.alarmT <= 0) { t.alarmT = 1.0; _snd(t, t.by, t.prog > 0.4); }
    }
  }
  R.alarmHack = (t, who) => { _snd(t, who, true); for (const m of entities) if (!m.off && m.alive && !m.isPlayer && m.team === MERC && m.lastKnown) { m.lastKnown.set(t.x, m.pos.y, t.z); m.lastSeenT = MATCH.time - 2.5; } };
  const _pickGoal = pickGoal;
  pickGoal = function (b, now) {
    if (boOn() && b.team === MERC && R.terminals.length && Math.random() < 0.6) {
      const open = R.terminals.filter((t) => !t.hacked), L = open.length ? open : [extractPt()];
      const t = L[Math.floor(Math.random() * L.length)], a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
      return new THREE.Vector3(t.x + Math.cos(a) * r, b.pos.y, t.z + Math.sin(a) * r);
    }
    return _pickGoal(b, now);
  };
  function tick(dt) {
    rebrand();
    if (!boOn()) { if (HUD_BO.el) HUD_BO.el.style.display = 'none'; return; }
    if (MATCH.state !== 'playing') { hudTick(); R.prevKeys = Object.assign({}, KEYS); return; }
    if (!(R.netClientOn && R.netClientOn())) { const hn = Math.max(1, Math.min(R.terminals.length || 1, Math.round(G().hacksNeeded))); if (hn !== R.hackNeed) R.hackNeed = hn; }
    // terminals nobody works on cool down slowly
    for (const t of R.terminals) { if (!t.hacked && !(t.by && t.by.alive && t.by.boInteract)) { t.prog = Math.max(0, t.prog - dt * 0.12); if (t.by && !t.by.boInteract) t.by = null; } }
    alarmTick(dt);
    if (PL.ent && PL.ent.team === SPY) { rollTick(PL.ent, dt); playerSpyTick(dt); }
    for (const e of entities) {
      if (e.off) continue;
      if (!e.alive) e.respawnT = Infinity;
      if (e.team === SPY && e.model && e.model.gun) e.model.gun.visible = false;
    }
    // score line: MERCS = spies down, SPIES = terminals hacked
    const sd = entities.filter((e) => !e.off && e.team === SPY && !e.alive).length;
    MATCH.score[0] = sd; MATCH.score[1] = hackedCount();
    const scA = document.getElementById('scA'), scB = document.getElementById('scB'), lim = document.getElementById('scLim');
    if (scA) scA.textContent = String(sd); if (scB) scB.textContent = String(hackedCount());
    if (lim) lim.textContent = R.limText ? R.limText() : 'HACK ' + R.hackNeed + ' + EXTRACT · 1 LIFE';
    // wins
    if (!R.roundOver && teamAlive(SPY).length === 0 && !(R.spyCanReturn && R.spyCanReturn())) endRound(MERC, 'SPIES ELIMINATED', 'Every spy is down');
    hudTick();
    R.prevKeys = Object.assign({}, KEYS);
  }
  R.tick = tick; R.extractPt = extractPt; R.hackedCount = hackedCount; R.extractOpen = extractOpen; R.marker = marker; R.mercUnaware = mercUnaware; R.terminalNear = terminalNear;
  const _frame = frame;
  frame = function (now) {
    _frame(now);
    try {
      const dt = Math.min(0.05, (R._last != null ? (now - R._last) : 16) / 1000); R._last = now;
      tick(dt);
    } catch (err) { if (!R._errN || R._errN < 5) { R._errN = (R._errN || 0) + 1; console.warn('BLACKOUT tick', err); } }
  };
  frame._bo = frame._bo || true;
  setInterval(rebrand, 3000);
})();
