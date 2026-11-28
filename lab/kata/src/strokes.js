// It Knew What to Do · the kata as calligraphy.
// The spear's two ends are sampled across the whole film once, at build, into static brush-stroke ribbons.
// A stroke lights when the spear passes, keeps the colour of the moment it was painted in, dries and fades.
// When the kata snaps shut, the strokes of the last passage hang in the air as one long exposure.
import * as THREE from 'three';
import { U, G, clamp, lerp, sm, GLSL_NOISE } from './core.js';
import { T, DUR, moodAt } from './film.js';
import { spearPoseAt } from './kata.js';

const HZ = 90;


// How long a stroke lingers (seconds), by the moment it was painted in.
function lifeAt(t) {
  if (t < T.SNAP) return 0.45;
  if (t < T.TUKKS) return 0.7;
  if (t < T.FATHER) return 1.7;
  if (t < T.CHASM) return 2.3;
  if (t < T.WIND) return 1.1;
  if (t < T.FINISH + 0.1) return 1.7;
  return 0.6;
}

// Colour a stroke takes at the moment it is painted: cold silver in the chasm, the memory's hue inside one,
// the wind's white-blue at the end.
function inkAt(t, out) {
  const m = moodAt(t);
  let r = 0.62, g = 0.78, b = 1.0;
  const k = clamp(m.memMix * 1.25, 0, 1);
  r = lerp(r, m.r * 1.18, k); g = lerp(g, m.g * 1.14, k); b = lerp(b, m.b * 1.08, k);
  const w = m.wWind;
  r = lerp(r, 0.70, w); g = lerp(g, 0.82, w); b = lerp(b, 1.02, w);
  out[0] = r; out[1] = g; out[2] = b;
}

const STROKE_V = /* glsl */`
in vec3 aTan;
in vec4 aInfo;   // x: time painted, y: speed, z: arc length, w: side (-1 / +1)
in vec4 aCol;    // rgb colour, a: life
uniform float uTime, uGain, uWidth, uHold, uHoldA, uHoldB, uView;
uniform vec3 uCamPos;
out float vAcross;
out float vS;
out float vAge;
out float vA;
out vec3 vCol;
void main() {
  float age = uTime - aInfo.x;
  float life = aCol.a;
  float hold = uHold * step(uHoldA, aInfo.x) * step(aInfo.x, uHoldB);
  float fade = exp(-max(age, 0.0) / life);
  float recency = smoothstep(uHoldA, uHoldB, aInfo.x);
  float k = max(fade, hold * (0.30 + 0.62 * recency * recency));
  float speedK = smoothstep(0.9, 4.2, aInfo.y);
  if (age < 0.0 || k * speedK < 0.004) {
    vA = 0.0; vAcross = 0.0; vS = 0.0; vAge = 0.0; vCol = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 toCam = normalize(uCamPos - position);
  vec3 side = cross(aTan, toCam);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  // A fresh stroke is a hair-line; it spreads as it dries, like ink taken up by paper.
  float spread = 1.0 + min(age, 3.0) * 0.55;
  float w = uWidth * (0.35 + 0.65 * speedK) * (0.55 + min(aInfo.y, 9.0) * 0.09) * spread;
  vec3 wp = position + side * aInfo.w * w;
  vAcross = aInfo.w;
  vS = aInfo.z;
  vAge = age;
  vA = k * speedK * uGain * uView;
  vCol = aCol.rgb;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const STROKE_F = /* glsl */`precision highp float;
