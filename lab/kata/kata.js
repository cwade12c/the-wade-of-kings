// Kata · proof of concept. One figure, one spear, one chasm floor, from Chapter 27.
// Every frame is a pure function of the clock t: pose, trails, droplets, light and camera are all worked out from t alone.
// World: metres, +Y up. The chasm runs along Z. At body yaw 0 the figure faces +Z and his right hand is toward -X.
// Yaw is in degrees, positive turns LEFT (counter-clockwise seen from above).
(function () {
'use strict';
const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture');
const TIER = Q.has('tier') ? +Q.get('tier') : (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 600 ? 1 : 0);
const V3 = THREE.Vector3, QT = THREE.Quaternion;
const TAU = Math.PI * 2, R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const win = (t, a, b, up = 0.4, dn = 0.5) => sm(a, a + up, t) * (1 - sm(b - dn, b, t));

// monotone cubic through keys: no overshoot, so a held pose holds
function mono(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  if (n === 1) return () => ys[0];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  // ends are holds: a pose starts and finishes at rest
  m[0] = 0; m[n - 1] = 0;
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const i = lo, h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}
// a channel table: rows [t, v1, v2, ...]; a row may leave a channel undefined to skip a key for that channel
function table(rows) {
  const n = Math.max(...rows.map((r) => r.length)), fns = [];
  for (let c = 1; c < n; c++) {
    const xs = [], ys = [];
    let last;
    for (const r of rows) if (r[c] !== undefined && r[c] !== null) { xs.push(r[0]); ys.push(r[c]); last = r[c]; }
    fns.push(mono(xs, ys));
  }
  return (t) => fns.map((f) => f(t));
}
const h1 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vn = (x) => { const i = Math.floor(x), f = x - i; return lerp(h1(i), h1(i + 1), f * f * (3 - 2 * f)); };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash2 = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
function vnoise(x, y, p = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a) => p ? ((a % p) + p) % p : a;
  return lerp(lerp(hash2(w(xi), w(yi)), hash2(w(xi + 1), w(yi)), u), lerp(hash2(w(xi), w(yi + 1)), hash2(w(xi + 1), w(yi + 1)), u), v);
}
function fbm(x, y, oct = 5, p = 0) { let a = 0.5, s = 0, n = 0, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, p ? p * f : 0); n += a; a *= 0.5; f *= 2; } return s / n; }

// ============================================================ the beat sheet (seconds)
const DUR = 22;
const T = { RUB: 0, SNAP: 3.05, HOLD: 3.35, KATA: 4.8, STANCE: 16.25, BREATH: 16.6, DOWN: 19.6, END: 21.2 };

// ============================================================ the body (metres)
const B = { thigh: 0.45, shin: 0.44, ankle: 0.085, upper: 0.30, fore: 0.33, hipW: 0.10, hipD: 0.065, spine: 0.47, shW: 0.185 };
const REACH = B.upper + B.fore;
const LEN = 2.36, BLADE = 2.13;   // spear: butt at shaft coordinate 0, blade from 2.13 to the tip at 2.36

