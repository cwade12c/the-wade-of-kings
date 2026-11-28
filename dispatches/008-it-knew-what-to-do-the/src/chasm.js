// It Knew What to Do · the Shattered Plains chasm: stepped sedimentary walls, angular boulders,
// wedged oil-soaked torch with volumetric 3D flame & embers, wan-yellow tube fungi, mirror puddle, god-rays & mist.
import * as THREE from 'three';
import { mergeVertices } from '../../../assets/vendor/three/utils/BufferGeometryUtils.js';
import { U, G, rng, fbm, ridged, vnoise, clamp, lerp, sm, TAU, GLSL_NOISE } from './core.js';
import { chasmRockMaterial, boulderMaterial } from './mat.js';
import { T } from './film.js';
import { Mirror } from './mirror.js';

export function canyonCenterX(z) {
  return Math.sin(z * 0.105) * 0.92 + Math.cos(z * 0.052 + 0.65) * 0.48;
}
export function canyonHalfWidth(z, y) {
  // Wider at the highstorm-flooded floor, narrowing overhead into a dramatic crooked slit of sky
  const base = 2.75 + 0.48 * Math.sin(z * 0.17 + 1.1);
  const narrow = -1.25 * sm(2.2, 16.5, y) + 0.36 * Math.sin(y * 0.48 + z * 0.22);
  return Math.max(0.88, base + narrow);
}

// ---- Boulders and crags: a lumpy core cut by planes into fractured faces, banded by sediment, chipped ----
// kind 0 boulder, 1 slab, 2 crag column, 3 block. Each vertex also carries its convexity (aEdge): worn
// edges read lighter, crevices darker, and moss keeps off the sharp edges.
function stone(seed, detail, kind) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, r = rng(seed), v = new THREE.Vector3();
  const ox = r() * 80, oy = r() * 80;
  const S = [[1.0, 0.80, 0.92], [1.25, 0.52, 1.10], [0.62, 1.9, 0.66], [1.0, 0.86, 0.95]][kind];
  const planes = [];
  const add = (x, y, z, d) => planes.push([new THREE.Vector3(x, y, z).normalize(), d]);
  add((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4, 0.52 + 0.22 * r());
  const nSide = kind === 2 ? 7 : 6;
  for (let i = 0; i < nSide; i++) {
    const a = (i + r() * 0.7) / nSide * TAU;
    add(Math.cos(a), (r() - 0.5) * 0.8, Math.sin(a), 0.60 + 0.26 * r());
  }
  for (let i = 0; i < 6; i++) {
    const th = r() * TAU, ph = Math.acos(2 * r() - 1);
    add(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), 0.70 + 0.22 * r());
  }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + 0.22 * (fbm(ox + v.x * 1.3 + v.y * 0.7, oy + v.z * 1.3 - v.y * 0.6, 3) - 0.5));
    for (const [n, d] of planes) { const k = v.dot(n) - d; if (k > 0) v.addScaledVector(n, -k); }
    const st = Math.sin(v.y * (kind === 2 ? 8.0 : 12.0) + 2.2 * vnoise(ox + v.x * 2.0, oy + v.z * 2.0));
    const ledge = 0.026 * Math.tanh(4.0 * st);
    v.x *= 1 + ledge; v.z *= 1 + ledge;
    v.multiplyScalar(1 + 0.035 * (ridged(ox + v.x * 4.5 + v.y * 2.0, oy + v.z * 4.5 - v.y * 2.0, 3) - 0.5));
    v.set(v.x * S[0], v.y * S[1], v.z * S[2]);
    const base = -0.30 * S[1];
    if (v.y < base) v.y = base + (v.y - base) * 0.2;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Convexity: how far each vertex stands proud of its neighbours, along its normal.
  const n = p.count, idx = g.index.array, sum = new Float32Array(n * 3), cnt = new Float32Array(n);
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + (e + 1) % 3];
      sum[a * 3] += p.getX(b); sum[a * 3 + 1] += p.getY(b); sum[a * 3 + 2] += p.getZ(b); cnt[a]++;
      sum[b * 3] += p.getX(a); sum[b * 3 + 1] += p.getY(a); sum[b * 3 + 2] += p.getZ(a); cnt[b]++;
    }
  }
  const nr = g.attributes.normal, edge = new Float32Array(n);
  const scale = 0.9 / (1 / Math.pow(2, detail));
  for (let i = 0; i < n; i++) {
    const c = cnt[i] || 1;
    const dx = p.getX(i) - sum[i * 3] / c, dy = p.getY(i) - sum[i * 3 + 1] / c, dz = p.getZ(i) - sum[i * 3 + 2] / c;
    edge[i] = clamp((dx * nr.getX(i) + dy * nr.getY(i) + dz * nr.getZ(i)) * scale * 6.0, -1, 1);
  }
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  return g;
}

