// It Knew What to Do · WebGL2 boot, environment light, lighting rig, staged build, views and orbit, adaptive quality
import * as THREE from 'three';
import { U, G, Q, CAPTURE, makeNoiseTex, clamp, lerp } from './core.js';
import * as Film from './film.js';
import { Post } from './post.js';
import { Chasm } from './chasm.js';
import { buildSpear, spearPoseAt } from './kata.js';
import { Memories } from './memories.js';
import { Effects } from './effects.js';
import { Strokes } from './strokes.js';
import { Gale } from './gale.js';
import { Mirror, MIRROR_LAYER } from './mirror.js';

// Build a tiny procedural chasm-light environment cubemap via PMREM so forged steel & wet ash wood gleam naturally!
function buildChasmEnv(R) {
  const pmrem = new THREE.PMREMGenerator(R);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x060a10);
  // Overhead cool blue sky-rift strip
  const skyPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 2.2, 3.6), side: THREE.DoubleSide })
  );
  skyPanel.position.set(0, 8, 0);
  skyPanel.rotation.x = Math.PI / 2;
  // Warm amber torch bounce panel on left
  const torchPanel = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 1.4, 0.35) })
  );
  torchPanel.position.set(-5, 2, -2);
  // Cool cyan spren accent bounce on right
  const sprenPanel = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.65, 1.55, 2.4) })
  );
  sprenPanel.position.set(4.5, 2.5, 1.5);
  envScene.add(skyPanel, torchPanel, sprenPanel);
  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