// ---- stances: where the feet stand, in the stance's own frame [x right, z forward, toe yaw]
const KIND = {
  nat:   { L: [-0.13, 0.00, 8],   R: [0.13, 0.00, -8] },
  lf:    { L: [-0.15, 0.40, 2],   R: [0.17, -0.40, -42] },   // long stance, left foot forward
  rf:    { L: [-0.17, -0.40, 42], R: [0.15, 0.40, -2] },
  lb:    { L: [-0.07, 0.34, 0],   R: [0.12, -0.30, -78] },   // back stance, left foot forward
  horse: { L: [-0.40, 0.00, 22],  R: [0.40, 0.00, -22] },
};
// [time the move lands, centre x, centre z, facing, kind, step duration]
const STANCES = [
  [0.00, 0, 0.00, 0, 'nat'],
  [3.25, 0, 0.05, 0, 'lf', 0.22],
  [5.55, 0, 0.45, 0, 'rf', 0.36],
  [6.25, 0, 0.95, 0, 'lf', 0.28],
  [6.92, 0, 1.30, 0, 'lf', 0.2],
  [8.30, 0, 1.30, 180, 'rf', 0.5],
  [9.00, 0, 1.30, 180, 'horse', 0.3],
  [11.95, 0, 1.55, 180, 'lb', 0.3],
  [13.95, 0, 1.05, 180, 'lf', 0.22],
  [14.95, 0, 1.05, 335, 'horse', 0.3],
  [15.45, 0, 1.05, 515, 'lf', 0.32],
  [19.95, 0, 1.05, 515, 'nat', 0.45],
];
// pelvis, chest and head: [t, weight (0 on left foot .. 1 on right), pelvis yaw, pelvis height, chest twist, lean fwd, lean right, head yaw, head pitch]
const ROOT = table([
  [0.00, 0.50, 0, 0.98, 0, 5, 0, 0, -20],
  [2.30, 0.50, 0, 0.98, 0, 4, 0, 0, -6],
  [2.90, 0.50, 0, 0.95, 0, 6, 0, 0, -6],
  [3.30, 0.45, -28, 0.85, -6, 9, 0, 22, -4],
  [4.80, 0.45, -28, 0.85, -6, 9, 0, 22, -4],
  [5.55, 0.55, 18, 0.86, 8, 8, 0, -10, -2],
  [6.25, 0.45, -26, 0.83, -4, 11, 0, 20, -2],
  [6.40, 0.35, -26, 0.82, 4, 14, 0, 20, 0],
  [6.62, 0.45, -26, 0.83, -4, 11, 0, 20, -2],
  [6.92, 0.30, -26, 0.79, 6, 18, 0, 20, 0],
  [7.30, 0.45, -26, 0.82, -4, 11, 0, 20, -2],
  [7.60, 0.50, -10, 0.70, 10, 26, 0, 0, -16],
  [8.30, 0.50, 160, 0.70, -20, 26, 0, 0, -16],
  [9.00, 0.50, 180, 0.92, 0, 2, 0, 0, 8],
  [10.30, 0.50, 180, 0.92, 0, 2, 0, 0, 8],
  [10.60, 0.50, 180, 0.90, 0, 6, 0, 0, -6],
  [11.50, 0.50, 180, 0.88, 0, 5, 0, 0, -4],
  [11.95, 0.62, 152, 0.84, -6, 6, 0, 26, -2],
  [12.60, 0.50, 152, 0.84, -4, 8, 0, 26, -2],
  [12.85, 0.42, 152, 0.84, 6, 10, 0, 26, 6],
  [13.10, 0.50, 152, 0.84, -4, 8, 0, 26, -2],
  [13.35, 0.62, 152, 0.84, -30, 2, 0, -55, -2],
  [13.62, 0.50, 152, 0.84, -4, 8, 0, 26, -2],
  [13.95, 0.30, 154, 0.78, 6, 17, 0, 20, 0],
  [14.40, 0.50, 154, 0.85, 0, 8, 0, 20, -2],
  [15.45, 0.45, 514, 0.84, 0, 9, 0, 20, -2],
  [16.25, 0.45, 512, 0.84, -6, 9, 0, 22, -4],
  [19.60, 0.45, 512, 0.84, -6, 9, 0, 22, -4],
  [20.40, 0.50, 540, 0.98, 0, 3, 0, 0, -10],
  [22.00, 0.50, 540, 0.98, 0, 3, 0, 0, -10],
]);
// the spear, in the pelvis's ground frame: [t, cx right, cy height, cz forward, yaw, pitch, shaft coord of c, spin, spin-axis yaw, spin-axis pitch, right grip, left grip, right holds, left holds]
// c is a point on the shaft (usually under the right hand); spin turns the spear about the axis through c.
const GUARD = [-0.02, -0.12, 0.05, 30, -33, 0.62];   // in the right shoulder's frame (last column 1)
const SPEAR = table([
  [0.00, 0.26, 0.98, 0.30, 72, -4, 0.90, 0, -90, 0, 0.90, 1.30, 1, 1, 0],
  [0.80, , , , , , , , , , , 1.48],
  [1.60, , , , , , , , , , , 1.30],
  [2.40, 0.26, 0.98, 0.30, 72, -4, 0.90, 0, -90, 0, 0.90, 1.48, 1, 1],
  [2.95, 0.26, 0.94, 0.28, 70, -6, 0.90, 0, -90, 0, 0.90, 1.40, 1, 1, 0],
  [3.12, , , , , , , , , , , , 1, 0],
  [3.32, ...GUARD, 0, -90, 0, 0.74, 1.15, 1, 1, 1],
  [4.80, ...GUARD, 0, -90, 0, 0.74, 1.15, 1, 1, 1],
  [4.98, 0.32, 1.32, 0.26, 20, -40, 1.10, 0, -90, 0, 1.10, 1.32, 1, 0, 0],
  [5.10, , , , , , , 0],
  [5.80, 0.30, 1.30, 0.28, -2, -20, 1.10, 360, -90, 0, 1.10, 1.32, 1, 0],
  [6.00, 0.16, 1.02, 0.12, 8, -4, 0.55, 360, -90, 0, 0.55, 1.20, 1, 1],
  [6.25, 0.16, 1.02, 0.12, 8, -4, 0.55, 360, -90, 0, 0.55, 1.20, 1, 1],
  [6.40, 0.14, 1.08, 0.58, 8, -2, 0.55, 360, -90, 0, 0.55, 0.80, 1, 1],
  [6.62, 0.16, 1.02, 0.12, 8, -4, 0.55, 360, -90, 0, 0.55, 1.20, 1, 1],
  [6.92, 0.14, 1.06, 0.72, 8, -3, 0.55, 360, -90, 0, 0.55, 0.65, 1, 1],
  [7.30, 0.16, 1.02, 0.12, 8, -4, 0.55, 360, -90, 0, 0.55, 1.20, 1, 1],
  [7.60, 0.30, 0.62, 0.42, -60, -6, 0.60, 360, -90, 0, 0.60, 1.20, 1, 1],
  [8.30, 0.30, 0.60, 0.42, 70, -5, 0.60, 360, -90, 0, 0.60, 1.20, 1, 1],
  [8.85, 0.12, 1.85, 0.06, 90, 0, 1.18, 360, 0, 90, 1.18, 1.40, 1, 0],
  [9.10, 0.10, 2.02, 0.05, 90, 0, 1.18, 360, 0, 90, 1.18, 1.40, 1, 0],
  [10.20, 0.10, 2.02, 0.05, 90, 0, 1.18, 1080, 0, 90, 1.18, 1.40, 1, 0],
  [10.55, 0.00, 1.50, -0.13, 90, 0, 1.18, 1080, 0, 90, 0.78, 1.58, 1, 1],
  [10.90, 0.00, 1.50, -0.13, 90, 0, 1.18, 1080, 0, 90, 0.78, 1.58, 1, 1],
  [11.00, , , , , , , 1080, , , , , 0, 0],
  [11.50, 0.00, 1.50, -0.13, 90, 0, 1.18, 1440, 0, 90, 0.78, 1.58, 0, 0],
  [11.62, 0.36, 1.28, 0.22, 20, -10, 1.18, 1440, 0, 90, 1.18, 1.58, 1, 0],
  [11.66, , , , , , , 1440, -90, 0],
  [11.75, 0.38, 1.24, 0.24, 0, -20, 1.18, 1440, -90, 0, 1.18, 1.58, 1, 0],
  [12.45, 0.38, 1.24, 0.24, 0, -20, 1.18, 2160, -90, 0, 1.18, 1.58, 1, 0],
  [12.62, 0.16, 1.04, 0.12, 8, -2, 0.55, 2160, -90, 0, 0.55, 1.20, 1, 1],
  [12.85, 0.12, 1.36, 0.52, 8, 14, 0.55, 2160, -90, 0, 0.55, 0.82, 1, 1],
  [13.10, 0.16, 1.04, 0.12, 8, -2, 0.55, 2160, -90, 0, 0.55, 1.20, 1, 1],
  [13.35, 0.12, 1.08, -0.22, 8, -4, 0.55, 2160, -90, 0, 0.55, 1.10, 1, 1],
  [13.62, 0.16, 1.04, 0.12, 8, -2, 0.55, 2160, -90, 0, 0.55, 1.20, 1, 1],
  [13.95, 0.12, 1.00, 0.66, 8, -6, 0.55, 2160, -90, 0, 0.55, 0.66, 1, 1],
  [14.40, 0.30, 1.24, 0.26, -20, 0, 0.70, 2160, -90, 0, 0.70, 1.30, 1, 1],
  [15.45, 0.30, 1.22, 0.26, -20, 0, 0.70, 2160, -90, 0, 0.70, 1.30, 1, 1, 0],
  [16.25, ...GUARD, 2160, -90, 0, 0.74, 1.15, 1, 1, 1],
  [19.60, ...GUARD, 2160, -90, 0, 0.74, 1.15, 1, 1, 1],
  [20.40, 0.28, 1.00, 0.10, -4, 80, 0.95, 2160, -90, 0, 0.95, 1.40, 1, 0, 0],
  [22.00, 0.28, 1.00, 0.10, -4, 80, 0.95, 2160, -90, 0, 0.95, 1.40, 1, 0, 0],
]);

// feet: each foot is planted until it lifts for its next stance, then lands on time
function buildFeet() {
  const plants = { L: [], R: [] };
  for (const row of STANCES) {
    const [t, cx, cz, dir, kind, dur = 0.28] = row, a = dir * R;
    const f = [Math.sin(a), Math.cos(a)], r = [-Math.cos(a), Math.sin(a)];
    for (const s of ['L', 'R']) {
      const [xr, zf, ty] = KIND[kind][s];
      const p = { t, dur, x: cx + r[0] * xr + f[0] * zf, z: cz + r[1] * xr + f[1] * zf, yaw: dir + ty };
      const list = plants[s], prev = list[list.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.z - prev.z) > 0.02 || Math.abs(p.yaw - prev.yaw) > 4) list.push(p);
    }
  }
  return plants;
}
const PLANTS = buildFeet();
function footAt(list, t) {
  let i = 0; while (i < list.length - 1 && t >= list[i + 1].t - list[i + 1].dur) i++;
  const a = list[i];
  if (i === list.length - 1 || t < list[i + 1].t - list[i + 1].dur) return { x: a.x, z: a.z, yaw: a.yaw, lift: 0 };
  const b = list[i + 1], u = clamp((t - (b.t - b.dur)) / b.dur), e = u * u * (3 - 2 * u);
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: lerp(a.x, b.x, e), z: lerp(a.z, b.z, e), yaw: lerp(a.yaw, b.yaw, e), lift: Math.sin(Math.PI * u) * Math.min(0.11, 0.03 + dist * 0.18) };
}

