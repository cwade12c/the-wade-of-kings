// It Knew What to Do · world-space photorealistic Rosharan chasm rock & slick dark-green moss material
// Clean multi-scale 3D sedimentary strata, true chasmfiend claw gashes, matte-to-damp wet stone (zero plastic chrome!).
import * as THREE from 'three';
import { U, GLSL_NOISE } from './core.js';

const UNIFORMS_GLSL = /* glsl */`
${GLSL_NOISE}
uniform float uTime, uTorchFlick, uSylGlow, uMemMix, uWallDim, uRiftSun, uPuddleGlow, uFogDen;
uniform vec3 uCamPos, uTorchA, uTorchB, uSylPos, uMemCol, uSpherePos, uFogCol;
`;

const WP_HOOK = /* glsl */`
{ vec4 wp4 = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wp4 = instanceMatrix * wp4;
#endif
  vWp = (modelMatrix * wp4).xyz; }
`;

let keyN = 0;
export function patch(mat, o = {}) {
  const key = 'kt' + (keyN++);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, o.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + UNIFORMS_GLSL + '\nvarying vec3 vWp;\n' + (o.vHead || ''))
      .replace('#include <project_vertex>', WP_HOOK + (o.vMain || '') + '#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + UNIFORMS_GLSL + '\nvarying vec3 vWp;\n' + (o.fHead || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (o.fColor || ''))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + (o.fRough || ''))
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (o.fNormal || ''))
      .replace('#include <opaque_fragment>', (o.fLight || '') + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

const ROCK_HEAD = /* glsl */`
// Pure analytic 3D value noise (zero texture-pixel stair-stepping even centimeters from the lens!)
float h31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float an3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}
const mat3 ROT = mat3(0.80, 0.36, -0.48, -0.60, 0.48, -0.64, 0.0, 0.80, 0.60);
float rockBump(vec3 p) {
  float strata = sin(p.y * 12.0 + an3(p * 1.4) * 3.8) * 0.16;
  vec3 q = ROT * p;
  return strata + an3(p * 3.2) * 0.44 + an3(q * 9.5 + 3.1) * 0.24 + an3(ROT * q * 21.0 + 7.2) * 0.06;
}
// Three parallel diagonal chasmfiend claw score marks scraping off the moss on the mid-chasm walls
float clawScore(vec3 p) {
  float zone = smoothstep(0.8, 1.9, p.y) * smoothstep(5.0, 3.0, p.y)
             * smoothstep(1.5, -1.0, p.z) * smoothstep(-9.5, -5.5, p.z);
  if (zone < 0.01) return 0.0;
  float u = p.y * 0.90 + p.z * 0.38 + (n2(p.zy * 0.85) - 0.5) * 0.14;
  float g1 = exp(-pow((u - 1.38) * 30.0, 2.0));
  float g2 = exp(-pow((u - 1.56) * 30.0, 2.0));
  float g3 = exp(-pow((u - 1.75) * 30.0, 2.0));
  float seg = smoothstep(0.36, 0.64, n2(vec2(p.z * 0.45 + 1.1, 2.3)));
  return clamp((g1 + g2 + g3) * zone * seg, 0.0, 1.0);
}
`;

const ROCK_COLOR = /* glsl */`
vec3 Nw = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
vec3 wp = vWp;

// Authentic Rosharan sedimentary stone strata (subtle warm slate, rust-umber iron bands, weathered crem)
float warp = n2(wp.xz * 0.25) * 0.95 + n2(wp.xz * 0.95) * 0.28;
float strata = n2(vec2(wp.y * 1.35 + warp, 3.7)) * 0.60 + n2(vec2(wp.y * 5.8 + warp * 1.6, 9.1)) * 0.40;
float grain = fbm3(wp * 2.4);
float fineGrit = fbm3(wp * 9.0);
float claw = clawScore(wp) * (1.0 - abs(Nw.y));

vec3 stone = mix(vec3(0.115, 0.115, 0.11), vec3(0.165, 0.15, 0.128), smoothstep(0.34, 0.72, strata));
stone = mix(stone, vec3(0.075, 0.082, 0.088), smoothstep(0.54, 0.86, n3(wp * 0.85 + 4.0)) * 0.60);
stone = mix(stone, vec3(0.22, 0.20, 0.17), smoothstep(0.62, 0.88, fbm3(wp * 1.2 + 9.0)) * 0.30);
// Freshly scored pale stone inside chasmfiend claw gashes
stone = mix(stone, vec3(0.34, 0.30, 0.25), claw * 0.78);

// Slick dark-green chasm moss clinging naturally to upward faces & damp mid-walls
float mossN = fbm3(wp * vec3(0.75, 1.05, 0.75) + 5.2);
float mossFine = fbm3(wp * 5.5 + 2.0);
// "The sides were slick with a dark green moss" [wok:27]: it sheets down the walls, thinning only under overhangs.
float mossSlope = smoothstep(-0.75, 0.25, Nw.y + 0.10);
float mossH = smoothstep(0.10, 0.55, wp.y) * (1.0 - smoothstep(13.0, 21.0, wp.y));
float moss = smoothstep(0.30, 0.58, mossN * 0.82 + mossFine * 0.26) * mossSlope * mossH * (1.0 - claw * 0.95);
vec3 mossCol = mix(vec3(0.022, 0.058, 0.026), vec3(0.050, 0.110, 0.040), grain);

vec3 col = mix(stone, mossCol, moss * 0.90);
// Natural geological grain, overhang occlusion, and dark damp flood-wash near the floor
col *= 0.66 + 0.52 * grain * (0.82 + 0.34 * fineGrit);
col *= 0.48 + 0.52 * smoothstep(-0.35, 0.65, Nw.y);
float floodWet = 1.0 - smoothstep(0.0, 1.85, wp.y);
col *= mix(1.0, 0.56, floodWet * 0.78);

float wallVis = 1.0 - uWallDim * 0.84;
diffuseColor.rgb = col * wallVis;
`;

const ROCK_ROUGH = /* glsl */`
// Real damp rock stays matte-rough (0.64..0.94), NEVER shiny plastic chrome!
float wetStreak = smoothstep(0.58, 0.80, n2(vec2(wp.x * 2.2 + wp.z * 2.2, wp.y * 0.26)));
float wetK = clamp(floodWet * 0.72 + wetStreak * 0.55 + moss * 0.45, 0.0, 1.0);
// "the walls wet and reflecting the light" [wok:27]
roughnessFactor = mix(mix(0.93, 0.80, grain), mix(0.60, 0.44, grain), wetK);
`;

const ROCK_NORMAL = /* glsl */`
{
  float e = 0.018;
  float b0 = rockBump(wp) - claw * 0.28;
  vec3 g = vec3(
    (rockBump(wp + vec3(e, 0.0, 0.0)) - b0),
    (rockBump(wp + vec3(0.0, e, 0.0)) - b0),
    (rockBump(wp + vec3(0.0, 0.0, e)) - b0)
  ) / e;
  float distFade = smoothstep(28.0, 1.8, length(wp - uCamPos));
  float bk = 0.13 * distFade;
  vec3 nW = normalize(Nw - (g - Nw * dot(g, Nw)) * bk);
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}
`;

// Subtle, physically-restrained wet-stone glints from sky rift, Syl's moving blue-white light, and glowing puddle
const ROCK_WET_LIGHT = /* glsl */`
{
  vec3 Vw = normalize(uCamPos - vWp);
  vec3 Nn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float fr = pow(clamp(1.0 - max(dot(Nn, Vw), 0.0), 0.0, 1.0), 4.2);
  float wVis = 1.0 - uWallDim * 0.84;

  // Delicate grazing damp sheen from the sky slit overhead
  vec3 rf = reflect(-Vw, Nn);
  float skyGlint = smoothstep(0.25, 0.95, rf.y) * (0.10 + uRiftSun * 0.42);
  outgoingLight += vec3(0.28, 0.46, 0.72) * skyGlint * (0.02 + 0.34 * fr) * wetK * wVis;

  // Shimmering pale cyan catchlight gliding across wet stone when Syl zips nearby
  vec3 toSyl = uSylPos - vWp;
  float dS = length(toSyl);
  vec3 Ls = toSyl / max(dS, 0.001);
  vec3 Hs = normalize(Ls + Vw);
  float sSpec = pow(max(dot(Nn, Hs), 0.0), mix(18.0, 48.0, wetK));
  float sAtt = 1.0 / (1.0 + 0.28 * dS * dS);
  outgoingLight += vec3(0.38, 0.76, 1.22) * uSylGlow * sSpec * sAtt * (0.18 + 0.48 * wetK) * wVis;

  // Soft upward Stormlight bounce off Moash's glowing puddle onto lower mossy walls
  if (uPuddleGlow > 0.001) {
    vec3 toSp = uSpherePos - vWp;
    float dP = length(toSp);
    vec3 Lp = toSp / max(dP, 0.001);
    float upCatch = max(dot(Nn, Lp), 0.0) * (1.0 / (1.0 + 0.28 * dP * dP));
    outgoingLight += vec3(0.30, 0.66, 1.12) * upCatch * uPuddleGlow * 0.45 * wVis;
  }

  outgoingLight += uMemCol * uMemMix * (0.02 + 0.14 * fr) * wetK * 0.38;
}
`;

// Loose stone: the same rock and moss, with sharper grain, sediment lines and cracks, worn light edges,
// dark crevices, and moss that keeps to the tops and off the edges.
const STONE_V_HEAD = 'attribute float aEdge;\nvarying float vEdge;\n';
const STONE_V_MAIN = 'vEdge = aEdge;\n';
const STONE_F_HEAD = 'varying float vEdge;\n';
const STONE_COLOR = /* glsl */`
{
  float cav = smoothstep(0.05, -0.55, vEdge);
  float wear = smoothstep(0.18, 0.75, vEdge);
  float crack = 1.0 - smoothstep(0.0, 0.035, abs(an3(ROT * wp * 3.1 + 5.0) - 0.5));
  float seam = 1.0 - smoothstep(0.0, 0.05, abs(fract(wp.y * 5.5 + n2(wp.xz * 1.7) * 0.8) - 0.5) * 2.0 - 0.94);
  vec3 c2 = diffuseColor.rgb;
  c2 = mix(c2, stone * (0.66 + 0.52 * grain) * wallVis, wear * 0.55);
  c2 *= 1.0 + wear * 0.55;
  c2 *= 1.0 - cav * 0.62;
  c2 *= 1.0 - crack * 0.55 * (1.0 - moss);
  c2 *= 1.0 - seam * 0.22;
  diffuseColor.rgb = c2;
}
`;

export function boulderMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.16 });
  return patch(m, {
    vHead: STONE_V_HEAD,
    vMain: STONE_V_MAIN,
    fHead: ROCK_HEAD + STONE_F_HEAD,
    fColor: ROCK_COLOR.replace('float moss = smoothstep(0.30, 0.58, mossN * 0.82 + mossFine * 0.26) * mossSlope * mossH * (1.0 - claw * 0.95);',
      'float moss = smoothstep(0.34, 0.60, mossN * 0.82 + mossFine * 0.26) * smoothstep(0.15, 0.7, Nw.y) * mossH * (1.0 - smoothstep(0.15, 0.55, vEdge) * 0.8);') + STONE_COLOR,
    fRough: ROCK_ROUGH,
    fNormal: ROCK_NORMAL.replace('float bk = 0.13 * distFade;', 'float bk = 0.30 * distFade;'),
    fLight: ROCK_WET_LIGHT,
  });
}

export function chasmRockMaterial() {
  // Low envMapIntensity keeps rock grounded and stony while forged metal keeps crisp reflections!
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.16,
  });
  return patch(m, {
    fHead: ROCK_HEAD,
    fColor: ROCK_COLOR,
    fRough: ROCK_ROUGH,
    fNormal: ROCK_NORMAL,
    fLight: ROCK_WET_LIGHT,
  });
}
