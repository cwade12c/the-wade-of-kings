// The Stormwall · weather at the lens: rain, the dust and leaves that run ahead of the wall, what the wind throws, lightning
import * as THREE from 'three';
import { U, G, rng, GLSL_COMMON, sm, TAU } from './core.js';
import { patch } from './mat.js';
import { height } from './land.js';
import { T, STRIKES } from './film.js';

// ---- rain: streaks in a box that travels with the lens ----
const RAIN_V = /* glsl */`
${GLSL_COMMON}
in vec4 aSeed;
out float vA; out float vV;
const vec3 B = vec3(30.0, 18.0, 30.0);
void main() {
  float wind = 9.0 * (0.7 + 2.6 * uGust), fall = 8.5 + 3.0 * aSeed.w;
  vec3 p0 = aSeed.xyz * B + vec3(-uWindPh * 9.0, -uTime * fall, uWindPh * 1.3 * (aSeed.w - 0.5));
  vec3 p = mod(p0 - uCamPos, B) - 0.5 * B + uCamPos;
  vec3 vel = vec3(-wind, -fall, 1.3 * (aSeed.w - 0.5) * wind / 9.0);
  vel += vec3(0.0, 1.0, 0.0) * sin(uTime * 7.0 + aSeed.x * 40.0) * uGust * 2.0;       // the gusts shove the drops about
  float len = 0.0105 * length(vel) * (0.7 + 0.6 * aSeed.w);
  vec3 dir = normalize(vel), q = p + dir * len * position.y;
  vec3 toCam = normalize(uCamPos - q), side = normalize(cross(dir, toCam));
  float dist = length(q - uCamPos);
  q += side * position.x * (0.0016 + 0.00075 * dist);
  float on = step(aSeed.w * 0.999, pow(uRain, 0.6));
  vA = on * smoothstep(0.35, 1.6, dist) * smoothstep(15.0, 8.0, dist) * (0.35 + 0.65 * aSeed.y);
  vV = position.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
  if (on < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const RAIN_F = /* glsl */`
