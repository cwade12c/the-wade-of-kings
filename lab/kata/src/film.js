// It Knew What to Do · beat sheet, atmosphere, camera choreography, viewpoints, and paused orbit
import * as THREE from 'three';
import { U, G, Q, CAPTURE, clamp, lerp, sm, win, track, rad } from './core.js';

export const DUR = 76;

export const T = {
  POOL: 0.0,       // spear pulled from rainwater pool; the crew jeers
  SNAP: 7.5,       // snaps into guard position; chasm goes silent
  TUKKS: 11.0,     // Tukks: "The first step is to care"
  TIEN: 17.5,      // Tien laughing — shaft of golden sky down the chasm rift
  MOTHER: 24.0,    // his mother teasing him
  BATTLE: 30.5,    // surrounded by enemies, ringed by friends
  FATHER: 38.5,    // his father's sneer: "You could not kill to protect"
  CHASM: 45.5,     // alone beneath the earth, gripping wet wood
  WIND: 51.0,      // him and the wind — graceful full mastery, Syl dancing between sweeps
  FINISH: 61.5,    // razor-sharp snap into one-quarter-haft guard crouch
  PUDDLE: 66.8,    // Moash's glowing spheres plop into the puddle; "Sorry"; Syl perches primly
  OUT: 73.5,
};

// Camera crane: Director's Cut [t, x, y, z, fov, lx, ly, lz], in takes. A take starts at its first key;
// the two snaps are the only cuts.
const CAM_DIRECTOR = [
  [ // The pool: low over the water, rising with the spear as he closes his eyes.
    [0.0,   0.95, 0.42, 1.95, 38, -0.25, 0.06, 0.62],
    [2.2,   0.88, 0.46, 2.05, 38, -0.22, 0.12, 0.58],
    [4.2,   0.40, 0.88, 2.70, 42, -0.05, 0.85, 0.30],
    [6.2,  -0.30, 1.10, 2.95, 44,  0.00, 1.20, 0.05],
    [7.62, -0.42, 1.14, 2.90, 44,  0.02, 1.20, 0.08],
  ],
  [ // Guard snap to the last swing: one take through every memory and the wind.
    [7.62,  1.02, 1.30, 2.25, 40,  0.12, 1.10, 0.10],
    [9.6,   0.92, 1.34, 2.42, 41,  0.10, 1.14, 0.10],
    [11.2,  0.78, 1.44, 2.90, 44,  0.06, 1.32, -0.05],
    [14.5,  0.05, 1.50, 3.30, 46,  0.08, 1.48, -0.25],
    [17.5, -0.72, 1.18, 3.05, 48,  0.04, 1.62, -0.35],
    [20.6, -1.02, 0.92, 2.85, 50,  0.00, 1.86, -0.55],
    [24.0, -0.45, 1.38, 2.80, 46,  0.00, 1.56, -0.25],
    [27.2,  0.55, 1.62, 2.60, 44,  0.05, 1.56, -0.15],
    [30.5,  0.95, 1.50, 3.00, 46,  0.05, 1.46, -0.05],
    [33.2, -0.15, 1.42, 3.45, 50,  0.00, 1.42, -0.20],
    [36.2, -1.15, 1.56, 3.05, 48,  0.00, 1.46, -0.10],
    [38.6, -0.30, 2.05, 3.10, 44,  0.00, 1.40, -0.20],
    [42.2,  0.15, 2.28, 3.20, 42,  0.00, 1.30, -0.20],
    [45.6,  0.30, 1.62, 4.35, 40,  0.00, 1.20, -0.40],
    [49.6,  0.35, 1.32, 5.15, 38,  0.00, 1.16, -0.60],
    [51.2,  0.25, 1.06, 4.55, 48,  0.08, 1.26, 0.00],
    [53.4, -1.55, 0.82, 3.70, 50,  0.10, 1.30, 0.00],
    [55.8, -1.75, 1.45, 1.90, 52,  0.10, 1.40, 0.00],
    [58.0,  0.20, 2.15, 3.75, 52,  0.10, 1.36, 0.00],
    [60.0,  1.60, 0.88, 3.05, 50,  0.10, 1.30, 0.10],
    [61.6,  1.20, 1.00, 3.10, 46,  0.10, 1.22, 0.10],
  ],
  [ // The snap: wide and low on what the kata left in the air, then down to the puddle and the pile.
    [61.6,  0.12, 0.78, 4.45, 46,  0.05, 1.46, 0.00],
    [63.9,  0.10, 0.84, 4.20, 45,  0.05, 1.36, 0.10],
    [66.6,  0.26, 1.00, 4.10, 44,  0.22, 0.52, 1.65],
    [68.6,  0.44, 1.04, 3.95, 44,  0.26, 0.34, 2.05],
    [71.6,  0.10, 1.25, 4.30, 44, -0.40, 0.75, 0.55],
    [DUR,   0.05, 1.32, 4.45, 44, -0.45, 0.90, 0.40],
  ],
];

