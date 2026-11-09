import * as THREE from "three";
const P = window.P;
const U = (id) => P.unitById[id];
const cite = (c) => `<a class="cite" href="../../journal.html#${P.unitAnchor(c)}" title="${P.esc(U(c).full)}">${P.esc(U(c).short)}</a>`;
document.getElementById("safe").innerHTML = cite("wok:19");
const allowed = P.visible(U("wok:19").h);
if (!allowed) document.getElementById("veil").classList.add("on");

// ------------------------------------------------------------ the scenes, timed to the score
// uv coordinates: (0,0) bottom-left, (1,1) top-right of each painting.
// cam: [x, y, z] start and end offsets for the camera; smoke: segments [x0,y0,x1,y1,w0,w1];
// flame: [x,y,radius,r,g,b]; breathe: [x,y,rx,ry,amp]; fx: particle layers.
const SCENES = window.STARFALL_SCENES;
const END = 168, END_CARD = 156.5;

// ------------------------------------------------------------ renderer
const stage = document.getElementById("stage"), canvas = document.getElementById("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
const paneScenes = [new THREE.Scene(), new THREE.Scene()], cams = [new THREE.PerspectiveCamera(30, 1.5, 0.1, 50), new THREE.PerspectiveCamera(30, 1.5, 0.1, 50)];
const camera = cams[1];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const io = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const hash = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7 + 0.5) * 43758.5453; return x - Math.floor(x); };
function noise1(t, s = 0) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(hash(i, s), hash(i + 1, s), u) * 2 - 1; }

