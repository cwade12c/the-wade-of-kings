// It Knew What to Do · memories painted by the kata.
// Each memory is a sumi-e study split into layers (veil, wash, mid, ink). The spear's sweeps paint it:
// at build, the shaft's path is projected onto the memory's surface and stamped into a "first touched" field,
// then that field bleeds outward through noise like ink taken up by wet paper. The shader reads the field
// against film time, so the paper glows where the spear has passed, the wash pools with a darker wet edge,
// and the ink blooms from blur into line. On the way out the ink loosens, runs and lifts off as motes.
import * as THREE from 'three';
import { U, G, rng, clamp, lerp, sm, fbm, GLSL_NOISE } from './core.js';
import { camPose } from './film.js';
import { spearPoseAt } from './kata.js';
import { MEMORY_PATHS } from '../memories/paths.js';
import { Mirror } from './mirror.js';

// t0: first stroke, tIn: fully painted, tOut: starts to loosen, t1: gone. Cited: wok:10, 16, 25, 27.
export const MEMORY_SPECS = [
  { id: 'm0-staff',  t0: 3.9,  tIn: 5.6,  tOut: 6.5,  t1: 7.6,
    paper: [1.00, 0.80, 0.52], ink: [0.10, 0.06, 0.03], edge: [1.6, 1.1, 0.5],
    pos: [-0.10, 1.95, -2.30], scale: [5.0, 2.8], curveRad: 4.2, yaw: 0.0, drift: [0.06, 0.45, 0.05], peak: 0.80, run: 0 },
  { id: 'm1-tukks',  t0: 11.0, tIn: 13.2, tOut: 15.6, t1: 17.3,
    paper: [1.05, 0.80, 0.46], ink: [0.10, 0.06, 0.02], edge: [1.9, 1.3, 0.5],
    pos: [0.30, 2.02, -2.40], scale: [5.6, 3.15], curveRad: 4.0, yaw: -0.08, drift: [0.16, 0.55, 0.08], peak: 0.95, run: 0 },
  { id: 'm2-tien',   t0: 17.5, tIn: 19.4, tOut: 22.1, t1: 23.9,
    paper: [1.16, 1.00, 0.66], ink: [0.11, 0.06, 0.02], edge: [2.1, 1.8, 0.9],
    pos: [0.00, 2.24, -2.45], scale: [5.8, 3.26], curveRad: 3.9, yaw: -0.03, drift: [0.04, 0.80, 0.02], peak: 0.97, run: 0 },
  { id: 'm3-hesina', t0: 24.0, tIn: 26.0, tOut: 28.6, t1: 30.4,
    paper: [1.08, 0.78, 0.60], ink: [0.12, 0.06, 0.04], edge: [1.9, 1.2, 0.8],
    pos: [0.08, 2.04, -2.40], scale: [5.6, 3.15], curveRad: 4.0, yaw: -0.05, drift: [-0.14, 0.52, 0.06], peak: 0.96, run: 0 },
  { id: 'm4-squad',  t0: 30.5, tIn: 32.6, tOut: 36.3, t1: 38.3,
    paper: [0.60, 0.76, 1.00], ink: [0.04, 0.07, 0.12], edge: [1.1, 1.6, 2.3],
    pos: [0.00, 2.02, -2.55], scale: [6.4, 3.6], curveRad: 3.5, yaw: 0.0, drift: [0.22, 0.35, -0.10], peak: 0.94, run: 0 },
  { id: 'm5-lirin',  t0: 38.5, tIn: 40.8, tOut: 43.3, t1: 45.4,
    paper: [0.76, 0.84, 0.92], ink: [0.05, 0.07, 0.10], edge: [1.2, 1.4, 1.8],
    pos: [0.06, 1.98, -2.40], scale: [5.6, 3.15], curveRad: 4.1, yaw: -0.05, drift: [0.0, -0.52, 0.04], peak: 0.95, run: 1 },
];

const FW = 192, FH = 108, SPAN = 6.0;

