// The Stormwall · the film: one 84 s take. Picture and sound both read this beat sheet.
// World: +x is east (stormward), the storm travels toward -x. +z is south. Metres.
import * as THREE from 'three';
import { U, G, Q, clamp, lerp, sm, pulse, win, keyed, track, rad } from './core.js';

export const DUR = 84;
// FROZEN beat sheet (seconds)
export const T = {
  OMEN: 8.0,       // the eastern horizon grows dark
  WIND: 14.0,      // the first gusts: the shyest grass goes to ground, dust lifts
  WALL: 21.0,      // the wall stands clear: a curtain of rain under black cloud
  CLOSE: 26.5,     // the air fills with dust and leaves; the rockbuds draw in
  HIT: 32.0,       // the stormwall arrives
  SILENT: 40.6,    // light without thunder
  EASE: 47.0,      // the gusts tire; the lightning stops
  RIDDENS: 54.0,   // the rain only sprinkles
  WAKE: 57.5,      // rockbuds split and send out their vines
  LIFE: 64.0,      // cremlings in the puddles, lifespren over the plants
  CLEAR: 70.0,     // sun; the storm is a smudge on the western horizon
  OUT: 81.0,
};
export const STORM_LEN = 7600;                 // front to trailing edge
// where the stormwall stands (world x). Far off it closes fast, as distant weather seems to; from the hit on it runs at a steady 230 m/s
const frontK = keyed([[0, 30000], [8, 16500], [15, 8200], [21, 4300], [27, 1500], [32, 0], [40, -1840], [50, -5200], [60, -11500], [70, -20500], [DUR + 6, -36000]]);
// its trailing edge passes the lens as the sun comes back
const backK = keyed([[0, 40000], [32, 9000], [50, 5200], [60, 2300], [67.5, 0], [72, -2600], [DUR + 6, -15000]]);
export const backAt = (t) => backK(t);
export const frontAt = (t) => frontK(t);

// lightning: [time, x relative to the lens, y, z, strength, thunder?]. Before the hit the strokes are inside the wall
// (x is then measured from the front); in the fury they land around the lens; afterwards they flicker far to the west.
export const STRIKES = [
  [17.2, 500, 1500, -2600, 0.5, 1], [22.4, 420, 1250, 1500, 0.7, 1], [25.3, 380, 1700, -700, 0.6, 1], [28.3, 320, 900, 600, 0.9, 1], [30.4, 260, 1150, -350, 1.0, 1],
  [33.1, 140, 420, -90, 1.5, 1], [35.6, -160, 380, 210, 1.2, 1], [37.9, 60, 460, 260, 1.4, 1], [40.6, -40, 520, -180, 1.6, 0], [42.7, -260, 400, -120, 1.3, 1], [45.2, -420, 520, 160, 0.9, 1],
  [50.4, 500, 1200, 900, 0.35, 1], [59.0, 700, 1500, -1500, 0.3, 1], [67.5, 700, 1300, 2200, 0.28, 1], [74.5, 700, 1600, -900, 0.22, 1],
];
const env = (d) => d < 0 || d > 0.9 ? 0 : Math.exp(-d / 0.07) + (d > 0.11 ? 0.6 * Math.exp(-(d - 0.11) / 0.05) : 0) + (d > 0.27 ? 0.35 * Math.exp(-(d - 0.27) / 0.09) : 0);
const fp = new THREE.Vector3();
export function flashAt(t, out) {             // returns the envelope; out gets the stroke's world position
  let best = 0, k = -1;
  for (let i = 0; i < STRIKES.length; i++) { const e = env(t - STRIKES[i][0]) * STRIKES[i][4]; if (e > best) { best = e; k = i; } }
  if (k >= 0 && out) { const s = STRIKES[k], inWall = s[0] < T.HIT || s[0] > T.EASE; out.set((inWall ? frontAt(s[0]) + s[1] + (t - s[0]) * -230 : s[1]), s[2], s[3]); }
  return best;
}
export const strikeGround = (i, out) => { const s = STRIKES[i]; return out.set(s[1], 0, s[3]); };

