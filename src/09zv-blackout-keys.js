/* ==========================================================================
   BLACKOUT pass 10: one keymap for BLACKOUT, the Options > Controls page that edits it, and the HUD hints that follow it.
   - Shared and merc actions that Riposte already knows (move, jump, sprint, crouch, reload, weapons, knife, grenade, pick up,
     inspect, scores) keep living in Riposte's Settings.binds, so the rest of Riposte reads them unchanged.
   - Spy actions (hack, takedown, roll, smoke, flashbang, throwing knife, decoy) and the merc flashlight are BLACKOUT's own keys,
     saved in localStorage bo_keys_v1 (only the keys that differ from the defaults).
   - In a BLACKOUT match, keyCanon (08a-binds.js) is replaced by a per-team table: a physical key gives the code the game logic
     listens for (KeyE for hack, KeyR for reload or roll...), and a key bound to nothing in your team does nothing. So a spy's Q is
     the flashbang and never Riposte's weapon swap, and killstreak keys (4, 5, 6) are off in BLACKOUT.
   - Conflicts: two actions a player can use at the same time never share a key. Shared actions are checked against both teams;
     merc and spy keys may overlap (R is reload for a merc, roll for a spy). Binding a taken key swaps the two keys.
   ========================================================================== */
(function () {
  if (typeof BIND_DEFS === 'undefined' || !window.BO_RULES) return;
  const R = window.BO_RULES;
  const ACT = [
    // id, group, label, default code, Riposte action (null: BLACKOUT's own), canonical code (what the game logic reads), fixed
    ['fwd', 'all', 'Move forward', 'KeyW', 'fwd'], ['back', 'all', 'Move back', 'KeyS', 'back'],
    ['left', 'all', 'Strafe left', 'KeyA', 'left'], ['right', 'all', 'Strafe right', 'KeyD', 'right'],
    ['jump', 'all', 'Jump (spy: vault, climb, hang)', 'Space', 'jump'],
    ['sprint', 'all', 'Sprint', 'ShiftLeft', 'sprint'],
    ['crouch', 'all', 'Crouch, hold (spy: cloak in shadow)', 'ControlLeft', 'crouch'],
    ['crouchT', 'all', 'Crouch, toggle (spy: drop from a ledge)', 'KeyC', 'crouchT'],
    ['board', 'all', 'Scoreboard', 'Tab', 'board'],
    ['loadout', 'all', 'Loadout screen', 'F9', null, 'F9', true], ['editor', 'all', 'BLACKOUT editor', 'F10', null, 'F10', true],
    ['pause', 'all', 'Pause menu', 'Escape', null, 'Escape', true], ['chat', 'all', 'Open chat (online)', 'Enter', null, 'Enter'],
    ['fire', 'all', 'Fire (spy: M9, takedown click)', 'LMB', null, 'LMB'], ['aim', 'all', 'Aim down sights', 'RMB', null, 'RMB'],
    ['reload', 'all', 'Reload (spy: M9)', 'KeyR', 'reload'], ['w1', 'merc', 'Primary weapon', 'Digit1', 'w1'], ['w2', 'merc', 'Secondary weapon', 'Digit2', 'w2'],
    ['swap', 'merc', 'Switch weapon (also mouse wheel)', 'KeyQ', 'swap'],
    ['flash', 'merc', 'Flashlight', 'KeyL', null, 'KeyL'],
    ['torch', 'spy', 'Pistol light (on / off)', 'KeyL', null, 'KeyL'],
    ['melee', 'merc', 'Knife (melee)', 'KeyF', 'knife'], ['nade', 'merc', 'Grenade (hold to cook)', 'KeyG', 'nade'],
    ['use', 'merc', 'Pick up a weapon', 'KeyE', 'use'], ['inspect', 'merc', 'Inspect weapon', 'KeyI', 'inspect'],
    ['hack', 'spy', 'Hack / extract (hold), takedown', 'KeyE', null, 'KeyE'],
    ['takedown', 'spy', 'Takedown', 'KeyF', null, 'KeyF'],
    ['roll', 'spy', 'Roll (i-frames)', 'AltLeft', null, 'AltLeft'],
    ['smoke', 'spy', 'Smoke bomb', 'KeyG', null, 'KeyG'],
    ['flashbang', 'spy', 'Flashbang', 'KeyQ', null, 'KeyQ'],
    ['tknife', 'spy', 'Throwing knife', 'KeyX', null, 'KeyX'],
    ['decoy', 'spy', 'Decoy', 'KeyV', null, 'KeyV'],
    // pass 22: merc tools (09zzg). Their canonical codes are BLACKOUT's own, so any key or mouse button can drive them
    ['scan', 'merc', 'Motion scanner (hold, or toggle in F10)', 'KeyZ', null, 'BoScan'],
    ['trip', 'merc', 'Place tripwire', 'KeyX', null, 'BoTrip'],
    ['lmine', 'merc', 'Place laser mine', 'KeyB', null, 'BoMine'],
    ['flare', 'merc', 'Throw flare', 'KeyV', null, 'BoFlare'],
  ].map(([id, g, label, def, rip, canon, fixed]) => ({ id, g, label, def, rip, canon: rip ? null : canon, fixed: !!fixed }));
  const BY = new Map(ACT.map((a) => [a.id, a]));
  /* pass 20: chat is an ordinary bind (Enter by default). Enter stays reserved for every other action (menus, killstreak map, send). */
  const ENTERS = new Set(['Enter', 'NumpadEnter']);
  const validFor = (a, c) => !!a && (bindValid(c) || (a.id === 'chat' && ENTERS.has(c)));
  const LS = 'bo_keys_v1';
  let own = {};
  try { const o = JSON.parse(localStorage.getItem(LS) || '{}'); if (o && typeof o === 'object') for (const k in o) if (BY.has(k) && !BY.get(k).rip && !BY.get(k).fixed && validFor(BY.get(k), o[k])) own[k] = o[k]; } catch (e) { own = {}; }
  const saveOwn = () => { try { localStorage.setItem(LS, JSON.stringify(own)); } catch (e) {} };
  // pass 13: R became reload for spies too and roll moved to left Alt; a roll saved on R moves to Alt once
  try { if (!localStorage.getItem('bo_keys_mig13')) { if (own.roll === 'KeyR') { delete own.roll; saveOwn(); } localStorage.setItem('bo_keys_mig13', '1'); } } catch (e) {}
  // pass 20 (saved binds v20): chat moved off T to Enter. A chat bind on T (or none) goes to Enter once; every other bind is kept.
  try { if (!localStorage.getItem('bo_keys_mig20')) { if (!own.chat || own.chat === 'KeyT') { delete own.chat; saveOwn(); } localStorage.setItem('bo_keys_mig20', '1'); } } catch (e) {}

  function code(id) {
    const a = BY.get(id); if (!a) return '';
    if (a.fixed) return a.def;
    if (a.rip) return bindOf(a.rip);
    return own[id] || a.def;
  }
  const canonOf = (a) => (a.rip ? bindDefault(a.rip) : a.canon);
  const inCtx = (a, team) => a.g === 'all' || a.g === team;
  /* per-team tables: physical key -> canonical code */
  let rev = { merc: new Map(), spy: new Map() };
  function rebuild() {
    rev = { merc: new Map(), spy: new Map() };
    for (const team of ['merc', 'spy']) for (const a of ACT) if (!a.fixed && a.id !== 'chat' && inCtx(a, team)) { const c = code(a.id); if (!rev[team].has(c)) rev[team].set(c, canonOf(a)); } // chat: read by its own listener (09i), never a game key
    hudSync();
  }
  function write(id, c) {
    const a = BY.get(id);
    if (a.rip) { Settings.binds = Settings.binds || {}; if (c === bindDefault(a.rip)) delete Settings.binds[a.rip]; else Settings.binds[a.rip] = c; }
    else if (c === a.def) delete own[id]; else own[id] = c;
  }
  function flush() {
    try { saveSettings(); } catch (e) {}
    saveOwn();
    try { bindRebuild(); } catch (e) {}
    try { for (const k in KEYS) KEYS[k] = false; } catch (e) {}
    try { syncKeyboardLock(); } catch (e) {}
    rebuild();
  }
  /* bind id to c; every action that shares a context with id and already uses c takes id's old key (a swap) */
  function set(id, c) {
    const a = BY.get(id); if (!a || a.fixed || !validFor(a, c)) return false;
    const old = code(id); if (old === c) return [];
    const teams = a.g === 'all' ? ['merc', 'spy'] : [a.g];
    const clash = ACT.filter((o) => o !== a && !o.fixed && code(o.id) === c && teams.some((t) => inCtx(o, t)));
    write(id, c);
    for (const o of clash) write(o.id, validFor(o, old) ? old : o.def !== c ? o.def : old); // Enter only fits chat: another action gets its default back
    flush();
    return clash.map((o) => o.label);
  }
  function reset() {
    own = {};
    try { Settings.binds = {}; } catch (e) {}
    flush();
  }
  const SHORT = { Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', AltRight: 'ALT GR', Tab: 'TAB', CapsLock: 'CAPS', Escape: 'ESC', LMB: 'LMB', RMB: 'RMB', MMB: 'MOUSE 3', Mouse4: 'MOUSE 4', Mouse5: 'MOUSE 5', WheelUp: 'WHEEL UP', WheelDown: 'WHEEL DN', Backquote: '`', Backspace: 'BKSP' };
  function lab(c) {
    if (SHORT[c]) return SHORT[c];
    if (/^F\d{1,2}$/.test(c)) return c;
    try { return String(keyLabel(c)).toUpperCase(); } catch (e) { return c; }
  }
  const K = (id) => lab(code(id));

  /* ---------- the game reads BLACKOUT keys in a BLACKOUT match ---------- */
  const team = () => {
    try { if (typeof boIsBlackout === 'function' && boIsBlackout() && MATCH.state !== 'menu' && PL && PL.ent) return PL.ent.team === 1 ? 'spy' : 'merc'; } catch (e) {}
    return null;
  };
  const isMouse = (c) => /^(LMB|RMB|MMB|Mouse[45]|Wheel(Up|Down))$/.test(c);
  const PASS = new Set(['Escape', 'KeyP', 'Enter', 'NumpadEnter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const _canon = keyCanon;
  keyCanon = function (c) {
    const t = team(); if (!t) return _canon(c);
    const m = rev[t];
    if (m.has(c)) return m.get(c);
    if (t === 'spy' && (c === code('w1') || c === code('w2')) && window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed()) return c === code('w1') ? 'Digit1' : 'Digit2'; // a spy sidearm still switches
    if (PASS.has(c) || /^F\d{1,2}$/.test(c)) return c;
    return ''; // bound to nothing in this team: no Riposte default sneaks through (Q is never a weapon swap for a spy)
  };
  if (typeof bindCodes === 'function') { const _bc = bindCodes; bindCodes = function () { return [...new Set([..._bc(), ...ACT.filter((a) => !a.fixed && !a.rip).map((a) => code(a.id))])].filter((c) => !isMouse(c)); }; }

  /* ---------- HUD hints follow the keymap ---------- */
  const kb = (k) => '<b>' + k + '</b>';
  const CH = () => { try { return !!(NET.on && MATCH.online); } catch (e) { return false; } }; // the chat key shows in an online match
  let hudKey = '';
  function hudSync() { hudKey = ACT.map((a) => code(a.id)).join(','); }
  R.keysHtml = (spy, me) => {
    if (!spy) return kb(K('fire')) + 'fire &nbsp;' + kb(K('aim')) + 'aim &nbsp;' + kb(K('reload')) + 'reload &nbsp;' + kb(K('w1')) + kb(K('w2')) + 'weapons &nbsp;' + kb(K('flash')) + 'flashlight &nbsp;' + kb(K('melee')) + 'knife &nbsp;' + kb(K('nade')) + 'grenade<br>'
      + kb(K('sprint')) + 'sprint &nbsp;' + kb(K('crouchT')) + 'crouch &nbsp;' + kb(K('jump')) + 'jump &nbsp;' + kb(K('board')) + 'scores &nbsp;' + kb('F9') + 'loadout &nbsp;' + (window.BOADMIN && BOADMIN.can() ? kb('F10') + 'editor &nbsp;' : '') + (CH() ? kb(K('chat')) + 'chat &nbsp;' : '') + '<i>shoot lamps out to kill the light</i>';
    const g = (me && me.boGad) || { smoke: 0, flash: 0, knife: 0, decoy: 0 }, n = (k) => '<em' + (g[k] > 0 ? '' : ' class="z"') + '>×' + g[k] + '</em>';
    const armed = !!(window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed()), L = armed ? '' : kb(K('fire'));
    return (armed ? kb(K('fire')) + 'fire M9 &nbsp;' + kb(K('aim')) + 'aim &nbsp;' + kb(K('reload')) + 'reload &nbsp;' + kb(K('torch')) + 'pistol light &nbsp;' : '') + kb(K('hack')) + 'hack / takedown / extract &nbsp;' + kb(K('takedown')) + L + 'takedown &nbsp;' + kb(K('roll')) + 'roll (i-frames)<br>'
      + kb(K('smoke')) + 'smoke ' + n('smoke') + ' &nbsp;' + kb(K('flashbang')) + 'flashbang ' + n('flash') + ' &nbsp;' + kb(K('tknife')) + L + 'knife ' + n('knife') + ' &nbsp;' + kb(K('decoy')) + 'decoy ' + n('decoy') + '<br>'
      + kb(K('jump')) + 'climb / hang &nbsp;' + kb(K('crouchT')) + kb(K('crouch')) + 'crouch (cloak in shadow) &nbsp;' + kb(K('sprint')) + 'sprint &nbsp;' + kb(K('board')) + 'scores &nbsp;' + kb('F9') + 'loadout' + (window.BOADMIN && BOADMIN.can() ? ' &nbsp;' + kb('F10') + 'editor' : '') + (CH() ? ' &nbsp;' + kb(K('chat')) + 'chat' : '');
  };

  /* the merc flashlight listener (06za) reads BOKEYS.code('flash'); the spy pistol light (09zze) reads BOKEYS.code('torch') */

  /* ---------- Options > Controls: the BLACKOUT layout ---------- */
  const CAP = { id: null, draws: new Set(), note: null };
  function controls(root) {
    const prev = root.lastElementChild; if (prev && prev.classList.contains('keys-h')) prev.remove(); // Riposte's "Keyboard keys" title
    const box = document.createElement('div'); box.className = 'bo-ctl';
    const note = document.createElement('p'); note.className = 'bo-ctl-note';
    const draw = () => {
      box.innerHTML = '';
      const head = document.createElement('div'); head.className = 'bo-ctl-head';
      head.innerHTML = '<b>BLACKOUT PROTOCOL // CONTROLS</b><span>Click a key, then press the new key or mouse button (side buttons and the wheel work too). ESC cancels, BACKSPACE restores the default. Merc and spy keys may overlap; shared keys never clash with either team.</span>';
      box.appendChild(head);
      const cols = document.createElement('div'); cols.className = 'bo-ctl-cols';
      for (const [g, t, sub] of [['all', 'SHARED', 'both teams'], ['merc', 'MERC', 'first person · hold the facility'], ['spy', 'SPY', 'over the shoulder · hack and extract']]) {
        const col = document.createElement('section'); col.className = 'bo-ctl-col ' + g;
        col.innerHTML = '<h5>' + t + '<small>' + sub + '</small></h5>';
        for (const a of ACT.filter((x) => x.g === g && (x.id !== 'editor' || (window.BOADMIN && BOADMIN.can())))) {
          const row = document.createElement('div'); row.className = 'bo-ctl-row' + (a.fixed ? ' fixed' : '');
          const name = document.createElement('span'); name.textContent = a.label;
          const b = document.createElement('button'); b.type = 'button'; b.className = 'bo-kb' + (!a.fixed && code(a.id) !== (a.rip ? bindDefault(a.rip) : a.def) ? ' changed' : '') + (CAP.id === a.id ? ' wait' : '');
          b.textContent = CAP.id === a.id ? 'PRESS A KEY / BUTTON' : lab(code(a.id));
          if (a.fixed) { b.disabled = true; b.title = 'Fixed key'; }
          else b.addEventListener('click', () => { CAP.id = a.id; CAP.note = note; note.textContent = 'Press the new key for ' + a.label.toLowerCase() + '.'; redrawAll(); try { sfxUi('click'); } catch (e) {} });
          row.append(name, b); col.appendChild(row);
        }
        cols.appendChild(col);
      }
      box.appendChild(cols);
      const foot = document.createElement('div'); foot.className = 'bo-ctl-foot';
      const r = document.createElement('button'); r.type = 'button'; r.className = 'bo-ctl-reset'; r.textContent = 'RESET ALL KEYS';
      r.addEventListener('click', () => { reset(); CAP.id = null; note.textContent = 'Every key is back to its default.'; redrawAll(); try { sfxUi('click'); } catch (e) {} });
      foot.append(note, r); box.appendChild(foot);
    };
    CAP.draws.add(draw);
    draw(); root.appendChild(box);
    return draw;
  }
  function redrawAll() { for (const d of [...CAP.draws]) d(); }
  const onCap = (e) => {
    if (!CAP.id) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === 'keyup') return;
    const a = BY.get(CAP.id), note = CAP.note;
    if (e.code === 'Escape') { CAP.id = null; if (note) note.textContent = ''; redrawAll(); return; }
    if (e.code === 'Backspace' || e.code === 'Delete') { const d = a.rip ? bindDefault(a.rip) : a.def, r = set(a.id, d); CAP.id = null; if (note) note.textContent = a.label + ': back to ' + lab(d) + (r && r.length ? ' (swapped with ' + r.join(', ') + ')' : '') + '.'; redrawAll(); return; }
    if (!validFor(a, e.code)) { if (note) note.textContent = 'That key is reserved (ESC, P, ENTER, arrows and function keys; ENTER is free for chat only).'; return; }
    const r = set(a.id, e.code); CAP.id = null;
    if (note) note.textContent = a.label + ' is now ' + lab(e.code) + (r && r.length ? '. Swapped with ' + r.join(', ') + '.' : '.');
    redrawAll(); try { sfxUi('click'); } catch (e2) {}
  };
  addEventListener('keydown', onCap, true); addEventListener('keyup', onCap, true);

  /* ---------- mouse buttons and the wheel as keys (pass 13) ----------
     Codes: LMB, RMB, MMB (middle), Mouse4, Mouse5 (side buttons), WheelUp, WheelDown. A mouse code bound to an action is turned into a
     synthetic keydown/keyup carrying that code, so every listener that already reads keys (onKey through keyCanon, the flashlight, the
     spy wrappers) sees it unchanged. Fire and aim moved off their buttons are fed straight into Riposte's fire and aim state. */
  const BTN = ['LMB', 'MMB', 'RMB', 'Mouse4', 'Mouse5'];
  const capSet = (c) => {
    const a = BY.get(CAP.id), note = CAP.note; if (!a) return;
    const r = set(a.id, c); CAP.id = null;
    if (note) note.textContent = a.label + ' is now ' + lab(c) + (r && r.length ? '. Swapped with ' + r.join(', ') + '.' : '.');
    redrawAll(); try { sfxUi('click'); } catch (e2) {}
  };
  let eatClick = 0;
  const live = () => { try { return (MATCH.state === 'playing') && PL && PL.ent && PL.ent.alive && pointerActive() && !(typeof CHAT !== 'undefined' && CHAT.open); } catch (e) { return false; } };
  const synth = (c, down) => { try { dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: c, bubbles: true, cancelable: true })); } catch (e) {} };
  function fireAim(c, down) {
    if (c === 'LMB') {
      if (down) { if (performance.now() < PL.noFireT) return; if (typeof KS !== 'undefined' && KS.map.open) { ksConfirm(); return; } PL.held = true; PL.queued = true; if (R.on && R.on()) R.clickT = performance.now(); }
      else { PL.held = false; try { TPAD.down = false; } catch (e) {} }
    } else if (c === 'RMB') {
      if (down) { if (typeof KS !== 'undefined' && KS.map.open) { ksCancel(); return; } if (adsToggleMode()) adsToggleClick(); else PL.adsWant = true; }
      else if (!adsToggleMode()) PL.adsWant = false;
    }
  }
  const onBtn = (e) => {
    const mc = BTN[e.button]; if (!mc) return;
    if (e.button >= 3 || (e.button === 1 && (CAP.id || live()))) e.preventDefault(); // back / forward never leave the game; no middle-click autoscroll
    if (CAP.id) { e.stopImmediatePropagation(); if (e.type === 'mousedown') { if (e.button === 0 || e.button === 2) eatClick = performance.now(); capSet(mc); } return; } // only the left button is followed by a click, the right one by a context menu
    if (e.type === 'auxclick' || !live()) return;
    const c = keyCanon(mc), down = e.type === 'mousedown';
    if ((mc === 'LMB' || mc === 'RMB') && c === mc) return;        // fire and aim on their own buttons: Riposte reads them natively
    if (mc === 'LMB' || mc === 'RMB') { e.stopImmediatePropagation(); if (mc === 'LMB') R.clickT = 0; } // the button was moved off fire / aim
    if (c || mc === code('chat')) synth(mc, down); // chat on a mouse button: its listener (09i) reads the synthetic key
  };
  for (const t of ['mousedown', 'mouseup', 'auxclick']) addEventListener(t, onBtn, true);
  addEventListener('click', (e) => { if (eatClick && performance.now() - eatClick < 600) { eatClick = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('contextmenu', (e) => { if (CAP.id || (eatClick && performance.now() - eatClick < 600)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('wheel', (e) => {
    const wc = e.deltaY < 0 ? 'WheelUp' : e.deltaY > 0 ? 'WheelDown' : ''; if (!wc) return;
    if (CAP.id) { e.preventDefault(); e.stopImmediatePropagation(); capSet(wc); return; }
    if (!live()) return;
    if (wc === code('chat')) { e.stopImmediatePropagation(); synth(wc, true); setTimeout(() => synth(wc, false), 140); return; }
    const c = keyCanon(wc); if (!c || c === wc) return;              // the wheel bound to nothing: Riposte's weapon swap stays
    e.stopImmediatePropagation();
    synth(wc, true); setTimeout(() => synth(wc, false), 140);        // a notch is a short press
  }, { capture: true, passive: false });
  // fire / aim bound to a key or another mouse button: their canonical codes (LMB, RMB) drive Riposte's fire and aim
  const onFA = (e) => {
    if (CAP.id || !live()) return;
    const c = keyCanon(e.code); if (c !== 'LMB' && c !== 'RMB') return;
    if (e.code === c) return;
    e.stopImmediatePropagation(); if (e.preventDefault) e.preventDefault();
    if (e.repeat) return;
    fireAim(c, e.type === 'keydown');
  };
  addEventListener('keydown', onFA, true); addEventListener('keyup', onFA, true);
  // Options > Controls calls bindEditor (08a-binds.js): it gets the BLACKOUT page; the drawers of pages no longer on screen are dropped
  bindEditor = function (root) { for (const d of [...CAP.draws]) if (!d._box || !d._box.isConnected) CAP.draws.delete(d); const d = controls(root); d._box = root.lastElementChild; return d; };

  window.BOKEYS = { ACT, code, lab, K, set, reset, rebuild, canon: (c) => keyCanon(c) };
  rebuild();
})();