${GLSL_NOISE}
in float vAcross;
in float vS;
in float vAge;
in float vA;
in vec3 vCol;
out vec4 frag;
void main() {
  if (vA < 0.002) discard;
  float x = vAcross;
  float core = exp(-x * x * 9.0);
  float body = exp(-x * x * 2.6);
  // Dry brush: bristle streaks along the stroke open up as it dries.
  float bristle = n2(vec2(x * 5.5 + 3.0, vS * 2.2)) * 0.65 + n2(vec2(x * 13.0, vS * 5.0)) * 0.35;
  float dry = clamp(vAge * 0.9, 0.0, 1.0);
  float hair = mix(1.0, smoothstep(0.22, 0.72, bristle), dry * 0.85);
  // Fresh ink burns white at its heart, then settles into its colour.
  float hot = exp(-vAge * 7.0);
  vec3 col = mix(vCol, vec3(1.05, 1.04, 1.0) * 1.6, hot * core);
  float a = (core * 1.1 + body * 0.35) * hair;
  frag = vec4(col * a * vA, 1.0);
}`;

// The swept sheet between butt and tip: a brief smear of the shaft at speed, like a painted motion frame.
const SHEET_V = /* glsl */`
in vec4 aInfo;   // x: time, y: speed, z: along shaft (0 butt .. 1 tip), w: unused
in vec3 aCol;
uniform float uTime, uGain, uView;
out float vA;
out float vAlong;
out vec3 vCol;
void main() {
  float age = uTime - aInfo.x;
  float speedK = smoothstep(2.2, 6.5, aInfo.y) * (1.0 - smoothstep(9.0, 16.0, aInfo.y) * 0.7);
  if (age < 0.0 || age > 0.16 || speedK < 0.01) {
    vA = 0.0; vAlong = 0.0; vCol = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float u = age / 0.16;
  vA = (1.0 - u) * (1.0 - u) * speedK * uGain * uView;
  vAlong = aInfo.z;
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const SHEET_F = /* glsl */`precision highp float;
in float vA; in float vAlong; in vec3 vCol; out vec4 frag;
void main() {
  float a = vA * smoothstep(0.08, 0.55, vAlong) * smoothstep(1.0, 0.72, vAlong);
  frag = vec4(vCol * a * 0.09, 1.0);
}`;

function buildStrip(samples, end, colours, lives) {
  const n = samples.length;
  const pos = new Float32Array(n * 2 * 3), tan = new Float32Array(n * 2 * 3);
  const info = new Float32Array(n * 2 * 4), col = new Float32Array(n * 2 * 4);
  const idx = [];
  let s = 0;
  const tv = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = samples[i][end];
    if (i > 0) s += p.distanceTo(samples[i - 1][end]);
    const a = samples[Math.max(0, i - 1)][end], b = samples[Math.min(n - 1, i + 1)][end];
    tv.subVectors(b, a);
    if (tv.lengthSq() < 1e-10) tv.set(0, 1, 0); else tv.normalize();
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos.set([p.x, p.y, p.z], j * 3);
      tan.set([tv.x, tv.y, tv.z], j * 3);
      info.set([samples[i].t, samples[i][end + 'Speed'], s, k ? 1 : -1], j * 4);
      col.set([colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2], lives[i]], j * 4);
    }
    if (i < n - 1) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

export const Strokes = {
  async build(scene, prog, tick) {
    // Sample at HZ, subdividing wherever the tip travels more than STEP between samples, so the fastest
    // snaps still draw as smooth arcs rather than straight chords.
    const STEP = 0.03, samples = [], pose = {}, c = [0, 0, 0];
    const push = (t) => {
      spearPoseAt(t, pose);
      samples.push({ t, tip: pose.tip.clone(), butt: pose.butt.clone(), tipSpeed: pose.tipVel.length(), buttSpeed: pose.buttVel.length() });
    };
    const N0 = Math.floor(DUR * HZ);
    push(0);
    const probe = {};
    for (let i = 1; i <= N0; i++) {
      const t = i / HZ, prev = samples[samples.length - 1];
      spearPoseAt(t, probe);
      const d = Math.max(probe.tip.distanceTo(prev.tip), probe.butt.distanceTo(prev.butt));
      const k = Math.min(10, Math.ceil(d / STEP));
      for (let j = 1; j < k; j++) push(prev.t + (t - prev.t) * j / k);
      push(t);
      if (i % 900 === 0) { prog(i / N0 * 0.6); await tick(); }
    }
    const n = samples.length;
    const colours = new Float32Array(n * 3), lives = new Float32Array(n);
    for (let i = 0; i < n; i++) { inkAt(samples[i].t, c); colours.set(c, i * 3); lives[i] = lifeAt(samples[i].t); }

    const uni = (gain, width) => ({
      uTime: U.uTime, uCamPos: U.uCamPos, uNoise: U.uNoise,
      uGain: { value: gain }, uWidth: { value: width }, uView: U.uStrokeView,
      uHold: U.uStrokeHold, uHoldA: { value: T.FINISH - 4.2 }, uHoldB: { value: T.FINISH + 0.08 },
    });
    const mk = (geo, gain, width, order) => {
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: STROKE_V, fragmentShader: STROKE_F,
        uniforms: uni(gain, width), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.frustumCulled = false; m.renderOrder = order;
      scene.add(m);
      return m;
    };
    mk(buildStrip(samples, 'tip', colours, lives), 1.0, 0.020, 15);
    mk(buildStrip(samples, 'butt', colours, lives), 0.42, 0.013, 15);
    prog(0.8); await tick();

    // Swept sheet: five rails along the shaft, quads between consecutive samples.
    const R = 5, sPos = new Float32Array(n * R * 3), sInfo = new Float32Array(n * R * 4), sCol = new Float32Array(n * R * 3);
    const sIdx = [], v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const sm0 = samples[i];
      const sp = Math.max(sm0.tipSpeed, sm0.buttSpeed);
      for (let r = 0; r < R; r++) {
        const f = r / (R - 1);
        v.lerpVectors(sm0.butt, sm0.tip, f);
        const j = i * R + r;
        sPos.set([v.x, v.y, v.z], j * 3);
        sInfo.set([sm0.t, sp, f, 0], j * 4);
        sCol.set([colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]], j * 3);
        if (i < n - 1 && r < R - 1) {
          const a = j, b = j + 1, cc = j + R, d = j + R + 1;
          sIdx.push(a, b, cc, b, d, cc);
        }
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sg.setAttribute('aInfo', new THREE.BufferAttribute(sInfo, 4));
    sg.setAttribute('aCol', new THREE.BufferAttribute(sCol, 3));
    sg.setIndex(sIdx);
    const sheet = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: SHEET_V, fragmentShader: SHEET_F,
      uniforms: { uTime: U.uTime, uGain: { value: 1 }, uView: U.uStrokeView },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    sheet.frustumCulled = false; sheet.renderOrder = 14;
    scene.add(sheet);

    G.info.strokeSamples = n;
    prog(1);
  },
};