// ============================================================ solving the pose
const Y = new V3(0, 1, 0);
const L = (xr, y, zf) => new V3(-xr, y, zf);                       // body frame: x right, y up, z forward
const dirLocal = (yaw, pitch) => new V3(Math.sin(yaw * R) * Math.cos(pitch * R), Math.sin(pitch * R), Math.cos(yaw * R) * Math.cos(pitch * R));
function ik(S, Tg, a, b, pole, elbow, end) {
  const d = new V3().subVectors(Tg, S), len = d.length();
  const Lc = clamp(len, Math.abs(a - b) + 1e-3, a + b - 1e-4);
  d.divideScalar(len || 1);
  const x = (a * a - b * b + Lc * Lc) / (2 * Lc), h = Math.sqrt(Math.max(0, a * a - x * x));
  const n = pole.clone().addScaledVector(d, -pole.dot(d)); if (n.lengthSq() < 1e-8) n.set(0, -1, 0); n.normalize();
  elbow.copy(S).addScaledVector(d, x).addScaledVector(n, h);
  end.copy(S).addScaledVector(d, Lc);
}
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return lerp(b, a, h) - k * h * (1 - h); };

// the torso and spear without the limbs: enough for the spear's tip at any moment (trails need many moments)
function core(t) {
  const r = ROOT(t);
  const fl = footAt(PLANTS.L, t), fr = footAt(PLANTS.R, t);
  const yaw = r[1];
  const qYaw = new QT().setFromAxisAngle(Y, yaw * R);
  const px = lerp(fl.x, fr.x, r[0]), pz = lerp(fl.z, fr.z, r[0]);
  // breathing and the shiver after the last form
  const breath = win(t, T.BREATH, T.DOWN + 0.4, 0.5, 0.6) * Math.sin((t - T.BREATH) * TAU / 2.6) * 0.012;
  const shiver = win(t, T.BREATH + 0.3, T.DOWN, 0.3, 0.6) * (vn(t * 31) - 0.5) * 0.006;
  const qP = new QT().setFromEuler(new THREE.Euler(r[4] * 0.35 * R, yaw * R, r[5] * 0.5 * R, 'YXZ'));
  const qC = new QT().setFromEuler(new THREE.Euler((r[4] + shiver * 60) * R, (yaw + r[3]) * R, r[5] * R, 'YXZ'));
  // pelvis height: as keyed, but never so high that a leg would have to stretch past its length
  let py = r[2] + breath * 0.5;
  const ankleY = (f) => B.ankle + f.lift;
  for (const [f, side] of [[fl, -1], [fr, 1]]) {
    const hip = L(side * B.hipW, -B.hipD, 0).applyQuaternion(qP);
    const dh = Math.hypot(px + hip.x - f.x, pz + hip.z - f.z), maxL = (B.thigh + B.shin) * 0.992;
    const top = ankleY(f) + Math.sqrt(Math.max(0, maxL * maxL - dh * dh)) - hip.y;
    py = smin(py, top, 0.04);
  }
  const P = new V3(px, py, pz);
  const spineBase = P.clone().add(new V3(0, 0.07, 0).applyQuaternion(qP));
  const neck = spineBase.clone().add(new V3(0, B.spine + breath, 0).applyQuaternion(qC));
  const SR = neck.clone().add(L(B.shW, -0.045, -0.015).applyQuaternion(qC));
  const SLs = neck.clone().add(L(-B.shW, -0.045, -0.015).applyQuaternion(qC));
  // spear
  const s = SPEAR(t);
  const [cx, cy, cz, sy, sp, sC, spin, ay, ap, sR, sL, aR, aL, frm] = s;
  // frame 0: the pelvis's ground frame; frame 1: the right shoulder, turning and leaning with the chest
  const ground = new V3(px, 0, pz), lc = L(cx, cy, cz), d0 = dirLocal(sy, sp).applyAxisAngle(dirLocal(ay, ap), spin * R);
  const C = ground.clone().add(lc.clone().applyQuaternion(qYaw)).lerp(SR.clone().add(lc.clone().applyQuaternion(qC)), frm);
  const D = d0.clone().applyQuaternion(qYaw).lerp(d0.clone().applyQuaternion(qC), frm).normalize();
  // reach: if a holding hand can't reach its grip, the spear comes to the hand
  const at = (sv) => C.clone().addScaledVector(D, sv - sC);
  for (let it = 0; it < 4; it++) {
    const corr = new V3(); let wsum = 0;
    for (const [S, sv, a] of [[SR, sR, aR], [SLs, sL, aL]]) {
      if (a < 0.02) continue;
      const g = at(sv), d = g.distanceTo(S), lim = REACH * 0.975;
      if (d > lim) corr.addScaledVector(g.sub(S).normalize(), (d - lim) * a);
      wsum += a;
    }
    if (wsum > 0) C.addScaledVector(corr, -1 / Math.max(1, wsum));
  }
  return { t, r, fl, fr, qYaw, qP, qC, P, spineBase, neck, SR, SL: SLs, C, D, sC, sR, sL, aR, aL };
}
const tipAt = (c, sv) => c.C.clone().addScaledVector(c.D, sv - c.sC);

function pose(t) {
  const c = core(t), r = c.r;
  const p = c;
  // head
  p.qH = new QT().setFromEuler(new THREE.Euler((r[4] * 0.3 + r[7]) * R, (r[1] + r[3] + r[6]) * R, 0, 'YXZ'));
  p.head = c.neck.clone().add(new V3(0, 0.13, 0.015).applyQuaternion(c.qC));
  // arms
  const free = (side) => c.P.clone().add(L(side * 0.21, 0.04, 0.17).applyQuaternion(c.qP));   // a fist chambered at the hip
  p.arms = {};
  for (const [k, side, S, sv, a] of [['R', 1, c.SR, c.sR, c.aR], ['L', -1, c.SL, c.sL, c.aL]]) {
    const grip = tipAt(c, sv), tgt = free(side).lerp(grip, a);
    const raise = clamp((tgt.y - S.y) / 0.35);
    const pole = L(side * (0.55 + 0.4 * raise), -0.8 + 1.1 * raise, -0.45).applyQuaternion(c.qC);
    const E = new V3(), H = new V3();
    ik(S, tgt, B.upper, B.fore, pole, E, H);
    p.arms[k] = { S, E, H, grip: a };
  }
  // legs
  p.legs = {};
  for (const [k, side, f] of [['L', -1, c.fl], ['R', 1, c.fr]]) {
    const hip = c.P.clone().add(L(side * B.hipW, -B.hipD, 0).applyQuaternion(c.qP));
    const A = new V3(f.x, B.ankle + f.lift, f.z);
    const fy = f.yaw * R, toe = new V3(Math.sin(fy), 0, Math.cos(fy));
    const pole = toe.clone().multiplyScalar(1).add(L(side * 0.25, 0, 0).applyQuaternion(c.qYaw));
    const K = new V3(), Aend = new V3();
    ik(hip, A, B.thigh, B.shin, pole, K, Aend);
    p.legs[k] = { hip, K, A: Aend, yaw: f.yaw, lift: f.lift };
  }
  return p;
}

