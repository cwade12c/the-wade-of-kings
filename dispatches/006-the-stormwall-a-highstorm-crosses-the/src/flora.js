// The Stormwall · what grows: rockbuds (shell, gourd, vines, leaves), vines in the crevices, grass that goes to ground.
// Every plant's state is a function of film time and its own three numbers (open on a calm day, when it shuts, when it wakes).
import * as THREE from 'three';
import { G, rng, fbm, sm, lerp, clamp, TAU } from './core.js';
import { patch, depthLike, F_WORLD_N, F_WET_LIGHT } from './mat.js';
import { height, normalAt, MARK, Land } from './land.js';
import { T } from './film.js';

// ---------------------------------------------------------------- rockbuds ----
const BUD_VHEAD = /* glsl */`
attribute vec4 aData; attribute float aPart; attribute vec4 aLife;
varying vec4 vBud; varying vec3 vBud2;
vec3 rotAx(vec3 p, vec3 a, float ang) { float c = cos(ang), s = sin(ang); return p * c + cross(a, p) * s + a * dot(a, p) * (1.0 - c); }
// a vine's centre line in the bud's own space (1 = the bud's radius); crev > 0: a vine with no bud, out of a crack
vec3 vineC(float s, float ph0, float sd, float crev) {
  float L = mix(3.4, 6.6, fract(sd * 7.31)) * (1.0 + crev * 1.2);
  float ph = ph0 + (0.9 * sin(s * 4.6 + sd * 20.0) + 0.45 * sin(s * 10.7 + sd * 50.0)) * (0.25 + s) * 0.42;
  float rr = 0.12 + L * s;
  float rise = (1.0 - crev) * (mix(0.34, 0.0, smoothstep(0.0, 0.16, s)) + 0.13 * sin(clamp(s / 0.16, 0.0, 1.0) * 3.14159));
  float y = rise + 0.05 + 0.035 * sin(s * 31.0 + sd * 9.0) * smoothstep(0.15, 0.3, s);
  y += uGust * 0.10 * sin(uWindPh * 7.0 + s * 12.0 + sd * 30.0) * smoothstep(0.2, 1.0, s) * s;      // the free end lifts in a gust
  y += 0.35 * s * s * crev * 0.0;
  return vec3(cos(ph) * rr, y, sin(ph) * rr);
}
`;
const BUD_VNORMAL = /* glsl */`
float crev = step(aLife.x, -0.5);
float openK = clamp(max(aLife.x, 0.0) * (1.0 - smoothstep(aLife.y, aLife.y + 2.6, uTime)) + smoothstep(aLife.z, aLife.z + 5.5, uTime), 0.0, 1.0);
vec3 budPos = position;
vBud = vec4(aPart, aData.y, aData.z, openK); vBud2 = vec3(aLife.w, aData.w, 0.0);
if (aPart < 0.5) {                                   // a plate of the shell, hinged at its foot
  float eo = smoothstep(0.0, 0.62, openK); eo += 0.07 * sin(eo * 6.2832) * (1.0 - eo);
  float ang = (0.6 + 0.34 * fract(aLife.w * 13.7 + aData.w * 0.37)) * eo + 0.035 * uGust * eo * sin(uWindPh * 9.0 + aData.w * 2.1 + aLife.w * 40.0);
  vec3 A = vec3(-sin(aData.x), 0.0, cos(aData.x)), H = vec3(cos(aData.x), 0.0, sin(aData.x)) * 0.27;
  budPos = H + rotAx(position - H, A, -ang); objectNormal = rotAx(objectNormal, A, -ang);
} else if (aPart < 1.5) {                            // the gourd inside
  budPos = position * (0.86 + 0.14 * openK);
} else {
  float g = smoothstep(0.26, 1.0, openK), sd = aData.w + aLife.w, ph0 = aData.x + aLife.w * 6.2832;
  if (aPart < 2.5) {                                 // a vine: the tip runs out along its line
    float sc = min(aData.y, g);
    vec3 c0 = vineC(sc, ph0, sd, crev), c1 = vineC(sc + 0.012, ph0, sd, crev);
    vec3 Tn = normalize(c1 - c0), N1 = normalize(cross(Tn, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0)), N2 = cross(N1, Tn);
    float rad = 0.075 * (1.0 - 0.78 * aData.y) * smoothstep(g + 0.002, g - 0.08, aData.y) * step(0.004, g);
    vec3 dirn = cos(aData.z) * N1 + sin(aData.z) * N2;
    budPos = c0 + dirn * rad; objectNormal = dirn;
  } else {                                           // a leaf on a vine: opens once the tip has passed it
    float k = smoothstep(aData.y, aData.y + 0.16, g); k += 0.12 * sin(k * 6.2832) * (1.0 - k);
    vec3 c0 = vineC(aData.y, ph0, sd, crev), c1 = vineC(aData.y + 0.012, ph0, sd, crev);
    vec3 Tn = normalize(c1 - c0), Sd = normalize(cross(Tn, vec3(0.0, 1.0, 0.0))) * position.x;
    float len = 0.46 * position.z * k, wid = 0.105 * position.z * k;
    float fl = uGust * 0.5 * sin(uWindPh * 11.0 + position.y * 40.0 + aData.y * 9.0);
    vec3 up = vec3(0.0, 1.0, 0.0), ax = normalize(Sd + up * (0.35 + 0.5 * (1.0 - k) + fl));
    vec3 q = c0 + vec3(0.0, 0.03, 0.0);
    vec3 nl = normalize(cross(Tn, ax) * position.x + up * 0.6);
    if (aData.z > 0.5 && aData.z < 1.5) { q += ax * len * 0.42 + Tn * wid; nl = normalize(nl + Tn * 0.5); }
    else if (aData.z > 1.5 && aData.z < 2.5) q += ax * len + up * 0.02 * k;
    else if (aData.z > 2.5 && aData.z < 3.5) { q += ax * len * 0.42 - Tn * wid; nl = normalize(nl - Tn * 0.5); }
    else if (aData.z > 3.5) q += ax * len * 0.45 - up * 0.022 * k;
    budPos = q; objectNormal = nl;
  }
}
`;
const BUD_VPOS = /* glsl */`transformed = budPos;`;
const BUD_FHEAD = /* glsl */`varying vec4 vBud; varying vec3 vBud2;`;
const BUD_FCOLOR = /* glsl */`
float part = vBud.x, sdI = vBud2.x; vec3 bc; float budGloss = 0.2;
if (part < 0.5) {
  float u = vBud.y, v = vBud.z;
  if (gl_FrontFacing) {                              // outside: it passes for a stone
    float m = fbm2(vec2(u * 2.0 + vBud2.y * 3.0, v * 5.0) + sdI * 31.0), m2 = n2(vec2(u * 9.0, v * 16.0) + sdI * 17.0);
    bc = mix(vec3(0.50, 0.38, 0.28), vec3(0.38, 0.25, 0.18), smoothstep(0.35, 0.7, m));
    bc = mix(bc, vec3(0.56, 0.48, 0.38), smoothstep(0.55, 0.9, m2) * 0.6);
    bc *= 0.8 + 0.45 * m2;
    bc *= 1.0 - 0.5 * smoothstep(0.82, 1.0, abs(u));                   // the seams between plates
    bc *= 1.04 * mix(1.0, 0.8, uWet);
  } else {                                           // inside: soft and bright
    bc = mix(vec3(0.50, 0.10, 0.16), vec3(0.86, 0.50, 0.42), smoothstep(0.0, 0.9, v));
    bc = mix(bc, vec3(0.78, 0.74, 0.46), smoothstep(0.55, 0.0, v) * 0.7);
    bc *= 0.75 + 0.3 * n2(vec2(u * 14.0, v * 5.0) + sdI * 5.0);
    bc *= 1.0 - 0.35 * smoothstep(0.7, 1.0, abs(u)); budGloss = 0.5;
  }
} else if (part < 1.5) { bc = vec3(0.44, 0.50, 0.22) * (0.75 + 0.4 * n2(vWp.xz * 90.0)); budGloss = 0.6; }
else if (part < 2.5) { float s = vBud.y; bc = mix(vec3(0.20, 0.25, 0.07), vec3(0.34, 0.50, 0.12), smoothstep(0.0, 0.7, s)); bc = mix(bc, vec3(0.62, 0.70, 0.22), smoothstep(0.75, 1.0, s)); bc *= 0.85 + 0.3 * sin(s * 90.0 + vBud.z * 2.0) * 0.5; budGloss = 0.5; }
else { bc = mix(vec3(0.11, 0.26, 0.06), vec3(0.27, 0.46, 0.11), fract(sdI * 5.3 + vBud.y * 3.0)); bc = mix(bc, vec3(0.50, 0.17, 0.11), 0.3 * fract(sdI * 9.1 + vBud.y * 7.0)); bc *= 0.62 + 0.38 * smoothstep(4.0, 2.2, vBud.z) ; if (!gl_FrontFacing) bc *= 1.25; budGloss = 0.12; }
diffuseColor.rgb = bc;
`;
const BUD_FROUGH = /* glsl */`
float wetK = uWet; float pudK = 0.0; float gloss = budGloss * (0.25 + 0.75 * uWet) * 0.5;
roughnessFactor = mix(0.85, 0.3, budGloss * (0.4 + 0.6 * uWet));
`;
const BUD_FHEAD2 = /* glsl */`float Nw_y() { return normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz).y; }`;

