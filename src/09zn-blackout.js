/* BLACKOUT branding strip, music mute, role helpers, auto-deploy for ?bo=1 */
(function () {
  const qs = () => new URLSearchParams(location.search);
  // query flags (?bo=1, ?carte=blackout, ?role=) are dropped by static servers that redirect *.html to clean URLs (serve, some Node
  // setups): #bo / #blackout in the hash survives those redirects. Without any flag, BLACKOUT is simply the map picked in the menu.
  const BO_MODE = qs().get('bo') === '1' || qs().get('carte') === 'blackout' || qs().get('role') || /^#(bo|blackout)\b/.test(location.hash);
  try { if (typeof MAP_ART !== 'undefined' && !MAP_ART.blackout && MAP_ART.sable) MAP_ART.blackout = MAP_ART.sable; } catch (e) {}

  function rebrand() {
    try {
      document.title = 'BLACKOUT';
      const metas = ['application-name', 'apple-mobile-web-app-title'];
      for (const n of metas) {
        const el = document.querySelector(`meta[name="${n}"]`);
        if (el) el.setAttribute('content', 'BLACKOUT');
      }
      document.querySelectorAll('.logo').forEach((el) => {
        el.setAttribute('aria-label', 'BLACKOUT');
        el.style.backgroundImage = 'none';
        el.style.background = 'transparent';
        el.textContent = 'BLACKOUT';
        el.style.fontFamily = 'system-ui, sans-serif';
        el.style.fontWeight = '800';
        el.style.fontSize = 'clamp(28px, 5vw, 54px)';
        el.style.letterSpacing = '0.18em';
        el.style.color = '#c8d0d8';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.filter = 'none';
      });
      // Hide credit / riposte links if present
      document.querySelectorAll('.credit, a[href*="riposte"], a[href*="playriposte"]').forEach((el) => {
        el.style.display = 'none';
      });
    } catch (e) {}
  }

  function muteMenuMusic() {
    try {
      const mm = document.querySelector('meta[name="menu-music"]');
      if (mm) mm.setAttribute('content', '');
      // Hard-stop if audio element exists
      document.querySelectorAll('audio').forEach((a) => { try { a.pause(); a.src = ''; } catch (e) {} });
      if (typeof Settings !== 'undefined') {
        if ('music' in Settings) Settings.music = 0;
        if ('menuMusic' in Settings) Settings.menuMusic = 0;
      }
    } catch (e) {}
  }

  function injectRoleUI() {
    if (document.getElementById('boRole')) return;
    const box = document.createElement('div');
    box.id = 'boRole';
    box.style.cssText = 'position:fixed;top:12px;left:12px;z-index:99999;display:flex;gap:8px;font:600 13px system-ui,sans-serif';
    const mk = (role, label) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.role = role;
      b.style.cssText = 'padding:8px 12px;border:1px solid #3a4550;background:#12161c;color:#c8d0d8;cursor:pointer;border-radius:4px';
      b.onclick = () => {
        if (typeof BO !== 'undefined') BO.role = role;
        try { localStorage.setItem('bo_role', role); } catch (e) {}
        if (BO.refreshRoleUI) BO.refreshRoleUI();
        else { box.querySelectorAll('button').forEach((x) => { x.style.outline = 'none'; x.style.borderColor = '#3a4550'; });
          b.style.borderColor = '#44ffcc'; b.style.outline = '1px solid #44ffcc'; }
        try {
          if (typeof respawnPlayer === 'function' && MATCH && MATCH.state === 'playing') {
            const sp = role === 'spy'
              ? ((window.BLACKOUT_SPAWNS && BLACKOUT_SPAWNS.spy) || (typeof BO_SPY_SPAWNS !== 'undefined' ? BO_SPY_SPAWNS : null))
              : ((window.BLACKOUT_SPAWNS && BLACKOUT_SPAWNS.merc) || (typeof BO_MERC_SPAWNS !== 'undefined' ? BO_MERC_SPAWNS : null));
            if (sp && sp[0] && PL && PL.ent) {
              PL.ent.pos.set(sp[0][0], 0.1, sp[0][1]);
              PL.yaw = role === 'spy' ? Math.PI : 0;
              PL.ent.yaw = PL.yaw;
              if (role === 'spy') { VM.root.visible = false; VM.holder.visible = false; if (PL.ent.model) PL.ent.model.root.visible = true; }
              else { VM.root.visible = true; if (PL.ent.model) PL.ent.model.root.visible = false; }
            }
          }
        } catch (err) { console.warn('bo role', err); }
      };
      if ((typeof BO !== 'undefined' ? BO.role : 'merc') === role) {
        b.style.borderColor = '#44ffcc';
      }
      return b;
    };
    box.appendChild(mk('merc', 'MERC (FPS)'));
    box.appendChild(mk('spy', 'SPY (OTS)'));
    BO.refreshRoleUI = function () {
      for (const b of box.querySelectorAll('button')) {
        const on = b.dataset.role === BO.role;
        b.style.borderColor = on ? '#2ee6c5' : '#445';
        b.style.background = on ? '#0a2a24' : '#1118';
      }
    };
    BO.refreshRoleUI();
    document.body.appendChild(box);
    // only for BLACKOUT: in the menu with BLACKOUT picked, or in a BLACKOUT match
    const vis = () => { try { const on = (typeof boIsBlackout === 'function' && boIsBlackout()) || (MATCH.state === 'menu' && Settings.map === 'blackout');
      box.style.display = on ? 'flex' : 'none'; } catch (e) {} };
    vis(); setInterval(vis, 500);
  }

  function autoDeploy() {
    if (!BO_MODE) return;
    const tryGo = () => {
      if (typeof menuDeploy === 'function' && MATCH && MATCH.state === 'deploy') {
        menuDeploy();
        return;
      }
      if (typeof startMatch === 'function' && MATCH && (MATCH.state === 'deploy' || MATCH.state === 'menu')) {
        // If already on deploy screen
        const go = document.getElementById('depGo');
        if (go) { go.click(); return; }
      }
      setTimeout(tryGo, 400);
    };
    // essai path already calls menuLaunch with deploy; ensure carte=blackout
    setTimeout(tryGo, 2500);
  }

  addEventListener('DOMContentLoaded', () => { rebrand(); muteMenuMusic(); });
  setTimeout(() => { rebrand(); muteMenuMusic(); injectRoleUI(); }, 600);
  setTimeout(autoDeploy, 1000);
  // Fallback: if still on menu after 5s with ?bo=1, force map + start
  setTimeout(async () => {
    try {
      if (!BO_MODE) return;
      if (MATCH && MATCH.state === 'playing') return;
      Settings.map = 'blackout';
      if (typeof mapEnsure === 'function') await mapEnsure('blackout');
      try { uiHide(); } catch (e) {}
      if (typeof startMatch === 'function') startMatch();
    } catch (e) { console.warn('boForceStart', e); }
  }, 5000);

  // Keep music dead
  setInterval(muteMenuMusic, 3000);
})();

/* Hide gun HUD bits when spy */
(function(){
  const style = document.createElement('style');
  style.id = 'bo-spy-hud';
  style.textContent = `body.bo-spy .ammo, body.bo-spy #wname, body.bo-spy #mag, body.bo-spy #reserve, body.bo-spy #pips, body.bo-spy #nades, body.bo-spy #xhair { opacity: 0 !important; visibility: hidden !important; }`;
  document.documentElement.appendChild(style);
  setInterval(() => {
    try {
      if (typeof boIsSpy === 'function' && boIsSpy()) document.body.classList.add('bo-spy');
      else document.body.classList.remove('bo-spy');
    } catch(e){}
  }, 500);
})();