const PW = 3.0 * 1.06, PH = 2.0 * 1.06, DZ = 0.75, FOV_D = 4.55;
const paneGeo = new THREE.PlaneGeometry(PW, PH, 300, 200);
const MAXS = 3, MAXF = 3, MAXB = 3;
const vec4s = (n) => Array.from({ length: n }, () => new THREE.Vector4(0, 0, 0, 0));
const vec2s = (n) => Array.from({ length: n }, () => new THREE.Vector2(0, 0));
function paintingMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      tPaint: { value: null }, tDepth: { value: null }, uT: { value: 0 }, uAlpha: { value: 1 }, uSeed: { value: 0 }, uDZ: { value: DZ },
      uSmokeA: { value: vec4s(MAXS) }, uSmokeW: { value: vec2s(MAXS) }, uSmokeN: { value: 0 }, uSurge: { value: 0 },
      uFlame: { value: vec4s(MAXF) }, uFlameC: { value: Array.from({ length: MAXF }, () => new THREE.Color()) }, uFlameN: { value: 0 },
      uBreathe: { value: vec4s(MAXB) }, uBreatheA: { value: new Array(MAXB).fill(0) }, uBreatheN: { value: 0 },
      uFlash: { value: new THREE.Color(0, 0, 0) }, uExp: { value: 1 }, uGlow: { value: new THREE.Vector4(0, 0, 0, 0) }, uGlowC: { value: new THREE.Color() },
    },
    vertexShader: `
      uniform sampler2D tDepth; uniform float uDZ; varying vec2 vUv;
      void main() { vUv = uv; float d = texture2D(tDepth, uv).r; vec3 p = position; p.z += (d - 0.35) * uDZ;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `
      #define MAXS ${MAXS}
      #define MAXF ${MAXF}
      #define MAXB ${MAXB}
      varying vec2 vUv;
      uniform sampler2D tPaint, tDepth; uniform float uT, uAlpha, uSeed, uSurge, uExp;
      uniform vec4 uSmokeA[MAXS]; uniform vec2 uSmokeW[MAXS]; uniform int uSmokeN;
      uniform vec4 uFlame[MAXF]; uniform vec3 uFlameC[MAXF]; uniform int uFlameN;
      uniform vec4 uBreathe[MAXB]; uniform float uBreatheA[MAXB]; uniform int uBreatheN;
      uniform vec3 uFlash; uniform vec4 uGlow; uniform vec3 uGlowC;
      const vec2 ASP = vec2(1.5, 1.0);
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n(p); p *= 2.02; a *= 0.5; } return v; }
      vec2 seg(vec2 p, vec2 a, vec2 b) { vec2 pa = (p - a) * ASP, ba = (b - a) * ASP; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return vec2(length(pa - ba * t), t); }
      float blob(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return 1.0 - smoothstep(0.5, 1.0, length(q)); }
      void main() {
        vec2 uv = vUv;
        // living smoke: the painting's own smoke flowed along each column, in two crossfaded phases
        float sM = 0.0; vec2 flow = vec2(0.0);
        for (int i = 0; i < MAXS; i++) {
          if (i >= uSmokeN) break;
          vec2 a = uSmokeA[i].xy, b = uSmokeA[i].zw; vec2 sg = seg(uv, a, b);
          float w = mix(uSmokeW[i].x, uSmokeW[i].y, sg.y);
          float m = (1.0 - smoothstep(w * 0.55, w, sg.x)) * smoothstep(0.0, 0.06, sg.y);
          if (m > sM) { sM = m; flow = normalize(b - a) * 0.065 * smoothstep(0.02, 0.2, sg.y); }
        }
        vec3 col;
        if (sM > 0.001) {
          flow *= 1.0 + uSurge;
          float p0 = fract(uT * 0.17), p1 = fract(uT * 0.17 + 0.5);
          vec2 curl = (vec2(fbm(uv * 9.0 + vec2(0.0, -uT * 0.35)), fbm(uv * 9.0 + 4.3 + vec2(0.0, -uT * 0.3))) - 0.5) * 0.022;
          vec3 c0 = texture2D(tPaint, mix(uv, uv - flow * p0 + curl, sM)).rgb, c1 = texture2D(tPaint, mix(uv, uv - flow * p1 + curl, sM)).rgb;
          col = mix(c0, c1, abs(p0 - 0.5) * 2.0);
        } else col = texture2D(tPaint, uv).rgb;
        // breathing: necks weave, bodies heave, figures tremble
        vec2 off = vec2(0.0); float bM = 0.0;
        for (int i = 0; i < MAXB; i++) {
          if (i >= uBreatheN) break;
          float m = blob(uv, uBreathe[i].xy, uBreathe[i].zw); float a = uBreatheA[i];
          off += m * a * vec2(sin(uT * 1.1 + float(i) * 2.0) + 0.6 * n(vec2(uT * 0.9, float(i) * 7.0)), sin(uT * 0.8 + float(i)) * 0.7);
          bM = max(bM, m);
        }
        if (bM > 0.001) col = mix(col, texture2D(tPaint, uv - off * 0.004).rgb, clamp(bM * 2.0, 0.0, 1.0) * (1.0 - sM));
        // flames and glows breathe light into the room
        float lightK = 0.0;
        for (int i = 0; i < MAXF; i++) {
          if (i >= uFlameN) break;
          vec2 fp = uFlame[i].xy; float r = uFlame[i].z, k = uFlame[i].w;
          float d = length((uv - fp) * ASP);
          col += uFlameC[i] * k * exp(-d / r) * 0.22;
          lightK += k * exp(-d / (r * 4.0));
        }
        col *= 1.0 + lightK * 0.12;
        // a travelling glow (the starfall, Stormlight, Regrowth)
        if (uGlow.w > 0.0) { float d = length((uv - uGlow.xy) * ASP); col += uGlowC * uGlow.w * exp(-d / uGlow.z); }
        col *= uExp;
        col += uFlash;
        // grade: deeper corners, a whisper of grain
        vec2 q = vUv - 0.5; col *= mix(0.68, 1.0, smoothstep(0.85, 0.25, length(q * vec2(1.25, 1.0))));
        col += (h(gl_FragCoord.xy + fract(uT * 37.0) * 91.0) - 0.5) * 0.022;
        // ink-bleed dissolve when the next painting arrives
        float th = fbm(vUv * 3.5 + uSeed) * 0.7 + fbm(vUv * 18.0 - uSeed) * 0.3;
        float a = smoothstep(th - 0.08, th + 0.08, uAlpha * 1.18 - 0.09);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}
const layers = [0, 1].map((k) => {
  const pane = new THREE.Mesh(paneGeo, paintingMaterial());
  paneScenes[k].add(pane); return pane;
});

