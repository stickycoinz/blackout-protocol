/* ==========================================================================
   BLACKOUT: Quaternius UAL spy body + velocity-blended AnimationMixer, OTS camera,
   merc flashlight. Builds on Riposte itself (weapon recoil/ADS kept).
   ========================================================================== */
const BO = window.BO = {
  role: 'merc', // 'merc' | 'spy' - set before deploy via ?role= or UI
  ready: false,
  kaykit: null, // shared UAL GLTF (name kept for call-site compat)
  kaykitPromise: null,
  spyBody: 'ual',
  frameNow: null,
  weapons: {}, // key -> gltf scene
  weaponsPromise: null,
  flash: null,
  flashTarget: null,
  flashOn: true,
  // Classic shooter OTS: ~2.2 m back, 0.7 m right, 0.3 m above head
  camDist: 2.2,
  camSide: 0.7,
  camHeight: 1.95, // ~head(1.65)+0.3
  camFadeUnder: 0.5,
  camMinComfort: 1.2,
  _look: new THREE.Vector3(),
  _ideal: new THREE.Vector3(),
  _tmp: new THREE.Vector3(),
  _q: new THREE.Quaternion(),
};

(function boReadRole() {
  try {
    const r = new URLSearchParams(location.search).get('role');
    if (r === 'spy' || r === 'merc') BO.role = r;
    else if (localStorage.getItem('bo_role') === 'spy') BO.role = 'spy';
  } catch (e) {}
})();

function boIsBlackout() { return !!(typeof CURMAP !== 'undefined' && CURMAP && CURMAP.id === 'blackout'); }
/* the spy role only exists in a BLACKOUT match: a role saved in localStorage must not leak into normal Riposte matches */
function boIsSpy() { return BO.role === 'spy' && boIsBlackout(); }

function boModelUrl(rel) {
  // dist/riposte-frontline(.html) → dist/models/...
  try {
    const u = new URL(location.href);
    // strip query and filename
    let path = u.pathname.replace(/\/[^/]*$/, '/');
    if (!path.endsWith('/')) path += '/';
    return path + rel;
  } catch (e) { return './' + rel; }
}

/* Spy body: Quaternius Universal Animation Library (CC0, UAL1_Standard.glb, in-place clips).
   Function names keep the old "Kaykit" prefix for call-site compat (09zo-blackout-mode.js). */
const BO_UAL = {
  file: 'models/character/UAL1_Standard.glb',
  // measured in-place stride speeds (m/s at timeScale 1) - all loops start left foot forward
  nat: { Walk_Loop: 1.3, Jog_Fwd_Loop: 3.2, Sprint_Loop: 5.0, Crouch_Fwd_Loop: 0.9 },
  loops: ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Jump_Loop', 'Fixing_Kneeling'],
  once: ['Jump_Start', 'Jump_Land', 'Roll', 'Interact', 'Punch_Cross', 'Death01', 'Hit_Chest'],
  // legacy names used elsewhere -> UAL clips
  alias: { Idle: 'Idle_Loop', Walk: 'Walk_Loop', Run: 'Jog_Fwd_Loop', Jump: 'Jump_Loop', Hop: 'Jump_Loop',
    Roll: 'Roll', Interact: 'Interact', Hack: 'Fixing_Kneeling', Takedown: 'Punch_Cross', Defeat: 'Death01', Hit: 'Hit_Chest' },
  spine: ['spine_01', 'spine_02', 'spine_03'],
};

function boLoadKaykit() {
  if (BO.kaykit) return Promise.resolve(BO.kaykit);
  if (BO.kaykitPromise) return BO.kaykitPromise;
  const loader = new THREE.GLTFLoader();
  BO.kaykitPromise = new Promise((res, rej) => {
    loader.load(boModelUrl(BO_UAL.file), (gltf) => { BO.kaykit = gltf; BO.spyBody = 'ual'; res(gltf); }, undefined, rej);
  });
  return BO.kaykitPromise;
}

const BO_WEP_FILES = {
  m4: 'machinegun.glb', ak: 'machinegun.glb', scar: 'machinegun.glb',
  mp5: 'uzi.glb', uzi: 'uzi.glb', vector: 'uzi.glb',
  m9: 'pistol.glb', deagle: 'pistol.glb', revolver: 'pistol.glb',
  shotgun: 'shotgun.glb', spas: 'shotgun.glb',
  sniper: 'sniper.glb', awp: 'sniper.glb',
  knife: 'knife_sharp.glb',
};
function boLoadWeapons() {
  if (BO.weaponsPromise) return BO.weaponsPromise;
  const loader = new THREE.GLTFLoader();
  const files = [...new Set(Object.values(BO_WEP_FILES))];
  BO.weaponsPromise = Promise.all(files.map((f) => new Promise((res) => {
    loader.load(boModelUrl('models/weapons/' + f), (gltf) => { BO.weapons[f] = gltf.scene; res(); }, undefined, () => res());
  })));
  return BO.weaponsPromise;
}

