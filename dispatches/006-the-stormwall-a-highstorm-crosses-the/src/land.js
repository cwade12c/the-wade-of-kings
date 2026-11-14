// The Stormwall · the land: slickrock floor, weathered formations, loose stone. One rock shader for all of it.
import * as THREE from 'three';
import { G, rng, fbm, ridged, vnoise, sm, lerp, clamp } from './core.js';
import { patch, F_WORLD_N, F_WET_LIGHT } from './mat.js';
import { mergeVertices } from '../../../assets/vendor/three/utils/BufferGeometryUtils.js';

// marks the film is staged around (x, z)
export const MARK = {
  boulder: [-5.6, -0.9],          // the stone the lens shelters behind
  budA: [-9.3, 4.2],             // the split rockbud of the opening
  budB: [-16.4, 7.3],            // the rockbud that wakes
  pool: [-15.5, 6.3, 1.25],      // the puddle beside it (x, z, radius)
};
const hollow = (x, z, cx, cz, r, d) => { const q = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r); return q > 4 ? 0 : -d * Math.exp(-q * 1.6); };

// height of the ground (metres). The valley runs east-west so the wall can be watched all the way in.
export function height(x, z) {
  let h = (fbm(x * 0.011 + 3, z * 0.011 + 7, 4) - 0.5) * 5.5 + (fbm(x * 0.06, z * 0.06, 3) - 0.5) * 0.55;
  const mid = 16 * Math.sin(x * 0.0035 + 1), off = Math.abs(z - mid), wide = 20 + 0.16 * Math.abs(x);
  const side = sm(wide, wide + 70, off);
  const form = ridged(x * 0.0055 + 11, z * 0.0055 + 5, 5), mask = sm(0.3, 0.62, fbm(x * 0.0021 + 40, z * 0.0021 + 9, 3));
  let f = form * form * 95 * mask * side;
  // shelves: wind and rain leave the rock stepped
  const st = 4.6 + 2.2 * vnoise(x * 0.004, z * 0.004), k = f / st, fl = Math.floor(k), fr = k - fl;
  f = (fl + sm(0.72, 0.98, fr)) * st;
  h += f + side * 3.5 * fbm(x * 0.02, z * 0.02, 3);
  // low knuckles of rock on the valley floor
  const kn = ridged(x * 0.045 + 3, z * 0.045 + 8, 3); h += sm(0.62, 0.95, kn) * 1.1 * (1 - side) * sm(6, 16, Math.hypot(x + 12, z - 4));
  // far country: mesas
  const far = sm(1100, 3600, Math.hypot(x, z)); if (far > 0) h += far * (ridged(x * 0.00055, z * 0.00055, 4) ** 2) * 300 * sm(0.3, 0.6, fbm(x * 0.00025 + 5, z * 0.00025, 2));
  h += hollow(x, z, MARK.pool[0], MARK.pool[1], MARK.pool[2], 0.09) + hollow(x, z, -11.5, 9.5, 1.6, 0.07) + hollow(x, z, -19.5, 3.5, 2.2, 0.08) + hollow(x, z, -13.2, 0.4, 1.0, 0.05);
  return h;
}
export function normalAt(x, z, out, e = 0.35) {
  return out.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
}

