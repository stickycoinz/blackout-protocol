/* ==========================================================================
   BLACKOUT pass 24: spy aim, own look online.
   - Aim assist and auto fire (touch, pad, trackpad) measured the target from PL.pitch, but the spy camera looks BO.pitchOff lower
     (06za). The snap then left the crosshair 8 degrees under the enemy and auto fire shot where the crosshair was not. For the
     spy in third person they now run on the view pitch, so the snap lands the crosshair on the target and the shot follows it.
   - The spy's sidearm spread in third person is spy.otsSpread times the normal spread (F10 > Spy kit), so a shot goes where the
     crosshair is instead of up to a couple of degrees around it (there is no spread circle on the spy crosshair).
   - Own look: a guest who customised his look (dithering, palette, contrast...) keeps it on his own screen when a friend hosts
     (Options > Video > "Use my own look when not hosting", on by default). A guest who never changed it gets the host's look,
     as before. The host's look still goes to everyone when he hosts. Look edits made while a guest are kept as his own.
   ========================================================================== */
(function () {
  const SPY = 1;
  if (typeof BO === 'undefined' || !window.BOCFG) return;
  const P24 = window.BO_P24 = { aimFix: 0, ownLook: 0, hostLook: null, log: [] };
  const otsOn = () => { try { return boIsSpy() && PL.ent && PL.ent.alive && MATCH.state === 'playing'; } catch (e) { return false; } };
  const SP = () => (BOCFG.v && BOCFG.v.spy) || {};

  /* ---------- aim assist on the spy view pitch ---------- */
  if (typeof aimAssist === 'function') {
    const _aa = aimAssist;
    aimAssist = function (dt) {
      if (!otsOn() || P24.noAimFix) return _aa.apply(this, arguments); // noAimFix: test switch only
      const off = BO.pitchOff || 0;
      PL.pitch -= off; P24.aimFix++;
      try { return _aa.apply(this, arguments); } finally { PL.pitch += off; }
    };
  }

  /* ---------- spy shot spread in third person ---------- */
  let otsK = 0;
  if (typeof ctlShoot === 'function' && typeof coneDir === 'function') {
    const _cs = ctlShoot, _cd = coneDir;
    ctlShoot = function (ent) {
      if (ent !== (PL && PL.ent) || !otsOn()) return _cs.apply(this, arguments);
      otsK = Math.max(0, Math.min(1, SP().otsSpread != null ? +SP().otsSpread : 0.5));
      try { return _cs.apply(this, arguments); } finally { otsK = 0; }
    };
    coneDir = function (dir, angle) { return _cd.call(this, dir, otsK ? angle * otsK : angle); };
  }

  /* ---------- own look when a friend hosts ---------- */
  if (Settings.boOwnLook === undefined) Settings.boOwnLook = true;
  const KEY = 'bo_cfg_v1';
  const J = (o) => JSON.stringify(o);
  const clone = (o) => JSON.parse(J(o));
  const defLook = J(BOCFG.defaults().look);
  let mine = null; // my own saved look
  function readMine() {
    try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && raw.look) { mine = BOCFG.sanitize({ look: raw.look }).look; return; } } catch (e) {}
    mine = null;
  }
  readMine();
  const custom = () => !!mine && J(mine) !== defLook;
  const guest = () => { try { return !!BOCFG.remote && NET.role === 'client'; } catch (e) { return false; } };
  const active = () => guest() && Settings.boOwnLook !== false && custom();
  P24.active = active; P24.custom = custom; P24.mine = () => mine; P24.readMine = readMine;
  let fromHost = 0, lastPut = '';
  // local saves (not a guest): my look follows them
  const _sn = BOCFG.saveNow, _sv = BOCFG.save;
  BOCFG.saveNow = function () { const r = _sn.apply(this, arguments); if (!this.remote && this.v && this.v.look) mine = clone(this.v.look); return r; };
  BOCFG.save = function () { const r = _sv.apply(this, arguments); if (!this.remote && this.v && this.v.look) mine = clone(this.v.look); return r; };
  function keepMine() {
    try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; raw.look = clone(mine); localStorage.setItem(KEY, J(raw)); } catch (e) {}
  }
  // before any look apply: as a guest, the host's look is kept aside and mine goes on screen
  function pick() {
    if (!guest() || !BOCFG.v || !BOCFG.v.look) return;
    const cur = J(BOCFG.v.look);
    if (fromHost) { if (cur !== lastPut) P24.hostLook = clone(BOCFG.v.look); }
    else if (cur !== lastPut && active()) { mine = clone(BOCFG.v.look); keepMine(); P24.log.push('guest look edit kept'); } // a look edit in F10 while a guest: it is mine
    if (active()) { BOCFG.v.look = clone(mine); lastPut = J(BOCFG.v.look); P24.ownLook++; }
    else if (P24.hostLook && J(BOCFG.v.look) !== J(P24.hostLook)) { BOCFG.v.look = clone(P24.hostLook); lastPut = J(BOCFG.v.look); }
    else lastPut = J(BOCFG.v.look);
  }
  const _all = BOCFG.applyAll, _sec = BOCFG.applySection;
  BOCFG.applyAll = function () { try { pick(); } catch (e) {} return _all.apply(this, arguments); };
  BOCFG.applySection = function (s) { if (s === 'look') { try { pick(); } catch (e) {} } return _sec.apply(this, arguments); };
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) {
      const h = m && (m.t === 'bocfg' || m.t === 'bocfgc' || m.t === 'start');
      if (h) fromHost++;
      try { return _cm.apply(this, arguments); } finally { if (h) fromHost--; }
    };
  }
  if (typeof netReset === 'function') {
    const _nr = netReset;
    netReset = function () { P24.hostLook = null; lastPut = ''; const r = _nr.apply(this, arguments); readMine(); return r; };
  }
  // the Options switch: applies at once
  function lookToggled() {
    try {
      if (!guest()) return;
      if (active()) BOCFG.v.look = clone(mine); else if (P24.hostLook) BOCFG.v.look = clone(P24.hostLook);
      lastPut = J(BOCFG.v.look); if (window.BOPOST) BOPOST.apply(BOCFG.v.look);
    } catch (e) {}
  }
  P24.lookToggled = lookToggled;
  try {
    const vid = OPT_TABS.find((t) => Array.isArray(t[1]) && t[0] === _t('Vidéo')) || OPT_TABS[2];
    if (vid && Array.isArray(vid[1]) && !vid[1].some((r) => r[1] === 'boOwnLook')) {
      vid[1].push(['head', 'BLACKOUT'], ['check', 'boOwnLook', 'Use my own look when not hosting (your dithering, palette and contrast stay on your screen when a friend hosts; off: you see the host\u0027s look)', lookToggled]);
    }
  } catch (e) { console.warn('BO options row', e); }
})();