/* Clone the UAL mannequin onto a soldier: hide Riposte procedural body, drive our own mixer */
function boAttachKaykit(model, tint) {
  if (!BO.kaykit || !model) return;
  if (model._boKay && model._boKay.holder) {
    try { model._boKay.holder.parent && model._boKay.holder.parent.remove(model._boKay.holder); } catch (e) {}
    model._boKay = null;
  }
  if (typeof scene !== 'undefined') {
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const c = scene.children[i];
      if (c && c.name === 'boSpyBody' && c.userData && c.userData.boModel === model) scene.remove(c);
    }
  }
  const clone = (THREE.SkeletonUtils && THREE.SkeletonUtils.clone) ? THREE.SkeletonUtils.clone(BO.kaykit.scene) : BO.kaykit.scene.clone(true);
  const targetH = 1.8;  // UAL mannequin is ~1.83 m natively; Riposte soldiers ~1.8 m
  clone.scale.setScalar(targetH / 1.83);

  // Dark pixel-art palette: slate suit, near-black joints/gloves, faint cold rim so it reads in the dark
  const suitCol = new THREE.Color(0x1d262c);
  if (tint != null) suitCol.lerp(new THREE.Color(tint), 0.15);
  const bodyMats = [];
  clone.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    try { o.layers.mask = (typeof MASK_SCREEN !== 'undefined') ? MASK_SCREEN : 1; } catch (e) {}
    const src = o.material || {};
    const joints = /Joint/i.test(src.name || '');
    const m = new THREE.MeshStandardMaterial({
      color: joints ? 0x0a0c0f : suitCol, roughness: joints ? 0.55 : 0.82, metalness: joints ? 0.35 : 0.08,
      emissive: joints ? 0x000000 : 0x061418, emissiveIntensity: 1.0, transparent: false,
    });
    m.name = joints ? 'boSpyJoints' : 'boSpySuit';
    o.material = m; bodyMats.push(m);
  });

  if (model.lod) for (const k of ['hi', 'lo']) if (model.lod[k]) model.lod[k].visible = false;
  if (model.gun) model.gun.visible = false;

  const holder = new THREE.Group();
  holder.name = 'boSpyBody';
  holder.add(clone);
  holder.userData.boModel = model;
  if (typeof scene !== 'undefined') scene.add(holder); else model.root.add(holder);

  const mixer = new THREE.AnimationMixer(clone);
  const actions = {}, durs = {};
  for (const clip of BO.kaykit.animations) {
    if (!BO_UAL.loops.includes(clip.name) && !BO_UAL.once.includes(clip.name)) continue;
    const a = mixer.clipAction(clip);
    if (BO_UAL.once.includes(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.enabled = true; a.setEffectiveWeight(0); a.play();
    actions[clip.name] = a; durs[clip.name] = clip.duration;
  }
  const bones = {};
  clone.traverse((o) => { if (o.isBone) bones[o.name] = o; });

  const K = model._boKay = {
    holder, clone, mixer, actions, durs, bones, w: {}, current: 'Idle_Loop', yawOff: Math.PI,
    goggleMats: [], bodyMats, _fade: 1, isUAL: true, headH: 1.5, phase: 0, legYaw: 0, rev: 1,
    oneShot: null, wasAir: false, airT: 0, lastHealth: null, dead: false,
  };
  for (const n in actions) K.w[n] = n === 'Idle_Loop' ? 1 : 0;

  // Red visor strip + faint red glow on the head (placed from the idle pose so it sits on the face)
  actions.Idle_Loop.setEffectiveWeight(1); mixer.update(0); holder.updateMatrixWorld(true);
  const head = bones.Head;
  if (head) {
    const hp = head.getWorldPosition(new THREE.Vector3());
    const hq = head.getWorldQuaternion(new THREE.Quaternion());
    const hs = head.getWorldScale(new THREE.Vector3());
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x1a0004, emissive: 0xff1a2e, emissiveIntensity: 2.2, metalness: 0.4, roughness: 0.3 }));
    visor.name = 'boGoggle';
    // world target: ~9 cm above the head bone, on the face (+Z is the mannequin's front)
    const wp = hp.clone().add(new THREE.Vector3(0, 0.08, 0.15));
    visor.position.copy(head.worldToLocal(wp.clone()));
    visor.quaternion.copy(hq.clone().invert());
    visor.scale.set(1 / hs.x, 1 / hs.y, 1 / hs.z);
    head.add(visor);
    K.goggleMats.push(visor.material);
    // (no PointLight on the visor: a light added mid-match changes the light count and makes three.js rebuild every lit program)
    K.headH = hp.y + 0.1;
  }
  // Red accent the OTS camera actually sees: a thin strobe strip across the upper back (spine_03)
  const sp3 = bones.spine_03;
  if (sp3) {
    const bp = sp3.getWorldPosition(new THREE.Vector3());
    const bq = sp3.getWorldQuaternion(new THREE.Quaternion());
    const bs = sp3.getWorldScale(new THREE.Vector3());
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1a0004, emissive: 0xff1a2e, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.4 }));
    strip.name = 'boGoggle';
    strip.position.copy(sp3.worldToLocal(bp.clone().add(new THREE.Vector3(0, 0.1, -0.135))));
    strip.quaternion.copy(bq.clone().invert());
    strip.scale.set(1 / bs.x, 1 / bs.y, 1 / bs.z);
    sp3.add(strip);
    K.goggleMats.push(strip.material);
  }
  boKayApplyWeights(K, 1);
}

/* Fire a one-shot clip (Roll, Punch_Cross, Hit_Chest, Interact, Jump_Start/Land, Death01) */
function boKayOneShot(model, name, dur, fade) {
  const K = model && model._boKay; if (!K) return;
  name = BO_UAL.alias[name] || name;
  const a = K.actions[name]; if (!a) return;
  a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  const natural = K.durs[name];
  const len = dur || natural;
  a.timeScale = natural / len;
  K.oneShot = { name, t: 0, len, fade: fade == null ? 0.1 : fade, hold: name === 'Death01' };
  K.current = name;
}

/* Legacy entry point: loops are chosen by the state machine; one-shot names are routed */
function boKayPlay(model, name, fade) {
  const K = model && model._boKay; if (!K) return;
  const n = BO_UAL.alias[name] || name;
  if (BO_UAL.once.includes(n) && n !== 'Jump_Start' && n !== 'Jump_Land') {
    if (!K.oneShot || K.oneShot.name !== n) boKayOneShot(model, n);
    return;
  }
  K.forceLoop = n; K.current = n;
}

function boKaySetFade(model, opacity) {
  const K = model && model._boKay; if (!K) return;
  const op = Math.max(0.04, Math.min(1, opacity));
  if (Math.abs((K._fade || 1) - op) < 0.02) return;
  K._fade = op;
  for (const m of K.bodyMats || []) { m.transparent = op < 0.99; m.opacity = op; m.depthWrite = op > 0.6; m.needsUpdate = true; }
  for (const m of K.goggleMats || []) { m.transparent = op < 0.99; m.opacity = Math.min(1, op * 1.2); m.needsUpdate = true; }
}

function boKayApplyWeights(K, k) {
  for (const n in K.actions) {
    const tgt = K.tw ? (K.tw[n] || 0) : (K.w[n] || 0);
    K.w[n] = (K.w[n] || 0) + (tgt - (K.w[n] || 0)) * k;
    K.actions[n].setEffectiveWeight(K.w[n] < 0.002 ? 0 : K.w[n]);
  }
}

/* Locomotion weights from velocity: speed blends Walk/Jog/Sprint (or crouch), direction drives
   a lower-body yaw (body turns toward travel, spine counter-twists so chest/head keep the aim). */
function boKayLocoTargets(K, e, dt) {
  const tw = {};
  const yaw = (e.yaw != null) ? e.yaw : ((e === PL.ent) ? PL.yaw : 0);
  const vx = e.vel ? e.vel.x : 0, vz = e.vel ? e.vel.z : 0;
  const spd = Math.hypot(vx, vz);
  const crouch = !!(e.crouch || (e.crouchAmt || 0) > 0.5);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const lf = vx * fx + vz * fz, lr = vx * rx + vz * rz;
  let legYaw = 0, rev = 1;
  if (spd > 0.35) {
    const th = Math.atan2(lr, lf);               // 0 = forward, +pi/2 = right
    if (Math.abs(th) <= 1.92) legYaw = th;        // forward / sideways: face travel
    else { rev = -1; legYaw = th > 0 ? th - Math.PI : th + Math.PI; } // backward: backpedal
    legYaw = Math.max(-1.25, Math.min(1.25, legYaw));
  }
  // smooth leg yaw; flip reverse only through low weight
  K.legYaw += (legYaw - K.legYaw) * (1 - Math.exp(-10 * dt));
  K.rev = rev;
  const moveK = Math.max(0, Math.min(1, (spd - 0.25) / 0.6));
  let rate = 0;
  if (crouch) {
    tw.Crouch_Idle_Loop = 1 - moveK; tw.Crouch_Fwd_Loop = moveK;
    const ts = Math.max(0.6, Math.min(2.0, spd / BO_UAL.nat.Crouch_Fwd_Loop));
    rate = ts / K.durs.Crouch_Fwd_Loop;
    K.loco = { Crouch_Fwd_Loop: 1 };
  } else {
    // piecewise blend on speed: 1.3 walk -> 3.2 jog -> 5.0 sprint
    const N = BO_UAL.nat;
    let wW = 0, wJ = 0, wS = 0;
    if (spd <= N.Walk_Loop) wW = 1;
    else if (spd <= N.Jog_Fwd_Loop) { const t = (spd - N.Walk_Loop) / (N.Jog_Fwd_Loop - N.Walk_Loop); wW = 1 - t; wJ = t; }
    else if (spd <= N.Sprint_Loop) { const t = (spd - N.Jog_Fwd_Loop) / (N.Sprint_Loop - N.Jog_Fwd_Loop); wJ = 1 - t; wS = t; }
    else wS = 1;
    if (rev < 0) { wJ += wS; wS = 0; } // no sprinting backwards: jog backpedal
    tw.Idle_Loop = 1 - moveK;
    tw.Walk_Loop = wW * moveK; tw.Jog_Fwd_Loop = wJ * moveK; tw.Sprint_Loop = wS * moveK;
    let r = 0, ws = 0;
    for (const [n, w] of [['Walk_Loop', wW], ['Jog_Fwd_Loop', wJ], ['Sprint_Loop', wS]]) {
      if (w <= 0) continue;
      const ts = Math.max(0.6, Math.min(1.6, spd / N[n]));
      r += w * ts / K.durs[n]; ws += w;
    }
    rate = ws > 0 ? r / ws : 0;
    K.loco = { Walk_Loop: 1, Jog_Fwd_Loop: 1, Sprint_Loop: 1 };
  }
  // shared normalized phase keeps feet in sync while blending (all loops start left foot forward)
  K.phase = (K.phase + rate * dt * rev + 1) % 1;
  return tw;
}

