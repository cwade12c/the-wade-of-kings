// The Stormwall · boot, lights, the frame, and the hooks the page and the capture rig drive
import * as THREE from 'three';
import { U, G, Q, CAPTURE, makeNoiseTex, clamp, lerp, sm } from './core.js';
import * as Film from './film.js';
import { Sky } from './sky.js';
import { Post } from './post.js';
import { Land, height } from './land.js';
import { Flora } from './flora.js';
import { Weather } from './weather.js';
import { Spren } from './spren.js';

// boot(canvas, { onStage(label, fraction) }) resolves to the player the page drives, or throws with a plain message
export async function boot(canvas, opt = {}) {
  let R;
  try { R = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false }); }
  catch (e) { throw new Error('This film needs WebGL 2, which this browser did not give us.'); }
  const gl = R.getContext();
  { // every target is half float: ask before building anything
    gl.getExtension('EXT_color_buffer_float'); gl.getExtension('EXT_color_buffer_half_float');
    const tx = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null); gl.deleteFramebuffer(fb); gl.deleteTexture(tx); R.resetState();
    if (!ok) throw new Error('This film needs float render targets, which this browser did not give us.');
  }
  R.outputColorSpace = THREE.LinearSRGBColorSpace; R.toneMapping = THREE.NoToneMapping;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap; R.info.autoReset = false; R.shadowMap.autoUpdate = false;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'); G.info.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
  const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  G.tier = Q.has('tier') ? +Q.get('tier') : (COARSE || Math.min(screen.width, screen.height) < 700 ? 1 : 0);   // 1: phone
  G.R = R;

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.12, 60000);
  G.scene = scene; G.camera = camera;
  U.uNoise.value = makeNoiseTex();
  Post.init(R); scene.add(Sky.init());
  Film.setGround(height); Film.setGentle(opt.gentle);

  // sun (shadows), sky fill, and the storm's own light for the lightning
  const sun = new THREE.DirectionalLight(0xffffff, 0); sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 10; sc.far = 420; sc.updateProjectionMatrix();
  const SM = G.tier ? 1536 : 3072; sun.shadow.mapSize.set(SM, SM); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(hemi);
  const bolt = new THREE.DirectionalLight(new THREE.Color(0.72, 0.82, 1.0), 0); scene.add(bolt, bolt.target);
  const tV = new THREE.Vector3();
  function lights() {
    const dk = G.dark, cl = G.clear, k = G.sunK;
    sun.color.setRGB(1.0, lerp(0.86, 0.80, cl), lerp(0.68, 0.56, cl)); sun.intensity = 5.6 * k * lerp(1, 0.86, cl);
    tV.copy(camera.position); tV.y = height(tV.x, tV.z); tV.x = Math.round(tV.x / 2) * 2; tV.z = Math.round(tV.z / 2) * 2;          // shadows follow the lens in steps, so they do not swim
    sun.target.position.copy(tV); sun.position.copy(tV).addScaledVector(Film.SUN_DIR, 200);
    const amb = lerp(1, 0.075, dk);
    hemi.color.setRGB(lerp(0.42, 0.36, cl) * amb, lerp(0.52, 0.50, cl) * amb, lerp(0.74, 0.80, cl) * amb * lerp(1, 1.25, dk));
    hemi.groundColor.setRGB(0.36 * amb, 0.27 * amb, 0.21 * amb); hemi.intensity = lerp(1.25, 1.5, dk);
    bolt.intensity = Math.min(G.flash * 2.4, 4.0) * sm(0.2, 0.8, dk + 0.2);
    if (G.flash > 0) { bolt.target.position.copy(camera.position); bolt.position.copy(G.flashPos); if (bolt.position.distanceTo(camera.position) < 1) bolt.position.y += 50; }
  }

  // ---- sizing ----
  let quality = 1, cssW = 0, cssH = 0;
  const buf = new THREE.Vector2();
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; if (w < 2 || h < 2) return;
    cssW = w; cssH = h;
    const cap = Math.sqrt((G.tier ? 1.5e6 : 3.2e6) / (w * h));
    const pr = CAPTURE ? +(Q.get('dpr') || 1) : Math.min(devicePixelRatio || 1, cap, G.tier ? 2 : 2) * quality;
    camera.aspect = w / h; R.setPixelRatio(pr); R.setSize(w, h, false);
    R.getDrawingBufferSize(buf); Post.size(buf.x, buf.y, G.tier ? 0 : 4); redraw = true;
  }
  let redraw = true;

  // ---- staged build ----
  const stage = opt.onStage || (() => {});
  const tick = () => new Promise((r) => CAPTURE ? setTimeout(r, 0) : requestAnimationFrame(() => r()));
  const steps = [
    ['raising the stone', 30, (p) => Land.build(scene, p, tick)],
    ['seeding rockbuds and grass', 30, (p) => Flora.build(scene, p, tick)],
    ['gathering the storm', 20, (p) => Weather.build(scene, p, tick)],
    ['calling the spren', 8, (p) => Spren.build(scene, p, tick)],
  ];
  const tw = steps.reduce((a, s) => a + s[1], 0) + 12; let done = 0;
  for (const [label, wgt, fn] of steps) {
    stage(label, done / tw); await tick();
    const t0 = performance.now(); await fn((p) => stage(label, (done + wgt * p) / tw)); done += wgt; G.info[label] = Math.round(performance.now() - t0);
  }
  resize();

  function frame(t, dt = 1 / 60) {
    G.t = t;
    Film.apply(t, camera, look);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    lights();
    for (const f of G.tick) f(t, dt, camera);
    Sky.update(camera);
    R.shadowMap.needsUpdate = G.sunK > 0.01 && (CAPTURE || (fcount++ % (G.tier ? 3 : 2)) === 0 || redraw);
    R.info.reset();
    Post.render(scene, camera, Film.post, t);
  }
  let fcount = 0;
  const look = { tx: 0, ty: 0 };
  // compile every program and show first light before the page lifts the curtain
  stage('first light', done / tw); await tick();
  frame(Film.T.HIT + 1.1); await tick(); frame(Film.T.WAKE + 6); await tick(); frame(0);
  stage('ready', 1);

  // ---- adaptive quality: lower the pixel count when frames run long, climb back when they hold ----
  const QL = [1, 0.86, 0.74, 0.64, 0.55, 0.48];
  let level = 0, acc = 0, nfr = 0, slow = 0, good = 0, upWait = 4000;
  const FIXED = Q.has('q') ? clamp(+Q.get('q') || 1, 0.3, 1) : 0;
  function setLevel(L) { level = L; quality = FIXED || QL[L]; G.info.quality = quality; resize(); }
  function govern(avg, span) {
    G.info.ms = +avg.toFixed(1);
    if (FIXED || avg > 120) return;
    if (avg > 20.5) { good = 0; if (level < QL.length - 1 && ++slow >= 2) { slow = 0; upWait = Math.min(upWait * 2, 64000); setLevel(level + 1); } return; }
    slow = 0; good = avg < 17.6 ? good + span : 0;
    if (level > 0 && good >= upWait) { good = 0; setLevel(level - 1); }
  }
  if (FIXED) setLevel(0);

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; if (opt.onLost) opt.onLost(); });
  canvas.addEventListener('webglcontextrestored', () => { if (opt.onRestored) opt.onRestored(); });

  const player = {
    DUR: Film.DUR, T: Film.T, info: G.info, G,
    resize,
    // draw film time t (seconds). real: the wall-clock gap since the last drawn frame, for the governor
    draw(t, realMs) {
      if (lost) return;
      frame(t); redraw = false;
      if (realMs > 0 && realMs < 250) { acc += realMs; nfr++; if (acc >= 750) { const a = acc / nfr, sp = acc; acc = 0; nfr = 0; govern(a, sp); } } else { acc = 0; nfr = 0; }
    },
    nudge(x, y) { look.tx = x; look.ty = y; },
    get lost() { return lost; },
  };
  window.__frameAt = (t) => { frame(t); return true; };
  window.__dbg = { G, scene, camera, R, Post, Film, player, get info() { return { ...G.info, calls: R.info.render.calls, tris: R.info.render.triangles, w: Post.W, h: Post.H }; } };
  return player;
}