precision highp float;
${GLSL_COMMON}
in float vA; in float vV; out vec4 frag;
void main() {
  float a = vA * (1.0 - vV * vV);
  vec3 c = uSkyHor * 0.9 + uFogCol * 1.4 + vec3(0.02) + vec3(0.72, 0.82, 1.0) * uFlash.w * 2.4 + uSunCol * 0.6;
  frag = vec4(min(c, vec3(1.6)) * a * 0.26, 1.0);
}`;

// ---- what flies ahead of the wall and in it: leaves, grit, torn scraps ----
const BITS_V = /* glsl */`
${GLSL_COMMON}
uniform float uBits;
in vec4 aSeed; in vec4 aKind;        // aKind: size, kind (0 leaf, 1 grit), spin, rise
out vec2 vQ; out vec4 vK; out float vF;
const vec3 B = vec3(54.0, 15.0, 54.0);
void main() {
  float sp = 0.75 + 0.6 * aSeed.w;
  vec3 p0 = aSeed.xyz * B + vec3(-uWindPh * 8.0 * sp, 0.0, uWindPh * 1.1 * (aSeed.y - 0.5));
  vec3 p = mod(p0 - uCamPos, B) - 0.5 * B + uCamPos;
  // leaves ride the gusts up and over; grit hugs the ground
  float hy = aSeed.y;
  p.y = uGround + mix(0.3 + 12.0 * hy * hy + 1.4 * aKind.w * sin(uWindPh * (1.2 + aSeed.w) + aSeed.x * 30.0), 0.05 + 2.4 * hy * hy * hy, aKind.y);
  float ang = uWindPh * aKind.z * 6.0 + aSeed.z * 20.0, c = cos(ang), s = sin(ang);
  vec3 toCam = normalize(uCamPos - p), rt = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)), up = cross(toCam, rt);
  vec2 q = position.xy; q = vec2(q.x * c - q.y * s, q.x * s + q.y * c); q.y *= mix(0.25 + 0.75 * abs(sin(ang * 0.7 + aSeed.x * 9.0)), 1.0, aKind.y);   // a leaf turns edge-on as it tumbles
  float sz = aKind.x;
  vec3 wp = p + (rt * q.x + up * q.y) * sz - vec3(1.0, 0.0, 0.0) * position.x * sz * 2.5 * aKind.y * min(uGust, 1.5);        // grit smears along the wind
  float dist = length(wp - uCamPos);
  float on = step(aSeed.w, uBits);
  vQ = position.xy; vK = vec4(aKind.y, aSeed.w, aSeed.x, on * smoothstep(0.3, 1.2, dist) * smoothstep(27.0, 17.0, dist));
  vF = 1.0 - exp(-dist * uFogDen);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  if (on < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const BITS_F = /* glsl */`
precision highp float;
${GLSL_COMMON}
in vec2 vQ; in vec4 vK; in float vF; out vec4 frag;
void main() {
  float r2 = dot(vQ, vQ); if (r2 > 1.0) discard;
  vec3 light = uSkyHor * 0.9 + uSunCol * 1.6 + vec3(0.72, 0.82, 1.0) * uFlash.w * 2.0 + vec3(0.004);
  vec3 c; float a;
  if (vK.x < 0.5) {                               // a leaf: pointed, dark against the sky
    if (abs(vQ.x) > 0.55 * (1.0 - vQ.y * vQ.y)) discard;
    c = mix(vec3(0.045, 0.075, 0.02), vec3(0.11, 0.06, 0.03), step(0.55, vK.y)) * (0.6 + 0.8 * vK.z); a = 0.95 * vK.w;
  } else { c = vec3(0.42, 0.33, 0.24); a = (1.0 - r2) * 0.5 * vK.w; }
  c = mix(c * light, uFogCol, vF);
  frag = vec4(c * a, a);
}`;

// ---- lightning: a branching ribbon from the cloud to the ground, alive only while its stroke is ----
const BOLT_V = /* glsl */`
${GLSL_COMMON}
in vec3 aNext; in vec2 aSide;       // aSide: side (-1, 1), width
out float vS; out float vW;
void main() {
  vec3 dir = normalize(aNext - position), toCam = normalize(uCamPos - position), side = normalize(cross(dir, toCam));
  float dist = length(position - uCamPos);
  vec3 p = position + side * aSide.x * aSide.y * (0.5 + dist * 0.006);
  vS = aSide.x; vW = aSide.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BOLT_F = /* glsl */`
precision highp float;
uniform float uOn; in float vS; in float vW; out vec4 frag;
void main() { float k = 1.0 - abs(vS); frag = vec4(vec3(0.78, 0.86, 1.0) * (k * k * 26.0 + k * 3.0) * uOn * min(vW, 1.0), 1.0); }`;

function boltGeometry(seed, top, hit) {
  const r = rng(seed), P = [], NX = [], SD = [], I = [];
  const seg = (a, b, w) => { const base = P.length / 3; for (const [pt, nx] of [[a, b], [b, b.clone().add(b).sub(a)]]) for (const s of [-1, 1]) { P.push(pt.x, pt.y, pt.z); NX.push(nx.x, nx.y, nx.z); SD.push(s, w); } I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); };
  const path = (a, b, w, depth) => {
    let pts = [a, b];
    for (let it = 0; it < 6; it++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const m = pts[i].clone().lerp(pts[i + 1], 0.5), d = pts[i].distanceTo(pts[i + 1]) * 0.19; m.x += (r() - 0.5) * d * 2; m.z += (r() - 0.5) * d * 2; m.y += (r() - 0.5) * d * 0.6; out.push(m, pts[i + 1]); } pts = out; }
    for (let i = 0; i < pts.length - 1; i++) {
      seg(pts[i], pts[i + 1], w);
      if (depth < 2 && r() < 0.085 && i > 4 && i < pts.length - 8) { const len = a.distanceTo(b) * (0.18 + 0.25 * r()), e = pts[i].clone().add(new THREE.Vector3((r() - 0.5) * 1.6, -0.75 - 0.5 * r(), (r() - 0.5) * 1.6).normalize().multiplyScalar(len)); path(pts[i], e, w * 0.45, depth + 1); }
    }
  };
  path(top, hit, 1.0, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aNext', new THREE.Float32BufferAttribute(NX, 3)); g.setAttribute('aSide', new THREE.Float32BufferAttribute(SD, 2)); g.setIndex(I);
  return g;
}

// ---- what the stormwall throws: stones and broken branches, each on its own pass through the frame ----
const FLUNG_VHEAD = /* glsl */`
attribute vec4 aFly; attribute vec4 aFly2; attribute vec3 aFly3;      // aFly: t0, y0, z0, speed; aFly2: spin axis xyz, kind; aFly3: size
varying float vKind;
vec3 rotAx(vec3 p, vec3 a, float ang) { float c = cos(ang), s = sin(ang); return p * c + cross(a, p) * s + a * dot(a, p) * (1.0 - c); }
`;
const FLUNG_VNORMAL = /* glsl */`
float ft = uTime - aFly.x; vec3 fax = normalize(aFly2.xyz);
float fang = ft * (5.0 + 9.0 * fract(aFly.w * 0.37));
objectNormal = rotAx(objectNormal, fax, fang);
vec3 flyPos = rotAx(position * aFly3, fax, fang);
// thrown from the east, skipping off the stone as it goes
float fx = 46.0 - aFly.w * ft, hop = abs(sin(ft * (2.2 + fract(aFly.y * 3.1) * 2.0) + aFly.z));
flyPos += vec3(fx - 10.0, uGround + 0.1 + aFly.y * (0.2 + 0.8 * hop), aFly.z);
if (ft < 0.0 || fx < -60.0) flyPos = vec3(0.0, -500.0, 0.0);
vKind = aFly2.w;
`;

export const Weather = {
  async build(scene, prog, tick) {
    const r = rng(77);
    // rain
    const NR = G.tier ? 9000 : 24000, rg = new THREE.InstancedBufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3)); rg.setIndex([0, 1, 2, 1, 3, 2]);
    const rs = new Float32Array(NR * 4); for (let i = 0; i < NR * 4; i++) rs[i] = r();
    rg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rs, 4)); rg.instanceCount = NR;
    const rain = new THREE.Mesh(rg, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: RAIN_V, fragmentShader: RAIN_F, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    rain.frustumCulled = false; rain.renderOrder = 20; scene.add(rain);
    prog(0.3); await tick();

    // leaves and grit
    const NB = G.tier ? 1500 : 3600, bg = new THREE.InstancedBufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3)); bg.setIndex([0, 1, 2, 1, 3, 2]);
    const bs = new Float32Array(NB * 4), bk = new Float32Array(NB * 4);
    for (let i = 0; i < NB; i++) { for (let k = 0; k < 4; k++) bs[i * 4 + k] = r(); const grit = r() < 0.62 ? 1 : 0; bk[i * 4] = grit ? 0.02 + 0.05 * r() : 0.035 + 0.05 * r(); bk[i * 4 + 1] = grit; bk[i * 4 + 2] = (r() - 0.5) * 2; bk[i * 4 + 3] = r(); }
    bg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(bs, 4)); bg.setAttribute('aKind', new THREE.InstancedBufferAttribute(bk, 4)); bg.instanceCount = NB;
    const bitsU = { ...U, uBits: { value: 0 } };
    const bits = new THREE.Mesh(bg, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BITS_V, fragmentShader: BITS_F, uniforms: bitsU, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide }));
    bits.frustumCulled = false; bits.renderOrder = 18; scene.add(bits);
    prog(0.5); await tick();

    // bolts for the strokes that land near the lens
    const bolts = [];
    STRIKES.forEach((s, i) => {
      if (s[0] < T.HIT || s[0] > T.EASE) return;
      const hit = new THREE.Vector3(s[1], height(s[1], s[3]), s[3]), top = new THREE.Vector3(s[1] + (r() - 0.5) * 160, 1100, s[3] + (r() - 0.5) * 160);
      const m = new THREE.Mesh(boltGeometry(900 + i, top, hit), new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BOLT_V, fragmentShader: BOLT_F, uniforms: { ...U, uOn: { value: 0 } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 15; scene.add(m); bolts.push([s, m]);
    });
    prog(0.7); await tick();

    // flung stones and branches
    const NF = G.tier ? 46 : 90, fg = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), fl = new Float32Array(NF * 4), fl2 = new Float32Array(NF * 4), fl3 = new Float32Array(NF * 3);
    const fm = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), { vHead: FLUNG_VHEAD, vNormal: FLUNG_VNORMAL, vPos: 'transformed = flyPos;', fHead: 'varying float vKind;',
      fColor: 'diffuseColor.rgb = mix(vec3(0.20, 0.14, 0.10), vec3(0.075, 0.05, 0.035), vKind) * (0.7 + 0.5 * n2(vWp.xz * 30.0));' });
    const im = new THREE.InstancedMesh(fg, fm, NF), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p0 = new THREE.Vector3();
    for (let i = 0; i < NF; i++) {
      const branch = r() < 0.45, early = r() < 0.5;
      const t0 = early ? T.HIT - 1.2 + 4.5 * r() * r() : T.HIT + 3 + (T.EASE - T.HIT - 3) * r();
      if (branch) sc.set(0.5 + 1.3 * r(), 0.03 + 0.04 * r(), 0.03 + 0.04 * r()); else { const s0 = 0.05 + 0.2 * r() * r(); sc.set(s0 * (0.8 + 0.6 * r()), s0 * (0.6 + 0.4 * r()), s0); }
      im.setMatrixAt(i, m4.identity()); fl3.set([sc.x, sc.y, sc.z], i * 3);
      const z = 3 + (r() - 0.5) * 34; fl.set([t0, 0.4 + 3.6 * r() * r(), z, 24 + 26 * r()], i * 4); fl2.set([r() - 0.5, r() - 0.5, r() - 0.5, branch ? 1 : 0], i * 4);
    }
    fg.setAttribute('aFly', new THREE.InstancedBufferAttribute(fl, 4)); fg.setAttribute('aFly2', new THREE.InstancedBufferAttribute(fl2, 4)); fg.setAttribute('aFly3', new THREE.InstancedBufferAttribute(fl3, 3));
    im.frustumCulled = false; scene.add(im);

    const fpos = new THREE.Vector3();
    G.tick.push((t) => {
      // leaves and grit thicken toward the wall, fly wild in it, and are gone with the wind
      bitsU.uBits.value = Math.max(sm(T.WIND - 1, T.CLOSE + 2, t) * 0.75 + 0.25 * sm(T.CLOSE, T.HIT, t), 0.02) * (1 - sm(T.HIT + 3, T.EASE + 4, t)) + 0.03 * sm(T.CLEAR, T.CLEAR + 3, t);
      rain.visible = U.uRain.value > 0.002; bits.visible = bitsU.uBits.value > 0.001;
      for (const [s, m] of bolts) { const d = t - s[0], e = d < 0 || d > 0.6 ? 0 : Math.exp(-d / 0.06) + (d > 0.11 ? 0.7 * Math.exp(-(d - 0.11) / 0.05) : 0) + (d > 0.27 ? 0.3 * Math.exp(-(d - 0.27) / 0.08) : 0); m.visible = e > 0.01; m.material.uniforms.uOn.value = e * s[4]; }
      im.visible = t > T.HIT - 2 && t < T.EASE + 4;
    });
    prog(1);
  },
};