function boKayUpdate(model, e, dt, opts) {
  const K = model && model._boKay; if (!K) return;
  const yaw = (e && e.yaw != null) ? e.yaw : ((e === PL.ent) ? PL.yaw : 0);
  if (e && e.pos) K.holder.position.set(e.pos.x, Math.max(e.pos.y, 0), e.pos.z);
  K.holder.visible = true;
  if (model.lod) { if (model.lod.hi) model.lod.hi.visible = false; if (model.lod.lo) model.lod.lo.visible = false; }
  if (model.gun) model.gun.visible = false;

  // one mixer step per rendered frame
  const stamp = BO.frameNow;
  if (stamp != null && K._lastStamp === stamp) { K.holder.rotation.y = yaw + K.yawOff + K.legYaw; return; }
  K._lastStamp = stamp;
  dt = Math.max(0, Math.min(0.05, dt || 0.016));

  // ---- events ----
  if (e) {
    if (!e.alive) {
      if (!K.dead) { K.dead = true; boKayOneShot(model, 'Death01', null, 0.12); }
    } else if (K.dead) { K.dead = false; K.oneShot = null; }
    if (e.alive && K.lastHealth != null && e.health < K.lastHealth - 0.5 && !K.oneShot) boKayOneShot(model, 'Hit_Chest', 0.33, 0.06);
    K.lastHealth = e.health;
    if (e.alive && e.boRollT > 0 && (!K.oneShot || K.oneShot.name !== 'Roll')) boKayOneShot(model, 'Roll', Math.max(0.5, e.boRollT), 0.06);
    if (e.boRollT > 0) e.boRollT -= dt;
    if (e.alive && e.boTakedownT > 0 && (!K.oneShot || K.oneShot.name !== 'Punch_Cross')) boKayOneShot(model, 'Punch_Cross', 0.7, 0.06);
    if (e.boTakedownT > 0) e.boTakedownT -= dt;
    const air = e.alive && e.onGround === false && Math.abs(e.vy || 0) > 0.35;
    if (air && !K.wasAir && (e.vy || 0) > 0 && !K.oneShot) boKayOneShot(model, 'Jump_Start', 0.35, 0.06);
    if (!air && K.wasAir && K.airT > 0.3 && !K.oneShot) boKayOneShot(model, 'Jump_Land', 0.5, 0.05);
    K.airT = air ? K.airT + dt : 0; K.wasAir = air;
  }

  // ---- target weights ----
  let tw = {};
  const os = K.oneShot;
  if (os) {
    os.t += dt;
    if (!os.hold && os.t >= os.len) K.oneShot = null;
  }
  if (K.oneShot) {
    tw[K.oneShot.name] = 1;
    K.legYaw *= Math.exp(-8 * dt);
  } else if (e && e.alive && (e.boInteract || K.forceLoop === 'Fixing_Kneeling')) {
    // kneel-in once (0-0.8 s), then loop the working section (0.8-4.0 s), never the stand-up tail
    const fa = K.actions.Fixing_Kneeling;
    if (fa && (K.w.Fixing_Kneeling || 0) < 0.05 && !K.kneeling) { fa.time = 0; fa.timeScale = 1; }
    K.kneeling = true;
    tw.Fixing_Kneeling = 1; K.legYaw *= Math.exp(-8 * dt);
  } else if (e && e.alive && e.onGround === false && K.airT > 0.12) {
    tw.Jump_Loop = 1;
  } else if (e) {
    tw = boKayLocoTargets(K, e, dt);
  } else tw.Idle_Loop = 1;
  if (!tw.Fixing_Kneeling) K.kneeling = false;
  K.forceLoop = null;
  K.tw = tw;
  const fadeRate = K.oneShot ? 1 / Math.max(0.03, K.oneShot.fade) : 9;
  boKayApplyWeights(K, 1 - Math.exp(-fadeRate * dt));
  let best = 'Idle_Loop', bw = -1; for (const n in tw) if (tw[n] > bw) { bw = tw[n]; best = n; }
  K.current = best;

  // locomotion clips are driven by the shared phase, everything else by the mixer clock
  for (const n of ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop']) {
    const a = K.actions[n]; if (!a) continue;
    a.timeScale = 0; a.time = K.phase * K.durs[n];
  }
  K.mixer.update(dt);
  { const fa = K.actions.Fixing_Kneeling; if (fa && K.kneeling && fa.time > 4.0) fa.time = 0.8 + (fa.time - 4.0); }

  // ---- body yaw toward travel + spine counter-twist (chest/head stay on the aim) ----
  K.holder.rotation.y = yaw + K.yawOff + K.legYaw;
  K.holder.rotation.x = 0;
  if (Math.abs(K.legYaw) > 0.01) {
    K.holder.updateMatrixWorld(true);
    const per = -K.legYaw / BO_UAL.spine.length;
    const up = new THREE.Vector3(), pq = new THREE.Quaternion(), rq = new THREE.Quaternion();
    for (const bn of BO_UAL.spine) {
      const b = K.bones[bn]; if (!b) continue;
      b.parent.getWorldQuaternion(pq);
      up.set(0, 1, 0).applyQuaternion(pq.invert());
      rq.setFromAxisAngle(up, per);
      b.quaternion.premultiply(rq);
      b.updateMatrixWorld(true);
    }
  }
  boKaySyncJ(model, K);
  // camera reference height follows the real head (crouch / kneel lower the view), heavily smoothed
  const hb = K.bones.Head;
  if (hb) {
    K.holder.updateMatrixWorld(true);
    const hy = hb.getWorldPosition(BO._tmp).y - K.holder.position.y + 0.1;
    K.headH += (hy - K.headH) * (1 - Math.exp(-4 * dt));
  }
}