function buildCurvedArc(width, height, radius, segX = 28, segY = 12) {
  const geo = new THREE.PlaneGeometry(width, height, segX, segY);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const theta = x / radius;
    pos.setXYZ(i, Math.sin(theta) * radius, y, (1 - Math.cos(theta)) * radius);
  }
  geo.computeVertexNormals();
  return geo;
}

async function rasterizeSvgLayers(svgText, keepIds, w, h, mips) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  for (const g of [...root.querySelectorAll('g[id]')]) if (!keepIds.includes(g.id)) g.remove();
  const blob = new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = url; });
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = !!mips;
    tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- The paint field: when the spear first touched each part of the memory, then ink bleeding outward ----
const _P = new THREE.Vector3(), _L = new THREE.Vector3(), _X = new THREE.Vector3(), _D = new THREE.Vector3();
function paintField(spec, idx) {
  const N = FW * FH, F = new Float32Array(N).fill(1e9);
  const inv = new THREE.Matrix4().makeRotationY(-spec.yaw);
  const base = new THREE.Vector3(...spec.pos);
  const W = spec.scale[0], H = spec.scale[1];
  const pose = {};
  const uvAt = (X, t) => {
    camPose('director', t, _P, _L);
    _D.subVectors(X, _P);
    const o = _P.clone().sub(base).applyMatrix4(inv), d = _D.applyMatrix4(inv);
    if (Math.abs(d.z) < 1e-4) return null;
    const s = -o.z / d.z;
    if (s <= 0) return null;
    return [(o.x + d.x * s) / W + 0.5, (o.y + d.y * s) / H + 0.5];
  };
  const stamp = (u, v, rad, t) => {
    const cx = u * FW, cy = v * FH, r = rad * FW;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(FW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(FH - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) { const i = y * FW + x; if (t < F[i]) F[i] = t; }
    }
  };
  const tEnd = spec.tIn + 0.6;
  let hits = 0;
  for (let t = spec.t0; t <= tEnd; t += 1 / 120) {
    spearPoseAt(t, pose);
    const fast = clamp(pose.speed / 4.5, 0.25, 1);
    for (const f of [0.35, 0.55, 0.75, 0.92, 1.0]) {
      _X.lerpVectors(pose.butt, pose.tip, f);
      const uv = uvAt(_X, t);
      if (!uv || uv[0] < -0.1 || uv[0] > 1.1 || uv[1] < -0.1 || uv[1] > 1.1) continue;
      stamp(uv[0], uv[1], (0.018 + 0.022 * f) * fast, t);
      hits++;
    }
  }
  // A seed in the heart of the picture, so a memory always completes even if the sweeps miss it.
  stamp(0.5, 0.5, 0.06, lerp(spec.t0, spec.tIn, 0.55));

  // Ink bleeds outward: weighted chamfer sweeps; noise makes the fronts finger like wet-on-wet.
  const cost = new Float32Array(N), o = idx * 11.3;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const n = fbm(x * 0.07 + o, y * 0.07 - o, 4);
    cost[y * FW + x] = (spec.tIn - spec.t0) * 0.0105 * (0.35 + 1.5 * n * n);
  }
  const NB = [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]];
  for (let pass = 0; pass < 4; pass++) {
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const i = y * FW + x;
      for (const [dx, dy, w] of NB) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= FW) continue;
        const v = F[yy * FW + xx] + cost[i] * w;
        if (v < F[i]) F[i] = v;
      }
    }
    for (let y = FH - 1; y >= 0; y--) for (let x = FW - 1; x >= 0; x--) {
      const i = y * FW + x;
      for (const [dx, dy, w] of NB) {
        const xx = x - dx, yy = y - dy;
        if (xx >= FW || yy >= FH || xx < 0) continue;
        const v = F[yy * FW + xx] + cost[i] * w;
        if (v < F[i]) F[i] = v;
      }
    }
  }
  const data = new Uint8Array(N);
  for (let i = 0; i < N; i++) data[i] = Math.round(clamp((F[i] - spec.t0) / SPAN) * 255);
  const tex = new THREE.DataTexture(data, FW, FH, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, hits };
}