// Sculpted stepped sedimentary cliff wall (side = -1 left, +1 right)
function buildCliffWall(side, tier, rockMat) {
  const segZ = tier ? 72 : 124;
  const segY = tier ? 36 : 56;
  const zMin = -24, zMax = 14, yMax = 24.0;

  const geo = new THREE.PlaneGeometry(1, 1, segZ, segY);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;
    const v = pos.getY(i) + 0.5;
    const z = lerp(zMin, zMax, u);
    const y = Math.pow(v, 1.32) * yMax;

    const cx = canyonCenterX(z);
    const hw = canyonHalfWidth(z, y);

    // Sharp stepped sedimentary strata shelves + ridged flood-carved crags
    const stepVal = y * 0.85 + fbm(z * 0.16 + side * 2.1, y * 0.10, 3) * 1.4;
    const shelf = 0.22 * Math.tanh(3.5 * Math.sin(stepVal * Math.PI));
    const crag = (ridged(z * 0.24 + side * 7.1, y * 0.26, 4) - 0.46) * 0.78;
    const overhang = Math.sin(y * 0.62 + z * 0.11) * 0.32 * sm(1.6, 6.0, y);
    const x = cx + side * (hw + crag + shelf + overhang);

    pos.setXYZ(i, x, y - 0.22, z);
  }
  if (side < 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp;
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, rockMat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// ---- Dark Obsidian Mirror Crem Floor & Rippling Rainwater Puddle ----
const FLOOR_V = /* glsl */`
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FLOOR_F = /* glsl */`precision highp float;
${GLSL_NOISE}
uniform float uTime, uTorchFlick, uSylGlow, uMemMix, uWallDim, uRiftSun, uPuddleGlow, uWindVortex, uFogDen;
uniform float uWindPh, uGaleSpd, uGaleVis, uGaleView, uInhale, uBurst, uRain;
uniform vec3 uCamPos, uTorchA, uTorchB, uSylPos, uMemCol, uSpherePos, uFogCol, uKataC;
uniform sampler2D tRefl;
uniform mat4 uReflMat;
in vec3 vWorld;
in vec2 vUv;
out vec4 frag;

float hh(vec2 q) { q = fract(q * vec2(127.31, 311.73)); q += dot(q, q + 34.17); return fract(q.x * q.y); }
// The held water coming back down: rings scattered across the pool, each cell with its own timing.
vec2 rainGrad(vec2 p) {
  vec2 g = vec2(0.0);
  const float C = 0.17;
  vec2 cell = floor(p / C);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    if (hh(c) > uRain) continue;
    vec2 ctr = (c + 0.2 + 0.6 * vec2(hh(c + 3.1), hh(c + 7.7))) * C;
    float ph = fract(uTime * (0.8 + 0.6 * hh(c + 1.3)) + hh(c + 5.2));
    vec2 d = p - ctr;
    float r = length(d), e = r - ph * 0.2;
    g += d / max(r, 1e-3) * cos(e * 110.0) * exp(-e * e * 1400.0) * (1.0 - ph) * 0.09;
  }
  return g;
}

vec2 rippleGrad(vec2 p, vec2 c, float t0, float amp, float freq, float speed, float life) {
  float age = uTime - t0;
  if (age < 0.0 || age > life) return vec2(0.0);
  vec2 d = p - c;
  float r = length(d);
  float front = age * speed;
  float dist = r - front;
  float env = exp(-dist * dist * 18.0) * exp(-age * (2.4 / life)) * smoothstep(0.0, 0.05, age);
  float wave = cos(dist * freq) * amp * env;
  return (r > 0.001 ? d / r : vec2(0.0)) * wave;
}

