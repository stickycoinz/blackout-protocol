/* ==========================================================================
   BLACKOUT look (pass 6): one extra full-screen pass after Riposte's final pass (finalPass, 01-core.js).
   Pixelation, ordered / noise dithering with colour levels, palettes (incl. the BLACKOUT near-black / slate-teal / bone / red),
   contrast / saturation / brightness, luminance outlines, vignette, grain, scanlines. Render scale scales Riposte's own
   render resolution (renderPixelRatio). The pass is disabled (zero cost) while every setting is neutral.
   ========================================================================== */
(function () {
  const PALETTES = {
    blackout: ['#0b0d10', '#1b2a2e', '#3c5d62', '#e6dfcc', '#b3242a'],
    mono: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
    amber: ['#120800', '#5a2c00', '#c46a00', '#ffb84a'],
    nightvision: ['#020a02', '#0f3d12', '#3fa83a', '#b8ffb0'],
    gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    cga: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
  };
  const PRESETS = { // built-in looks (the editor adds the user's own)
    'Clean (Riposte)': {},
    'BLACKOUT palette': { palette: 'blackout', dither: true, ditherPat: 'bayer4', ditherStr: 0.55, pixel: 2, contrast: 1.15, vignette: 0.35, outline: true, outlineW: 1, outlineStr: 0.6 },
    'Retro dither': { dither: true, ditherPat: 'bayer8', ditherStr: 0.8, levels: 4, pixel: 3, contrast: 1.1, scan: 0.25, scanSize: 3 },
    'Night vision': { palette: 'nightvision', dither: true, ditherPat: 'noise', ditherStr: 0.35, brightness: 1.6, grain: 0.12, vignette: 0.9, scan: 0.2 },
    'Noir': { saturation: 0, contrast: 1.35, grain: 0.08, vignette: 0.6 },
  };
  const Shader = {
    uniforms: {
      tDiffuse: { value: null }, uRS: RS.u, uScr: { value: new THREE.Vector2(1, 1) }, uTex: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uPix: { value: 1 }, uDither: { value: 0 }, uPat: { value: 1 }, uDStr: { value: 0.6 }, uLevels: { value: 6 },
      uPalN: { value: 0 }, uPal: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
      uTone: { value: 0 }, uToneS: { value: new THREE.Vector3(1, 1, 1) }, uToneM: { value: new THREE.Vector3(1, 1, 1) }, uToneH: { value: new THREE.Vector3(1, 1, 1) },
      uCon: { value: 1 }, uSat: { value: 1 }, uBri: { value: 1 }, uOut: { value: 0 }, uOutW: { value: 1 },
      uVig: { value: 0 }, uGrain: { value: 0 }, uScan: { value: 0 }, uScanSz: { value: 3 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec4 uRS; uniform vec2 uScr, uTex; uniform float uTime;
      uniform float uPix, uDither, uPat, uDStr, uLevels, uCon, uSat, uBri, uOut, uOutW, uVig, uGrain, uScan, uScanSz;
      uniform int uPalN; uniform vec3 uPal[16]; uniform float uTone; uniform vec3 uToneS, uToneM, uToneH;
      varying vec2 vUv;
      ${RS_GLSL}
      float b2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
      float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
      float b8(vec2 a){ return b4(0.5 * a) * 0.25 + b2(a); }
      float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 tap(vec2 uv){ return texture2D(tDiffuse, rsUv(uv, uRS)).rgb; }
      float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
      void main(){
        vec2 px = floor(vUv * uScr / uPix);              // pixel cell (screen pixels / pixel size)
        vec2 uv = uPix > 1.0 ? (px + 0.5) * uPix / uScr : vUv;
        vec3 c = tap(uv);
        if (uOut > 0.0) {                                // Sobel on luminance, step = outline thickness (source texels, x pixel size)
          vec2 o = uTex * uOutW * max(1.0, uPix * 0.5);
          float tl = lum(tap(uv + vec2(-o.x, o.y))), t = lum(tap(uv + vec2(0.0, o.y))), tr = lum(tap(uv + o));
          float l = lum(tap(uv - vec2(o.x, 0.0))), r = lum(tap(uv + vec2(o.x, 0.0)));
          float bl = lum(tap(uv - o)), b = lum(tap(uv - vec2(0.0, o.y))), br = lum(tap(uv + vec2(o.x, -o.y)));
          float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
          float e = smoothstep(0.08, 0.35, sqrt(gx * gx + gy * gy));
          c = mix(c, c * 0.08, e * uOut);
        }
        c *= uBri;
        c = clamp((c - 0.5) * uCon + 0.5, 0.0, 1.0);
        c = clamp(mix(vec3(lum(c)), c, uSat), 0.0, 1.0);
        if (uTone > 0.0) {                                // split tone: shadows / mids / highlights pushed toward their tint (same brightness)
          float l = lum(c), ws = 1.0 - smoothstep(0.0, 0.5, l), wh = smoothstep(0.5, 1.0, l);
          vec3 t = uToneS * ws + uToneM * (1.0 - ws - wh) + uToneH * wh;
          c = clamp(mix(c, t * l, uTone), 0.0, 1.0);
        }
        float th = uPat < 0.5 ? b2(px) : uPat < 1.5 ? b4(px) : uPat < 2.5 ? b8(px) : h12(px + fract(uTime) * 91.0);
        float d = (th - 0.5) * uDStr * uDither;
        if (uPalN > 0) {                                  // nearest palette colour after the dither offset (luminance-weighted)
          vec3 q = clamp(c + d * 0.45, 0.0, 1.0), best = uPal[0]; float bd = 1e9;
          for (int i = 0; i < 16; i++) {
            if (i >= uPalN) break;
            vec3 dv = q - uPal[i]; float dd = dot(dv * dv, vec3(0.35, 0.5, 0.15)) + pow(lum(q) - lum(uPal[i]), 2.0) * 0.8;
            if (dd < bd) { bd = dd; best = uPal[i]; }
          }
          c = best;
        } else if (uDither > 0.0) {                       // per-channel quantisation to the colour levels
          float n = max(uLevels - 1.0, 1.0);
          c = clamp(floor(c * n + 0.5 + d) / n, 0.0, 1.0);
        }
        if (uScan > 0.0) c *= 1.0 - uScan * step(0.5, fract(gl_FragCoord.y / (uScanSz * 2.0)));
        if (uGrain > 0.0) c += (h12(gl_FragCoord.xy + fract(uTime * 7.3) * 113.0) - 0.5) * uGrain;
        if (uVig > 0.0) { vec2 v = vUv - 0.5; c *= 1.0 - dot(v, v) * uVig * 1.8; }
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  };
  let pass = null, scale = 1;
  const U = () => (pass ? pass.uniforms : Shader.uniforms);
  function ensure() {
    if (typeof composer === 'undefined' || !composer || !THREE.ShaderPass) return null;
    if (pass && composer.passes.includes(pass)) return pass;
    pass = new THREE.ShaderPass(Shader); pass.uniforms.uRS = RS.u; pass.enabled = false;
    composer.addPass(pass);
    if (BOPOST.last) BOPOST.apply(BOPOST.last);
    return pass;
  }
  const PAT = { bayer2: 0, bayer4: 1, bayer8: 2, noise: 3 };
  function neutral(L) {
    return L.pixel <= 1 && !L.dither && L.palette === 'none' && Math.abs(L.contrast - 1) < 1e-3 && Math.abs(L.saturation - 1) < 1e-3 &&
      Math.abs(L.brightness - 1) < 1e-3 && !(L.toneStr > 0) && !L.outline && L.vignette <= 0 && L.grain <= 0 && L.scan <= 0;
  }
  const _c = new THREE.Color();
  const BOPOST = window.BOPOST = {
    PALETTES, PRESETS, last: null,
    apply(L) {
      BOPOST.last = L; const p = ensure(); const u = U();
      u.uPix.value = Math.round(L.pixel); u.uDither.value = L.dither ? 1 : 0; u.uPat.value = PAT[L.ditherPat] != null ? PAT[L.ditherPat] : 1;
      u.uDStr.value = L.ditherStr; u.uLevels.value = Math.round(L.levels);
      const P = L.palette === 'custom' ? (Array.isArray(L.pal) && L.pal.length >= 2 ? L.pal.slice(0, 16) : PALETTES.blackout) : PALETTES[L.palette]; u.uPalN.value = P ? P.length : 0;
      const tn = (h, v) => { const n = parseInt(String(h || '#808080').slice(1), 16) || 0; let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const y = Math.max(0.05, 0.299 * r + 0.587 * g + 0.114 * b); v.set(r / y, g / y, b / y); };
      u.uTone.value = L.toneStr || 0; tn(L.toneSh, u.uToneS.value); tn(L.toneMid, u.uToneM.value); tn(L.toneHi, u.uToneH.value);
      if (P) P.forEach((h, i) => { _c.set(h); u.uPal.value[i].set(_c.r, _c.g, _c.b); });
      u.uCon.value = L.contrast; u.uSat.value = L.saturation; u.uBri.value = L.brightness;
      u.uOut.value = L.outline ? L.outlineStr : 0; u.uOutW.value = L.outlineW;
      u.uVig.value = L.vignette; u.uGrain.value = L.grain; u.uScan.value = L.scan; u.uScanSz.value = L.scanSize;
      if (p) p.enabled = !neutral(L);
      if (Math.abs(L.renderScale - scale) > 1e-3) { scale = L.renderScale; try { if (composer) onResize(); } catch (e) {} }
    },
    tick() {
      if (!pass || !pass.enabled) return;
      const u = pass.uniforms, s = renderer.getDrawingBufferSize(new THREE.Vector2());
      u.uScr.value.copy(s); u.uTex.value.set(1 / Math.max(1, RS.cw), 1 / Math.max(1, RS.ch)); u.uTime.value = performance.now() / 1000;
    },
    get scale() { return scale; },
  };
  const _rpr = renderPixelRatio;
  renderPixelRatio = function () { return _rpr() * scale; };
  const _setup = setupComposer;
  setupComposer = function () { pass = null; const r = _setup.apply(this, arguments); ensure(); return r; };
  const _frame = frame;
  frame = function (now) { BOPOST.tick(); _frame(now); };
  // the config may have been loaded before the composer existed
  try { if (window.BOCFG) BOPOST.apply(BOCFG.v.look); } catch (e) {}
})();
