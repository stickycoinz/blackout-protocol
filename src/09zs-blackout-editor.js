/* ==========================================================================
   BLACKOUT editor (pass 6): F10, or the EDITOR button next to MERC / SPY. Five tabs (Lighting, Look, Weapons, Attachments,
   Gameplay). Every field is validated and applied at once, auto-saved, and the whole config exports / imports as JSON.
   Riposte's own tokens (--panel, --acc, --hud, --stencil) style it. Keys typed in the panel never reach the game.
   ========================================================================== */
(function () {
  const CSS = `
  #boEd { position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 100vw); z-index: 100000; display: none; flex-direction: column;
    background: var(--panel-2, rgba(14,16,12,.96)); color: var(--paper, #F2EEE3); font: 500 15px/1.25 var(--hud, sans-serif);
    border-left: 1px solid var(--line-2, #444); box-shadow: -12px 0 40px rgba(0,0,0,.55); user-select: none; }
  #boEd.open { display: flex; }
  #boEd h2 { margin: 0; font: 400 30px/1 var(--stencil, Impact, sans-serif); letter-spacing: .02em; }
  #boEd .hd { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 8px; }
  #boEd .hd small { color: var(--mute, #8C8675); font-size: 14px; letter-spacing: var(--track, .08em); text-transform: uppercase; }
  #boEd .tabs { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--line, #333); }
  #boEd .tab { flex: 1; padding: 9px 4px; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--dim, #B4AE9C);
    font: 700 14px var(--hud, sans-serif); letter-spacing: var(--track, .08em); text-transform: uppercase; cursor: pointer; }
  #boEd .tab.on { color: var(--acc, #F6C445); border-bottom-color: var(--acc, #F6C445); }
  #boEd .body { flex: 1; overflow-y: auto; padding: 10px 16px 16px; }
  #boEd .sec { margin: 14px 0 6px; color: var(--acc, #F6C445); font-weight: 700; letter-spacing: var(--track-w, .16em); text-transform: uppercase; font-size: 14px; }
  #boEd .row { display: grid; grid-template-columns: 1fr 150px 70px; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--faint, #222); }
  #boEd .row.w2 { grid-template-columns: 1fr 220px; }
  #boEd .row label { color: var(--paper, #eee); }
  #boEd input[type=range] { width: 100%; accent-color: var(--acc, #F6C445); }
  #boEd input[type=number], #boEd input[type=text], #boEd select { width: 100%; box-sizing: border-box; background: var(--ink-3, #171913); color: var(--paper, #eee);
    border: 1px solid var(--line-2, #444); border-radius: 2px; padding: 4px 6px; font: 600 14px var(--hud, sans-serif); }
  #boEd input.bad { border-color: var(--danger, #EF5543); background: rgba(239,85,67,.18); }
  #boEd input[type=checkbox] { accent-color: var(--acc, #F6C445); width: 18px; height: 18px; }
  #boEd input[type=color] { width: 60px; height: 26px; border: 1px solid var(--line-2, #444); background: none; padding: 0; }
  #boEd .btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  #boEd button.b { padding: 7px 10px; background: var(--ink-3, #171913); color: var(--paper, #eee); border: 1px solid var(--line-2, #444); border-radius: 2px;
    font: 700 14px var(--hud, sans-serif); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
  #boEd button.b:hover { border-color: var(--acc, #F6C445); color: var(--acc-hi, #FFD76A); }
  #boEd button.b.pri { background: var(--acc, #F6C445); color: var(--acc-ink, #141005); border-color: var(--acc, #F6C445); }
  #boEd button.b.dng { border-color: rgba(239,85,67,.7); color: #ffb0a6; }
  #boEd .ft { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 16px; border-top: 1px solid var(--line, #333); }
  #boEd .note { color: var(--mute, #8C8675); font-size: 14px; margin: 6px 0; }
  #boEd .chips { display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 4px 0 8px; }
  #boEd .chips label { display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--dim, #ccc); }
  #boEd .toast { position: absolute; left: 16px; right: 16px; bottom: 64px; padding: 8px 10px; background: var(--acc, #F6C445); color: var(--acc-ink, #111);
    font-weight: 700; opacity: 0; transition: opacity .2s; pointer-events: none; }
  #boEd .toast.show { opacity: 1; }
  #boEdBtn { padding: 8px 12px; border: 1px solid #F6C445; background: #1a1608; color: #F6C445; cursor: pointer; border-radius: 4px; font: 600 13px system-ui, sans-serif; }`;
  let root, body, tab = 'light', wSel = null, aSel = null, toastT = null;
  const el = (t, a, ...k) => { const e = document.createElement(t); if (a) for (const n in a) { if (n === 'class') e.className = a[n]; else if (n.startsWith('on')) e[n] = a[n]; else e.setAttribute(n, a[n]); } for (const c of k) if (c != null) e.append(c); return e; };
  function toast(msg) { const t = root.querySelector('.toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); }
  const fmt = (F, v) => (F.step >= 1 ? String(Math.round(v)) : String(+(+v).toFixed(4)));
  /* one field: label + control(s); get() gives the value shown, put(v) stores it and returns the validated value */
  function field(F, get, put) {
    const lab = el('label', null, F.label);
    if (F.t === 'n') {
      const r = el('input', { type: 'range', min: F.min, max: F.max, step: F.step }), n = el('input', { type: 'number', min: F.min, max: F.max, step: F.step });
      const show = (v) => { r.value = v; n.value = fmt(F, v); };
      show(get());
      r.oninput = () => show(put(+r.value));
      n.onchange = () => {
        const x = parseFloat(n.value);
        if (!isFinite(x) || x < F.min || x > F.max) { n.classList.add('bad'); setTimeout(() => n.classList.remove('bad'), 900); toast('Allowed range: ' + F.min + ' to ' + F.max); }
        show(put(isFinite(x) ? x : get()));
      };
      return el('div', { class: 'row' }, lab, r, n);
    }
    let c;
    if (F.t === 'b') { c = el('input', { type: 'checkbox' }); c.checked = !!get(); c.onchange = () => { c.checked = put(c.checked); }; }
    else if (F.t === 'c') { c = el('input', { type: 'color' }); c.value = get(); c.oninput = () => { c.value = put(c.value); }; }
    else { c = el('select'); for (const o of F.opts) c.append(el('option', { value: o }, o || '(unchanged)')); c.value = get(); c.onchange = () => { c.value = put(c.value); }; }
    return el('div', { class: 'row w2' }, lab, c);
  }
  const sec = (t) => el('div', { class: 'sec' }, t);
  const note = (t) => el('div', { class: 'note' }, t);
  const btn = (t, f, cls) => el('button', { class: 'b' + (cls ? ' ' + cls : ''), type: 'button', onclick: f }, t);
  function sectionFields(s, keys) {
    const S = BOCFG.SCHEMA[s], out = [];
    for (const k of keys || Object.keys(S)) out.push(field(S[k], () => BOCFG.v[s][k], (v) => BOCFG.set(s, k, v)));
    return out;
  }
  /* ---------- tabs ---------- */
  function tLight() {
    return [sec('Merc flashlight'), ...sectionFields('light', ['flashI', 'flashAngle', 'flashSoft', 'flashRange', 'flashSpill', 'flashSpillW', 'flashDecay', 'flashTemp', 'flashColor', 'flashBeam', 'botFlash', 'flashDrain', 'flashRecharge']),
      note('Hotspot = the bright centre beam; spill = the wide soft halo around it. Decay 2 fades smoothly to the throw distance. Bot / peer torch lights: how many nearby mercs cast real light (0 to 3, applies at the next map load); every merc also shows a faint visible beam. L or Shift+F toggles the flashlight. With drain above 0 the battery empties while it is on and the light shuts off at 0 %.'),
      sec('Level'), ...sectionFields('light', ['exposure', 'ambient', 'moon', 'fogD', 'fogColor', 'lamps', 'termGlow']),
      note('Level lighting applies on the BLACKOUT map (live in a match).'),
      el('div', { class: 'btns' }, btn('Reset lighting', () => { BOCFG.resetSection('light'); render(); toast('Lighting reset'); }, 'dng'))];
  }
  function tLook() {
    const P = BOPOST.PRESETS, U = BOCFG.v.lookPresets, s = el('select');
    for (const n in P) s.append(el('option', { value: 'b:' + n }, n));
    for (const n in U) s.append(el('option', { value: 'u:' + n }, n + ' (saved)'));
    const name = el('input', { type: 'text', placeholder: 'preset name', maxlength: 24 });
    const load = () => { const [k, n] = [s.value.slice(0, 1), s.value.slice(2)]; const src = k === 'b' ? P[n] : U[n]; const D = BOCFG.defaults().look;
      BOCFG.v.look = Object.assign(D, k === 'b' ? src : src); BOCFG.applySection('look'); BOCFG.save(); render(); toast('Look: ' + n); };
    const save = () => { const n = BOCFG.nameOk(name.value, ''); if (!n) { name.classList.add('bad'); toast('Type a preset name'); return; } U[n] = Object.assign({}, BOCFG.v.look); BOCFG.save(); render(); toast('Saved preset ' + n); };
    const del = () => { if (s.value.startsWith('u:')) { delete U[s.value.slice(2)]; BOCFG.save(); render(); toast('Preset deleted'); } else toast('Built-in presets cannot be deleted'); };
    return [sec('Presets'), el('div', { class: 'row w2' }, el('label', null, 'Preset'), s),
      el('div', { class: 'btns' }, btn('Load', load, 'pri'), btn('Delete', del, 'dng')),
      el('div', { class: 'row w2' }, el('label', null, 'Save current as'), name), el('div', { class: 'btns' }, btn('Save preset', save), btn('Reset look', () => { BOCFG.resetSection('look'); render(); toast('Look reset'); }, 'dng')),
      sec('Resolution'), ...sectionFields('look', ['pixel', 'renderScale']),
      sec('Dithering and palette'), ...sectionFields('look', ['dither', 'ditherPat', 'ditherStr', 'levels', 'palette']),
      note('Palette "blackout" = near-black / slate-teal / bone white / red. Without a palette, dithering quantises each colour channel to the colour levels.'),
      sec('Grade'), ...sectionFields('look', ['contrast', 'saturation', 'brightness']),
      sec('Outlines and screen'), ...sectionFields('look', ['outline', 'outlineW', 'outlineStr', 'vignette', 'grain', 'scan', 'scanSize'])];
  }
  function gunList() { return Object.keys(WEAPONS).map((id) => [id, WEAPONS[id].name + ' (' + WEAPONS[id].cat + ')']).concat(Object.keys(BOCFG.v.weapons.custom).map((id) => [id, BOCFG.v.weapons.custom[id].name + ' (custom)'])); }
  function tWeapons() {
    const W = BOCFG.v.weapons, list = gunList();
    if (!wSel || !list.some(([id]) => id === wSel)) wSel = 'm4' in WEAPONS ? 'm4' : list[0][0];
    const custom = !!W.custom[wSel], s = el('select');
    for (const [id, n] of list) s.append(el('option', { value: id }, n));
    s.value = wSel; s.onchange = () => { wSel = s.value; render(); };
    const cur = () => (custom ? BOCFG.CUSTOM[wSel] : WEAPONS[wSel]);
    const store = () => (custom ? W.custom[wSel] : (W.edits[wSel] = W.edits[wSel] || {}));
    const WF = Object.assign({}, BOCFG.WF);
    WF.sound = Object.assign({}, WF.sound, { opts: BOCFG.gunSoundList() }); WF.model = Object.assign({}, WF.model, { opts: BOCFG.gunModelList() });
    const rows = [];
    for (const k in WF) rows.push(field(WF[k], () => BOCFG.readW(cur())[k], (v) => { const x = BOCFG.vField(WF[k], v); store()[k] = x; BOCFG.applySection('weapons'); BOCFG.save(); return BOCFG.readW(cur())[k]; }));
    const cname = el('input', { type: 'text', placeholder: 'new gun name', maxlength: 24 });
    const clone = () => {
      const n = BOCFG.nameOk(cname.value, ''); if (!n) { cname.classList.add('bad'); toast('Type a name for the new gun'); return; }
      let id = 'c_' + n.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18); while (W.custom[id] || WEAPONS[id]) id += '2';
      const src = custom ? W.custom[wSel].from : wSel, o = Object.assign({ from: src, name: n }, BOCFG.readW(cur())); W.custom[id] = o;
      BOCFG.applySection('weapons'); BOCFG.save(); wSel = id; render(); toast('Created ' + n);
    };
    const L = BOCFG.v.loadout, gs = (val, none, onc) => { const x = el('select'); if (none) x.append(el('option', { value: 'none' }, 'none')); for (const [id, n] of list) x.append(el('option', { value: id }, n)); x.value = val; x.onchange = () => onc(x.value); return x; };
    const attChips = (gid, arr) => {
      const base = BOCFG.CUSTOM[gid] || WEAPONS[gid], box = el('div', { class: 'chips' }); if (!base) return box;
      for (const id in ATT) if (attFits(base, id)) { const c = el('input', { type: 'checkbox' }); c.checked = arr.includes(id);
        c.onchange = () => { const i = arr.indexOf(id); if (c.checked && i < 0) { for (let j = arr.length - 1; j >= 0; j--) if (ATT[arr[j]] && ATT[arr[j]].slot === ATT[id].slot) arr.splice(j, 1); arr.push(id); } else if (!c.checked && i >= 0) arr.splice(i, 1); BOCFG.save(); render(); };
        box.append(el('label', null, c, ATT[id].name + ' [' + ATT[id].slot + ']')); }
      return box;
    };
    const now = () => { try { if (MATCH.state === 'playing' && typeof BO !== 'undefined') { if (BO.role === 'spy') BOCFG.giveSpyLoadout(); else BOCFG.giveMercLoadout(); toast('Loadout given'); } else toast('Applies when the next round starts'); } catch (e) { toast('Could not apply: ' + e.message); } };
    return [sec('Gun'), el('div', { class: 'row w2' }, el('label', null, 'Weapon'), s), ...rows,
      el('div', { class: 'btns' },
        btn(custom ? 'Delete custom gun' : 'Reset this gun', () => { if (custom) { delete W.custom[wSel]; wSel = null; } else delete W.edits[wSel]; BOCFG.applySection('weapons'); BOCFG.save(); render(); toast('Done'); }, 'dng')),
      el('div', { class: 'row w2' }, el('label', null, 'Clone as new gun'), cname), el('div', { class: 'btns' }, btn('Clone', clone, 'pri')),
      sec('Loadouts'),
      el('div', { class: 'row w2' }, el('label', null, 'Merc primary'), gs(L.merc.primary, false, (v) => { L.merc.primary = v; L.merc.primaryAtt = []; BOCFG.save(); render(); })),
      note('Primary attachments:'), attChips(L.merc.primary, L.merc.primaryAtt),
      el('div', { class: 'row w2' }, el('label', null, 'Merc secondary'), gs(L.merc.secondary, true, (v) => { L.merc.secondary = v; L.merc.secondaryAtt = []; BOCFG.save(); render(); })),
      el('div', { class: 'row w2' }, el('label', null, 'Spy sidearm'), gs(L.spy.secondary, true, (v) => { L.spy.secondary = v; BOCFG.save(); render(); })),
      note('Spy sidearm "none" keeps spies unarmed (takedowns only). Bots keep their stock guns.'),
      el('div', { class: 'btns' }, btn('Give my loadout now', now, 'pri'))];
  }
  function attList() { return Object.keys(ATT).map((id) => [id, ATT[id].name + ' [' + ATT[id].slot + ']' + (ATT[id].custom ? ' (custom)' : '')]); }
  function tAtts() {
    const A = BOCFG.v.atts, list = attList();
    if (!aSel || !ATT[aSel]) aSel = ATT.sil ? 'sil' : list[0][0];
    const a = ATT[aSel], custom = !!a.custom, s = el('select');
    for (const [id, n] of list) s.append(el('option', { value: id }, n));
    s.value = aSel; s.onchange = () => { aSel = s.value; render(); };
    const store = () => (custom ? A.custom[aSel] : (A.edits[aSel] = A.edits[aSel] || {}));
    const AF = Object.assign({}, BOCFG.AF); AF.soundSet = Object.assign({}, AF.soundSet, { opts: [''].concat(BOCFG.gunSoundList()) });
    const read = (k) => (k === 'vol' ? (a.bo ? a.bo.vol : 1) : k === 'soundSet' ? (a.bo ? a.bo.soundSet : '') : AF[k].t === 'b' ? !!a.mods[k] : a.mods[k] != null ? a.mods[k] : AF[k].d);
    const rows = [];
    for (const k in AF) rows.push(field(AF[k], () => read(k), (v) => { const x = BOCFG.vField(AF[k], v); store()[k] = x; BOCFG.applySection('atts'); BOCFG.save(); return x; }));
    // fits: explicit gun list (empty = Riposte's family rule)
    const fits = (store().fits = store().fits || (a.fits ? a.fits.slice() : [])), box = el('div', { class: 'chips' });
    for (const [gid, n] of gunList()) {
      const g = BOCFG.CUSTOM[gid] || WEAPONS[gid]; if (!g || !g.slots.includes(a.slot)) continue;
      const c = el('input', { type: 'checkbox' }); c.checked = fits.includes(gid);
      c.onchange = () => { const i = fits.indexOf(gid); if (c.checked && i < 0) fits.push(gid); else if (!c.checked && i >= 0) fits.splice(i, 1); BOCFG.applySection('atts'); BOCFG.save(); };
      box.append(el('label', null, c, n));
    }
    const nn = el('input', { type: 'text', placeholder: 'attachment name', maxlength: 24 }), slot = el('select'), model = el('select');
    for (const sl of ['muzzle', 'optic', 'under', 'side', 'mag', 'barrel', 'stock', 'ammo']) slot.append(el('option', { value: sl }, sl));
    const fillModels = () => { model.innerHTML = ''; model.append(el('option', { value: '' }, '(no 3D part)')); for (const id in ATT) if (ATT_BUILD[id] && ATT[id].slot === slot.value && !ATT[id].custom) model.append(el('option', { value: id }, ATT[id].name)); };
    slot.value = a.slot; slot.onchange = fillModels; fillModels(); if (ATT_BUILD[aSel] && !custom) model.value = aSel;
    const create = (copy) => {
      const n = BOCFG.nameOk(nn.value, ''); if (!n) { nn.classList.add('bad'); toast('Type a name for the attachment'); return; }
      let id = 'x_' + n.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18); while (ATT[id]) id += '2';
      const o = { slot: copy ? a.slot : slot.value, name: n, model: copy ? (custom ? A.custom[aSel].model : (ATT_BUILD[aSel] ? aSel : '')) : model.value };
      if (copy) for (const k in AF) o[k] = read(k);
      A.custom[id] = o; BOCFG.applySection('atts'); BOCFG.save(); aSel = id; render(); toast('Created ' + n);
    };
    return [sec('Attachment'), el('div', { class: 'row w2' }, el('label', null, 'Attachment'), s), note('Slot: ' + a.slot + (custom ? ' (custom)' : '') + '. Multipliers: 1 = no change.'), ...rows,
      sec('Fits these guns'), note('None ticked = Riposte family rules. Ticked = only these guns.'), box,
      el('div', { class: 'btns' }, btn(custom ? 'Delete custom attachment' : 'Reset this attachment', () => { if (custom) { delete A.custom[aSel]; aSel = null; } else delete A.edits[aSel]; BOCFG.applySection('atts'); BOCFG.save(); render(); toast('Done'); }, 'dng')),
      sec('New attachment'), el('div', { class: 'row w2' }, el('label', null, 'Name'), nn), el('div', { class: 'row w2' }, el('label', null, 'Slot'), slot), el('div', { class: 'row w2' }, el('label', null, '3D model'), model),
      el('div', { class: 'btns' }, btn('Create', () => create(false), 'pri'), btn('Clone selected', () => create(true))),
      note('Equip attachments on the merc primary in the Weapons tab (Loadouts).')];
  }
  function tGame() {
    return [sec('Round'), ...sectionFields('game', ['roundTime', 'hackTime', 'hacksNeeded', 'extractTime', 'takedownRange']),
      sec('Players'), ...sectionFields('game', ['health', 'spySpeed', 'mercSpeed', 'spyStealth', 'botHack', 'botDelay']),
      sec('Spy roll'), ...sectionFields('game', ['rollIFrames', 'rollCd', 'rollDist']),
      sec('Bots'), ...sectionFields('game', ['mercs', 'spies']),
      note('Round rules, health and team sizes apply when the next round starts. Speeds apply live.'),
      el('div', { class: 'btns' }, btn('Restart round now', () => { try { if (MATCH.state === 'playing' && !(typeof NET !== 'undefined' && NET.role === 'client')) { close(); startMatch(); } else toast('Start a BLACKOUT match first'); } catch (e) { toast(e.message); } }, 'pri'),
        btn('Reset gameplay', () => { BOCFG.resetSection('game'); render(); toast('Gameplay reset'); }, 'dng'))];
  }
  function tSpy() {
    return [sec('Toughness'), ...sectionFields('spy', ['spyDmg', 'stagger', 'staggerSlow']),
      sec('Smoke bomb (G)'), ...sectionFields('spy', ['smokeN', 'smokeLife']),
      sec('Flashbang (Q)'), ...sectionFields('spy', ['flashN', 'flashStun', 'flashR']),
      sec('Throwing knife (X / click)'), ...sectionFields('spy', ['knifeN', 'knifeDmg', 'knifePick']),
      sec('Decoy (V)'), ...sectionFields('spy', ['decoyN', 'decoyTime', 'decoyRange']),
      sec('Shadow cloak'), ...sectionFields('spy', ['cloak', 'cloakK', 'cloakDark', 'cloakSpeed', 'cloakBody']),
      sec('Climb (SPACE at a ledge)'), ...sectionFields('spy', ['climb', 'climbH', 'climbTime']),
      sec('World and bots'), ...sectionFields('spy', ['lamps', 'botGadgets', 'loadoutScreen']),
      note('Gadget counts refill when the next round starts. Everything else applies live.'),
      el('div', { class: 'btns' }, btn('Open loadout (F9)', () => { close(); if (window.BOLOADOUT) BOLOADOUT.open(false); }, 'pri'),
        btn('Reset spy kit', () => { BOCFG.resetSection('spy'); render(); toast('Spy kit reset'); }, 'dng'))];
  }
  const TABS = [['light', 'Lighting', tLight], ['look', 'Look', tLook], ['weapons', 'Weapons', tWeapons], ['atts', 'Attachments', tAtts], ['game', 'Gameplay', tGame], ['spy', 'Spy kit', tSpy]];
  function render() {
    const y = body.scrollTop; body.innerHTML = '';
    for (const b of root.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.t === tab);
    const T = TABS.find((t) => t[0] === tab);
    try { for (const n of T[2]()) body.append(n); } catch (e) { console.warn('BO editor', e); body.append(note('Error: ' + e.message)); }
    if (BOCFG.remote) body.prepend(note('Using the host\u0027s config for this online match (your own settings are kept).'));
    body.scrollTop = y;
  }
  function css() { if (document.getElementById('boEdCss')) return; const st = el('style', { id: 'boEdCss' }); st.textContent = CSS; document.head.append(st); }
  function build() {
    css();
    root = el('div', { id: 'boEd' });
    const tabs = el('div', { class: 'tabs' });
    for (const [id, n] of TABS) { const b = el('button', { class: 'tab', type: 'button' }, n); b.dataset.t = id; b.onclick = () => { tab = id; body.scrollTop = 0; render(); }; tabs.append(b); }
    body = el('div', { class: 'body' });
    const file = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    file.onchange = () => { const f = file.files[0]; if (!f) return; f.text().then((t) => { try { BOCFG.importText(t); render(); toast('Config imported'); } catch (e) { toast('Import failed: not a valid config JSON'); } file.value = ''; }); };
    root.append(el('div', { class: 'hd' }, el('div', null, el('h2', null, 'BLACKOUT EDITOR'), el('small', null, 'F10 to close · auto-saved')), btn('Close', () => close())), tabs, body,
      el('div', { class: 'ft' }, btn('Export JSON', () => { BOCFG.download(); toast('Exported blackout-config.json'); }), btn('Import JSON', () => file.click()),
        btn('Reset all', () => { if (confirm('Reset every BLACKOUT setting to default?')) { BOCFG.resetAll(); render(); toast('Everything reset'); } }, 'dng'), file),
      el('div', { class: 'toast' }));
    // the game never sees keys or clicks meant for the panel
    for (const ev of ['keydown', 'keyup']) root.addEventListener(ev, (e) => { if (e.code !== 'F10') e.stopPropagation(); });
    for (const ev of ['mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) root.addEventListener(ev, (e) => e.stopPropagation());
    document.body.append(root);
  }
  function open() {
    if (!root) build();
    root.classList.add('open'); render();
    try { if (document.pointerLockElement) { LOCK.resumeT = performance.now(); LOCK.scriptExit = true; document.exitPointerLock(); } } catch (e) {}
    for (const k in KEYS) KEYS[k] = false;
  }
  function close() {
    if (!root) return; root.classList.remove('open');
    try { if (MATCH.state === 'playing' && !pointerActive()) requestLock(true); } catch (e) {}
  }
  const isOpen = () => !!(root && root.classList.contains('open'));
  window.BOEDITOR = { open, close, toggle: () => (isOpen() ? close() : open()), isOpen, setTab: (t) => { tab = t; if (isOpen()) render(); }, render };
  addEventListener('keydown', (e) => { if (e.code === 'F10') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) BOEDITOR.toggle(); } else if (e.code === 'Escape' && isOpen()) { e.stopPropagation(); close(); } }, true);
  // menu button: next to MERC / SPY (BLACKOUT role picker), and always in the pause / main menu corner
  const addBtn = () => {
    if (document.getElementById('boEdBtn')) return true;
    const host = document.getElementById('boRole'); if (!host) return false;
    css();
    const b = el('button', { id: 'boEdBtn', type: 'button', title: 'BLACKOUT editor (F10)' }, 'EDITOR (F10)');
    b.onclick = (e) => { e.stopPropagation(); BOEDITOR.toggle(); };
    host.append(b); return true;
  };
  const iv = setInterval(() => { if (addBtn()) clearInterval(iv); }, 500);
})();
