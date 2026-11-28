// It Knew What to Do · Syl's ribbon between the sweeps, water flung off the spear (and the drops that fall
// into the pool), motes in the air, light drifting past the lens, and Moash's spheres
import * as THREE from 'three';
import { U, G, rng, clamp, lerp, sm, win, TAU } from './core.js';
import { T, fxTime } from './film.js';
import { spearPoseAt, SPRAY_BURSTS, DRIPS, DRIP_H } from './kata.js';

// ---- 1. Syl's graceful, lyrical 3D windspren flight path ----
// Pre-integrated monotonic phase table so changing speed (calm -> wind -> father -> wind) NEVER jumps angle!
const SYL_N = 76 * 60 + 2;
const sylPhTab = new Float32Array(SYL_N);
for (let i = 1; i < SYL_N; i++) {
  const tt = i / 60;
  const inWind = sm(T.WIND - 0.6, T.WIND + 1.4, tt);
  const inFather = win(tt, T.FATHER - 0.3, T.CHASM + 0.5, 0.8, 0.9);
  const omega = lerp(2.1, 4.1, inWind) * (1 - inFather * 0.58);
  sylPhTab[i] = sylPhTab[i - 1] + omega / 60;
}
function sylPhaseAt(t) {
  const x = clamp(t, 0, 76) * 60;
  const i = Math.min(SYL_N - 2, x | 0);
  return lerp(sylPhTab[i], sylPhTab[i + 1], x - i);
}

const _sPose = {};
export function sylPosAt(t, out, strand = 0) {
  if (!out) out = new THREE.Vector3();
  spearPoseAt(t, _sPose);

  const fOff = strand === 0 ? 0 : (strand === 1 ? 0.055 : -0.055);
  const fLag = strand === 0 ? 0 : (strand === 1 ? 0.05 : 0.09);
  const ts = Math.max(0, t - fLag);

  // Opening (0..10.5s): hovering shyly near upper-left mossy rocks, curious
  if (ts < T.TUKKS - 0.5) {
    const u = sm(0.0, T.SNAP, ts);
    return out.set(
      lerp(-1.45, -0.95, u) + Math.sin(ts * 1.25 + strand) * 0.22,
      2.05 + Math.cos(ts * 1.65 + strand) * 0.16 + fOff * 0.5,
      lerp(-1.1, -0.25, u) + Math.sin(ts * 0.95) * 0.20
    );
  }

  // Active Kata (10.5..62.0s): liquid-silk sweeping loops weaving between the spear's arcs!
  if (ts < T.FINISH + 0.5) {
    const inWind = sm(T.WIND - 0.6, T.WIND + 1.4, ts);
    const inFather = win(ts, T.FATHER - 0.3, T.CHASM + 0.5, 0.8, 0.9);
    const radOrbit = lerp(1.02, 0.86, inWind) + inFather * 0.52;
    const ang = sylPhaseAt(ts);
    const ox = Math.cos(ang) * radOrbit + Math.sin(ang * 1.6 + strand * 1.1) * (0.20 + Math.abs(fOff));
    const oy = Math.sin(ang * 1.12 + strand * 0.65) * 0.42 + 0.14 * Math.cos(ang * 0.52) + fOff;
    const oz = Math.sin(ang) * radOrbit * 0.86 + Math.cos(ang * 1.4 - strand) * 0.20;
    out.set(_sPose.pos.x + ox, Math.max(0.50, _sPose.pos.y + oy), _sPose.pos.z + oz);
    out.lerp(_sPose.tip, 0.14 * inWind);
    out.y += inFather * 0.42;
    return out;
  }

  // Aftermath (62.0..76.0s): one gentle triumphant loop after the Kime snap,
  // then glides smoothly to perch primly at shoulder height ("pointedly not looking at him")
  const e = ts - (T.FINISH + 0.5);
  const perchX = -0.34 + fOff * 0.35, perchY = 1.48 + Math.abs(fOff) * 0.22, perchZ = 0.42;
  if (e < 3.6) {
    const u = sm(0.0, 3.6, e);
    const r = lerp(0.95, 0.0, u);
    const a = sylPhaseAt(T.FINISH + 0.5) + e * 2.6;
    return out.set(
      lerp(_sPose.pos.x + Math.cos(a) * r, perchX, u * u),
      lerp(_sPose.pos.y + 0.30 + Math.sin(a * 1.1) * r * 0.42, perchY, u),
      lerp(_sPose.pos.z + Math.sin(a) * r, perchZ, u * u)
    );
  }
  return out.set(perchX + Math.sin(e * 1.7 + strand) * 0.018, perchY + Math.sin(e * 2.3 + strand) * 0.022, perchZ);
}