// Closed Eyes · Kaladin (intimate headspace: closer, chasm walls recede into dark velvet)
const CAM_CLOSED = [
  [0.0,  -0.65, 0.88, 2.38, 46, -0.10, 0.52, 0.45],
  [7.5,   0.78, 1.32, 2.10, 46,  0.08, 1.22, 0.14],
  [16.0,  1.22, 1.40, 2.30, 48,  0.05, 1.30, 0.20],
  [22.0, -1.12, 1.24, 2.15, 48,  0.00, 1.56, 0.06],
  [30.0, -0.82, 1.52, 2.25, 48,  0.00, 1.38, 0.08],
  [36.0,  0.92, 1.66, 2.12, 48,  0.00, 1.52, 0.04],
  [44.0, -0.72, 1.28, 2.28, 44,  0.00, 1.24, 0.12],
  [52.0,  0.86, 1.28, 2.40, 50,  0.00, 1.36, 0.08],
  [58.0, -1.20, 1.34, 2.28, 52,  0.00, 1.44, 0.08],
  [62.5,  0.35, 1.14, 2.32, 46,  0.08, 1.02, 0.22],
  [68.5,  0.42, 1.10, 3.65, 45,  0.16, 0.45, 1.75],
  [DUR,   0.15, 1.28, 3.55, 44, -0.18, 1.05, 0.35],
];

// Bridge Four · Chasm Floor (Teft & Moash's corridor vantage point)
const CAM_OPEN = [
  [0.0,   0.38, 1.38, 5.15, 44,  0.00, 1.02, 0.35],
  [12.0,  0.52, 1.42, 4.95, 44,  0.02, 1.26, 0.20],
  [26.0,  0.18, 1.44, 4.85, 44,  0.00, 1.35, 0.15],
  [38.0, -0.45, 1.40, 4.90, 45,  0.00, 1.36, 0.15],
  [52.0,  0.12, 1.35, 4.75, 46,  0.00, 1.34, 0.15],
  [61.5,  0.32, 1.32, 4.75, 45,  0.06, 1.08, 0.40],
  [68.0,  0.45, 1.25, 4.85, 45,  0.18, 0.48, 1.75],
  [DUR,   0.35, 1.36, 4.90, 44, -0.10, 0.96, 0.60],
];

// World time for loose matter. The guard snap stalls it for a heartbeat ("The chasm became quiet");
// the final snap all but stops it, so flung water hangs in the air, then lets it fall again.
function fxSlope(t) {
  const snap = 1 - 0.86 * sm(T.SNAP + 0.12, T.SNAP + 0.24, t) * (1 - sm(T.SNAP + 0.8, T.SNAP + 2.6, t));
  const fin = 1 - 0.975 * sm(T.FINISH + 0.05, T.FINISH + 0.14, t) * (1 - sm(T.FINISH + 1.7, T.FINISH + 5.2, t));
  return snap * fin;
}
const FX_HZ = 240, FX_N = Math.ceil(DUR * FX_HZ) + 2, FX = new Float32Array(FX_N);
for (let i = 1; i < FX_N; i++) FX[i] = FX[i - 1] + 0.5 * (fxSlope((i - 1) / FX_HZ) + fxSlope(i / FX_HZ)) / FX_HZ;
export function fxTime(t) {
  const x = clamp(t, 0, DUR) * FX_HZ, i = Math.min(FX_N - 2, x | 0);
  return lerp(FX[i], FX[i + 1], x - i);
}

export const fxRate = fxSlope;

