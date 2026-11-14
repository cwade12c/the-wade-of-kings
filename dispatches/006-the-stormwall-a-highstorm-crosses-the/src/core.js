// The Stormwall · shared state, maths and shader chunks.
// Everything on screen is a pure function of film time: no module keeps state between frames.
import * as THREE from 'three';

export const Q = new URLSearchParams(location.search);
export const CAPTURE = Q.has('capture');
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const pulse = (t, at, up, down) => t < at ? sm(at - up, at, t) : 1 - sm(at, at + down, t);
export const win = (t, a, b, up = 0.3, dn = 0.4) => sm(a, a + up, t) * (1 - sm(b - dn, b, t));
export const rad = (d) => d * Math.PI / 180;

// monotone cubic through keys: a crane that never stops dead between two marks
export function mono(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
export const track = (rows, col) => mono(rows.map((r) => r[0]), rows.map((r) => r[col]));
export const keyed = (rows) => track(rows, 1);

export function rng(seed) {      // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// value noise on the CPU (terrain, placement). Not the shader's noise: nothing needs the two to agree.
const hash2 = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
export function fbm(x, y, oct = 5, gain = 0.5, lac = 2.03) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); n += a; a *= gain; x = x * lac + 17.3; y = y * lac - 9.1; }
  return s / n;
}
export function ridged(x, y, oct = 5) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(2 * vnoise(x, y) - 1); s += a * v * v; n += a; a *= 0.5; x = x * 2.07 + 31.7; y = y * 2.07 + 11.9; }
  return s / n;
}

// ---- shared uniforms: every material and the sky read the same objects --------------------------------
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const U = {
  uTime: { value: 0 },
  uNoise: { value: null },
  uFront: { value: 9000 },          // world x of the stormwall (the storm lies east of it: x > uFront)
  uBack: { value: 16000 },          // world x of the storm's trailing edge
  uWall: { value: 0 },              // 0..1 how solid the wall reads from outside (haze hides it when far)
  uRain: { value: 0 },              // rain at the lens, 0..1
  uWet: { value: 0 },               // how wet the land is, 0..1
  uGust: { value: 0.1 },            // wind strength 0..1+
  uWindPh: { value: 0 },            // integral of wind speed (so nothing jumps when the wind rises)
  uDark: { value: 0 },              // 0 day .. 1 inside the storm
  uSunDir: { value: v3(0, 1, 0) },
  uSunCol: { value: v3(1, 1, 1) },  // sun colour times its share at the lens
  uSkyZen: { value: v3(0.1, 0.2, 0.5) },
  uSkyHor: { value: v3(0.5, 0.6, 0.7) },
  uFogCol: { value: v3(0.5, 0.6, 0.7) },
  uFogDen: { value: 0.00008 },
  uCurtain: { value: v3(0.5, 0.52, 0.55) },   // colour of the sheet of rain
  uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },   // xyz world position of the stroke, w its envelope
  uCamPos: { value: v3() },
  uClear: { value: 0 },             // 0..1 the washed, clear light after the storm
  uGround: { value: 0 },            // height of the ground under the lens
};
export const G = { U, tick: [], info: {}, tier: 0 };

export function makeNoiseTex() {
  // R: random; G: R shifted by (37,17) (3D noise from one tap); B, A: independent randoms
  const N = 256, d = new Uint8Array(N * N * 4), r = rng(20261113), base = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) base[i] = r() * 256;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    d[i] = base[y * N + x];
    d[i + 1] = base[((y - 17 + N) % N) * N + ((x - 37 + N) % N)];
    d[i + 2] = r() * 256; d[i + 3] = r() * 256;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// ---- GLSL shared by the sky and every material ---------------------------------------------------------
