// It Knew What to Do · the pool as a mirror.
// Everything that gives light (strokes, Syl, memories, flung water, flames, the spear) also lives on layer 1.
// Each frame that layer is drawn from the camera reflected in the water's surface (y = 0) into a small
// HDR target; the floor shader looks it up through ripples and wind chop.
import * as THREE from 'three';
import { U, G } from './core.js';

export const MIRROR_LAYER = 1;

const _pos = new THREE.Vector3(), _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _tgt = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export const Mirror = {
  init(R) {
    this.R = R;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(MIRROR_LAYER);
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    U.tRefl.value = this.rt.texture;
    this.clear = new THREE.Color(0, 0, 0);
  },
  size(w, h) {
    const k = G.tier ? 0.3 : 0.5;
    this.rt.setSize(Math.max(64, Math.round(w * k)), Math.max(36, Math.round(h * k)));
  },
  // Light-bearing objects join the mirror's layer (and keep their own).
  add(obj) { obj.traverse((o) => o.layers.enable(MIRROR_LAYER)); },
  render(scene, camera) {
    const R = this.R, c = this.cam;
    camera.updateMatrixWorld();
    _pos.setFromMatrixPosition(camera.matrixWorld);
    _rot.extractRotation(camera.matrixWorld);
    _fwd.set(0, 0, -1).applyMatrix4(_rot);
    _up.set(0, 1, 0).applyMatrix4(_rot);
    c.position.set(_pos.x, -_pos.y, _pos.z);
    _tgt.set(_pos.x + _fwd.x, -(_pos.y + _fwd.y), _pos.z + _fwd.z);
    c.up.set(_up.x, -_up.y, _up.z);
    c.lookAt(_tgt);
    c.projectionMatrix.copy(camera.projectionMatrix);
    c.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    c.updateMatrixWorld();
    U.uReflMat.value.copy(BIAS).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);

    // Billboards face whichever eye is drawing them.
    const keepCam = U.uCamPos.value.clone();
    U.uCamPos.value.copy(c.position);
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null;
    const cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
    R.setClearColor(this.clear, 1);
    R.setRenderTarget(this.rt);
    R.clear(true, true, false);
    R.render(scene, c);
    R.setRenderTarget(null);
    R.setClearColor(cc, ca);
    scene.background = bg; scene.fog = fog;
    U.uCamPos.value.copy(keepCam);
  },
};
