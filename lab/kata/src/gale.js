// It Knew What to Do · "Him and the wind" [wok:27].
// When strength surges through him, the water of the chasm goes up with the wind: a vortex of streaks around the
// kata, spray torn off the pool, and water rushing past the lens. It all runs on the world's clock (fx time), so
// the final snap freezes every streak into a hanging bead; when the world starts again they fall back into the pool.
import * as THREE from 'three';
import { U, G, rng } from './core.js';
import { Mirror } from './mirror.js';

const QUAD = [-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0];

// Water caught in the wind around the kata. kind 0 rides the updraft, kind 1 skims off the pool and falls back.
const VORTEX_V = /* glsl */`
in vec4 aA;   // x: radius, y: height seed, z: angle, w: threshold
in vec4 aB;   // x: kind, y: size, z: twist, w: seed
uniform float uFxTime, uWindPh, uGaleSpd, uGaleVis, uFxRate, uFxRel, uBurstT, uFreeze, uSylGlow, uTorchFlick, uGaleView;
uniform vec3 uCamPos, uSylPos, uTorchA, uKataC;
out float vX; out float vY; out float vA; out vec3 vCol;
void main() {
  vX = position.x; vY = position.y;
  float on = step(aA.w, uGaleVis * uGaleView);
  float r = mix(0.78, 2.5, pow(aA.x, 0.7));
  float om = (1.5 + 2.6 * fract(aB.w * 7.3)) / (0.45 + 0.55 * r);
  float th = aA.z + om * uWindPh * 2.2;
  float grow = smoothstep(0.0, 0.30 + aA.x * 0.9, uFxTime - uBurstT);
  float rr = r * mix(0.12, 1.0, grow) * (1.0 + 0.14 * sin(uWindPh * 1.3 + aB.w * 20.0));
  float y;
  if (aB.x < 0.5) {
    y = 0.08 + fract(aA.y + uWindPh * (0.035 + 0.05 * fract(aB.w * 3.1))) * 4.2;
  } else {
    float ph = fract(aA.y + uWindPh * (0.30 + 0.30 * fract(aB.w * 5.7)));
    y = 0.015 + ph * (1.0 - ph) * 4.0 * (0.18 + 0.55 * aB.z);
  }
  y *= mix(0.25, 1.0, grow);
  vec3 p = uKataC + vec3(cos(th) * rr, y, sin(th) * rr * 1.32);
  float fallT = max(0.0, uFxTime - uFxRel);
  p.y -= 4.9 * fallT * fallT;
  vec3 tang = normalize(vec3(-sin(th), 0.10 + 0.25 * (1.0 - aB.x), cos(th) * 1.32));
  vec3 vel = tang * om * rr * 2.2 * uGaleSpd * uFxRate + vec3(0.0, -9.8 * fallT * uFxRate, 0.0);
  float sp = length(vel);
  vec3 dir = sp > 1e-4 ? vel / max(sp, 1e-4) : vec3(0.0, 1.0, 0.0);
  float w = aB.y;
  float len = clamp(sp * 0.028, w * 2.2, 0.55);
  vec3 q = p - dir * len * position.y;
  vec3 toCam = uCamPos - q;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam / max(dist, 1e-3)) + vec3(1e-5));
  q += side * position.x * (w + dist * 0.0007);
  float hfade = smoothstep(0.0, 0.06, p.y) * (1.0 - smoothstep(3.6, 4.3, p.y));
  float bright = pow(fract(aB.w * 11.0), 3.0);
  vA = on * hfade * smoothstep(0.35, 1.1, dist) * (0.25 + 0.75 * bright) * (1.0 + uFreeze * 0.9);
  // Water is dark until something lights it: Syl, the torch, the pale sky.
  float dS = length(uSylPos - p), dT = length(uTorchA - p);
  vCol = vec3(0.30, 0.40, 0.55) * 0.16
       + vec3(0.55, 0.86, 1.30) * uSylGlow * 1.25 / (1.0 + 0.9 * dS * dS)
       + vec3(1.35, 0.78, 0.36) * uTorchFlick * 0.8 / (1.0 + 0.55 * dT * dT)
       + vec3(0.40, 0.55, 0.80) * smoothstep(1.5, 4.0, p.y) * 0.12
       + vec3(0.55, 0.70, 0.95) * uFreeze * (0.18 + 0.5 * bright);
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
  if (on < 0.5 || p.y < 0.0 || vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

// Water rushing past the lens: a box of streaks that travels with the camera, blown along the wind there.
const LENS_V = /* glsl */`
in vec4 aSeed;
uniform float uFxTime, uLensPh, uLens, uGaleSpd, uFxRate, uFxRel, uFreeze, uSylGlow, uGaleView;
uniform vec3 uCamPos, uLensWind, uSylPos;
out float vX; out float vY; out float vA; out vec3 vCol;
const vec3 B = vec3(6.0, 3.6, 6.0);
void main() {
  vX = position.x; vY = position.y;
  float on = step(aSeed.w, uLens * uGaleView);
  float spd = 11.0 + 9.0 * aSeed.y;
  vec3 wd = normalize(uLensWind + vec3(0.0, 0.25 * (aSeed.x - 0.5), 0.0));
  vec3 p0 = aSeed.xyz * B + wd * uLensPh * spd;
  vec3 p = mod(p0 - uCamPos, B) - 0.5 * B + uCamPos;
  float fallT = max(0.0, uFxTime - uFxRel);
  p.y -= 4.9 * fallT * fallT;
  vec3 vel = wd * spd * uGaleSpd * uFxRate + vec3(0.0, -9.8 * fallT * uFxRate, 0.0);
  float sp = length(vel);
  vec3 dir = sp > 1e-4 ? vel / max(sp, 1e-4) : vec3(0.0, 1.0, 0.0);
  float w = 0.0012 + 0.0014 * aSeed.z;
  float len = clamp(sp * 0.024, w * 2.4, 0.6);
  vec3 q = p - dir * len * position.y;
  vec3 toCam = uCamPos - q;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam / max(dist, 1e-3)) + vec3(1e-5));
  q += side * position.x * (w + dist * 0.0006);
  vA = on * smoothstep(0.3, 0.8, dist) * smoothstep(3.2, 2.2, dist) * step(0.0, p.y) * (0.2 + 0.8 * pow(aSeed.z, 2.0)) * (1.0 + uFreeze * 0.4);
  float dS = length(uSylPos - p);
  vCol = vec3(0.40, 0.52, 0.70) * 0.35 + vec3(0.55, 0.86, 1.3) * uSylGlow * 0.9 / (1.0 + 0.5 * dS * dS) + vec3(0.6, 0.75, 1.0) * uFreeze * 0.25;
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
  if (on < 0.5 || vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const STREAK_F = /* glsl */`precision highp float;
uniform float uGaleGain;
in float vX; in float vY; in float vA; in vec3 vCol; out vec4 frag;
void main() {
  // Multisampling can shade a tiny bead outside its own quad; keep the falloffs in range.
  float x = clamp(vX, -1.0, 1.0), y = clamp(vY, 0.0, 1.0);
  float across = 1.0 - x * x;
  float along = 1.0 - pow(abs(y * 2.0 - 1.0), 3.0);
  float head = mix(0.55, 1.0, 1.0 - y);
  frag = vec4(vCol * across * along * head * vA * uGaleGain, 1.0);
}`;

export const Gale = {
  async build(scene, prog, tick) {
    const r = rng(510251);
    const mk = (n, attrs, vs, gain) => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(QUAD, 3));
      g.setIndex([0, 1, 2, 1, 3, 2]);
      for (const [name, arr] of attrs) g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, 4));
      g.instanceCount = n;
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: STREAK_F,
        uniforms: { ...U, uGaleGain: { value: gain } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.frustumCulled = false; m.renderOrder = 19;
      scene.add(m);
      return m;
    };

    const NV = G.tier ? 3600 : 9000;
    const A = new Float32Array(NV * 4), Bv = new Float32Array(NV * 4);
    for (let i = 0; i < NV; i++) {
      const skim = r() < 0.26;
      A.set([skim ? 0.15 + r() * 0.7 : r(), r(), r() * Math.PI * 2, r()], i * 4);
      Bv.set([skim ? 1 : 0, 0.0016 + r() * 0.0032, r(), r()], i * 4);
    }
    const vortex = mk(NV, [['aA', A], ['aB', Bv]], VORTEX_V, 0.30);
    prog(0.5); await tick();

    const NL = G.tier ? 900 : 2400;
    const S = new Float32Array(NL * 4);
    for (let i = 0; i < NL * 4; i++) S[i] = r();
    mk(NL, [['aSeed', S]], LENS_V, 0.22);

    Mirror.add(vortex);
    G.info.gale = NV + NL;
    prog(1);
  },
};