// ---- envelopes (all pure) ----
const h1 = (i) => { const x = Math.sin(i * 127.1 + 3.7) * 43758.5453; return x - Math.floor(x); };
const flick = (t, hz) => { const x = t * hz, i = Math.floor(x), f = x - i; return lerp(h1(i), h1(i + 1), f * f * (3 - 2 * f)); };
const gustK = keyed([[0, 0.10], [T.OMEN, 0.12], [T.WIND, 0.34], [T.WALL, 0.5], [T.CLOSE, 0.8], [T.HIT - 0.6, 1.05], [T.HIT + 0.4, 1.7], [T.HIT + 4, 1.45], [T.EASE - 3, 1.3], [T.EASE + 2, 0.8], [T.RIDDENS, 0.36], [T.WAKE + 2, 0.2], [T.CLEAR, 0.22], [T.OUT, 0.14], [DUR, 0.10]]);
export const gust = (t) => gustK(t) * (0.82 + 0.36 * flick(t, 0.9)) + 0.25 * pulse(t, T.WIND + 0.3, 0.6, 2.4) + 0.3 * pulse(t, T.WALL + 1.5, 0.8, 2.0) + 0.14 * pulse(t, T.CLEAR + 3.4, 1.2, 3.5);
const WN = DUR * 60 + 2, wtab = new Float32Array(WN); for (let i = 1; i < WN; i++) wtab[i] = wtab[i - 1] + (0.7 + 2.6 * gust(i / 60)) / 60;
export const windPhase = (t) => { const x = clamp(t, 0, DUR) * 60, i = Math.min(WN - 2, x | 0); return lerp(wtab[i], wtab[i + 1], x - i); };
export const rain = keyed([[0, 0], [T.HIT - 0.5, 0], [T.HIT + 0.25, 1], [T.EASE - 2, 1], [T.EASE + 3, 0.62], [T.RIDDENS, 0.3], [T.WAKE + 2, 0.16], [T.LIFE + 2, 0.1], [T.CLEAR - 1.5, 0.03], [T.CLEAR + 1, 0], [DUR, 0]]);
export const wet = (t) => sm(T.HIT - 0.2, T.HIT + 2.2, t);
export const dark = keyed([[0, 0], [T.OMEN, 0.02], [T.WIND, 0.16], [T.WALL, 0.34], [T.CLOSE, 0.56], [T.HIT - 0.8, 0.8], [T.HIT + 0.5, 1], [T.EASE, 0.95], [T.RIDDENS, 0.72], [T.WAKE + 2, 0.56], [T.LIFE + 2, 0.4], [T.CLEAR - 1, 0.2], [T.CLEAR + 2.5, 0], [DUR, 0]]);
export const clear = (t) => sm(T.CLEAR - 2, T.CLEAR + 4, t);
// how far the land has woken (0 shut .. 1 open); each plant adds its own delay
export const wake = (t) => sm(T.WAKE - 1, T.WAKE + 9, t);
// how far the land has shut for the storm (0 open as on a calm day .. 1 everything drawn in)
export const shut = (t) => sm(T.WIND, T.HIT - 1.5, t);
export const shake = (t) => 0.5 * pulse(t, T.HIT + 0.15, 0.5, 2.4) + 0.22 * win(t, T.HIT, T.EASE, 0.6, 3) * (0.5 + 0.5 * flick(t, 5)) + (() => { let s = 0; for (const k of STRIKES) if (k[5] && k[0] > T.HIT && k[0] < T.EASE) s += 0.5 * k[4] * pulse(t, k[0] + 0.12, 0.04, 0.6); return s; })();

