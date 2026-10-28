/* BLACKOUT pass 19: the spy pistol light. A small weapon light under the M9 barrel, toggled with its own key (the
   'torch' action, L by default like the merc flashlight, rebindable to any key or mouse button in Options > Controls).
   - It is ON when the spy spawns (Spy kit > Pistol light > torchOn), so a spy can always see in a dark map.
   - Lights: no light is ever added or removed at runtime (that recompiles every program). The local spy borrows the
     merc flashlight pair (BO.flash hot beam + BO.flashSpill), moved from the camera into the world and aimed from the lens
     to the crosshair; other spies (peers, bots) with the light on share the merc pool lights (BO_BOTLIGHTS) and beam cones.
   - Online: the on / off state rides the spy move packet ('boa', bit 64); the beam follows the synced yaw and pitch.
   - Gameplay: a lit spy cannot cloak (09zt), bots notice him faster (09zo, torchSee), a beam in a bot's face turns it.
   - Low exposure: with torchBoost the light is scaled up when exposure x brightness is under the default, so it still reads. */
(function () {
  if (typeof THREE === 'undefined' || !window.BOCFG || !window.BOM9) return;
  const SPY = 1;
  const SP = () => Object.assign({}, BOCFG.defaults().spy, (BOCFG.v && BOCFG.v.spy) || {});
  const on = () => { try { return boIsBlackout() && MATCH.state !== 'menu'; } catch (e) { return false; } };
  if (BO.spyTorch == null) BO.spyTorch = true;

  /* is this spy's pistol light lit? */
  function lit(e) {
    if (!e || e.team !== SPY || !e.alive || e.off || !on() || !BOM9.armed(e)) return false;
    return e.isPlayer ? !!BO.spyTorch : !!e.boTorch;
  }
  /* exposure compensation: the default look (exposure 1.4, brightness 1) is 1; darker settings push the light up (max 6x) */
  function boost() {
    const S = SP(); if (S.torchBoost === false) return 1;
    const v = BOCFG.v || {}, ex = (v.light && v.light.exposure) || 1.4, br = (v.look && v.look.brightness) || 1;
    return Math.max(1, Math.min(6, 1.4 / Math.max(0.05, ex * br)));
  }

  /* ---------- the light model: a short body with a lens, under the barrel ---------- */
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.55, metalness: 0.6, emissive: new THREE.Color(0x1c2329) });
  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c); return glowTex;
  }
    function addModel(G) {
    if (G.torch) return G.torch;
    // where the frame starts under the slide: the first 1 cm slice (from the muzzle back) that reaches well below the bore.
    // A rail light hangs under that dust cover, its front a little past it (a suppressor stays clear above).
    const mz = G.muzzle && G.muzzle.isVector3 ? G.muzzle : new THREE.Vector3(0, 0.03, -0.2), sl = new Map();
    for (const o of G.g.children) {
      if (!o.isMesh || !o.geometry || o.userData.gunLod === 'lo') continue;
      const a = o.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { const z = Math.round(a.getZ(i) * 100), y = a.getY(i); sl.set(z, Math.min(sl.has(z) ? sl.get(z) : 9, y)); }
    }
    let zf = null, yb = null;
    for (const z of [...sl.keys()].sort((p, q) => p - q)) if (z * 0.01 > mz.z && sl.get(z) < mz.y - 0.05) { zf = z; break; }
    if (zf != null) { yb = 9; for (const [z, y] of sl) if (z >= zf && z <= zf + 3) yb = Math.min(yb, y); }
    const len = 0.072, w = 0.03, h = 0.032;
    const front = zf != null ? zf * 0.01 - 0.062 : mz.z + 0.014, y = zf != null ? yb - h / 2 - 0.002 : mz.y - 0.036;
    const grp = new THREE.Group(); grp.name = 'boSpyTorch';
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), BODY_MAT.clone());
    body.position.set(0, y, front + len / 2);
    const mount = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.008, len * 0.45), body.material); // the rail clamp
    mount.position.set(0, y + h / 2 + 0.003, front + len * 0.6);
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.01, 16), body.material);
    bezel.rotation.x = Math.PI / 2; bezel.position.set(0, y, front + 0.004);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x222830 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.013, 16), lensMat);
    lens.rotation.y = Math.PI; lens.position.set(0, y, front - 0.0015); // the circle faces +z: turned to face down the barrel (-z)
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const glow = new THREE.Sprite(glowMat); glow.scale.set(0.065, 0.065, 1); glow.position.set(0, y, front - 0.01);
    for (const o of [body, mount, bezel, lens, glow]) { o.frustumCulled = false; o.userData.noRay = true; o.castShadow = o !== lens && o !== glow; try { o.layers.mask = MASK_SCREEN; } catch (err) {} grp.add(o); }
    G.g.add(grp);
    G.mats.push(body.material);
    G.torch = { grp, lens, lensMat, glow, glowMat, pos: new THREE.Vector3(0, y, front - 0.004) };
    return G.torch;
  }
  const _tc = new THREE.Color(), _q = new THREE.Quaternion();
  function lensState(G, isOn) {
    const T = G.torch; if (!T) return;
    const S = SP();
    if (isOn) { boKelvin(S.torchTemp, '#ffffff', _tc); T.lensMat.color.copy(_tc); T.glowMat.color.copy(_tc); T.glowMat.opacity = 0.8; }
    else { T.lensMat.color.setHex(0x222830); T.glowMat.opacity = 0; }
  }

  /* pose of a spy's light: lens position and beam direction (world). Gun out: from the lens down the barrel. Holstered: from the chest along the aim. */
  const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _cf = new THREE.Vector3();
  function pose(e, outP, outD) {
    const K = e.model && e.model._boKay, G = K && K.m9;
    if (G && G.g.visible && G.torch) {
      G.g.updateMatrixWorld(true);
      outP.copy(G.torch.pos).applyMatrix4(G.g.matrixWorld);
      outD.set(0, 0, -1).applyQuaternion(G.g.getWorldQuaternion(_q));
    } else {
      const yaw = e.isPlayer ? PL.yaw : (e.lookYaw != null ? e.lookYaw : e.yaw || 0), pit = Math.max(-1.2, Math.min(1.2, e.isPlayer ? PL.pitch : e.pitch || 0));
      entChest(e, outP);
      outD.set(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)).normalize();
      outP.addScaledVector(outD, 0.35);
    }
    if (e.isPlayer && boIsSpy()) { // the local spy: the beam lands where the crosshair is
      camera.getWorldPosition(_c); camFwd(_cf);
      const R = SP().torchRange; let t = R;
      try { const h = rayWorld(_c.x, _c.y, _c.z, _cf.x, _cf.y, _cf.z, R); if (h && h.t > 0.5) t = h.t; } catch (err) {}
      _c.addScaledVector(_cf, t);
      const dx = _c.x - outP.x, dy = _c.y - outP.y, dz = _c.z - outP.z, L = Math.hypot(dx, dy, dz);
      if (L > 0.6) { const nd = _d.set(dx / L, dy / L, dz / L); if (nd.dot(outD) > 0.2) outD.copy(nd); }
    }
    return outP;
  }

  /* the gun model gets its light; the lens glows when lit */
  const _ku = boKayUpdate;
  boKayUpdate = function (model, e, dt) {
    const r = _ku.apply(this, arguments);
    try {
      const K = model && model._boKay, G = K && K.m9;
      if (G && e && e.team === SPY) {
        addModel(G); lensState(G, lit(e));
        if (e === PL.ent) placeMine();
      }
    } catch (err) { console.warn('BO spylight', err); }
    return r;
  };

  /* ---------- the local spy borrows the merc flashlight pair, in the world ---------- */
  function parentTo(spy) {
    const fl = BO.flash, sp = BO.flashSpill; if (!fl || !sp) return;
    if (spy) { if (fl.parent !== scene) for (const o of [fl, fl.target, sp, sp.target]) scene.add(o); return; }
    if (fl.parent === camera) return;
    for (const o of [fl, fl.target, sp, sp.target]) camera.add(o);
    fl.position.set(0.08, -0.05, 0.02); sp.position.set(0.08, -0.05, 0.02); // boEnsureFlash's camera-local placement
    fl.target.position.set(0, -0.15, -10); sp.target.position.set(0, -0.25, -10);
  }
  function placeMine() {
    const e = PL.ent; if (!e || !BO.flash || BO.flash.parent !== scene) return;
    pose(e, _p, _d);
    for (const L of [BO.flash, BO.flashSpill]) { L.position.copy(_p); L.target.position.copy(_p).addScaledVector(_d, 10); L.updateMatrixWorld(); L.target.updateMatrixWorld(); }
  }
  function spot(L, S, F, I, spill, col) {
    const half = S.torchAngle * Math.PI / 180;
    L.intensity = I; L.decay = F.flashDecay; L.color.copy(col);
    if (spill) { L.angle = Math.min(1.45, half * Math.max(1, F.flashSpillW * 0.85)); L.penumbra = 1; L.distance = S.torchRange * 0.6; }
    else { L.angle = Math.min(1.45, half); L.penumbra = F.flashSoft; L.distance = S.torchRange; }
  }
  const _col = new THREE.Color(), _cam = new THREE.Vector3(), _pp = new THREE.Vector3(), _dd = new THREE.Vector3();
  const _uf = boUpdateFlash;
  boUpdateFlash = function () {
    const spyMe = !!(BO.armed && boIsSpy());
    try { parentTo(spyMe); } catch (err) {}
    _uf.apply(this, arguments);
    if (!BO.armed) return;
    try {
      const S = SP(), F = boFL(), b = boost(), spill = Math.max(0, Math.min(1, F.flashSpill));
      boKelvin(S.torchTemp, '#ffffff', _col);
      const me = PL.ent;
      if (me && me.team === SPY) me.boTorch = lit(me); // sent to the other players (09zzc 'boa' bit 64)
      if (spyMe) {
        const I = lit(me) && MATCH.state === 'playing' ? S.torchI * b : 0;
        spot(BO.flash, S, F, I * (1 - spill * 0.5), false, _col);
        spot(BO.flashSpill, S, F, I * spill, true, _col);
        if (I > 0) placeMine();
      }
      // other spies with their light on: they take pool lights (a lit spy ranks ahead of a merc at the same distance) and beam cones
      if (MATCH.state !== 'playing') return;
      const spies = entities.filter((e) => e !== me && lit(e) && e.model && e.model.root && e.model.root.visible !== false);
      if (!spies.length) return;
      const cam = camera.getWorldPosition(_cam);
      const mercs = entities.filter(boMercLit);
      const all = mercs.map((e) => ({ e, s: false, d: e.pos.distanceToSquared(cam) })).concat(spies.map((e) => ({ e, s: true, d: e.pos.distanceToSquared(cam) * 0.4 })));
      all.sort((a, c) => a.d - c.d);
      boKelvin(F.flashTemp, F.flashColor, _boFlCol);
      for (let i = 0; i < BO_BOTLIGHTS.length; i++) {
        const L = BO_BOTLIGHTS[i], it = all[i];
        if (!it) { L.intensity = 0; continue; }
        if (it.s) { pose(it.e, _pp, _dd); L.position.copy(_pp); L.target.position.copy(_pp).addScaledVector(_dd, 10); spot(L, S, F, S.torchI * b * 0.9, false, _col); L.angle = Math.min(1.45, L.angle * (1 + spill * 0.6)); continue; }
        if (F.flashI <= 0) { L.intensity = 0; continue; }
        boMercAim(it.e); L.position.copy(_boEye); L.target.position.copy(_boEye).addScaledVector(_boDir, 10);
        boSetSpot(L, F, F.flashI * 0.85, false);
        L.angle = Math.min(1.45, L.angle * (1 + spill * 0.6));
      }
      // beams: the mercs keep theirs (06za); the spies take the cones after them
      let bi = Math.min(BO_BEAMS.length, F.flashBeam > 0 && F.flashI > 0 ? mercs.length : 0);
      const beamA = F.flashBeam > 0 ? F.flashBeam : 0.35;
      for (const e of spies) {
        const m = BO_BEAMS[bi++]; if (!m) break;
        pose(e, _pp, _dd);
        const len = Math.min(S.torchRange * 0.45, 14) * Math.min(1, beamA / 0.35 + 0.3), rad = Math.tan(Math.min(1.2, S.torchAngle * Math.PI / 180)) * len * 0.8;
        m.position.copy(_pp); m.lookAt(_pp.x - _dd.x, _pp.y - _dd.y, _pp.z - _dd.z);
        m.scale.set(rad, rad, len); m.visible = true;
      }
    } catch (err) { console.warn('BO spylight', err); }
  };

  /* ---------- the key: toggles the light while playing a spy with the M9 ---------- */
  addEventListener('keydown', (e) => {
    if (e.repeat || !window.BOKEYS || e.code !== BOKEYS.code('torch')) return;
    try {
      if (!boIsSpy() || MATCH.state !== 'playing' || !PL.ent || !PL.ent.alive) return;
      if ((typeof CHAT !== 'undefined' && CHAT.open) || (window.BOLOADOUT && BOLOADOUT.isOpen())) return;
      if (!BOM9.armed(PL.ent)) return;
      BO.spyTorch = !BO.spyTorch;
      try { sfxUi('click'); } catch (err) {}
    } catch (err) {}
  });

  /* ---------- each spawn: the light starts in its configured state ---------- */
  const _spawn = spawnEntity;
  spawnEntity = function (e) {
    const r = _spawn.apply(this, arguments);
    try { if (e && e.isPlayer && e.team === SPY) BO.spyTorch = SP().torchOn !== false; if (e && !e.isPlayer && !e.isRemote) e.boTorch = false; } catch (err) {}
    return r;
  };

  /* ---------- bots: a beam in the face turns a merc bot toward the light ---------- */
  const _bs = botSense, _bv = new THREE.Vector3(), _be = new THREE.Vector3();
  botSense = function (b, now) {
    const r = _bs.apply(this, arguments);
    try {
      if (!on() || b.team === SPY || !b.alive) return r;
      const S = SP(), last = b._boTorchT || now; b._boTorchT = now;
      const dt = Math.max(0, Math.min(0.5, now - last));
      for (const e of entities) {
        if (!lit(e)) continue;
        pose(e, _p, _d);
        entEye(b, _be);
        _bv.copy(_be).sub(_p); const dist = _bv.length(); if (dist > S.torchRange * 1.3 || dist < 0.3) continue;
        _bv.multiplyScalar(1 / dist);
        if (_bv.dot(_d) < Math.cos(Math.min(1.4, S.torchAngle * Math.PI / 180 * 1.6))) continue; // not in the beam
        if (!lineClear(_p, _be)) continue;
        const a0 = b.aw.get(e) || 0, gain = 0.9 * (1 - dist / (S.torchRange * 1.3)) * Math.max(1, S.torchSee) * dt;
        const a1 = Math.min(1, a0 + gain); b.aw.set(e, a1);
        if (a1 > 0.35 && now - (b._boTorchLook || 0) > 1.2) { b._boTorchLook = now; botLookAt(b, e.pos, now, 1.1); b.warnT = now + 8; }
      }
    } catch (err) {}
    return r;
  };

  /* ---------- HUD: the state line says whether the light is on ---------- */
  const R = window.BO_RULES;
  if (R && R.stateText) {
    const _st = R.stateText;
    R.stateText = function (spy, me) {
      const s = _st.apply(this, arguments);
      if (!spy || !me || !BOM9.armed(me)) return s;
      return (s ? s + ' · ' : '') + (BO.spyTorch ? 'LIGHT ON' : 'LIGHT OFF');
    };
  }

  window.BOSPYLIGHT = { on: lit, see: () => Math.max(1, SP().torchSee || 1), pose, boost };
})();