// ---- the rock shader: strata, grain, crem in the flats; wet, puddles, drops ----
const ROCK_HEAD = /* glsl */`
uniform vec4 uPool[4];
float rockCrack(vec3 p) { float c = abs(n3(p * vec3(0.9, 2.6, 0.9) + 7.0) - 0.5), c2 = abs(n3(p * vec3(2.3, 0.7, 2.3) + 3.0) - 0.5); return smoothstep(0.035, 0.0, min(c, c2 * 1.3)); }
float rockBump(vec3 p) { return n3(p * 1.7) * 0.6 + n3(p * 5.3 + 3.1) * 0.3 + n3(p * 17.0) * 0.1; }
`;
const ROCK_COLOR = /* glsl */`
${F_WORLD_N}
vec3 wp = vWp;
float warp = n2(wp.xz * 0.045) * 3.0 + n2(wp.xz * 0.19) * 0.9;
float strata = n2(vec2(wp.y * 1.15 + warp, 3.7)) * 0.65 + n2(vec2(wp.y * 4.2 + warp * 2.0, 9.1)) * 0.35;
float grain = fbm2(wp.xz * 1.3 + wp.y * 0.7);
float patchy = fbm2(wp.xz * 0.06 + 11.0);
vec3 rock = mix(vec3(0.44, 0.31, 0.22), vec3(0.30, 0.17, 0.12), smoothstep(0.3, 0.7, strata));          // tan and rust bands
rock = mix(rock, vec3(0.55, 0.46, 0.36), smoothstep(0.55, 0.85, patchy) * 0.7);                           // paler weathered faces
rock = mix(rock, vec3(0.20, 0.17, 0.16), smoothstep(0.62, 0.9, n2(wp.xz * 0.33 + 5.0)) * 0.45);           // dark varnish
float flatK = smoothstep(0.86, 0.985, Nw.y);
float low = n2(wp.xz * 0.21 + 2.0) * 0.6 + n2(wp.xz * 0.57 + 8.0) * 0.4;
rock = mix(rock, vec3(0.27, 0.20, 0.145), flatK * smoothstep(0.62, 0.35, low) * 0.8);                     // crem settled in the flats
rock *= 0.62 + 0.62 * grain;

rock *= 0.55 + 0.45 * smoothstep(-0.25, 0.5, Nw.y);                                                        // undersides and cracks are darker
// puddles: the lowest flats fill as the rain goes on
float pool = 0.0;
for (int i = 0; i < 4; i++) { vec2 dp = wp.xz - uPool[i].xy; pool = max(pool, 1.0 - dot(dp, dp) / (uPool[i].z * uPool[i].z)); }
float lowK = max(smoothstep(0.42 - 0.12 * uWet, 0.30 - 0.12 * uWet, low), smoothstep(0.0, 0.32, pool));
float pud = flatK * lowK * smoothstep(0.25, 1.0, uWet) * step(length(wp.xz - uCamPos.xz), 260.0);
float wetK = uWet * (0.55 + 0.45 * flatK);
rock *= mix(1.0, 0.46, uWet * (0.75 + 0.25 * grain));
rock = mix(rock, vec3(0.035, 0.03, 0.026), pud * 0.85);
// drops striking: pale flecks that flicker with the rain
float fleck = step(0.992 - 0.02 * uRain, n2(wp.xz * 11.0 + floor(uTime * 20.0) * vec2(17.0, 31.0))) * uRain * smoothstep(0.3, 0.9, Nw.y);
rock += vec3(0.5, 0.55, 0.62) * fleck * (0.15 + uDark * 0.1 + uFlash.w * 0.3) * smoothstep(60.0, 5.0, length(wp - uCamPos));
diffuseColor.rgb = rock;
`;
const ROCK_ROUGH = /* glsl */`
roughnessFactor = mix(mix(0.95, 0.8, grain), mix(0.82, 0.7, grain), wetK);
roughnessFactor = mix(roughnessFactor, 0.04, pud);
float gloss = mix(0.09 * wetK * (0.5 + grain), 1.0, pud); float pudK = pud;
`;
const ROCK_NORMAL = /* glsl */`
{ float e = 0.035; float b0 = rockBump(wp);
  vec3 g = vec3(rockBump(wp + vec3(e, 0.0, 0.0)) - b0, rockBump(wp + vec3(0.0, e, 0.0)) - b0, rockBump(wp + vec3(0.0, 0.0, e)) - b0) / e;
  float bk = 0.16 * smoothstep(140.0, 6.0, length(wp - uCamPos)) * (1.0 - pud);
  vec3 nW = normalize(Nw - (g - Nw * dot(g, Nw)) * bk);
  if (pud > 0.01) {                                              // rings where drops land
    vec2 q = wp.xz * 3.2, c = floor(q); vec3 r = textureLod(uNoise, (c + 0.5) / 256.0, 0.0).rba;
    float ph = fract(uTime * (0.9 + r.y) + r.z * 7.0), rr = length(fract(q) - 0.5 - (r.xz - 0.5) * 0.5);
    float ring = sin((rr - ph * 0.5) * 60.0) * exp(-abs(rr - ph * 0.5) * 22.0) * (1.0 - ph) * uRain;
    vec2 dv = normalize(fract(q) - 0.5 - (r.xz - 0.5) * 0.5 + 1e-4) * ring * 0.5;
    float wv = n2(wp.xz * 2.3 + uWindPh * 0.8) - 0.5;
    nW = normalize(mix(nW, vec3(dv.x + wv * 0.05 * uGust, 1.0, dv.y), pud));
  }
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz); }
`;
export function rockMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  return patch(m, { fHead: ROCK_HEAD, fColor: ROCK_COLOR, fRough: ROCK_ROUGH, fNormal: ROCK_NORMAL, fLight: F_WET_LIGHT,
    uniforms: { uPool: { value: [new THREE.Vector4(MARK.pool[0], MARK.pool[1], MARK.pool[2] * 1.15, 0), new THREE.Vector4(-11.5, 9.5, 1.7, 0), new THREE.Vector4(-19.5, 3.5, 2.3, 0), new THREE.Vector4(-13.2, 0.4, 1.05, 0)] } } });
}

