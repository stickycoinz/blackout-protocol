/* ==========================================================================
   BLACKOUT pass 8: BLACKOUT PROTOCOL interface and the loadout screen.
   - Loadout screen (F9, and before each round when spy.loadoutScreen is on): every gun (the 18 Riposte guns and the custom ones) and
     every attachment that fits, for both teams, plus the spy gadgets; nothing is locked. Before the round it holds the countdown
     (solo only), so nobody moves while you pick; during a round, changes are saved for the next one.
   - Theme: dark espionage look over Riposte's HUD, scoreboard, end screen and the editor (monospace accents, spy red, merc
     white-blue, faint scanlines and a short glitch on titles).
   - The MERC / SPY / EDITOR buttons sit top right and hide while you play or read the end screen.
   ========================================================================== */
(function () {
  const R = window.BO_RULES;
  if (!R || !window.BOCFG) return;
  const MERC = 0, SPY = 1;
  const bo = () => { try { return typeof boIsBlackout === 'function' && boIsBlackout(); } catch (e) { return false; } };
  const SP = () => (BOCFG.v && BOCFG.v.spy) || BOCFG.defaults().spy;
  const el = (t, a, ...k) => { const e = document.createElement(t); if (a) for (const n in a) { if (n === 'class') e.className = a[n]; else if (n.startsWith('on')) e[n] = a[n]; else e.setAttribute(n, a[n]); } for (const c of k) if (c != null) e.append(c); return e; };

  const CSS = `
:root{--bo-mono:'JetBrains Mono','Cascadia Mono',Consolas,'SFMono-Regular',ui-monospace,monospace}
body.bo-on{--bo-a:#9fd8ff;--bo-a2:rgba(159,216,255,.32);--bo-a3:rgba(159,216,255,.1);--bo-bg:rgba(4,7,11,.8)}
body.bo-on.bo-spy{--bo-a:#ff2a3d;--bo-a2:rgba(255,42,61,.38);--bo-a3:rgba(255,42,61,.1)}
@keyframes boGlitch{0%,90%,100%{text-shadow:none;transform:none;clip-path:none}91%{text-shadow:3px 0 var(--bo-a,#ff2a3d),-3px 0 #59e1ff;transform:translateX(2px)}
 93%{text-shadow:-3px 0 var(--bo-a,#ff2a3d),3px 0 #59e1ff;transform:translateX(-2px);clip-path:inset(20% 0 35% 0)}95%{text-shadow:2px 0 var(--bo-a,#ff2a3d),-1px 0 #59e1ff;transform:none;clip-path:inset(55% 0 5% 0)}97%{text-shadow:none;clip-path:none}}
@keyframes boScan{from{background-position:0 0}to{background-position:0 6px}}
@keyframes boBlink{50%{opacity:.25}}
body.bo-on #boHud::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.028) 0 1px,transparent 1px 3px);animation:boScan 1.2s linear infinite}
body.bo-on #boHud::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 58%,rgba(0,0,0,.34))}
body.bo-on #boHud .bo-keys{font-family:var(--bo-mono);font-size:11px;letter-spacing:.04em;opacity:1;color:#cfd8de;background:var(--bo-bg);border:1px solid var(--bo-a2);border-left:2px solid var(--bo-a);padding:7px 12px 7px 10px;
 clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)}
body.bo-on #boHud .bo-keys b{font-family:var(--bo-mono);font-size:10px;color:var(--bo-a);border-color:var(--bo-a2);background:var(--bo-a3);border-radius:0}
body.bo-on #boHud .bo-keys em{font-style:normal;color:#fff;font-weight:700}body.bo-on #boHud .bo-keys em.z{color:#6b747b;text-decoration:line-through}
body.bo-on #boHud .bo-keys i{color:#7d8a93}
body.bo-on #boHud .bo-state{font-family:var(--bo-mono);font-size:11px;letter-spacing:.2em;color:var(--bo-a);background:var(--bo-bg);border:1px solid var(--bo-a2);border-right:2px solid var(--bo-a);right:252px;bottom:18px}
body.bo-on #boHud .bo-state::before{content:"\\25CF  ";animation:boBlink 1.1s steps(1) infinite}
body.bo-on #boHud .bo-obj{font-family:var(--bo-mono);font-size:11px;letter-spacing:.18em;color:#dfe8ee;background:var(--bo-bg);border:1px solid var(--bo-a2);border-top:0;border-bottom:2px solid var(--bo-a)}
body.bo-on #boHud .bo-prompt{font-family:var(--bo-mono);font-size:13px;letter-spacing:.12em;background:var(--bo-bg);border-left:3px solid var(--bo-a);box-shadow:0 0 0 1px var(--bo-a2)}
body.bo-on #boHud .bo-bar{height:4px;background:rgba(255,255,255,.08);box-shadow:0 0 0 1px var(--bo-a2)}body.bo-on #boHud .bo-bar i{background:var(--bo-a)}
body.bo-on #boHud .bo-mk{font-family:var(--bo-mono);font-size:11px;letter-spacing:.14em}
body.bo-on .score{background:var(--bo-bg);border:1px solid var(--bo-a2);border-top:2px solid var(--bo-a);padding:4px 10px;clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%,0 10px)}
body.bo-on .score #timer{font-family:var(--bo-mono);letter-spacing:.06em}
body.bo-on .score .row span,body.bo-on .score .lim{font-family:var(--bo-mono);letter-spacing:.14em}
body.bo-on .mm-f{background:var(--bo-a2)}body.bo-on #zone{font-family:var(--bo-mono);color:var(--bo-a);letter-spacing:.18em;font-size:11px}
body.bo-on #board{background:radial-gradient(ellipse at center,rgba(3,5,8,.86),rgba(3,5,8,.66) 75%)}
body.bo-on #board .boards::before{content:"BLACKOUT PROTOCOL // OPERATIVE ROSTER";grid-column:1/-1;font:700 12px var(--bo-mono);letter-spacing:.32em;color:var(--bo-a);padding:0 2px 6px;border-bottom:1px solid var(--bo-a2);animation:boGlitch 5s infinite}
body.bo-on #board table{background:rgba(5,8,12,.9);box-shadow:0 0 0 1px var(--bo-a2)}
body.bo-on #board th,body.bo-on #board caption{font-family:var(--bo-mono);letter-spacing:.14em}
body.bo-on #board td{font-family:var(--bo-mono);font-size:13px}
body.bo-on #board tr.me td{color:var(--bo-a)}
body.bo-on #board0 caption{color:#ff5a68}body.bo-on #board1 caption{color:#9fd8ff}
body.bo-on #end{background:linear-gradient(180deg,rgba(3,5,8,.92),rgba(3,5,8,.78)),repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px)}
body.bo-on #endTitle{animation:boGlitch 4.5s 1s infinite;letter-spacing:.06em}
body.bo-on #endKick{font-family:var(--bo-mono);letter-spacing:.28em;color:var(--bo-a)}
body.bo-on #endScore{font-family:var(--bo-mono);letter-spacing:.06em}
body.bo-on #endMeta{font-family:var(--bo-mono);letter-spacing:.12em}
body.bo-on #endMeta::before{content:"BLACKOUT PROTOCOL // DEBRIEF\\00a0\\00b7\\00a0";color:var(--bo-a)}
body.bo-on #end .st{background:rgba(5,8,12,.75);box-shadow:inset 0 0 0 1px var(--bo-a2)}
body.bo-on #end .st span{font-family:var(--bo-mono);letter-spacing:.14em}
body.bo-on .fin-word{animation:finWord .55s .3s cubic-bezier(.2,.8,.2,1) forwards,boGlitch 3.5s 1.2s infinite}
body.bo-on .fin-kick,body.bo-on .fin-sub{font-family:var(--bo-mono)}
body.bo-on .fin-tint{background:radial-gradient(ellipse at center,transparent 30%,var(--bo-a3))}
#boEd{--acc:var(--bo-a,#9fd8ff);--acc-hi:#fff;--acc-ink:#04070b;background:rgba(5,8,12,.97)!important;border-left:1px solid var(--bo-a2,rgba(159,216,255,.32))!important}
#boEd::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.022) 0 1px,transparent 1px 3px)}
#boEd h2{font:800 20px/1 var(--bo-mono)!important;letter-spacing:.22em!important;color:var(--bo-a,#9fd8ff);animation:boGlitch 6s infinite}
#boEd .hd small,#boEd .tab,#boEd .sec,#boEd button.b{font-family:var(--bo-mono)!important}
#boEd .tab{font-size:11px!important}#boEd .sec{font-size:12px!important;border-bottom:1px solid var(--bo-a2,rgba(159,216,255,.32));padding-bottom:3px}
#boEd button.b{border-radius:0!important;font-size:11px!important}
#boRole{left:auto!important;right:12px!important;top:12px!important;gap:4px!important}
#boRole button{border-radius:0!important;font:700 11px var(--bo-mono)!important;letter-spacing:.12em;padding:7px 11px!important;background:rgba(4,7,11,.86)!important;color:#b9c6cf!important;border:1px solid rgba(159,216,255,.25)!important;outline:none!important}
#boRole button.on[data-role=spy]{color:#ff5a68!important;border-color:#ff2a3d!important;background:rgba(60,4,10,.85)!important}
#boRole button.on[data-role=merc]{color:#cfeaff!important;border-color:#9fd8ff!important;background:rgba(10,30,44,.85)!important}
#boRole #boEdBtn{color:#e8eef2!important}
body.bo-hide-role #boRole{display:none!important}
#boXh{position:fixed;left:50%;top:50%;width:0;height:0;z-index:30;pointer-events:none;display:none;--xs:1;--g:calc(7px*var(--xs));--l:calc(9px*var(--xs))}
#boXh i{position:absolute;background:#ff2a3d;box-shadow:0 0 4px rgba(255,42,61,.9),0 0 1px #000;transition:transform .12s,background .12s}
#boXh .t,#boXh .b{width:2px;height:var(--l);left:-1px}#boXh .l,#boXh .r{height:2px;width:var(--l);top:-1px}
#boXh .t{bottom:var(--g)}#boXh .b{top:var(--g)}#boXh .l{right:var(--g)}#boXh .r{left:var(--g)}
#boXh em{position:absolute;left:-2px;top:-2px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 5px #ff2a3d}
#boXh.move .t{transform:translateY(-4px)}#boXh.move .b{transform:translateY(4px)}#boXh.move .l{transform:translateX(-4px)}#boXh.move .r{transform:translateX(4px)}
#boXh.hot i{background:#fff;box-shadow:0 0 6px #ff2a3d,0 0 12px #ff2a3d}#boXh.hot.near .t{transform:translateY(3px)}#boXh.hot.near .b{transform:translateY(-3px)}#boXh.hot.near .l{transform:translateX(3px)}#boXh.hot.near .r{transform:translateX(-3px)}
#boXh.hang{opacity:.35}
body.bo-board #boHud .bo-mks{display:none}
body.bo-load #lockPrompt,body.bo-load #boHud,body.bo-load #cd{display:none!important}
#boLoad{position:fixed;inset:0;z-index:100001;display:none;flex-direction:column;color:#dfe7ec;font:500 13px/1.3 var(--bo-mono);user-select:none;
 --a:#9fd8ff;--a2:rgba(159,216,255,.3);--a3:rgba(159,216,255,.08);
 background:radial-gradient(ellipse at 30% 20%,rgba(30,44,58,.55),transparent 60%),linear-gradient(180deg,rgba(3,5,8,.97),rgba(2,3,5,.985))}
#boLoad.spy{--a:#ff2a3d;--a2:rgba(255,42,61,.36);--a3:rgba(255,42,61,.08);background:radial-gradient(ellipse at 30% 20%,rgba(70,10,16,.5),transparent 60%),linear-gradient(180deg,rgba(5,3,4,.97),rgba(3,2,2,.985))}
#boLoad.open{display:flex}
#boLoad::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px),
 linear-gradient(90deg,var(--a3) 1px,transparent 1px) 0 0/64px 64px,linear-gradient(0deg,var(--a3) 1px,transparent 1px) 0 0/64px 64px;animation:boScan 1.4s linear infinite;opacity:.9}
#boLoad>*{position:relative}
#boLoad header{display:flex;align-items:flex-end;gap:24px;padding:22px 32px 14px;border-bottom:1px solid var(--a2)}
#boLoad .brand b{display:block;font:800 26px/1 var(--bo-mono);letter-spacing:.3em;color:#f2f5f7;animation:boGlitch 4s infinite}
#boLoad .brand span{display:block;margin-top:6px;color:var(--a);letter-spacing:.24em;font-size:11px}
#boLoad .roles{display:flex;gap:0;margin-left:auto}
#boLoad .roles button{min-width:150px;padding:10px 18px;font:800 13px var(--bo-mono);letter-spacing:.24em;background:transparent;color:#7f8b93;border:1px solid #2a333a;cursor:pointer}
#boLoad .roles button.on.merc{color:#04070b;background:#9fd8ff;border-color:#9fd8ff}
#boLoad .roles button.on.spy{color:#fff;background:#ff2a3d;border-color:#ff2a3d}
#boLoad .roles button small{display:block;font-size:9px;letter-spacing:.16em;opacity:.8;margin-top:2px}
#boLoad .stat{margin-left:22px;color:#7f8b93;font-size:11px;letter-spacing:.16em;text-align:right;min-width:210px}
#boLoad .stat b{display:block;color:var(--a);font-size:12px;animation:boBlink 1.4s steps(1) infinite}
#boLoad main{flex:1;min-height:0;display:grid;grid-template-columns:250px 1fr 360px;gap:0}
#boLoad .col{min-height:0;overflow-y:auto;padding:16px 20px;border-right:1px solid var(--a2)}
#boLoad .col:last-child{border-right:0}
#boLoad .col{scrollbar-width:thin;scrollbar-color:var(--a2) transparent}
#boLoad .col::-webkit-scrollbar{width:6px}#boLoad .col::-webkit-scrollbar-thumb{background:var(--a2)}#boLoad .col::-webkit-scrollbar-track{background:transparent}
#boLoad h4{margin:0 0 10px;font:700 11px var(--bo-mono);letter-spacing:.3em;color:var(--a)}
#boLoad h4::before{content:"// "}
#boLoad .slot{display:block;width:100%;text-align:left;margin:0 0 8px;padding:10px 12px;background:rgba(255,255,255,.025);border:1px solid #232b31;border-left:3px solid #2c353c;color:#cdd6dc;cursor:pointer;font:600 12px var(--bo-mono)}
#boLoad .slot small{display:block;color:#6f7b83;letter-spacing:.2em;font-size:10px;margin-bottom:3px}
#boLoad .slot i{display:block;font-style:normal;color:#8d99a1;font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#boLoad .slot.on{border-color:var(--a2);border-left-color:var(--a);background:var(--a3);color:#fff}
#boLoad .grp{margin:4px 0 14px}
#boLoad .grp>small{display:block;color:#6f7b83;letter-spacing:.26em;font-size:10px;margin:0 0 6px}
#boLoad .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px}
#boLoad .gun{padding:9px 10px;text-align:left;background:rgba(255,255,255,.02);border:1px solid #20282e;color:#c9d2d8;cursor:pointer;font:700 12px var(--bo-mono);letter-spacing:.06em;position:relative}
#boLoad .gun small{display:block;color:#6f7b83;font-weight:500;font-size:10px;letter-spacing:.12em;margin-top:2px}
#boLoad .gun:hover{border-color:var(--a2);color:#fff}
#boLoad .gun.on{border-color:var(--a);background:var(--a3);color:#fff;box-shadow:inset 3px 0 0 var(--a)}
#boLoad .gun.none{color:#8d99a1}
#boLoad .bars{margin:6px 0 12px}
#boLoad .bar{height:auto;overflow:visible;border:0;background:none;padding:0;display:grid;grid-template-columns:86px 1fr 52px;align-items:center;gap:8px;margin:4px 0;font-size:10px;letter-spacing:.14em;color:#8d99a1}
#boLoad .bar span{height:5px;background:rgba(255,255,255,.07);position:relative;overflow:hidden}
#boLoad .bar span i{position:absolute;left:0;top:0;bottom:0;background:var(--a);transform:none;transition:none}
#boLoad .bar b{color:#e8eef2;text-align:right;font-weight:700}
#boLoad .gname{font:800 20px/1.1 var(--bo-mono);letter-spacing:.12em;color:#fff;margin:2px 0 2px}
#boLoad .gdesc{color:#86929a;font-size:11px;margin:0 0 6px}
#boLoad .att{margin:0 0 9px}
#boLoad .att>small{display:block;color:#6f7b83;letter-spacing:.22em;font-size:10px;margin-bottom:4px}
#boLoad .chips{display:flex;flex-wrap:wrap;gap:4px}
#boLoad .chip{padding:5px 8px;font:600 11px var(--bo-mono);background:transparent;border:1px solid #2a333a;color:#9aa6ae;cursor:pointer}
#boLoad .chip.on{border-color:var(--a);color:#fff;background:var(--a3)}
#boLoad .gad{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
#boLoad .gcard{padding:12px;text-align:left;background:rgba(255,255,255,.02);border:1px solid #232b31;color:#c9d2d8;cursor:pointer;font:600 12px var(--bo-mono)}
#boLoad .gcard b{display:block;font-size:13px;letter-spacing:.14em;color:#fff}
#boLoad .gcard em{float:right;font-style:normal;color:var(--a);border:1px solid var(--a2);padding:0 5px;font-size:10px}
#boLoad .gcard small{display:block;color:#7f8b93;font-size:10px;margin-top:6px;line-height:1.4}
#boLoad .gcard.on{border-color:var(--a);background:var(--a3)}
#boLoad .gcard:not(.on){opacity:.5}
#boLoad footer{display:flex;align-items:center;gap:16px;padding:14px 32px;border-top:1px solid var(--a2)}
#boLoad footer .hint{color:#6f7b83;letter-spacing:.16em;font-size:11px}
#boLoad footer .hint b{color:var(--a);border:1px solid var(--a2);padding:1px 5px;margin:0 3px}
#boLoad .deploy{margin-left:auto;min-width:260px;padding:14px 22px;font:800 15px var(--bo-mono);letter-spacing:.34em;color:#04070b;background:var(--a);border:0;cursor:pointer;
 clip-path:polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)}
#boLoad.spy .deploy{color:#fff}
#boLoad .deploy:hover{filter:brightness(1.15)}
#boLoad .note{color:#7f8b93;font-size:11px;line-height:1.5;margin:8px 0}
`;
  function css() { if (document.getElementById('boTheme')) return; const s = el('style', { id: 'boTheme' }); s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- body classes: theme on in BLACKOUT, spy red or merc blue, role buttons hidden while you play ---------- */
  let root = null, pre = false, slot = 'primary', applying = false, menu = false; // menu: opened from the main menu (CLASSES)
  const isOpen = () => !!(root && root.classList.contains('open'));
  function bodyTick() {
    const b = document.body; if (!b) return;
    css();
    const on = bo() && MATCH.state !== 'menu';
    b.classList.toggle('bo-on', on);
    const spy = on && PL && PL.ent && PL.ent.team === SPY && (MATCH.state !== 'deploy');
    b.classList.toggle('bo-spy', !!(spy || (on && MATCH.state !== 'playing' && typeof BO !== 'undefined' && BO.role === 'spy' && !(PL && PL.ent))));
    const ended = MATCH.state === 'ended' || MATCH.state === 'finish' || ($('end') && $('end').classList.contains('show'));
    const locked = MATCH.state === 'playing' && !!document.pointerLockElement;
    b.classList.toggle('bo-board', !!($('board') && $('board').classList.contains('show')));
    b.classList.toggle('bo-hide-role', on && (ended || locked || isOpen()));
    b.classList.toggle('bo-load', isOpen());
    const rb = document.getElementById('boRole');
    if (rb) for (const x of rb.querySelectorAll('button[data-role]')) x.classList.toggle('on', typeof BO !== 'undefined' && x.dataset.role === BO.role);
  }
  setInterval(bodyTick, 250);

  /* ---------- loadout screen ---------- */
  const gunIds = () => Object.keys(WEAPONS).concat(Object.keys(BOCFG.CUSTOM || {}));
  const base = (id) => (BOCFG.CUSTOM && BOCFG.CUSTOM[id]) || WEAPONS[id] || null;
  const CATS = [['ar', 'ASSAULT RIFLES'], ['smg', 'SUBMACHINE GUNS'], ['sniper', 'PRECISION RIFLES'], ['shotgun', 'SHOTGUNS'], ['pistol', 'PISTOLS']];
  const KK = (id, d) => (window.BOKEYS ? BOKEYS.K(id) : d);
  const GADS = [['smoke', 'SMOKE BOMB', 'G', 'smokeN', 'Grey cloud that blocks sight lines. Break contact, cross open ground.'],
    ['flash', 'FLASHBANG', 'Q', 'flashN', 'Whites out merc players, stuns bots. You are trained for it.'],
    ['knife', 'THROWING KNIFE', 'X / LMB', 'knifeN', 'Silent. Walk over a stuck knife to take it back.'],
    ['decoy', 'DECOY', 'V', 'decoyN', 'Fakes gunfire and footsteps. Pulls merc patrols, pings their HUD.']];
  const L = () => BOCFG.v.loadout;
  const role = () => (typeof BO !== 'undefined' && BO.role === 'spy' ? 'spy' : 'merc');
  function slotRef() {
    const l = L();
    if (role() === 'spy' && SP().gunLock !== false) return { gun: 'm9', att: ['sil'], set: () => {}, none: false, label: 'SIDEARM', locked: true };
    if (role() === 'spy') return { gun: l.spy.secondary, att: l.spy.secondaryAtt, set: (g) => { l.spy.secondary = g; l.spy.secondaryAtt = []; }, none: true, label: 'SIDEARM' };
    if (slot === 'secondary') return { gun: l.merc.secondary, att: l.merc.secondaryAtt, set: (g) => { l.merc.secondary = g; l.merc.secondaryAtt = []; }, none: true, label: 'SECONDARY' };
    return { gun: l.merc.primary, att: l.merc.primaryAtt, set: (g) => { l.merc.primary = g; l.merc.primaryAtt = []; }, none: false, label: 'PRIMARY' };
  }
  const gunName = (id) => (id === 'none' ? 'NONE' : (base(id) && base(id).name) || id);
  const attNames = (arr) => (arr && arr.length ? arr.map((a) => (ATT[a] ? ATT[a].name : a)).join(' + ') : 'no attachments');
  function slotBtn(key, small, gun, att) {
    return el('button', { type: 'button', class: 'slot' + ((role() === 'spy' ? key === 'sidearm' : key === slot) ? ' on' : ''), onclick: () => { slot = key === 'sidearm' ? slot : key; render(); } },
      el('small', null, small), gunName(gun), el('i', null, gun === 'none' ? 'takedowns and gadgets only' : attNames(att)));
  }
  function bar(label, v, max, txt) { const s = el('span', null, el('i')); s.firstChild.style.width = Math.max(2, Math.min(100, (v / max) * 100)) + '%'; return el('div', { class: 'bar' }, label, s, el('b', null, txt)); }
  function detail(ref) {
    const out = [];
    if (ref.gun === 'none' || !base(ref.gun)) { out.push(el('div', { class: 'gname' }, 'UNARMED'), el('div', { class: 'note' }, 'No sidearm: silent takedowns, the throwing knife and the gadgets. Bots keep their stock guns.')); return out; }
    const b = base(ref.gun); let d = b;
    try { d = BOCFG.gunDef(ref.gun, ref.att) || b; } catch (e) {}
    const dmg = Array.isArray(d.dmg) ? d.dmg[0] : d.dmg || 0, rng = Array.isArray(d.range) ? d.range[1] : d.range || 0;
    out.push(el('div', { class: 'gname' }, b.name || ref.gun), el('div', { class: 'gdesc' }, (b.type || b.cat || '').toUpperCase() + (b.custom ? ' · CUSTOM' : '')));
    out.push(el('div', { class: 'bars' }, bar('DAMAGE', dmg, 150, String(Math.round(dmg))), bar('FIRE RATE', d.rpm || 0, 1200, Math.round(d.rpm || 0) + ''), bar('RANGE', rng, 100, Math.round(rng) + ' m'),
      bar('MAGAZINE', d.mag || 0, 100, String(d.mag || 0)), bar('MOBILITY', (d.move || 0.8) - 0.6, 0.5, Math.round((d.move || 0.8) * 100) + '%'), bar('ADS', 0.6 - (d.adsTime || 0.3), 0.5, Math.round((d.adsTime || 0.3) * 1000) + ' ms')));
    if (ref.locked) { out.push(el('h4', null, 'ATTACHMENTS'), el('div', { class: 'att' }, el('small', null, 'MUZZLE'), el('div', { class: 'chips' }, el('button', { type: 'button', class: 'chip on', disabled: true }, 'SUPPRESSOR · FIXED')))); return out; }
    out.push(el('h4', null, 'ATTACHMENTS'));
    const bySlot = {};
    for (const id in ATT) { let ok = false; try { ok = attFits(b, id); } catch (e) {} if (ok) (bySlot[ATT[id].slot] = bySlot[ATT[id].slot] || []).push(id); }
    const slots = Object.keys(bySlot);
    if (!slots.length) out.push(el('div', { class: 'note' }, 'Nothing fits this gun.'));
    for (const s of slots) {
      const row = el('div', { class: 'chips' });
      const cur = ref.att.find((a) => ATT[a] && ATT[a].slot === s);
      row.append(el('button', { type: 'button', class: 'chip' + (cur ? '' : ' on'), onclick: () => { for (let j = ref.att.length - 1; j >= 0; j--) if (ATT[ref.att[j]] && ATT[ref.att[j]].slot === s) ref.att.splice(j, 1); BOCFG.save(); render(); } }, 'NONE'));
      for (const id of bySlot[s]) row.append(el('button', { type: 'button', class: 'chip' + (cur === id ? ' on' : ''), onclick: () => {
        for (let j = ref.att.length - 1; j >= 0; j--) if (ATT[ref.att[j]] && ATT[ref.att[j]].slot === s) ref.att.splice(j, 1);
        ref.att.push(id); BOCFG.save(); render(); } }, ATT[id].name));
      out.push(el('div', { class: 'att' }, el('small', null, s.toUpperCase()), row));
    }
    return out;
  }
  function gunGrid(ref) {
    const out = [el('h4', null, 'ARMORY · ' + ref.label + ' · ALL UNLOCKED')];
    if (ref.none) out.push(el('div', { class: 'grp' }, el('div', { class: 'grid' }, el('button', { type: 'button', class: 'gun none' + (ref.gun === 'none' ? ' on' : ''), onclick: () => { ref.set('none'); BOCFG.save(); render(); } }, 'NONE', el('small', null, 'unarmed')))));
    const ids = gunIds(), seen = new Set();
    const grp = (title, list) => { if (!list.length) return; const g = el('div', { class: 'grid' });
      for (const id of list) { seen.add(id); const b = base(id); g.append(el('button', { type: 'button', class: 'gun' + (ref.gun === id ? ' on' : ''), onclick: () => { ref.set(id); BOCFG.save(); render(); } }, b.name || id, el('small', null, (b.custom ? 'CUSTOM · ' : '') + ((b.type || '') + '').toUpperCase()))); }
      out.push(el('div', { class: 'grp' }, el('small', null, title + ' [' + list.length + ']'), g)); };
    for (const [c, t] of CATS) grp(t, ids.filter((id) => base(id) && base(id).cat === c));
    grp('OTHER', ids.filter((id) => !seen.has(id) && base(id)));
    return out;
  }
  function lockedGun() {
    const S = SP();
    return [el('h4', null, 'ARMORY · SIDEARM · ISSUED'),
      el('div', { class: 'grp' }, el('div', { class: 'grid' }, el('button', { type: 'button', class: 'gun on', disabled: true }, 'M9 SD', el('small', null, 'PISTOL · SUPPRESSED')))),
      el('div', { class: 'note' }, 'Every spy carries the suppressed M9. It is the only gun a spy can take: quiet enough that bots only hear it up close.'),
      el('div', { class: 'note' }, 'Mercs wear body armor: a round to the body or limbs does ' + S.armorDmg + ' damage. A headshot from ' + S.headKillM + ' m or closer kills outright; farther out it does normal M9 head damage.'),
      el('div', { class: 'note' }, 'Fire with LMB, aim with RMB. Takedowns stay on ' + KK('hack', 'E') + ' / ' + KK('takedown', 'F') + ', the throwing knife on ' + KK('tknife', 'X') + '. The editor (F10, Spy kit) can unlock other sidearms.')];
  }
  function gadgets() {
    const G = L().spy.gadgets, S = SP(), box = el('div', { class: 'gad' });
    for (const [k, n, key0, nk, desc] of GADS) { const key = window.BOKEYS ? (BOKEYS.K({ smoke: 'smoke', flash: 'flashbang', knife: 'tknife', decoy: 'decoy' }[k]) + (k === 'knife' && !(BOCFG.spyArmed && BOCFG.spyArmed()) ? ' / LMB' : '')) : key0; box.append(el('button', { type: 'button', class: 'gcard' + (G[k] ? ' on' : ''), onclick: () => { G[k] = !G[k]; BOCFG.save(); render(); } },
      el('em', null, key), el('b', null, n), (G[k] ? 'EQUIPPED · x' + S[nk] : 'LEFT BEHIND'), el('small', null, desc))); }
    return [el('h4', null, 'GADGETS'), box, el('div', { class: 'note' }, 'Charges per life come from the editor (F10, Spy kit). Every gadget is free: take all four.')];
  }
  function render() {
    if (!root) return;
    const spy = role() === 'spy', ref = slotRef(), l = L();
    root.className = 'open' + (spy ? ' spy' : '');
    root.innerHTML = '';
    const rb = (r, t, s) => el('button', { type: 'button', class: r + (role() === r ? ' on' : ''), onclick: () => setRole(r) }, t, el('small', null, s));
    const hold = pre && !MATCH.online && typeof CD !== 'undefined' && !CD.done;
    root.append(el('header', null,
      el('div', { class: 'brand' }, el('b', null, 'BLACKOUT PROTOCOL'), el('span', null, '// LOADOUT · OPERATION KHAMSIN · CLEARANCE: ALL')),
      el('div', { class: 'roles' }, rb('merc', 'MERC', 'hold the facility'), rb('spy', 'SPY', 'hack and extract')),
      menu ? el('div', { class: 'stat' }, el('b', null, 'CLASSES'), 'saved for your next match')
        : el('div', { class: 'stat' }, el('b', null, hold ? 'ROUND ON HOLD' : pre ? 'PRE-DEPLOY' : 'ROUND LIVE'), hold ? 'countdown waits for you' : pre ? 'applies now' : 'guns swap now')));
    const left = el('div', { class: 'col' }, el('h4', null, spy ? 'SPY KIT' : 'MERC KIT'));
    if (spy) {
      left.append(ref.locked ? slotBtn('sidearm', 'SIDEARM · ISSUED', 'm9', ['sil']) : slotBtn('sidearm', 'SIDEARM', l.spy.secondary, l.spy.secondaryAtt));
      const G = l.spy.gadgets, S = SP();
      left.append(el('div', { class: 'slot' }, el('small', null, 'GADGETS'), GADS.filter((g) => G[g[0]]).map((g) => g[1] + ' x' + S[g[3]]).join(' · ') || 'none'));
      left.append(el('div', { class: 'note' }, 'Roll ' + KK('roll', 'ALT') + ' (i-frames), climb ' + KK('jump', 'SPACE') + ' at a ledge, crouch in the dark to cloak, shoot lamps out.'));
    } else {
      left.append(slotBtn('primary', 'PRIMARY', l.merc.primary, l.merc.primaryAtt), slotBtn('secondary', 'SECONDARY', l.merc.secondary, l.merc.secondaryAtt));
      left.append(el('div', { class: 'note' }, 'Flashlight ' + KK('flash', 'L') + '. Spies cloak in the dark: light them up, and keep the lamps alive.'));
    }
    const mid = el('div', { class: 'col' }, ...(ref.locked ? lockedGun() : gunGrid(ref)));
    const right = el('div', { class: 'col' }, ...detail(ref), ...(spy ? gadgets() : []));
    root.append(el('main', null, left, mid, right));
    root.append(el('footer', null, el('div', { class: 'hint' }, el('b', null, 'F9'), 'close ', el('b', null, 'ENTER'), menu ? 'save ' : 'deploy ', el('b', null, menu ? 'ESC' : 'F10'), menu ? 'back   · 18 guns, every attachment, no unlocks' : 'editor   · 18 guns, every attachment, no unlocks'),
      el('button', { type: 'button', class: 'deploy', onclick: () => deploy() }, menu ? 'SAVE' : pre ? 'DEPLOY' : 'EQUIP')));
  }
  function setRole(r) {
    if (role() === r) return;
    if (typeof BO !== 'undefined') BO.role = r;
    try { localStorage.setItem('bo_role', r); } catch (e) {}
    if (BO.refreshRoleUI) try { BO.refreshRoleUI(); } catch (e) {}
    slot = 'primary'; render();
  }
  function openMenu() { menu = true; open(false); }
  function open(preSpawn) {
    if (!bo() && !menu) return;
    css();
    if (!root) { root = el('div', { id: 'boLoad' }); for (const t of ['mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) root.addEventListener(t, (e) => e.stopPropagation()); document.body.appendChild(root); }
    pre = !!preSpawn;
    freeMouse();
    try { for (const k in KEYS) KEYS[k] = false; PL.held = false; } catch (e) {}
    try { showLockPrompt(false); } catch (e) {}
    render(); bodyTick();
  }
  function close() { if (!root) return; root.className = ''; pre = false; const wasMenu = menu; menu = false; bodyTick(); if (wasMenu) { try { sfxUi('back'); } catch (e) {} } }
  /* pass 9: the mouse is free the moment the screen opens (no Esc, no pause menu), and captured again on DEPLOY */
  function freeMouse() {
    try { if (document.pointerLockElement) { LOCK.resumeT = performance.now(); LOCK.scriptExit = true; document.exitPointerLock(); } } catch (e) {}
  }
  function deploy() {
    BOCFG.saveNow();
    if (menu) { close(); try { if (typeof toast === 'function') toast('Loadout saved'); } catch (e) {} return; }
    if (MATCH.state === 'paused' && bo()) { try { $('pause').classList.remove('show'); MATCH.state = 'playing'; LOCK.resumeT = performance.now(); } catch (e) {} }
    const live = MATCH.state === 'playing' && bo();
    const now = live && (pre || (typeof cdOn === 'function' && cdOn()));
    const myTeam = PL && PL.ent ? PL.ent.team : -1, want = role() === 'spy' ? SPY : MERC;
    close();
    if (now) {
      applying = true;
      try { R.setup(); } catch (err) { console.warn('BO deploy', err); } finally { applying = false; }
    } else if (live && myTeam !== want) { try { hudMsg('ROLE SWITCH: NEXT ROUND', 'xp', 2); } catch (e) {} }
    else if (live && PL.ent.alive) { // same side mid-round: the new guns now
      try { if (myTeam === SPY) BOCFG.giveSpyLoadout(); else { BOCFG.giveMercLoadout(); sfxMech('draw'); } hudMsg('LOADOUT EQUIPPED', 'xp', 1.5); } catch (e) { console.warn('BO loadout', e); }
    }
    if (live) { try { LOCK.inputT = performance.now(); requestLock(true); } catch (e) {} }
  }
  /* before the round: the countdown waits (solo; online it never holds anyone) */
  const _cdTick = cdTick;
  cdTick = function () {
    if (isOpen() && pre && !MATCH.online && bo()) { CD.last = performance.now(); return; }
    return _cdTick.apply(this, arguments);
  };
  addEventListener('keydown', (e) => {
    if (!bo() && !(menu && isOpen())) return;
    if (e.code === 'F9') { e.preventDefault(); e.stopPropagation(); if (e.repeat) return; if (isOpen()) { if (pre) deploy(); else close(); } else if (MATCH.state === 'playing') open(false); return; }
    if (!isOpen()) return;
    if (e.code === 'F10') return;
    e.stopPropagation(); e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') deploy();
    else if (e.code === 'Escape') { if (pre) deploy(); else close(); }
  }, true);
  addEventListener('keyup', (e) => { if (isOpen() && (bo() || menu)) e.stopPropagation(); }, true);
  /* while the screen is open: no pause on the lost capture, no capture request from the game, a capture that lands anyway is given back */
  if (typeof pauseGame === 'function') { const _pg = pauseGame; pauseGame = function () { if (isOpen() && bo()) return; return _pg.apply(this, arguments); }; }
  if (typeof requestLock === 'function') { const _rl = requestLock; requestLock = function () { if (isOpen() && bo()) return; return _rl.apply(this, arguments); }; }
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && isOpen() && bo()) freeMouse(); });
  /* BLACKOUT skips Riposte's class (preset) page: straight into the match, where the BLACKOUT loadout screen opens */
  const boFlow = (F) => !!F && ((F.map || (typeof Settings !== 'undefined' && Settings.map)) === 'blackout');
  if (typeof uiGo === 'function') {
    const _uiGo = uiGo;
    uiGo = function (name) {
      const r = _uiGo.apply(this, arguments);
      if (name === 'deploy' && typeof UI !== 'undefined' && boFlow(UI.flow)) { try { menuDeploy(); } catch (e) { console.warn('BO skip deploy', e); } }
      return r;
    };
  }
  /* the pause menu's class tab (Riposte presets) opens the BLACKOUT loadout instead: presets never touch a BLACKOUT round */
  if (typeof pmView === 'function') {
    const _pm = pmView;
    pmView = function (name) { if (name === 'class' && bo()) { _pm.call(this, 'home'); open(false); return; } return _pm.apply(this, arguments); };
  }
  if (typeof giveLoadout === 'function') {
    const _gl = giveLoadout;
    giveLoadout = function () {
      const r = _gl.apply(this, arguments);
      if (bo() && PL && PL.ent && MATCH.state !== 'menu') { try { if (PL.ent.team === SPY) BOCFG.giveSpyLoadout(); else BOCFG.giveMercLoadout(); } catch (e) { console.warn('BO loadout', e); } }
      return r;
    };
  }

  /* ---------- spy crosshair: the camera looks exactly along the aim (06za), so the centre of the screen is where the knife, the sidearm
     and the throw go; it tightens and brightens over a merc in knife range ---------- */
  let xh = null, xhT = 0;
  function xhTick() {
    requestAnimationFrame(xhTick);
    const S = SP();
    const show = bo() && MATCH.state === 'playing' && PL && PL.ent && PL.ent.alive && PL.ent.team === SPY && S.xhair !== false && !isOpen()
      && !(window.BOEDITOR && BOEDITOR.isOpen && BOEDITOR.isOpen()) && !(PL.flashT > 0.3);
    if (!xh) { if (!show) return; css(); xh = el('div', { id: 'boXh' }, el('i', { class: 't' }), el('i', { class: 'r' }), el('i', { class: 'b' }), el('i', { class: 'l' }), el('em')); document.body.appendChild(xh); }
    xh.style.display = show ? 'block' : 'none'; if (!show) return;
    xh.style.setProperty('--xs', String(S.xhairSize || 1));
    const now = performance.now(); if (now - xhT < 90) return; xhT = now;
    let hot = false, near = false;
    try {
      const c = camera.position, f = camFwd(new THREE.Vector3());
      const w = rayWorld(c.x, c.y, c.z, f.x, f.y, f.z, 60, 1), h = rayEntities(c, f, w ? w.t : 60, PL.ent);
      if (h && h.ent && h.ent.team === MERC) { hot = true; near = h.t - c.distanceTo(PL.ent.pos) < 22; }
    } catch (e) {}
    xh.classList.toggle('hot', hot); xh.classList.toggle('near', near);
    xh.classList.toggle('move', !!(PL.ent.vel && Math.hypot(PL.ent.vel.x, PL.ent.vel.z) > 2.5));
    xh.classList.toggle('hang', !!PL.ent.boClimb);
  }
  requestAnimationFrame(xhTick);

  window.BOLOADOUT = {
    open, openMenu, close, isOpen, deploy, render, isMenu: () => menu,
    onRound() { if (applying) return; if (MATCH.online || !SP().loadoutScreen) return; open(true); },
  };
})();
