// The Stormwall · the small lives: windspren (ribbons of light), lifespren (green motes over the plants), cremlings in the wet
import * as THREE from 'three';
import { U, G, rng, GLSL_COMMON, TAU, lerp } from './core.js';
import { patch } from './mat.js';
import { height, MARK, Land } from './land.js';
import { Flora } from './flora.js';
import { T } from './film.js';

// ---- windspren: each is a path in time; the ribbon is the last 0.8 s of it ----
const WIND_V = /* glsl */`
${GLSL_COMMON}
in vec4 aRib;        // mode, seed, start time, seed2
out float vK; out float vS; out float vOn;
vec3 path(float t, vec4 r) {
  float sd = r.y, s2 = r.w;
  if (r.x < 0.5) {                                 // the one that plays over the grass before the wind comes, then is gone with it
    vec3 p = vec3(${(MARK.budA[0] + 1.2).toFixed(2)}, uGround + 0.9, ${(MARK.budA[1] - 0.6).toFixed(2)}) + vec3(sin(t * 1.3 + 1.0) * 2.4 + sin(t * 3.1) * 0.6, 0.55 * sin(t * 2.2 + 2.0) + 0.22 * sin(t * 5.3), cos(t * 1.7 + 0.4) * 2.0 + cos(t * 2.9) * 0.5);
    float e = max(t - ${(T.WIND - 1.2).toFixed(1)}, 0.0); return p + vec3(-e * e * 7.0, e * e * 3.2, e * 2.0);
  }
  if (r.x < 1.5) {                                 // the half-dozen that run west after the storm's last gusts
    float e = t - r.z;
    return vec3(150.0 - 27.0 * e, uGround + 5.0 + 6.0 * sd + 1.5 * sin(t * 1.9 + sd * 20.0) + 0.5 * sin(t * 4.3 + s2 * 9.0), 4.0 + (s2 - 0.5) * 26.0 + 3.0 * sin(t * 1.1 + s2 * 20.0));
  }
  float e = max(t - r.z, 0.0), rr = 1.3 + 9.0 * exp(-e * 0.7);     // the one that comes back
  return vec3(-14.6 + rr * cos(e * 2.3 + 1.0), uGround + 0.75 + 0.35 * sin(e * 3.1) + 7.0 * exp(-e * 0.8), 6.2 + rr * sin(e * 2.3 + 1.0));
}
void main() {
  float tau = uTime - position.y * 0.8;
  vec3 p = path(tau, aRib), p2 = path(tau + 0.02, aRib);
  vec3 dir = normalize(p2 - p + vec3(1e-5)), toCam = normalize(uCamPos - p), side = normalize(cross(dir, toCam));
  float dist = length(p - uCamPos), w = (0.022 + 0.0016 * dist) * (1.0 - position.y * 0.9) * (0.6 + 0.4 * sin(position.y * 20.0 - uTime * 9.0));
  p += side * position.x * w;
  vK = position.y; vS = position.x;
  float on = aRib.x < 0.5 ? step(uTime, ${(T.WIND + 3).toFixed(1)}) : step(aRib.z, tau);
  vOn = on * (1.0 - uRain * 3.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (vOn < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const WIND_F = /* glsl */`
