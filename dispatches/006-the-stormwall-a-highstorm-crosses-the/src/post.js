// The Stormwall · the picture after the scene: an HDR target, bloom from a mip chain, grade, lens
import * as THREE from 'three';

const VERT = /* glsl */`out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DOWN = /* glsl */`precision highp float; uniform sampler2D tSrc; uniform vec2 uPx; uniform float uFirst; in vec2 vUv; out vec4 frag;
vec3 pre(vec3 c) { if (uFirst < 0.5) return c; c = min(c, vec3(60.0)); float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return c * (1.0 / (1.0 + l * 0.12)); }
void main() {
  vec3 a = pre(texture(tSrc, vUv + uPx * vec2(-1.0, -1.0)).rgb), b = pre(texture(tSrc, vUv + uPx * vec2(1.0, -1.0)).rgb);
  vec3 c = pre(texture(tSrc, vUv + uPx * vec2(-1.0, 1.0)).rgb), d = pre(texture(tSrc, vUv + uPx * vec2(1.0, 1.0)).rgb);
  vec3 e = pre(texture(tSrc, vUv).rgb);
  frag = vec4((a + b + c + d) * 0.2 + e * 0.2, 1.0);
}`;
const UP = /* glsl */`precision highp float; uniform sampler2D tSrc, tAdd; uniform vec2 uPx; uniform float uK; in vec2 vUv; out vec4 frag;
void main() {
  vec3 s = texture(tSrc, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture(tSrc, vUv + uPx * vec2(1.0, -1.0)).rgb + texture(tSrc, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture(tSrc, vUv + uPx * vec2(1.0, 1.0)).rgb;
  s = s * 0.125 + texture(tSrc, vUv).rgb * 0.5;
  frag = vec4(mix(texture(tAdd, vUv).rgb, s, uK), 1.0);
}`;
const FINAL = /* glsl */`precision highp float; uniform sampler2D tScene, tBloom; uniform vec2 uRes; uniform float uTime, uExposure, uBloom, uFade, uFlash, uSat, uGrain, uLens; uniform vec3 uTint; in vec2 vUv; out vec4 frag;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 uv = vUv, c = uv - 0.5;
  // rain across the lens: the picture swims a little under running water
  if (uLens > 0.01) { float a = uRes.x / uRes.y; vec2 q = vec2(uv.x * a * 5.0, uv.y * 1.6 + uTime * 0.9);
    float w = sin(q.x * 6.3 + sin(q.y * 3.1 + q.x) * 2.0) * sin(q.y * 4.7 + q.x * 1.3); uv += vec2(w, w * 0.6) * 0.0016 * uLens; }
  vec3 s = texture(tScene, uv).rgb, b = texture(tBloom, uv).rgb;
  vec3 col = mix(s, b, uBloom) + b * uBloom * 0.5;
  col *= uExposure;
  col += vec3(0.75, 0.84, 1.0) * uFlash;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat) * uTint;
  col = aces(col * 0.82);
  col = pow(col, vec3(1.0 / 2.2));
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);                 // a little shoulder and toe
  float v = dot(c, c); col *= 1.0 - 0.62 * v;                          // vignette
  col += (h21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain;
  frag = vec4(col * uFade, 1.0);
}`;

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const mk = (fs, uniforms) => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });

export const Post = {
  W: 0, H: 0, N: 5,
  init(R) {
    this.R = R; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.quad = new THREE.Mesh(tri); this.quad.frustumCulled = false;
    this.down = mk(DOWN, { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.up = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uPx: { value: new THREE.Vector2() }, uK: { value: 0.6 } });
    this.final = mk(FINAL, { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 0.08 }, uFade: { value: 1 }, uFlash: { value: 0 }, uSat: { value: 1 }, uGrain: { value: 0.03 }, uLens: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) } });
    this.scene = null; this.mips = []; this.ups = [];
  },
  size(w, h, samples) {
    if (w === this.W && h === this.H && samples === this.samples) return;
    this.W = w; this.H = h; this.samples = samples;
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
    if (this.scene) this.scene.dispose(); for (const m of this.mips) m.dispose(); for (const m of this.ups) m.dispose();
    this.scene = new THREE.WebGLRenderTarget(w, h, { ...opt, depthBuffer: true, samples });
    this.mips = []; this.ups = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.N; i++) { mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1); this.mips.push(new THREE.WebGLRenderTarget(mw, mh, opt)); this.ups.push(new THREE.WebGLRenderTarget(mw, mh, opt)); }
  },
  pass(mat, target) { this.quad.material = mat; this.R.setRenderTarget(target); this.R.render(this.quad, this.cam); },
  render(scene, camera, P, t) {
    const R = this.R;
    R.setRenderTarget(this.scene); R.render(scene, camera);
    let src = this.scene.texture, sw = this.W, sh = this.H;
    for (let i = 0; i < this.N; i++) {
      const u = this.down.uniforms; u.tSrc.value = src; u.uPx.value.set(1 / sw, 1 / sh); u.uFirst.value = i === 0 ? 1 : 0;
      this.pass(this.down, this.mips[i]); src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
    }
    let acc = this.mips[this.N - 1];
    for (let i = this.N - 2; i >= 0; i--) {
      const u = this.up.uniforms; u.tSrc.value = acc.texture; u.tAdd.value = this.mips[i].texture; u.uPx.value.set(1 / acc.width, 1 / acc.height); u.uK.value = 0.62;
      this.pass(this.up, this.ups[i]); acc = this.ups[i];
    }
    const f = this.final.uniforms;
    f.tScene.value = this.scene.texture; f.tBloom.value = acc.texture; f.uRes.value.set(this.W, this.H); f.uTime.value = t;
    f.uExposure.value = P.exposure; f.uBloom.value = P.bloom; f.uFade.value = P.fade; f.uFlash.value = P.flash; f.uSat.value = P.sat; f.uGrain.value = P.grain; f.uLens.value = P.lens; f.uTint.value.copy(P.tint);
    this.pass(this.final, null);
  },
};