void main() {
  vec2 p = vWorld.xz;
  float n = fbm2(p * 1.25);
  float fine = fbm2(p * 6.5 + 3.1);
  float grit = n2(p * 24.0);

  // Organic shallow rainwater basin meandering through the hardened crem floor
  float px = (p.x - 0.06) / 1.85;
  float pz = (p.y - 1.00) / 3.05;
  float pDist = length(vec2(px, pz)) + (n - 0.5) * 0.48;
  float puddle = 1.0 - smoothstep(0.70, 0.98, pDist);

  // Dark hardened crem stone sediment with subtle wet-edge rim
  vec3 stoneCol = mix(vec3(0.042, 0.040, 0.036), vec3(0.088, 0.078, 0.064), fine);
  stoneCol *= 0.78 + 0.36 * grit;
  float wetRim = 1.0 - smoothstep(0.82, 1.28, pDist);
  stoneCol *= mix(1.0, 0.44, wetRim * 0.85);
  stoneCol *= mix(1.0, 0.35, puddle); // mirror-dark water bed

  // Deterministic concentric water ripples
  vec2 grad = vec2(0.0);
  // 1) Cavern ceiling drips
  for (int i = 0; i < 4; i++) {
    float period = 3.9 + float(i) * 1.17;
    float cycle = mod(uTime + float(i) * 2.1, period);
    vec2 dc = vec2(sin(float(i) * 4.3 + 0.5) * 0.68, 0.15 + float(i) * 0.64);
    grad += rippleGrad(p, dc, uTime - cycle, 0.055, 32.0, 0.62, 2.3);
  }
  // Single drops from far above (kata.js DRIPS)
  grad += rippleGrad(p, vec2(-0.02, 0.92), 0.95, 0.10, 30.0, 0.70, 3.0);
  grad += rippleGrad(p, vec2(0.16, 1.18), 46.45, 0.10, 30.0, 0.66, 3.0);
  grad += rippleGrad(p, vec2(-0.34, 1.62), 48.25, 0.10, 30.0, 0.66, 3.0);
  grad += rippleGrad(p, vec2(0.30, 0.88), 49.95, 0.10, 30.0, 0.66, 3.0);
  // 2) Spear lift (2.4s), Guard Snap water-spray (8.1s), and grounded Embusen footwork stance rings!
  grad += rippleGrad(p, vec2(-0.22, 0.65), 2.45, 0.13, 25.0, 0.82, 3.2);
  grad += rippleGrad(p, vec2(0.18, 0.45), 8.15, 0.12, 28.0, 0.88, 2.8);
  // Subtle paired martial footstep plants on the wet stone floor beneath the kata (embusen grounding)
  grad += rippleGrad(p, vec2(-0.26, 0.18), 7.75, 0.09, 30.0, 0.75, 2.1);
  grad += rippleGrad(p, vec2( 0.28, 0.42), 7.80, 0.09, 30.0, 0.75, 2.1);
  grad += rippleGrad(p, vec2( 0.16, 0.78), 15.35, 0.11, 28.0, 0.80, 2.2);
  grad += rippleGrad(p, vec2(-0.22, 0.22), 18.50, 0.08, 30.0, 0.72, 2.0);
  grad += rippleGrad(p, vec2( 0.34, 0.35), 25.50, 0.08, 29.0, 0.72, 2.0);
  grad += rippleGrad(p, vec2( 0.28, 0.82), 32.15, 0.11, 28.0, 0.82, 2.1);
  grad += rippleGrad(p, vec2(-0.30, 0.86), 33.15, 0.11, 28.0, 0.82, 2.1);
  grad += rippleGrad(p, vec2(-0.24, 0.28), 54.00, 0.10, 29.0, 0.78, 2.2);
  grad += rippleGrad(p, vec2( 0.32, 0.56), 61.60, 0.14, 28.0, 0.84, 2.8);
  grad += rippleGrad(p, vec2(-0.30, 0.12), 61.64, 0.12, 28.0, 0.82, 2.8);
  // 3) The breath draws a ring in across the water; strength surging sends one out hard.
  vec2 kd = p - uKataC.xz;
  float kr = length(kd);
  vec2 kn = kd / max(kr, 1e-3);
  if (uInhale > 0.001) {
    float e = kr - 2.8 * (1.0 - uInhale);
    grad += kn * cos(e * 26.0) * exp(-e * e * 10.0) * 0.07 * uInhale;
  }
  grad += rippleGrad(p, uKataC.xz, 51.02, 0.30, 15.0, 2.4, 2.6);
  grad += rippleGrad(p, uKataC.xz, 51.10, 0.16, 24.0, 1.7, 2.2);
  // 4) The wind on the pool: chop that spirals with the vortex, gusts streaking across it. It runs on the
  // world's clock, so it freezes with everything else.
  float galeK = uGaleSpd * uGaleView;
  if (uGaleVis > 0.001) {
    float ang = atan(kd.y, kd.x), ph = uWindPh * 2.2;
    vec2 tg = vec2(-kn.y, kn.x);
    float chop = sin(kr * 21.0 - ang * 3.0 + ph * 7.0) + 0.6 * sin(kr * 37.0 + ang * 5.0 + ph * 11.0) + 0.5 * sin(dot(p, vec2(31.0, 17.0)) + ph * 13.0);
    float gustN = fbm2(vec2(kr * 2.0 - ph * 1.4, ang * 1.6));
    float k = uGaleVis * (0.35 + 0.65 * galeK) * exp(-kr * 0.22) * uGaleView;
    grad += (kn * chop * 0.032 + tg * (gustN - 0.5) * 0.09) * k;
  } else if (uWindVortex > 0.01) {
    float ang = atan(kd.y, kd.x);
    grad += kn * sin(kr * 18.0 - uTime * 6.5 + ang * 2.0) * 0.045 * uWindVortex * exp(-kr * 0.45);
  }
  if (uRain > 0.001) grad += rainGrad(p);
  // 4) Moash's 5 dropped spheres plopping into the foreground puddle (67.4..68.08s)
  grad += rippleGrad(p, vec2(0.28, 2.38), 67.40, 0.07, 27.0, 0.88, 3.4);
  grad += rippleGrad(p, vec2(0.46, 2.52), 67.56, 0.07, 29.0, 0.84, 3.4);
  grad += rippleGrad(p, vec2(0.16, 2.66), 67.74, 0.07, 26.0, 0.82, 3.4);
  grad += rippleGrad(p, vec2(0.55, 2.28), 67.90, 0.07, 31.0, 0.80, 3.4);
  grad += rippleGrad(p, vec2(0.32, 2.16), 68.08, 0.07, 28.0, 0.84, 3.4);

  // Subtle stone bump outside puddle, crisp mirror normal inside puddle
  vec2 stoneG = vec2(n2(p * 14.0 + vec2(0.1, 0.0)) - n2(p * 14.0), n2(p * 14.0 + vec2(0.0, 0.1)) - n2(p * 14.0)) * 0.45 * (1.0 - puddle);
  vec3 N = normalize(vec3(-(grad.x * puddle * 2.1 + stoneG.x), 1.0, -(grad.y * puddle * 2.1 + stoneG.y)));
  vec3 V = normalize(uCamPos - vWorld);
  float fresnel = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 4.0);

  vec3 col = vec3(0.0);
  float wallVis = 1.0 - uWallDim * 0.82;

  // Overhead narrow blue sky rift reflected cleanly in the dark mirror puddle
  vec3 skyCol = mix(vec3(0.10, 0.18, 0.28), vec3(0.75, 0.64, 0.36), clamp(uRiftSun - 0.22, 0.0, 1.0)) * (0.34 + uRiftSun * 1.1) * wallVis;
  col += stoneCol * (skyCol * 0.85 + vec3(0.015, 0.022, 0.028));
  float riftMirror = smoothstep(0.95, 0.10, abs(p.x - sin(p.y * 0.12) * 0.45));
  col += skyCol * puddle * (0.14 + 0.58 * fresnel) * riftMirror;

  // Warm sputtering torches — rich amber-orange diffuse + liquid gold puddle reflection!
  for (int k = 0; k < 2; k++) {
    vec3 lp = (k == 0) ? uTorchA : uTorchB;
    vec3 L = lp - vWorld;
    float d = length(L);
    L /= max(d, 0.001);
    float att = (k == 0 ? 1.25 : 0.72) / (1.0 + 0.24 * d * d);
    vec3 tCol = vec3(1.65, 0.68, 0.18) * uTorchFlick * wallVis * att;
    col += stoneCol * tCol * max(dot(N, L), 0.0) * 1.9;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), mix(18.0, 150.0, puddle));
    col += tCol * spec * mix(0.18, 1.85, puddle);
  }

  // Syl's pale-cyan light gliding across the dark water surface!
  {
    vec3 L = uSylPos - vWorld;
    float d = length(L);
    L /= max(d, 0.001);
    float att = 1.0 / (1.0 + 0.28 * d * d);
    vec3 sCol = vec3(0.42, 0.82, 1.32) * uSylGlow * att;
    col += stoneCol * sCol * max(dot(N, L), 0.0) * 1.65;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), mix(24.0, 180.0, puddle));
    col += sCol * spec * mix(0.18, 2.35, puddle);
  }

  // The pool as a mirror: everything that gives light, seen in the water through its ripples.
  {
    vec4 rc = uReflMat * vec4(vWorld.x, 0.0, vWorld.z, 1.0);
    vec2 ruv = rc.xy / rc.w + grad * vec2(0.10, 0.06) * puddle;
    vec3 refl = textureLod(tRefl, ruv, 0.0).rgb;
    float rk = puddle * mix(0.42, 0.95, fresnel) + (1.0 - puddle) * wetRim * 0.10;
    col += refl * rk;
  }

  // Spray torn off the surface where the wind rakes it
  if (uGaleVis > 0.001) {
    float ang = atan(kd.y, kd.x), ph = uWindPh * 2.2;
    float foam = smoothstep(0.66, 0.94, n2(vec2(kr * 9.0 - ph * 3.0, ang * 7.0 + ph * 0.9)));
    vec3 lit = vec3(0.30, 0.42, 0.58) + vec3(0.45, 0.75, 1.15) * uSylGlow / (1.0 + 0.4 * dot(uSylPos - vWorld, uSylPos - vWorld));
    col += lit * foam * uGaleVis * (0.25 + 0.75 * galeK) * puddle * exp(-kr * 0.3) * 0.22;
  }

  // Memory colour shimmer in the damp stone & water
  col += stoneCol * uMemCol * uMemMix * 0.42;
  col += uMemCol * uMemMix * puddle * (0.06 + 0.24 * fresnel) * (0.65 + 0.35 * fine);

  // Moash's spheres in the puddle: "causing it to glow" [wok:27]. Light spreads through the shallow water,
  // each sphere a small bright point, the rings it made catching that light as they travel.
  if (uPuddleGlow > 0.001) {
    vec2 sp0 = vec2(0.28, 2.38), sp1 = vec2(0.46, 2.52), sp2 = vec2(0.16, 2.66), sp3 = vec2(0.55, 2.28), sp4 = vec2(0.32, 2.16);
    vec3 gems = vec3(0.0);
    gems += vec3(0.30, 0.62, 1.40) * exp(-dot(p - sp0, p - sp0) * 90.0);
    gems += vec3(1.00, 1.00, 1.08) * exp(-dot(p - sp1, p - sp1) * 110.0);
    gems += vec3(1.25, 0.86, 0.36) * exp(-dot(p - sp2, p - sp2) * 90.0);
    gems += vec3(0.34, 0.66, 1.40) * exp(-dot(p - sp3, p - sp3) * 90.0);
    gems += vec3(0.96, 0.98, 1.06) * exp(-dot(p - sp4, p - sp4) * 110.0);
    float ds = length(p - uSpherePos.xz);
    vec3 under = vec3(0.42, 0.66, 1.0) * exp(-ds * ds * 0.9) * (0.75 + 0.25 * fine);
    float caustic = pow(fbm2(p * 7.0 + vec2(uTime * 0.21, -uTime * 0.17)), 3.0) * 2.2;
    float crest = clamp(length(grad) * 2.2, 0.0, 1.0) * exp(-ds * 1.6);
    vec3 glow = under * (0.22 + 0.30 * caustic) + gems * 1.2 + vec3(0.55, 0.78, 1.1) * crest * 0.10;
    col += glow * uPuddleGlow * puddle;
  }

  float camD = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-camD * uFogDen);
  col = mix(col, uFogCol, fog);

  frag = vec4(col, 1.0);
}`;

// ---- Overhead Jagged Sky Rift + Layered Volumetric Sunbeam Shafts ----
const SKY_V = /* glsl */`out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = /* glsl */`precision highp float;
${GLSL_NOISE}
uniform float uTime, uRiftSun, uWallDim, uMemMix;
uniform vec3 uMemCol;
in vec2 vUv; out vec4 frag;
void main() {
  float jagged = (fbm2(vec2(vUv.y * 8.5, 2.1)) - 0.5) * 0.22;
  float slit = 1.0 - smoothstep(0.08, 0.34, abs(vUv.x - 0.5 + jagged));
  float ends = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
  vec3 sky = mix(vec3(0.22, 0.44, 0.76), vec3(1.18, 0.98, 0.64), clamp(uRiftSun - 0.18, 0.0, 1.0));
  sky = mix(sky, uMemCol * 0.85, uMemMix * 0.28);
  float a = slit * ends * (1.0 - uWallDim * 0.85) * (0.62 + uRiftSun * 0.75);
  frag = vec4(sky * a, a);
}`;