// ---- Him and the wind ----
// The breath (49.4) draws everything in; strength surges at BURST; the wind builds on the score's hits to the
// last snap, which stops it dead. RELEASE is when the held water starts to fall back into the pool.
export const BURST = 51.02, RELEASE = 63.35;
const hits = [52.6, 53.8, 55.6, 56.4, 57.2, 58.2, 58.9, 59.5, 60.2];
const galeKeys = track([[50.9, 0], [BURST, 0], [51.25, 1.15], [52.2, 0.72], [54.0, 0.88], [56.4, 1.02], [58.0, 1.14], [61.5, 1.26], [61.6, 1.26]], 1);
export function galeSpd(t) {
  if (t < BURST || t > T.FINISH + 0.1) return 0;
  let k = galeKeys(t);
  for (const h of hits) k += 0.28 * (t < h ? sm(h - 0.12, h, t) : Math.exp(-(t - h) * 3.2));
  return k * (1 - sm(T.FINISH + 0.02, T.FINISH + 0.1, t));
}
const visKeys = track([[BURST, 0], [51.3, 0.42], [53.0, 0.5], [56.0, 0.62], [58.0, 0.7], [66.4, 0.7], [67.4, 0.0]], 1);
export const galeVis = (t) => (t < BURST ? 0 : t > 67.4 ? 0 : visKeys(t));
const lensKeys = track([[BURST, 0], [51.2, 0.42], [52.6, 0.14], [55.0, 0.22], [58.0, 0.32], [61.5, 0.4], [66.4, 0.36], [67.4, 0]], 1);
export const lensVis = (t) => (t < BURST ? 0 : t > 67.4 ? 0 : lensKeys(t));
export const inhale = (t) => sm(49.3, 50.95, t) * (1 - sm(50.98, 51.06, t));
export const burst = (t) => (t < BURST ? 0 : Math.exp(-(t - BURST) * 2.2));
// Wind phases, integrated on the world's clock so they stop when it does.
const WP_HZ = 240, WP_N = Math.ceil(DUR * WP_HZ) + 2, WPT = new Float32Array(WP_N), LPT = new Float32Array(WP_N);
for (let i = 1; i < WP_N; i++) {
  const t0 = (i - 1) / WP_HZ, t1 = i / WP_HZ;
  const a = galeSpd(t0) * fxSlope(t0), b = galeSpd(t1) * fxSlope(t1);
  WPT[i] = WPT[i - 1] + 0.5 * (a + b) / WP_HZ;
  LPT[i] = LPT[i - 1] + 0.5 * (a + b) / WP_HZ * 0.6;
}
const tabAt = (tab, t) => { const x = clamp(t, 0, DUR) * WP_HZ, i = Math.min(WP_N - 2, x | 0); return lerp(tab[i], tab[i + 1], x - i); };
export const windPhase = (t) => tabAt(WPT, t);
// When the held water lands: rain on the pool from the lowest drops to the highest.
const FX_REL = fxTime(RELEASE);
function landAt(h) { for (let t = RELEASE; t < DUR; t += 1 / 60) if (4.9 * Math.pow(fxTime(t) - FX_REL, 2) >= h) return t; return DUR; }
const RAIN_A = landAt(0.25), RAIN_B = landAt(3.2);
export const rainOnPool = (t) => sm(RAIN_A - 0.15, RAIN_A + 0.35, t) * (1 - sm(RAIN_B - 0.4, RAIN_B + 0.6, t));

function compileTake(rows) {
  return {
    t0: rows[0][0],
    cx: track(rows, 1), cy: track(rows, 2), cz: track(rows, 3), cf: track(rows, 4),
    lx: track(rows, 5), ly: track(rows, 6), lz: track(rows, 7),
  };
}
function compileCam(rows) {
  const takes = (Array.isArray(rows[0][0]) ? rows : [rows]).map(compileTake);
  const at = (t) => { let k = takes[0]; for (const tk of takes) if (t >= tk.t0) k = tk; return k; };
  const f = (key) => (t) => at(t)[key](t);
  return { cx: f('cx'), cy: f('cy'), cz: f('cz'), cf: f('cf'), lx: f('lx'), ly: f('ly'), lz: f('lz') };
}
const CAMS = { director: compileCam(CAM_DIRECTOR), closed: compileCam(CAM_CLOSED), open: compileCam(CAM_OPEN) };

// Camera position and target on a view's crane at time t (no orbit, no handheld drift).
export function camPose(view, t, P, Lk) {
  const c = CAMS[view] || CAMS.director;
  P.set(c.cx(t), c.cy(t), c.cz(t));
  Lk.set(c.lx(t), c.ly(t), c.lz(t));
  return c.cf(t);
}