/* Hitboxes follow the UAL pose: the procedural skeleton (model.J) is never posed for UAL bodies (poseSoldier is skipped), so the
   joints stayed at the world origin and every bullet aimed at a spy went through him. Each mixer step copies the UAL bone world
   positions into model.J, which hitSpheres, entEye, entChest and entHead read (bots aiming at spies, mercs shooting them). */
const BO_J_MAP = [['pelvis', 'J_PEL'], ['neck_01', 'J_CHE'], ['Head', 'J_HEAD'], ['upperarm_l', 'J_SHL'], ['lowerarm_l', 'J_ELL'], ['hand_l', 'J_HAL'],
  ['upperarm_r', 'J_SHR'], ['lowerarm_r', 'J_ELR'], ['hand_r', 'J_HAR'], ['thigh_l', 'J_HIL'], ['calf_l', 'J_KNL'], ['foot_l', 'J_FTL'],
  ['thigh_r', 'J_HIR'], ['calf_r', 'J_KNR'], ['foot_r', 'J_FTR']];
const BO_J_IDX = { J_PEL, J_CHE, J_HEAD, J_SHL, J_ELL, J_HAL, J_SHR, J_ELR, J_HAR, J_HIL, J_KNL, J_FTL, J_HIR, J_KNR, J_FTR };
function boKaySyncJ(model, K) {
  const J = model.J; if (!J || !K || !K.bones) return;
  K.holder.updateMatrixWorld(true);
  for (const [bn, jn] of BO_J_MAP) { const b = K.bones[bn], v = J[BO_J_IDX[jn]]; if (b && v) b.getWorldPosition(v); }
  if (K.bones.Head && J[J_HEAD]) J[J_HEAD].y += 0.08; // bone origin is at the skull base: centre of the head sphere
  K.jSynced = true;
}
/* The player spy's body is a UAL mesh too: hit him on his real pose (kneeling at a terminal, rolling), not on the standing capsule */
const boKayBody = (e) => !!(e && e.isPlayer && e.model && e.model._boKay && e.model._boKay.jSynced && e.model.J && boIsBlackout());
(function boHookHitboxes() {
  const _hs = hitSpheres, _ch = entChest, _hd = entHead;
  hitSpheres = function (e) {
    if (!boKayBody(e)) return _hs(e);
    e.isPlayer = false; try { return _hs(e); } finally { e.isPlayer = true; }
  };
  entChest = function (e, out) { return boKayBody(e) ? out.lerpVectors(e.model.J[J_PEL], e.model.J[J_CHE], 0.62) : _ch(e, out); };
  entHead = function (e, out) { return boKayBody(e) ? out.copy(e.model.J[J_HEAD]) : _hd(e, out); };
})();

/* Wrap makeSoldier so spy bodies get the UAL mannequin when assets are ready */
const _boMakeSoldier = makeSoldier;
makeSoldier = function (skin, rel, weaponKey, opts = {}) {
  const model = _boMakeSoldier(skin, rel, weaponKey, opts);
  model._boWantKay = !!(opts.boSpy || (opts.shadowOnly && typeof BO !== 'undefined' && BO.role === 'spy'));
  if (model._boWantKay) {
    boLoadKaykit().then(() => {
      try { boAttachKaykit(model, 0x2a3e48); } catch (err) { console.warn('BO spy body', err); }
    }).catch((err) => console.warn('BO spy body load', err));
  }
  return model;
};

/* Merc guns: KEEP Riposte viewmodels.
   Kenney GLB overlay was a giant floating block next to a bare hand (wrong scale/rig).
   Choice: Riposte native weapon models + recoil/ADS unchanged. */
const _boVmEquip = vmEquip;
vmEquip = function (def) {
  _boVmEquip(def);
};

function boSwapViewmodel(def) {
  if (!VM.cur || !VM.cur.group || !def) return;
  const file = BO_WEP_FILES[def.key] || BO_WEP_FILES.m4;
  const src = BO.weapons[file]; if (!src) return;
  // Remove previous Kenney overlay
  const old = VM.cur.group.getObjectByName('boKenney');
  if (old) VM.cur.group.remove(old);
  const mesh = src.clone(true);
  mesh.name = 'boKenney';
  // Hide procedural gun meshes but keep muzzle/mag empties
  VM.cur.group.traverse((o) => {
    if (o.isMesh && o.name !== 'boKenney') o.visible = false;
  });
  // Fit Kenney gun roughly in viewmodel space (hand-held, pointing -Z in VM)
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3(); box.getSize(size);
  const targetLen = 0.55;
  const s = targetLen / Math.max(0.01, Math.max(size.x, size.y, size.z));
  mesh.scale.setScalar(s);
  // Orient: many Kenney guns point +Z or +Y - rotate to match Riposte VM (-Z forward)
  mesh.rotation.set(0, Math.PI, 0);
  mesh.position.set(0.02, -0.04, 0.08);
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false; o.receiveShadow = false;
      if (o.material) {
        const m = o.material.clone();
        m.metalness = Math.max(m.metalness || 0, 0.4);
        m.roughness = Math.min(m.roughness || 1, 0.55);
        o.material = m;
      }
    }
  });
  VM.cur.group.add(mesh);
};

/* Merc flashlight (SpotLight on camera) */
function boEnsureSpyRim() {
  if (BO.spyRim) return;
  // Soft fill from camera-left so the slate suit silhouette reads in the dark
  const rim = new THREE.SpotLight(0xa8c4dc, 0, 4.2, Math.PI / 7, 0.6, 1.6); // short reach: outlines the spy's body, does not light the street
  rim.castShadow = false;
  const tgt = new THREE.Object3D();
  rim.target = tgt;
  camera.add(rim); camera.add(tgt);
  // Slightly left/up of lens → lights the body that sits lower-left in frame
  rim.position.set(-0.55, 0.35, 0.15);
  tgt.position.set(-0.4, -0.55, -2.6);
  BO.spyRim = rim; BO.spyRimTarget = tgt;
  // Extra cool fill point near body
  const fill = new THREE.PointLight(0x6f98b0, 0, 3.2, 1.8);
  fill.position.set(-0.45, -0.35, -2.0);
  camera.add(fill);
  BO.spyFill = fill;
  rim.visible = false; rim.intensity = 0;
  fill.visible = false; fill.intensity = 0;
}
/* Torch light under the baked sun shadow: without shadow maps (NO_SHADOWS, low quality / software GL) Riposte multiplies ALL direct light by the
   baked sun shadow (02c-materials.js WM_AO), so a flashlight did nothing under an awning or in a building's shade. The spot loop now also keeps
   its own share (boSpD / boSpS) and WM_AO only shades the rest. Patched once at load, before any program is compiled. */
(function boPatchSpotChunk() {
  const K = 'NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', R = 'RE_Direct( directLight, geometry, material, reflectedLight );';
  const fix = (src) => {
    if (typeof src !== 'string' || src.includes('boSpD')) return src;
    const a = src.indexOf(K); if (a < 0) return 'vec3 boSpD = vec3(0.0), boSpS = vec3(0.0);\n' + src;
    const b = src.indexOf(R, a); if (b < 0) return 'vec3 boSpD = vec3(0.0), boSpS = vec3(0.0);\n' + src;
    return 'vec3 boSpD = vec3(0.0), boSpS = vec3(0.0);\n' + src.slice(0, b) +
      '{ vec3 boD0 = reflectedLight.directDiffuse, boS0 = reflectedLight.directSpecular; ' + R + ' boSpD += reflectedLight.directDiffuse - boD0; boSpS += reflectedLight.directSpecular - boS0; }' + src.slice(b + R.length);
  };
  THREE.ShaderChunk.lights_fragment_begin = fix(THREE.ShaderChunk.lights_fragment_begin);
  if (THREE.CSMShader) THREE.CSMShader.lights_fragment_begin = fix(THREE.CSMShader.lights_fragment_begin);
})();