// ------------------------------------------------------------ particles: screen-space layers worked out from the clock
const pScene = new THREE.Scene(), pCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
function layer(n, frag, vert, add = true) {
  const g = new THREE.BufferGeometry(), s = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) s[i] = hash(i, n + 3);
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute("aS", new THREE.BufferAttribute(s, 4));
  const m = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uT: { value: 0 }, uK: { value: 0 }, uH: { value: 600 }, uP: { value: new THREE.Vector4(0.5, 0.5, 0.3, 0.3) }, uC: { value: new THREE.Color(1, 0.8, 0.5) } },
    vertexShader: `attribute vec4 aS; uniform float uT, uK, uH; uniform vec4 uP; varying float vA; varying float vR; ${vert}`,
    fragmentShader: `varying float vA; varying float vR; uniform vec3 uC; ${frag}` });
  const p = new THREE.Points(g, m); p.frustumCulled = false; pScene.add(p); return p;
}
const SOFTDOT = `void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard; gl_FragColor = vec4(uC, (1.0 - r) * (1.0 - r) * vA); }`;
const FX = {
  // warm dust motes drifting in lamplight around uP.xy
  motes: layer(150, SOFTDOT, `void main() {
    float t = uT * (0.02 + aS.w * 0.03) + aS.x; vec2 p = uP.xy + vec2((aS.x - 0.5) * uP.z * 2.0 + sin(t * 6.28 + aS.y * 9.0) * 0.02, fract(t) * uP.w * 2.0 - uP.w);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = (1.2 + aS.y * 2.4) * uH / 700.0;
    float d = length((p - uP.xy) / max(uP.zw, vec2(0.01))); vA = uK * exp(-d * 1.5) * smoothstep(0.0, 0.15, fract(t)) * (1.0 - smoothstep(0.8, 1.0, fract(t))) * (0.5 + 0.5 * sin(uT * 2.0 + aS.y * 20.0)); }`),
  // grain dust: a burst of pale specks from uP.xy
  grain: layer(420, SOFTDOT, `void main() {
    float a = aS.x * 6.2832, sp = 0.15 + aS.y * 0.5, age = uT * (0.6 + aS.z * 0.6);
    vec2 p = uP.xy + vec2(cos(a), sin(a) * 0.7) * sp * (1.0 - exp(-age * 1.8)) + vec2(sin(age + aS.w * 6.0) * 0.02, -age * age * 0.01);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = (1.0 + aS.w * 2.2) * uH / 700.0; vA = uK * (0.5 + 0.5 * aS.z) * exp(-age * 0.25); }`),
  // embers rising from fire at uP.xy
  embers: layer(90, SOFTDOT, `void main() {
    float t = fract(uT * (0.18 + aS.w * 0.2) + aS.x); vec2 p = uP.xy + vec2((aS.y - 0.5) * uP.z + sin(t * 9.0 + aS.z * 6.0) * 0.015, t * uP.w);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = (1.4 + aS.z * 2.0) * uH / 700.0; vA = uK * (1.0 - t) * smoothstep(0.0, 0.1, t); }`),
  // Stormlight: blue motes and wisps rising around uP.xy
  storm: layer(260, `void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard; gl_FragColor = vec4(uC * (1.2 + vR), (1.0 - r) * (1.0 - r) * vA); }`, `void main() {
    float t = fract(uT * (0.12 + aS.w * 0.16) + aS.x); vec2 p = uP.xy + vec2((aS.y - 0.5) * uP.z + sin(t * 7.0 + aS.z * 6.0) * 0.02, (t - 0.3) * uP.w);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = (2.0 + aS.z * 5.0) * uH / 700.0; vA = uK * (1.0 - t) * smoothstep(0.0, 0.15, t) * 0.8; vR = aS.y; }`),
  // sparks and chips thrown out of an impact at uP.xy
  sparks: layer(220, SOFTDOT, `void main() {
    float a = 0.2 + aS.x * 2.74, sp = 0.2 + aS.y * 0.9, age = uT;
    vec2 p = uP.xy + vec2(cos(a), sin(a)) * sp * age - vec2(0.0, 0.45 * age * age);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = (1.4 + aS.z * 3.0) * uH / 700.0; vA = uK * exp(-age * (1.2 + aS.w)); }`),
  // falling lights over the village: streaks drawn as stretched points
  fall: layer(14, `void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float w = exp(-c.x * c.x * 40.0) * smoothstep(1.0, -0.6, c.y) * smoothstep(-1.0, -0.7, c.y); gl_FragColor = vec4(mix(uC, vec3(1.0, 0.75, 0.35), step(0.86, vR)) * 1.6, w * vA); }`, `void main() {
    float t = fract(uT * 0.09 + aS.x); vec2 p = vec2(uP.x + (aS.y - 0.5) * uP.z, 1.08 - t * (1.08 - uP.y - aS.z * 0.12));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = (18.0 + aS.w * 16.0) * uH / 700.0; vA = uK * smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.85, 1.0, t)); vR = aS.y; }`),
  // rain in the barrack, at the very end
  rain: layer(260, `void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float w = exp(-c.x * c.x * 60.0) * (1.0 - c.y * c.y); gl_FragColor = vec4(uC, w * vA); }`, `void main() {
    float t = fract(uT * (0.9 + aS.w * 0.5) + aS.x); vec2 p = vec2(aS.y * 1.2 - 0.1 + t * 0.06, 1.05 - t * 1.1);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = (10.0 + aS.z * 10.0) * uH / 700.0; vA = uK * 0.35; }`, false),
};
FX.storm.material.uniforms.uC.value.setRGB(0.35, 0.6, 1.0);
FX.sparks.material.uniforms.uC.value.setRGB(0.75, 0.88, 1.0);
FX.fall.material.uniforms.uC.value.setRGB(0.45, 0.7, 1.0);
FX.rain.material.uniforms.uC.value.setRGB(0.7, 0.72, 0.8);
FX.grain.material.uniforms.uC.value.setRGB(0.95, 0.88, 0.75);
FX.embers.material.uniforms.uC.value.setRGB(1.0, 0.55, 0.2);