const BEAM_V = /* glsl */`out vec2 vUv; out float vFace;
void main() {
  vUv = uv;
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vFace = abs(dot(wn, normalize(cameraPosition - wp)));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const BEAM_F = /* glsl */`precision highp float;
${GLSL_NOISE}
uniform float uTime, uRiftSun, uSylGlow, uWallDim;
in vec2 vUv; in float vFace; out vec4 frag;
void main() {
  float streaks = 0.55 + 0.45 * fbm2(vec2(vUv.x * 11.0 + uTime * 0.025, vUv.y * 1.2));
  float vert = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
  float soft = pow(clamp(vFace, 0.0, 1.0), 1.65);
  float goldK = clamp(uRiftSun - 0.22, 0.0, 1.0);
  float baseK = (0.14 + goldK * 0.95 + uSylGlow * 0.16) * (1.0 - uWallDim * 0.65);
  vec3 col = mix(vec3(0.32, 0.58, 0.92), vec3(1.25, 0.96, 0.52), goldK);
  frag = vec4(col * baseK * vert * soft * streaks * 0.34, 1.0);
}`;

// ---- Volumetric Multi-Layer 3D Torch Flame (crossed planes + inner white-hot core + turbulent fire tongues) ----
const FLAME_V = /* glsl */`
in float aLayer;
out vec2 vUv;
out float vLayer;
uniform float uFxTime, uGaleSpd, uBurst, uGaleView;
void main() {
  vUv = uv;
  vLayer = aLayer;
  vec3 p = position;
  // The wind lays the flame over and tears at it.
  float h0 = clamp(uv.y, 0.0, 1.0);
  float bend = (uGaleSpd * 0.9 * uGaleView + uBurst * 1.5) * h0 * h0;
  p.x += bend * 0.20 + sin(uFxTime * 29.0 + h0 * 9.0 + aLayer) * 0.05 * bend;
  p.z -= bend * 0.12;
  p.y *= 1.0 - min(bend, 1.0) * 0.25;
  // Wind draft sways flame tips organically (stronger during Him and the Wind!)
  float h = clamp(uv.y, 0.0, 1.0);
  p.x += sin(uFxTime * 11.5 + h * 5.0 + aLayer * 2.1) * 0.045 * h * h;
  p.z += cos(uFxTime * 9.3 + h * 4.2 + aLayer * 1.7) * 0.035 * h * h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FLAME_F = /* glsl */`precision highp float;
${GLSL_NOISE}
uniform float uFxTime, uWallDim;
in vec2 vUv; in float vLayer; out vec4 frag;
void main() {
  vec2 uv = vUv;
  float t = uFxTime * 6.8 + vLayer * 3.7;
  float turb = (fbm2(vec2(uv.x * 3.8 + vLayer * 1.9, uv.y * 3.4 - t)) - 0.5) * 0.48 * uv.y;
  float x = (uv.x - 0.5 + turb) * 2.15;
  float y = uv.y;

  // Tapered licking teardrop fire profile
  float halfW = 0.52 * pow(clamp(1.0 - y, 0.0, 1.0), 0.72) * (0.75 + 0.55 * n2(vec2(y * 5.0 - t * 1.1, vLayer)));
  float body = (1.0 - smoothstep(halfW * 0.25, halfW, abs(x))) * smoothstep(0.0, 0.14, y) * smoothstep(1.0, 0.35, y);
  float lick = fbm2(vec2(x * 4.0 + vLayer, y * 5.2 - t * 1.35));
  float mask = smoothstep(0.18, 0.72, body * (0.55 + 0.85 * lick));

  // White-gold fuel core -> fierce amber -> deep crimson-orange flame tip
  float core = exp(-(x * x * 14.0 + pow(y - 0.22, 2.0) * 18.0));
  vec3 cTip = vec3(1.15, 0.20, 0.02);
  vec3 cMid = vec3(2.15, 0.82, 0.12);
  vec3 cHot = vec3(3.10, 2.45, 1.35);
  vec3 col = mix(cTip, cMid, clamp((1.0 - y) * 1.25 + lick * 0.3, 0.0, 1.0));
  col = mix(col, cHot, clamp(core * 1.35, 0.0, 1.0));

  float vis = 1.0 - uWallDim * 0.80;
  frag = vec4(col * (mask * 0.85 + core * 1.15) * vis * 0.55, 1.0);
}`;

// ---- Rising Glowing Torch Embers + Soft Illuminated Smoke Wisps ----
const EMBER_V = /* glsl */`
in vec4 aSeed; // x phase, y life, z speed, w radius
uniform float uFxTime, uWallDim, uGaleSpd, uGaleView;
uniform vec3 uCamPos, uTorchA;
out vec2 vUv;
out float vA;
out vec3 vCol;
void main() {
  vUv = uv;
  float age = mod(uFxTime * aSeed.z + aSeed.x * aSeed.y, aSeed.y);
  float u = age / aSeed.y;
  vec3 p = uTorchA + vec3(
    sin(u * 9.0 + aSeed.x * 24.0) * (0.06 + u * 0.32) + u * 0.14,
    0.10 + u * (1.25 + aSeed.w * 1.1),
    cos(u * 7.5 + aSeed.x * 19.0) * (0.06 + u * 0.28)
  ) + vec3(1.8, -0.35, -0.9) * u * uGaleSpd * uGaleView;
  vec3 toCam = normalize(uCamPos - p);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, rt);
  float sz = (0.011 + aSeed.w * 0.014) * (1.0 - u * 0.65);
  vec3 wp = p + (rt * position.x + up * position.y) * sz;
  vA = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.45, 1.0, u)) * (1.0 - uWallDim * 0.82);
  vCol = mix(vec3(2.8, 1.5, 0.35), vec3(1.6, 0.35, 0.05), u);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const EMBER_F = /* glsl */`precision highp float;
in vec2 vUv; in float vA; in vec3 vCol; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  frag = vec4(vCol * exp(-r2 * 5.0) * vA, 1.0);
}`;

// ---- Low Drifting Volumetric Chasm Floor Mist (swirls into a wind-vortex during Him and the Wind!) ----
const MIST_V = /* glsl */`
in vec4 aMist; // x, y, z, seed
uniform float uFxTime, uWindVortex, uWallDim, uInhale, uBurst;
uniform vec3 uCamPos, uKataC;
out vec2 vUv;
out float vA;
out float vSeed;
void main() {
  vUv = uv;
  vSeed = aMist.w;
  vec3 p = aMist.xyz;
  // Gentle canyon drift normally, curling softly inward & upward when the wind wakes!
  float ang = aMist.w * 6.283 + uFxTime * (0.12 + uWindVortex * 0.95);
  float r = length(p.xz);
  vec2 drift = vec2(sin(uFxTime * 0.16 + aMist.w * 15.0) * 0.55, cos(uFxTime * 0.12 + aMist.w * 12.0) * 0.55);
  vec2 vortex = vec2(cos(ang), sin(ang)) * mix(r, 0.85 + 0.55 * aMist.w, uWindVortex * 0.65);
  p.xz = mix(p.xz + drift, vortex, uWindVortex * 0.72);
  p.y += uWindVortex * (0.28 + 0.52 * aMist.w) * (0.5 + 0.5 * sin(uFxTime * 1.4 + aMist.w * 10.0));
  // Drawn in with his breath, thrown out when strength surges.
  vec2 kd = p.xz - uKataC.xz;
  p.xz = uKataC.xz + kd * (1.0 - uInhale * 0.45) + normalize(kd + 1e-4) * uBurst * 1.6;

  vec3 toCam = normalize(uCamPos - p);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, rt);
  float sz = (0.95 + aMist.w * 1.05) * (1.0 - uWindVortex * 0.18);
  vec3 wp = p + (rt * position.x + up * position.y) * sz;
  vA = (0.048 + uWindVortex * 0.03) * (1.0 - uWallDim * 0.55);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const MIST_F = /* glsl */`precision highp float;
${GLSL_NOISE}
uniform float uTime, uSylGlow, uMemMix, uRiftSun;
uniform vec3 uMemCol;
in vec2 vUv; in float vA; in float vSeed; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float cloud = fbm2(vUv * 2.4 + vec2(uTime * 0.07 + vSeed * 9.0, -uTime * 0.04));
  // Smooth radial zero-at-border falloff so ZERO billboard quad edges ever appear!
  float edge = pow(clamp(1.0 - r2, 0.0, 1.0), 2.6);
  float soft = edge * smoothstep(0.26, 0.84, cloud);
  vec3 col = mix(vec3(0.14, 0.22, 0.32), vec3(0.38, 0.72, 1.15), clamp(uSylGlow * 0.55, 0.0, 1.0));
  col = mix(col, uMemCol * 0.85, uMemMix * 0.45);
  col += vec3(0.55, 0.45, 0.22) * clamp(uRiftSun - 0.25, 0.0, 1.0) * 0.40;
  frag = vec4(col * soft * vA, 1.0);
}`;