// ---- a stone: an icosphere pushed about by noise. kind 0 boulder, 1 ledged slab, 2 crag, 3 block ----
function stone(seed, detail, kind) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, r = rng(seed), ox = r() * 90, oy = r() * 90, v = new THREE.Vector3();
  const lean = (r() - 0.5) * 0.5, lean2 = (r() - 0.5) * 0.5, cut = 0.45 + 0.4 * r(), el = 0.7 + 0.6 * r();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), up = (v.y + 1) / 2;
    if (kind === 3) { const k = 0.55; v.x = Math.sign(v.x) * Math.pow(Math.abs(v.x), k); v.y = Math.sign(v.y) * Math.pow(Math.abs(v.y), k); v.z = Math.sign(v.z) * Math.pow(Math.abs(v.z), k); }   // boxy
    let d = 0.7 + 0.5 * fbm(ox + v.x * 1.2 + v.y * 0.7, oy + v.z * 1.2 - v.y * 0.6, 4) + 0.16 * ridged(ox + v.x * 2.6 + v.y, oy + v.z * 2.6 - v.y, 3) + (detail > 3 ? 0.05 * (ridged(ox + v.x * 7 + v.y * 3, oy + v.z * 7 - v.y * 3, 3) - 0.5) : 0);
    if (kind === 2) {                                                                              // a crag: fluted, uneven, its top broken off
      const prof = lerp(1.0, 0.34, Math.pow(up, 1.35)) * (0.82 + 0.5 * vnoise(ox + up * 3.2, oy + a * 1.1));
      const flute = 1 - 0.16 * Math.pow(Math.abs(Math.sin(a * 3.0 + ox + 2.2 * vnoise(ox + a, up * 2.0))), 0.6);
      d *= prof * flute; const yy = Math.min(v.y, cut + 0.18 * vnoise(ox + v.x * 4, oy + v.z * 4)) * 2.3;
      v.set(v.x * d * el + lean * yy * 0.4, yy, v.z * d / el + lean2 * yy * 0.4);
    } else {
      const ledge = kind === 0 ? 0 : 0.085 * Math.tanh(3.2 * Math.sin(v.y * (kind === 3 ? 7.5 : 10.5) + 3.0 * vnoise(ox + a * 1.4, oy + v.y)));
      d *= 1 + ledge; d = Math.round(d * 7) / 7 * (kind === 0 ? 0.2 : 0.38) + d * (kind === 0 ? 0.8 : 0.62);
      v.x *= d; v.z *= d; v.y *= (kind === 1 ? 0.62 : kind === 3 ? 0.9 : 0.8) * (0.85 + 0.15 * d);
    }
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.2;                                                 // sits in the ground
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}

