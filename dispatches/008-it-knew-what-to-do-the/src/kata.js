// It Knew What to Do · forged Alethi spear, sliding two-handed grip kinematics, dew-ring hand anchors,
// and grounded, lyrical martial kata choreography (pure function of film time t).
import * as THREE from 'three';
import { clamp, lerp, sm, kime, whip, TAU } from './core.js';
import { T } from './film.js';

export const SPEAR_LEN = 2.24;
export const TIP_LOCAL = 1.15;
export const BUTT_LOCAL = -1.09;

// Subtle glowing wet-sheen ring marking where invisible martial hands hold & slide along the shaft
const GRIP_RING_V = /* glsl */`
out vec3 vN; out vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GRIP_RING_F = /* glsl */`precision highp float;
uniform float uAlpha;
in vec3 vN; in vec3 vV; out vec4 frag;
void main() {
  float rim = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.8);
  vec3 col = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 0.92, 0.76), 0.45);
  frag = vec4(col * (0.28 + 0.95 * rim) * uAlpha, (0.22 + 0.65 * rim) * uAlpha);
}`;

export function buildSpear() {
  const group = new THREE.Group();

  // Procedural dark wet ash wood grain
  const W = 256, H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#4a2e1d'; ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) {
    const g = 0.5 + 0.5 * Math.sin(x * 0.28 + Math.sin(x * 0.09) * 2.4);
    const v = Math.floor(48 + g * 42);
    ctx.fillStyle = `rgb(${v + 24}, ${Math.floor(v * 0.74)}, ${Math.floor(v * 0.50)})`;
    ctx.fillRect(x, 0, 1, H);
  }
  for (let i = 0; i < 64; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(20,10,5,0.24)' : 'rgba(120,82,52,0.18)';
    ctx.fillRect((i * 37) % W, 0, 2 + (i % 3), H);
  }
  const woodTex = new THREE.CanvasTexture(cv);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(2, 6);
  woodTex.colorSpace = THREE.SRGBColorSpace;

  const shaftPts = [
    new THREE.Vector2(0.012, BUTT_LOCAL),
    new THREE.Vector2(0.0155, -0.76),
    new THREE.Vector2(0.0175, 0.0),
    new THREE.Vector2(0.0165, 0.58),
    new THREE.Vector2(0.0145, 0.74),
  ];
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex, color: 0xb68d6b, roughness: 0.23, metalness: 0.08, envMapIntensity: 1.45,
  });
  const shaft = new THREE.Mesh(new THREE.LatheGeometry(shaftPts, 20), woodMat);
  shaft.castShadow = true;
  group.add(shaft);

  // Leather cord grip wraps (center balance + one-quarter guard grip)
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x261810, roughness: 0.68, metalness: 0.06 });
  for (const [y0, len] of [[-0.08, 0.24], [0.40, 0.20]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0192, 0.0192, len, 18, 1), leatherMat);
    m.position.y = y0;
    group.add(m);
    const rings = Math.floor(len / 0.022);
    for (let k = 0; k < rings; k++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.0195, 0.0023, 6, 18), leatherMat);
      r.rotation.x = Math.PI / 2 + 0.14;
      r.position.y = y0 - len * 0.45 + k * 0.022;
      group.add(r);
    }
  }

  // Burnished forged steel spearhead + brass collar
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xeaf2fa, roughness: 0.15, metalness: 0.96, envMapIntensity: 2.3,
  });
  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x76828e, roughness: 0.30, metalness: 0.90, envMapIntensity: 1.7,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd0a25c, roughness: 0.26, metalness: 0.88, envMapIntensity: 1.9,
  });

  const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.0135, 0.09, 14), darkIronMat);
  ferrule.rotation.x = Math.PI;
  ferrule.position.y = BUTT_LOCAL - 0.02;
  group.add(ferrule);

  const socketPts = [
    new THREE.Vector2(0.0165, 0.70),
    new THREE.Vector2(0.0175, 0.75),
    new THREE.Vector2(0.0235, 0.78),
    new THREE.Vector2(0.0155, 0.82),
    new THREE.Vector2(0.0125, 0.85),
  ];
  group.add(new THREE.Mesh(new THREE.LatheGeometry(socketPts, 18), darkIronMat));
  const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0034, 8, 18), brassMat);
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.y = 0.778;
  group.add(collarRing);

  const prof = [
    [0.83, 0.010, 0.010],
    [0.86, 0.032, 0.011],
    [0.91, 0.041, 0.0105],
    [0.99, 0.031, 0.0085],
    [1.07, 0.016, 0.005],
    [1.15, 0.0005, 0.0005],
  ];
  const bPos = [], bIdx = [];
  for (let i = 0; i < prof.length; i++) {
    const [y, rx, rz] = prof[i];
    bPos.push(rx, y, 0, 0, y, rz, -rx, y, 0, 0, y, -rz);
  }
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let s = 0; s < 4; s++) {
      const s2 = (s + 1) % 4;
      bIdx.push(a + s, a + s2, b + s, a + s2, b + s2, b + s);
    }
  }
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
  bladeGeo.setIndex(bIdx);
  bladeGeo.computeVertexNormals();
  const blade = new THREE.Mesh(bladeGeo, steelMat);
  blade.castShadow = true;
  group.add(blade);

  const ridgeLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0012, 0.0022, 0.30, 6),
    new THREE.MeshBasicMaterial({ color: 0xeef7ff, transparent: true, opacity: 0.30 })
  );
  ridgeLine.position.y = 0.99;
  group.add(ridgeLine);

  // Subtle whisper-faint sliding dew-sheen grip bands (front guide hand & rear leverage hand)
  const gripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.075, 16, 1, true);
  const frontMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: GRIP_RING_V, fragmentShader: GRIP_RING_F,
    uniforms: { uAlpha: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const rearMat = frontMat.clone();
  const frontGrip = new THREE.Mesh(gripGeo, frontMat);
  const rearGrip = new THREE.Mesh(gripGeo, rearMat);
  frontGrip.renderOrder = 16; rearGrip.renderOrder = 16;
  group.add(frontGrip, rearGrip);

  group.userData = { frontGrip, rearGrip, frontMat, rearMat };
  return group;
}

// ---- Grounded, Lyrical 10-Phase Martial Spear Kata with Sliding Two-Handed Grip & Breath (Ma) ----
const UP = new THREE.Vector3(0, 1, 0);
const _pA = new THREE.Vector3(), _dA = new THREE.Vector3();
const _pB = new THREE.Vector3(), _dB = new THREE.Vector3();
const _vTmp = new THREE.Vector3(), _axTmp = new THREE.Vector3();

// Martial breath curve: slow suspended coil -> effortless liquid whip -> floating finish
function breathCurve(u) {
  const x = clamp(u, 0, 1);
  return x < 0.35
    ? 0.14 * Math.pow(x / 0.35, 2.2)
    : 0.14 + 0.86 * (1 - Math.pow(1 - (x - 0.35) / 0.65, 3.2));
}

function slerpDir(a, b, u, out) {
  const dot = clamp(a.dot(b), -1, 1);
  if (dot > 0.9995) return out.copy(a).lerp(b, u).normalize();
  if (dot < -0.999) {
    _axTmp.set(0, 1, 0).cross(a);
    if (_axTmp.lengthSq() < 0.01) _axTmp.set(1, 0, 0);
    _axTmp.normalize();
    return out.copy(a).applyAxisAngle(_axTmp, Math.PI * u).normalize();
  }
  const theta = Math.acos(dot);
  const s = Math.sin(theta);
  return out.copy(a).multiplyScalar(Math.sin((1 - u) * theta) / s)
    .addScaledVector(b, Math.sin(u * theta) / s).normalize();
}

function guardState(pos, dir, crouch = 0) {
  pos.set(0.18, lerp(1.24, 0.98, crouch), lerp(0.08, 0.26, crouch));
  dir.set(0.22, -0.66, 0.72).normalize();
}
function poolState(pos, dir) {
  pos.set(-0.22, 0.055, 0.65);
  dir.set(-0.44, 0.05, 0.89).normalize();
}
function poiseState(t, pos, dir) {
  const qv = sm(5.6, 7.2, t) * 0.010;
  pos.set(0.04 + Math.sin(t * 24) * qv * 0.4, 1.18 + Math.sin(t * 1.8) * 0.022, 0.16);
  dir.set(0.30 + Math.cos(t * 1.4) * 0.05, 0.08 + Math.sin(t * 22) * qv, 0.95).normalize();
}
function pileState(pos, dir) {
  pos.set(-1.12, 0.16, -0.36);
  dir.set(-0.62, 0.04, 0.78).normalize();
}

function figureEight(angle, sideBias, height, radius, pos, dir) {
  const s = Math.sin(angle), c = Math.cos(angle);
  const s2 = Math.sin(angle * 0.5), c2 = Math.cos(angle * 0.5);
  pos.set(s2 * 0.38 * sideBias, height + Math.sin(angle) * 0.17, 0.14 + c2 * 0.15);
  const planeYaw = s2 * 0.60;
  dir.set((Math.sin(planeYaw) * c + Math.cos(planeYaw) * 0.28 * s2) * radius, s * 0.88, Math.cos(planeYaw) * c * radius).normalize();
}

// ---- The wind passage, move by move: [start, end, fn(e, u, pos, dir, grip)] ----
const _bP = new THREE.Vector3(), _bD = new THREE.Vector3(), _bG = { slide: 0, front: 0, rear: 0, vis: 0 };
const WIND_MOVES = [
  // Strength surges: spun up into a wheel beside him, faster with every turn.
  [51.0, 52.4, 0.22, (e, u, p, d, g) => {
    const a = 0.25 + Math.PI * 2 * 1.3 * Math.pow(u, 1.45);
    p.set(0.06, 1.36 + Math.sin(a) * 0.06, 0.14);
    d.set(0.22 * Math.sin(a * 0.5), Math.sin(a), Math.cos(a)).normalize();
    g.vis = 0.5; g.front = 0.16; g.rear = -0.18;
  }],
  // Around and around: figure-eights, side to side.
  [52.4, 54.6, 0.22, (e, u, p, d, g) => {
    const ang = 0.9 + e * 6.3 + 0.2 * Math.sin(e * 3.1);
    figureEight(ang, 1.3, 1.36, 1.0, p, d);
    g.vis = 0.55; g.slide = Math.sin(ang * 0.5) * 0.12; g.front = 0.2; g.rear = -0.22;
  }],
  // Across his neck: two full turns behind the shoulders.
  [54.6, 56.2, 0.2, (e, u, p, d, g) => {
    const a = 1.2 + Math.PI * 2 * 2.0 * (u + 0.06 * Math.sin(u * Math.PI));
    p.set(Math.cos(a) * 0.16 + 0.06, 1.62, Math.sin(a) * 0.16 + 0.06);
    d.set(-Math.sin(a), 0.07 * Math.sin(a * 2.0), Math.cos(a)).normalize();
    g.vis = 0.22; g.front = 0.1; g.rear = -0.1;
  }],
  // Over his arm: a wheel at his side, facing out, that turns into the jab.
  [56.2, 57.02, 0.16, (e, u, p, d, g) => {
    const a = 2.2 + Math.PI * 2 * 1.05 * u;
    p.set(0.42, 1.30, 0.16);
    d.set(Math.cos(a), Math.sin(a), 0.32).normalize();
    g.vis = 0.45; g.front = 0.18; g.rear = -0.2;
  }],
  // Jab.
  [57.02, 57.62, 0.12, (e, u, p, d, g) => {
    const k = kime((e - 0.06) / 0.2) * (1 - sm(0.36, 0.6, e) * 0.75);
    p.set(0.16, 1.26, lerp(-0.34, 0.62, k));
    d.set(0.06, 0.02, 1).normalize();
    g.vis = 0.55; g.slide = k * 0.44; g.front = lerp(0.22, -0.2, k); g.rear = lerp(-0.3, -0.84, k);
  }],
  // A wide swing, low to high...
  [57.62, 58.62, 0.14, (e, u, p, d, g) => {
    const k = whip(clamp((e - 0.1) / 0.75));
    const a = lerp(-1.9, 1.6, k);
    p.set(Math.sin(a) * 0.26 + 0.06, 1.12 + 0.34 * k, Math.cos(a) * 0.20 + 0.1);
    d.set(Math.sin(a), lerp(-0.25, 0.45, k), Math.cos(a)).normalize();
    g.vis = 0.5; g.front = 0.24; g.rear = -0.34;
  }],
  // ...and back across, high to low.
  [58.62, 59.22, 0.1, (e, u, p, d, g) => {
    const k = kime(clamp((e - 0.18) / 0.32));
    const a = lerp(1.6, -1.75, k);
    p.set(Math.sin(a) * 0.26 + 0.06, 1.46 - 0.32 * k, Math.cos(a) * 0.20 + 0.1);
    d.set(Math.sin(a), lerp(0.45, -0.32, k), Math.cos(a)).normalize();
    g.vis = 0.5; g.front = 0.24; g.rear = -0.34;
  }],
  // Jab.
  [59.22, 59.92, 0.12, (e, u, p, d, g) => {
    const k = kime((e - 0.2) / 0.2) * (1 - sm(0.42, 0.7, e) * 0.7);
    p.set(lerp(0.02, -0.08, k), 1.32, lerp(-0.32, 0.68, k));
    d.set(-0.12, 0.05, 1).normalize();
    g.vis = 0.55; g.slide = k * 0.44; g.front = lerp(0.22, -0.2, k); g.rear = lerp(-0.3, -0.84, k);
  }],
  // One last great whirl over his head, into the snap.
  [59.92, 61.5, 0.18, (e, u, p, d, g) => {
    const a = 0.6 + Math.PI * 2 * 1.55 * (u + 0.05 * Math.sin(u * Math.PI));
    p.set(Math.cos(a) * 0.24 + 0.06, 1.74 - 0.12 * u, Math.sin(a) * 0.22 + 0.08);
    d.set(-Math.sin(a), 0.2 - 0.1 * u, Math.cos(a)).normalize();
    g.vis = 0.4; g.front = 0.16; g.rear = -0.18;
  }],
];
function windMove(t, pos, dir, grip) {
  let i = 0;
  while (i < WIND_MOVES.length - 1 && t >= WIND_MOVES[i + 1][0]) i++;
  const [a, b, blend, fn] = WIND_MOVES[i];
  const e = t - a, u = clamp(e / (b - a));
  grip.slide = 0;
  fn(e, u, pos, dir, grip);
  if (e < blend) {
    // where the spear was when this move began
    if (i === 0) evalPhaseRaw(a - 1e-4, _bP, _bD, _bG);
    else { _bG.slide = 0; WIND_MOVES[i - 1][3](a - WIND_MOVES[i - 1][0], 1, _bP, _bD, _bG); }
    const k = sm(0, blend, e);
    pos.lerpVectors(_bP, pos, k);
    slerpDir(_bD, dir, k, _vTmp2);
    dir.copy(_vTmp2);
    grip.slide = lerp(_bG.slide, grip.slide, k);
  }
}
const _vTmp2 = new THREE.Vector3();

// Evaluates (pos, dir, gripSlide, handFront, handRear, handVis)
// gripSlide shifts the spear axially along dir so thrusts shoot forward through the invisible guide hand!
function evalPhaseRaw(t, pos, dir, grip) {
  grip.slide = 0.0; grip.front = 0.22; grip.rear = -0.34; grip.vis = 0.0;

  // ---- 1. POOL -> LIFT -> QUARTERSTAFF POISE (0 .. 7.5s) ----
  if (t < T.SNAP) {
    if (t < 2.2) { poolState(pos, dir); return; }
    if (t < 4.5) {
      const u = breathCurve((t - 2.2) / 2.3);
      poolState(_pA, _dA); poiseState(t, _pB, _dB);
      pos.lerpVectors(_pA, _pB, u);
      pos.y += Math.sin(u * Math.PI) * 0.18;
      slerpDir(_dA, _dB, u, dir);
      grip.vis = sm(2.6, 3.8, t) * 0.35;
      return;
    }
    poiseState(t, pos, dir);
    grip.vis = 0.38; grip.front = 0.26; grip.rear = -0.28;
    return;
  }

  // ---- 2. GUARD SNAP — KIME #1 (7.5 .. 11.0s) ----
  if (t < T.TUKKS) {
    grip.vis = 0.42;
    if (t < 8.15) {
      const u = kime((t - T.SNAP) / 0.65);
      poiseState(T.SNAP, _pA, _dA); guardState(_pB, _dB, 0.16);
      pos.lerpVectors(_pA, _pB, u);
      pos.x += Math.sin(u * Math.PI) * 0.28;
      pos.y += Math.sin(u * Math.PI) * 0.24;
      const midDir = _vTmp.set(0.55, 0.65, 0.52).normalize();
      if (u < 0.45) slerpDir(_dA, midDir, u / 0.45, dir);
      else slerpDir(midDir, _dB, (u - 0.45) / 0.55, dir);
      grip.slide = lerp(0.0, -0.32, u);
      grip.front = lerp(0.26, 0.44, u); grip.rear = lerp(-0.28, 0.08, u);
      return;
    }
    guardState(pos, dir, 0.16);
    pos.y += Math.sin((t - 8.15) * 2.2) * 0.008;
    // Locked cleanly at the one-quarter grip position!
    grip.slide = -0.32; grip.front = 0.44; grip.rear = 0.08;
    return;
  }

  // ---- 3. TUKKS: "The first step is to care." (11.0 .. 17.5s) ----
  if (t < T.TIEN) {
    const e = t - T.TUKKS;
    grip.vis = 0.46;
    if (e < 3.6) {
      const u = sm(0.0, 0.55, e);
      // Smooth breath-modulated figure-8 sweep wiping Tukks into existence!
      const ang = -0.8 + e * 2.45 + 0.18 * Math.sin(e * 2.45);
      figureEight(ang, 1.05, 1.32, 1.0, _pB, _dB);
      guardState(_pA, _dA, 0.16);
      pos.lerpVectors(_pA, _pB, u);
      slerpDir(_dA, _dB, u, dir);
      grip.slide = lerp(-0.32, 0.0, u);
      grip.front = lerp(0.44, 0.22, u); grip.rear = lerp(0.08, -0.26, u);
      return;
    }
    if (e < 5.3) {
      // Coil back -> explosive sliding-grip forward lunge thrust!
      const uCoil = whip((e - 3.6) / 0.75);
      const uThrust = kime((e - 4.35) / 0.36);
      pos.set(lerp(0.24, 0.14, uCoil), lerp(1.36, 1.24, uCoil) - uThrust * 0.08, lerp(0.10, -0.42, uCoil) + lerp(0.0, 0.98, uThrust));
      _dA.set(0.25, 0.15, 0.95).normalize();
      _dB.set(0.03, 0.02, 1.0).normalize();
      slerpDir(_dA, _dB, uThrust, dir);
      // Shaft slides forward +0.44m through the guide hand at full thrust extension!
      grip.slide = lerp(-0.12, 0.44, uThrust);
      grip.front = lerp(0.20, -0.22, uThrust);
      grip.rear = lerp(-0.34, -0.86, uThrust);
      return;
    }
    const u = breathCurve((e - 5.3) / 1.2);
    pos.set(lerp(0.14, 0.0, u), lerp(1.16, 1.76, u), lerp(0.56, 0.06, u));
    _dA.set(0.03, 0.02, 1.0).normalize();
    _dB.set(0.85, 0.22, 0.48).normalize();
    slerpDir(_dA, _dB, u, dir);
    grip.slide = lerp(0.44, 0.0, u);
    grip.front = lerp(-0.22, 0.16, u); grip.rear = lerp(-0.86, -0.18, u);
    return;
  }

  // ---- 4. TIEN: "He was listening to Tien laugh." (17.5 .. 24.0s) ----
  if (t < T.MOTHER) {
    const e = t - T.TIEN;
    const drop = sm(4.1, 6.4, e);
    const ang = 0.52 + e * 2.65 + 0.16 * Math.sin(e * 1.8);
    pos.set(Math.cos(ang * 0.45) * 0.24, lerp(1.78 + Math.sin(e * 1.5) * 0.10, 1.34, drop), 0.06 + Math.sin(ang * 0.45) * 0.16);
    dir.set(Math.cos(ang), lerp(0.18, -0.32, drop) + 0.14 * Math.sin(ang * 1.5), Math.sin(ang)).normalize();
    grip.vis = 0.42; grip.front = 0.15; grip.rear = -0.18;
    return;
  }

  // ---- 5. HIS MOTHER: "He was hearing his mother tease him..." (24.0 .. 30.5s) ----
  if (t < T.BATTLE) {
    const e = t - T.MOTHER;
    const ang = e * 1.88 + 0.14 * Math.sin(e * 1.4);
    const armArc = sm(2.5, 5.8, e);
    pos.set(Math.cos(ang * 0.65) * 0.46, 1.34 + Math.sin(ang * 0.85) * 0.24, 0.12 + Math.sin(ang * 0.65) * 0.26);
    dir.set(Math.cos(ang * 1.35 + 0.4), Math.sin(ang * 1.15) * (0.48 + 0.34 * armArc), Math.sin(ang * 1.35 + 0.4)).normalize();
    grip.vis = 0.42; grip.slide = Math.sin(ang) * 0.14; grip.front = 0.22; grip.rear = -0.26;
    return;
  }

  // ---- 6. THE BATTLEFIELD: "Surrounded by enemies, ringed by friends." (30.5 .. 38.5s) ----
  if (t < T.FATHER) {
    const e = t - T.BATTLE;
    grip.vis = 0.50;
    if (e < 1.65) {
      const u = kime(e / 0.72);
      pos.set(lerp(-0.28, 0.36, u), lerp(1.22, 1.58, u), lerp(0.05, 0.34, u));
      _dA.set(-0.65, -0.25, 0.72).normalize();
      _dB.set(0.62, 0.56, 0.55).normalize();
      slerpDir(_dA, _dB, u, dir);
      grip.front = 0.36; grip.rear = -0.44;
      return;
    }
    if (e < 3.65) {
      // TWO crisp sliding-grip lethal jabs!
      const sub = e - 1.65;
      const first = sub < 1.0;
      const u = first
        ? kime(sub / 0.36) * (1 - sm(0.55, 0.96, sub) * 0.82)
        : kime((sub - 1.0) / 0.36) * (1 - sm(1.55, 1.96, sub) * 0.82);
      const sx = first ? 0.26 : -0.28;
      pos.set(sx * (0.35 + 0.65 * u), 1.26 + (first ? 0.06 : -0.04), -0.26 + u * 0.88);
      dir.set(first ? 0.22 : -0.24, 0.04, 0.97).normalize();
      grip.slide = u * 0.42;
      grip.front = lerp(0.24, -0.18, u); grip.rear = lerp(-0.32, -0.82, u);
      return;
    }
    if (e < 6.25) {
      // Clean behind-the-neck 360° roll (hands release briefly across shoulders!)
      const u = breathCurve((e - 3.65) / 2.6);
      const ang = -0.3 + u * TAU;
      pos.set(Math.cos(ang) * 0.20, 1.62 + Math.sin(u * Math.PI) * 0.05, -0.04 + Math.sin(ang) * 0.20);
      dir.set(-Math.sin(ang), 0.08 * Math.sin(u * TAU), Math.cos(ang)).normalize();
      grip.vis = 0.18; grip.front = 0.10; grip.rear = -0.10;
      return;
    }
    const u = breathCurve((e - 6.25) / 2.25);
    const a = u * Math.PI * 1.15;
    pos.set(Math.sin(a) * 0.42, lerp(0.92, 1.48, sm(0.45, 1.0, u)), Math.cos(a) * 0.26);
    dir.set(Math.cos(a) * 0.72, lerp(-0.55, 0.68, u), Math.sin(a) * 0.65).normalize();
    grip.front = 0.28; grip.rear = -0.34;
    return;
  }

  // ---- 7. HIS FATHER: "You could not kill to protect." (38.5 .. 45.5s) ----
  if (t < T.CHASM) {
    const e = t - T.FATHER;
    const u = sm(0.0, 6.8, e);
    pos.set(lerp(0.22, -0.18, u), lerp(1.52, 1.06, u) + Math.sin(u * Math.PI) * 0.12, lerp(-0.04, 0.22, u));
    _dA.set(0.34, 0.72, 0.60).normalize();
    _dB.set(-0.20, -0.68, 0.70).normalize();
    slerpDir(_dA, _dB, u, dir);
    grip.vis = 0.28; grip.front = 0.22; grip.rear = -0.36;
    return;
  }

  // ---- 8. DEEP BENEATH THE EARTH (45.5 .. 51.0s) ----
  if (t < T.WIND) {
    const e = t - T.CHASM;
    const u = sm(0.0, 2.2, e);
    const coil = sm(3.6, 5.5, e);
    pos.set(lerp(-0.18, -0.32 * coil, u), lerp(1.06, 1.24, u) + Math.sin(e * 1.5) * 0.02, lerp(0.22, -0.20 * coil, u));
    _dA.set(-0.20, -0.68, 0.70).normalize();
    _dB.set(-0.48 * coil + 0.12, -0.12 + 0.34 * coil, 0.88).normalize();
    slerpDir(_dA, _dB, u, dir);
    grip.vis = 0.36; grip.front = 0.24; grip.rear = -0.32;
    return;
  }

  // ---- 9. HIM AND THE WIND (51.0 .. 61.5s) ----
  // "He spun with it, swinging it around and around, across his neck, over his arm, in and out of jabs and
  // swings" [wok:27]. Each move blends in from where the last one left the spear and lands on the score's hits.
  if (t < T.FINISH) {
    windMove(t, pos, dir, grip);
    return;
  }

  // ---- 10. THE FINISH — RAZOR-SHARP KIME SNAP INTO ONE-QUARTER CROUCH (61.5 .. 69.5s) ----
  if (t < 69.5) {
    grip.vis = 0.44 * (1 - sm(67.2, 69.5, t));
    if (t < T.FINISH + 0.42) {
      const u = kime((t - T.FINISH) / 0.42);
      evalPhaseRaw(T.FINISH - 0.002, _pA, _dA, { slide: 0, front: 0, rear: 0, vis: 0 });
      guardState(_pB, _dB, 0.92);
      pos.lerpVectors(_pA, _pB, u);
      pos.x += Math.sin(u * Math.PI) * 0.18;
      slerpDir(_dA, _dB, u, dir);
      grip.slide = lerp(0.0, -0.34, u);
      grip.front = lerp(0.18, 0.44, u); grip.rear = lerp(-0.20, 0.08, u);
      return;
    }
    guardState(pos, dir, 0.92);
    const e = t - (T.FINISH + 0.42);
    const shiver = Math.exp(-e * 0.45) * 0.009;
    pos.y += Math.sin(e * 2.1) * 0.012 + Math.sin(e * 28.0) * shiver;
    grip.slide = -0.34; grip.front = 0.44; grip.rear = 0.08;
    return;
  }

  // ---- 11. "SORRY" — LOWERING GENTLY TO THE WEAPON PILE (69.5 .. 76.0s) ----
  const u = whip((t - 69.5) / 2.6);
  guardState(_pA, _dA, 0.92);
  pileState(_pB, _dB);
  pos.lerpVectors(_pA, _pB, u);
  pos.y += Math.sin(u * Math.PI) * 0.22;
  slerpDir(_dA, _dB, u, dir);
  grip.slide = lerp(-0.34, 0.0, u);
  grip.vis = 0.0;
}

const SOFT_SEAMS = [
  T.TUKKS + 3.6, T.TUKKS + 5.3,
  T.TIEN, T.MOTHER,
  T.BATTLE, T.BATTLE + 1.65, T.BATTLE + 3.65, T.BATTLE + 6.25,
  T.FATHER, T.CHASM,
];
const _sP0 = new THREE.Vector3(), _sD0 = new THREE.Vector3();
const _sP1 = new THREE.Vector3(), _sD1 = new THREE.Vector3();
const _g0 = { slide: 0, front: 0, rear: 0, vis: 0 }, _g1 = { slide: 0, front: 0, rear: 0, vis: 0 };

function evalKata(t, pos, dir, grip) {
  evalPhaseRaw(t, pos, dir, grip);
  for (let i = 0; i < SOFT_SEAMS.length; i++) {
    const s = SOFT_SEAMS[i];
    const hw = 0.28;
    if (t > s - hw && t < s + hw) {
      const u = sm(s - hw, s + hw, t);
      evalPhaseRaw(s - hw, _sP0, _sD0, _g0);
      evalPhaseRaw(s + hw, _sP1, _sD1, _g1);
      pos.lerpVectors(_sP0, _sP1, u);
      slerpDir(_sD0, _sD1, u, dir);
      grip.slide = lerp(_g0.slide, _g1.slide, u);
      grip.front = lerp(_g0.front, _g1.front, u);
      grip.rear  = lerp(_g0.rear,  _g1.rear,  u);
      grip.vis   = lerp(_g0.vis,   _g1.vis,   u);
      break;
    }
  }
  // Apply sliding two-handed axial offset along the shaft so thrusts truly shoot forward!
  pos.addScaledVector(dir, grip.slide);
}

const _dirNow = new THREE.Vector3(), _pPrev = new THREE.Vector3(), _dirPrev = new THREE.Vector3();
const _tipPrev = new THREE.Vector3(), _buttPrev = new THREE.Vector3();
const _gripNow = { slide: 0, front: 0, rear: 0, vis: 0 }, _gripPrev = { slide: 0, front: 0, rear: 0, vis: 0 };

export function spearPoseAt(t, out = {}) {
  if (!out.pos) out.pos = new THREE.Vector3();
  if (!out.quat) out.quat = new THREE.Quaternion();
  if (!out.tip) out.tip = new THREE.Vector3();
  if (!out.butt) out.butt = new THREE.Vector3();
  if (!out.tipVel) out.tipVel = new THREE.Vector3();
  if (!out.buttVel) out.buttVel = new THREE.Vector3();

  evalKata(t, out.pos, _dirNow, _gripNow);
  out.quat.setFromUnitVectors(UP, _dirNow);
  out.tip.copy(out.pos).addScaledVector(_dirNow, TIP_LOCAL);
  out.butt.copy(out.pos).addScaledVector(_dirNow, BUTT_LOCAL);
  out.frontGrip = _gripNow.front;
  out.rearGrip = _gripNow.rear;
  out.gripVis = _gripNow.vis;

  const dt = 0.016;
  const tp = Math.max(0, t - dt);
  evalKata(tp, _pPrev, _dirPrev, _gripPrev);
  _tipPrev.copy(_pPrev).addScaledVector(_dirPrev, TIP_LOCAL);
  _buttPrev.copy(_pPrev).addScaledVector(_dirPrev, BUTT_LOCAL);

  if (t > 0.02) {
    out.tipVel.subVectors(out.tip, _tipPrev).divideScalar(dt);
    out.buttVel.subVectors(out.butt, _buttPrev).divideScalar(dt);
  } else {
    out.tipVel.set(0, 0, 0);
    out.buttVel.set(0, 0, 0);
  }
  out.speed = Math.max(out.tipVel.length(), out.buttVel.length());
  return out;
}

// Drops that fall from far above into the pool: one to open on, three for "a faint dripping coming from
// somewhere distant" [wok:27]. [landing time, x, z]
export const DRIPS = [[0.95, -0.02, 0.92], [46.45, 0.16, 1.18], [48.25, -0.34, 1.62], [49.95, 0.30, 0.88]];
export const DRIP_H = 5.2;

export const SPRAY_BURSTS = [
  7.60, 7.82,
  11.8, 13.0, 15.42,
  18.8, 21.0,
  25.8, 28.4,
  31.0, 32.15, 33.15, 35.0,
  51.3, 52.6, 54.0, 55.4, 56.6, 57.25, 58.2, 58.9, 59.5, 60.4, 61.55,
];