// ---- the crane: [t, x, y, z, fov, lookx, looky, lookz]. y is height above the ground under the lens ----
const CAM = [
  // 0-8 calm: a hand above the stone among grass, beside a split rockbud, rising to head height
  [0, -11.3, 0.5, 5.5, 44, -5.5, 0.35, 2.4],
  [4, -11.7, 0.7, 5.8, 44, 4, 1.2, 1],
  [8, -12.8, 1.5, 6.4, 44, 70, 8, -6],
  // 8-21: up and back; the horizon darkens, the wall grows
  [14, -15.5, 4.6, 7.6, 42, 300, 46, -10],
  [21, -19, 7.4, 8.4, 38, 900, 250, -20],
  // 21-32: down into the lee of the boulder as it comes, lens tipping up the face of the wall
  [26.5, -16, 4.2, 5.6, 46, 500, 300, -10],
  [30.5, -11.2, 1.9, 3.6, 58, 200, 150, 6],
  [32, -10.0, 1.25, 3.3, 62, 60, 30, 8],
  // 32-47 fury: pinned low behind the stone; the lens turns its back to the wind and watches the storm tear west
  [34.5, -9.9, 1.15, 3.3, 62, 40, 8, 40],
  [38, -10.0, 1.2, 3.4, 60, -10, 6, 60],
  [42, -10.4, 1.3, 3.5, 57, -70, 8, 40],
  [47, -11.2, 1.45, 3.6, 54, -120, 9, 14],
  // 47-57: the rain thins; the crane comes down toward a shut rockbud by a puddle
  [52, -12.6, 1.2, 4.0, 48, -40, 2.4, 9],
  [57, -14.9, 0.5, 6.0, 40, -16.4, 0.2, 7.3],
  // 57-64 wake: close on the bud as it splits
  [61, -15.15, 0.42, 6.2, 36, -16.4, 0.18, 7.3],
  [64.5, -14.8, 0.56, 5.8, 39, -17.0, 0.22, 7.5],
  // 64-70 life: back and up through the rising lights
  [68, -12.4, 1.5, 4.2, 44, -40, 3, 9],
  [72, -10.5, 3.6, 2.6, 46, -200, 26, 14],
  // 70-81 clear: over the wet land, the storm a smudge in the west
  [78, -9.0, 8.5, 1.0, 44, -600, 60, 30],
  [DUR, -8.6, 9.6, 0.6, 43, -700, 64, 34],
];
const cx = track(CAM, 1), cy = track(CAM, 2), cz = track(CAM, 3), cf = track(CAM, 4), lx = track(CAM, 5), ly = track(CAM, 6), lz = track(CAM, 7);
export const fovAt = (t) => cf(t);
let ground = () => 0;
export const setGround = (fn) => { ground = fn; };
export function camAt(t, out) {
  const x = cx(t) + Math.sin(t * 0.21) * 0.06, z = cz(t) + Math.sin(t * 0.17 + 1) * 0.05;
  return out.set(x, ground(x, z) + cy(t) + Math.sin(t * 0.33 + 1) * 0.02, z);
}
export function lookAt(t, out) { const x = lx(t), z = lz(t), near = 1 - sm(25, 90, Math.hypot(x + 12, z - 4)); return out.set(x, ly(t) + (near > 0 ? near * ground(x, z) : 0), z); }

export const post = { fade: 1, exposure: 1, flash: 0, bloom: 0.08, sat: 1, tint: new THREE.Vector3(1, 1, 1), grain: 0.035, lens: 0 };
const P = new THREE.Vector3(), L = new THREE.Vector3(), m = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0), q2 = new THREE.Quaternion(), eu = new THREE.Euler();
const override = Q.get('cam') ? Q.get('cam').split(',').map(Number) : null;
let nx = 0, ny = 0, gentle = false;
export const setGentle = (v) => { gentle = !!v; };      // reduced motion: no shake, no flashes across the whole frame
const SUN = new THREE.Vector3(-0.93, 0.37, 0.27).normalize();     // low in the west-south-west
const c3 = (o, a, b, k) => o.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
const tA = new THREE.Vector3(), tB = new THREE.Vector3();