// ------------------------------------------------------------ assets
const tl = new THREE.TextureLoader();
const TEX = SCENES.map(() => null);
let loaded = 0;
const loadBar = document.getElementById("load");
function loadScene(i) {
  if (TEX[i]) return TEX[i].ready;
  const s = SCENES[i], rec = { paint: null, depth: null };
  rec.ready = Promise.all([tl.loadAsync(`${s.id}.jpg`), tl.loadAsync(`${s.id}-depth.png`)]).then(([p, d]) => {
    p.colorSpace = THREE.SRGBColorSpace; p.anisotropy = 4; d.colorSpace = THREE.NoColorSpace;
    rec.paint = p; rec.depth = d; loaded++; loadBar.style.width = `${(loaded / SCENES.length) * 100}%`; if (loaded === SCENES.length) loadBar.style.opacity = 0;
  });
  TEX[i] = rec; return rec.ready;
}
(async () => { for (let i = 0; i < SCENES.length; i++) await loadScene(i); })();

// ------------------------------------------------------------ sound: the score and effects are one mixed track; it is the clock
const audio = new Audio("starfalls.m4a"); audio.preload = "auto";
let playing = false, t = SCENES[9].t0 + 1.2, poster = true, last = performance.now();
const sceneAt = (x) => { let k = 0; for (let i = 0; i < SCENES.length; i++) if (x >= SCENES[i].t0) k = i; return k; };
function clock() { return playing && !audio.paused ? audio.currentTime : t; }