function budGeometry(o) {
  const P = [], N = [], D = [], PT = [], I = [];
  const add = (p, n, d, part) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); D.push(d[0], d[1], d[2], d[3]); PT.push(part); return P.length / 3 - 1; };
  const r = rng(o.seed || 5);
  if (o.shell) {
    const NP = 5, NU = o.nu, NV = o.nv, w = Math.PI / NP * 1.07;
    const prof = (v) => 0.50 * Math.pow(Math.sin(Math.PI * (0.12 + 0.86 * v)), 0.75) + 0.03;
    for (let j = 0; j < NP; j++) {
      const phj = j * TAU / NP + 0.2, tmp = new THREE.BufferGeometry(), tp = [], ti = [], dd = [];
      for (let iv = 0; iv <= NV; iv++) for (let iu = 0; iu <= NU; iu++) {
        const uu = -1 + 2 * iu / NU, vv = iv / NV, ph = phj + uu * w;
        const lump = 1 + 0.10 * (fbm(ph * 2.2 + 9, vv * 3.1 + j, 3) - 0.5) + 0.03 * Math.cos(uu * Math.PI);
        const rr = prof(vv) * lump, y = 1.22 * Math.pow(vv, 0.9) * (1 - 0.2 * uu * uu * vv);
        tp.push(Math.cos(ph) * rr, y, Math.sin(ph) * rr); dd.push([phj, uu, vv, j]);
      }
      for (let iv = 0; iv < NV; iv++) for (let iu = 0; iu < NU; iu++) { const a = iv * (NU + 1) + iu, b = a + 1, c = a + NU + 1, d = c + 1; ti.push(a, c, b, b, c, d); }
      tmp.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tmp.setIndex(ti); tmp.computeVertexNormals();
      const tn = tmp.attributes.normal.array, base = P.length / 3;
      for (let k = 0; k < dd.length; k++) add([tp[k * 3], tp[k * 3 + 1], tp[k * 3 + 2]], [tn[k * 3], tn[k * 3 + 1], tn[k * 3 + 2]], dd[k], 0);
      for (const k of ti) I.push(base + k);
    }
    // the gourd
    const sg = new THREE.SphereGeometry(0.3, 10, 8), sp = sg.attributes.position.array, sn = sg.attributes.normal.array, base = P.length / 3;
    for (let k = 0; k < sp.length / 3; k++) add([sp[k * 3], sp[k * 3 + 1] * 1.25 + 0.4, sp[k * 3 + 2]], [sn[k * 3], sn[k * 3 + 1], sn[k * 3 + 2]], [0, 0, 0, 0], 1);
    for (const k of sg.index.array) I.push(base + k);
  }
  for (let k = 0; k < o.vines; k++) {
    const ph0 = k * TAU / o.vines + (r() - 0.5) * 0.7, sd = r(), base = P.length / 3, SEG = o.seg, SID = o.sides;
    for (let i = 0; i <= SEG; i++) for (let a = 0; a < SID; a++) add([0, 0, 0], [0, 1, 0], [ph0, i / SEG, a / SID * TAU, sd], 2);
    for (let i = 0; i < SEG; i++) for (let a = 0; a < SID; a++) { const a1 = (a + 1) % SID, p0 = base + i * SID + a, p1 = base + i * SID + a1, p2 = p0 + SID, p3 = p1 + SID; I.push(p0, p2, p1, p1, p2, p3); }
    for (let l = 0; l < o.leaves; l++) {
      const s = 0.24 + 0.7 * (l + r() * 0.6) / o.leaves, side = l % 2 ? 1 : -1, ls = r(), size = 0.7 + 0.7 * r(), b = P.length / 3;
      for (let c = 0; c < 5; c++) add([side, ls, size], [0, 1, 0], [ph0, s, c, sd], 3);
      I.push(b, b + 1, b + 4, b, b + 4, b + 3, b + 1, b + 2, b + 4, b + 4, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aData', new THREE.Float32BufferAttribute(D, 4)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(PT, 1)); g.setIndex(I);
  return g;
}

// ---------------------------------------------------------------- grass ----
const GRASS_VHEAD = /* glsl */`
attribute vec3 aRoot; attribute vec4 aG;      // aG: yaw, height, shyness, seed
varying vec3 vGr;
`;
const GRASS_VNORMAL = /* glsl */`
// each stalk has its own nerve: the shy ones go to ground at the first stiff gust, all of them before the wall, and they come back out one by one
float thr = 0.26 + 0.62 * aG.z;
float gone = smoothstep(thr - 0.07, thr + 0.07, uGust);
float back = ${(T.WAKE + 1.5).toFixed(1)} + 13.0 * fract(aG.w * 7.7 + aG.z * 0.5);
float pre = (1.0 - gone) * (1.0 - smoothstep(${(T.CLOSE - 2).toFixed(1)}, ${(T.HIT - 1.2).toFixed(1)}, uTime));
float upK = max(pre, smoothstep(back, back + 2.8, uTime));
float hgt = aG.y * upK, tt = position.y;                            // tt: 0 root .. 1 tip
float cy = cos(aG.x), sy = sin(aG.x);
float sway = (0.10 + 0.5 * uGust) * sin(uWindPh * (2.2 + aG.w) + aRoot.x * 0.6 + aRoot.z * 0.45 + aG.w * 20.0) + 0.55 * min(uGust, 1.4);
vec3 gp = vec3(position.x * 0.012 * (1.0 - 0.75 * tt) * (0.5 + 0.5 * upK), tt * hgt, 0.0);
gp = vec3(gp.x * cy, gp.y, gp.x * sy);
float bend = sway * tt * tt * hgt * 0.75;
gp.x -= bend; gp.y -= abs(bend) * 0.35 * tt;                         // the wind comes out of the east
vec3 grassPos = aRoot + gp;
objectNormal = normalize(vec3(-sy * 0.25 - 0.3 * sway * tt, 1.0, cy * 0.25));
vGr = vec3(tt, aG.w, upK);
`;
const GRASS_FCOLOR = /* glsl */`
vec3 gc = mix(vec3(0.05, 0.11, 0.03), mix(vec3(0.17, 0.33, 0.08), vec3(0.30, 0.42, 0.12), fract(vGr.y * 3.7)), smoothstep(0.0, 0.9, vGr.x));
gc *= mix(1.0, 0.72, uWet) * (0.8 + 0.4 * fract(vGr.y * 9.3));
diffuseColor.rgb = gc;
`;
const GRASS_FROUGH = /* glsl */`float wetK = uWet; float pudK = 0.0; float gloss = 0.12 * uWet * vGr.x; roughnessFactor = mix(0.8, 0.42, uWet);`;

export const Flora = {
  buds: [],
  async build(scene, prog, tick) {
    const r = rng(2026), rocks = Land.rocks;
    const blocked = (x, z, pad) => { for (const k of rocks) if (Math.hypot(x - k[0], z - k[1]) < k[2] * 0.95 + pad) return true; return false; };
    const inPool = (x, z) => Math.hypot(x - MARK.pool[0], z - MARK.pool[1]) < MARK.pool[2] * 0.85 || Math.hypot(x + 11.5, z - 9.5) < 1.2 || Math.hypot(x + 19.5, z - 3.5) < 1.7 || Math.hypot(x + 13.2, z - 0.4) < 0.7;

    // ---- rockbuds ----
    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
      { vHead: BUD_VHEAD, vNormal: BUD_VNORMAL, vPos: BUD_VPOS, fHead: BUD_FHEAD, fColor: BUD_FCOLOR, fRough: BUD_FROUGH, fLight: F_WET_LIGHT });
    const dmat = depthLike({ vHead: BUD_VHEAD, vNormal: BUD_VNORMAL, vPos: BUD_VPOS });
    const near = [], far = [], crev = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const place = (list, x, z, sc, life, sink = 0.04) => {
      normalAt(x, z, n); q.setFromUnitVectors(UP, n); q2.setFromAxisAngle(UP, r() * TAU); q.multiply(q2);
      p.set(x, height(x, z) - sink * sc, z); s.set(sc, sc * (0.9 + 0.25 * r()), sc);
      list.push({ m: m4.compose(p, q, s).clone(), life }); this.buds.push([x, z, sc, life[2], life[0] > 0.5]);
    };
    // the two the film is staged on, and the family round the second
    place(near, MARK.budA[0], MARK.budA[1], 0.27, [1, T.WIND + 3.2, T.WAKE + 4.5, 0.13]);
    place(near, MARK.budB[0], MARK.budB[1], 0.30, [0, 0, T.WAKE - 0.2, 0.61]);
    place(near, MARK.budB[0] - 0.75, MARK.budB[1] + 0.5, 0.17, [0, 0, T.WAKE + 1.6, 0.27]);
    place(near, MARK.budB[0] + 0.25, MARK.budB[1] + 0.95, 0.13, [0, 0, T.WAKE + 2.6, 0.83]);
    place(near, MARK.budB[0] - 1.5, MARK.budB[1] - 0.6, 0.21, [0, 0, T.WAKE + 3.1, 0.44]);
    place(near, MARK.budA[0] + 1.1, MARK.budA[1] - 1.3, 0.16, [1, T.WIND + 5.0, T.WAKE + 6, 0.71]);
    place(near, MARK.budA[0] - 0.4, MARK.budA[1] + 1.2, 0.12, [0, 0, T.WAKE + 7, 0.35]);
    const want = G.tier ? 110 : 190;
    for (let i = 0; i < 4000 && near.length + far.length < want; i++) {
      const a = r() * TAU, d = 2.5 + 70 * Math.pow(r(), 1.7), x = -13 + Math.cos(a) * d, z = 4 + Math.sin(a) * d * 0.8;
      if (blocked(x, z, 0.25) || inPool(x, z)) continue;
      if (fbm(x * 0.09 + 5, z * 0.09, 3) < 0.44) continue;                      // they grow in loose colonies
      let ok = true; for (const b of this.buds) if (Math.hypot(x - b[0], z - b[1]) < (b[2] + 0.2) * 1.6) { ok = false; break; } if (!ok) continue;
      const sc = 0.11 + 0.17 * Math.pow(r(), 1.6), dB = Math.hypot(x - MARK.budB[0], z - MARK.budB[1]);
      const life = [r() < 0.42 ? 1 : 0, T.WIND + 1 + 10.5 * r(), T.WAKE + 0.8 + Math.min(dB * 0.22, 5) + 5.5 * r(), r()];
      place(Math.hypot(x + 13, z - 4) < 14 ? near : far, x, z, sc, life);
    }
    // vines with no bud: out of the cracks at the foot of stones
    for (let i = 0; i < 600 && crev.length < (G.tier ? 26 : 48); i++) {
      const k = rocks[r() * rocks.length | 0]; if (k[2] < 0.5 || Math.hypot(k[0] + 13, k[1] - 4) > 55) continue;
      const a = r() * TAU, x = k[0] + Math.cos(a) * k[2] * 0.8, z = k[1] + Math.sin(a) * k[2] * 0.8; if (inPool(x, z)) continue;
      place(crev, x, z, 0.16 + 0.2 * r(), [-1, 0, T.WAKE + 0.5 + 9 * r(), r()], 0);
    }
    const mk = (geo, list, shadow) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length), life = new Float32Array(list.length * 4);
      list.forEach((b, i) => { im.setMatrixAt(i, b.m); life.set(b.life, i * 4); });
      geo.setAttribute('aLife', new THREE.InstancedBufferAttribute(life, 4));
      im.frustumCulled = false; im.receiveShadow = true; im.castShadow = shadow; if (shadow) im.customDepthMaterial = dmat; scene.add(im); return im;
    };
    const hi = G.tier ? { shell: true, nu: 6, nv: 9, vines: 7, seg: 22, sides: 5, leaves: 8, seed: 3 } : { shell: true, nu: 8, nv: 13, vines: 8, seg: 34, sides: 6, leaves: 11, seed: 3 };
    mk(budGeometry(hi), near, true);
    mk(budGeometry({ shell: true, nu: 4, nv: 6, vines: 5, seg: 12, sides: 4, leaves: 6, seed: 9 }), far, !G.tier);
    mk(budGeometry({ shell: false, vines: 3, seg: 20, sides: 4, leaves: 7, seed: 21 }), crev, false);
    prog(0.4); await tick();

    // ---- grass: in drifts where the stone lets it root ----
    const NB = G.tier ? 26000 : 64000, root = new Float32Array(NB * 3), ag = new Float32Array(NB * 4);
    let c = 0;
    for (let i = 0; i < NB * 14 && c < NB; i++) {
      const a = r() * TAU, d = 0.6 + 58 * Math.pow(r(), 1.45), x = -13.5 + Math.cos(a) * d * 1.15, z = 4.6 + Math.sin(a) * d * 0.9;
      const dens = fbm(x * 0.13 + 2, z * 0.13 + 7, 4) - 0.03 * (fbm(x * 0.9, z * 0.9, 2) - 0.5);
      if (dens < 0.5 || inPool(x, z)) continue;
      if (Math.hypot(x - MARK.budA[0], z - MARK.budA[1]) < 1.25 || Math.hypot(x + 11.5, z - 5.2) < 0.8 || Math.hypot(x - MARK.budB[0], z - MARK.budB[1]) < 0.5) continue;
      if (Math.abs(height(x + 0.6, z) - height(x - 0.6, z)) > 0.6) continue;
      if (blocked(x, z, 0.02)) continue;
      let nb = false; for (const b of this.buds) if (Math.hypot(x - b[0], z - b[1]) < b[2] * 0.6) { nb = true; break; } if (nb) continue;
      root[c * 3] = x; root[c * 3 + 1] = height(x, z) - 0.01; root[c * 3 + 2] = z;
      ag[c * 4] = r() * TAU; ag[c * 4 + 1] = (0.16 + 0.24 * r()) * (0.6 + 0.8 * sm(0.5, 0.7, dens)); ag[c * 4 + 2] = clamp(0.5 + 0.9 * (fbm(x * 0.5 + 40, z * 0.5, 2) - 0.5) + 0.35 * (r() - 0.5)); ag[c * 4 + 3] = r(); c++;
      if ((c & 8191) === 0) { prog(0.4 + 0.6 * c / NB); await tick(); }
    }
    const blade = new THREE.InstancedBufferGeometry(), bp = [], bi = [], SEGS = G.tier ? 2 : 3;
    for (let i = 0; i <= SEGS; i++) { bp.push(-1, i / SEGS, 0, 1, i / SEGS, 0); }
    for (let i = 0; i < SEGS; i++) { const a = i * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); blade.setIndex(bi);
    blade.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root.subarray(0, c * 3), 3)); blade.setAttribute('aG', new THREE.InstancedBufferAttribute(ag.subarray(0, c * 4), 4));
    blade.instanceCount = c;
    const gmat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
      { vHead: GRASS_VHEAD, vNormal: GRASS_VNORMAL, vPos: 'transformed = grassPos;', fHead: 'varying vec3 vGr;', fColor: GRASS_FCOLOR, fRough: GRASS_FROUGH, fLight: F_WET_LIGHT });
    const grass = new THREE.Mesh(blade, gmat); grass.frustumCulled = false; grass.receiveShadow = true; scene.add(grass);
    G.info.grass = c; G.info.buds = this.buds.length;
    prog(1);
  },
};