export function apply(t, camera, look) {
  camAt(t, P); lookAt(t, L);
  if (override) { P.set(override[0], ground(override[0], override[2]) + override[1], override[2]); L.set(override[3], ground(override[3], override[5]) + override[4], override[5]); }
  camera.position.copy(P); m.lookAt(P, L, UP); camera.quaternion.setFromRotationMatrix(m);
  if (look) { nx += (look.tx - nx) * 0.05; ny += (look.ty - ny) * 0.05; }
  const sh = gentle ? 0 : shake(t);
  eu.set(-ny * 0.08 + Math.sin(t * 0.47) * 0.004 + sh * 0.012 * Math.sin(t * 71.3) * Math.sin(t * 13.1 + 1), -nx * 0.12 + Math.sin(t * 0.31 + 2) * 0.005 + sh * 0.010 * Math.sin(t * 63.7 + 2), Math.sin(t * 0.23) * 0.004 + sh * 0.014 * Math.sin(t * 57.1 + 4), 'YXZ');
  camera.quaternion.multiply(q2.setFromEuler(eu));
  camera.position.x += sh * 0.05 * Math.sin(t * 49.0); camera.position.y += sh * 0.05 * Math.sin(t * 61.0 + 1.3);
  // 16:9 keeps the keyed vertical field; taller frames keep the horizontal field instead (up to a wide 96 degrees)
  const base = (override && override[6]) || cf(t), a169 = 16 / 9;
  camera.fov = camera.aspect >= a169 ? base : Math.min(2 * Math.atan(Math.tan(rad(base) / 2) * a169 / camera.aspect) * 180 / Math.PI, Math.max(base, 96));

  // ---- weather ----
  const dk = dark(t), cl = clear(t), rn = rain(t), xf = frontAt(t), wt = wet(t);
  U.uTime.value = t; U.uFront.value = xf; U.uBack.value = backK(t); U.uWall.value = 1;
  U.uRain.value = rn; U.uWet.value = wt; U.uGust.value = gust(t); U.uWindPh.value = windPhase(t); U.uDark.value = dk; U.uClear.value = cl;
  U.uCamPos.value.copy(camera.position); U.uSunDir.value.copy(SUN); U.uGround.value = ground(camera.position.x, camera.position.z);
  const fl = flashAt(t, fp); U.uFlash.value.set(fp.x, fp.y, fp.z, fl);
  // the sun's share at the lens: the storm's shadow runs ahead of the wall, and the sun comes back as the trailing edge clears it
  const sunK = (1 - sm(T.WALL - 3, T.HIT - 1.5, t)) + sm(T.CLEAR - 3, T.CLEAR + 3.5, t);
  const warm = c3(tA, [1.0, 0.86, 0.66], [1.0, 0.80, 0.56], cl);
  U.uSunCol.value.copy(warm).multiplyScalar(sunK);
  // sky: a dry pale day, then storm dark, then a washed deep blue
  c3(tB, [0.16, 0.30, 0.62], [0.10, 0.26, 0.66], cl); U.uSkyZen.value.copy(tB).multiplyScalar(lerp(1, 0.07, dk));
  c3(tB, [0.62, 0.66, 0.68], [0.50, 0.62, 0.78], cl); U.uSkyHor.value.copy(tB).multiplyScalar(lerp(1, 0.10, dk));
  c3(tB, [0.60, 0.63, 0.66], [0.52, 0.62, 0.76], cl); tB.multiplyScalar(lerp(1, 0.085, dk)); U.uFogCol.value.copy(tB);
  // haze: dusty before, thick grey rain in the storm, rinsed afterwards
  U.uFogDen.value = lerp(0.000045, 0.000016, cl) + 0.00005 * sm(T.WIND, T.HIT, t) * (1 - sm(T.HIT, T.HIT + 2, t)) + 0.0075 * rn * rn + 0.0006 * rn;
  // the sheet of rain: silver where daylight still reaches its face, slate once we are under it
  const face = 1 - sm(T.HIT - 1.2, T.HIT + 0.6, t);
  c3(tB, [0.06, 0.068, 0.085], [0.33, 0.355, 0.39], face * (1 - 0.55 * sm(T.WALL, T.HIT - 1, t))); if (t > T.HIT) tB.multiplyScalar(lerp(1, 1.7, sm(T.EASE, T.CLEAR, t))); U.uCurtain.value.copy(tB);

  // ---- lights (set by main from these) ----
  G.sunK = sunK; G.dark = dk; G.clear = cl; G.flash = fl; G.flashPos = fp;

  // ---- grade ----
  post.fade = sm(0.0, 2.2, t) * (1 - sm(T.OUT + 0.4, DUR - 0.2, t));
  post.exposure = lerp(1.0, 1.55, sm(0.2, 0.9, dk)) * (1 + 0.12 * Math.min(fl, 1.6)) * lerp(1, 1.06, cl);
  post.flash = 0.045 * Math.min(fl, 2) * sm(0.5, 1, dk);
  post.bloom = 0.07 + 0.05 * dk + 0.06 * cl + 0.05 * Math.min(fl, 1.5);
  post.sat = lerp(lerp(0.96, 0.62, sm(0.3, 1, dk)), 1.16, cl);
  c3(post.tint, [1.0, 0.99, 0.97], [0.86, 0.94, 1.08], sm(0.2, 1, dk)); if (cl > 0) post.tint.lerp(tA.set(1.03, 1.0, 0.95), cl);
  post.grain = 0.03 + 0.03 * dk;
  post.lens = gentle ? 0 : rn;
  if (gentle) { post.flash = 0; post.exposure = lerp(1.0, 1.55, sm(0.2, 0.9, dk)) * lerp(1, 1.06, cl); G.flash = fl * 0.35; }
}
export const SUN_DIR = SUN;