// ============================================================ renderer, scene
const canvas = document.getElementById('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: TIER === 0, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE }); }
catch (e) { document.getElementById('err').style.display = 'flex'; window.__ERR = String(e); return; }
const DPR = Q.has('dpr') ? +Q.get('dpr') : Math.min(devicePixelRatio || 1, TIER ? 2 : 2);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040506);
const FOG = new THREE.FogExp2(0x050607, 0.085);
scene.fog = FOG;
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 120);

// ---- textures made here
function canvasTex(n, fn, srgb) {
  const cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'); const im = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = fn(x / n, y / n), i = (y * n + x) * 4; im.data[i] = v[0]; im.data[i + 1] = v[1]; im.data[i + 2] = v[2]; im.data[i + 3] = v[3] ?? 255; }
  g.putImageData(im, 0, 0); const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; if (srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
}
const bumpTex = canvasTex(TIER ? 128 : 256, (u, v) => { const n = fbm(u * 8, v * 8, 5, 8) * 0.7 + fbm(u * 32, v * 32, 2, 32) * 0.3; const b = Math.round(255 * n); return [b, b, b]; });
const flameTex = canvasTex(128, (u, v) => {
  const x = (u - 0.5) * 2, y = (v - 0.62) * 2; const d = Math.sqrt(x * x * 2.6 + (y < 0 ? y * y * 0.55 : y * y * 2.2));
  const a = Math.pow(clamp(1 - d), 1.6); return [255, Math.round(180 + 60 * a), Math.round(90 + 140 * a * a), Math.round(255 * a)];
});
flameTex.wrapS = flameTex.wrapT = THREE.ClampToEdgeWrapping;
const glowTex = canvasTex(64, (u, v) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2; const a = Math.pow(clamp(1 - d), 2.2); return [255, 255, 255, Math.round(255 * a)]; });
glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;

// a material whose roughness drops where a per-vertex wetness says so (puddles, wet streaks)
function wetMaterial(opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWet;\nvarying float vWet;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = aWet;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWet;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.05, vWet);');
  };
  return m;
}

// ---- the chasm
const HALF = 2.55;   // half the floor's width at the figure; "wider at the bottom"
const ZL = -26, ZH = 26;
const wallX = (side, y, z) => side * (HALF + 0.45 * Math.exp(-y / 2.2) - 0.2 * (y / 26) + 0.42 * (fbm(z * 0.18 + side * 40, y * 0.16, 4) - 0.5) + 0.14 * (fbm(z * 1.1, y * 1.1 + side * 9, 3) - 0.5));
function grid(nu, nv, at) {   // at(i, j) -> {p:[x,y,z], c:[r,g,b], w, uv:[u,v]}
  const pos = [], col = [], wet = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const o = at(i / nu, j / nv); pos.push(...o.p); col.push(...o.c); wet.push(o.w); uv.push(...o.uv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c2 = a + nu + 1, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWet', new THREE.Float32BufferAttribute(wet, 1)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
const wallMat = wetMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, bumpMap: bumpTex, bumpScale: 2.2, side: THREE.DoubleSide });
for (const side of [-1, 1]) {
  const H = 27, nu = TIER ? 120 : 220, nv = TIER ? 60 : 110;
  const g = grid(nu, nv, (u, v) => {
    const z = lerp(ZL, ZH, u), y = v * H - 0.4;
    const moss = fbm(z * 0.35 + side * 7, y * 0.5, 4), streak = fbm(z * 3.2 + side * 3, y * 0.12, 3);
    const m = clamp((moss - 0.38) * 3);
    const c = [lerp(0.030, 0.034, m), lerp(0.032, 0.062, m), lerp(0.028, 0.026, m)];
    const dk = 0.7 + 0.5 * streak; c[0] *= dk; c[1] *= dk; c[2] *= dk;
    return { p: [wallX(side, y, z), y, z], c, w: clamp((streak - 0.52) * 3.5) * 0.85 + 0.1 * Math.exp(-y / 1.5), uv: [z / 1.8, y / 1.8] };
  });
  const m = new THREE.Mesh(g, wallMat); m.receiveShadow = true; scene.add(m);
}
// floor: smoothed crem, rising and falling a little, with rainwater lying in the hollows
const puddle = (x, z) => sm(0.56, 0.62, fbm(x * 0.55 + 3, z * 0.42, 4) + 0.12 * Math.exp(-((x + 0.3) ** 2 + (z - 0.6) ** 2) / 1.2));
const floorY = (x, z) => 0.05 * (fbm(x * 0.6, z * 0.6, 3) - 0.5) + 0.12 * Math.max(0, Math.abs(x) - HALF + 0.4) - 0.03 * puddle(x, z);
const floorMat = wetMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, bumpMap: bumpTex, bumpScale: 0.6 });
{
  const W = HALF + 0.9, nu = TIER ? 60 : 110, nv = TIER ? 260 : 520;
  const g = grid(nu, nv, (u, v) => {
    const x = lerp(-W, W, u), z = lerp(ZL, ZH, v), pd = puddle(x, z), n = fbm(x * 2, z * 2, 3);
    const c = [lerp(0.085, 0.022, pd) * (0.8 + 0.4 * n), lerp(0.075, 0.025, pd) * (0.8 + 0.4 * n), lerp(0.062, 0.030, pd) * (0.8 + 0.4 * n)];
    return { p: [x, pd > 0.5 ? -0.025 : floorY(x, z), z], c, w: pd, uv: [x / 1.2, z / 1.2] };
  });
  const m = new THREE.Mesh(g, floorMat); m.receiveShadow = true; scene.add(m);
}
// the rift, far above: the only daylight, and the evening is coming on
{
  const g = new THREE.PlaneGeometry(2.6, ZH - ZL, 1, 1);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.20, 0.26, 0.42), fog: false }));
  m.rotation.x = Math.PI / 2; m.position.set(0.3, 26.5, 0); scene.add(m);
}
const hemi = new THREE.HemisphereLight(0x3a4866, 0x2a1608, 0.5); scene.add(hemi);
const skyLight = new THREE.DirectionalLight(0x6f84b0, 0.35); skyLight.position.set(0.2, 30, 3); scene.add(skyLight);

// ---- props: the torch rammed between two boulders, the weapons pile
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x1b2117, roughness: 0.7, bumpMap: bumpTex, bumpScale: 1.5 });
function boulder(x, y, z, s, seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, rnd = rng(seed);
  for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i); const k = 1 + 0.22 * (fbm(v.x * 1.7 + seed, v.y * 1.7 + v.z, 3) - 0.5) * 2; p.setXYZ(i, v.x * k, v.y * k * 0.72, v.z * k); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, stoneMat); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = rnd() * TAU; m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}