precision highp float;
in float vK; in float vS; in float vOn; out vec4 frag;
void main() { float a = (1.0 - vS * vS) * pow(1.0 - vK, 1.6) * vOn; frag = vec4(vec3(0.62, 0.82, 1.0) * a * (1.2 + 5.0 * pow(1.0 - vK, 6.0)), 1.0); }`;

// ---- lifespren: motes that rise over a plant once it has opened ----
const LIFE_V = /* glsl */`
${GLSL_COMMON}
in vec4 aHome; in vec4 aMote;     // aHome: x, y, z of the plant, time it opens; aMote: seeds
out vec2 vQ; out float vA;
void main() {
  float e = uTime - aHome.w - 2.0 - 3.0 * aMote.x;
  float cyc = fract(aMote.y + e * (0.10 + 0.08 * aMote.z)), reach = 0.5 + 1.1 * aMote.w;
  vec3 p = aHome.xyz + vec3(sin(e * (0.9 + aMote.x) + aMote.y * 40.0) * (0.15 + 0.5 * aMote.z) + sin(e * 2.7 + aMote.w * 30.0) * 0.07, 0.08 + cyc * reach + 0.05 * sin(e * 3.3 + aMote.z * 20.0), cos(e * (0.8 + aMote.w) + aMote.x * 40.0) * (0.15 + 0.5 * aMote.x) + cos(e * 2.3 + aMote.y * 30.0) * 0.07);
  float calm = step(aHome.w, 0.0) * (1.0 - smoothstep(${(T.WIND - 1).toFixed(1)}, ${(T.WIND + 2).toFixed(1)}, uTime)) * step(aMote.x, 0.3);    // a few lazy ones on the calm day
  float on = max(smoothstep(0.0, 2.5, e) * step(0.001, aHome.w), calm);
  vA = on * smoothstep(0.0, 0.12, cyc) * smoothstep(1.0, 0.6, cyc) * (0.6 + 0.4 * sin(e * 5.0 + aMote.y * 50.0));
  vec3 toCam = normalize(uCamPos - p), rt = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)), up = cross(toCam, rt);
  float dist = length(p - uCamPos), sz = 0.008 + 0.0022 * dist;
  p += (rt * position.x + up * position.y) * sz;
  vQ = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (vA < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const LIFE_F = /* glsl */`
precision highp float;
in vec2 vQ; in float vA; out vec4 frag;
void main() { float r2 = dot(vQ, vQ); if (r2 > 1.0) discard; float k = exp(-r2 * 5.0); frag = vec4(vec3(0.25, 1.0, 0.32) * (k * 3.2 + 0.25 * (1.0 - r2)) * vA, 1.0); }`;

// ---- cremlings: a shell on legs, running a short path out of its lair toward the wet ----
const CREM_VHEAD = /* glsl */`
attribute vec4 aP0; attribute vec4 aP1; attribute vec4 aP2; attribute vec4 aCr;   // three path points (xyz, -); aCr: t0, speed, seed, tint
attribute float aLeg;
varying vec3 vCr;
vec3 crPath(float u) { float a = (1.0 - u); return a * a * aP0.xyz + 2.0 * a * u * aP1.xyz + u * u * aP2.xyz; }
vec3 rotY(vec3 p, float c, float s) { return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
`;
const CREM_VNORMAL = /* glsl */`
float ce = max(uTime - aCr.x, 0.0) * aCr.y;
float gi = floor(ce), gf = fract(ce);                         // it runs in darts and stops to feed
float prog = (gi + smoothstep(0.0, 0.45, gf)) * 0.21;
float back = mod(floor(prog), 2.0), uu = fract(prog); uu = back > 0.5 ? 1.0 - uu : uu;
uu = 0.06 + 0.94 * uu;
vec3 cp = crPath(uu), cd = normalize(crPath(uu + 0.02) - crPath(uu - 0.02) + vec3(1e-5, 0.0, 0.0)) * (back > 0.5 ? -1.0 : 1.0);
float moving = step(gf, 0.45) * step(0.0, uTime - aCr.x);
vec3 lp = position;
if (aLeg > 0.5) { float sw = sin(uTime * 34.0 + aLeg * 2.4) * 0.5 * moving; lp.z += sw * 0.3 * abs(lp.x); lp.y += max(sw, 0.0) * 0.12; }
float cc = cd.x, cs = cd.z;                                 // the model's +z is its head
lp = vec3(lp.x * cs + lp.z * cc, lp.y, -lp.x * cc + lp.z * cs);
objectNormal = vec3(objectNormal.x * cs + objectNormal.z * cc, objectNormal.y, -objectNormal.x * cc + objectNormal.z * cs);
float outK = smoothstep(0.0, 1.2, uTime - aCr.x);
vec3 crPos = cp + lp * aP0.w * outK;
vCr = vec3(aCr.w, aLeg, position.y);
`;

export const Spren = {
  async build(scene, prog, tick) {
    const r = rng(404);
    // windspren
    const SEG = 40, P = [], I = [];
    for (let i = 0; i <= SEG; i++) P.push(-1, i / SEG, 0, 1, i / SEG, 0);
    for (let i = 0; i < SEG; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const wg = new THREE.InstancedBufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.setIndex(I);
    const ribs = [[0, 0.3, 0, 0.6]];
    for (let i = 0; i < 6; i++) ribs.push([1, r(), T.CLEAR - 4.5 + i * 0.7 + r() * 0.8, r()]);
    ribs.push([2, 0.5, T.CLEAR + 3.2, 0.5]);
    wg.setAttribute('aRib', new THREE.InstancedBufferAttribute(new Float32Array(ribs.flat()), 4)); wg.instanceCount = ribs.length;
    const wind = new THREE.Mesh(wg, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: WIND_V, fragmentShader: WIND_F, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    wind.frustumCulled = false; wind.renderOrder = 22; scene.add(wind);

    // lifespren: a handful to each plant near the lens
    const homes = [], motes = [], PER = G.tier ? 5 : 8;
    for (const b of Flora.buds) {
      if (Math.hypot(b[0] + 13, b[1] - 4) > 34) continue;
      const n = Math.round(PER * (0.5 + b[2] * 3) * (Math.hypot(b[0] + 14, b[1] - 5.5) < 6 ? 2 : 1));
      for (let k = 0; k < n; k++) { homes.push(b[0], height(b[0], b[1]) + b[2] * 0.5, b[1], b[3] > T.WAKE - 1 ? b[3] : 0); motes.push(r(), r(), r(), r()); }
    }
    for (const b of Flora.buds) if (b[4]) { homes.push(b[0], height(b[0], b[1]) + b[2] * 0.5, b[1], 0); motes.push(r() * 0.3, r(), r(), r()); }
    const lg = new THREE.InstancedBufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3)); lg.setIndex([0, 1, 2, 1, 3, 2]);
    lg.setAttribute('aHome', new THREE.InstancedBufferAttribute(new Float32Array(homes), 4)); lg.setAttribute('aMote', new THREE.InstancedBufferAttribute(new Float32Array(motes), 4)); lg.instanceCount = homes.length / 4;
    const life = new THREE.Mesh(lg, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: LIFE_V, fragmentShader: LIFE_F, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    life.frustumCulled = false; life.renderOrder = 21; scene.add(life);
    G.info.lifespren = homes.length / 4;
    prog(0.5); await tick();

    // cremlings: a domed shell in three plates, six legs
    const parts = [], legIds = [];
    const push = (g, leg) => { const n = g.attributes.position.count; parts.push(g); for (let i = 0; i < n; i++) legIds.push(leg); };
    for (let k = 0; k < 3; k++) { const g = new THREE.SphereGeometry(1, 9, 6, 0, TAU, 0, Math.PI * 0.55); g.scale(0.5 - 0.06 * k, 0.34 - 0.03 * k, 0.36); g.translate(0, 0.12, 0.3 - 0.3 * k); push(g, 0); }
    for (let k = 0; k < 6; k++) { const sd = k % 2 ? 1 : -1, g = new THREE.BoxGeometry(0.46, 0.035, 0.05); g.translate(sd * 0.23, 0, 0); g.rotateZ(-sd * 0.5); g.translate(sd * 0.3, 0.2, 0.3 - 0.3 * (k >> 1)); push(g, k + 1); }
    for (const sd of [-1, 1]) { const g = new THREE.BoxGeometry(0.02, 0.02, 0.5); g.rotateY(sd * 0.4); g.translate(sd * 0.12, 0.2, 0.7); push(g, 0); }
    const cg = new THREE.BufferGeometry(), cp = [], cn = [], ci = []; let base = 0;
    for (const g of parts) { cp.push(...g.attributes.position.array); cn.push(...g.attributes.normal.array); for (const k of g.index.array) ci.push(base + k); base += g.attributes.position.count; }
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3)); cg.setAttribute('aLeg', new THREE.Float32BufferAttribute(legIds, 1)); cg.setIndex(ci);
    const NC = G.tier ? 26 : 46, p0 = new Float32Array(NC * 4), p1 = new Float32Array(NC * 4), p2 = new Float32Array(NC * 4), cr = new Float32Array(NC * 4);
    const cm = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0 }), { vHead: CREM_VHEAD, vNormal: CREM_VNORMAL, vPos: 'transformed = crPos;', fHead: 'varying vec3 vCr;',
      fColor: `vec3 sh = mix(mix(vec3(0.34, 0.12, 0.08), vec3(0.20, 0.20, 0.09), step(0.33, vCr.x)), vec3(0.20, 0.09, 0.26), step(0.66, vCr.x));
               diffuseColor.rgb = vCr.y > 0.5 ? sh * 0.35 : sh * (0.6 + 0.5 * smoothstep(0.1, 0.4, vCr.z));`,
      fRough: 'roughnessFactor = mix(0.5, 0.2, uWet);' });
    const im = new THREE.InstancedMesh(cg, cm, NC), m4 = new THREE.Matrix4(), goals = [[MARK.pool[0], MARK.pool[1], MARK.pool[2]], [-11.5, 9.5, 1.3], [-19.5, 3.5, 1.9], [-13.2, 0.4, 0.8], [MARK.budB[0], MARK.budB[1], 0.8]];
    const lairs = Land.rocks.filter((k) => Math.hypot(k[0] + 14.5, k[1] - 5.5) < 13 && k[2] > 0.12);
    for (let i = 0; i < NC; i++) {
      const sc = 0.035 + 0.06 * r() * r(), gl = goals[i < 14 ? (i % 2 ? 0 : 4) : r() * goals.length | 0], lair = lairs.length ? lairs[r() * lairs.length | 0] : [gl[0] + 3, gl[1] + 3, 0.5];
      const a = r() * TAU, sx = i < 10 ? gl[0] + Math.cos(a) * (1.6 + 1.6 * r()) : lair[0] + Math.cos(a) * lair[2] * 0.9, sz = i < 10 ? gl[1] + Math.sin(a) * (1.6 + 1.6 * r()) : lair[1] + Math.sin(a) * lair[2] * 0.9;
      const b = r() * TAU, ex = gl[0] + Math.cos(b) * gl[2] * (0.5 + 0.6 * r()), ez = gl[1] + Math.sin(b) * gl[2] * (0.5 + 0.6 * r());
      const mx = lerp(sx, ex, 0.5) + (r() - 0.5) * 1.6, mz = lerp(sz, ez, 0.5) + (r() - 0.5) * 1.6;
      p0.set([sx, height(sx, sz), sz, sc], i * 4); p1.set([mx, height(mx, mz), mz, 0], i * 4); p2.set([ex, height(ex, ez) + 0.004, ez, 0], i * 4);
      cr.set([T.WAKE + 1.5 + (i < 10 ? i * 0.7 : 10 * r()), 1.1 + 0.9 * r(), r(), r()], i * 4);
      im.setMatrixAt(i, m4.identity());
    }
    cg.setAttribute('aP0', new THREE.InstancedBufferAttribute(p0, 4)); cg.setAttribute('aP1', new THREE.InstancedBufferAttribute(p1, 4)); cg.setAttribute('aP2', new THREE.InstancedBufferAttribute(p2, 4)); cg.setAttribute('aCr', new THREE.InstancedBufferAttribute(cr, 4));
    im.frustumCulled = false; im.castShadow = false; scene.add(im);
    G.tick.push((t) => { im.visible = t > T.WAKE; life.visible = t < T.WIND + 3 || t > T.WAKE; wind.visible = t < T.WIND + 4 || t > T.CLEAR - 6; });
    prog(1);
  },
};