/* Merc flashlight, pass 7: a fuller, natural tactical torch.
   - HOT: the main beam (beam width = its half-angle, high penumbra so the hot centre fades smoothly to the edge, decay 2 = quadratic falloff to the throw distance).
   - SPILL: a second, wide and dim spot on the same lens (halo around the beam), its share set by "spill".
   - Bot / peer mercs: a small pool of spotlights (BO_BOTLIGHTS) handed each frame to the closest mercs, plus a faint additive beam cone on every merc.
   Every light is created and made visible once when the BLACKOUT map is armed and only its intensity changes after that: the light count never changes
   in a match (a changed count makes three.js recompile every lit program, the freeze seen before). */
const BO_FL_DEF = { flashI: 3.5, flashRange: 26, flashAngle: 18, flashSoft: 1, flashDecay: 2, flashSpill: 0.18, flashSpillW: 3, flashTemp: 5200, flashColor: '#ffffff', flashBeam: 0.35, botFlash: 2 };
function boFL() { return Object.assign({}, BO_FL_DEF, (window.BOCFG && BOCFG.v && BOCFG.v.light) || {}); }
/* colour temperature (K) to linear-ish RGB (Tanner Helland fit), times the tint */
function boKelvin(K, tint, out) {
  const t = Math.max(1000, Math.min(12000, K)) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708 * Math.log(t) - 161.1196; b = t <= 19 ? 0 : 138.5177 * Math.log(t - 10) - 305.0448; }
  else { r = 329.6987 * Math.pow(t - 60, -0.1332); g = 288.1222 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (x) => Math.max(0, Math.min(255, x)) / 255;
  out.setRGB(c(r), c(g), c(b));
  if (tint) { const T = new THREE.Color(tint); out.r *= T.r; out.g *= T.g; out.b *= T.b; }
  return out;
}
function boMakeSpot() { const L = new THREE.SpotLight(0xffffff, 0, 40, 0.5, 0.9, 2); L.castShadow = false; const t = new THREE.Object3D(); L.target = t; return L; }
function boEnsureFlash() {
  if (BO.flash) return;
  const fl = boMakeSpot(), sp = boMakeSpot();
  camera.add(fl); camera.add(fl.target); camera.add(sp); camera.add(sp.target);
  fl.position.set(0.08, -0.05, 0.02); fl.target.position.set(0, -0.15, -10);
  sp.position.set(0.08, -0.05, 0.02); sp.target.position.set(0, -0.25, -10);
  BO.flash = fl; BO.flashTarget = fl.target; BO.flashSpill = sp;
  fl.visible = sp.visible = false;
}
const BO_BOTLIGHTS = []; // spotlights lent to the nearest bot / peer mercs
const BO_BEAMS = [];     // faint visible beam cones (meshes, not lights: any number)
let BO_BEAM_MAT = null;
function boBeamMat() {
  if (BO_BEAM_MAT) return BO_BEAM_MAT;
  BO_BEAM_MAT = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(1, 0.95, 0.85) }, uA: { value: 0.35 } },
    vertexShader: 'varying float vL; varying vec3 vN; varying vec3 vV; void main(){ vL = -position.z; vec4 w = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix*w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uA; varying float vL; varying vec3 vN; varying vec3 vV; void main(){ float along = clamp(vL,0.0,1.0); float fade = smoothstep(0.0,0.08,along)*pow(1.0-along,1.6); float rim = pow(abs(dot(normalize(vN),normalize(vV))),1.5); gl_FragColor = vec4(uCol*uA*fade*rim*0.35, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  return BO_BEAM_MAT;
}
function boMakeBeam() {
  const g = new THREE.ConeGeometry(1, 1, 20, 1, true); // apex at +0.5 y; turn it so the apex sits at the origin and the cone opens toward -z, length 1
  g.translate(0, -0.5, 0); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, boBeamMat()); m.frustumCulled = false; m.renderOrder = 5; m.visible = false; m.userData.noRay = true;
  scene.add(m); return m;
}
/* BLACKOUT map build/unload: all flashlight lights are visible (in the light count) for the whole BLACKOUT map, intensity 0 when off,
   so mapCompile compiles every program once with them and toggling the flashlight never recompiles. Other maps: invisible (not counted).
   The bot light count (botFlash, 0..3) is read here only: a change takes effect at the next map load. */