export const GLSL_COMMON = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime, uFront, uBack, uWall, uRain, uWet, uGust, uWindPh, uDark, uFogDen, uClear, uGround;
uniform vec3 uSunDir, uSunCol, uSkyZen, uSkyHor, uFogCol, uCurtain, uCamPos;
uniform vec4 uFlash;
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).b; }
float n3(vec3 x) { vec3 p = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy; vec2 rg = textureLod(uNoise, (uv + 0.5) / 256.0, 0.0).yx; return mix(rg.x, rg.y, f.z); }
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + vec2(17.3, -9.1); a *= 0.5; } return s / 0.9375; }
float fbm3(vec3 p) { float s = 0.5 * n3(p); p = p * 2.02 + 11.3; s += 0.25 * n3(p); p = p * 2.03 + 5.7; s += 0.125 * n3(p); return s / 0.875; }
// the sky without clouds or sun: what a wet stone mirrors
vec3 skyTint(vec3 rd) { float h = clamp(rd.y, 0.0, 1.0); return mix(uSkyHor, uSkyZen, pow(h, 0.55)); }
// length of the ray (ox + dx s, s in [0, d]) inside the slab a < x < b
float slabLen(float ox, float dx, float d, float a, float b) {
  if (abs(dx) < 1e-5) return (ox > a && ox < b) ? d : 0.0;
  float ta = (a - ox) / dx, tb = (b - ox) / dx; return max(min(max(ta, tb), d) - max(min(ta, tb), 0.0), 0.0);
}
// where the ray first meets the slab (for the streaks in the sheet of rain)
float slabIn(float ox, float dx, float a, float b) {
  if (abs(dx) < 1e-5) return 0.0; float ta = (a - ox) / dx, tb = (b - ox) / dx; return max(min(ta, tb), 0.0);
}
// the wall's face is not a ruled line: it bows and bulges along its length
float frontWave(float z) { return 300.0 * (n2(vec2(z * 0.0009, 3.0)) - 0.5) + 110.0 * (n2(vec2(z * 0.005, 7.0)) - 0.5); }
// the sheet of rain under the storm, seen along a ray of length d: rgb premultiplied, a = what it hides
vec4 curtain(vec3 ro, vec3 rd, float d) {
  float dd = d; if (rd.y > 0.0005) dd = min(d, max(1350.0 - ro.y, 0.0) / rd.y);      // rain lives under the cloud
  float fr = uFront + frontWave(ro.z + rd.z * slabIn(ro.x, rd.x, uFront, uBack));
  float lw = slabLen(ro.x, rd.x, dd, fr, fr + 900.0);                                // the wall itself
  float lb = slabLen(ro.x, rd.x, dd, fr + 900.0, uBack);                             // the body behind it
  float tau = lw / 210.0 + lb / 2600.0;
  if (tau < 0.0005) return vec4(0.0);
  float t0 = slabIn(ro.x, rd.x, fr, uBack); vec3 p = ro + rd * t0;
  float st = fbm2(vec2(p.z * 0.006 + p.y * 0.0012, p.y * 0.0007 - uTime * 0.09));   // falling streaks
  float st2 = n2(vec2(p.z * 0.035 - p.y * 0.012, p.y * 0.004 - uTime * 0.35)) * 0.6 + n2(vec2(p.z * 0.11 - p.y * 0.03, p.y * 0.007 - uTime * 0.6)) * 0.4;
  tau *= 0.55 + 0.9 * st;
  float a = (1.0 - exp(-tau)) * uWall * (1.0 - smoothstep(420.0, 1250.0, p.y + 420.0 * (st - 0.5)) * step(1.0, t0));      // seen from outside, the sheet frays into the cloud above it
  vec3 c = uCurtain * (0.5 + 0.55 * st + 0.4 * st2) * (0.3 + 0.7 * smoothstep(1050.0, 60.0, p.y));
  float low = exp(-max(p.y, 0.0) / 90.0);                                            // dust torn up along the foot of the wall
  c = mix(c, uCurtain * vec3(1.05, 0.86, 0.66) * (0.5 + 0.6 * fbm2(vec2(p.z * 0.01 + uTime * 0.2, p.y * 0.02 - uTime * 0.3))), 0.7 * low);
  float fd = length(uFlash.xyz - p); c += vec3(0.75, 0.82, 1.0) * uFlash.w * 2.2 / (1.0 + fd * fd / 250000.0) * smoothstep(0.0, 400.0, t0);
  c = mix(c, uFogCol, 1.0 - exp(-t0 * (uFogDen + 0.000012)));
  return vec4(c * a, a);
}
// haze, and the storm between the lens and a point at distance d along rd
vec3 applyAir(vec3 col, vec3 ro, vec3 rd, float d) {
  float sheet = uRain > 0.01 ? n2(vec2((ro.x + rd.x * min(d, 140.0)) * 0.035 + uWindPh * 0.8, (ro.z + rd.z * min(d, 140.0)) * 0.016)) : 0.5;   // the rain comes across in waves
  float f = 1.0 - exp(-d * uFogDen * (0.55 + 0.9 * sheet));
  vec3 fc = uFogCol + vec3(0.7, 0.78, 1.0) * uFlash.w * uDark * (0.04 + 0.9 * pow(max(dot(rd, normalize(uFlash.xyz - ro)), 0.0), 8.0));
  col = mix(col, fc, f);
  vec4 cu = curtain(ro, rd, d);
  return col * (1.0 - cu.a) + cu.rgb;
}
`;
