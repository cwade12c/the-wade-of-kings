// The Stormwall · materials: three's standard material with our air, wetness and vertex life patched in
import * as THREE from 'three';
import { U, GLSL_COMMON } from './core.js';

const WP = /* glsl */`
{ vec4 wp4 = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wp4 = instanceMatrix * wp4;
#endif
  vWp = (modelMatrix * wp4).xyz; }
`;
let keyN = 0;
// hooks: vHead, vNormal (after beginnormal_vertex), vPos (after begin_vertex), fHead, fColor, fRough, fNormal, fLight (before the pixel is written)
export function patch(mat, o = {}) {
  const key = 'sw' + (keyN++);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, o.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\nvarying vec3 vWp;\n' + (o.vHead || ''))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + (o.vNormal || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (o.vPos || ''))
      .replace('#include <project_vertex>', WP + '#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\nvarying vec3 vWp;\n' + (o.fHead || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (o.fColor || ''))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + (o.fRough || ''))
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (o.fNormal || ''))
      .replace('#include <opaque_fragment>', (o.fLight || '') + '\n#include <opaque_fragment>')
      .replace('#include <fog_fragment>', 'vec3 airRd = vWp - uCamPos; float airD = length(airRd); gl_FragColor.rgb = applyAir(gl_FragColor.rgb, uCamPos, airRd / airD, airD);');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
// a depth material that moves as its mesh does, so shadows follow the motion
export function depthLike(o = {}) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const key = 'swd' + (keyN++);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, o.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\n' + (o.vHead || ''))
      .replace('#include <begin_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n' + (o.vNormal || '') + '\n#include <begin_vertex>\n' + (o.vPos || ''));
  };
  m.customProgramCacheKey = () => key;
  return m;
}
// shared fragment pieces
export const F_WORLD_N = /* glsl */`vec3 Nw = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);`;
// wet stone: darker, glossier, and it mirrors the sky
export const F_WET_LIGHT = /* glsl */`
{ vec3 Vw = normalize(uCamPos - vWp); vec3 Nn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float fr = pow(1.0 - max(dot(Nn, Vw), 0.0), 4.0);
  vec3 rf = reflect(-Vw, Nn); rf.y = abs(rf.y);
  float sdr = max(dot(rf, uSunDir), 0.0);
  vec3 sk = skyTint(rf) + vec3(0.7, 0.8, 1.0) * uFlash.w * uDark * 0.2 + uSunCol * mix(pow(sdr, 24.0) * 0.5, pow(sdr, 260.0) * 7.0, pudK);
  outgoingLight += sk * (0.03 + 0.97 * fr) * gloss; }
`;