function boLightsArm(on) {
  boEnsureFlash(); boEnsureSpyRim();
  if (camera && !camera.parent && typeof scene !== 'undefined') scene.add(camera); // lights parented to the camera only render if it is in the scene
  if (on) {
    const want = Math.max(0, Math.min(3, Math.round(boFL().botFlash)));
    while (BO_BOTLIGHTS.length < want) { const L = boMakeSpot(); scene.add(L); scene.add(L.target); BO_BOTLIGHTS.push(L); }
    while (BO_BOTLIGHTS.length > want) { const L = BO_BOTLIGHTS.pop(); scene.remove(L); scene.remove(L.target); }
    while (BO_BEAMS.length < 8) BO_BEAMS.push(boMakeBeam());
  }
  for (const L of [BO.flash, BO.flashSpill, BO.spyRim, BO.spyFill, ...BO_BOTLIGHTS]) if (L) { L.visible = !!on; L.intensity = 0; }
  for (const m of BO_BEAMS) m.visible = false;
  BO.armed = !!on;
}
const _boFlCol = new THREE.Color(), _boEye = new THREE.Vector3(), _boDir = new THREE.Vector3(), _boCam = new THREE.Vector3();
function boSetSpot(L, F, I, spill) {
  const half = F.flashAngle * Math.PI / 180;
  L.intensity = I; L.decay = F.flashDecay; L.color.copy(_boFlCol);
  if (spill) { L.angle = Math.min(1.45, half * F.flashSpillW); L.penumbra = 1; L.distance = F.flashRange * 0.6; }
  else { L.angle = Math.min(1.45, half); L.penumbra = F.flashSoft; L.distance = F.flashRange; }
}
function boMercLit(e) { return e && !e.off && e.alive && e.team === 0 && e !== PL.ent && e.model && e.model.root && e.model.root.visible !== false; }
function boUpdateFlash() {
  boEnsureFlash();
  boEnsureSpyRim();
  const playing = MATCH.state === 'playing' && PL.ent && PL.ent.alive && boIsBlackout();
  if (!BO.armed) return; // not a BLACKOUT map: lights stay out of the scene's light count
  const F = boFL();
  boKelvin(F.flashTemp, F.flashColor, _boFlCol);
  const spill = Math.max(0, Math.min(1, F.flashSpill));
  // player: hot beam + spill (battery dims both)
  const mercOn = playing && !boIsSpy() && BO.flashOn;
  const bat = BO.battery == null ? 1 : Math.min(1, 0.15 + BO.battery / 25);
  const I = mercOn ? F.flashI * bat : 0;
  boSetSpot(BO.flash, F, I * (1 - spill * 0.5), false);
  boSetSpot(BO.flashSpill, F, I * spill, true);
  // bots and peers: the nearest mercs borrow the pool lights; every merc gets a faint beam cone
  const cam = camera.getWorldPosition(_boCam);
  const mercs = MATCH.state === 'playing' ? entities.filter(boMercLit) : [];
  mercs.sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam));
  for (let i = 0; i < BO_BOTLIGHTS.length; i++) {
    const L = BO_BOTLIGHTS[i], e = mercs[i];
    if (!e || F.flashI <= 0) { L.intensity = 0; continue; }
    boMercAim(e); L.position.copy(_boEye); L.target.position.copy(_boEye).addScaledVector(_boDir, 10);
    boSetSpot(L, F, F.flashI * 0.85, false);
    L.angle = Math.min(1.45, L.angle * (1 + spill * 0.6)); // one light per bot: fold some of the spill into a wider soft beam
  }
  const mat = boBeamMat(); mat.uniforms.uCol.value.copy(_boFlCol); mat.uniforms.uA.value = F.flashBeam;
  for (let i = 0; i < BO_BEAMS.length; i++) {
    const m = BO_BEAMS[i], e = mercs[i];
    if (!e || F.flashBeam <= 0 || F.flashI <= 0) { m.visible = false; continue; }
    boMercAim(e);
    const len = Math.min(F.flashRange * 0.45, 16), rad = Math.tan(Math.min(1.2, F.flashAngle * Math.PI / 180)) * len * 0.8;
    m.position.copy(_boEye); m.lookAt(_boEye.x - _boDir.x, _boEye.y - _boDir.y, _boEye.z - _boDir.z); // Object3D.lookAt points +z at the target: aim -z down the beam
    m.scale.set(rad, rad, len); m.visible = true;
  }
  const on = !!(playing && boIsSpy());
  BO.spyRim.intensity = on ? 2.2 : 0;
  BO.spyFill.intensity = on ? 0.7 : 0;
}
/* a merc's torch: from just in front of the eyes, along where he looks */
function boMercAim(e) {
  const yaw = e.lookYaw != null ? e.lookYaw : e.yaw || 0, pit = Math.max(-0.6, Math.min(0.6, e.pitch || 0));
  entEye(e, _boEye);
  _boDir.set(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit) - 0.08, -Math.cos(yaw) * Math.cos(pit)).normalize();
  _boEye.addScaledVector(_boDir, 0.35); _boEye.y -= 0.12;
}

/* Spy: hide viewmodel, show body, OTS camera - body always in lower-left third */
function boApplySpyCamera(dt) {
  if (!PL.ent || !PL.ent.alive || MATCH.state !== 'playing') return;
  const e = PL.ent;
  if (e.model) {
    e.model.root.visible = true;
    boEnsurePlayerKaykit && boEnsurePlayerKaykit();
  }
  if (VM) { VM.holder.visible = false; VM.root.visible = false; }
  if (e.model && e.model.gun) e.model.gun.visible = false;

  const dtC = Math.max(0, Math.min(0.05, dt || 0.016));
  const crouch = (e.crouchAmt || 0);
  const dist = BO.camDist * (crouch > 0.5 ? 0.88 : 1);   // ~2.2 m behind
  const side = BO.camSide;                                 // +0.7 m to character's right
  const headH = (e.model && e.model._boKay && e.model._boKay.headH) || 1.65;
  const height = headH + 0.3;                              // 0.3 m above the (animated) head; crouch/kneel lower it
  const pitch = Math.max(-0.4, Math.min(0.4, PL.pitch * 0.5));

  // Riposte: yaw 0 looks -Z. Forward / right in XZ:
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw);
  const rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  const feetY = Math.max(e.pos.y, 0);
  const px = e.pos.x, pz = e.pos.z;

  // Ideal: behind (-forward) and to the right (+rx*side) → after lookAt, body sits lower-LEFT.
  // Wall pull-in: 5 probe rays (centre, left/right, up/down) from a shoulder pivot to the ideal spot.
  // Tried with the full right offset first; in doorways the offset hides the lens behind the jamb,
  // so smaller / centred offsets are tried and the one with the longest clear boom wins.
  const chestY = feetY + 1.25;
  const camY0 = Math.max(feetY + 0.7, feetY + height - Math.sin(pitch) * dist * 0.28);
  const probeOut = new THREE.Vector3();
  function probeBoom(sd, out) {
    const ix = px - fx * dist + rx * sd, iz = pz - fz * dist + rz * sd;
    const pvx = px + rx * Math.min(0.18, Math.max(0, sd) * 0.26), pvy = feetY + 1.45, pvz = pz + rz * Math.min(0.18, Math.max(0, sd) * 0.26);
    let dx0 = ix - pvx, dy0 = camY0 - pvy, dz0 = iz - pvz;
    const len = Math.hypot(dx0, dy0, dz0);
    if (len < 0.05) { out.set(ix, camY0, iz); return len; }
    dx0 /= len; dy0 /= len; dz0 /= len;
    let tmin = len;
    for (const [lo, vo] of [[0, 0], [0.24, 0], [-0.24, 0], [0, 0.2], [0, -0.2]]) {
      const ox = pvx + rx * lo * 0.5, oy = pvy + vo * 0.5, oz = pvz + rz * lo * 0.5;
      const ex = ix + rx * lo, ey = camY0 + vo, ez = iz + rz * lo;
      let dx = ex - ox, dy = ey - oy, dz = ez - oz; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
      try { const h = rayWorld(ox, oy, oz, dx, dy, dz, L + 0.3); if (h && h.t < L + 0.3) tmin = Math.min(tmin, (h.t - 0.3) * (len / L)); } catch (err) {}
    }
    const t = Math.max(0.35, Math.min(len, tmin));
    out.set(pvx + dx0 * t, pvy + dy0 * t, pvz + dz0 * t);
    return t;
  }
  {
    let bestT = -1;
    for (const sd of [side, side * 0.55, 0, -side * 0.45]) {
      const t = probeBoom(sd, probeOut);
      // prefer the shoulder offsets: accept them as soon as the boom is comfortably long
      const score = t + (sd === side ? 0.35 : sd > 0 ? 0.2 : 0);
      if (score > bestT) { bestT = score; BO._ideal.copy(probeOut); }
      if (sd === side && t > dist * 0.8) break;
    }
  }
  // If still blocked (cam inside brush / side offset into wall), collapse side then dist
  function losClear(camPos) {
    try {
      const dx = px - camPos.x, dy = chestY - camPos.y, dz = pz - camPos.z;
      const L = Math.hypot(dx, dy, dz);
      if (L < 0.05) return true;
      const h = rayWorld(camPos.x, camPos.y, camPos.z, dx / L, dy / L, dz / L, L - 0.08);
      return !(h && h.t < L - 0.12);
    } catch (err) { return true; }
  }
  if (!losClear(BO._ideal)) {
    // drop side offset
    BO._ideal.set(px - fx * dist, feetY + height, pz - fz * dist);
    if (!losClear(BO._ideal)) {
      // pull closer until LOS or min
      for (let d = dist; d > 0.55; d -= 0.35) {
        BO._ideal.set(px - fx * d + rx * side * 0.25, feetY + Math.min(height, 1.45), pz - fz * d + rz * side * 0.25);
        if (losClear(BO._ideal)) break;
      }
    }
  }

  // Soft keep-out from skull: prefer ≥0.45 m, allow closer (fade) rather than shoving camera out of frame
  const head = BO._tmp.set(px, feetY + 1.5, pz);
  const away = BO._look.copy(BO._ideal).sub(head);
  let dHead = away.length();
  if (dHead < 0.35) {
    if (dHead < 1e-4) away.set(-fx, 0.2, -fz);
    away.normalize();
    BO._ideal.copy(head).addScaledVector(away, 0.42);
    dHead = 0.42;
  }

  // If wall-forced close, lift cam and bias further right so body stays lower-left (not a face-fill)
  {
    const dChest = Math.hypot(BO._ideal.x - px, BO._ideal.z - pz);
    if (dChest < (BO.camMinComfort || 1.35)) {
      const ox = BO._ideal.x, oy = BO._ideal.y, oz = BO._ideal.z;
      BO._ideal.y = Math.max(BO._ideal.y, feetY + Math.min(1.75, headH + 0.25));
      // nudge further to the right of the body - only if that keeps the lens out of walls and LOS clear
      let wallR = false;
      try { const h = rayWorld(ox, oy, oz, rx, 0, rz, 0.55); wallR = !!(h && h.t < 0.55); } catch (err) {}
      if (!wallR) { BO._ideal.x += rx * 0.25; BO._ideal.z += rz * 0.25; }
      if (!losClear(BO._ideal)) BO._ideal.set(ox, oy, oz);
    }
  }

  if (!Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.z) ||
      !Number.isFinite(camera.position.y) || camera.position.distanceTo(BO._ideal) > 3.5) {
    camera.position.copy(BO._ideal);
  } else {
    camera.position.lerp(BO._ideal, 1 - Math.exp(-16 * dtC));
  }
  if (!Number.isFinite(camera.position.x)) camera.position.copy(BO._ideal);

  // Look ahead - slight left of true forward so body sits lower-LEFT
  const dNow = Math.hypot(camera.position.x - px, camera.position.z - pz);
  const lookY = feetY + (dNow < 1.4 ? 0.95 : 1.22) + pitch * 0.55;
  const look = BO._look.set(
    px + fx * 2.6 + rx * side * 0.08,  // slight toward camera-right aim → body shifts left
    lookY,
    pz + fz * 2.6 + rz * side * 0.08
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(look);
  if (BO.debugCam) { try { BO.debugCam(camera, e); } catch (err) {} }
  if (Math.abs(camera.fov - 58) > 0.5) { camera.fov = 58; camera.updateProjectionMatrix(); }

  // Drive KayKit body + near-camera fade (only when cam < 0.5 m from torso)
  if (e.model && e.model._boKay) {
    const K = e.model._boKay;
    K.holder.position.set(px, feetY, pz);
    K.holder.rotation.y = PL.yaw + K.yawOff + (K.legYaw || 0);
    K.holder.visible = true;
    const torso = BO._tmp.set(px, feetY + 1.0, pz);
    const dBody = camera.position.distanceTo(torso);
    if (dBody < BO.camFadeUnder) boKaySetFade(e.model, Math.max(0.05, dBody / BO.camFadeUnder));
    else boKaySetFade(e.model, 1);
  }
}