// Build a detailed 3D oil-soaked torch wedged tightly into stone cleft
function buildTorch(pos, tiltZ, tiltX, flameMat) {
  const tg = new THREE.Group();
  tg.position.copy(pos);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1b12, roughness: 0.90 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x1a130e, roughness: 0.95 });
  // Glowing hot oil-charred embers embedded in the wrapped cloth head!
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x1b0b04, emissive: new THREE.Color(2.4, 0.55, 0.06), emissiveIntensity: 1.35, roughness: 0.85,
  });

  const body = new THREE.Group();
  body.rotation.set(tiltX, 0, tiltZ);

  // Gnarled wooden shaft reaching firmly down into the boulder cleft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.017, 1.05, 10), woodMat);
  shaft.position.y = -0.46;
  body.add(shaft);

  // Irregular oil-soaked cloth wrapping head + twine bindings
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.034, 0.22, 12), clothMat);
  wrap.position.y = 0.04;
  body.add(wrap);
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.044 - k * 0.004, 0.004, 6, 14), woodMat);
    ring.rotation.x = Math.PI / 2 + 0.15;
    ring.position.y = -0.02 + k * 0.05;
    body.add(ring);
  }
  // Glowing coal crown at the top of the wrapped cloth
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.046, 1), emberMat);
  crown.scale.set(1.05, 0.72, 1.05);
  crown.position.y = 0.14;
  body.add(crown);
  tg.add(body);

  // Multi-layer 3D volumetric flame (3 intersecting angled planes + inner core so it looks real from EVERY orbit angle!)
  const fg = new THREE.BufferGeometry();
  const fPos = [], fUv = [], fLayer = [], fIdx = [];
  const planes = [
    { ang: 0.0, w: 0.34, h: 0.56, layer: 0 },
    { ang: Math.PI / 3, w: 0.30, h: 0.52, layer: 1 },
    { ang: (2 * Math.PI) / 3, w: 0.32, h: 0.48, layer: 2 },
  ];
  let base = 0;
  for (const pl of planes) {
    const c = Math.cos(pl.ang) * pl.w * 0.5, s = Math.sin(pl.ang) * pl.w * 0.5;
    fPos.push(-c, 0, -s, c, 0, s, -c, pl.h, -s, c, pl.h, s);
    fUv.push(0, 0, 1, 0, 0, 1, 1, 1);
    fLayer.push(pl.layer, pl.layer, pl.layer, pl.layer);
    fIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    base += 4;
  }
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fPos, 3));
  fg.setAttribute('uv', new THREE.Float32BufferAttribute(fUv, 2));
  fg.setAttribute('aLayer', new THREE.Float32BufferAttribute(fLayer, 1));
  fg.setIndex(fIdx);

  const flames = new THREE.Mesh(fg, flameMat);
  flames.position.set(0, 0.10, 0);
  flames.renderOrder = 16;
  tg.add(flames);
  return { group: tg, emberMat };
}