const TORCH = new V3(-1.78, 0.98, 1.05);
boulder(-1.98, 0.18, 0.86, 0.42, 3); boulder(-1.62, 0.15, 1.27, 0.36, 7);
{
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.95, 8), new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 }));
  stick.position.set(TORCH.x - 0.03, TORCH.y - 0.45, TORCH.z + 0.02); stick.rotation.z = -0.08; stick.castShadow = false; scene.add(stick);
}
const flame = new THREE.Group(); flame.position.copy(TORCH).add(new V3(0, 0.08, 0)); scene.add(flame);
const flameCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(3.2, 2.2, 1.3), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
flameCore.scale.set(0.16, 0.32, 1); flame.add(flameCore);
const flameHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.55, 0.22), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.35 }));
flameHalo.scale.set(1.1, 1.1, 1); flame.add(flameHalo);
const torch = new THREE.PointLight(0xffa04f, 9, 0, 2);
torch.position.copy(TORCH).add(new V3(0, 0.14, 0));
torch.castShadow = true; torch.shadow.mapSize.set(TIER ? 512 : 1024, TIER ? 512 : 1024); torch.shadow.bias = -0.002; torch.shadow.normalBias = 0.025; torch.shadow.camera.near = 0.08; torch.shadow.camera.far = 30;
scene.add(torch);
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c432b, roughness: 0.38 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0xa7adb3, metalness: 0.92, roughness: 0.26 });
function spearMesh() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.018, BLADE, 10), woodMat); shaft.position.y = BLADE / 2; g.add(shaft);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.017, 0.07, 10), steelMat); sock.position.y = BLADE - 0.02; g.add(sock);
  const bl = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.034, LEN - BLADE + 0.02, 4), steelMat); bl.scale.set(1, 1, 0.28); bl.position.y = BLADE + (LEN - BLADE) / 2; g.add(bl);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// the pile of salvage by the torch
{
  const rnd = rng(11);
  for (let i = 0; i < 5; i++) { const s = spearMesh(); s.position.set(-1.25 + rnd() * 0.3, 0.03 + i * 0.012, 2.1 + rnd() * 0.25); s.rotation.set(Math.PI / 2 - 0.02, 0, -1.3 + rnd() * 0.5); scene.add(s); }
  for (let i = 0; i < 2; i++) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x3a3127, roughness: 0.6, metalness: 0.2 })); sh.position.set(-1.0 + i * 0.35, 0.05 + i * 0.04, 2.55); sh.rotation.set(0.15, 0, 0.1 + i * 0.3); sh.castShadow = sh.receiveShadow = true; scene.add(sh); }
}

// ============================================================ figures
// A body made of smooth tubes swept along the joints (so elbows and knees bend in one skin, not as beads),
// a torso that twists between the pelvis and the chest, and a head with a beard. Colour lives in the vertices.
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0x5e3f2c, roughness: 0.6 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x120e0b, roughness: 0.85 });
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.75 });
const UPV = new V3(0, 1, 0), _d = new V3();
const C3 = (hex) => new THREE.Color(hex);
const COL = { cloth: C3(0x3b3229), vest: C3(0x2b241e), skin: C3(0x5e3f2c) };
function prof(rows) { const f = table(rows); return (u) => f(u); }   // u -> [half-width, half-depth, colour mix]
class Tube {
  constructor(rings, sides, profile, colorAt) {
    this.n = rings; this.m = sides; this.profile = profile;
    const g = new THREE.BufferGeometry(), N = rings * sides;
    this.pos = new Float32Array(N * 3); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const col = new Float32Array(N * 3), idx = [];
    for (let i = 0; i < rings; i++) { const c = colorAt(i / (rings - 1)); for (let j = 0; j < sides; j++) col.set([c.r, c.g, c.b], (i * sides + j) * 3); }
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < sides; j++) { const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides; idx.push(a, b, c, b, d, c); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, bodyMat); this.mesh.castShadow = true; this.mesh.frustumCulled = false;
  }
  // pts: joint chain; sideAt(u) -> a vector the ring's width runs along (optional; else carried along the chain)
  update(pts, sideAt, refSide) {
    const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = lens[lens.length - 1] || 1e-6;
    const at = (s) => { s = clamp(s, 0, total); let k = 1; while (k < pts.length - 1 && lens[k] < s) k++; const u = (s - lens[k - 1]) / ((lens[k] - lens[k - 1]) || 1e-6); return pts[k - 1].clone().lerp(pts[k], u); };
    let side = refSide ? refSide.clone() : new V3(1, 0, 0);
    const h = Math.min(0.06, total * 0.12);
    for (let i = 0; i < this.n; i++) {
      const u = i / (this.n - 1), s = u * total, c = at(s);
      const tan = at(s + h).sub(at(s - h)); if (tan.lengthSq() < 1e-10) tan.set(0, 1, 0); tan.normalize();
      if (sideAt) side.copy(sideAt(u));
      side.addScaledVector(tan, -side.dot(tan)); if (side.lengthSq() < 1e-8) side.set(tan.y, -tan.x, 0); side.normalize();
      const bin = new V3().crossVectors(tan, side);
      const [rw, rd] = this.profile(u);
      for (let j = 0; j < this.m; j++) {
        const a = j / this.m * TAU, x = Math.cos(a) * rw, z = Math.sin(a) * rd, o = (i * this.m + j) * 3;
        this.pos[o] = c.x + side.x * x + bin.x * z; this.pos[o + 1] = c.y + side.y * x + bin.y * z; this.pos[o + 2] = c.z + side.z * x + bin.z * z;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); this.mesh.geometry.computeBoundingSphere();
  }
}
function ball(r, mat, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat); m.scale.set(sx, sy, sz); m.castShadow = true; return m; }
function place(m, a, b) { m.position.copy(a).add(b).multiplyScalar(0.5); _d.subVectors(b, a); const len = _d.length(); m.quaternion.setFromUnitVectors(UPV, _d.divideScalar(len || 1)); m.scale.set(1, len, 1); }
const TORSO = prof([[0, 0.05, 0.05], [0.07, 0.135, 0.105], [0.22, 0.158, 0.112], [0.40, 0.138, 0.098], [0.60, 0.150, 0.108], [0.78, 0.168, 0.112], [0.90, 0.158, 0.098], [0.97, 0.105, 0.075], [1, 0.055, 0.05]]);
const ARM = prof([[0, 0.058, 0.058], [0.12, 0.056, 0.054], [0.45, 0.046, 0.045], [0.52, 0.044, 0.042], [0.62, 0.046, 0.042], [0.80, 0.038, 0.032], [1, 0.032, 0.026]]);
const LEG = prof([[0, 0.088, 0.088], [0.15, 0.086, 0.088], [0.46, 0.064, 0.066], [0.52, 0.061, 0.062], [0.62, 0.062, 0.064], [0.80, 0.052, 0.054], [1, 0.044, 0.046]]);
const NECK = prof([[0, 0.052, 0.05], [1, 0.048, 0.046]]);
class Figure {
  constructor() {
    this.g = new THREE.Group(); scene.add(this.g);
    const add = (m) => (this.g.add(m), m);
    this.torso = new Tube(18, 18, TORSO, (u) => COL.cloth.clone().lerp(COL.vest, sm(0.12, 0.18, u))); add(this.torso.mesh);
    this.neckT = new Tube(4, 10, NECK, () => COL.skin); add(this.neckT.mesh);
    this.headM = add(ball(0.096, skinMat, 0.9, 1.1, 1.02));
    this.hair = add(ball(0.1, hairMat, 0.94, 0.86, 1.0));
    this.beard = add(ball(0.07, hairMat, 0.98, 0.72, 0.84));
    this.parts = {};
    for (const k of ['L', 'R']) {
      const arm = new Tube(16, 12, ARM, (u) => COL.vest.clone().lerp(COL.skin, sm(0.5, 0.56, u)));
      const leg = new Tube(18, 12, LEG, () => COL.cloth);
      this.parts[k] = { sh: add(ball(0.064, bodyMat)), arm, leg, ha: add(ball(0.043, skinMat, 0.95, 1.2, 0.85)), ft: add(ball(0.06, shoeMat, 0.85, 0.62, 2.1)) };
      this.parts[k].sh.material = new THREE.MeshStandardMaterial({ color: COL.vest, roughness: 0.86 });
      add(arm.mesh); add(leg.mesh);
    }
  }
  apply(p) {
    const right = (q) => new V3(-1, 0, 0).applyQuaternion(q);
    const rP = right(p.qP), rC = right(p.qC);
    const crotch = p.P.clone().add(new V3(0, -0.11, 0.0).applyQuaternion(p.qP));
    const mid = p.spineBase.clone().add(new V3(0, 0.2, 0).applyQuaternion(p.qC));
    const top = p.neck.clone().add(new V3(0, 0.01, 0).applyQuaternion(p.qC));
    this.torso.update([crotch, p.P, p.spineBase, mid, top], (u) => rP.clone().lerp(rC, sm(0.15, 0.55, u)));
    this.neckT.update([p.neck.clone().add(new V3(0, -0.03, 0).applyQuaternion(p.qC)), p.head.clone().add(new V3(0, -0.02, -0.01).applyQuaternion(p.qH))], null, rC);
    this.headM.position.copy(p.head).add(new V3(0, 0.035, 0.008).applyQuaternion(p.qH)); this.headM.quaternion.copy(p.qH);
    this.hair.position.copy(p.head).add(new V3(0, 0.07, -0.022).applyQuaternion(p.qH)); this.hair.quaternion.copy(p.qH);
    this.beard.position.copy(p.head).add(new V3(0, -0.06, 0.03).applyQuaternion(p.qH)); this.beard.quaternion.copy(p.qH);
    for (const k of ['L', 'R']) {
      const a = p.arms[k], l = p.legs[k], q = this.parts[k], sg = k === 'R' ? 1 : -1;
      q.sh.position.copy(a.S);
      const wrist = a.H.clone().addScaledVector(a.H.clone().sub(a.E).normalize(), -0.035);
      q.arm.update([a.S.clone().add(new V3(0, 0.01, 0)), a.E, wrist], null, rC.clone().multiplyScalar(sg));
      q.ha.position.copy(a.H); q.ha.quaternion.setFromUnitVectors(UPV, a.H.clone().sub(a.E).normalize());
      q.leg.update([l.hip.clone().add(new V3(0, 0.04, 0)), l.K, l.A], null, rP.clone().multiplyScalar(sg));
      const fy = l.yaw * R; q.ft.position.set(l.A.x + Math.sin(fy) * 0.07, l.A.y - 0.045, l.A.z + Math.cos(fy) * 0.07); q.ft.rotation.set(-l.lift * 2.2, fy, 0);
    }
  }
}
const kal = new Figure();
const spear = spearMesh(); scene.add(spear);