// ---- Paper, wash and ink ----
const MEM_V = /* glsl */`
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const MEM_F = /* glsl */`precision highp float;
${GLSL_NOISE}
uniform sampler2D tLayer, tField, tVeil;
uniform float uTime, uT0, uSpan, uOut0, uOut1, uOpacity, uSeed, uKind, uRun, uLod;
uniform vec3 uPaper, uInk, uEdge;
in vec2 vUv;
out vec4 frag;

void main() {
  // Where and when the spear painted this spot; a ragged front, like pigment finding the paper's grain.
  float jag = (fbm2(vUv * vec2(7.0, 4.0) + uSeed) - 0.5) * 0.55 + (n2(vUv * vec2(60.0, 34.0) + uSeed) - 0.5) * 0.12;
  float f = uT0 + texture(tField, vUv).r * uSpan + jag;
  float age = uTime - f;

  // Loosening: blur grows, the ink lifts (or, for Lirin, runs down), holes open through the paper.
  float out1 = smoothstep(uOut0, uOut1, uTime);
  float dn = fbm2(vUv * 4.2 + vec2(uSeed * 1.7, uTime * 0.09));
  float gone = smoothstep(dn * 0.7 - 0.05, dn * 0.7 + 0.28, out1 * 1.22 - 0.06);
  vec2 uv = vUv;
  float col = floor(vUv.x * 90.0);
  float drip = n2(vec2(col * 0.37, uSeed)) * n2(vec2(vUv.x * 13.0, 1.7));
  uv.y += mix(-0.035 * out1 * out1, 0.10 * out1 * out1 * (0.3 + 1.4 * drip), uRun);
  uv += vec2(sin(uTime * 0.8 + vUv.y * 3.6 + uSeed), cos(uTime * 0.7 + vUv.x * 3.1 + uSeed)) * 0.0018;

  float veil = texture(tVeil, clamp(uv, 0.001, 0.999)).a;
  float edgeK = (fbm2(vUv * 6.0 + uSeed * 3.1) - 0.5) * 0.5 + (n2(vUv * 40.0 - uSeed) - 0.5) * 0.10;
  float m = veil * 1.15 + edgeK;
  float frame = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);

  float washIn = smoothstep(0.0, 0.5, age);
  float wetFront = smoothstep(-0.04, 0.10, age) * (1.0 - smoothstep(0.10, 1.2, age));

  if (uKind < 0.5) {
    // Light, not paper: a glow in the mist, brightest where the memory is, fading out through a ragged
    // watercolour edge with a faint line of pigment where the wash stopped.
    float gran = 0.80 + 0.26 * fbm2(vUv * vec2(48.0, 27.0) + uSeed) + 0.08 * n2(vUv * vec2(260.0, 146.0));
    float glow = smoothstep(0.08, 0.78, m) * (0.62 + 0.55 * fbm2(vUv * 2.3 + uSeed * 0.7));
    float line = exp(-pow((m - 0.12) * 16.0, 2.0)) * 0.16;
    float a = (glow * gran + line) * washIn * frame * (1.0 - gone) * uOpacity;
 vec3 c = uPaper * a * 0.50 + uEdge * wetFront * smoothstep(0.02, 0.3, m) * 0.22 * uOpacity * (1.0 - gone);
    if (max(c.r, max(c.g, c.b)) < 0.002) discard;
    frag = vec4(c, 1.0);
    return;
  }

  // Wash tones and ink lines bloom from blur into line as the spot dries.
  float inkIn = smoothstep(0.18, 1.0, age);
  float lod = mix(uLod, 0.0, inkIn) + out1 * 2.5;
  vec4 tex = textureLod(tLayer, clamp(uv, 0.001, 0.999), lod);
  float a = tex.a * smoothstep(0.08, 0.7, age) * frame * (1.0 - gone) * uOpacity * (0.55 + 0.45 * smoothstep(0.05, 0.5, m));
  a = clamp(a, 0.0, 0.97);
  if (a < 0.003) discard;
  vec3 c = mix(tex.rgb, uInk, 0.55) + uEdge * wetFront * 0.35;
  frag = vec4(c, a);
}`;

// ---- Ink lifting off as motes ----
const CONTOUR_V = /* glsl */`
in vec4 aPt;    // x: u, y: v, z: layer, w: seed
uniform float uTime, uDissolve, uArcW, uArcH, uArcRad, uOpacity, uYaw;
uniform vec3 uCamPos, uBasePos, uDrift, uColor;
out vec2 vUv;
out float vA;
out vec3 vCol;
void main() {
  vUv = uv;
  float dis = clamp(1.0 - uDissolve, 0.0, 1.0);
  float birth = aPt.w * 0.55;
  float age = max(0.0, (dis - birth) / max(0.01, 1.0 - birth));
  float alive = step(0.005, dis) * smoothstep(0.0, 0.14, age) * (1.0 - smoothstep(0.55, 1.0, age));
  if (alive < 0.005 || uOpacity < 0.01) { vA = 0.0; vCol = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float lx = (aPt.x - 0.5) * uArcW, ly = (aPt.y - 0.5) * uArcH;
  float th = lx / uArcRad;
  float cx = sin(th) * uArcRad, cz = (1.0 - cos(th)) * uArcRad;
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 wp = uBasePos + vec3(cx * cy + cz * sy, ly, -cx * sy + cz * cy);
  float swirl = age * age * 1.45;
  wp += uDrift * (age * 1.25) + vec3(sin(uTime * 2.4 + aPt.w * 35.0) * 0.18, cos(uTime * 1.9 + aPt.w * 28.0) * 0.12, sin(uTime * 2.1 + aPt.w * 19.0) * 0.22) * swirl;
  vec3 toCam = normalize(uCamPos - wp);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, rt);
  float sz = (0.018 + 0.026 * fract(aPt.w * 17.3)) * (1.0 - age * 0.42);
  wp += (rt * position.x + up * position.y) * sz;
  vA = alive * uOpacity * 1.3;
  vCol = uColor * (1.0 + 0.8 * (1.0 - age));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const CONTOUR_F = /* glsl */`precision highp float;
in vec2 vUv; in float vA; in vec3 vCol; out vec4 frag;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  frag = vec4(vCol * exp(-r2 * 5.2) * vA, 1.0);
}`;

export const Memories = {
  async build(scene, prog, tick) {
    const texW = G.tier ? 1024 : 1600, texH = G.tier ? 576 : 900;
    const nodes = [];
    const r = rng(271625);

    for (let idx = 0; idx < MEMORY_SPECS.length; idx++) {
      const spec = MEMORY_SPECS[idx];
      let svgText = '';
      try { const res = await fetch(`./memories/${spec.id}.svg`); if (res.ok) svgText = await res.text(); } catch (e) { /* optional */ }
      if (!svgText) { prog((idx + 1) / MEMORY_SPECS.length); continue; }

      const [tVeil, tWash, tInk] = await Promise.all([
        rasterizeSvgLayers(svgText, ['veil'], texW >> 2, texH >> 2, false),
        rasterizeSvgLayers(svgText, ['wash'], texW, texH, true),
        rasterizeSvgLayers(svgText, ['mid', 'ink'], texW, texH, true),
      ]);
      const field = paintField(spec, idx);

      const group = new THREE.Group();
      group.position.set(...spec.pos);
      group.rotation.y = spec.yaw;
      group.visible = false;
      const geo = buildCurvedArc(spec.scale[0], spec.scale[1], spec.curveRad, G.tier ? 18 : 28, 10);
      const layers = [
        { tex: tVeil, kind: 0, z: -0.10, gain: 1.0, lod: 0, order: 11 },
        { tex: tWash, kind: 1, z: -0.04, gain: 0.74, lod: 4.5, order: 12 },
        { tex: tInk,  kind: 1, z:  0.03, gain: 1.00, lod: 3.2, order: 13 },
      ];
      const mats = [];
      for (const ld of layers) {
        const mat = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3, vertexShader: MEM_V, fragmentShader: MEM_F,
          uniforms: {
            uNoise: U.uNoise, uTime: U.uTime,
            tLayer: { value: ld.tex }, tVeil: { value: tVeil }, tField: { value: field.tex },
            uT0: { value: spec.t0 }, uSpan: { value: SPAN }, uOut0: { value: spec.tOut }, uOut1: { value: spec.t1 },
            uOpacity: { value: 0 }, uSeed: { value: idx * 7.31 + ld.order }, uKind: { value: ld.kind },
            uRun: { value: spec.run }, uLod: { value: ld.lod },
            uPaper: { value: new THREE.Vector3(...spec.paper) }, uInk: { value: new THREE.Vector3(...spec.ink) },
            uEdge: { value: new THREE.Vector3(...spec.edge) },
          },
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
          blending: ld.kind ? THREE.NormalBlending : THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = ld.z;
        mesh.renderOrder = ld.order;
        mesh.frustumCulled = false;
        group.add(mesh);
        mats.push({ mat, gain: ld.gain });
      }
      scene.add(group);
      Mirror.add(group);

      const rawPts = MEMORY_PATHS[spec.id] || [];
      let pMesh = null, pMat = null;
      if (rawPts.length) {
        const maxN = G.tier ? Math.min(220, rawPts.length) : rawPts.length;
        const pGeo = new THREE.InstancedBufferGeometry();
        pGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
        pGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
        pGeo.setIndex([0, 1, 2, 1, 3, 2]);
        const aPt = new Float32Array(maxN * 4);
        for (let i = 0; i < maxN; i++) {
          const src = rawPts[Math.floor((i / maxN) * rawPts.length)];
          aPt.set([src[0], src[1], src[2], r()], i * 4);
        }
        pGeo.setAttribute('aPt', new THREE.InstancedBufferAttribute(aPt, 4));
        pGeo.instanceCount = maxN;
        pMat = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3, vertexShader: CONTOUR_V, fragmentShader: CONTOUR_F,
          uniforms: {
            uTime: U.uTime, uCamPos: U.uCamPos, uDissolve: { value: 1 }, uOpacity: { value: 0 },
            uArcW: { value: spec.scale[0] }, uArcH: { value: spec.scale[1] }, uArcRad: { value: spec.curveRad },
            uBasePos: { value: new THREE.Vector3(...spec.pos) }, uDrift: { value: new THREE.Vector3(...spec.drift) },
            uColor: { value: new THREE.Vector3(...spec.edge) }, uYaw: { value: spec.yaw },
          },
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.frustumCulled = false; pMesh.renderOrder = 16; pMesh.visible = false;
        scene.add(pMesh);
        Mirror.add(pMesh);
      }
      nodes.push({ spec, group, mats, pMesh, pMat });
      G.info['field_' + spec.id] = field.hits;
      prog((idx + 1) / MEMORY_SPECS.length);
      await tick();
    }

    G.tick.push((t) => {
      // Bridge Four can't see what Kaladin remembers.
      const viewMask = G.view === 'open' ? 0 : G.view === 'closed' ? 1.08 : 1;
      for (const n of nodes) {
        const s = n.spec;
        const active = viewMask > 0.01 && t >= s.t0 - 0.1 && t <= s.t1 + 0.2;
        n.group.visible = active;
        if (n.pMesh) n.pMesh.visible = active;
        if (!active) continue;
        const env = sm(s.t0 - 0.1, s.t0 + 0.4, t) * (1 - sm(s.t1 - 0.3, s.t1 + 0.2, t));
        const op = s.peak * env * viewMask;
        const ageU = clamp((t - s.t0) / (s.t1 - s.t0));
        const sc = 0.97 + ageU * 0.06;
        n.group.scale.set(sc, sc, 1);
        for (const { mat, gain } of n.mats) mat.uniforms.uOpacity.value = op * gain;
        if (n.pMat) {
          n.pMat.uniforms.uDissolve.value = 1 - sm(s.tOut, s.t1, t);
          n.pMat.uniforms.uOpacity.value = op;
        }
      }
    });
    G.info.memories = nodes.length;
    prog(1);
  },
};