/* Spy: no gun fire - knife/takedown only from behind */
const _boPlayerShootGate = (function () {
  // Hook fire: spies cannot shoot
  const _busy = busy;
  // Patch in tick instead via updatePlayer wrap
})();

const _boUpdatePlayerCam = (typeof updatePlayer === 'function') ? null : null;

/* Wrap the end of living player camera: call after updateLivingPlayer / wherever camera is set.
   Riposte names the camera block inside updatePlayer - we hook via a post-frame on the game tick. */
function boOnFrame(dt) {
  if (!boIsBlackout() && MATCH.state === 'playing') {
    // still allow role tools off-map for testing
  }
  boUpdateFlash();

  // Anim selection + mixer (boKayUpdate steps each mixer once per frame via BO.frameNow)
  for (const e of entities) {
    if (e.model && e.model._boKay) boKayUpdate(e.model, e, dt);
  }

  // Spy player: ensure visible KayKit body (player normally shadowOnly)
  if (boIsSpy() && PL.ent && PL.ent.alive && MATCH.state === 'playing') {
    const e = PL.ent;
    boEnsurePlayerKaykit();
    if (e.model && !e.model._boKay) {
      boLoadKaykit().then(() => {
        if (!e.model._boKay) {
          // Force attach even on shadowOnly
          const was = e.model.shadowOnly;
          e.model.shadowOnly = false;
          boAttachKaykit(e.model, 0x2a3e48);
          e.model.shadowOnly = was;
          if (e.model.lod && e.model.lod.lo) e.model.lod.lo.visible = false;
          if (e.model.lod && e.model.lod.hi) e.model.lod.hi.visible = false;
        }
      }).catch(() => {});
    }
    if (e.model) {
      e.model.root.visible = true;
      if (e.model.gun) e.model.gun.visible = false; // hidden, never removed: ragdoll, killcam, net and the bot controller read model.gun
    }
    boApplySpyCamera(dt);
  } else if (!boIsSpy() && MATCH.state === 'playing' && PL.ent && PL.ent.alive) {
    // Merc FPS: keep body hidden
    if (PL.ent.model) PL.ent.model.root.visible = false;
    VM.root.visible = true;
  }

  // Spy: no gun - hide viewmodel + ammo chrome
  if (boIsSpy() && MATCH.state === 'playing') {
    if (VM) { VM.holder.visible = false; VM.root.visible = false; }
    const ammo = document.getElementById('ammo'); if (ammo) ammo.style.opacity = '0';
    const wepName = document.getElementById('weaponName') || document.querySelector('.weapon-name');
    if (wepName) wepName.style.opacity = '0';
    // sync yaw onto entity for kaykit facing
    if (PL.ent) PL.ent.yaw = PL.yaw;
  } else {
    const ammo = document.getElementById('ammo'); if (ammo) ammo.style.opacity = '';
  }
}


/* Rear takedown: spy within 1.5 m behind a merc */
function boRearTakedownTarget() {
  if (!boIsSpy() || !PL.ent || !PL.ent.alive) return null;
  const me = PL.ent;
  let best = null, bd = 1.5;
  for (const t of entities) {
    if (!t.alive || t === me || allied(t, me)) continue;
    const d = Math.hypot(t.pos.x - me.pos.x, t.pos.z - me.pos.z);
    if (d > bd || d < 0.05) continue;
    // Spy must be behind merc: vector merc→spy opposite merc forward
    const toSpyX = me.pos.x - t.pos.x, toSpyZ = me.pos.z - t.pos.z;
    const mfx = -Math.sin(t.yaw), mfz = -Math.cos(t.yaw);
    const dot = (toSpyX * mfx + toSpyZ * mfz) / (Math.hypot(toSpyX, toSpyZ) + 1e-6);
    if (dot > -0.2) continue; // not in rear hemisphere
    best = t; bd = d;
  }
  return best;
}

