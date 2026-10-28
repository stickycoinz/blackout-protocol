/* pass 17: a BLACKOUT map id is 'blackout' (Khamsin night) or 'bo_<riposte id>' (the other night maps, 02zb-blackout-nights.js) */
function boMapOn(id) { return id === 'blackout' || (typeof id === 'string' && id.slice(0, 3) === 'bo_'); }
/* BLACKOUT facility — Riposte MAP_DEFS, concrete/slate/teal (red accents only) */
const ATMO_BLACKOUT = Object.assign({}, ATMO_DEFAULT, {
  /* Dark facility night — low ambient, readable silhouettes, merc flashlight carries the room */
  sun: [0.05, 1.0, 0.05], sunColor: 0x1a2030, sunI: 0.12, vmSun: 0x2a3548,
  fog: [0.02, 0.025, 0.035], fogD: 0.018,
  hemi: [0x243040, 0x0c1018, 0.28], vmHemi: [0x243040, 0x0a0c12],
  sky: Object.assign({}, ATMO_DEFAULT.sky, {
    zen: [0.01, 0.012, 0.02], mid: [0.02, 0.025, 0.035], hor: [0.03, 0.035, 0.045], gnd: [0.015, 0.018, 0.022],
    glow: [0.05, 0.06, 0.08], halo: [0.08, 0.09, 0.11], disk: [1, 1, 1.2],
    cloudLo: [0.03, 0.035, 0.04], cloudHi: [0.05, 0.055, 0.06], cloud: [0.1, 0.15, 0.1],
  }),
  envGround: 0x0c0e14, hdri: null,
  bounce: [0.15, 0.18, 0.22], dust: [0.1, 0.11, 0.12], motes: [0.15, 0.16, 0.18],
  grade: { lo: [0.85, 0.9, 1.05], hi: [0.95, 0.98, 1.0], exp: 0.85 },
  rays: [0.15, 0.18, 0.22], fogSun: 0.05, fogH: [8, 0],
  interior: [0.55, 0.35, 0.4],
  bloom: [0.35, 0.55, 0.9], aoFloor: 0.75,
  raysThr: 1.5, raysCap: 400,
});

/* Legacy custom facility (pass 1-4). Kept for reference but NOT reachable from the menus any more: on the user's PC it threw
   every frame (no surface(), bots shooting with a removed gun) and its 18 dynamic PointLights made every lit shader heavy.
   BLACKOUT now plays on Khamsin (MAP_DEFS.blackout below). */