// the bridgemen, standing where they stopped, staring
function standing(x, z, yaw, opts = {}) {
  const qY = new QT().setFromAxisAngle(Y, yaw * R), h = opts.h ?? 0.96;
  const P = new V3(x, h, z), qP = qY.clone(), qC = new QT().setFromEuler(new THREE.Euler((opts.lean ?? 3) * R, (yaw + (opts.twist ?? 0)) * R, 0, 'YXZ'));
  const spineBase = P.clone().add(new V3(0, 0.07, 0)), neck = spineBase.clone().add(new V3(0, B.spine, 0).applyQuaternion(qC));
  const p = { P, qP, qC, spineBase, neck, qH: new QT().setFromEuler(new THREE.Euler((opts.hp ?? 0) * R, (yaw + (opts.hy ?? 0)) * R, 0, 'YXZ')), head: neck.clone().add(new V3(0, 0.13, 0.015).applyQuaternion(qC)), arms: {}, legs: {} };
  for (const [k, side] of [['R', 1], ['L', -1]]) {
    const S = neck.clone().add(L(side * B.shW, -0.045, -0.015).applyQuaternion(qC));
    const raised = opts.torch === k;
    const tgt = raised ? S.clone().add(L(side * 0.12, 0.28, 0.32).applyQuaternion(qY)) : S.clone().add(L(side * 0.07, -0.58, 0.08).applyQuaternion(qY));
    const E = new V3(), H = new V3(); ik(S, tgt, B.upper, B.fore, L(side * 0.5, raised ? -0.2 : -0.3, -0.6).applyQuaternion(qY), E, H);
    p.arms[k] = { S, E, H };
    const hip = P.clone().add(L(side * B.hipW, -B.hipD, 0).applyQuaternion(qP)), A = hip.clone().add(L(side * 0.05, 0, 0.02).applyQuaternion(qY)); A.y = B.ankle;
    const K = new V3(), Ae = new V3(); ik(hip, A, B.thigh, B.shin, L(0, 0, 1).applyQuaternion(qY), K, Ae);
    p.legs[k] = { hip, K, A: Ae, yaw: yaw + side * -10, lift: 0 };
  }
  return p;
}
const crewTorches = [];
{
  const crew = [[1.35, -3.6, 10, {}], [0.45, -4.3, 4, { torch: 'R' }], [-0.6, -4.0, -6, { hy: -8 }], [-1.55, -3.4, -18, { lean: 6 }], [1.9, -5.0, 12, {}], [-0.1, -5.4, 0, { torch: 'L' }], [-1.3, -5.9, -6, {}], [0.95, -6.3, 4, {}]];
  for (const [x, z, yaw, o] of crew) {
    const f = new Figure(); const p = standing(x, z, yaw, o); f.apply(p);
    if (o.torch) {
      const hpos = p.arms[o.torch].H.clone().add(new V3(0, 0.22, 0));
      const l = new THREE.PointLight(0xff9a48, 2.2, 0, 2); l.position.copy(hpos); scene.add(l);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(2.6, 1.8, 1.0), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      s.scale.set(0.13, 0.26, 1); s.position.copy(hpos); scene.add(s);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x241811, roughness: 0.9 })); place(st, p.arms[o.torch].H.clone().add(new V3(0, -0.15, 0)), hpos); st.scale.x = st.scale.z = 1; scene.add(st);
      crewTorches.push({ l, s, seed: x * 7 + z });
    }
  }
}