export function moodAt(t) {
  const wTukks  = win(t, T.TUKKS - 0.5,  T.TIEN + 0.6,   0.9, 1.0);
  const wTien   = win(t, T.TIEN - 0.5,   T.MOTHER + 0.6, 0.9, 1.0);
  const wMother = win(t, T.MOTHER - 0.5, T.BATTLE + 0.6, 0.9, 1.0);
  const wBattle = win(t, T.BATTLE - 0.5, T.FATHER + 0.5, 0.7, 0.8);
  const wFather = win(t, T.FATHER - 0.4, T.CHASM + 0.6,  0.8, 1.0);
  const wWind   = win(t, T.WIND - 0.5,   T.FINISH + 1.0, 0.8, 1.4);

  let r = 0.06, g = 0.10, b = 0.13, memMix = 0;
  if (wTukks > 0)  { r = lerp(r, 0.96, wTukks); g = lerp(g, 0.62, wTukks); b = lerp(b, 0.22, wTukks); memMix = Math.max(memMix, wTukks * 0.72); }
  if (wTien > 0)   { r = lerp(r, 1.00, wTien);  g = lerp(g, 0.86, wTien);  b = lerp(b, 0.48, wTien);  memMix = Math.max(memMix, wTien * 0.84); }
  if (wMother > 0) { r = lerp(r, 0.96, wMother); g = lerp(g, 0.50, wMother); b = lerp(b, 0.34, wMother); memMix = Math.max(memMix, wMother * 0.70); }
  if (wBattle > 0) { r = lerp(r, 0.44, wBattle); g = lerp(g, 0.64, wBattle); b = lerp(b, 0.95, wBattle); memMix = Math.max(memMix, wBattle * 0.65); }
  if (wFather > 0) { r = lerp(r, 0.26, wFather); g = lerp(g, 0.36, wFather); b = lerp(b, 0.48, wFather); memMix = Math.max(memMix, wFather * 0.82); }
  if (wWind > 0)   { r = lerp(r, 0.42, wWind);   g = lerp(g, 0.80, wWind);   b = lerp(b, 1.00, wWind);   memMix = Math.max(memMix, wWind * 0.86); }
  return { r, g, b, memMix, wTukks, wTien, wMother, wBattle, wFather, wWind };
}

export const post = {
  fade: 1, exposure: 1.12, bloom: 0.74, sat: 1.04, grain: 0.024, vig: 0.64,
  tint: new THREE.Vector3(1, 1, 1),
  bleed: 0, run: 0, flash: 0, freeze: 0, ca: 0, rush: 0, bleedCol: new THREE.Vector3(1, 0.8, 0.5),
};

export const orbit = { yaw: 0, pitch: 0, dist: 0, active: false };
export function resetOrbit() { orbit.yaw = 0; orbit.pitch = 0; orbit.dist = 0; orbit.active = false; }

let gentle = false;
export const setGentle = (v) => { gentle = !!v; };

const P = new THREE.Vector3(), L = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(), _off = new THREE.Vector3();
const _c = new THREE.Color(), _cTmp = new THREE.Color();
const override = Q.get('cam') ? Q.get('cam').split(',').map(Number) : null;
let nx = 0, ny = 0;

