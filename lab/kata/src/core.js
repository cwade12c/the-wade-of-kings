// It Knew What to Do · shared state, maths, noise, and uniforms
// Every frame is a pure function of film time t (plus view mode and optional paused orbit).
import * as THREE from 'three';

export const Q = new URLSearchParams(location.search);
export const CAPTURE = Q.has('capture');
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const smoother = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * u * (u * (u * 6 - 15) + 10); };
export const pulse = (t, at, up, down) => (t < at ? sm(at - up, at, t) : 1 - sm(at, at + down, t));
export const win = (t, a, b, up = 0.5, dn = 0.6) => sm(a, a + up, t) * (1 - sm(b - dn, b, t));
export const rad = (d) => d * Math.PI / 180;

// Martial kime curve: explosive start, razor-crisp stop
export const kime = (u) => {
  const x = clamp(u, 0, 1);
  return 1 - Math.pow(1 - x, 4);
};
export const whip = (u) => {
  const x = clamp(u, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export function mono(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
export const track = (rows, col) => mono(rows.map((r) => r[0]), rows.map((r) => r[col]));
export const keyed = (rows) => track(rows, 1);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const hash2 = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
export function fbm(x, y, oct = 4, gain = 0.5, lac = 2.04) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y); n += a; a *= gain;
    x = x * lac + 13.7; y = y * lac - 8.3;
  }
  return s / n;
}
export function ridged(x, y, oct = 4) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(2 * vnoise(x, y) - 1);
    s += a * v * v; n += a; a *= 0.5;
    x = x * 2.06 + 21.3; y = y * 2.06 + 11.7;
  }
  return s / n;
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const U = {
  uTime: { value: 0 },
  uNoise: { value: null },
  uCamPos: { value: v3() },
  uSpearPos: { value: v3(0, 1.2, 0) },
  uSylPos: { value: v3(0, 1.8, 0) },
  uSylGlow: { value: 0 },
  // Hero oil-soaked torch wedged tightly into the narrow V-cleft between two mossy boulders on left wall
  uTorchA: { value: v3(-1.76, 1.08, -1.52) },
  // Distant warm bridge-crew torch further down the curving chasm bend
  uTorchB: { value: v3(1.88, 1.52, -7.2) },
  uTorchFlick: { value: 1 },
  uMemCol: { value: v3(0.4, 0.5, 0.6) },
  uMemMix: { value: 0 },
  uWallDim: { value: 0 },
  uRiftSun: { value: 0 },
  uWindVortex: { value: 0 },
  uPuddleGlow: { value: 0 },
  uSpherePos: { value: v3(0.35, 0.03, 2.38) },
  uFogCol: { value: v3(0.018, 0.028, 0.038) },
  uFogDen: { value: 0.042 },
  // World time for loose matter (drops, motes, mist, embers): it stalls when the kata snaps.
  uFxTime: { value: 0 },
  uStrokeView: { value: 1 },
  uStrokeHold: { value: 0 },
  uFreeze: { value: 0 },
  uBokeh: { value: 1 },
};

export const G = { U, tick: [], info: {}, tier: 0, view: 'director' };

export function makeNoiseTex() {
  // R: base noise; G: shifted by (37,17) for fast 1-tap 3D noise; B, A: independent channels
  const N = 256, d = new Uint8Array(N * N * 4), r = rng(20261127), base = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) base[i] = r() * 256;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      d[i] = base[y * N + x];
      d[i + 1] = base[((y - 17 + N) % N) * N + ((x - 37 + N) % N)];
      d[i + 2] = r() * 256;
      d[i + 3] = r() * 256;
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export const GLSL_NOISE = /* glsl */`
uniform sampler2D uNoise;
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).b;
}
float n3(vec3 x) {
  vec3 p = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
  vec2 rg = textureLod(uNoise, (uv + 0.5) / 256.0, 0.0).yx;
  return mix(rg.x, rg.y, f.z);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * n2(p);
    p = p * 2.03 + vec2(17.3, -9.1);
    a *= 0.5;
  }
  return s / 0.9375;
}
float fbm3(vec3 p) {
  float s = 0.5 * n3(p); p = p * 2.02 + 11.3;
  s += 0.25 * n3(p); p = p * 2.03 + 5.7;
  s += 0.125 * n3(p);
  return s / 0.875;
}
`;