function applyScene(mesh, s, lt, alpha, rec, seed) {
  const u = mesh.material.uniforms;
  u.tPaint.value = rec.paint; u.tDepth.value = rec.depth; u.uT.value = lt; u.uAlpha.value = alpha; u.uSeed.value = seed;
  const sm0 = s.smoke || [];
  u.uSmokeN.value = Math.min(MAXS, sm0.length);
  sm0.slice(0, MAXS).forEach((z, i) => { u.uSmokeA.value[i].set(z[0], z[1], z[2], z[3]); u.uSmokeW.value[i].set(z[4], z[5]); });
  const fl = s.flame || [];
  u.uFlameN.value = Math.min(MAXF, fl.length);
  fl.slice(0, MAXF).forEach((f, i) => { const k = 1 + noise1(lt * 7 + i * 3, 30 + i) * 0.35 + noise1(lt * 19 + i, 31) * 0.15; u.uFlame.value[i].set(f[0], f[1], f[2], k); u.uFlameC.value[i].setRGB(f[3], f[4], f[5]); });
  const br = s.breathe || [];
  u.uBreatheN.value = Math.min(MAXB, br.length);
  br.slice(0, MAXB).forEach((b, i) => { u.uBreathe.value[i].set(b[0], b[1], b[2], b[3]); u.uBreatheA.value[i] = b[4]; });
  u.uSurge.value = s.surge ? s.surge(lt) : 0;
  u.uExp.value = s.exp ? s.exp(lt) : 1;
  const fl2 = s.flash ? s.flash(lt) : null; u.uFlash.value.setRGB(fl2 ? fl2[0] : 0, fl2 ? fl2[1] : 0, fl2 ? fl2[2] : 0);
  const gl = s.glow ? s.glow(lt) : null; if (gl) { u.uGlow.value.set(gl[0], gl[1], gl[2], gl[3]); u.uGlowC.value.setRGB(gl[4], gl[5], gl[6]); } else u.uGlow.value.w = 0;
}
// a steady glide: linear, and it keeps going past the scene's end so a painting never snaps back while it dissolves away
function placeCamera(camera, s, lt) {
  const dur = s.t1 - s.t0, u = lt / dur;
  const [a, b] = s.cam || [[0, 0, 0], [0, 0, -0.25]];
  const x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u), z = FOV_D + lerp(a[2], b[2], u);
  let shake = 0; if (s.shake) for (const [st, amp, len] of s.shake) shake += amp * sm(st - 0.02, st, lt) * (1 - sm(st, st + len, lt));
  const sx = noise1(lt * 17, 1) * shake, sy = noise1(lt * 15, 2) * shake;
  const reduce = P.reducedMotion ? 0 : 1;
  camera.position.set((x + sx) * reduce, (y + sy) * reduce, reduce ? z : FOV_D);
  camera.lookAt(camera.position.x * 0.6, camera.position.y * 0.6, 0);
  camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(1.0 / FOV_D)); camera.updateProjectionMatrix();
}
const cap = document.getElementById("cap"), endEl = document.getElementById("end");
let capShown = -1;
function setFx(name, k, p, lt) { const m = FX[name].material.uniforms; m.uK.value = k; if (p) m.uP.value.set(p[0], p[1], p[2], p[3]); m.uT.value = lt; FX[name].visible = k > 0.001 && !P.reducedMotion; }
function render(T) {
  const i = sceneAt(T), s = SCENES[i], next = SCENES[i + 1];
  const lt = T - s.t0;
  const rec = TEX[i];
  if (!rec || !rec.paint) { renderer.clear(); return; }
  // the previous painting dissolves into this one, unless this is a hard cut
  const inDur = s.cut ? 0.0001 : (s.dissolve || 1.6);
  const a = clamp(lt / inDur);
  const prev = SCENES[i - 1], prec = TEX[i - 1];
  layers[0].visible = layers[1].visible = false;
  renderer.clear();
  if (i > 0 && a < 1 && prec && prec.paint) {
    applyScene(layers[0], prev, T - prev.t0, 1, prec, 0); layers[0].visible = true;
    placeCamera(cams[0], prev, T - prev.t0); renderer.render(paneScenes[0], cams[0]);
  }
  applyScene(layers[1], s, lt, i > 0 ? io(a) : 1, rec, i * 3.1);
  layers[1].visible = true;
  placeCamera(cams[1], s, lt); renderer.render(paneScenes[1], cams[1]);
  for (const k of Object.keys(FX)) FX[k].visible = false;
  if (s.fx) for (const f of s.fx) setFx(f[0], typeof f[1] === "function" ? f[1](lt) : f[1], f[2], lt + (f[3] || 0));
  renderer.render(pScene, pCam);
  // captions and the end card
  const showCap = lt > (s.capAt ?? (s.cut ? 0.8 : (s.dissolve || 1.6) + 0.3)) && lt < (s.t1 - s.t0 - 0.9) && T < END_CARD;
  if (i !== capShown) { const b = cap.querySelector("b"); b.textContent = s.quote; b.classList.toggle("long", s.quote.length > 110); cap.querySelector("span").textContent = s.title + (s.kicker ? " · " + s.kicker : ""); capShown = i; cap.classList.remove("on"); }
  cap.classList.toggle("on", showCap && !poster);
  endEl.classList.toggle("on", T > END_CARD + 0.5 && !poster);
  sceneBtns.forEach((b, j) => b.setAttribute("aria-current", String(j === i)));
}

