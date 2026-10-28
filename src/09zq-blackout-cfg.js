/* ==========================================================================
   BLACKOUT config (pass 6): one object, BOCFG.v, holds everything the F10 editor changes:
   lighting, look (post-process), weapons and custom guns, attachments and custom attachments, loadouts, gameplay.
   Every value is validated against SCHEMA (numbers clamped, wrong types replaced by the default), applied live,
   saved to localStorage ('bo_cfg_v1'), exportable / importable as JSON, and sent by the host to peers at match start.
   ========================================================================== */
(function () {
  const KEY = 'bo_cfg_v1';
  let BOCFG_MIGRATED = false;
  const LIGHT_VER = 2; // pass 7: new torch model; older saves/imports drop their torch shape keys once so the new defaults apply
  const OLD_TORCH = ['flashI', 'flashRange', 'flashAngle', 'flashSoft', 'flashColor'];
  const num = (d, min, max, step, label) => ({ t: 'n', d, min, max, step, label });
  const bool = (d, label) => ({ t: 'b', d, label });
  const col = (d, label) => ({ t: 'c', d, label });
  const sel = (d, opts, label) => ({ t: 's', d, opts, label });
  const SCHEMA = {
    light: {
      flashI: num(3.5, 0, 20, 0.5, 'Intensity'), flashRange: num(26, 4, 100, 1, 'Throw distance (m)'),
      flashAngle: num(18, 5, 70, 1, 'Beam width (half-angle, deg)'), flashSoft: num(1, 0, 1, 0.01, 'Edge softness (penumbra)'),
      flashSpill: num(0.18, 0, 1, 0.01, 'Hotspot vs spill (0 = all hotspot)'), flashSpillW: num(3, 1, 4, 0.05, 'Spill width (x beam)'),
      flashDecay: num(2, 0, 3, 0.05, 'Falloff (decay)'), flashTemp: num(5200, 2500, 9000, 50, 'Colour temperature (K)'),
      flashColor: col('#ffffff', 'Tint'), flashBeam: num(0.35, 0, 1, 0.01, 'Visible beam on other mercs'),
      botFlash: num(2, 0, 3, 1, 'Bot / peer torch lights (next map load)'),
      flashDrain: num(0, 0, 20, 0.5, 'Battery drain (%/s, 0 = off)'),
      flashRecharge: num(4, 0, 20, 0.5, 'Battery recharge (%/s)'),
      exposure: num(1.4, 0.2, 4, 0.01, 'Exposure'), ambient: num(0.55, 0, 3, 0.01, 'Ambient (sky fill)'), moon: num(0.3, 0, 4, 0.01, 'Moonlight'),
      fogD: num(0.012, 0, 0.08, 0.001, 'Fog density'), fogColor: col('#080913', 'Fog colour'),
      lamps: num(2.6, 0, 10, 0.1, 'Street lamp intensity'), termGlow: num(1, 0, 4, 0.05, 'Terminal screen glow'),
      muzzleK: num(1, 0, 5, 0.05, 'Muzzle light intensity'), muzzleRange: num(1, 0.2, 4, 0.05, 'Muzzle light range'),
      suppFlash: num(0.35, 0, 1, 0.05, 'Suppressed flash x'),
      lampColor: col('#ffb35c', 'Street lamp colour'), lampTint: num(0, 0, 1, 0.01, 'Lamp colour strength (0 = built-in)'),
      moonColor: col('#7d92c8', 'Moonlight colour'), ambColor: col('#3a4a74', 'Ambient sky colour'),
      termColor: col('#20ffcf', 'Terminal glow colour'), muzzleColor: col('#ffb060', 'Muzzle flash colour'),
    },
    look: {
      pixel: num(1, 1, 16, 1, 'Pixel size (1 = off)'), renderScale: num(1, 0.25, 1, 0.05, 'Render scale'),
      dither: bool(false, 'Dithering'), ditherPat: sel('bayer4', ['bayer2', 'bayer4', 'bayer8', 'noise'], 'Dither pattern'),
      ditherStr: num(0.6, 0, 1, 0.01, 'Dither strength'), levels: num(6, 2, 32, 1, 'Colour levels'),
      palette: sel('none', ['none', 'blackout', 'mono', 'amber', 'nightvision', 'gameboy', 'cga', 'custom'], 'Palette / grade'),
      toneStr: num(0, 0, 1, 0.01, 'Tint strength'), toneSh: col('#1b2a2e', 'Shadow tint'), toneMid: col('#808080', 'Midtone tint'), toneHi: col('#e6dfcc', 'Highlight tint'),
      contrast: num(1, 0.3, 2.5, 0.01, 'Contrast'), saturation: num(1, 0, 2.5, 0.01, 'Saturation'), brightness: num(1, 0.2, 3, 0.01, 'Brightness'),
      outline: bool(false, 'Outlines'), outlineW: num(1, 1, 4, 0.5, 'Outline thickness (px)'), outlineStr: num(0.8, 0, 1, 0.01, 'Outline strength'),
      vignette: num(0, 0, 1.5, 0.01, 'Vignette'), grain: num(0, 0, 0.5, 0.005, 'Film grain'), scan: num(0, 0, 1, 0.01, 'Scanlines'), scanSize: num(3, 1, 8, 1, 'Scanline size (px)'),
    },
    game: {
      roundTime: num(240, 30, 1800, 5, 'Round timer (s)'), hackTime: num(4.5, 0.5, 60, 0.5, 'Hack time (s)'), hacksNeeded: num(2, 1, 3, 1, 'Hacks needed'),
      takedownRange: num(1.8, 0.5, 4, 0.1, 'Takedown range (m)'), extractTime: num(1.5, 0.2, 15, 0.1, 'Extract hold (s)'), health: num(100, 10, 1000, 5, 'Player health'),
      spySpeed: num(1, 0.3, 2.5, 0.05, 'Spy move speed (x)'), mercSpeed: num(1, 0.3, 2.5, 0.05, 'Merc move speed (x)'),
      spyStealth: num(0.55, 0.05, 1, 0.05, 'Spy visibility to merc bots (x)'),
      botHack: num(0.35, 0.1, 2, 0.05, 'Spy bot hack speed (x player)'),
      botDelay: num(12, 0, 60, 1, 'Spy bots wait before first hack (s)'),
      hackNoiseM: num(35, 5, 150, 1, 'Hack noise range m'), hackNoiseVol: num(1, 0, 3, 0.05, 'Hack noise volume'),
      hackAlert: sel('hearing', ['hearing', 'always', 'off'], 'Merc alert marker'),
      roundsToWin: num(2, 1, 9, 1, 'Rounds to win'), respawn: bool(false, 'Respawn (off = one life per round)'), respawnDelay: num(5, 1, 60, 1, 'Respawn delay (s)'),
      spyLives: num(0, 0, 20, 1, 'Spy lives per round (0 = unlimited)'), specDelay: num(3, 0, 15, 0.5, 'Death cam before spectating (s)'), intermission: num(6, 2, 30, 1, 'Pause between rounds (s)'),
      mercs: num(2, 1, 6, 1, 'Mercs (incl. player)'), spies: num(2, 1, 6, 1, 'Spies (incl. player)'),
      // pass 17: the Custom bot difficulty (0 = Recruit, 100 = Nightmare)
      aiReact: num(60, 0, 100, 1, 'Custom bots: reaction'), aiAim: num(60, 0, 100, 1, 'Custom bots: aim'),
      aiHear: num(60, 0, 100, 1, 'Custom bots: hearing'), aiAgg: num(60, 0, 100, 1, 'Custom bots: aggression'),
      rollIFrames: num(0.35, 0, 0.6, 0.01, 'Roll i-frames (s, roll lasts 0.6)'), rollCd: num(1.1, 0.6, 6, 0.05, 'Roll cooldown (s)'), rollDist: num(3.1, 1, 8, 0.1, 'Roll distance (m)'),
    },
    spy: { // pass 8: spy kit
      spyDmg: num(0.6, 0.1, 2, 0.05, 'Spy damage taken (x)'), stagger: num(0.35, 0, 1.5, 0.05, 'Hit stagger time (s)'), staggerSlow: num(0.45, 0.1, 1, 0.05, 'Move speed while staggered (x)'),
      smokeN: num(2, 0, 9, 1, 'Smoke bombs per life'), smokeLife: num(15, 3, 40, 1, 'Smoke duration (s)'),
      flashN: num(2, 0, 9, 1, 'Flashbangs per life'), flashStun: num(3, 0.5, 8, 0.1, 'Flashbang blind / stun (s, max)'), flashR: num(18, 4, 40, 1, 'Flashbang radius (m)'),
      knifeN: num(3, 0, 12, 1, 'Throwing knives'), knifeDmg: num(100, 5, 300, 5, 'Throwing knife damage'), knifePick: bool(true, 'Knives can be picked back up'),
      decoyN: num(2, 0, 9, 1, 'Decoys per life'), decoyTime: num(8, 2, 30, 0.5, 'Decoy noise time (s)'), decoyRange: num(30, 5, 80, 1, 'Decoy lure radius (m)'),
      cloak: bool(true, 'Shadow cloak'), cloakK: num(0.25, 0, 1, 0.05, 'Cloaked: visibility to bots (x)'), cloakDark: num(0.3, 0.02, 2, 0.01, 'Cloak: max light level'),
      cloakSpeed: num(1.6, 0, 5, 0.1, 'Cloak: max speed (m/s)'), cloakBody: num(0.3, 0, 1, 0.05, 'Cloaked: body brightness to mercs (x)'),
      climb: bool(true, 'Wall climb / ledge hang'), climbH: num(3.4, 1, 4.5, 0.1, 'Max climb height (m)'), climbTime: num(0.8, 0.3, 2.5, 0.05, 'Climb-up time (s)'),
      lamps: bool(true, 'Lamps can be shot out'), botGadgets: bool(true, 'Spy bots use gadgets'), loadoutScreen: bool(true, 'Loadout screen before each round'),
      xhair: bool(true, 'Spy crosshair'), xhairSize: num(1, 0.5, 2.5, 0.05, 'Crosshair size (x)'),
      gunLock: bool(true, 'Spy sidearm locked to M9 + suppressor'), botGun: bool(true, 'Spy bots carry the M9 too'),
      armorDmg: num(2, 0, 100, 1, 'Merc body armor damage'), headKillM: num(2, 0, 20, 0.5, 'Headshot kill range m'),
      camDown: num(1.25, 0.3, 1.45, 0.05, 'Camera: max look down (rad)'), camUp: num(0.85, 0.2, 1.2, 0.05, 'Camera: max look up (rad)'),
    },
  };
  /* weapon fields the editor exposes, read from / written to a WEAPONS def */
  const WF = {
    dmgNear: num(30, 1, 500, 1, 'Damage near'), dmgFar: num(20, 1, 500, 1, 'Damage far'), rangeNear: num(18, 1, 400, 1, 'Falloff start (m)'), rangeFar: num(50, 1, 500, 1, 'Falloff end (m)'),
    rpm: num(600, 20, 2000, 10, 'Fire rate (rpm)'), auto: bool(true, 'Full auto'), mag: num(30, 1, 200, 1, 'Magazine'), reserve: num(120, 0, 999, 1, 'Reserve ammo'),
    reload: num(2.2, 0.2, 10, 0.05, 'Reload time (s)'), hip: num(0.03, 0, 0.3, 0.001, 'Hip spread'), ads: num(0.002, 0, 0.2, 0.0005, 'ADS spread'),
    recoilV: num(0.01, 0, 0.2, 0.0005, 'Recoil vertical'), recoilH: num(0.005, 0, 0.2, 0.0005, 'Recoil horizontal'), kick: num(0.03, 0, 0.3, 0.002, 'Visual kick'),
    head: num(1.5, 1, 5, 0.05, 'Headshot multiplier'), move: num(1, 0.4, 1.4, 0.01, 'Mobility'), sound: sel('rifle', [], 'Sound set'), model: sel('m4', [], '3D model'),
  };
  const AF = { // attachment modifiers (multipliers, 1 = no change) and flags
    dmg: num(1, 0.1, 5, 0.01, 'Damage x'), rng: num(1, 0.1, 5, 0.01, 'Range x'), rpm: num(1, 0.2, 3, 0.01, 'Fire rate x'), magx: num(1, 0.2, 5, 0.05, 'Magazine x'),
    reload: num(1, 0.2, 3, 0.01, 'Reload time x'), ads: num(1, 0.3, 3, 0.01, 'ADS time x (lower = faster)'), zoom: num(1, 0.5, 4, 0.01, 'Zoom x'),
    hip: num(1, 0.1, 3, 0.01, 'Hip spread x (lower = more accurate)'), adsAcc: num(1, 0.1, 3, 0.01, 'ADS spread x'), vrec: num(1, 0.1, 3, 0.01, 'Vertical recoil x'),
    hrec: num(1, 0.1, 3, 0.01, 'Horizontal recoil x'), kick: num(1, 0.1, 3, 0.01, 'Kick x'), mob: num(1, 0.5, 1.5, 0.01, 'Mobility x'), flash: num(1, 0, 3, 0.01, 'Muzzle flash x'),
    silent: bool(false, 'Suppressed (quiet, bots hear it only close)'), laser: bool(false, 'Laser'), vol: num(1, 0, 2, 0.05, 'Shot volume x'), soundSet: sel('', [], 'Sound set override'),
  };
  const DEF_LOADOUT = { merc: { primary: 'm4', primaryAtt: [], secondary: 'm9', secondaryAtt: [] }, spy: { secondary: 'none', secondaryAtt: [], gadgets: { smoke: true, flash: true, knife: true, decoy: true } } };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DEF_PAL = ['#0b0d10', '#1b2a2e', '#3c5d62', '#e6dfcc', '#b3242a']; // custom palette starts as the BLACKOUT one
  const palOk = (a) => { if (!Array.isArray(a)) return null; const o = a.filter((h) => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h)).slice(0, 16).map((h) => h.toLowerCase()); return o.length >= 2 ? o : null; };
  function defaults() {
    const v = {};
    for (const s in SCHEMA) { v[s] = {}; for (const k in SCHEMA[s]) v[s][k] = SCHEMA[s][k].d; }
    v.look.pal = DEF_PAL.slice();
    v.weapons = { edits: {}, custom: {} }; v.atts = { edits: {}, custom: {} }; v.loadout = clone(DEF_LOADOUT); v.lookPresets = {}; v.lightVer = LIGHT_VER;
    return v;
  }
  /* ---------- validation: never trust a number (editor field, imported file, network) ---------- */
  function vField(F, x) {
    if (F.t === 'n') { const n = typeof x === 'string' ? parseFloat(x) : x; if (typeof n !== 'number' || !isFinite(n)) return F.d; return Math.min(F.max, Math.max(F.min, n)); }
    if (F.t === 'b') return typeof x === 'boolean' ? x : x === 'true' ? true : x === 'false' ? false : F.d;
    if (F.t === 'c') return typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x) ? x.toLowerCase() : F.d;
    if (F.t === 's') return typeof x === 'string' && (!F.opts.length || F.opts.includes(x)) ? x : F.d;
    return F.d;
  }
  const idOk = (s) => typeof s === 'string' && /^[a-z0-9_]{1,24}$/.test(s);
  const nameOk = (s, d) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 24).replace(/[<>&"]/g, '') : d);
  function vFields(SPEC, o, keepUnset) {
    const out = {}; if (!o || typeof o !== 'object') return out;
    for (const k in SPEC) if (k in o) out[k] = vField(SPEC[k], o[k]);
    return out;
  }
  function sanitize(raw) {
    const v = defaults(); if (!raw || typeof raw !== 'object') return v;
    if (!(raw.lightVer >= LIGHT_VER) && raw.light && typeof raw.light === 'object') { raw = Object.assign({}, raw, { light: Object.assign({}, raw.light) }); for (const k of OLD_TORCH) delete raw.light[k]; BOCFG_MIGRATED = true; }
    for (const s in SCHEMA) if (raw[s] && typeof raw[s] === 'object') for (const k in SCHEMA[s]) if (k in raw[s]) v[s][k] = vField(SCHEMA[s][k], raw[s][k]);
    if (raw.look && typeof raw.look === 'object') { const pp = palOk(raw.look.pal); if (pp) v.look.pal = pp; }
    const soundOpts = gunSoundList(), modelOpts = gunModelList();
    const wfx = (o) => { const r = vFields(WF, o); if ('sound' in r && !soundOpts.includes(o.sound)) delete r.sound; else if (o && o.sound) r.sound = o.sound; if (o && modelOpts.includes(o.model)) r.model = o.model; else delete r.model; return r; };
    if (raw.weapons && typeof raw.weapons === 'object') {
      for (const id in raw.weapons.edits || {}) if (hasKey(WEAPONS, id)) v.weapons.edits[id] = wfx(raw.weapons.edits[id]);
      for (const id in raw.weapons.custom || {}) {
        const c = raw.weapons.custom[id]; if (!idOk(id) || hasKey(WEAPONS, id) || !c || !hasKey(WEAPONS, c.from)) continue;
        v.weapons.custom[id] = Object.assign({ from: c.from, name: nameOk(c.name, id) }, wfx(c));
      }
    }
    const afx = (o) => { const r = vFields(AF, o); if (o && soundOpts.includes(o.soundSet)) r.soundSet = o.soundSet; else delete r.soundSet; if (o && Array.isArray(o.fits)) r.fits = o.fits.filter((g) => typeof g === 'string' && g.length < 30).slice(0, 80); return r; };
    if (raw.atts && typeof raw.atts === 'object') {
      for (const id in raw.atts.edits || {}) if (hasKey(ATT, id) && !ATT[id].custom) v.atts.edits[id] = afx(raw.atts.edits[id]);
      for (const id in raw.atts.custom || {}) {
        const c = raw.atts.custom[id]; if (!idOk(id) || (hasKey(ATT, id) && !ATT[id].custom) || !c || !ATT_SLOTS.includes(c.slot)) continue;
        v.atts.custom[id] = Object.assign({ slot: c.slot, name: nameOk(c.name, id), model: typeof c.model === 'string' && ATT_BUILD[c.model] ? c.model : '' }, afx(c));
      }
    }
    if (raw.loadout && typeof raw.loadout === 'object') {
      const L = raw.loadout, gunOk = (g) => typeof g === 'string' && (hasKey(WEAPONS, g) || hasKey(v.weapons.custom, g));
      const attl = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 8) : []);
      if (L.merc) {
        if (gunOk(L.merc.primary)) v.loadout.merc.primary = L.merc.primary;
        if (gunOk(L.merc.secondary) || L.merc.secondary === 'none') v.loadout.merc.secondary = L.merc.secondary;
        v.loadout.merc.primaryAtt = attl(L.merc.primaryAtt); v.loadout.merc.secondaryAtt = attl(L.merc.secondaryAtt);
      }
      if (L.spy && (gunOk(L.spy.secondary) || L.spy.secondary === 'none')) v.loadout.spy.secondary = L.spy.secondary;
      if (L.spy) v.loadout.spy.secondaryAtt = attl(L.spy.secondaryAtt);
      if (L.spy && L.spy.gadgets && typeof L.spy.gadgets === 'object') for (const k in v.loadout.spy.gadgets) if (typeof L.spy.gadgets[k] === 'boolean') v.loadout.spy.gadgets[k] = L.spy.gadgets[k];
    }
    if (raw.lookPresets && typeof raw.lookPresets === 'object') {
      let n = 0;
      for (const name in raw.lookPresets) { if (n++ > 30) break; const p = raw.lookPresets[name], o = {}; for (const k in SCHEMA.look) o[k] = vField(SCHEMA.look[k], p && p[k]); o.pal = palOk(p && p.pal) || DEF_PAL.slice(); v.lookPresets[nameOk(name, 'preset')] = o; }
    }
    return v;
  }
  function gunSoundList() { return typeof GUNSND === 'undefined' ? [] : Object.keys(GUNSND).filter((k) => !k.endsWith('_s') && !k.includes('@')); }
  function gunModelList() { return typeof GUN_MODELS === 'undefined' ? [] : Object.keys(GUN_MODELS); }

  /* ---------- weapons: snapshot the shipped values, then apply edits on top ---------- */
  const ORIG = {}, ATT_ORIG = {};
  function snap() {
    if (Object.keys(ORIG).length) return;
    for (const id in WEAPONS) { const w = WEAPONS[id]; ORIG[id] = { dmg: w.dmg.slice(), range: w.range.slice(), rpm: w.rpm, auto: w.auto, mag: w.mag, reserve: w.reserve, reload: w.reload, reloadEmpty: w.reloadEmpty, spread: w.spread.slice(), recoil: Object.assign({}, w.recoil), head: w.head, move: w.move, sound: w.sound, model: w.model, key: w.key, slots: w.slots.slice(), fam: w.fam }; }
    for (const id in ATT) ATT_ORIG[id] = { mods: Object.assign({}, ATT[id].mods), fam: ATT[id].fam.slice() };
  }
  function readW(w) { // WEAPONS def -> editor fields
    return { dmgNear: w.dmg[0], dmgFar: w.dmg[1], rangeNear: w.range[0], rangeFar: w.range[1], rpm: w.rpm, auto: !!w.auto, mag: w.mag, reserve: w.reserve, reload: w.reload || w.shellTime || 1,
      hip: w.spread[0], ads: w.spread[1], recoilV: w.recoil.v, recoilH: w.recoil.h, kick: w.recoil.kick, head: w.head, move: w.move, sound: w.sound, model: w.model };
  }
  function writeW(w, o, base) { // editor fields -> def (base: shipped values for ratios)
    if ('dmgNear' in o) w.dmg = [o.dmgNear, w.dmg[1]]; if ('dmgFar' in o) w.dmg = [w.dmg[0], o.dmgFar];
    if ('rangeNear' in o) w.range = [o.rangeNear, Math.max(o.rangeNear, w.range[1])]; if ('rangeFar' in o) w.range = [w.range[0], Math.max(w.range[0], o.rangeFar)];
    if ('rpm' in o) w.rpm = o.rpm; if ('auto' in o) w.auto = o.auto; if ('mag' in o) w.mag = Math.round(o.mag); if ('reserve' in o) w.reserve = Math.round(o.reserve);
    if ('reload' in o) { if (w.tube) w.shellTime = o.reload; else { const k = base && base.reload ? base.reloadEmpty / base.reload : 1.2; w.reload = o.reload; w.reloadEmpty = o.reload * k; } }
    if ('hip' in o) w.spread = [o.hip, w.spread[1]]; if ('ads' in o) w.spread = [w.spread[0], o.ads];
    if ('recoilV' in o || 'recoilH' in o || 'kick' in o) {
      const r = Object.assign({}, w.recoil); if ('recoilV' in o) r.v = o.recoilV; if ('recoilH' in o) r.h = o.recoilH;
      if ('kick' in o) { const k0 = base ? base.recoil.kick : r.kick; r.rot = (base ? base.recoil.rot : r.rot) * (k0 > 0 ? o.kick / k0 : 1); r.kick = o.kick; }
      w.recoil = r;
    }
    if ('head' in o) w.head = o.head; if ('move' in o) w.move = o.move;
    if ('sound' in o && GUNSND[o.sound]) w.sound = o.sound;
    if ('model' in o && GUN_MODELS[o.model] && o.model !== w.model) { w.model = o.model; w.key = o.model; w.fam = GUN_MODELS[o.model].fam; w.slots = SLOTS_BY_FAM[w.fam].slice(); } // 3D model swap: the viewmodel cache key follows the model
  }
  const CUSTOM = {}; // custom guns: id -> def (not in WEAPONS, so Riposte's menus, unlocks and stats never see them)
  function applyWeapons() {
    snap();
    for (const id in WEAPONS) { // restore, then edits
      const w = WEAPONS[id], o = ORIG[id];
      w.dmg = o.dmg.slice(); w.range = o.range.slice(); w.rpm = o.rpm; w.auto = o.auto; w.mag = o.mag; w.reserve = o.reserve; w.reload = o.reload; w.reloadEmpty = o.reloadEmpty;
      w.spread = o.spread.slice(); w.recoil = Object.assign({}, o.recoil); w.head = o.head; w.move = o.move; w.sound = o.sound; w.model = o.model; w.key = o.key; w.fam = o.fam; w.slots = o.slots.slice();
      if (BOCFG.v.weapons.edits[id]) writeW(w, BOCFG.v.weapons.edits[id], o);
    }
    for (const k in WDEFS) delete WDEFS[k]; // weapons with attachments are rebuilt from the new values
    for (const k in CUSTOM) delete CUSTOM[k];
    for (const id in BOCFG.v.weapons.custom) {
      const c = BOCFG.v.weapons.custom[id], src = WEAPONS[c.from]; if (!src) continue;
      const d = Object.assign({}, src, { id, name: c.name, custom: true, from: c.from, att: [], camo: null, dmg: src.dmg.slice(), range: src.range.slice(), spread: src.spread.slice(), recoil: Object.assign({}, src.recoil) });
      d.base = d; d.key = src.model;
      writeW(d, c, ORIG[c.from]);
      d.key = d.model; d.slots = SLOTS_BY_FAM[GUN_MODELS[d.model] ? GUN_MODELS[d.model].fam : d.fam].slice();
      CUSTOM[id] = d;
    }
  }
  /* sound set + volume: a volume other than 1 gets its own GUNSND profile (same recordings, scaled) */
  function soundKind(base, vol) {
    if (!GUNSND[base]) base = 'rifle';
    if (!(vol > 0) || Math.abs(vol - 1) < 0.01) return base;
    const k = base + '@' + Math.round(vol * 100);
    if (!GUNSND[k]) { const P = GUNSND[base]; GUNSND[k] = Object.assign({}, P, { alias: P.alias || base, smp: (P.smp || 1) * vol }); }
    return k;
  }
  function applyAtts() {
    snap();
    for (const id in ATT) if (ATT[id].custom) { delete ATT[id]; delete ATT_BUILD[id]; }
    for (const id in ATT_ORIG) { ATT[id].mods = Object.assign({}, ATT_ORIG[id].mods); ATT[id].fam = ATT_ORIG[id].fam.slice(); delete ATT[id].fits; delete ATT[id].bo; }
    const put = (a, e) => {
      const m = a.mods;
      for (const k in AF) if (k in e && k !== 'vol' && k !== 'soundSet') { if (AF[k].t === 'b') { if (e[k]) m[k] = true; else delete m[k]; } else m[k] = e[k]; }
      a.bo = { vol: e.vol != null ? e.vol : 1, soundSet: e.soundSet || '' };
      if (Array.isArray(e.fits) && e.fits.length) a.fits = e.fits.slice();
    };
    for (const id in BOCFG.v.atts.edits) put(ATT[id], BOCFG.v.atts.edits[id]);
    for (const id in BOCFG.v.atts.custom) {
      const c = BOCFG.v.atts.custom[id];
      ATT[id] = { id, slot: c.slot, name: c.name, lvl: 1, fam: ['rifle', 'smg', 'sniper', 'shotgun', 'pistol'], mods: {}, desc: 'Custom attachment (BLACKOUT editor)', custom: true };
      if (c.model && ATT_BUILD[c.model]) ATT_BUILD[id] = ATT_BUILD[c.model];
      put(ATT[id], c);
    }
    for (const k in WDEFS) delete WDEFS[k];
  }
  // attachment fits: an explicit gun list (editor) wins over the family rule
  const _attFits = attFits;
  attFits = function (base, id) {
    const a = ATT[id]; if (!a) return false;
    if (a.fits && a.fits.length) { const gid = base.custom ? base.id : base.id; return base.slots.includes(a.slot) && (a.fits.includes(gid) || (base.custom && a.fits.includes(base.from))); }
    return _attFits(base, id);
  };
  // sound set / volume of attachments on the derived weapon
  const _deriveDef = deriveDef;
  deriveDef = function (base, att, camo, key) {
    const d = _deriveDef(base, att, camo, key);
    let set = '', vol = 1;
    for (const id of att) { const b = ATT[id] && ATT[id].bo; if (b) { if (b.soundSet) set = b.soundSet; vol *= b.vol; } }
    if (set || vol !== 1) { const sup = d.sound.endsWith('_s'); const k = soundKind(set || base.sound, vol); d.sound = sup ? k + '_s' : k; }
    return d;
  };
  function gunDef(id, att) {
    const base = hasKey(CUSTOM, id) ? CUSTOM[id] : hasKey(WEAPONS, id) ? WEAPONS[id] : null; if (!base) return null;
    const a = attNormalize(base, att || []);
    if (!a.length) return base;
    if (!base.custom) return weaponDef(id, a, null);
    return deriveDef(base, a, null, gunKey(base.model, a));
  }
  function giveMercLoadout() {
    const L = BOCFG.v.loadout.merc, ids = [];
    const p = gunDef(L.primary, L.primaryAtt) || WEAPONS.m4; ids.push(p);
    const s = L.secondary !== 'none' ? gunDef(L.secondary, L.secondaryAtt) : null; ids.push(s || WEAPONS.m9);
    PL.ent.arms = makeArms(ids);
    vmEquip(PL.weapons[0].def); VM.action = null; VM.lower = 1; VM.lowerTarget = 0;
  }
  /* pass 10: the spy sidearm is the suppressed M9 unless the editor unlocks it (Spy kit > gunLock) */
  const spyGun = () => (BOCFG.v.spy && BOCFG.v.spy.gunLock !== false) ? { id: 'm9', att: ['sil'] } : { id: BOCFG.v.loadout.spy.secondary, att: BOCFG.v.loadout.spy.secondaryAtt || [] };
  const spyGunDef = () => { const g = spyGun(); return g.id !== 'none' ? gunDef(g.id, g.att) : null; };
  function giveSpyLoadout() {
    const d = spyGunDef();
    if (d) { PL.ent.arms = makeArms([d, d]); }
  }
  const spyArmed = () => { const g = spyGun(); return !!(g.id !== 'none' && (hasKey(WEAPONS, g.id) || hasKey(CUSTOM, g.id))); };

  /* ---------- lighting ---------- */
  const _c = new THREE.Color();
  function applyLight() {
    if (typeof CURMAP === 'undefined' || !CURMAP || !boMapOn(CURMAP.id) || !CURMAP.def) return;
    const L = BOCFG.v.light;
    try { FinalShader.uniforms.uExposure.value = L.exposure * (GRADE_DEF.gain || 1); } catch (e) {}
    try { hemi.intensity = L.ambient; } catch (e) {}
    try { if (typeof csm !== 'undefined' && csm) for (const l of csm.lights) l.intensity = L.moon; } catch (e) {}
    try { scene.fog.density = L.fogD * 1.0; scene.fog.color.set(L.fogColor); } catch (e) {}
    try { if (LIGHT.nyL) WMU.uVolL.value.x = LAMP_MAX * L.lamps; } catch (e) {}
    const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    try { if (MAT.boScreen) { const t = rgb(L.termColor), k = 2.4 * L.termGlow; MAT.boScreen.color.setRGB(t[0] * k, t[1] * k, t[2] * k); } } catch (e) {}
    // pass 14: light colours (lamp pools are recoloured in the shader, see VOL_L in 02c-materials.js)
    try { const c = rgb(L.lampColor); WMU.uVolLC.value.set(c[0], c[1], c[2], L.lampTint); } catch (e) {}
    try { if (typeof csm !== 'undefined' && csm) for (const l of csm.lights) l.color.set(L.moonColor); } catch (e) {}
    try { hemi.color.set(L.ambColor); } catch (e) {}
  }
  /* flashlight battery: drains while on, recharges while off; empty switches it off */
  function batteryTick(dt) {
    const L = BOCFG.v.light;
    if (BO.battery == null) BO.battery = 100;
    if (!(L.flashDrain > 0)) { BO.battery = 100; return; }
    if (BO.flashOn && MATCH.state === 'playing') { BO.battery = Math.max(0, BO.battery - L.flashDrain * dt); if (BO.battery <= 0) BO.flashOn = false; }
    else BO.battery = Math.min(100, BO.battery + L.flashRecharge * dt);
  }

  /* ---------- store ---------- */
  let saveT = null;
  const BOCFG = window.BOCFG = {
    SCHEMA, WF, AF, CUSTOM, ORIG, v: defaults(), remote: false,
    defaults, sanitize, readW, vField, idOk, nameOk, applyWeapons, applyAtts, gunDef, gunSoundList, gunModelList, soundKind,
    giveMercLoadout, giveSpyLoadout, spyArmed, spyGun, spyGunDef,
    load() { try { const s = localStorage.getItem(KEY); if (s) this.v = sanitize(JSON.parse(s)); } catch (e) { console.warn('BO cfg load', e); this.v = defaults(); } },
    save() { if (this.remote) return; clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) {} }, 150); },
    saveNow() { if (this.remote) return; try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) {} },
    applyAll() { applyWeapons(); applyAtts(); applyLight(); if (window.BOPOST) BOPOST.apply(this.v.look); },
    applySection(s) {
      if (s === 'light') applyLight();
      else if (s === 'look') { if (window.BOPOST) BOPOST.apply(this.v.look); }
      else if (s === 'weapons' || s === 'atts' || s === 'loadout') { applyWeapons(); applyAtts(); }
    },
    set(section, key, value) {
      const F = SCHEMA[section] && SCHEMA[section][key]; if (!F) return undefined;
      if (F.t === 'n' && (value === '' || value == null || !Number.isFinite(+value))) return this.v[section][key]; // invalid number: keep the current value
      this.v[section][key] = vField(F, value); this.applySection(section); this.save(); return this.v[section][key];
    },
    replace(raw, remote) { this.v = sanitize(raw); this.remote = !!remote; this.applyAll(); if (!remote) this.saveNow(); },
    resetSection(s) {
      const D = defaults();
      if (s === 'weapons') { this.v.weapons = D.weapons; this.v.loadout = D.loadout; }
      else if (s === 'atts') this.v.atts = D.atts;
      else if (D[s]) this.v[s] = D[s];
      this.applyAll(); this.save();
    },
    resetAll() { this.v = defaults(); this.remote = false; this.applyAll(); this.saveNow(); },
    exportJson() { return JSON.stringify(Object.assign({ format: 'blackout-config', version: 1 }, this.v), null, 2); },
    download() {
      const blob = new Blob([this.exportJson()], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'blackout-config.json'; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    importText(txt) { const raw = JSON.parse(txt); this.replace(raw, false); return true; },
    tick(dt) { try { batteryTick(dt); } catch (e) {} },
    applyLight,
  };
  BOCFG.load();
  if (BOCFG_MIGRATED) { BOCFG.migrated = true; BOCFG.saveNow(); console.info('BLACKOUT config: flashlight settings upgraded to the pass 7 torch'); }
  // apply once the game is up (WEAPONS / ATT exist now; the map lighting applies when BLACKOUT loads)
  try { applyWeapons(); applyAtts(); } catch (e) { console.warn('BO cfg apply', e); }
  // map loaded / match started: lighting and look again (the map's atmosphere resets them)
  const _startMatch = startMatch;
  startMatch = function (opt) { try { applyLight(); if (window.BOPOST) BOPOST.apply(BOCFG.v.look); } catch (e) {} const r = _startMatch(opt); try { applyLight(); } catch (e) {} return r; };
  const _aa = applyAtmosphere;
  applyAtmosphere = function (A) { const r = _aa(A); try { applyLight(); } catch (e) {} return r; };
  const _frame = frame;
  frame = function (now) { const dt = Math.min(0.05, (BOCFG._t != null ? now - BOCFG._t : 16) / 1000); BOCFG._t = now; _frame(now); BOCFG.tick(dt); };

  /* ---------- multiplayer: the host's config travels with the start message ---------- */
  const _sendTo = netSendTo;
  netSendTo = function (pl, m) {
    // pass 14b: the config no longer rides inside 'start' (PeerJS json channels drop any message over 16 kB, and that
    // dropped the start too); it goes first as chunked 'bocfg' messages (09zzb-blackout-admin.js), the reliable channel keeps the order
    if (m && m.t === 'start' && NET.role === 'host' && window.BOADMIN) { try { BOADMIN.sendFull(pl); } catch (e) {} }
    return _sendTo(pl, m);
  };
  const _startOnline = netStartOnline;
  netStartOnline = function (m) {
    if (m && m.bocfg && NET.role === 'client') { try { BOCFG.replace(m.bocfg, true); console.info('BLACKOUT: host config applied'); } catch (e) { console.warn('BO host cfg', e); } }
    return _startOnline(m);
  };
})();