// ---- Dynamic Camera-Facing Ribbon Builder ----
function createRibbon(segments, fragShader, uniforms, order = 15) {
  const geo = new THREE.BufferGeometry();
  const nVerts = (segments + 1) * 2;
  const pos = new Float32Array(nVerts * 3);
  const uv = new Float32Array(nVerts * 2);
  const spd = new Float32Array(nVerts);
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    uv[i * 4] = u; uv[i * 4 + 1] = 0;
    uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  geo.setIndex(idx);

  const vert = /* glsl */`
    in float aSpeed;
    out vec2 vUv;
    out float vSpd;
    void main() {
      vUv = uv;
      vSpd = aSpeed;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: fragShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return { mesh, geo, pos, spd, segments };
}

const _dir = new THREE.Vector3(), _toCam = new THREE.Vector3(), _side = new THREE.Vector3();
function fillRibbon(rib, pts, speeds, widths, camPos) {
  const { pos, spd, segments, geo } = rib;
  for (let i = 0; i <= segments; i++) {
    const p = pts[i];
    const pPrev = pts[Math.max(0, i - 1)];
    const pNext = pts[Math.min(segments, i + 1)];
    _dir.subVectors(pNext, pPrev);
    if (_dir.lengthSq() < 1e-8) _dir.set(0, 1, 0);
    else _dir.normalize();
    _toCam.subVectors(camPos, p).normalize();
    _side.crossVectors(_dir, _toCam);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    else _side.normalize();

    const w = widths[i];
    const k = i * 6;
    pos[k]     = p.x - _side.x * w;
    pos[k + 1] = p.y - _side.y * w;
    pos[k + 2] = p.z - _side.z * w;
    pos[k + 3] = p.x + _side.x * w;
    pos[k + 4] = p.y + _side.y * w;
    pos[k + 5] = p.z + _side.z * w;
    spd[i * 2] = speeds[i];
    spd[i * 2 + 1] = speeds[i];
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.aSpeed.needsUpdate = true;
}

// Syl's ethereal silk-and-starlight windspren ribbon shader
const SYL_F = /* glsl */`precision highp float;
uniform float uTime, uSylGlow, uStrandGain;
in vec2 vUv; in float vSpd; out vec4 frag;
void main() {
  float across = clamp(1.0 - abs(vUv.y * 2.0 - 1.0), 0.0, 1.0);
  float core = pow(across, 4.0);
  float silk = pow(across, 1.15) * 0.42;
  float wave = 0.80 + 0.20 * sin(vUv.x * 24.0 - uTime * 11.0);
  float invX = clamp(1.0 - vUv.x, 0.0, 1.0);
  float head = pow(invX, 10.0) * 2.1;
  float tail = pow(invX, 1.55);
  vec3 deepCyan = vec3(0.36, 0.74, 1.22);
  vec3 iceWhite = vec3(0.96, 1.0, 1.06);
  vec3 col = mix(deepCyan, iceWhite, clamp(core * 0.68 + head * 0.30, 0.0, 1.0));
  float a = (core * 1.15 + silk) * (tail + head * 0.28) * wave * uSylGlow * uStrandGain;
  frag = vec4(col * a, 1.0);
}`;

// Syl's delicate starlight wisp core (crisp tiny diamond sparkle + soft azure aura)
const SPARK_V = /* glsl */`
out vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy;
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_F = /* glsl */`precision highp float;
uniform float uSylGlow;
in vec2 vUv; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 24.0) * 3.0;
  float halo = exp(-r2 * 4.5) * 0.55;
  // Subtle delicate four-point wind-star shimmer
  float star = exp(-abs(d.x) * 18.0) * exp(-abs(d.y) * 5.0) + exp(-abs(d.y) * 18.0) * exp(-abs(d.x) * 5.0);
  vec3 col = mix(vec3(0.28, 0.72, 1.18), vec3(0.95, 0.99, 1.06), clamp(core * 0.55, 0.0, 1.0));
  frag = vec4(col * (core + halo + star * 0.35) * max(0.32, uSylGlow * 0.88), 1.0);
}`;

// Ballistic glistening rainwater droplets flung tangentially off the wet spear
const DROP_V = /* glsl */`
in vec3 aOrigin;
in vec3 aVel;
in vec4 aMeta;     // birth time, life, size, seed
uniform float uTime, uFxTime, uSylGlow, uFreeze;
uniform vec3 uCamPos, uTorchA, uTorchB, uSylPos;
out vec2 vUv;
out float vA;
out vec3 vCol;
void main() {
  vUv = uv;
  float age = uFxTime - aMeta.x;
  if (age < 0.0 || age > aMeta.y) {
    vA = 0.0; vCol = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 g = vec3(0.0, -7.8, 0.0);
  vec3 p = aOrigin + aVel * age + 0.5 * g * age * age;
  if (p.y < 0.01) {
    vA = 0.0; vCol = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 vel = aVel + g * age;
  float spd = length(vel);
  vec3 dir = spd > 0.01 ? vel / spd : vec3(0.0, -1.0, 0.0);
  vec3 toCam = normalize(uCamPos - p);
  vec3 side = normalize(cross(dir, toCam) + vec3(1e-5));

  float sz = aMeta.z * (1.0 + uFreeze * 0.5);
  float stretch = sz * (1.8 + min(spd * 0.38, 4.4) * (1.0 - uFreeze * 0.7));
  vec3 wp = p + side * position.x * sz + dir * position.y * stretch;

  float dSyl = length(uSylPos - p);
  float dTA = length(uTorchA - p);
  float dTB = length(uTorchB - p);
  vec3 warm = vec3(1.5, 0.90, 0.45) * (1.1 / (1.0 + 0.32 * dTA * dTA) + 0.7 / (1.0 + 0.35 * dTB * dTB));
  vec3 cool = vec3(0.65, 0.92, 1.35) * uSylGlow * (1.8 / (1.0 + 0.42 * dSyl * dSyl));
  // Held in the air, each drop catches every light in the chasm.
  vCol = vec3(0.45, 0.58, 0.72) + warm + cool + vec3(0.9, 1.1, 1.4) * uFreeze;
  vA = smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(aMeta.y * 0.52, aMeta.y, age));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const DROP_F = /* glsl */`precision highp float;
in vec2 vUv; in float vA; in vec3 vCol; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  frag = vec4(vCol * exp(-r2 * 4.6) * vA * 1.45, 1.0);
}`;

// Atmospheric memory motes + Syl's shedding wind-sparkles
const MOTE_V = /* glsl */`
in vec4 aHome;  // xyz base, w seed
in vec4 aDrift; // x speed, y size, z phase, w radius
uniform float uFxTime, uMemMix, uRiftSun, uSylGlow, uWindVortex;
uniform vec3 uCamPos, uMemCol, uSylPos;
out vec2 vUv;
out float vA;
out vec3 vCol;
void main() {
  vUv = uv;
  float ph = aDrift.z + uFxTime * (aDrift.x + uWindVortex * 1.4);
  vec3 p = aHome.xyz + vec3(
    sin(ph * 0.9 + aHome.w * 20.0) * (aDrift.w + uWindVortex * 0.35),
    mod(uFxTime * (0.09 + 0.14 * aDrift.x + uWindVortex * 0.22) + aHome.w * 6.0, 5.4) - 1.1,
    cos(ph * 0.75 + aHome.w * 15.0) * (aDrift.w + uWindVortex * 0.35)
  );
  // Subtle vortex pull toward the kata arena during Him and the Wind
  if (uWindVortex > 0.01) {
    float ang = aHome.w * 6.283 + uFxTime * 1.25;
    float r = 0.65 + aHome.w * 1.45;
    vec3 swirlP = vec3(cos(ang) * r, p.y, sin(ang) * r);
    p = mix(p, swirlP, uWindVortex * 0.55);
  }
  vec3 toCam = normalize(uCamPos - p);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, rt);
  float sz = aDrift.y * (0.75 + 0.35 * sin(uFxTime * 3.4 + aHome.w * 40.0));
  vec3 wp = p + (rt * position.x + up * position.y) * sz;
  float fadeY = smoothstep(0.15, 0.9, p.y) * smoothstep(5.4, 3.8, p.y);
  float nearSyl = exp(-dot(p - uSylPos, p - uSylPos) * 0.55) * uSylGlow;
  vA = fadeY * (0.16 + uMemMix * 0.52 + uRiftSun * 0.38 + nearSyl * 0.65);
  vec3 baseC = mix(vec3(0.58, 0.72, 0.88), uMemCol * 1.45, clamp(uMemMix * 1.1, 0.0, 1.0));
  vCol = mix(baseC, vec3(0.65, 0.92, 1.35), clamp(nearSyl * 0.8, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const MOTE_F = /* glsl */`precision highp float;
in vec2 vUv; in float vA; in vec3 vCol; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  frag = vec4(vCol * exp(-r2 * 5.4) * vA, 1.0);
}`;

// Jewel-like sphere flare shader so Moash's fallen spheres sparkle cleanly inside the dark puddle
const GEM_FLARE_F = /* glsl */`precision highp float;
uniform vec3 uGemCol;
in vec2 vUv; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 22.0) * 1.6;
  float halo = exp(-r2 * 4.0) * 0.22;
  frag = vec4(uGemCol * (core + halo), 1.0);
}`;

// Out-of-focus light drifting right past the lens: a memory's warmth, the wind's sparks, the puddle's glow.
// Built in view space so it always sits between the viewer and the kata.
const BOKEH_V = /* glsl */`
in vec4 aB;   // x, y: spread, z: depth (m), w: seed
uniform float uFxTime, uMemMix, uWindVortex, uPuddleGlow, uSylGlow, uBokeh;
uniform vec3 uMemCol;
out vec2 vUv;
out float vA;
out vec3 vCol;
out float vSeed;
void main() {
  vUv = uv;
  vSeed = aB.w;
  float z = aB.z;
  float sp = 0.035 + 0.05 * fract(aB.w * 7.1);
  vec2 drift = vec2(sin(uFxTime * 0.21 + aB.w * 31.0) * 0.12 + uFxTime * (0.012 + uWindVortex * 0.11) * (fract(aB.w * 3.3) - 0.3),
                    uFxTime * (0.020 + 0.03 * fract(aB.w * 5.7)) + cos(uFxTime * 0.17 + aB.w * 17.0) * 0.08);
  vec2 xy = fract(aB.xy + drift / (z * 1.2)) * 2.0 - 1.0;
  xy = sign(xy) * pow(abs(xy), vec2(0.55));
  vec3 vp = vec3(xy.x * z * 0.95, xy.y * z * 0.58, -z);
  float size = z * (0.025 + 0.11 * pow(fract(aB.w * 13.7), 2.0));
  vp.xy += position.xy * size;
  float edge = smoothstep(1.0, 0.75, abs(xy.x)) * smoothstep(1.0, 0.7, abs(xy.y));
  float tw = 0.65 + 0.35 * sin(uFxTime * (0.8 + fract(aB.w * 9.0)) + aB.w * 40.0);
  float wind = uWindVortex * step(0.45, fract(aB.w * 2.9));
  vA = edge * tw * uBokeh * (uMemMix * 0.9 + wind * 0.8 + uPuddleGlow * 0.35) * sp;
  vec3 warm = uMemCol * 1.6;
  vCol = mix(warm, vec3(0.55, 0.85, 1.35), clamp(wind + uPuddleGlow * 0.6, 0.0, 1.0));
  gl_Position = projectionMatrix * vec4(vp, 1.0);
}`;
const BOKEH_F = /* glsl */`precision highp float;
in vec2 vUv; in float vA; in vec3 vCol; in float vSeed; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r = length(d);
  if (r > 1.0 || vA < 0.001) discard;
  float disc = smoothstep(1.0, 0.86, r);
  float rim = smoothstep(0.70, 0.93, r) * disc;
  frag = vec4(vCol * (disc * 0.8 + rim * 0.2) * vA * 2.0, 1.0);
}`;

const SPHERE_SPECS = [
  { t0: 66.95, tHit: 67.40, start: [0.65, 1.15, 3.15], land: [0.28, 0.025, 2.38], roll: [-0.07, 0.0, -0.12], col: [0.22, 0.62, 1.45] }, // royal sapphire
  { t0: 67.10, tHit: 67.56, start: [0.80, 1.12, 3.22], land: [0.46, 0.025, 2.52], roll: [ 0.05, 0.0, -0.10], col: [0.96, 0.98, 1.15] }, // brilliant diamond
  { t0: 67.26, tHit: 67.74, start: [0.55, 1.10, 3.30], land: [0.16, 0.025, 2.66], roll: [-0.08, 0.0, -0.05], col: [1.45, 0.86, 0.22] }, // golden topaz
  { t0: 67.42, tHit: 67.90, start: [0.85, 1.08, 3.10], land: [0.55, 0.025, 2.28], roll: [ 0.08, 0.0, -0.13], col: [0.24, 0.68, 1.45] }, // royal sapphire
  { t0: 67.60, tHit: 68.08, start: [0.60, 1.05, 3.05], land: [0.32, 0.025, 2.16], roll: [-0.04, 0.0, -0.09], col: [0.94, 0.96, 1.12] }, // diamond
];

export const Effects = {
  async build(scene, prog, tick) {
    const r = rng(27999);

    // 2. Multi-strand Syl windspren: 1 luminous primary silk ribbon + 2 delicate gossamer filaments + star-wisp core!
    const S_SEG = G.tier ? 64 : 104;
    const sylStrands = [
      { rib: createRibbon(S_SEG, SYL_F, { uTime: U.uTime, uSylGlow: U.uSylGlow, uStrandGain: { value: 1.6 } }, 18), wBase: 0.046, span: 1.45 },
      { rib: createRibbon(S_SEG, SYL_F, { uTime: U.uTime, uSylGlow: U.uSylGlow, uStrandGain: { value: 0.58 } }, 17), wBase: 0.020, span: 1.10 },
      { rib: createRibbon(S_SEG, SYL_F, { uTime: U.uTime, uSylGlow: U.uSylGlow, uStrandGain: { value: 0.46 } }, 17), wBase: 0.018, span: 0.76 },
    ];
    for (const s of sylStrands) scene.add(s.rib.mesh);

    const sylCore = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: SPARK_V, fragmentShader: SPARK_F,
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    sylCore.renderOrder = 19;
    scene.add(sylCore);

    // Pre-allocated scratch arrays
    const sylPts = Array.from({ length: S_SEG + 1 }, () => new THREE.Vector3());
    const sylSpd = new Float32Array(S_SEG + 1), sylW = new Float32Array(S_SEG + 1);
    
    prog(0.42); await tick();

    // 3. Ballistic rainwater spray droplets flung off the wet spear
    // The two snaps throw the most water: the guard snap sprays it "across his back", the last one hangs it in the air.
    const perBurst = G.tier ? 10 : 20;
    const burstN = (bt) => (Math.abs(bt - 7.6) < 0.05 || Math.abs(bt - 61.55) < 0.05 ? perBurst * 5 : perBurst);
    const nDrops = SPRAY_BURSTS.reduce((a, bt) => a + burstN(bt), 0) + DRIPS.length;
    const dGeo = new THREE.InstancedBufferGeometry();
    dGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
    dGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    dGeo.setIndex([0, 1, 2, 1, 3, 2]);
    const aOrigin = new Float32Array(nDrops * 3), aVel = new Float32Array(nDrops * 3), aMeta = new Float32Array(nDrops * 4);
    const tmpP = {}, pOnShaft = new THREE.Vector3(), vOnShaft = new THREE.Vector3();

    let di = 0;
    for (const bt of SPRAY_BURSTS) {
      const nb = burstN(bt), big = nb > perBurst;
      for (let k = 0; k < nb; k++) {
        const tb = bt + (r() - 0.35) * (big ? 0.12 : 0.20);
        spearPoseAt(tb, tmpP);
        const frac = r();
        pOnShaft.lerpVectors(tmpP.butt, tmpP.tip, frac);
        vOnShaft.lerpVectors(tmpP.buttVel, tmpP.tipVel, frac);
        const spdScale = 0.46 + r() * 0.44;
        aOrigin[di * 3] = pOnShaft.x; aOrigin[di * 3 + 1] = pOnShaft.y; aOrigin[di * 3 + 2] = pOnShaft.z;
        aVel[di * 3]     = vOnShaft.x * spdScale + (r() - 0.5) * 1.2;
        aVel[di * 3 + 1] = vOnShaft.y * spdScale + 0.95 + r() * 1.25;
        aVel[di * 3 + 2] = vOnShaft.z * spdScale + (r() - 0.5) * 1.2;
        aMeta[di * 4] = fxTime(tb); aMeta[di * 4 + 1] = (0.65 + r() * 0.65) * (big ? 1.25 : 1);
        aMeta[di * 4 + 2] = (0.010 + r() * 0.013) * (big ? 1.1 : 1); aMeta[di * 4 + 3] = r();
        di++;
      }
    }
    const fall = Math.sqrt(2 * DRIP_H / 7.8);
    for (const [tl, x, z] of DRIPS) {
      aOrigin.set([x, DRIP_H, z], di * 3);
      aVel.set([0, 0, 0], di * 3);
      aMeta.set([fxTime(tl - fall), fall - 0.004, 0.017, r()], di * 4);
      di++;
    }
    dGeo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(aOrigin, 3));
    dGeo.setAttribute('aVel', new THREE.InstancedBufferAttribute(aVel, 3));
    dGeo.setAttribute('aMeta', new THREE.InstancedBufferAttribute(aMeta, 4));
    dGeo.instanceCount = nDrops;
    const dropMesh = new THREE.Mesh(dGeo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: DROP_V, fragmentShader: DROP_F,
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    dropMesh.frustumCulled = false; dropMesh.renderOrder = 17;
    scene.add(dropMesh);

    // 4. Atmospheric memory motes & wind-sparkle dust
    const nMotes = G.tier ? 130 : 260;
    const mGeo = new THREE.InstancedBufferGeometry();
    mGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
    mGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    mGeo.setIndex([0, 1, 2, 1, 3, 2]);
    const mHome = new Float32Array(nMotes * 4), mDrift = new Float32Array(nMotes * 4);
    for (let i = 0; i < nMotes; i++) {
      mHome[i * 4]     = (r() - 0.5) * 4.4;
      mHome[i * 4 + 1] = 0.3 + r() * 4.8;
      mHome[i * 4 + 2] = lerp(-7.5, 5.2, r());
      mHome[i * 4 + 3] = r();
      mDrift[i * 4]     = 0.30 + r() * 0.75;
      mDrift[i * 4 + 1] = 0.015 + r() * 0.024;
      mDrift[i * 4 + 2] = r() * TAU;
      mDrift[i * 4 + 3] = 0.14 + r() * 0.36;
    }
    mGeo.setAttribute('aHome', new THREE.InstancedBufferAttribute(mHome, 4));
    mGeo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(mDrift, 4));
    mGeo.instanceCount = nMotes;
    const moteMesh = new THREE.Mesh(mGeo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: MOTE_V, fragmentShader: MOTE_F,
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    moteMesh.frustumCulled = false; moteMesh.renderOrder = 14;
    scene.add(moteMesh);
    prog(0.75); await tick();

    // 4b. Light drifting past the lens
    const nB = G.tier ? 12 : 16;
    const bGeo = new THREE.InstancedBufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
    bGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    bGeo.setIndex([0, 1, 2, 1, 3, 2]);
    const aB = new Float32Array(nB * 4);
    for (let i = 0; i < nB; i++) aB.set([r(), r(), 0.45 + r() * 1.25, r()], i * 4);
    bGeo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
    bGeo.instanceCount = nB;
    const bokeh = new THREE.Mesh(bGeo, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BOKEH_V, fragmentShader: BOKEH_F,
      uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    bokeh.frustumCulled = false; bokeh.renderOrder = 30;
    scene.add(bokeh);

    // 5. Moash's 5 jewel-bright spheres tumbling into the dark mirror puddle
    const sphereGroup = new THREE.Group();
    const sGlassGeo = new THREE.SphereGeometry(0.021, 16, 12);
    const sCoreGeo = new THREE.OctahedronGeometry(0.009, 0);
    const sGlassMat = new THREE.MeshStandardMaterial({
      color: 0xeaf4ff, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.22, envMapIntensity: 1.6,
    });
    const sphereNodes = SPHERE_SPECS.map((sp) => {
      const g = new THREE.Group();
      const glass = new THREE.Mesh(sGlassGeo, sGlassMat);
      glass.scale.set(1, 0.85, 1);
      const core = new THREE.Mesh(sCoreGeo, new THREE.MeshBasicMaterial({
        color: new THREE.Color(sp.col[0] * 2.6, sp.col[1] * 2.6, sp.col[2] * 2.6),
      }));
      const flare = new THREE.Mesh(
        new THREE.PlaneGeometry(0.085, 0.085),
        new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3, vertexShader: SPARK_V, fragmentShader: GEM_FLARE_F,
          uniforms: { uGemCol: { value: new THREE.Vector3(sp.col[0], sp.col[1], sp.col[2]) } },
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      flare.renderOrder = 20;
      g.add(glass, core, flare);
      g.visible = false;
      sphereGroup.add(g);
      return { g, sp };
    });
    scene.add(sphereGroup);

    // ---- Per-frame deterministic update ----
    const sylNow = new THREE.Vector3();
    G.tick.push((t, dt, camera) => {
      const camPos = camera.position;

      // 2. Multi-strand Syl windspren (primary silk ribbon + twin gossamer air-filaments)
      const perchShrink = 1 - sm(T.FINISH + 3.0, T.FINISH + 4.4, t) * 0.36;
      for (let si = 0; si < sylStrands.length; si++) {
        const s = sylStrands[si];
        for (let i = 0; i <= S_SEG; i++) {
          const u = i / S_SEG;
          const ts = Math.max(0, t - u * s.span);
          sylPosAt(ts, sylPts[i], si);
          sylSpd[i] = 1.0;
          const wave = 0.72 + 0.28 * Math.sin(u * 20.0 - t * 10.0 + si * 2.1);
          sylW[i] = s.wBase * Math.pow(1 - u, 0.85) * wave * perchShrink;
        }
        fillRibbon(s.rib, sylPts, sylSpd, sylW, camPos);
      }
      sylPosAt(t, sylNow, 0);
      sylCore.position.copy(sylNow);
      U.uSylPos.value.copy(sylNow);

      // 3. Moash's 5 fallen spheres arcing into the dark puddle
      for (const { g, sp } of sphereNodes) {
        if (t < sp.t0) { g.visible = false; continue; }
        g.visible = true;
        if (t < sp.tHit) {
          const u = (t - sp.t0) / (sp.tHit - sp.t0);
          g.position.set(
            lerp(sp.start[0], sp.land[0], u),
            lerp(sp.start[1], sp.land[1], u * u) + Math.sin(u * Math.PI) * 0.14,
            lerp(sp.start[2], sp.land[2], u)
          );
        } else {
          const e = t - sp.tHit;
          const slide = 1 - Math.exp(-e * 3.2);
          const bounce = Math.abs(Math.sin(e * 14.0)) * Math.exp(-e * 6.5) * 0.036;
          g.position.set(
            sp.land[0] + sp.roll[0] * slide,
            sp.land[1] + bounce,
            sp.land[2] + sp.roll[2] * slide
          );
        }
      }
    });

    G.info.droplets = nDrops;
    G.info.motes = nMotes;
    prog(1);
  },
};
