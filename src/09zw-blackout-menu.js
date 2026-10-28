/* ==========================================================================
   BLACKOUT pass 10: the main menu is PLAY, OUTFITS, CLASSES. A small bar holds the callsign, Options, the editor and fullscreen.
   The profile chip, social icons, news, legal links and credits are hidden (accounts are off in this build: online play uses PeerJS
   room codes and only needs a callsign). PLAY offers SOLO against bots, HOST ROOM and JOIN BY CODE (plus the public list when a relay
   server is configured). CLASSES opens the BLACKOUT loadout screen. Every menu and the Options area wear the BLACKOUT theme.
   ========================================================================== */
(function () {
  if (typeof uiGo !== 'function' || !window.BOLOADOUT) return;
  const css = document.createElement('style'); css.id = 'bo-menu-css';
  css.textContent = `
body.bo-ui{--xp:#9fd8ff;--acc:#9fd8ff;--acc-hi:#d4eeff;--acc-ink:#04121c;--acc-soft:rgba(159,216,255,.12);--acc-line:rgba(159,216,255,.5);
  --ink:#04070b;--ink-2:#070b10;--ink-3:#0d1319;--panel:rgba(5,8,12,.86);--panel-2:rgba(6,10,15,.96);--scrim:rgba(2,4,7,.88);
  --line:rgba(159,216,255,.12);--line-2:rgba(159,216,255,.28);--faint:rgba(159,216,255,.14);--paper:#e3eaef;--dim:#9aa7b0;--mute:#6f7b83;
  --stencil:var(--bo-mono);--hud:var(--bo-mono);--bo-a:#9fd8ff;--bo-a2:rgba(159,216,255,.32);--bo-a3:rgba(159,216,255,.1)}
body.bo-ui.bo-inmenu canvas#game{filter:grayscale(1) brightness(.6) contrast(1.1) sepia(.25) hue-rotate(170deg) saturate(1.4)}
body.bo-ui #menuBg{filter:grayscale(.85) brightness(.35) contrast(1.15) hue-rotate(170deg)}
body.bo-ui #menuBg::after,body.bo-ui .scr::before{background-image:none}
body.bo-ui .scr{background:radial-gradient(ellipse at 20% 10%,rgba(30,60,90,.28),transparent 60%),linear-gradient(180deg,rgba(3,5,8,.78),rgba(3,5,8,.9)),repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px)}
body.bo-ui .shead h2,body.bo-ui .opt-title,body.bo-ui h2,body.bo-ui h3{font-family:var(--bo-mono);letter-spacing:.2em;text-transform:uppercase}
body.bo-ui .shead p,body.bo-ui .hint{font-family:var(--bo-mono);letter-spacing:.06em}
body.bo-ui .btn,body.bo-ui button.back{font-family:var(--bo-mono);letter-spacing:.14em;border-radius:0}
body.bo-ui .btn.primary{background:var(--acc);color:var(--acc-ink)}
/* main menu */
body.bo-ui #scr-main .main-top,body.bo-ui #scr-main [data-go=options],body.bo-ui #scr-main [data-go=news],body.bo-ui #scr-main .msep,
body.bo-ui #scr-main .mfoot>*:not(#verTag),body.bo-ui #scr-main #pwaCard{display:none!important}
body.bo-ui #scr-main .mfoot{justify-content:flex-end}
body.bo-ui #scr-main #verTag{font:500 11px var(--bo-mono);letter-spacing:.2em;color:var(--mute)}
body.bo-ui #scr-main .logo{font-family:var(--bo-mono)!important;color:#e8eef2!important;letter-spacing:.42em!important;text-shadow:0 0 18px rgba(159,216,255,.35);animation:boGlitch 5s 1s infinite;justify-content:flex-start!important;align-items:flex-start!important}
body.bo-ui #scr-main .brand::after{content:"// SPIES VS MERCS";display:block;margin-top:8px;font:600 12px var(--bo-mono);letter-spacing:.32em;color:var(--bo-a)}
body.bo-ui #scr-main .mbtn{font-family:var(--bo-mono);border-radius:0;border-left:2px solid transparent;clip-path:none}
body.bo-ui #scr-main .mbtn b{font:800 30px/1.05 var(--bo-mono);letter-spacing:.24em}
body.bo-ui #scr-main .mbtn span{font:500 12px var(--bo-mono);letter-spacing:.14em;color:var(--dim);text-transform:uppercase}
body.bo-ui #scr-main .mbtn:hover,body.bo-ui #scr-main .mbtn:focus-visible,body.bo-ui #scr-main .mbtn.on{border-left-color:var(--bo-a);background:linear-gradient(90deg,rgba(159,216,255,.14),transparent)}
body.bo-ui #scr-main .mbtn:hover b,body.bo-ui #scr-main .mbtn.on b{color:var(--bo-a)}
body.bo-ui #scr-main #mmPlay{font-size:0!important}body.bo-ui #scr-main #mmPlay::after{content:"Solo vs bots \\00b7  host or join a room";font-size:12px}
#boMBar{position:absolute;left:max(24px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;font:600 12px var(--bo-mono);letter-spacing:.16em;z-index:3}
#boMBar label{display:flex;align-items:center;gap:8px;color:var(--mute);border:1px solid var(--bo-a2);background:rgba(4,7,11,.8);padding:0 0 0 10px;height:36px}
#boMBar input{width:150px;height:34px;border:0;border-left:1px solid var(--bo-a2);background:transparent;color:#e8eef2;font:600 13px var(--bo-mono);letter-spacing:.1em;padding:0 10px;outline:none;text-transform:uppercase}
#boMBar input:focus{background:rgba(159,216,255,.08)}
#boMBar button{height:36px;min-width:36px;padding:0 12px;border:1px solid var(--bo-a2);background:rgba(4,7,11,.8);color:#c9d2d8;font:700 11px var(--bo-mono);letter-spacing:.2em;cursor:pointer;display:flex;align-items:center;gap:6px}
#boMBar button:hover,#boMBar button:focus-visible{color:var(--bo-a);border-color:var(--bo-a);background:rgba(159,216,255,.08)}
#boMBar svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8}
body.bo-ui.bo-inmenu #boRole{display:none!important}
/* play screen */
body.bo-ui #scr-play .play-grid{display:flex;flex-direction:column;gap:18px;max-width:880px}
.bo-play-role{display:flex;align-items:center;gap:0;font:700 12px var(--bo-mono);letter-spacing:.24em;color:var(--mute)}
.bo-play-role span{margin-right:16px}
.bo-play-role button{min-width:170px;padding:12px 18px;font:800 13px var(--bo-mono);letter-spacing:.24em;background:rgba(4,7,11,.75);color:#7f8b93;border:1px solid #2a333a;cursor:pointer}
.bo-play-role button+button{border-left:0}
.bo-play-role button.on{color:#04121c;background:#9fd8ff;border-color:#9fd8ff}
.bo-play-role button.on.spy{background:#ff2a3d;border-color:#ff2a3d;color:#fff}
.bo-play-sec{font:700 12px var(--bo-mono);letter-spacing:.32em;color:var(--bo-a);border-bottom:1px solid var(--bo-a2);padding-bottom:6px;margin-top:6px}
.bo-play-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
body.bo-ui #scr-play .play-card{display:flex;flex-direction:column;align-items:flex-start;gap:8px;text-align:left;padding:18px 20px;min-height:0;border-radius:0;
  background:rgba(4,7,11,.82);border:1px solid var(--bo-a2);border-left:3px solid var(--bo-a);color:#e3eaef;font-family:var(--bo-mono);cursor:pointer;clip-path:none}
body.bo-ui #scr-play .play-card b{font:800 20px var(--bo-mono);letter-spacing:.22em}
body.bo-ui #scr-play .play-card span{font:500 12px/1.45 var(--bo-mono);letter-spacing:.04em;color:var(--dim)}
body.bo-ui #scr-play .play-card svg{width:22px;height:22px;fill:var(--bo-a)}
body.bo-ui #scr-play .play-card:hover,body.bo-ui #scr-play .play-card:focus-visible{background:rgba(159,216,255,.1);border-color:var(--bo-a)}
body.bo-ui #scr-play .play-card.solo{border-left-width:5px}
/* options */
body.bo-ui #scr-options .lrow,body.bo-ui #optPause .lrow{font-family:var(--bo-mono);border-radius:0}
body.bo-ui #scr-options .keys-h+.keys,body.bo-ui #optPause .keys-h+.keys{display:none}
body.bo-ui .bo-ctl+.keys-h,body.bo-ui .bo-ctl~.keys-h{display:none}
.bo-ctl{font:500 13px/1.3 var(--bo-mono);color:#dfe7ec;margin-top:4px}
.bo-ctl-head{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid rgba(159,216,255,.32);border-left:3px solid #9fd8ff;background:rgba(4,7,11,.8)}
.bo-ctl-head b{font:800 13px var(--bo-mono);letter-spacing:.3em;color:#9fd8ff}
.bo-ctl-head span{font-size:12px;color:#9aa7b0;letter-spacing:.03em}
.bo-ctl-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:14px}
.bo-ctl-col{border:1px solid rgba(159,216,255,.18);background:rgba(4,7,11,.72);padding:10px 12px 12px}
.bo-ctl-col h5{margin:0 0 8px;font:800 14px var(--bo-mono);letter-spacing:.3em;color:#9fd8ff;display:flex;flex-direction:column;gap:2px;border-bottom:1px solid rgba(159,216,255,.25);padding-bottom:6px}
.bo-ctl-col h5 small{font:500 10px var(--bo-mono);letter-spacing:.16em;color:#6f7b83;text-transform:uppercase}
.bo-ctl-col.spy h5{color:#ff5a68;border-bottom-color:rgba(255,42,61,.35)}
.bo-ctl-col.spy{border-color:rgba(255,42,61,.22)}
.bo-ctl-col.merc h5{color:#9fd8ff}
.bo-ctl-col.all h5{color:#e3eaef}
.bo-ctl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.bo-ctl-row span{font-size:12px;color:#c9d2d8}
.bo-ctl-row.fixed span{color:#7f8b93}
.bo-kb{min-width:74px;height:28px;padding:0 10px;font:800 12px var(--bo-mono);letter-spacing:.12em;color:#e8eef2;background:rgba(159,216,255,.08);border:1px solid rgba(159,216,255,.35);cursor:pointer}
.bo-ctl-col.spy .bo-kb{background:rgba(255,42,61,.08);border-color:rgba(255,42,61,.4)}
.bo-kb:hover,.bo-kb:focus-visible{border-color:#9fd8ff;color:#9fd8ff}
.bo-ctl-col.spy .bo-kb:hover{border-color:#ff5a68;color:#ff5a68}
.bo-kb.changed{box-shadow:inset 0 -2px 0 #59e1ff}
.bo-kb.wait{color:#04121c;background:#9fd8ff;animation:boBlink .8s steps(2) infinite}
.bo-kb:disabled{cursor:default;color:#8d99a1;background:transparent;border-style:dashed;border-color:#2a333a}
.bo-ctl-foot{display:flex;align-items:center;gap:12px;margin-top:12px}
.bo-ctl-note{flex:1;margin:0;font-size:12px;color:#9fd8ff;min-height:1.3em}
.bo-ctl-reset{padding:9px 16px;font:800 11px var(--bo-mono);letter-spacing:.22em;color:#c9d2d8;background:transparent;border:1px solid #2a333a;cursor:pointer}
.bo-ctl-reset:hover{border-color:#ff5a68;color:#ff5a68}
@keyframes boBlink{50%{opacity:.55}}
`;
  document.head.appendChild(css);
  const on = () => { document.body.classList.add('bo-ui'); };
  if (document.body) on(); else addEventListener('DOMContentLoaded', on);
  setInterval(() => { try { document.body.classList.toggle('bo-inmenu', MATCH.state === 'menu'); } catch (e) {} }, 300);

  const $$ = (id) => document.getElementById(id);
  /* ---------- main menu ---------- */
  function mainMenu() {
    const scr = $$('scr-main'); if (!scr || scr._bo) return; scr._bo = true;
    const txt = (sel, b, s) => { const x = scr.querySelector(sel); if (!x) return; const bb = x.querySelector('b'); if (bb) bb.textContent = b; const ss = x.querySelector('span'); if (ss) ss.textContent = s; };
    txt('[data-go=play]', 'PLAY', 'Solo vs bots · host or join a room');
    txt('[data-go=skins]', 'OUTFITS', 'Character outfits and colours');
    txt('[data-go=classes]', 'CLASSES', 'Merc and spy loadouts, gadgets');
    // OUTFITS above CLASSES? the brief order: PLAY, OUTFITS, CLASSES
    const nav = scr.querySelector('.mlist'), sk = scr.querySelector('[data-go=skins]'), cl = scr.querySelector('[data-go=classes]');
    if (nav && sk && cl) nav.insertBefore(sk, cl);
    const bar = document.createElement('div'); bar.id = 'boMBar';
    const gear = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/></svg>';
    bar.innerHTML = '<label>CALLSIGN<input id="boNick" maxlength="16" spellcheck="false" autocomplete="nickname" placeholder="OPERATIVE"></label>'
      + '<button type="button" id="boMOpt" title="Options" aria-label="Options">' + gear + 'OPTIONS</button>'
      + '<button type="button" id="boMEd" title="BLACKOUT editor (F10)">EDITOR</button>'
      + '<button type="button" id="boMFs" title="Fullscreen">FULLSCREEN</button>';
    scr.appendChild(bar);
    const nick = $$('boNick'), net = $$('netName');
    try { nick.value = (net && net.value) || localStorage.getItem('cod_nick') || ''; } catch (e) {}
    const push = () => { if (!net) return; net.value = nick.value.trim(); net.dispatchEvent(new Event('change')); nick.value = net.value; };
    nick.addEventListener('change', push);
    nick.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { push(); nick.blur(); } });
    $$('boMOpt').addEventListener('click', () => { try { sfxUi('click'); } catch (e) {} uiGo('options'); });
    $$('boMEd').addEventListener('click', () => { try { sfxUi('click'); } catch (e) {} if (window.BOEDITOR) BOEDITOR.open(); });
    $$('boMFs').addEventListener('click', () => { const f = $$('fsBtn'); if (f) f.click(); });
    // the callsign follows the one typed in the online lobby
    if (net) net.addEventListener('change', () => { if (document.activeElement !== nick) nick.value = net.value; });
  }
  /* CLASSES (the main menu button and the lobby's Edit class row) opens the BLACKOUT loadout screen */
  const _uiGo = uiGo;
  uiGo = function (name, ...rest) {
    if (name === 'classes') { try { sfxUi('click'); } catch (e) {} BOLOADOUT.openMenu(); return; }
    if (name === 'main') setTimeout(() => { const n = $$('boNick'), net = $$('netName'); if (n && net && document.activeElement !== n) n.value = net.value; }, 0);
    return _uiGo(name, ...rest);
  };

  /* ---------- PLAY: solo or online ---------- */
  const ICON = {
    solo: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z',
    host: 'M4 5h16v10H4zM2 19h20v1.5H2zM11 8h2v2h2v2h-2v2h-2v-2H9v-2h2z',
    join: 'M10 4h10v16H10v-2h8V6h-8zM3 11h9.2l-3-3 1.4-1.4L16 12l-5.4 5.4-1.4-1.4 3-3H3z',
    pub: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 0 1 7.7 6H4.3A8 8 0 0 1 12 4Zm-7.7 8h15.4a8 8 0 0 1-15.4 0Z',
  };
  const role = () => ((typeof BO !== 'undefined' && BO.role === 'spy') ? 'spy' : 'merc');
  playRender = function () {
    const el = $$('playGrid'); if (!el) return;
    const card = (k, t, s, ic) => `<button class="play-card ${k}" type="button" data-play="${k}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[ic]}"/></svg><b>${t}</b><span>${s}</span></button>`;
    const via = typeof netViaServer === 'function' && netViaServer();
    el.innerHTML = '<div class="bo-play-role"><span>DEPLOY AS</span><button type="button" data-role="merc" class="' + (role() === 'merc' ? 'on' : '') + '">MERC · FPS</button><button type="button" data-role="spy" class="spy ' + (role() === 'spy' ? 'on' : '') + '">SPY · OTS</button></div>'
      + '<div class="bo-play-sec">SOLO</div><div class="bo-play-row">' + card('solo', 'SOLO VS BOTS', 'Offline. Bots fill both teams. Start right away on the BLACKOUT facility.', 'solo') + '</div>'
      + '<div class="bo-play-sec">ONLINE · ROOM CODES, NO ACCOUNT</div><div class="bo-play-row">'
      + card('host', 'HOST ROOM', 'Open a room and share its 5 letter code. Bots fill the empty slots.', 'host')
      + card('join', 'JOIN BY CODE', 'Type the code the host gave you.', 'join')
      + (via ? card('public', 'PUBLIC ROOMS', 'Rooms other players opened on the server.', 'pub') : '') + '</div>';
    const sub = document.querySelector('#scr-play .shead p'); if (sub) sub.textContent = 'Solo against bots, or online with a room code';
    const h2 = document.querySelector('#scr-play .shead h2'); if (h2) h2.textContent = 'PLAY';
  };
  playPick = function (k) {
    try { sfxUi('click'); } catch (e) {}
    if (k === 'merc' || k === 'spy') return;
    if (!boMapOn(Settings.map)) Settings.map = 'blackout';
    if (k === 'solo') { menuLaunch({ online: false, map: Settings.map, deploy: () => startMatch() }); return; }
    if (typeof netInLobby === 'function' && netInLobby()) { uiGo('multi'); UI.lobbyBack = true; return; }
    if (k === 'host') { uiGo('multi'); UI.lobbyBack = true; netHost({}); return; }
    if (k === 'join') { uiGo('multi'); UI.lobbyBack = true; try { lmPush(LM.scr.multi, 'join'); } catch (e) {} setTimeout(() => { const c = $$('netCodeIn'); if (c) c.focus(); }, 60); return; }
    uiGo('multi');
  };
  function playRoles() {
    const el = $$('playGrid'); if (!el || el._boRole) return; el._boRole = true;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-role]'); if (!b) return;
      BO.role = b.dataset.role; try { localStorage.setItem('bo_role', BO.role); } catch (e2) {}
      if (BO.refreshRoleUI) BO.refreshRoleUI();
      try { sfxUi('click'); } catch (e2) {}
      playRender();
    });
  }
  function boot() { mainMenu(); playRoles(); playRender(); }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
})();