export const Chasm = {
  async build(scene, prog, tick) {
    const r = rng(27042);
    const rockMat = chasmRockMaterial();
    const stoneMat = boulderMaterial();

    // 1. High-detail stepped sedimentary chasm walls (world-space 3D shader + chasmfiend claw gashes!)
    const leftWall = buildCliffWall(-1, G.tier, rockMat);
    const rightWall = buildCliffWall(1, G.tier, rockMat);
    scene.add(leftWall, rightWall);
    prog(0.28); await tick();

    // 2. Dark obsidian mirror crem floor & rippling rainwater puddle
    const floorGeo = new THREE.PlaneGeometry(10.5, 42, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FLOOR_V, fragmentShader: FLOOR_F, uniforms: U,
    }));
    floor.position.set(0, 0, -4.5);
    scene.add(floor);

    // 3. Narrow jagged overhead sky rift + 3 layered volumetric god-ray light shafts!
    const skyStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 36),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: SKY_V, fragmentShader: SKY_F,
        uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    skyStrip.rotation.x = Math.PI / 2;
    skyStrip.position.set(0.1, 24.0, -4.5);
    scene.add(skyStrip);

    const beamMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BEAM_V, fragmentShader: BEAM_F,
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (const [bx, bz, rTop, rBot, rz] of [
      [0.05, 0.15, 0.72, 2.35, -0.06],
      [-0.35, -2.6, 0.55, 1.95, 0.05],
      [0.40, -5.8, 0.60, 2.10, -0.04],
    ]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 23.5, 22, 1, true), beamMat);
      b.position.set(bx, 11.75, bz);
      b.rotation.z = rz;
      b.renderOrder = 10;
      scene.add(b);
    }
    prog(0.48); await tick();

    // 4. Angular stepped Rosharan boulders & tall cliff crag buttresses (4 distinct sculpted archetypes!)
    const det = G.tier ? 3 : 4;
    const archetypes = [
      stone(11, det, 0), stone(23, det, 1), stone(41, det, 2), stone(71, det, 3),
    ];
    const lists = archetypes.map(() => []);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

    // HERO BOULDER PAIR flanking a visible side-by-side V-cleft where Kaladin wedged his torch!
    const heroA = new THREE.Mesh(stone(107, G.tier ? 4 : 5, 3), stoneMat);
    heroA.position.set(-1.38, 0.28, -1.42);
    heroA.scale.set(0.46, 0.54, 0.48);
    heroA.rotation.set(0.10, 0.42, -0.22);
    heroA.castShadow = heroA.receiveShadow = true;
    scene.add(heroA);

    const heroB = new THREE.Mesh(stone(131, G.tier ? 4 : 5, 0), stoneMat);
    heroB.position.set(-2.14, 0.48, -1.60);
    heroB.scale.set(0.62, 0.78, 0.64);
    heroB.rotation.set(-0.08, 1.12, 0.20);
    heroB.castShadow = heroB.receiveShadow = true;
    scene.add(heroB);

    // Scatter angular boulders, stepped slabs, and tall wall-hugging crags down both sides of the chasm
    const nRocks = G.tier ? 28 : 48;
    for (let i = 0; i < nRocks; i++) {
      const side = i % 2 ? 1 : -1;
      const z = lerp(-18, 8.5, r());
      // Keep hero torch cleft & center kata arena clear
      if (side < 0 && z > -2.5 && z < -0.7) continue;
      const cx = canyonCenterX(z);
      const hw = canyonHalfWidth(z, 0.6);
      const isCrag = r() < 0.30;
      const ki = isCrag ? 2 : (r() < 0.4 ? 3 : r() < 0.7 ? 1 : 0);
      const s = isCrag ? 0.75 + r() * 0.95 : 0.34 + r() * 0.68;
      v.set(
        cx + side * (hw - (isCrag ? 0.05 : 0.25 + r() * 0.48)),
        isCrag ? s * 0.75 : s * 0.22,
        z
      );
      eu.set((r() - 0.5) * 0.25, r() * TAU, (r() - 0.5) * 0.22);
      q.setFromEuler(eu);
      sc.set(s * (0.85 + r() * 0.45), s * (isCrag ? 1.45 + r() * 0.8 : 0.65 + r() * 0.4), s * (0.85 + r() * 0.5));
      lists[ki].push(m4.compose(v, q, sc).clone());
    }
    archetypes.forEach((g, ki) => {
      if (!lists[ki].length) return;
      const im = new THREE.InstancedMesh(g, stoneMat, lists[ki].length);
      lists[ki].forEach((m, j) => im.setMatrixAt(j, m));
      im.castShadow = im.receiveShadow = true;
      scene.add(im);
    });
    prog(0.68); await tick();

    // 5. Wan-yellow tube-shaped fungi tucked strictly inside rocky crevices & boulder seams (organic muted ochre-yellow!)
    const fungiMat = new THREE.MeshStandardMaterial({
      color: 0x867942, roughness: 0.66, metalness: 0.0, envMapIntensity: 0.18,
    });
    const fPts = [
      new THREE.Vector2(0.007, 0.0), new THREE.Vector2(0.011, 0.06),
      new THREE.Vector2(0.013, 0.12), new THREE.Vector2(0.017, 0.16), new THREE.Vector2(0.010, 0.17),
    ];
    const fungiGeo = new THREE.LatheGeometry(fPts, 10);
    const fungiSpots = [
      [-1.92, 0.30, -0.58], [-2.22, 0.42, -2.52], [2.22, 0.28, -0.65],
      [2.28, 0.34, -3.15], [-2.35, 0.36, 1.42], [2.20, 0.24, 1.55],
    ];
    const fMats = [];
    for (const [fx, fy, fz] of fungiSpots) {
      const cnt = 5 + (r() * 4 | 0);
      const sideSign = fx < 0 ? 1 : -1;
      for (let k = 0; k < cnt; k++) {
        v.set(fx + (r() - 0.5) * 0.18, fy + r() * 0.05, fz + (r() - 0.5) * 0.18);
        eu.set((r() - 0.5) * 0.45, r() * TAU, -sideSign * (0.28 + r() * 0.42));
        q.setFromEuler(eu);
        const s = 0.45 + r() * 0.65;
        sc.set(s, s * (0.7 + r() * 0.6), s);
        fMats.push(m4.compose(v, q, sc).clone());
      }
    }
    const fungiInst = new THREE.InstancedMesh(fungiGeo, fungiMat, fMats.length);
    fMats.forEach((m, i) => fungiInst.setMatrixAt(i, m));
    scene.add(fungiInst);

    // 6. Hanging thin chasm vines trailing from upper mossy overhangs
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x162414, roughness: 0.76 });
    const vineGroup = new THREE.Group();
    const nVines = G.tier ? 10 : 18;
    for (let i = 0; i < nVines; i++) {
      const side = i % 2 ? 1 : -1;
      const z = lerp(-14, 5, r());
      const yTop = 5.5 + r() * 8.0;
      const len = 2.6 + r() * 4.5;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        pts.push(new THREE.Vector3(Math.sin(u * 4.2 + i) * 0.08, -u * len, Math.cos(u * 3.1 + i) * 0.06));
      }
      const vm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.011, 5, false), vineMat);
      const cx = canyonCenterX(z);
      vm.position.set(cx + side * (canyonHalfWidth(z, yTop) - 0.16), yTop, z);
      vm.userData = { phase: r() * TAU };
      vineGroup.add(vm);
    }
    scene.add(vineGroup);

    // 7. Grounded salvaged Alethi weapons & armor pile resting naturally beside the left mossy boulders
    const pile = new THREE.Group();
    pile.position.set(-1.46, 0.01, -0.45);
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x2a1c13, roughness: 0.76, envMapIntensity: 0.35 });
    const shieldWood = new THREE.MeshStandardMaterial({ color: 0x38281c, roughness: 0.82, envMapIntensity: 0.25 });
    const steelSalv = new THREE.MeshStandardMaterial({ color: 0x4e5862, roughness: 0.48, metalness: 0.78, envMapIntensity: 0.65 });
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 1.85, 8), woodDark);
      sp.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.10, -0.45 + (r() - 0.5) * 0.42, (r() - 0.5) * 0.12);
      sp.position.set((r() - 0.5) * 0.30, 0.035 + i * 0.022, (r() - 0.5) * 0.32);
      pile.add(sp);
    }
    // Weathered wooden round shield with dark battered iron rim & boss
    const mkShield = (x, y, z, rx, ry, rz) => {
      const sg = new THREE.Group();
      sg.position.set(x, y, z); sg.rotation.set(rx, ry, rz);
      sg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.026, 20), shieldWood));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.014, 8, 22), steelSalv);
      rim.rotation.x = Math.PI / 2;
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8, 0, TAU, 0, Math.PI * 0.5), steelSalv);
      boss.position.y = 0.012;
      sg.add(rim, boss);
      return sg;
    };
    pile.add(mkShield(-0.10, 0.08, 0.16, 0.24, 0.35, 0.28));
    pile.add(mkShield(0.16, 0.04, -0.14, -0.14, 1.15, -0.12));
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10, 0, TAU, 0, Math.PI * 0.58), steelSalv);
    helm.position.set(0.22, 0.015, 0.22);
    helm.rotation.z = 0.26;
    pile.add(helm);
    scene.add(pile);

    // 8. Hero oil-soaked torch wedged tightly into the mossy boulder cleft + distant bend torch + rising embers
    const flameMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FLAME_V, fragmentShader: FLAME_F,
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const tA = buildTorch(U.uTorchA.value, -0.32, 0.12, flameMat);
    const tB = buildTorch(U.uTorchB.value, 0.26, -0.08, flameMat);
    scene.add(tA.group, tB.group);
    Mirror.add(tA.group); Mirror.add(tB.group);

    // Rising glowing ember sparks from the hero torch
    const nEmbers = G.tier ? 24 : 44;
    const eGeo = new THREE.InstancedBufferGeometry();
    eGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
    eGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    eGeo.setIndex([0, 1, 2, 1, 3, 2]);
    const eSeed = new Float32Array(nEmbers * 4);
    for (let i = 0; i < nEmbers; i++) {
      eSeed[i * 4] = r(); eSeed[i * 4 + 1] = 1.6 + r() * 2.2; eSeed[i * 4 + 2] = 0.75 + r() * 0.65; eSeed[i * 4 + 3] = r();
    }
    eGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(eSeed, 4));
    eGeo.instanceCount = nEmbers;
    const embers = new THREE.Mesh(eGeo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: EMBER_V, fragmentShader: EMBER_F,
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    embers.frustumCulled = false; embers.renderOrder = 17;
    scene.add(embers);
    Mirror.add(embers);

    // 9. Low drifting volumetric chasm floor mist (responds to the wind during Him and the Wind!)
    const nMist = G.tier ? 18 : 30;
    const mGeo = new THREE.InstancedBufferGeometry();
    mGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
    mGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    mGeo.setIndex([0, 1, 2, 1, 3, 2]);
    const mArr = new Float32Array(nMist * 4);
    for (let i = 0; i < nMist; i++) {
      mArr[i * 4]     = (r() - 0.5) * 3.8;
      mArr[i * 4 + 1] = 0.25 + r() * 0.85;
      mArr[i * 4 + 2] = lerp(-9.5, 3.2, r());
      mArr[i * 4 + 3] = r();
    }
    mGeo.setAttribute('aMist', new THREE.InstancedBufferAttribute(mArr, 4));
    mGeo.instanceCount = nMist;
    const mist = new THREE.Mesh(mGeo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: MIST_V, fragmentShader: MIST_F,
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    mist.frustumCulled = false; mist.renderOrder = 11;
    scene.add(mist);

    G.tick.push((t) => {
      const fl = U.uTorchFlick.value * (1 - U.uWallDim.value * 0.8);
      tA.emberMat.emissiveIntensity = 1.25 * fl;
      tB.emberMat.emissiveIntensity = 1.15 * fl;
      const gv = U.uGaleView.value;
      const windSway = 0.04 + 0.16 * U.uWindVortex.value + (0.32 * U.uGaleSpd.value + 0.5 * U.uBurst.value) * gv;
      const ft = U.uFxTime.value, wp = U.uWindPh.value * 11.0 * gv;
      for (const vm of vineGroup.children) {
        vm.rotation.z = Math.sin(ft * 1.45 + wp + vm.userData.phase) * windSway;
        vm.rotation.x = Math.cos(ft * 1.15 + wp * 0.8 + vm.userData.phase) * windSway * 0.6;
      }
    });

    prog(1);
  },
};