// ============================================================ light that moves: trails, droplets, the spren
function ribbonMesh(n, color, add = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n * 2), 1).setUsage(THREE.DynamicDrawUsage));
  const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA, vA); }',
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh); return mesh;
}
const NTR = TIER ? 18 : 26, TRDT = 1 / 110;
const tipTrail = ribbonMesh(NTR, new THREE.Color(1.6, 1.25, 0.85));
const buttTrail = ribbonMesh(NTR, new THREE.Color(0.9, 0.7, 0.5));
function updateTrail(mesh, t, sA, sB, gain) {
  const pos = mesh.geometry.attributes.position.array, al = mesh.geometry.attributes.alpha.array;
  let prev = null;
  for (let k = 0; k < NTR; k++) {
    const tk = t - k * TRDT, c = core(Math.max(0, tk));
    const a = tipAt(c, sA), b = tipAt(c, sB);
    let speed = 0;
    if (k === 0) { const c2 = core(Math.max(0, tk - TRDT)); speed = tipAt(c2, sA).distanceTo(a) / TRDT; mesh.userData.speed = speed; }
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
    const age = k / (NTR - 1), w = Math.pow(1 - age, 1.8) * gain * sm(2.5, 7, mesh.userData.speed);
    al[k * 2] = w * 0.3; al[k * 2 + 1] = 0;
    prev = a;
  }
  mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.attributes.alpha.needsUpdate = true;
}
// droplets: the spray at the snap ("Water droplets from its length sprayed across his back") and drips off the wet tip before it
const NDROP = TIER ? 70 : 120;
const drops = (() => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NDROP * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(NDROP), 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float size; uniform float uScale; varying float vS; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vS = size; gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying float vS; void main(){ vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(d)); if (vS <= 0.0) discard; gl_FragColor = vec4(vec3(1.4,1.15,0.85)*a, a); }',
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
  const rnd = rng(5), spray = [];
  for (let i = 0; i < NDROP; i++) spray.push({ s: 0.15 + rnd() * 2.1, t0: T.SNAP + (rnd() - 0.5) * 0.06, k: 0.6 + rnd() * 0.55, j: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], size: 0.012 + rnd() * 0.012, drip: i < 14, dt: i * 0.21 + rnd() * 0.1 });
  return { p, spray };
})();
function updateDrops(t) {
  const pos = drops.p.geometry.attributes.position.array, sz = drops.p.geometry.attributes.size.array;
  for (let i = 0; i < NDROP; i++) {
    const d = drops.spray[i];
    let x = 0, y = -10, z = 0, size = 0;
    if (d.drip) {   // falling from the tip while he holds it over the pile
      const t0 = d.dt % 2.9, tt = t - t0;
      if (t0 < T.SNAP - 0.2 && tt >= 0 && tt < 0.6) { const c = core(t0), o = tipAt(c, LEN - 0.02); x = o.x; z = o.z; y = o.y - 4.9 * tt * tt; size = y > 0.02 ? d.size * 0.9 : 0; }
    } else {
      const tt = t - d.t0;
      if (tt >= 0 && tt < 1.4) {
        const c0 = core(d.t0), c1 = core(d.t0 - 0.02), o = tipAt(c0, d.s), v = o.clone().sub(tipAt(c1, d.s)).multiplyScalar(50 * d.k);
        v.x += d.j[0] * 1.2; v.y += d.j[1] * 1.2 + 0.4; v.z += d.j[2] * 1.2;
        x = o.x + v.x * tt; z = o.z + v.z * tt; y = o.y + v.y * tt - 4.9 * tt * tt;
        size = y > 0.01 ? d.size : 0;
      }
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; sz[i] = size;
  }
  drops.p.geometry.attributes.position.needsUpdate = true; drops.p.geometry.attributes.size.needsUpdate = true;
}
// the spren: "some sort of spren zipping around you, between your sweeps, glowing with a pale light"
const NSP = TIER ? 40 : 64, SPDT = 1 / 80;
const sprenRibbon = ribbonMesh(NSP, new THREE.Color(0.7, 0.86, 1.15));
const sprenHead = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.8, 0.95, 1.3), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
sprenHead.scale.set(0.06, 0.06, 1); scene.add(sprenHead);
const SPREN_ON = (t) => win(t, T.KATA + 0.5, T.STANCE + 0.3, 1.2, 0.8);
function sprenAt(t) {
  const c = core(t), mid = tipAt(c, 1.6 + 0.5 * Math.sin(t * 2.3));
  const ctr = c.P.clone().add(new V3(0, 0.35, 0));
  const a = t * 5.3 + 1.7 * Math.sin(t * 1.3), rr = 0.85 + 0.3 * Math.sin(t * 2.9);
  const orbit = new V3(Math.cos(a) * rr, 0.35 * Math.sin(t * 3.7) + 0.15 * Math.sin(a * 2), Math.sin(a) * rr);
  return ctr.add(orbit).lerp(mid, 0.3 + 0.2 * Math.sin(t * 1.9));
}
function updateSpren(t, camPos) {
  const on = SPREN_ON(t);
  sprenHead.material.opacity = on * 0.8; sprenHead.visible = on > 0.01; sprenRibbon.visible = on > 0.01;
  if (on <= 0.01) return;
  const pos = sprenRibbon.geometry.attributes.position.array, al = sprenRibbon.geometry.attributes.alpha.array;
  const pts = []; for (let k = 0; k < NSP; k++) pts.push(sprenAt(t - k * SPDT));
  sprenHead.position.copy(pts[0]);
  for (let k = 0; k < NSP; k++) {
    const p = pts[k], q = pts[Math.min(NSP - 1, k + 1)], tan = q.clone().sub(p), view = camPos.clone().sub(p);
    const side = tan.cross(view).normalize().multiplyScalar(0.006 * (1 - k / NSP) + 0.0015);
    pos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], k * 6);
    const w = Math.pow(1 - k / (NSP - 1), 1.4) * on * 0.5; al[k * 2] = w; al[k * 2 + 1] = w;
  }
  sprenRibbon.geometry.attributes.position.needsUpdate = true; sprenRibbon.geometry.attributes.alpha.needsUpdate = true;
}

// ============================================================ post: bloom, then tone mapping
const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new THREE.OutputPass());

// ============================================================ studio light (to judge the motion plainly)
const studio = new THREE.Group();
{ const a = new THREE.AmbientLight(0xffffff, 0.55), k = new THREE.DirectionalLight(0xfff4e6, 2.2), f = new THREE.DirectionalLight(0xbfd2ff, 0.9);
  k.position.set(3, 6, 5); f.position.set(-4, 3, -3); studio.add(a, k, f); }
let LIGHT = Q.get('light') === 'studio' ? 'studio' : 'torch';
function setLight(l) {
  LIGHT = l; const st = l === 'studio';
  if (st) scene.add(studio); else scene.remove(studio);
  scene.fog = st ? null : FOG; scene.background.set(st ? 0x1d1f22 : 0x040506);
  renderer.toneMappingExposure = st ? 0.9 : 1.25;
}
setLight(LIGHT);

