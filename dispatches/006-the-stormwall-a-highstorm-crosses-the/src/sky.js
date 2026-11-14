// The Stormwall · the sky: day, the storm's anvil and deck, the wall itself (a short march through its face), the sheet of rain
import * as THREE from 'three';
import { U, G, GLSL_COMMON } from './core.js';

const FRAG = /* glsl */`
precision highp float;
${GLSL_COMMON}
uniform vec3 uSunRaw;
uniform float uSteps;
const vec3 LC = vec3(-0.42, 0.80, 0.43);
in vec3 vRd;
out vec4 frag;

// the storm's cloud near its leading face. dIn: metres inside the surface
float stormRho(vec3 p, out float dIn) {
  float s = p.x - uFront - frontWave(p.z), h = p.y;
  float base = 880.0 + 0.05 * max(s, 0.0);
  float shelf = -420.0 * exp(-pow((h - base - 220.0) / 380.0, 2.0));                    // the roll cloud juts out over the rain
  float lean = 0.22 * clamp(h - base, 0.0, 2200.0) - 1700.0 * smoothstep(3000.0, 4300.0, h);   // the face leans back, then the anvil runs ahead
  vec3 q = p * vec3(1.0, 1.25, 1.0) / 760.0 + vec3(uTime * 0.03, -uTime * 0.022, 0.0);
  float nz = fbm3(q), big = n3(p * vec3(1.0, 0.8, 1.0) / 1900.0 + vec3(uTime * 0.012, 0.0, 4.0));
  float d = s - shelf - lean + (nz - 0.5) * 760.0 + (big - 0.5) * 1100.0;
  float dTop = 3100.0 + 1700.0 * n2(vec2(p.z / 2600.0, 5.0 + uTime * 0.004)) + (nz - 0.5) * 700.0 - h;
  float dBase = (h - base + (n3(p / 240.0 + vec3(0.0, uTime * 0.05, 0.0)) - 0.5) * 170.0) * 2.5;
  dIn = min(d, min(dTop, dBase));
  dIn += (n3(p / 150.0 + vec3(uTime * 0.07, 0.0, uTime * 0.02)) - 0.5) * 150.0;
  return smoothstep(0.0, 130.0, dIn);
}

// a flat cloud layer at height H. cov: 0 clear .. 1 solid, read from where the ray meets the layer
vec4 deck(vec3 ro, vec3 rd, float H, float kind) {
  if (rd.y < 0.012) return vec4(0.0);
  float tH = (H - ro.y) / rd.y; vec3 p = ro + rd * tH; float s = p.x - uFront;
  float cov, sc;
  if (kind < 0.5) {                           // the anvil: runs far ahead of the wall, thin and fibrous at its edge
    cov = 0.2 + 0.8 * smoothstep(-7000.0, -900.0, s); cov *= smoothstep(-9000.0, -6000.0, s) * (1.0 - smoothstep(2500.0, 5200.0, s)); sc = 0.00022;
  } else {                                    // the deck behind the wall: solid, then broken, then gone at the trailing edge
    cov = smoothstep(-200.0, 900.0, s) * (1.0 - 0.96 * smoothstep(uBack - uFront - 4600.0, uBack - uFront - 300.0, s)) * (1.0 - smoothstep(uBack - uFront - 600.0, uBack - uFront + 900.0, s)); sc = 0.0007;
  }
  if (cov < 0.004) return vec4(0.0);
  vec2 uv = p.xz * sc + vec2(uTime * 0.012, uTime * 0.004);
  float n = fbm2(kind < 0.5 ? uv * vec2(0.55, 1.8) : uv), n1 = fbm2(uv * 3.1 + 5.0);
  float thick = smoothstep(1.02 - cov * 1.08, 1.4 - cov * 0.9, n * 0.75 + n1 * 0.25 + 0.2);
  if (thick < 0.003) return vec4(0.0);
  float a = 1.0 - exp(-thick * (kind < 0.5 ? 4.0 : 7.0));
  float sd = max(dot(rd, uSunDir), 0.0);
  vec3 under = mix(uSkyHor * 0.55, vec3(0.012, 0.014, 0.02), smoothstep(0.1, 0.8, thick));       // onyx where it is deep
  vec3 lit = uSunRaw * (0.16 + 1.5 * pow(sd, 5.0)) * exp(-thick * 4.5) * (1.0 - 0.75 * uDark);   // silver where the sun gets through
  vec3 c = under + lit;
  float fd = length(uFlash.xyz - p); c += vec3(0.7, 0.8, 1.0) * uFlash.w * 1.6 * thick / (1.0 + fd * fd / 640000.0);
  float f = 1.0 - exp(-tH * (uFogDen + 0.000028));                                               // the layer sinks into the haze toward the horizon
  c = mix(c, uFogCol, f);
  return vec4(c * a, a);
}

void main() {
  vec3 rd = normalize(vRd), ro = uCamPos;
  float sd = max(dot(rd, uSunDir), 0.0);
  vec3 col = skyTint(rd);
  col += uSunRaw * (pow(sd, 5.0) * 0.14 + pow(sd, 40.0) * 0.4 + pow(sd, 400.0) * 1.6) * (1.0 - uDark);
  col += uSunRaw * smoothstep(0.99990, 0.99997, sd) * 420.0;                                        // the disc
  // high cirrus on the calm day and after
  if (rd.y > 0.02) { float tc = 9000.0 / rd.y; vec2 uv = (ro + rd * tc).xz * 0.00006; float ci = fbm2(uv * vec2(1.0, 3.5) + 2.0) * fbm2(uv * 2.3 + 7.0);
    col += (uSkyHor * 0.7 + uSunRaw * 0.25) * smoothstep(0.22, 0.6, ci) * 0.5 * exp(-tc * 0.000035) * (1.0 - uDark); }
  // below the horizon line: far land lost in haze
  col = mix(col, uFogCol * 0.9, smoothstep(0.0, -0.03, rd.y));

  // anvil, then the deck
  vec4 an = deck(ro, rd, 4300.0, 0.0); col = col * (1.0 - an.a) + an.rgb;
  vec4 dk = deck(ro, rd, 1150.0, 1.0); col = col * (1.0 - dk.a) + dk.rgb;

  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 5.588238 * floor(mod(uTime * 60.0, 64.0)), vec2(0.06711056, 0.00583715))));      // a new grain every frame, so the march never shows as a pattern
  bool outside = ro.x < uFront + 250.0;
  vec4 cu = curtain(ro, rd, 60000.0);
  if (outside) col = col * (1.0 - cu.a) + cu.rgb;                  // the rain hangs behind the roll cloud
  if (outside && rd.x > 0.015) {
    // ---- the wall from outside: march through its face ----
    float tE = (uFront - 760.0 - ro.x) / rd.x, tX = (uFront + 2400.0 - ro.x) / rd.x;
    if (rd.y > 0.0005) tX = min(tX, (5200.0 - ro.y) / rd.y);
    if (rd.y < -0.0005) tX = min(tX, (0.0 - ro.y) / rd.y);
    tE = max(tE, 0.0);
    if (tX > tE) {
      float ds = (tX - tE) / uSteps, t = tE + ds * jit, T = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < 40; i++) {
        if (float(i) >= uSteps || T < 0.03) break;
        vec3 p = ro + rd * t; float dIn; float rho = stormRho(p, dIn);
        if (rho > 0.002) {
          float d2; stormRho(p + LC * 170.0, d2);
          float shade = clamp((dIn - d2) / 150.0 * 0.5 + 0.42, 0.0, 1.0), up = smoothstep(300.0, 3000.0, p.y);
          shade *= shade;
          vec3 c = vec3(0.005, 0.006, 0.009) + (uSkyHor * 0.075 + uSkyZen * 0.04) * shade * (0.35 + 0.85 * up) + uSunCol * 0.03 * shade * up;
          float fd = length(uFlash.xyz - p); c += vec3(0.72, 0.82, 1.0) * uFlash.w * 9.0 / (1.0 + fd * fd / 90000.0);
          float a = 1.0 - exp(-rho * ds / 110.0);
          acc += T * a * c; T *= 1.0 - a;
        }
        t += ds;
      }
      float f = 1.0 - exp(-tE * (uFogDen * 0.5 + 0.000004));
      acc = mix(acc, uFogCol * (1.0 - T), f * 0.85);
      col = col * T + acc;
    }
  } else if (rd.x < -0.015 && ro.x > uFront + 1500.0) {
    // ---- the storm seen from behind: its tower, a long way off ----
    float tP = (uFront + 1300.0 - ro.x) / rd.x; vec3 p = ro + rd * tP;
    float yTop = 4300.0 * (0.62 + 0.6 * fbm2(vec2(p.z / 3800.0, 1.5 + uTime * 0.004))) + 420.0 * (fbm2(vec2(p.z / 520.0, p.y / 520.0)) - 0.5);
    float a = smoothstep(yTop + 160.0, yTop - 520.0, p.y) * step(0.0, p.y);
    float bil = fbm2(vec2(p.z / 900.0 + 9.0, p.y / 700.0 - uTime * 0.01));
    vec3 c = vec3(0.012, 0.014, 0.020) + uSkyHor * 0.11 * smoothstep(yTop - 900.0, yTop, p.y) * bil;
    float fd = length(uFlash.xyz - p); c += vec3(0.72, 0.82, 1.0) * uFlash.w * 5.0 * (0.4 + bil) / (1.0 + fd * fd / 360000.0);
    float f = 1.0 - exp(-tP * (uFogDen * 0.5 + 0.000012));
    c = mix(c, uFogCol, f);
    col = mix(col, c, a);
  }
  // the sheet of rain from inside or behind, and the murk when we are in it
  if (!outside) col = col * (1.0 - cu.a) + cu.rgb;
  float far = 9000.0 / (abs(rd.y) * 7.0 + 1.0);
  float f = 1.0 - exp(-far * uFogDen * 1.0);
  vec3 fc = uFogCol + vec3(0.7, 0.78, 1.0) * uFlash.w * uDark * (0.10 + 1.0 * pow(max(dot(rd, normalize(uFlash.xyz - ro)), 0.0), 8.0));
  col = mix(col, fc, f * smoothstep(0.3, 0.9, uDark + uRain));
  frag = vec4(col, 1.0);
}`;

const VERT = /* glsl */`
uniform mat4 uProjInv, uCamWorld;
out vec3 vRd;
void main() {
  vec4 v = uProjInv * vec4(position.xy, 1.0, 1.0);
  vRd = mat3(uCamWorld) * (v.xyz / v.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

export const Sky = {
  mesh: null,
  init() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { ...U, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uSunRaw: { value: new THREE.Vector3(1.0, 0.86, 0.66) }, uSteps: { value: 30 } },
    });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -100;
    this.mesh = m; this.mat = mat; return m;
  },
  update(camera) {
    const u = this.mat.uniforms;
    u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld);
    u.uSteps.value = G.tier ? 16 : 30;
    u.uSunRaw.value.set(1.0, 0.86 - 0.05 * G.clear, 0.66 - 0.08 * G.clear).multiplyScalar(1.15);
  },
};
