/* ==========================================================================
   BLACKOUT pass 10: the spy sidearm.
   - Every spy (player, bots, online peers) carries the suppressed M9 (BOCFG spy.gunLock, default on; spy.botGun for bots).
   - The UAL spy holds it: the gun sits in the right hand and points along the aim; the upper body blends the UAL Pistol_* clips
     (idle, aim up / neutral / down by pitch) over the legs' locomotion. Holstered during a roll, climb, hack, takedown or in the air.
   - Merc armor: a spy gun round to the body or limbs does spy.armorDmg (2) health; a headshot from spy.headKillM (2 m) or closer kills,
     farther out the M9's normal head damage applies.
   ========================================================================== */
(function () {
  if (typeof boKayUpdate !== 'function' || !window.BOCFG) return;
  const SPY = 1, MERC = 0;
  const SP = () => (BOCFG.v && BOCFG.v.spy) || BOCFG.defaults().spy;
  const on = () => typeof boIsBlackout === 'function' && boIsBlackout();
  const botDef = () => { try { return BOCFG.gunDef('m9', ['sil']) || WEAPONS.m9; } catch (e) { return WEAPONS.m9; } };
  const armed = (e) => {
    if (!e || e.team !== SPY) return false;
    if (e.isPlayer) return BOCFG.spyArmed();
    if (e.isRemote) return SP().gunLock !== false;
    return SP().botGun !== false && !!e.boM9;
  };
  BOCFG.botSpyDef = botDef;

  /* ---------- spy bots get the M9 at spawn, and may fire it ---------- */
  const _spawn = spawnEntity;
  spawnEntity = function (e) {
    const r = _spawn.apply(this, arguments);
    try {
      if (on() && e && !e.isPlayer && !e.isRemote && e.team === SPY && SP().botGun !== false) {
        const d = botDef(); e.arms = makeArms([d, d]); e.boM9 = true;
        if (e.model && e.model.gunKey !== d.key) setSoldierGun(e.model, d.key);
        if (e.model && e.model.gun) e.model.gun.visible = false;
      } else if (e) e.boM9 = false;
    } catch (err) { console.warn('BO spy m9', err); }
    return r;
  };
  // ctlShoot (06za guard) lets an M9 spy bot fire: ent.boM9

  /* ---------- merc armor vs spy rounds ---------- */
  const _ad = applyDamage;
  applyDamage = function (victim, dmg, attacker, weapon, head, dir, srcPos, life) {
    if (on() && victim && attacker && victim.alive && victim.team === MERC && attacker.team === SPY && typeof weapon === 'string' && typeof dmg === 'number') {
      const sl = attacker.arms && attacker.arms.slots && attacker.arms.slots[attacker.arms.cur];
      if (sl && sl.def && sl.def.name === weapon) {
        const S = SP(), d = attacker.pos && victim.pos ? attacker.pos.distanceTo(victim.pos) : 99;
        if (head && d <= S.headKillM) { dmg = 100000; A.last = 'headkill ' + d.toFixed(2); }
        else if (!head) { dmg = S.armorDmg; A.last = 'armor ' + d.toFixed(2); }
        else A.last = 'head ' + d.toFixed(2) + ' ' + dmg.toFixed(1);
      }
    }
    return _ad.call(this, victim, dmg, attacker, weapon, head, dir, srcPos, life);
  };
  const A = { last: '' };

  /* ---------- the UAL spy holds the M9 ---------- */
  const UPPER = /^(spine_02|spine_03|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|thumb_|index_|middle_|ring_|pinky_)/;
  function pistolActions(K) {
    if (K.pist !== undefined) return K.pist;
    K.pist = null;
    const clips = (BO.kaykit && BO.kaykit.animations) || [], get = (n) => clips.find((c) => c.name === n);
    const mk = (n) => {
      const c = get(n); if (!c) return null;
      const cl = new THREE.AnimationClip('bo_' + n, c.duration, c.tracks.filter((t) => t.name.endsWith('.quaternion') && UPPER.test(t.name.split('.')[0])));
      const a = K.mixer.clipAction(cl); a.enabled = true; a.setEffectiveWeight(0); a.play(); return a;
    };
    const p = { idle: mk('Pistol_Idle_Loop'), up: mk('Pistol_Aim_Up'), neu: mk('Pistol_Aim_Neutral'), down: mk('Pistol_Aim_Down'), rel: mk('Pistol_Reload'), w: 0, rw: 0 };
    if (p.rel) p.rel.timeScale = 0; // scrubbed by the reload progress (any reload time from the weapon stats)
    if (p.neu) K.pist = p;
    return K.pist;
  }
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _f = new THREE.Vector3();
  function gunMesh(model, K, e) {
    if (K.m9 && K.m9.key === (gunKeyOf(e))) return K.m9;
    if (K.m9) { try { K.m9.g.parent && K.m9.g.parent.remove(K.m9.g); } catch (err) {} }
    const key = gunKeyOf(e), g = buildWorldGun(key);
    const mats = [];
    g.group.traverse((o) => { if (!o.isMesh) return; o.material = o.material.clone(); mats.push(o.material); if (o.material.emissive) o.material.emissive.setHex(0x1c2329); /* a cold rim so the dark gun reads at night */ o.castShadow = true; o.frustumCulled = false; try { o.layers.mask = MASK_SCREEN; o.visible = o.userData.gunLod !== 'lo'; } catch (err) {} });
    g.group.name = 'boSpyM9';
    scene.add(g.group);
    K.m9 = { g: g.group, key, mats, muzzle: g.muzzle, kick: 0, shots: -1 };
    return K.m9;
  }
  function gunKeyOf(e) {
    const sl = e && e.arms && e.arms.slots && e.arms.slots[e.arms.cur];
    if (sl && sl.def && sl.def.key) return sl.def.key;
    return botDef().key || 'm9';
  }
  const _ku = boKayUpdate;
  boKayUpdate = function (model, e, dt, opts) {
    const K = model && model._boKay;
    if (!K || !e || !on() || e.team !== SPY) { if (K && K.m9) K.m9.g.visible = false; return _ku.apply(this, arguments); }
    const has = armed(e) && e.alive;
    const os = K.oneShot && K.oneShot.name !== 'Hit_Chest' && K.oneShot.name !== 'Hit_Head';
    const out = has && !os && !e.boAnim && !e.boClimb && !e.boInteract && !(e.boRollT > 0) && !(e.boTakedownT > 0) && !(e.onGround === false && K.airT > 0.12) && !K.kneeling;
    const p = has || (K.pist && K.pist.w > 0.01) ? pistolActions(K) : K.pist;
    if (p) {
      const k = 1 - Math.exp(-12 * Math.min(0.05, dt || 0.016));
      p.w += ((out ? 1 : 0) - p.w) * k;
      const pitch = e.isPlayer ? PL.pitch : (e.pitch || 0);
      const up = Math.max(0, Math.min(1, pitch / 0.9)), dn = Math.max(0, Math.min(1, -pitch / 0.9));
      const W = p.w * 4; // over the locomotion (weight 1): the arms and chest follow the pistol pose
      if (p.up) p.up.setEffectiveWeight(W * up); if (p.down) p.down.setEffectiveWeight(W * dn);
      // reload: the UAL Pistol_Reload clip, scrubbed along Riposte's reload timer (player and bots)
      const RL = e.arms && e.arms.reload, rr = RL && !RL.tube && RL.dur > 0 ? Math.min(1, RL.t / RL.dur) : -1;
      const rwT = rr >= 0 && out ? Math.min(1, rr / 0.08, (1 - rr) / 0.1) : 0;
      p.rw += (rwT - p.rw) * Math.min(1, k * 1.6);
      if (p.rel) { if (rr >= 0) p.rel.time = rr * p.rel.getClip().duration * 0.98; p.rel.setEffectiveWeight(W * p.rw); }
      const aw = p.rel ? 1 - p.rw : 1;
      if (p.up) p.up.setEffectiveWeight(W * up * aw); if (p.down) p.down.setEffectiveWeight(W * dn * aw);
      p.neu.setEffectiveWeight(W * (1 - up - dn) * aw);
      if (p.idle) p.idle.setEffectiveWeight(0);
    }
    const r = _ku.apply(this, arguments);
    // the gun: in the right hand, along the aim
    const G = (has && K.bones.hand_r) ? gunMesh(model, K, e) : K.m9;
    if (G) {
      const show = has && p && p.w > 0.35;
      G.g.visible = !!show && K.holder.visible !== false;
      if (G.g.visible) {
        const yaw = e.isPlayer ? PL.yaw : (e.yaw || 0), pitch = e.isPlayer ? PL.pitch : (e.pitch || 0);
        const sh = e.arms ? e.arms.shots : 0;
        if (G.shots >= 0 && sh !== G.shots) G.kick = 1;
        G.shots = sh; G.kick = Math.max(0, G.kick - (dt || 0.016) * 9);
        K.bones.hand_r.getWorldPosition(_v);
        const rl = (p && p.rw) || 0; // reloading: the muzzle tips up and the gun rolls in toward the off hand
        _e.set(pitch * (1 - rl) + G.kick * 0.22 + rl * 0.95, yaw + rl * 0.45, rl * 0.6); _q.setFromEuler(_e);
        _f.set(0, 0, -1).applyQuaternion(_q);
        G.g.position.copy(_v).addScaledVector(_f, 0.04 - G.kick * 0.03);
        G.g.position.y += 0.03;
        G.g.quaternion.copy(_q);
        G.g.updateMatrixWorld(true);
        const op = K._fade || 1;
        for (const m of G.mats) { m.transparent = op < 0.99; m.opacity = op; }
        // Riposte's hidden soldier gun follows it, so bot tracers and muzzle flashes leave this muzzle
        if (model.gun && model.root) {
          model.root.updateMatrixWorld(true);
          _m.copy(model.root.matrixWorld).invert().multiply(G.g.matrixWorld);
          _m.decompose(model.gun.position, model.gun.quaternion, model.gun.scale);
        }
      }
    }
    return r;
  };
  // the player's own spy body is drawn through the OTS camera: same path. Remove the hand-held gun with the body.
  // world muzzle of a spy's hand-held gun (shot light and flash of the player's own spy, whose first-person gun is hidden)
  const _mz = new THREE.Vector3();
  function muzzleOf(e) {
    const K = e && e.model && e.model._boKay, G = K && K.m9;
    if (!G || !G.g.visible) return null;
    G.g.updateMatrixWorld(true);
    return G.muzzle && G.muzzle.isVector3 ? _mz.copy(G.muzzle).applyMatrix4(G.g.matrixWorld) : _mz.copy(G.g.position); // muzzle: local point of the gun group
  }
  window.BOM9 = { A, armed, botDef, muzzleOf };
})();