// ============================================================ camera: a keyed crane round the figure, or free
// [t, azimuth (deg, 0 = in front of +Z), elevation, distance, look height]
const CAM = table([
  [0.0, -12, 7, 3.1, 1.05],
  [2.8, -20, 5, 2.9, 1.1],
  [4.8, -38, 8, 3.2, 1.12],
  [7.2, 10, 8, 3.6, 1.1],
  [9.2, 80, 9, 3.9, 1.3],
  [11.6, 118, 8, 3.7, 1.2],
  [14.0, 60, 7, 3.6, 1.1],
  [16.3, -22, 5, 3.0, 1.12],
  [19.6, -34, 3, 2.6, 1.15],
  [22.0, -40, 5, 3.0, 1.1],
]);
let camMode = 'film', free = { az: 40, el: 10, dist: 4.2 };
const camOverride = Q.get('cam') ? Q.get('cam').split(',').map(Number) : null;
const focus = (t) => { let x = 0, z = 0; for (const dt of [-0.6, -0.3, 0, 0.3, 0.6]) { const c = core(clamp(t + dt, 0, DUR)); x += c.P.x; z += c.P.z; } return new V3(x / 5, 0, z / 5); };
function placeCamera(t) {
  const f = focus(t);
  let az, el, dist, ly;
  if (camOverride) [az, el, dist, ly] = camOverride;
  else if (camMode === 'free') { ({ az, el, dist } = free); ly = 1.1; }
  else [az, el, dist, ly] = CAM(t);
  const tgt = new V3(f.x, ly, f.z);
  camera.position.set(tgt.x + Math.sin(az * R) * Math.cos(el * R) * dist, tgt.y + Math.sin(el * R) * dist, tgt.z + Math.cos(az * R) * Math.cos(el * R) * dist);
  camera.position.x = clamp(camera.position.x, -HALF + 0.35, HALF - 0.35);
  camera.lookAt(tgt);
}

// ============================================================ captions (from the page)
const CAPS = [
  [2.9, 6.2, 'Without thinking about it, he snapped the spear up under his arm into a guard position, point down.'],
  [6.6, 11.6, 'The spear danced in his fingers, comfortable, an extension of himself.'],
  [16.3, 19.3, 'He snapped the spear back into place, holding the haft at the one-quarter position, spearhead down, bottom of the haft tucked underneath his arm, end rising back behind his head.'],
  [19.5, 21.9, 'Oh, how I’ve missed that.'],
];
const capEl = document.getElementById('cap'), fadeEl = document.getElementById('fade');
let capNow = -1;
function updateCaption(t) {
  const i = CAPS.findIndex(([a, b]) => t >= a && t < b);
  if (i !== capNow) { capNow = i; if (i >= 0) capEl.innerHTML = `${CAPS[i][2]}<small>Chapter 27</small>`; capEl.classList.toggle('on', i >= 0); }
  fadeEl.style.opacity = String(Math.max(1 - sm(0, 0.5, t), sm(DUR - 0.5, DUR, t)));
}

// ============================================================ one frame, from t alone
function frame(t) {
  t = clamp(t, 0, DUR);
  const p = pose(t);
  kal.apply(p);
  const butt = tipAt(p, 0);
  spear.position.copy(butt); spear.quaternion.setFromUnitVectors(UPV, p.D);
  // torchlight: a flame that never holds still
  const fl = 0.84 + 0.12 * vn(t * 7.3) + 0.06 * vn(t * 23.1 + 4);
  torch.intensity = (LIGHT === 'studio' ? 3.5 : 15) * fl;
  flameCore.scale.set(0.15 + 0.03 * vn(t * 11), 0.30 + 0.08 * vn(t * 9 + 2), 1); flameCore.position.y = 0.02 * vn(t * 13);
  flameHalo.material.opacity = 0.28 + 0.1 * fl;
  for (const c of crewTorches) { const f2 = 0.82 + 0.14 * vn(t * 6.1 + c.seed) + 0.06 * vn(t * 19 + c.seed); c.l.intensity = 2.2 * f2; c.s.scale.set(0.12 + 0.02 * vn(t * 10 + c.seed), 0.24 + 0.06 * vn(t * 8 + c.seed), 1); }
  placeCamera(t);
  updateTrail(tipTrail, t, LEN - 0.03, LEN - 0.26, 1);
  updateTrail(buttTrail, t, 0.0, 0.2, 0.4);
  updateDrops(t);
  updateSpren(t, camera.position);
  drops.p.material.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * R / 2));
  composer.render();
  updateCaption(t);
}

// ============================================================ size, controls, clock
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || Math.round(innerWidth * 9 / 16);
  renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h);
  camera.aspect = w / h; camera.fov = w / h < 0.8 ? 58 : 40; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas); resize();

let t = Q.has('t') ? +Q.get('t') : 0, playing = !CAPTURE && !Q.has('t'), speed = 1, last = performance.now();
const playBtn = document.getElementById('play'), scrub = document.getElementById('scrub'), tlabel = document.getElementById('tlabel');
const showTime = () => { scrub.value = String(Math.round(t / DUR * 1000)); tlabel.textContent = `${t.toFixed(1)} s`; };
playBtn.addEventListener('click', () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; playBtn.setAttribute('aria-pressed', String(playing)); last = performance.now(); });
scrub.addEventListener('input', () => { t = scrub.value / 1000 * DUR; tlabel.textContent = `${t.toFixed(1)} s`; if (!playing) frame(t); });
const group = (attr, fn) => document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll(`[data-${attr}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset[attr]); if (!playing) frame(t);
}));
group('speed', (v) => { speed = +v; });
group('cam', (v) => { camMode = v; if (v === 'free') { const k = CAM(t); free = { az: k[0], el: k[1], dist: k[2] }; } });
group('light', (v) => setLight(v));
if (LIGHT === 'studio') document.querySelectorAll('[data-light]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.light === 'studio')));
// drag to look around (switches to the free camera); pinch or wheel to come closer
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (camMode !== 'free') { const k = CAM(t); free = { az: k[0], el: k[1], dist: k[2] }; camMode = 'free'; document.querySelectorAll('[data-cam]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cam === 'free'))); }
  drag = { x: e.clientX, y: e.clientY, az: free.az, el: free.el }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => { if (!drag) return; free.az = drag.az - (e.clientX - drag.x) * 0.4; free.el = clamp(drag.el + (e.clientY - drag.y) * 0.3, -8, 70); if (!playing) frame(t); });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); free.dist = clamp(free.dist * (1 + e.deltaY * 0.001), 1.6, 9); if (!playing) frame(t); }, { passive: false });

window.__frameAt = (tt) => { t = tt; frame(tt); };
window.__dbg = { R: renderer, core, pose, info: { tier: TIER, dpr: DPR } };
if (!CAPTURE) {
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) { t += dt * speed; if (t > DUR) t -= DUR; showTime(); frame(t); }
    requestAnimationFrame(loop);
  };
  frame(t); showTime(); requestAnimationFrame(loop);
} else frame(t);
window.__READY = true;
})();
