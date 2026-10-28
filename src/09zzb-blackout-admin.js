/* ==========================================================================
   BLACKOUT pass 14: admin lock and live host sync.
   - The editor (F10) is hidden for everyone by default: no EDITOR button, no F10 hint, F10 does nothing.
     Ctrl+Shift+F10 asks for the admin code; only its SHA-256 lives in the build. A correct code unlocks the editor
     on this device (localStorage 'bo_admin_v1'); the editor footer can lock it again. localhost is always unlocked.
     This is a client-side lock: it keeps the editor out of sight, it is not a security boundary.
   - Online, the host's whole config (lighting, look, weapons, attachments, loadouts, gameplay, spy kit) is the
     config of every player. A guest's own saved settings are never overwritten: they come back when the room closes.
     Guests cannot open the editor, even on an unlocked device.
   - Live: every change the host makes goes out to the room (changed sections only, 250 ms after the last edit);
     a player joining the room gets the whole config.
   ========================================================================== */
(function () {
  const HASH = 'bc050a1330a04baf5a458fed5311fe527fb5bf84b58b158b17f237cb57f89716';
  const KEY = 'bo_admin_v1', MARK = HASH.slice(0, 20); // a new code invalidates old unlocks
  const SYNC = ['light', 'look', 'game', 'spy', 'weapons', 'atts', 'loadout'];
  const local = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const role = () => (typeof NET !== 'undefined' && NET ? NET.role : 'off');
  const hosting = () => role() === 'host';
  const unlocked = () => { if (local()) return true; try { return localStorage.getItem(KEY) === MARK; } catch (e) { return false; } };
  const can = () => unlocked() && role() !== 'client';

  /* ---------- SHA-256 (crypto.subtle when the page is a secure context, else a small JS version) ---------- */
  function sha256js(str) {
    const K = [], H = [];
    const isP = (n) => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    for (let n = 2, i = 0; i < 64; n++) if (isP(n)) { if (i < 8) H[i] = (Math.pow(n, 1 / 2) * 2 ** 32) | 0; K[i++] = (Math.pow(n, 1 / 3) * 2 ** 32) | 0; }
    const b = Array.from(new TextEncoder().encode(str)), l = b.length * 8;
    b.push(0x80); while (b.length % 64 !== 56) b.push(0);
    for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    const W = new Array(64), ror = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < b.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = ror(W[i - 15], 7) ^ ror(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = ror(W[i - 2], 17) ^ ror(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  async function sha256(str) {
    try {
      if (window.crypto && crypto.subtle) {
        const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    return sha256js(str);
  }
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

  /* ---------- admin prompt ---------- */
  const CSS = `
  body:not(.bo-admin) #boEdBtn, body:not(.bo-admin) #boMEd { display: none !important; }
  #boAdm { position: fixed; inset: 0; z-index: 100000; display: none; align-items: center; justify-content: center; background: rgba(4,5,7,.82); }
  #boAdm.open { display: flex; }
  #boAdm .box { width: min(420px, 92vw); background: #0b0d10; border: 1px solid #3c5d62; box-shadow: 0 0 0 1px #000, 0 20px 60px rgba(0,0,0,.7); padding: 22px 22px 18px;
    font: 13px ui-monospace, Menlo, Consolas, monospace; color: #e6dfcc; }
  #boAdm h3 { margin: 0 0 4px; font: 800 18px ui-monospace, Menlo, Consolas, monospace; letter-spacing: .22em; color: #e6dfcc; }
  #boAdm h3 b { color: #b3242a; }
  #boAdm p { margin: 0 0 14px; color: #8fa3a6; font-size: 12px; }
  #boAdm input { width: 100%; box-sizing: border-box; padding: 10px 12px; background: #11171a; color: #e6dfcc; border: 1px solid #3c5d62; outline: none;
    font: 16px ui-monospace, Menlo, Consolas, monospace; letter-spacing: .08em; }
  #boAdm input:focus { border-color: #e6dfcc; }
  #boAdm .row { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
  #boAdm button { padding: 8px 16px; background: #1b2a2e; color: #e6dfcc; border: 1px solid #3c5d62; cursor: pointer; font: 700 12px ui-monospace, monospace; letter-spacing: .14em; }
  #boAdm button.pri { background: #b3242a; border-color: #b3242a; color: #fff; }
  #boAdm .msg { min-height: 16px; margin-top: 10px; font-size: 12px; color: #ff6a6a; }
  #boAdm .msg.ok { color: #7fe0b0; }
  #boAdm.shake .box { animation: boAdmShake .3s; }
  @keyframes boAdmShake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }`;
  let root = null, inp = null, msg = null;
  function css() { if (document.getElementById('boAdmCss')) return; const st = document.createElement('style'); st.id = 'boAdmCss'; st.textContent = CSS; document.head.append(st); }
  css();
  function build() {
    css();
    root = document.createElement('div'); root.id = 'boAdm';
    root.innerHTML = '<div class="box"><h3>ADMIN <b>//</b> CODE</h3><p>Enter the admin code to unlock the BLACKOUT editor on this device.</p>'
      + '<input type="password" autocomplete="off" spellcheck="false" placeholder="code">'
      + '<div class="msg"></div><div class="row"><button type="button" class="cx">CANCEL</button><button type="button" class="pri go">UNLOCK</button></div></div>';
    document.body.append(root);
    inp = root.querySelector('input'); msg = root.querySelector('.msg');
    root.querySelector('.cx').onclick = () => close();
    root.querySelector('.go').onclick = () => submit();
    root.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === root) close(); });
    for (const ev of ['mouseup', 'click', 'wheel', 'contextmenu']) root.addEventListener(ev, (e) => e.stopPropagation());
    for (const ev of ['keydown', 'keyup']) root.addEventListener(ev, (e) => {
      e.stopPropagation();
      if (ev === 'keydown' && e.key === 'Enter') submit();
      else if (ev === 'keydown' && e.key === 'Escape') close();
    });
  }
  function open() {
    if (!root) build();
    root.classList.add('open'); inp.value = ''; msg.textContent = ''; msg.className = 'msg';
    try { if (document.pointerLockElement) { LOCK.resumeT = performance.now(); LOCK.scriptExit = true; document.exitPointerLock(); } } catch (e) {}
    try { for (const k in KEYS) KEYS[k] = false; } catch (e) {}
    setTimeout(() => inp.focus(), 30);
  }
  function close() { if (root) root.classList.remove('open'); }
  let busy = false;
  async function submit() {
    if (busy) return; busy = true;
    const ok = (await sha256(norm(inp.value))) === HASH;
    busy = false;
    if (ok) {
      try { localStorage.setItem(KEY, MARK); } catch (e) {}
      refresh(); msg.textContent = 'Editor unlocked on this device. Press F10.'; msg.className = 'msg ok';
      setTimeout(() => { close(); if (role() === 'client') return; try { BOEDITOR.open(); } catch (e) {} }, 700);
    } else {
      msg.textContent = 'Wrong code.'; inp.select();
      root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
    }
  }
  function lock() { try { localStorage.removeItem(KEY); } catch (e) {} refresh(); }
  function refresh() {
    const on = can();
    document.body.classList.toggle('bo-admin', on);
    if (!on) { try { if (window.BOEDITOR && BOEDITOR.isOpen()) BOEDITOR.close(); } catch (e) {} }
  }
  addEventListener('keydown', (e) => {
    if (e.code === 'F10' && e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) open(); }
  }, true);

  /* ---------- live host sync ----------
     PeerJS 1.5 'json' channels refuse (and report as a connection error) any message of 16300 bytes or more, so every
     config message goes through sendBig: under 4000 characters it is sent as is, above it is cut in 'bocfgc' parts that the
     guest puts back together. Each config message carries h, a hash of the host's whole synced config; the guest answers
     'boack' with the hash it applied, so the host's editor shows who is up to date. A guest still behind after 4 s gets
     the whole config again. */
  const peers = () => { try { return [...NET.players.values()].filter((p) => p.id !== NET.me); } catch (e) { return []; } };
  const sec = (k) => JSON.stringify(BOCFG.v[k]);
  const full = () => { const o = {}; for (const k of SYNC) o[k] = JSON.parse(sec(k)); o.lightVer = BOCFG.v.lightVer; return o; };
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6); }
  const curHash = () => fnv(SYNC.map(sec).join('|'));
  const CH = 4000;
  let seq = 0;
  function sendBig(pl, m) {
    const s = JSON.stringify(m);
    const out = (x) => { if (pl) netSendTo(pl, x); else netBroadcast(x); };
    if (s.length < CH) { out(m); return 1; }
    const id = Date.now().toString(36) + '.' + (++seq), n = Math.ceil(s.length / CH);
    for (let i = 0; i < n; i++) out({ t: 'bocfgc', id, i, n, d: s.slice(i * CH, (i + 1) * CH) });
    return n;
  }
  let last = {}, timer = 0;
  function flush() {
    timer = 0; if (!hosting()) return null;
    const s = {}; let n = 0;
    for (const k of SYNC) { const j = sec(k); if (j !== last[k]) { s[k] = JSON.parse(j); last[k] = j; n++; } }
    if (!n) return null;
    const m = { t: 'bocfg', s, h: curHash() };
    A.lastOut = m; A.sent++;
    if (peers().length) { try { const now = performance.now(); for (const p of peers()) if (!p.boT) p.boT = now; sendBig(null, m); } catch (e) { console.warn('BO sync', e); } }
    return m;
  }
  function dirty() { if (!hosting()) return; clearTimeout(timer); timer = setTimeout(flush, 250); }
  const _save = BOCFG.save, _saveNow = BOCFG.saveNow;
  BOCFG.save = function () { const r = _save.apply(this, arguments); dirty(); return r; };
  BOCFG.saveNow = function () { const r = _saveNow.apply(this, arguments); dirty(); return r; };
  function sendFull(pl) {
    if (!pl || !pl.conn) return null;
    for (const k of SYNC) last[k] = last[k] || sec(k);
    const m = { t: 'bocfg', full: 1, v: full(), h: curHash() };
    pl.boT = performance.now(); pl.boTries = (pl.boH === m.h ? pl.boTries || 0 : 0) + 1; pl.boH = m.h;
    try { m.parts = sendBig(pl, m); } catch (e) { console.warn('BO sync full', e); }
    return m;
  }
  if (typeof netHostMsg === 'function') {
    const _hm = netHostMsg;
    netHostMsg = function (c, m) {
      if (m && m.t === 'boack' && NET.role === 'host') {
        const pl = NET.players.get(c.peer);
        if (pl && pl.conn === c && typeof m.h === 'string') { pl.boAck = m.h.slice(0, 8); pl.boTries = 0; }
        return;
      }
      const r = _hm.apply(this, arguments);
      try {
        if (m && m.t === 'hi' && NET.role === 'host') { const pl = NET.players.get(c.peer); if (pl && pl.conn === c) { flush(); sendFull(pl); } }
      } catch (e) {}
      return r;
    };
  }
  // host: anyone still behind the current config 4 s after a send gets the whole config again (5 tries per version)
  setInterval(() => {
    if (!hosting() || !window.BOCFG) return;
    const h = curHash(), now = performance.now();
    for (const p of peers()) {
      if (!p.conn || p.boAck === h) continue;
      if (p.boH !== h) { if (p.boT && now - p.boT > 4000) sendFull(p); }
      else if (now - (p.boT || 0) > 4000 && (p.boTries || 0) < 5) sendFull(p);
    }
  }, 1000);
  /* guest: apply what the host sends, in memory only (BOCFG.remote: nothing is saved) */
  let toastEl = null, toastT = 0;
  function toast(t) {
    if (!toastEl) {
      toastEl = document.createElement('div'); toastEl.id = 'boSyncToast';
      toastEl.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;padding:7px 14px;background:#0b0d10;border:1px solid #3c5d62;color:#e6dfcc;font:700 12px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;pointer-events:none;transition:opacity .4s;opacity:0';
      document.body.append(toastEl);
    }
    toastEl.textContent = t; toastEl.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.opacity = '0'; }, 3500);
  }
  function clientIn(m) {
    if (!window.BOCFG) return;
    if (m.full && m.v && typeof m.v === 'object') { BOCFG.replace(m.v, true); A.got++; afterIn(m, true); return; }
    if (!m.s || typeof m.s !== 'object') return;
    const v = JSON.parse(JSON.stringify(BOCFG.v)), ch = [];
    for (const k of SYNC) if (m.s[k] && typeof m.s[k] === 'object') { v[k] = m.s[k]; ch.push(k); }
    if (!ch.length) return;
    BOCFG.v = BOCFG.sanitize(v); BOCFG.remote = true;
    const done = new Set();
    for (const k of ch) { const s = (k === 'atts' || k === 'loadout') ? 'weapons' : k; if (done.has(s)) continue; done.add(s); try { BOCFG.applySection(s); } catch (e) { console.warn('BO sync apply', k, e); } }
    A.got++; afterIn(m, false);
  }
  function afterIn(m, isFull) {
    A.hIn = typeof m.h === 'string' ? m.h : '';
    try { if (A.hIn) netSend({ t: 'boack', h: A.hIn }); } catch (e) {}
    toast((isFull ? 'HOST SETTINGS APPLIED' : 'HOST SETTINGS UPDATED') + (A.hIn ? ' · #' + A.hIn : ''));
    console.info('BLACKOUT: host config ' + (isFull ? 'applied' : 'updated') + ' #' + A.hIn);
    refresh(); try { if (window.BOEDITOR && BOEDITOR.isOpen()) BOEDITOR.render(); } catch (e) {}
  }
  const parts = new Map();
  function partIn(m) {
    if (typeof m.id !== 'string' || !(m.n > 0 && m.n < 400) || !(m.i >= 0 && m.i < m.n) || typeof m.d !== 'string') return;
    let P = parts.get(m.id); if (!P) { P = { n: m.n, got: 0, d: [], t: performance.now() }; parts.set(m.id, P); }
    if (P.d[m.i] == null) { P.d[m.i] = m.d; P.got++; }
    for (const [k, q] of parts) if (performance.now() - q.t > 30000) parts.delete(k);
    if (P.got < P.n) return;
    parts.delete(m.id);
    let whole = null; try { whole = JSON.parse(P.d.join('')); } catch (e) { console.warn('BO sync: bad chunked config', e); return; }
    if (whole && whole.t === 'bocfg') clientIn(whole);
  }
  if (typeof netClientMsg === 'function') {
    const _cm = netClientMsg;
    netClientMsg = function (m) {
      if (m && (m.t === 'bocfg' || m.t === 'bocfgc')) { if (NET.role === 'client') { try { if (m.t === 'bocfg') clientIn(m); else partIn(m); } catch (e) { console.warn('BO sync in', e); } } return; }
      return _cm.apply(this, arguments);
    };
  }
  /* leaving the room: a guest gets his own saved settings back; a host starts the next room from scratch */
  function restore() {
    clearTimeout(timer); timer = 0; last = {}; parts.clear(); A.hIn = '';
    if (!window.BOCFG || !BOCFG.remote) return;
    BOCFG.remote = false; BOCFG.v = BOCFG.defaults(); BOCFG.load();
    try { BOCFG.applyAll(); } catch (e) {}
  }
  if (typeof netReset === 'function') {
    const _nr = netReset;
    netReset = function () { const r = _nr.apply(this, arguments); try { restore(); refresh(); } catch (e) {} return r; };
  }
  function liveText() {
    if (!hosting()) return '';
    const P = peers(), h = curHash();
    if (!P.length) return 'LIVE #' + h + ' · room open, changes sync when players join';
    const ok = P.filter((p) => p.boAck === h);
    const wait = P.filter((p) => p.boAck !== h).map((p) => (p.n || 'player') + (p.boAck ? ' (old)' : ' (waiting)'));
    return 'LIVE #' + h + ' · ' + ok.length + '/' + P.length + ' players synced' + (wait.length ? ' · ' + wait.join(', ') : '');
  }

  const A = window.BOADMIN = { can, unlocked, open, close, lock, refresh, liveText, sha256, sha256js, flush, sendFull, sendBig, clientIn, partIn, restore, curHash, hIn: '', lastOut: null, sent: 0, got: 0, HASH };
  setInterval(refresh, 1000);
  if (document.body) refresh(); else addEventListener('DOMContentLoaded', refresh);
})();