export const Land = {
  height, rocks: [],
  async build(scene, prog, tick) {
    const mat = rockMaterial(); this.mat = mat;
    // ---- terrain: one sheet, finest under the lens ----
    const N = G.tier ? 230 : 400, R = 9000, KW = 7.2, CX = -12, CZ = 4, SH = Math.sinh(KW);
    const pos = new Float32Array((N + 1) * (N + 1) * 3), idx = new Uint32Array(N * N * 6);
    const w = (u) => R * Math.sinh(KW * u) / SH;
    let k = 0;
    for (let j = 0; j <= N; j++) {
      const z = CZ + w(j / N * 2 - 1);
      for (let i = 0; i <= N; i++) { const x = CX + w(i / N * 2 - 1); pos[k++] = x; pos[k++] = height(x, z); pos[k++] = z; }
      if ((j & 31) === 0) { prog(0.6 * j / N); await tick(); }
    }
    k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const p0 = j * (N + 1) + i, p1 = p0 + 1, p2 = p0 + N + 1, p3 = p2 + 1; idx[k++] = p0; idx[k++] = p2; idx[k++] = p1; idx[k++] = p1; idx[k++] = p2; idx[k++] = p3; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, mat); ground.receiveShadow = true; ground.castShadow = true; ground.frustumCulled = false; scene.add(ground);
    prog(0.7); await tick();

    // ---- loose stone and standing rock: [geometry near, geometry far] per kind ----
    const hi = G.tier ? 3 : 4;
    const kinds = [[0, 11], [1, 23], [1, 37], [2, 41], [2, 59], [2, 67], [3, 71], [3, 83]].map(([k, sd]) => [stone(sd, hi, k), stone(sd, 2, k), k]);
    const lists = kinds.map(() => [[], []]), r = rng(7), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const CRAG = [3, 4, 5], BLOCK = [6, 7], LOOSE = [0, 1, 2];
    const pick = (a) => a[r() * a.length | 0];
    const put = (ki, x, z, sx, sy, sz, ry, sink = 0.2, tilt = 0.25) => {
      e.set((r() - 0.5) * tilt, ry, (r() - 0.5) * tilt); q.setFromEuler(e); s.set(sx, sy, sz); p.set(x, height(x, z) - sink * sy, z);
      const size = Math.max(sx, sy, sz), dist = Math.hypot(x + 12, z - 4);
      lists[ki][size / (dist + 4) > 0.035 ? 0 : 1].push(m4.compose(p, q, s).clone()); this.rocks.push([x, z, Math.max(sx, sz)]);
    };
    const nearMark = (x, z) => Math.hypot(x - MARK.budA[0], z - MARK.budA[1]) < 1.6 || Math.hypot(x - MARK.budB[0], z - MARK.budB[1]) < 2.2 || Math.hypot(x - MARK.pool[0], z - MARK.pool[1]) < 2.0 || (Math.abs(z - 4.5) < 5 && x > -22 && x < -7.5);
    // the formations: blocks and crags heaped where the ground stands up, scree below them
    const want = G.tier ? 520 : 900;
    for (let i = 0; i < 9000 && this.rocks.length < want; i++) {
      const far = r() < 0.35, x = far ? -12 + (r() - 0.5) * 1700 : -12 + (r() - 0.5) * 300, z = far ? 4 + (r() - 0.5) * 1500 : 4 + (r() - 0.5) * 280;
      const h0 = height(x, z), slope = Math.abs(height(x + 2, z) - h0) + Math.abs(height(x, z + 2) - h0);
      const onForm = h0 > 5 || slope > 1.0;
      if (!onForm && r() > 0.12) continue; if (nearMark(x, z)) continue;
      const big = Math.pow(r(), 2.6), sc = (onForm ? 1.2 + 9 * big : 0.25 + 2.0 * big) * (far ? 2.2 : 1), u = r();
      if (onForm && u < 0.34) put(pick(CRAG), x, z, sc * (0.7 + r() * 0.5), sc * (0.9 + r() * 1.3), sc * (0.7 + r() * 0.5), r() * 6.28, 0.22, 0.4);
      else if (onForm && u < 0.72) put(pick(BLOCK), x, z, sc * (1.0 + r() * 1.2), sc * (0.6 + r() * 0.7), sc * (1.0 + r() * 1.2), r() * 6.28, 0.3, 0.16);
      else put(pick(LOOSE), x, z, sc * (0.8 + r() * 0.7), sc * (0.6 + r() * 0.5), sc * (0.8 + r() * 0.7), r() * 6.28, 0.25, 0.3);
    }
    // great crags and mesas on the skyline, both sides of the valley
    for (let i = 0; i < 60; i++) {
      const x = -1000 + r() * 2800, z = (r() < 0.5 ? -1 : 1) * (80 + r() * 560), sc = 9 + 34 * Math.pow(r(), 2);
      if (r() < 0.5) put(pick(CRAG), x, z, sc * (0.8 + r() * 0.6), sc * (0.9 + r() * 1.2), sc * (0.7 + r() * 0.5), r() * 6.28, 0.25, 0.3);
      else put(pick(BLOCK), x, z, sc * (1.2 + r() * 1.4), sc * (0.7 + r() * 0.8), sc * (1.2 + r() * 1.4), r() * 6.28, 0.3, 0.1);
    }
    // small stones strewn near the lens
    for (let i = 0; i < 150; i++) { const x = -13 + (r() - 0.5) * 36, z = 4 + (r() - 0.5) * 32; if (nearMark(x, z)) continue; const sc = 0.05 + 0.22 * Math.pow(r(), 2); put(pick(LOOSE), x, z, sc * (0.8 + r() * 0.6), sc * (0.5 + r() * 0.4), sc * (0.8 + r() * 0.6), r() * 6.28, 0.3, 0.6); }
    kinds.forEach((gs, i) => { for (let l = 0; l < 2; l++) {
      if (!lists[i][l].length) continue;
      const im = new THREE.InstancedMesh(gs[l], mat, lists[i][l].length); lists[i][l].forEach((m, j) => im.setMatrixAt(j, m));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
    } });
    // the stone the lens shelters behind: finer, and set by hand
    const hero = new THREE.Mesh(stone(107, G.tier ? 4 : 5, 3), mat); const [bx, bz] = MARK.boulder;
    hero.position.set(bx, height(bx, bz) + 0.55, bz); hero.scale.set(2.3, 2.5, 3.0); hero.rotation.set(0.06, 0.5, -0.05); hero.castShadow = hero.receiveShadow = true; scene.add(hero);
    const hero2 = new THREE.Mesh(stone(131, 4, 0), mat); hero2.position.set(-18.6, height(-18.6, 9.4) + 0.1, 9.4); hero2.scale.set(1.2, 0.8, 1.5); hero2.rotation.y = 1.1; hero2.castShadow = hero2.receiveShadow = true; scene.add(hero2);
    this.rocks.push([bx, bz, 3.2], [-18.6, 9.4, 1.6]);
    prog(1); await tick();
  },
};