MAP_DEFS.blackout_facility = {
  type: 'close',
  surface: () => 'concrete',
  bounds: { x0: -34, x1: 34, z0: -20, z1: 20 },
  textures: ['concrete', 'steel', 'paint', 'asphalt', 'pavers'],
  splat: { x0: -40, z0: -28, w: 80, d: 56, ppm: 4 },
  far: 90,
  art: { cam: [0, 28, 0.1], look: [0, 0, 0], fov: 50 },
  spawns: [[3.57, 10.99], [7.77, 10.99]],
  poi: [[-6.37, 0, -8.26, "L"], [8.47, 0, -6.65, "L"], [-6.37, 0, -0.35, "L"], [3.57, 0, 10.99, "L"], [7.77, 0, 10.99, "L"], [-29.19, 0, -14.77, "L"], [-28.28, 0, -14.21, "L"]],
  zones: [
    [-29.05, -14.70, "SPAWN"],
    [-25.20, -7.70, "B"],
    [-6.37, -8.26, "A"],
    [-6.37, -0.35, "C"],
    [5.11, -12.25, "HACK"],
    [8.54, -6.58, "B"],
    [4.27, 10.64, "MERC"],
  ],
  atmo: ATMO_BLACKOUT,
  build() {
    const WT = 0.42, WH = 3.35;
    /* outdoor pad */
    boxC("asphalt", 0, -0.08, 0, 68, 0.16, 40, { collide: false, ao: false, tint: [0.04, 0.045, 0.055] });
    /* spawnEntry floor */
    boxC("asphalt", -29.050, 0, -14.700, 3.360, 0.06, 2.100, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    /* westB floor */
    boxC("asphalt", -25.200, 0, -7.700, 9.940, 0.06, 11.900, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", -25.200, WH - 0.08, -7.700, 9.940, 0.08, 11.900, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* smallN floor */
    boxC("asphalt", -15.750, 0, -10.710, 8.960, 0.06, 5.880, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", -15.750, WH - 0.08, -10.710, 8.960, 0.08, 5.880, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* smallS floor */
    boxC("asphalt", -15.750, 0, -6.020, 8.960, 0.06, 3.500, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", -15.750, WH - 0.08, -6.020, 8.960, 0.08, 3.500, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* A floor */
    boxC("asphalt", -6.370, 0, -8.260, 9.800, 0.06, 10.220, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", -6.370, WH - 0.08, -8.260, 9.800, 0.08, 10.220, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* C floor */
    boxC("asphalt", -6.370, 0, -0.350, 9.800, 0.06, 5.600, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", -6.370, WH - 0.08, -0.350, 9.800, 0.08, 5.600, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* lockers floor */
    boxC("asphalt", -15.050, 0, -0.910, 1.120, 0.06, 6.720, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", -15.050, WH - 0.08, -0.910, 1.120, 0.08, 6.720, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* vCorr floor */
    boxC("asphalt", 0.420, 0, -2.450, 3.780, 0.06, 15.400, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", 0.420, WH - 0.08, -2.450, 3.780, 0.08, 15.400, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* hackAlcove floor */
    boxC("asphalt", 5.110, 0, -12.250, 5.600, 0.06, 4.200, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", 5.110, WH - 0.08, -12.250, 5.600, 0.08, 4.200, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* eastB floor */
    boxC("asphalt", 8.540, 0, -6.580, 12.460, 0.06, 7.140, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", 8.540, WH - 0.08, -6.580, 12.460, 0.08, 7.140, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* eastOpen floor */
    boxC("asphalt", 8.540, 0, 1.120, 12.460, 0.06, 8.260, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", 8.540, WH - 0.08, 1.120, 12.460, 0.08, 8.260, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* vCorrE floor */
    boxC("asphalt", 16.800, 0, -2.450, 4.060, 0.06, 15.400, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", 16.800, WH - 0.08, -2.450, 4.060, 0.08, 15.400, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* laser floor */
    boxC("asphalt", 24.780, 0, -3.850, 11.900, 0.06, 12.600, { collide: false, ao: false, tint: [0.08, 0.085, 0.095] });
    boxC("concrete", 24.780, WH - 0.08, -3.850, 11.900, 0.08, 12.600, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* lowerRight floor */
    boxC("asphalt", 24.570, 0, 7.350, 11.480, 0.06, 9.800, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", 24.570, WH - 0.08, 7.350, 11.480, 0.08, 9.800, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* ewBand floor */
    boxC("asphalt", -5.670, 0, 2.590, 49.000, 0.06, 8.680, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    /* blCluster floor */
    boxC("asphalt", -21.770, 0, 10.080, 16.800, 0.06, 6.300, { collide: false, ao: false, tint: [0.07, 0.075, 0.085] });
    boxC("concrete", -21.770, WH - 0.08, 10.080, 16.800, 0.08, 6.300, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* mercHall floor */
    boxC("asphalt", 4.270, 0, 10.640, 19.880, 0.06, 10.220, { collide: false, ao: false, tint: [0.08, 0.085, 0.095] });
    boxC("concrete", 4.270, WH - 0.08, 10.640, 19.880, 0.08, 10.220, { collide: false, tint: [0.05, 0.055, 0.065] });
    /* stairs floor */
    boxC("asphalt", -2.870, 0, 9.940, 2.800, 0.06, 4.620, { collide: false, ao: false, tint: [0.08, 0.085, 0.095] });
    boxC("concrete", -29.820, 0, -13.650, 0.700, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -24.010, 0, -13.650, 7.560, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -28.350, 0, -1.750, 3.640, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -22.050, 0, -1.750, 3.640, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -30.170, 0, -7.700, WT, WH, 11.900, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -20.230, 0, -12.250, WT, WH, 2.800, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -20.230, 0, -5.180, WT, WH, 6.860, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -15.750, 0, -13.650, 8.960, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -18.550, 0, -7.770, 3.360, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -12.880, 0, -7.770, 3.220, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -20.230, 0, -12.250, WT, WH, 2.800, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -20.230, 0, -8.190, WT, WH, 0.840, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -11.270, 0, -12.460, WT, WH, 2.380, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -11.270, 0, -8.260, WT, WH, 0.980, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -18.550, 0, -4.270, 3.360, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -12.880, 0, -4.270, 3.220, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -20.230, 0, -6.020, WT, WH, 3.500, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -11.270, 0, -6.020, WT, WH, 3.500, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -6.370, 0, -13.370, 9.800, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -9.520, 0, -3.150, 3.500, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -3.220, 0, -3.150, 3.500, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -11.270, 0, -12.320, WT, WH, 2.100, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -11.270, 0, -5.950, WT, WH, 5.600, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -1.470, 0, -10.815, WT, WH, 5.110, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -1.470, 0, -4.480, WT, WH, 2.660, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -10.150, 0, 2.450, 2.240, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -3.500, 0, 2.450, 4.060, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -11.270, 0, -0.350, WT, WH, 5.600, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -1.470, 0, -2.380, WT, WH, 1.540, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -1.470, 0, 1.750, WT, WH, 1.400, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -15.050, 0, 2.450, 1.120, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -15.610, 0, -0.770, WT, WH, 6.440, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -14.490, 0, -0.910, WT, WH, 6.720, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 0.420, 0, -10.150, 3.780, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -1.470, 0, -9.205, WT, WH, 1.890, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -1.470, 0, -3.710, WT, WH, 4.200, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -1.470, 0, 3.150, WT, WH, 4.200, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, -9.205, WT, WH, 1.890, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, -3.360, WT, WH, 4.200, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, 3.395, WT, WH, 3.710, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 5.110, 0, -14.350, 5.600, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.765, 0, -10.150, 0.910, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 6.965, 0, -10.150, 1.890, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, -12.250, WT, WH, 4.200, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 7.910, 0, -12.250, WT, WH, 4.200, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.765, 0, -10.150, 0.910, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 10.395, 0, -10.150, 8.750, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 4.340, 0, -3.010, 4.060, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 12.495, 0, -3.010, 4.550, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, -9.205, WT, WH, 1.890, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, -4.235, WT, WH, 2.450, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 14.770, 0, -6.580, WT, WH, 7.140, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 4.270, 0, 5.250, 1.400, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 13.370, 0, 5.250, 2.800, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, -2.135, WT, WH, 1.750, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 2.310, 0, 3.395, WT, WH, 3.710, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 14.770, 0, -2.135, WT, WH, 1.750, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 14.770, 0, 3.395, WT, WH, 3.710, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 16.800, 0, -10.150, 4.060, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 16.800, 0, 5.250, 4.060, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 14.770, 0, -5.705, WT, WH, 8.890, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 14.770, 0, 3.395, WT, WH, 3.710, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 18.830, 0, -8.505, WT, WH, 3.290, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 18.830, 0, 0.770, WT, WH, 8.960, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 24.780, 0, -10.150, 11.900, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 21.175, 0, 2.450, 4.690, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 29.050, 0, 2.450, 3.360, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 18.830, 0, -8.505, WT, WH, 3.290, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 18.830, 0, -0.630, WT, WH, 6.160, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 30.730, 0, -3.850, WT, WH, 12.600, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 21.175, 0, 2.450, 4.690, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 28.840, 0, 2.450, 2.940, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 24.570, 0, 12.250, 11.480, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 18.830, 0, 7.350, WT, WH, 9.800, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 30.310, 0, 7.350, WT, WH, 9.800, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -28.000, 0, 6.930, 4.340, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -20.055, 0, 6.930, 3.850, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -14.000, 0, 6.930, 1.260, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -21.770, 0, 13.230, 16.800, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -30.170, 0, 10.080, WT, WH, 6.300, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -13.370, 0, 10.080, WT, WH, 6.300, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -3.850, 0, 5.530, 3.640, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 4.270, 0, 5.530, 1.400, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 13.090, 0, 5.530, 2.240, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 4.270, 0, 15.750, 19.880, WH, WT, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -5.670, 0, 10.640, WT, WH, 10.220, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 14.210, 0, 7.210, WT, WH, 3.360, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", 14.210, 0, 13.895, WT, WH, 3.710, { tint: [0.416, 0.439, 0.471] });
    boxC("concrete", -24.430, 0, 10.080, 0.420, WH, 6.300, { tint: [0.29, 0.314, 0.345] });
    boxC("concrete", -20.230, 0, 8.960, 0.420, WH, 4.060, { tint: [0.29, 0.314, 0.345] });
    boxC("concrete", -27.370, 0, 9.870, 5.600, WH, 0.420, { tint: [0.29, 0.314, 0.345] });
    boxC("paint", -28.630, WH - 0.28, -13.650, 1.680, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -20.230, WH - 0.28, -9.730, 0.900, 0.2, 2.240, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -25.200, WH - 0.28, -1.750, 2.660, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -15.680, WH - 0.28, -7.770, 2.380, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -11.270, WH - 0.28, -10.010, 0.900, 0.2, 2.520, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -15.680, WH - 0.28, -4.270, 2.380, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -6.370, WH - 0.28, -3.150, 2.800, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -1.470, WH - 0.28, -7.035, 0.900, 0.2, 2.450, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -1.470, WH - 0.28, -0.280, 0.900, 0.2, 2.660, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -7.280, WH - 0.28, 2.450, 3.500, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 2.310, WH - 0.28, -6.860, 0.900, 0.2, 2.800, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 2.310, WH - 0.28, 0.140, 0.900, 0.2, 2.800, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 0.420, WH - 0.28, 5.390, 2.100, 0.2, 0.840, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 4.620, WH - 0.28, -10.150, 2.800, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 8.295, WH - 0.28, -3.010, 3.850, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 14.770, WH - 0.28, 0.140, 0.900, 0.2, 2.800, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 7.420, WH - 0.28, 5.390, 4.900, 0.2, 0.840, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 18.830, WH - 0.28, -5.285, 0.900, 0.2, 3.150, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 25.445, WH - 0.28, 2.450, 3.850, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -23.905, WH - 0.28, 6.930, 3.850, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", -16.380, WH - 0.28, 6.930, 3.500, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 0.770, WH - 0.28, 5.530, 5.600, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 9.170, WH - 0.28, 5.530, 5.600, 0.2, 0.560, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("paint", 14.210, WH - 0.28, 10.465, 0.900, 0.2, 3.150, { collide: false, tint: [0.165, 0.333, 0.345] });
    boxC("steel", -6.37, 0, -8.26, 0.5, 1.2, 0.35, { tint: [0.165, 0.333, 0.345] });
    boxC("paint", -6.37, 1.22, -8.26, 0.35, 0.12, 0.08, { collide: false, tint: [0.267, 1.0, 0.8] });
    boxC("steel", 8.47, 0, -6.65, 0.5, 1.2, 0.35, { tint: [0.165, 0.333, 0.345] });
    boxC("paint", 8.47, 1.22, -6.65, 0.35, 0.12, 0.08, { collide: false, tint: [0.267, 1.0, 0.8] });
    boxC("steel", -6.37, 0, -0.35, 0.5, 1.2, 0.35, { tint: [0.165, 0.333, 0.345] });
    boxC("paint", -6.37, 1.22, -0.35, 0.35, 0.12, 0.08, { collide: false, tint: [0.267, 1.0, 0.8] });
    /* Cold fluorescent strips + red warning beacons — dark facility, not daytime */
    const fluo = [
      [-25.2, -7.7, 4.2], [-6.37, -8.26, 3.8], [-6.37, -0.35, 3.8],
      [8.54, -6.58, 4.0], [8.54, 1.12, 3.5], [4.27, 10.64, 5.0],
      [24.78, -3.85, 3.5], [-21.77, 10.08, 3.0], [0.42, -2.45, 2.5],
    ];
    for (const [x, z, len] of fluo) {
      /* emissive strip */
      boxC("paint", x, WH - 0.12, z, len, 0.08, 0.28, { collide: false, tint: [0.75, 0.9, 1.0] });
      const L = new THREE.PointLight(0xb8d4e8, 1.35, 12, 1.6);
      L.position.set(x, WH - 0.35, z); mapAdd(L);
    }
    /* Red warning lights at key junctions */
    const warns = [[-20.2, -7.7], [-6.37, -4.0], [0.42, -2.45], [8.54, -3.0], [4.27, 6.0], [-15.0, -0.9]];
    for (const [x, z] of warns) {
      boxC("paint", x, WH - 0.2, z, 0.18, 0.12, 0.18, { collide: false, tint: [1.0, 0.12, 0.08] });
      const R = new THREE.PointLight(0xff2211, 1.6, 8, 1.8);
      R.position.set(x, WH - 0.4, z); mapAdd(R);
    }
    /* Terminal pedestals A / B / C (dark concrete + teal accent) */
    const TERMS = [
      { id: 'A', x: -6.37, z: -8.26 },
      { id: 'B', x: 8.54, z: -6.58 },
      { id: 'C', x: -6.37, z: -0.35 },
    ];
    window.BO_TERMINALS = TERMS.map((t) => ({ id: t.id, x: t.x, z: t.z }));
    for (const t of TERMS) {
      boxC("steel", t.x, 0, t.z, 0.7, 1.15, 0.55, { tint: [0.12, 0.14, 0.16] });
      boxC("paint", t.x, 1.18, t.z, 0.55, 0.08, 0.4, { collide: false, tint: [0.1, 0.85, 0.75] });
      const TL = new THREE.PointLight(0x33ffcc, 1.1, 5.5, 1.8);
      TL.position.set(t.x, 1.4, t.z); mapAdd(TL);
    }
    /* soft boundary */
    boxC("concrete", 0, 0, 19.5, 68, 2.5, 0.4, { tint: [0.15,0.16,0.18] });
    boxC("concrete", 0, 0, -19.5, 68, 2.5, 0.4, { tint: [0.15,0.16,0.18] });
    boxC("concrete", 33.5, 0, 0, 0.4, 2.5, 40, { tint: [0.15,0.16,0.18] });
    boxC("concrete", -33.5, 0, 0, 0.4, 2.5, 40, { tint: [0.15,0.16,0.18] });
  },
  after() {
    try {
      if (typeof hemi !== "undefined") {
        hemi.intensity = 0.28;
        hemi.color.setHex(0x1a2230);
        hemi.groundColor.setHex(0x080a10);
      }
      if (typeof sun !== "undefined" && sun) sun.intensity = 0.1;
    } catch (e) {}
    /* Plan: spy SPAWN top-left, merc bottom-centre */
    SPAWNS[0] = [[4.27, 10.99], [7.77, 10.99]]; /* mercs = Alpha side (+Z) */
    SPAWNS[1] = [[-29.05, -14.5], [-27.5, -13.8]]; /* spies = Bravo side (top-left SPAWN) */
    window.BLACKOUT_SPAWNS = { merc: SPAWNS[0].slice(), spy: SPAWNS[1].slice() };
  },
};

/* ==========================================================================
   BLACKOUT on Khamsin (pass 5). The 'blackout' map id is a night variant of MAP_DEFS.sable: same level, nav, covers and
   materials (inherited through the prototype), plus a dark atmosphere, three hack terminals, the HACK SPAWN extract and
   BLACKOUT spawns. Every light added here is BAKED (LAMPS): no runtime PointLights, so no shader cost and no recompiles.
   ========================================================================== */
const ATMO_BO_KHAMSIN = Object.assign({}, ATMO_SABLE, {
  // moonlit night: cold low key light, almost no ambient; the lit street lamps and the terminals make the pools
  sun: [-0.35, 0.6, 0.45], sunColor: 0x7d92c8, sunI: 0.3, vmSun: 0x6a7aa0,
  fog: [0.03, 0.035, 0.055], fogD: 0.012, fogSun: 0.08,
  hemi: [0x3a4a74, 0x18141a, 0.42], vmHemi: [0x34426a, 0x100c10],
  sky: Object.assign({}, ATMO_BLACKOUT.sky, {
    zen: [0.006, 0.009, 0.022], mid: [0.018, 0.024, 0.045], hor: [0.045, 0.05, 0.075], gnd: [0.012, 0.012, 0.016],
    glow: [0.06, 0.07, 0.1], halo: [0.1, 0.11, 0.14], disk: [1.4, 1.5, 1.8],
  }),
  envGround: 0x0c0e14, hdri: null,
  lit: true, lamps: 2.6, winLit: 0.3,
  bounce: [0.06, 0.07, 0.09], dust: [0.12, 0.12, 0.13], motes: [0.12, 0.13, 0.16],
  grade: { lo: [0.86, 0.93, 1.1], hi: [1.06, 0.98, 0.9], exp: 1.22 },
  rays: [0.12, 0.14, 0.18], bloom: [0.5, 0.55, 0.9],
});

/* Terminals: [id, x, z, facing x, facing z]. Each stands against a wall, facing the open alley (the side the spy hacks from).
   A: Long (west lane), against the west boundary wall.  B: Main Street, against the west house wall.
   C: Containers (east lane), behind the low wall at x = 25.6.  One per lane, all on the map's middle third. */
const BO_KH_TERMS = [
  ['A', -35.3, 15.0, 1, 0],
  ['B', -5.62, -8.0, 1, 0],
  ['C', 25.22, 7.6, -1, 0],
];
const BO_KH_EXTRACT = { x: 0, z: -36, r: 1.6 }; // HACK SPAWN: north end of Main Street, spy side
// spies start at the north base (Bravo, -z), mercs at the south base (Alpha, +z); cells from Khamsin's own spawn list
const BO_KH_MERC = [[-6, 48.5], [6, 48.5], [-8.5, 43], [8, 43.5]];
const BO_KH_SPY = BO_KH_MERC.map(([x, z]) => [x, -z]);

function boKhamsinBuild() {
  for (const [id, x, z, fx, fz] of BO_KH_TERMS) {
    const rot = Math.atan2(fx, fz);
    // pedestal (solid), a raised back plate with the glowing screen, and a status light on top
    boxC('steel', x, 0, z, 0.7, 1.05, 0.5, { rot, tint: [0.12, 0.14, 0.16] });
    boxC('steel', x - fx * 0.17, 1.05, z - fz * 0.17, 0.66, 0.55, 0.08, { rot, collide: false, tint: [0.1, 0.11, 0.13] });
    boxC('boScreen', x - fx * 0.125, 1.12, z - fz * 0.125, 0.54, 0.4, 0.02, { rot, collide: false });
    boxC('boScreen', x + fx * 0.05, 1.05, z + fz * 0.05, 0.5, 0.012, 0.3, { rot, collide: false }); // keyboard strip
    boxC('boRed', x - fx * 0.17, 1.62, z - fz * 0.17, 0.12, 0.06, 0.06, { rot, collide: false });
    LAMPS.push({ x: x + fx * 0.45, y: 1.9, z: z + fz * 0.45, c: [0.3, 0.9, 0.8], p: 0.2, r: 3.0, down: 0, fixed: 1 });
  }
  // HACK SPAWN extract: red frame on the ground, a beacon post and a red pool of light
  const E = BO_KH_EXTRACT, r = E.r;
  for (const [cx, cz, w, d] of [[E.x, E.z - r, 2 * r, 0.1], [E.x, E.z + r, 2 * r, 0.1], [E.x - r, E.z, 0.1, 2 * r], [E.x + r, E.z, 0.1, 2 * r]])
    boxC('boRed', cx, 0.015, cz, w, 0.012, d, { collide: false });
  boxC('steel', E.x + r + 0.25, 0, E.z, 0.12, 2.2, 0.12, { tint: [0.15, 0.15, 0.17] });
  boxC('boRed', E.x + r + 0.25, 2.2, E.z, 0.2, 0.14, 0.2, { collide: false });
  LAMPS.push({ x: E.x, y: 2.4, z: E.z, c: [1.0, 0.14, 0.1], p: 1.4, r: 5.5, down: 0, fixed: 1 });
}

/* Lights that BLACKOUT switches during play (merc flashlight, spy rim/fill) are created and made visible while the map is built,
   so the shaders are compiled once with them (mapCompile) and the light count never changes in play: only intensity moves. */
function boKhamsinAfter() {
  SPAWNS[0] = BO_KH_MERC.map((p) => p.slice());
  SPAWNS[1] = BO_KH_SPY.map((p) => p.slice());
  window.BLACKOUT_SPAWNS = { merc: SPAWNS[0].slice(), spy: SPAWNS[1].slice() };
  window.BO_TERMINALS = BO_KH_TERMS.map(([id, x, z, fx, fz]) => ({ id, x: x + fx * 0.75, z: z + fz * 0.75, px: x, pz: z }));
  window.BO_EXTRACT = Object.assign({}, BO_KH_EXTRACT);
  try { if (typeof boLightsArm === 'function') boLightsArm(true); } catch (e) { console.warn('boLightsArm', e); }
}

const BO_KH_ZONES = BO_KH_TERMS.map(([id, x, z]) => ['Terminal ' + id, x - 2.5, x + 2.5, z - 2.5, z + 2.5])
  .concat([['HACK SPAWN', -3, 3, -39, -33]]);

MAP_DEFS.blackout = Object.assign(Object.create(MAP_DEFS.sable), {
  atmo: ATMO_BO_KHAMSIN,
  skyPhoto: null, // the dusk photo would light the sky pink: procedural night sky instead
  // night: wind, distant dogs, cloth; no rooster or doves
  sound: Object.assign({}, MAP_DEFS.sable.sound, { spots: MAP_DEFS.sable.sound.spots.filter((s) => !/rooster|dove|donkey/.test(s.id)) }),
  zones: BO_KH_ZONES.concat(MAP_DEFS.sable.zones),
  materials(M) {
    MAP_DEFS.sable.materials(M);
    MAT.boScreen = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.3, 2.4, 1.95) }); MAT.boScreen.userData.noShadow = true;
    MAT.boRed = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.8, 0.2, 0.14) }); MAT.boRed.userData.noShadow = true;
  },
  build() { MAP_DEFS.sable.build(); boKhamsinBuild(); },
  after() { MAP_DEFS.sable.after(); boKhamsinAfter(); },
  unload() { try { if (typeof boLightsArm === 'function') boLightsArm(false); } catch (e) {} if (MAP_DEFS.sable.unload) MAP_DEFS.sable.unload(); },
});

MAPS.push({ id: 'blackout', name: 'Khamsin Night', tag: 'Khamsin · night ops', ok: true, boBase: 'sable',
  desc: 'Khamsin after dark. Spies hack 2 of 3 terminals. Mercs hunt with flashlights.' });
var BO_SPY_SPAWNS = BO_KH_SPY.map((p) => p.slice());
var BO_MERC_SPAWNS = BO_KH_MERC.map((p) => p.slice());