function boDoRearTakedown() {
  const t = boRearTakedownTarget();
  if (!t || !PL.ent) return false;
  PL.ent.boTakedownT = 0.7;   // drives the UAL Punch_Cross one-shot (boKayUpdate)
  if (PL.ent.model) boKayOneShot(PL.ent.model, 'Punch_Cross', 0.7, 0.06);
  try {
    if (typeof killEnt === 'function') killEnt(t, PL.ent, 'knife', false, null, PL.ent.spawnAt);
    else { t.alive = false; t.health = 0; t.deathT = MATCH.time; }
  } catch (err) {
    try { t.alive = false; t.health = 0; } catch (e2) {}
  }
  try { hudMsg('TAKEDOWN', 'xp', 2); } catch (e) {}
  return true;
}
BO.boRearTakedownTarget = boRearTakedownTarget;
BO.boDoRearTakedown = boDoRearTakedown;

/* Rear-only knifePick for spies (also used by KeyE hook) */
if (typeof knifePick === 'function') {
  const _knifePick = knifePick;
  knifePick = function () {
    if (boIsSpy()) return boRearTakedownTarget();
    return _knifePick();
  };
}

/* F/L: merc flashlight. R: spy roll. */
addEventListener('keydown', (e) => {
  if (e.code === 'KeyL' || (e.code === 'KeyF' && e.shiftKey)) {
    if (!boIsSpy()) BO.flashOn = !BO.flashOn;
  }
  // spy roll (R) is handled by the BLACKOUT rules (09zo), from the game's own key state
});

/* Prefetch assets once GPU boots */
function boPrefetch() {
  if (!window.THREE || !THREE.GLTFLoader) { setTimeout(boPrefetch, 400); return; }
  boLoadKaykit().catch(() => {});
  boLoadWeapons().catch(() => {});
  boEnsureFlash();
  BO.ready = true;
}

/* FORCE_PLAYER_KAY */
function boEnsurePlayerKaykit() {
  const e = PL && PL.ent; if (!e || !e.model) return;
  if (e.model._boKay) return;
  boLoadKaykit().then(() => {
    if (!e.model._boKay) {
      try { boAttachKaykit(e.model, 0x2a3e48); } catch (err) { console.warn(err); }
      if (e.model.lod) {
        if (e.model.lod.lo) e.model.lod.lo.visible = false;
        if (e.model.lod.hi) e.model.lod.hi.visible = false;
      }
    }
  }).catch(() => {});
}

setTimeout(boPrefetch, 800);

/* Hook applyCamera (spy OTS overrides FPS cam) and frame (anims/flashlight) */
(function boHookCam() {
  if (typeof applyCamera === 'function' && !applyCamera._bo) {
    const _ac = applyCamera;
    applyCamera = function (dt, now, scoped) {
      if (boIsSpy() && PL.ent && PL.ent.alive && MATCH.state === 'playing') {
        PL.yawReal = PL.yaw;
        try { boApplySpyCamera(dt); } catch (err) {}
        return;
      }
      return _ac(dt, now, scoped);
    };
    applyCamera._bo = true;
  } else if (typeof applyCamera !== 'function') {
    setTimeout(boHookCam, 200); return;
  }
})();
(function boHookFrame() {
  if (typeof frame === 'function' && !frame._bo) {
    const _f = frame;
    frame = function (now) {
      BO.frameNow = now;
      _f(now);
      try {
        const dt = Math.min(0.05, (frame._boLast != null ? (now - frame._boLast) : 16) / 1000);
        frame._boLast = now;
        boOnFrame(dt);
      } catch (err) {}
    };
    frame._bo = true;
    return;
  }
  setTimeout(boHookFrame, 200);
})();

/* On match start: place spy at spy spawn, strip gun */
(function boHookStart() {
  if (typeof startMatch === 'function' && !startMatch._bo) {
    const _s = startMatch;
    startMatch = function (opt) {
      const r = _s(opt);
      setTimeout(() => {
        try {
          // spawn placement, teams and roster: BLACKOUT rules (09zo-blackout-mode.js)
          boEnsureFlash();
        } catch (err) { console.warn('BO start', err); }
      }, 100);
      return r;
    };
    startMatch._bo = true;
    return;
  }
  setTimeout(boHookStart, 200);
})();

BO.boOverhead = function () {
  camera.position.set(0, 42, 0.01);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(-Math.PI / 2, 0, 0);
  camera.fov = 50; camera.updateProjectionMatrix();
};

BO.boApplySpyCamera = boApplySpyCamera;
BO.boKayOneShot = boKayOneShot;
BO.boEnsurePlayerKaykit = boEnsurePlayerKaykit;

/* Spies cannot fire guns - clear trigger each frame; knife/takedown still OK */
(function boBlockSpyFire() {
  if (typeof frame === 'function' && !frame._boFire) {
    /* already wrapped frame in boHookFrame; piggyback via boOnFrame */
    const _on = boOnFrame;
    boOnFrame = function (dt) {
      _on(dt);
      if (boIsSpy() && !(window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed())) {
        try {
          PL.held = false; PL.queued = false; PL.runShot = false;
          if (PL.ent && PL.ent.input) { PL.ent.input.fire = false; PL.ent.input.firePressed = false; }
          if (PL.ent && PL.ent.model && PL.ent.model.gun) PL.ent.model.gun.visible = false;
        } catch (e) {}
      }
    };
    frame._boFire = true;
    return;
  }
  setTimeout(boBlockSpyFire, 400);
})();

(function boAnimSoldierSpy() {
  if (typeof animSoldier !== 'function' || animSoldier._bo) { setTimeout(boAnimSoldierSpy, 300); return; }
  const _as = animSoldier;
  animSoldier = function (e, dt) {
    const spy = boIsBlackout() && e && e.model && e.model.gun && (e.team === 1 || (boIsSpy() && e.isPlayer));
    if (spy) e.model.gun.visible = false; // unarmed pose (06g-body.js reads gun.visible)
    const r = _as(e, dt);
    if (spy) e.model.gun.visible = false; // animSoldier shows the gun again on respawn
    return r;
  };
  animSoldier._bo = true;
})();

/* KayKit bodies: skip procedural pose (joints may be null / unused) */
(function boGuardPose() {
  if (typeof poseSoldier !== 'function' || poseSoldier._boKay) { setTimeout(boGuardPose, 200); return; }
  const _ps = poseSoldier;
  poseSoldier = function (e, dt) {
    if (e && e.model && e.model._boKay) {
      try {
        boKayUpdate(e.model, e, dt || 0.016);
      } catch (err) {}
      return;
    }
    return _ps(e, dt);
  };
  poseSoldier._boKay = true;
})();

/* Spies are unarmed: the bot controller must never fire for them (it used to hit a null model.gun every frame: TypeError in ctlShoot) */
(function boGuardShoot() {
  if (typeof ctlShoot !== 'function') { setTimeout(boGuardShoot, 300); return; }
  if (ctlShoot._bo) return;
  const _cs = ctlShoot;
  ctlShoot = function (ent, now) {
    // spy bots never fire; the player spy only with a sidearm given in the editor (BOCFG spy loadout)
    if (ent && ent.team === 1 && boIsBlackout() && !(ent.isPlayer && window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed())) return;
    return _cs.apply(this, arguments);
  };
  ctlShoot._bo = true;
})();
