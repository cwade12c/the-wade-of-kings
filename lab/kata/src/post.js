// It Knew What to Do · HDR post-processing: 5-mip bloom, ACES filmic grade, vignette, grain
import * as THREE from 'three';
import { U, GLSL_NOISE } from './core.js';

const VERT = /* glsl */`out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = /* glsl */`precision highp float;
uniform sampler2D tSrc; uniform vec2 uPx; uniform float uFirst;
in vec2 vUv; out vec4 frag;
vec3 pre(vec3 c) {
  if (uFirst < 0.5) return max(c, vec3(0.0));
  c = clamp(c, vec3(0.0), vec3(32.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // soft knee threshold so glowing spren ribbons, torch flames, and spheres bloom richly without muddying rock
  float k = smoothstep(0.65, 1.85, l);
  return c * k / (1.0 + l * 0.12);
}
void main() {
  vec3 a = pre(texture(tSrc, vUv + uPx * vec2(-1.0, -1.0)).rgb);
  vec3 b = pre(texture(tSrc, vUv + uPx * vec2(1.0, -1.0)).rgb);
  vec3 c = pre(texture(tSrc, vUv + uPx * vec2(-1.0, 1.0)).rgb);
  vec3 d = pre(texture(tSrc, vUv + uPx * vec2(1.0, 1.0)).rgb);
  vec3 e = pre(texture(tSrc, vUv).rgb);
  frag = vec4((a + b + c + d) * 0.2 + e * 0.2, 1.0);
}`;

const UP = /* glsl */`precision highp float;
uniform sampler2D tSrc, tAdd; uniform vec2 uPx; uniform float uK;
in vec2 vUv; out vec4 frag;
void main() {
  vec3 s = texture(tSrc, vUv + uPx * vec2(-1.0, -1.0)).rgb
         + texture(tSrc, vUv + uPx * vec2(1.0, -1.0)).rgb
         + texture(tSrc, vUv + uPx * vec2(-1.0, 1.0)).rgb
         + texture(tSrc, vUv + uPx * vec2(1.0, 1.0)).rgb;
  s = s * 0.125 + texture(tSrc, vUv).rgb * 0.5;
  frag = vec4(mix(texture(tAdd, vUv).rgb, s, uK), 1.0);
}`;

const FINAL = /* glsl */`precision highp float;
${GLSL_NOISE}
uniform sampler2D tScene, tBloom;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloom, uFade, uSat, uGrain, uVig;
uniform float uBleed, uRun, uFlash, uFreeze, uCA;
uniform vec3 uTint, uBleedCol;
in vec2 vUv; out vec4 frag;

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  vec2 uv = vUv, c = uv - 0.5;
  float aspect = uRes.x / uRes.y;
  // A breath of lens fringe at the edges, more when a snap lands.
  vec2 ca = c * (0.0016 + uCA * 0.006);
  vec3 s = vec3(texture(tScene, uv - ca).r, texture(tScene, uv).g, texture(tScene, uv + ca).b);
  s = max(s, vec3(0.0));
  vec3 b = max(texture(tBloom, uv).rgb, vec3(0.0));
  vec3 col = s + b * uBloom;
  col *= uExposure * (1.0 + uFlash * 0.9);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSat) * uTint, vec3(0.0));

  // Memory bleeding in from the frame: a light leak with a watercolour edge, paper grain inside it.
  if (uBleed > 0.002) {
    vec2 q = abs(c) * 2.0;
    float box = pow(pow(q.x, 5.0) + pow(q.y, 5.0), 0.2);
    vec2 nuv = vec2(uv.x * aspect, uv.y);
    float wn = fbm2(nuv * 1.7 + vec2(uTime * 0.022, -uTime * 0.016));
    float wf = n2(nuv * 22.0 + 7.0);
    float runs = n2(vec2(nuv.x * 9.0, 2.0)) * smoothstep(0.1, 0.6, uv.y) * uRun;
    // Tongues of light find their way in from the edges rather than framing the picture.
    float tongue = smoothstep(0.38, 0.75, wn);
    float reach = uBleed * (0.025 + 0.11 * tongue) + runs * 0.10 * uBleed;
    float front = (1.0 - box) - reach + (wf - 0.5) * 0.035;
    float wash = 1.0 - smoothstep(-0.01, 0.12, front);
    float line = exp(-pow(front * 30.0, 2.0)) * smoothstep(0.02, 0.2, reach);
    float paper = 0.88 + 0.12 * fbm2(nuv * vec2(70.0, 70.0));
    vec3 leak = uBleedCol * (wash * (0.10 + 0.22 * wn) * paper + line * 0.07);
    col += leak * uBleed;
    col *= 1.0 - (1.0 - paper) * wash * uBleed * 0.4;
  }

  col = aces(col * 0.90);
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.16);
  // Time held still: colour drains a little, the frame cools.
  float fl = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, mix(vec3(fl), col, 0.55) * vec3(0.94, 0.99, 1.06), uFreeze * 0.6);
  float v = dot(c, c);
  col *= 1.0 - uVig * v;
  col += (h21(gl_FragCoord.xy + fract(uTime) * 73.1) - 0.5) * uGrain;
  frag = vec4(max(col * uFade, 0.0), 1.0);
}`;

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const mk = (fs, uniforms) => new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false,
});

export const Post = {
  W: 0, H: 0, N: 5,
  init(R) {
    this.R = R;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;
    this.down = mk(DOWN, { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.up = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uPx: { value: new THREE.Vector2() }, uK: { value: 0.65 } });
    this.final = mk(FINAL, {
      tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 0.7 }, uFade: { value: 1 },
      uSat: { value: 1 }, uGrain: { value: 0.025 }, uVig: { value: 0.68 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
      uNoise: U.uNoise, uBleed: { value: 0 }, uRun: { value: 0 }, uFlash: { value: 0 }, uFreeze: { value: 0 }, uCA: { value: 0 },
      uBleedCol: { value: new THREE.Vector3(1, 0.8, 0.5) },
    });
    this.scene = null; this.mips = []; this.ups = [];
  },
  size(w, h, samples) {
    if (w === this.W && h === this.H && samples === this.samples) return;
    this.W = w; this.H = h; this.samples = samples;
    const opt = {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
    };
    if (this.scene) this.scene.dispose();
    for (const m of this.mips) m.dispose();
    for (const m of this.ups) m.dispose();
    this.scene = new THREE.WebGLRenderTarget(w, h, { ...opt, depthBuffer: true, samples });
    this.mips = []; this.ups = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.N; i++) {
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, opt));
      this.ups.push(new THREE.WebGLRenderTarget(mw, mh, opt));
    }
  },
  pass(mat, target) {
    this.quad.material = mat;
    this.R.setRenderTarget(target);
    this.R.render(this.quad, this.cam);
  },
  render(scene, camera, P, t) {
    const R = this.R;
    R.setRenderTarget(this.scene);
    R.render(scene, camera);
    let src = this.scene.texture, sw = this.W, sh = this.H;
    for (let i = 0; i < this.N; i++) {
      const u = this.down.uniforms;
      u.tSrc.value = src; u.uPx.value.set(1 / sw, 1 / sh); u.uFirst.value = i === 0 ? 1 : 0;
      this.pass(this.down, this.mips[i]);
      src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
    }
    let acc = this.mips[this.N - 1];
    for (let i = this.N - 2; i >= 0; i--) {
      const u = this.up.uniforms;
      u.tSrc.value = acc.texture; u.tAdd.value = this.mips[i].texture;
      u.uPx.value.set(1 / acc.width, 1 / acc.height); u.uK.value = 0.65;
      this.pass(this.up, this.ups[i]);
      acc = this.ups[i];
    }
    const f = this.final.uniforms;
    f.tScene.value = this.scene.texture; f.tBloom.value = acc.texture;
    f.uRes.value.set(this.W, this.H); f.uTime.value = t;
    f.uExposure.value = P.exposure; f.uBloom.value = P.bloom; f.uFade.value = P.fade;
    f.uSat.value = P.sat; f.uGrain.value = P.grain; f.uVig.value = P.vig;
    f.uTint.value.copy(P.tint);
    f.uBleed.value = P.bleed; f.uRun.value = P.run; f.uFlash.value = P.flash; f.uFreeze.value = P.freeze; f.uCA.value = P.ca;
    f.uBleedCol.value.copy(P.bleedCol);
    this.pass(this.final, null);
  },
};
