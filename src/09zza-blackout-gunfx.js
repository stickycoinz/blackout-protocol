/* ==========================================================================
   BLACKOUT pass 13: gun light and spy gun HUD.
   - Muzzle light: every shot (player, bots, peers, suppressed included) lights its surroundings through Riposte's fixed pool of shot
     lights (muzzleLight, 01-core.js); nothing is added to or removed from the scene. Editor > Lighting > Muzzle flash sets the
     intensity, the range and how much a suppressed gun keeps (light and flash sprite).
   - The player's own spy fires from the M9 in the UAL hand (the first-person gun is hidden): the light and the world flash leave its muzzle.
   - An armed spy keeps the mag / reserve counter; a spectator sees neither the ammo counter nor the key hints.
   ========================================================================== */
(function () {
  if (!window.BO_RULES || typeof muzzleLight !== 'function') return;
  const R = window.BO_RULES, SPY = 1;
  const on = () => { try { return !!R.on(); } catch (e) { return false; } };
  const L = () => (window.BOCFG && BOCFG.v && BOCFG.v.light) || {};
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  function syncMuz() {
    if (on()) { const l = L(); MUZ.k = num(l.muzzleK, 1); MUZ.range = num(l.muzzleRange, 1); MUZ.supp = MUZ.suppFx = Math.max(0, Math.min(1, num(l.suppFlash, 0.35))); }
    else { MUZ.k = 1; MUZ.range = 1; MUZ.supp = 0; MUZ.suppFx = 0; } // Riposte: suppressed guns stay dark
  }
  const _ml = muzzleLight, _dir = new V3();
  muzzleLight = function (pos, silent, I, D, dur, ent) {
    if (ent && ent.isPlayer && ent.team === SPY && on() && window.BOM9) {
      const m = BOM9.muzzleOf(ent);
      if (m) {
        let f = 1; try { const d = armsW(ent).def; f = d.feel ? d.feel.flash : 1; } catch (e) {}
        try { camFwd(_dir); muzzleWorldFx(m, _dir, !!silent, f); } catch (e) {}
        return _ml.call(this, m, silent, I, D, dur, ent);
      }
    }
    return _ml.apply(this, arguments);
  };
  function hudSync() {
    const b = document.body; if (!b) return;
    let armed = false, spec = false;
    try { armed = on() && PL && PL.ent && PL.ent.alive && PL.ent.team === SPY && !!(window.BOCFG && BOCFG.spyArmed && BOCFG.spyArmed()); } catch (e) {}
    try { spec = !!(window.BOSPEC && BOSPEC.on) && MATCH.state === 'playing'; } catch (e) {}
    if (b.classList.contains('bo-armed') !== armed) b.classList.toggle('bo-armed', armed);
    if (b.classList.contains('bo-specing') !== spec) b.classList.toggle('bo-specing', spec);
  }
  const css = document.createElement('style');
  css.textContent = 'body.bo-specing #hud .ammo,body.bo-specing #wname,body.bo-specing #mag,body.bo-specing #reserve,body.bo-specing #pips,body.bo-specing #nades,body.bo-specing #reloadHint,body.bo-specing #boHud .bo-keys,body.bo-specing #boHud .bo-state{visibility:hidden!important;opacity:0!important}';
  document.head.appendChild(css);
  const _fr = frame;
  frame = function () { syncMuz(); hudSync(); return _fr.apply(this, arguments); };
  syncMuz();
  window.BOGUNFX = { syncMuz, hudSync };
})();