export function apply(t, camera, look) {
  const view = G.view || 'director';
  const cam = CAMS[view] || CAMS.director;

  P.set(cam.cx(t), cam.cy(t), cam.cz(t));
  L.set(cam.lx(t), cam.ly(t), cam.lz(t));

  if (!CAPTURE && !gentle) {
    P.x += Math.sin(t * 0.37) * 0.032;
    P.y += Math.sin(t * 0.53 + 1.1) * 0.020;
  }

  if (orbit.active || Math.abs(orbit.yaw) > 1e-4 || Math.abs(orbit.pitch) > 1e-4 || Math.abs(orbit.dist) > 1e-4) {
    _off.subVectors(P, L);
    const r0 = Math.max(1.2, _off.length() + orbit.dist);
    const theta0 = Math.atan2(_off.x, _off.z);
    const phi0 = Math.acos(clamp(_off.y / Math.max(0.001, _off.length()), -0.95, 0.95));
    const theta = theta0 + orbit.yaw;
    const phi = clamp(phi0 + orbit.pitch, 0.22, Math.PI * 0.52);
    P.set(
      L.x + r0 * Math.sin(phi) * Math.sin(theta),
      Math.max(0.28, L.y + r0 * Math.cos(phi)),
      L.z + r0 * Math.sin(phi) * Math.cos(theta)
    );
  }

  if (override) {
    P.set(override[0], override[1], override[2]);
    L.set(override[3], override[4], override[5]);
  }

  // The wind shakes the lens; strength surging kicks it back.
  const gsh = gentle ? 0 : galeSpd(t) * 0.75 + burst(t) * 1.6;
  if (gsh > 0.001) {
    P.x += (Math.sin(t * 31.0) * 0.6 + Math.sin(t * 47.3 + 1.2) * 0.4) * 0.010 * gsh;
    P.y += (Math.sin(t * 37.7 + 0.5) * 0.6 + Math.sin(t * 53.1) * 0.4) * 0.008 * gsh;
  }
  camera.position.copy(P);
  {
    const kc = U.uKataC.value, dx = P.x - kc.x, dz = (P.z - kc.z) / 1.32;
    const lw = U.uLensWind.value.set(-dz, 0.08, dx * 1.32);
    if (lw.lengthSq() < 1e-6) lw.set(1, 0, 0);
    lw.normalize();
  }
  _m.lookAt(P, L, UP);
  camera.quaternion.setFromRotationMatrix(_m);

  if (look && !orbit.active && !CAPTURE && !gentle) {
    nx += (look.tx - nx) * 0.06;
    ny += (look.ty - ny) * 0.06;
    _eu.set(-ny * 0.055, -nx * 0.085, 0, 'YXZ');
    camera.quaternion.multiply(_q2.setFromEuler(_eu));
  }

  const baseFov = ((override && override[6]) || cam.cf(t)) + burst(t) * 7.0;
  const a169 = 16 / 9;
  camera.fov = camera.aspect >= a169
    ? baseFov
    : Math.min(2 * Math.atan(Math.tan(rad(baseFov) / 2) * a169 / camera.aspect) * 180 / Math.PI, Math.max(baseFov, 82));

  const mood = moodAt(t);
  U.uTime.value = t;
  const ft = fxTime(t);
  U.uFxTime.value = ft;
  U.uStrokeView.value = view === 'open' ? 0.55 : view === 'closed' ? 1.15 : 1.0;
  const gs = galeSpd(t);
  U.uGaleSpd.value = gs;
  U.uGaleVis.value = galeVis(t);
  U.uGaleView.value = view === 'open' ? 0.38 : 1.0;
  U.uFxRate.value = fxSlope(t);
  U.uFxRel.value = FX_REL;
  U.uBurstT.value = fxTime(BURST);
  U.uWindPh.value = windPhase(t);
  U.uLensPh.value = tabAt(LPT, t);
  U.uLens.value = view === 'open' ? 0 : lensVis(t);
  U.uBurst.value = burst(t);
  U.uInhale.value = inhale(t);
  U.uRain.value = rainOnPool(t);
  U.uStrokeHold.value = sm(T.FINISH, T.FINISH + 0.08, t) * (1 - sm(T.FINISH + 1.9, T.FINISH + 4.8, t));
  U.uCamPos.value.copy(camera.position);

  const flick = 0.88 + 0.09 * Math.sin(ft * 9.7) + 0.06 * Math.sin(ft * 23.1 + 1.4) + 0.04 * Math.cos(ft * 37.3);
  U.uTorchFlick.value = gentle ? 0.96 : flick * (1 - 0.22 * Math.min(1, galeSpd(t)) * (0.5 + 0.5 * Math.sin(ft * 17.3)));

  let wallDim = 0;
  if (view === 'closed') {
    wallDim = sm(T.SNAP - 0.2, T.SNAP + 1.0, t) * (1 - sm(T.PUDDLE - 1.2, T.PUDDLE + 1.5, t) * 0.65) * 0.84;
  } else if (view === 'director') {
    wallDim = sm(T.SNAP + 0.1, T.TUKKS + 1.2, t) * (1 - sm(T.FINISH + 0.9, T.FINISH + 3.2, t)) * 0.62;
  }
  U.uWallDim.value = wallDim;

  const memScale = view === 'open' ? 0.30 : view === 'closed' ? 1.15 : 0.82;
  U.uMemCol.value.set(mood.r, mood.g, mood.b);
  U.uMemMix.value = mood.memMix * memScale;
  U.uRiftSun.value = 0.18 + mood.wTien * (view === 'open' ? 0.40 : 0.94);
  U.uWindVortex.value = mood.wWind;

  const windRise = sm(T.TUKKS, T.BATTLE, t) * 0.42 + mood.wWind * 1.24 + sm(T.FINISH, T.FINISH + 0.8, t) * (1 - sm(T.OUT, DUR, t)) * 0.78;
  const sylViewMult = view === 'closed' ? 0.42 : view === 'open' ? 1.30 : 1.04;
  U.uSylGlow.value = clamp(windRise * sylViewMult, 0.06, 1.55);

  U.uPuddleGlow.value = sm(67.35, 68.4, t) * (1 - sm(T.OUT + 0.5, DUR, t));

  const fgR = lerp(0.015, mood.r * 0.095, U.uMemMix.value * 0.55);
  const fgG = lerp(0.023, mood.g * 0.098, U.uMemMix.value * 0.55);
  const fgB = lerp(0.032, mood.b * 0.125, U.uMemMix.value * 0.55);
  U.uFogCol.value.set(fgR, fgG, fgB);
  U.uFogDen.value = lerp(0.042, 0.088, wallDim);

  post.fade = sm(0.0, 1.4, t) * (1 - sm(T.OUT, DUR - 0.15, t));
  post.exposure = 1.14 + mood.wTien * 0.14 + mood.wWind * 0.14 - mood.wFather * 0.14 + U.uPuddleGlow.value * 0.08;
  post.bloom = 0.66 + mood.wWind * 0.34 + U.uPuddleGlow.value * 0.22;
  post.sat = lerp(1.08, 0.30, mood.wFather * (view === 'open' ? 0.45 : 0.92)) + mood.wWind * 0.10;
  post.grain = 0.022 + wallDim * 0.010;
  post.vig = 0.62 + wallDim * 0.22;

  _c.setRGB(1.0, 0.99, 0.97);
  if (mood.wFather > 0.01) _c.lerp(_cTmp.setRGB(0.84, 0.92, 1.04), mood.wFather * 0.55);
  else if (mood.wTukks + mood.wTien + mood.wMother > 0.01) {
    _c.lerp(_cTmp.setRGB(1.06, 0.98, 0.88), clamp(mood.wTukks + mood.wTien + mood.wMother, 0, 1) * 0.35);
  } else if (mood.wWind > 0.01) {
    _c.lerp(_cTmp.setRGB(0.92, 0.98, 1.06), mood.wWind * 0.35);
  }
  post.tint.set(_c.r, _c.g, _c.b);

  // Memories bleed in from the frame's edges; the wind's comes as blue-white air.
  const bleedView = view === 'open' ? 0.0 : view === 'closed' ? 1.25 : 0.9;
  const mem = mood.wTukks * 0.6 + mood.wTien * 1.0 + mood.wMother * 0.8 + mood.wBattle * 0.5 + mood.wFather * 0.7 + mood.wWind * 0.3;
  post.bleed = 0;
  U.uBokeh.value = view === 'open' ? 0.45 : view === 'closed' ? 1.2 : 1.0;
  post.bleedCol.set(lerp(mood.r, 0.62, mood.wWind) * 1.25, lerp(mood.g, 0.86, mood.wWind) * 1.2, lerp(mood.b, 1.15, mood.wWind) * 1.1);
  post.run = mood.wFather;
  // The two snaps land as a flash; the last one stops the world.
  const hit = (at, k) => (t >= at ? Math.exp(-(t - at) * k) : 0);
  post.flash = (hit(7.66, 9) * 0.45 + hit(BURST, 5) * 0.55 + hit(61.6, 6) * 0.85) * (gentle ? 0.3 : 1);
  post.ca = hit(7.66, 6) + hit(BURST, 3) * 1.2 + hit(61.6, 3.5) + galeSpd(t) * 0.35;
  post.rush = gentle || view === 'open' ? 0 : clamp(galeSpd(t) * 0.22 + burst(t) * 0.8, 0, 1.0);
  post.freeze = sm(T.FINISH + 0.04, T.FINISH + 0.2, t) * (1 - sm(T.FINISH + 1.6, T.FINISH + 4.6, t));
  U.uFreeze.value = post.freeze;
  G.mood = mood;
}
