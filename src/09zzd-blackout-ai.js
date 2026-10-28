/* ==========================================================================
   BLACKOUT pass 17: bot difficulty.
   DIFF (07-bots.js) now runs Recruit, Regular, Veteran, Hard, Elite, Nightmare, Custom.
   Custom is rebuilt from four editor sliders (BOCFG game: aiReact, aiAim, aiHear, aiAgg, 0 to 100). Each slider moves its group of
   bot values from Recruit (0) to Nightmare (100). The host runs every bot, so the host's level and sliders are what friends play against;
   the level travels in the room settings (NET.cfg.diff) and the sliders with the rest of the host's BLACKOUT settings.
   ========================================================================== */
(function () {
  'use strict';
  const LO = 0, HI = 5;
  const GROUPS = {
    aiReact: ['react', 'see', 'turn', 'spin', 'startle', 'lag'],
    aiAim: ['err', 'settle', 'head', 'flinch', 'dmg'],
    aiAgg: ['chase', 'mem', 'nade', 'flair', 'tokens'],
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  function customIdx() { for (let i = 0; i < DIFF.length; i++) if (DIFF[i].custom) return i; return -1; }
  function rebuild() {
    const ci = customIdx(); if (ci < 0 || !DIFF[LO] || !DIFF[HI]) return;
    const g = (window.BOCFG && BOCFG.v && BOCFG.v.game) || {}, C = DIFF[ci], A = DIFF[LO], B = DIFF[HI];
    for (const k in GROUPS) {
      const t = Math.min(1, Math.max(0, (+g[k] || 0) / 100));
      for (const f of GROUPS[k]) {
        if (Array.isArray(A[f])) C[f] = A[f].map((v, j) => lerp(v, B[f][j], t));
        else C[f] = lerp(A[f], B[f], t);
        if (f === 'tokens') C[f] = Math.round(C[f]);
      }
    }
    C.hear = lerp(0.6, 2.5, Math.min(1, Math.max(0, (+g.aiHear || 0) / 100)));
  }
  rebuild();
  setInterval(rebuild, 500);
  /* the level picked here is the one bots use: the room's when hosting, the solo one otherwise */
  function curLevel() { return (typeof MATCH !== 'undefined' && MATCH.online && typeof NET !== 'undefined') ? NET.cfg.diff : Settings.difficulty; }
  function setLevel(i) {
    i = Math.max(0, Math.min(DIFF.length - 1, i | 0));
    if (typeof NET !== 'undefined' && NET.role === 'host') {
      if (NET.phase === 'lobby' && typeof netSetupSet === 'function') netSetupSet('bots', i);
      else { NET.cfg.diff = i; try { netLobbyChanged(); } catch (e) {} }
    } else if (typeof NET !== 'undefined' && NET.role === 'client') return curLevel(); // a friend cannot change the host's bots
    Settings.difficulty = i; try { saveSettings(); } catch (e) {}
    return i;
  }
  window.BOAI = { rebuild, curLevel, setLevel, names: () => DIFF.map((d) => d.name), customIdx };
})();