export async function boot(canvas, opt = {}) {
  let R;
  try {
    R = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
  } catch (e) {
    throw new Error('This film needs WebGL 2, which this browser did not give us.');
  }
  const gl = R.getContext();
  {
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    const tx = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tx);
    R.resetState();
    if (!ok) throw new Error('This film needs float render targets, which this browser did not give us.');
  }

  R.outputColorSpace = THREE.LinearSRGBColorSpace;
  R.toneMapping = THREE.NoToneMapping;
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFShadowMap;
  R.info.autoReset = false;

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  G.info.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
  const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  G.tier = Q.has('tier') ? +Q.get('tier') : (COARSE || Math.min(screen.width, screen.height) < 700 ? 1 : 0);
  if (Q.has('view')) G.view = Q.get('view');
  G.R = R;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040608);
  scene.environment = buildChasmEnv(R);
  const fog = new THREE.FogExp2(0x05080b, 0.042);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.08, 85);
  G.scene = scene; G.camera = camera;

  U.uNoise.value = makeNoiseTex();
  Post.init(R);
  Mirror.init(R);
  Film.setGentle(opt.gentle);

  // ---- Lighting rig: overhead rift + shadow-casting torch + distant torch + live Syl light + memory & sphere glows ----
  const hemi = new THREE.HemisphereLight(0x4c78b2, 0x101612, 0.58);
  scene.add(hemi);

  const riftDir = new THREE.DirectionalLight(0xc2daf8, 1.0);
  riftDir.position.set(0.6, 22, 0.8);
  riftDir.castShadow = true;
  const smSz = G.tier ? 512 : 1024;
  riftDir.shadow.mapSize.set(smSz, smSz);
  riftDir.shadow.camera.left = -4.5; riftDir.shadow.camera.right = 4.5;
  riftDir.shadow.camera.top = 5.5; riftDir.shadow.camera.bottom = -5.5;
  riftDir.shadow.camera.near = 6; riftDir.shadow.camera.far = 32;
  riftDir.shadow.bias = -0.001;
  scene.add(riftDir);

  // Hero wedged oil torch light (positioned right at the flame heart above the cleft!)
  const torchA = new THREE.PointLight(0xff9a48, 7.2, 16, 1.75);
  torchA.position.copy(U.uTorchA.value).add(new THREE.Vector3(0, 0.24, 0));
  scene.add(torchA);

  // Distant corridor torch giving warm background parallax
  const torchB = new THREE.PointLight(0xff9440, 5.2, 16, 1.8);
  torchB.position.copy(U.uTorchB.value).add(new THREE.Vector3(0, 0.24, 0));
  scene.add(torchB);

  const sylLight = new THREE.PointLight(0x6ecaff, 0, 14, 1.6);
  scene.add(sylLight);

  const memLight = new THREE.PointLight(0xffc980, 0, 14, 1.4);
  memLight.position.set(0.4, 2.8, 1.6);
  scene.add(memLight);

  const sphereLight = new THREE.PointLight(0x64b8ff, 0, 9, 1.6);
  sphereLight.position.copy(U.uSpherePos.value).add(new THREE.Vector3(0, 0.20, 0));
  scene.add(sphereLight);

  // Crisp subtle key light tracking the spear so wet wood & burnished steel always gleam
  const spearKey = new THREE.PointLight(0xdcecff, 1.85, 6.2, 1.5);
  scene.add(spearKey);
  // The lights that matter in the pool's reflection (the shadow-casting rift light stays out of it).
  for (const l of [hemi, torchA, torchB, sylLight, memLight, sphereLight, spearKey]) l.layers.enable(MIRROR_LAYER);

  // ---- Sizing ----
  let quality = 1;
  const buf = new THREE.Vector2();
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (w < 2 || h < 2) return;
    const cap = Math.sqrt((G.tier ? 1.4e6 : 3.0e6) / (w * h));
    const pr = CAPTURE ? +(Q.get('dpr') || 1) : Math.min(devicePixelRatio || 1, cap, 2) * quality;
    camera.aspect = w / h;
    R.setPixelRatio(pr);
    R.setSize(w, h, false);
    R.getDrawingBufferSize(buf);
    Post.size(buf.x, buf.y, G.tier ? 0 : 4);
    Mirror.size(buf.x, buf.y);
  }

  // ---- Staged build ----
  const stage = opt.onStage || (() => {});
  const tick = () => new Promise((r) => (CAPTURE ? setTimeout(r, 0) : requestAnimationFrame(() => r())));

  let spear;
  const steps = [
    ['carving the chasm', 32, (p) => Chasm.build(scene, p, tick)],
    ['balancing the spear', 12, async (p) => { spear = buildSpear(); scene.add(spear); Mirror.add(spear); p(1); await tick(); }],
    ['grinding the ink', 14, (p) => Strokes.build(scene, p, tick)],
    ['painting the memories', 24, (p) => Memories.build(scene, p, tick)],
    ['calling the wind', 24, (p) => Effects.build(scene, p, tick)],
    ['raising the water', 14, (p) => Gale.build(scene, p, tick)],
  ];
  const totalW = steps.reduce((a, s) => a + s[1], 0) + 10;
  let done = 0;
  for (const [label, wgt, fn] of steps) {
    stage(label, done / totalW); await tick();
    const t0 = performance.now();
    await fn((p) => stage(label, (done + wgt * p) / totalW));
    done += wgt;
    G.info[label] = Math.round(performance.now() - t0);
  }
  resize();

  const pose = {};
  const look = { tx: 0, ty: 0 };

  function updateLights() {
    const fl = U.uTorchFlick.value;
    const wallVis = 1 - U.uWallDim.value * 0.80;
    const mood = G.mood;

    torchA.intensity = 7.0 * fl * wallVis;
    torchB.intensity = 5.0 * fl * wallVis;

    hemi.intensity = lerp(0.56, 0.22, U.uWallDim.value) + U.uRiftSun.value * 0.42;
    riftDir.intensity = (0.68 + U.uRiftSun.value * 2.15) * (1 - U.uWallDim.value * 0.55);
    if (mood.wTien > 0.01) riftDir.color.setRGB(lerp(0.76, 1.0, mood.wTien), lerp(0.86, 0.92, mood.wTien), lerp(0.98, 0.68, mood.wTien));
    else riftDir.color.setRGB(0.74, 0.85, 0.98);

    sylLight.position.copy(U.uSylPos.value);
    sylLight.intensity = U.uSylGlow.value * 4.8;

    memLight.color.setRGB(U.uMemCol.value.x, U.uMemCol.value.y, U.uMemCol.value.z);
    memLight.intensity = U.uMemMix.value * 3.8;

    sphereLight.intensity = U.uPuddleGlow.value * 4.8;

    spearKey.position.set(pose.pos.x + 0.55, pose.pos.y + 0.95, pose.pos.z + 1.15);
    spearKey.intensity = 1.9 + U.uMemMix.value * 0.85;

    fog.color.setRGB(U.uFogCol.value.x, U.uFogCol.value.y, U.uFogCol.value.z);
    fog.density = U.uFogDen.value;
    scene.background.copy(fog.color);
  }

  function frame(t, dt = 1 / 60) {
    G.t = t;
    Film.apply(t, camera, look);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    spearPoseAt(t, pose);
    spear.position.copy(pose.pos);
    spear.quaternion.copy(pose.quat);
    // Update subtle sliding dew-sheen hand anchors along the wet wooden shaft
    const ud = spear.userData;
    if (ud && ud.frontGrip) {
      ud.frontGrip.position.y = pose.frontGrip;
      ud.rearGrip.position.y = pose.rearGrip;
      ud.frontMat.uniforms.uAlpha.value = pose.gripVis;
      ud.rearMat.uniforms.uAlpha.value = pose.gripVis * 0.85;
    }
    U.uSpearPos.value.copy(pose.pos);

    for (const f of G.tick) f(t, dt, camera);
    updateLights();

    R.info.reset();
    const sh = R.shadowMap.autoUpdate;
    R.shadowMap.autoUpdate = false;
    Mirror.render(scene, camera);
    R.shadowMap.autoUpdate = sh;
    Post.render(scene, camera, Film.post, t);
  }

  stage('first light', done / totalW); await tick();
  // Draw a few moments once so every shader is compiled before the first play.
  for (const tw of [7.9, 20.5, Film.T.WIND + 5.0, Film.T.FINISH + 0.8, Film.T.PUDDLE + 2.0]) { frame(tw); await tick(); }
  frame(26.8);
  stage('ready', 1);

  const QL = [1, 0.86, 0.74, 0.64, 0.55];
  let level = 0, acc = 0, nfr = 0, slow = 0, good = 0, upWait = 4000;
  const FIXED = Q.has('q') ? clamp(+Q.get('q') || 1, 0.35, 1) : 0;
  function setLevel(L) { level = L; quality = FIXED || QL[L]; G.info.quality = quality; resize(); }
  function govern(avg, span) {
    G.info.ms = +avg.toFixed(1);
    if (FIXED || avg > 120) return;
    if (avg > 20.5) {
      good = 0;
      if (level < QL.length - 1 && ++slow >= 2) { slow = 0; upWait = Math.min(upWait * 2, 64000); setLevel(level + 1); }
      return;
    }
    slow = 0;
    good = avg < 17.6 ? good + span : 0;
    if (level > 0 && good >= upWait) { good = 0; setLevel(level - 1); }
  }
  if (FIXED) setLevel(0);

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; if (opt.onLost) opt.onLost(); });
  canvas.addEventListener('webglcontextrestored', () => { if (opt.onRestored) opt.onRestored(); });

  const player = {
    DUR: Film.DUR, T: Film.T, info: G.info, G,
    resize,
    draw(t, realMs) {
      if (lost) return;
      frame(t);
      if (realMs > 0 && realMs < 250) {
        acc += realMs; nfr++;
        if (acc >= 750) { const a = acc / nfr, sp = acc; acc = 0; nfr = 0; govern(a, sp); }
      } else { acc = 0; nfr = 0; }
    },
    nudge(x, y) { look.tx = x; look.ty = y; },
    setView(v) { G.view = v; },
    orbitBy(dyaw, dpitch, ddist = 0) {
      Film.orbit.active = true;
      Film.orbit.yaw += dyaw;
      Film.orbit.pitch = clamp(Film.orbit.pitch + dpitch, -0.55, 0.62);
      Film.orbit.dist = clamp(Film.orbit.dist + ddist, -1.5, 2.8);
    },
    decayOrbit(k = 0.08) {
      Film.orbit.yaw *= (1 - k);
      Film.orbit.pitch *= (1 - k);
      Film.orbit.dist *= (1 - k);
      if (Math.abs(Film.orbit.yaw) + Math.abs(Film.orbit.pitch) + Math.abs(Film.orbit.dist) < 0.004) Film.resetOrbit();
    },
    resetOrbit: Film.resetOrbit,
    isOrbited: () => Film.orbit.active,
    get lost() { return lost; },
  };

  window.__frameAt = (t) => { frame(t); return true; };
  window.__setView = (v) => { G.view = v; return true; };
  window.__setOrbit = (yaw, pitch, dist = 0) => { Film.orbit.yaw = yaw; Film.orbit.pitch = pitch; Film.orbit.dist = dist; Film.orbit.active = true; return true; };
  window.__dbg = {
    G, scene, camera, R, Post, Film, player,
    get info() { return { ...G.info, calls: R.info.render.calls, tris: R.info.render.triangles, w: Post.W, h: Post.H }; },
  };
  return player;
}