// ------------------------------------------------------------ controls
const playBtn = document.getElementById("play"), startBtn = document.getElementById("start"), muteBtn = document.getElementById("mute");
const scrub = document.getElementById("scrub"), done = document.getElementById("done"), timeEl = document.getElementById("time");
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15L19.5 12z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
};
const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
document.getElementById("ticks").innerHTML = SCENES.slice(1).map((s) => `<i class="tk" style="left:${(s.t0 / END * 100).toFixed(2)}%"></i>`).join("");
const sceneList = document.getElementById("scenes");
sceneList.innerHTML = SCENES.map((s, i) => `<li><button type="button" data-i="${i}" aria-label="Scene ${i + 1}: ${P.esc(s.title)}"><img src="${s.id}-thumb.jpg" alt="" loading="lazy"><em>${P.esc(s.title)}</em></button></li>`).join("");
const sceneBtns = [...sceneList.querySelectorAll("button")];
function play() {
  poster = false; startBtn.hidden = true;
  if (t >= END - 0.05) t = 0;
  audio.currentTime = t;
  const pr = audio.play(); playing = true;
  if (pr && pr.catch) pr.catch(() => { playing = true; audio.pause(); silent = true; });
  last = performance.now(); setIcons();
}
let silent = false;
function pause() { t = clock(); audio.pause(); playing = false; setIcons(); }
function seek(x) { t = clamp(x, 0, END); if (playing && !silent) audio.currentTime = t; poster = false; startBtn.hidden = true; }
function setIcons() { playBtn.innerHTML = playing ? ICON.pause : ICON.play; playBtn.setAttribute("aria-label", playing ? "Pause" : "Play"); muteBtn.innerHTML = audio.muted ? ICON.muted : ICON.sound; muteBtn.setAttribute("aria-pressed", String(audio.muted)); }
startBtn.onclick = () => { t = 0; play(); };
playBtn.onclick = () => (playing ? pause() : play());
muteBtn.onclick = () => { audio.muted = !audio.muted; setIcons(); };
scrub.oninput = () => seek(+scrub.value);
sceneList.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; seek(SCENES[+b.dataset.i].t0 + 0.01); if (!playing) play(); };
audio.addEventListener("ended", () => { playing = false; t = END; setIcons(); });
setIcons();
const qs = new URLSearchParams(location.search);
if (qs.has("t")) { t = +qs.get("t"); poster = false; startBtn.hidden = true; }

function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); for (const c of cams) { c.aspect = w / h; c.updateProjectionMatrix(); }
  for (const k of Object.keys(FX)) FX[k].material.uniforms.uH.value = h * renderer.getPixelRatio(); }
new ResizeObserver(resize).observe(stage); resize();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && (silent || audio.paused)) { t += dt; if (t >= END) { t = END; playing = false; setIcons(); } }
  const T = poster ? t : clock();
  if (allowed) render(T);
  if (!poster) { scrub.value = T.toFixed(1); done.style.width = `${(T / END * 100).toFixed(2)}%`; timeEl.textContent = `${mmss(T)} / ${mmss(END)}`; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------ below the painting

document.querySelectorAll("[data-cite]").forEach((e) => { e.innerHTML = cite(e.dataset.cite); });
document.getElementById("endcite").innerHTML = `The voice, at the end of the vision · ${cite("wok:19")}`;
document.getElementById("credits").innerHTML = window.STARFALL_CREDITS.map(([t, a, l, u]) => `<li><a href="${u}">${P.esc(t)}</a> by ${P.esc(a)}, ${P.esc(l)}</li>`).join("");
