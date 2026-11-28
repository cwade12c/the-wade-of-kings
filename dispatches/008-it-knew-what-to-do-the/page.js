// It Knew What to Do · page controller: horizon veil, captions, perspective toggle, pause-and-orbit, sound clock
import { boot } from './src/main.js';

const P = window.P, $ = (id) => document.getElementById(id);
const U = (id) => P.unitById[id];
const cite = (c) => `<a class="cite" href="../../journal.html#${P.unitAnchor(c)}" title="${P.esc(U(c).full)}">${P.esc(U(c).short)}</a>`;
const HORIZON = 'wok:27', DUR = 76;
$('safe').innerHTML = cite(HORIZON);
$('credits').innerHTML = (window.KATA_CREDITS || []).map(([t, a, l, u]) => `<li><a href="${u}">${P.esc(t)}</a> by ${P.esc(a)}, ${P.esc(l)}</li>`).join('');

// Frozen beat captions — exact lines from Chapter 27
const BEATS = [
  [0.0,  1.2,  6.8, 'The Pool', 'The spear quivered in Kaladin’s fingers, as if begging him to swing it, spin it, dance with it.', 'wok:27'],
  [7.5,  7.7, 10.6, 'Guard Position', 'Without thinking about it, he snapped the spear up under his arm into a guard position, point down. The chasm became quiet.', 'wok:27'],
  [11.0, 11.4, 16.8, 'Tukks', 'He was listening to Tukks chide him. “The first step is to care.”', 'wok:27'],
  [17.5, 17.9, 23.2, 'Tien', 'He was listening to Tien laugh.', 'wok:27'],
  [24.0, 24.4, 29.8, 'His Mother', 'He was hearing his mother tease him in her clever, witty way.', 'wok:27'],
  [30.5, 30.9, 37.8, 'The Battlefield', 'He was on the battlefield, surrounded by enemies but ringed by friends.', 'wok:27'],
  [38.5, 39.0, 44.8, 'His Father', 'He was listening to his father tell him with a sneer in his voice that spears were only for killing. You could not kill to protect.', 'wok:27'],
  [45.5, 45.9, 50.4, 'The Chasm', 'He was alone in a chasm deep beneath the earth, holding the spear of a fallen man, fingers gripping the wet wood, a faint dripping coming from somewhere distant.', 'wok:27'],
  [51.0, 51.3, 54.4, 'Strength', 'Strength surged through him as he spun the spear up into an advanced kata.', 'wok:27'],
  [54.5, 54.6, 56.9, 'Around and Around', 'He spun with it, swinging it around and around, across his neck, over his arm, in and out of jabs and swings.', 'wok:27'],
  [57.0, 57.0, 58.1, 'It Knew What to Do', 'It was as if the spear itself knew what to do.', 'wok:27'],
  [58.2, 58.2, 61.4, 'Him and the Wind', 'For a moment, it was just him. Him and the wind. He fought with her, and she laughed.', 'wok:27'],
  [61.5, 62.0, 66.4, 'The Finish', 'He snapped the spear back into place, holding the haft at the one-quarter position, spearhead down, bottom of the haft tucked underneath his arm, end rising back behind his head.', 'wok:27'],
  [66.8, 67.6, 72.0, 'The Puddle', 'Moash dropped a handful of spheres in stunned silence. Those spheres plopped into the puddle at his feet, causing it to glow.', 'wok:27'],
  [72.1, 72.2, 75.5, 'The Spren', '“And there was some sort of spren zipping around you, between your sweeps, glowing with a pale light. It was beautiful.”', 'wok:27'],
];

const frame = $('frame'), stage = $('stage'), canvas = $('cv'), cap = $('cap');
const startBtn = $('start'), stageMsg = $('stagemsg'), load = $('load');
const playBtn = $('play'), muteBtn = $('mute'), fillBtn = $('fill'), wordsBtn = $('words');
const scrub = $('scrub'), done = $('done'), timeEl = $('time');
const orbitHint = $('orbitHint'), resetOrbitBtn = $('resetOrbit');
const viewBar = $('views'), beatList = $('beats');

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15L19.5 12z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  fill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  unfill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6.5h14M5 11h14M5 15.5h9"/></svg>',
};

const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const veil = (head, msg) => { $('veilhead').textContent = head; $('veilmsg').textContent = msg; $('veil').classList.add('on'); startBtn.hidden = true; load.style.opacity = 0; };

$('ticks').innerHTML = BEATS.slice(1).map((b) => `<i class="tk" style="left:${(b[0] / DUR * 100).toFixed(2)}%"></i>`).join('');
beatList.innerHTML = BEATS.map((b, i) => `<li><button type="button" data-i="${i}"><em>${mmss(b[0])}</em>${P.esc(b[3])}</button></li>`).join('');
const beatBtns = [...beatList.querySelectorAll('button')];
const viewBtns = [...viewBar.querySelectorAll('button')];

const allowed = P.visible(U(HORIZON).h);
if (!allowed) veil('Past your bookmark', 'This draws on Chapter 27. Read that far, then come back.');

const audio = new Audio('kata.m4a');
audio.preload = 'auto';
audio.loop = true;

let player = null, playing = false, silent = false, poster = true;
let t = 26.8, last = 0, lastDraw = 0, dirty = true, capShown = -1, beatShown = -1;
let dragging = false, lastX = 0, lastY = 0;

const clock = () => (playing && !silent && !audio.paused ? audio.currentTime % DUR : t);

function updateHud() {
  if (!player) return;
  const orb = player.isOrbited();
  orbitHint.hidden = poster || playing || orb;
  resetOrbitBtn.hidden = !orb;
}

function setIcons() {
  playBtn.innerHTML = playing ? ICON.pause : ICON.play;
  playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  muteBtn.innerHTML = audio.muted ? ICON.muted : ICON.sound;
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
  const full = frame.classList.contains('fill') || document.fullscreenElement === frame;
  fillBtn.innerHTML = full ? ICON.unfill : ICON.fill;
  fillBtn.setAttribute('aria-pressed', String(full));
  wordsBtn.innerHTML = ICON.words;
  wordsBtn.setAttribute('aria-pressed', String(!frame.classList.contains('nocap')));
  updateHud();
}

function play() {
  if (!player) return;
  poster = false; startBtn.hidden = true;
  if (!silent) {
    try { audio.currentTime = t; } catch (e) { /* wait until seekable */ }
    const pr = audio.play();
    if (pr && pr.catch) pr.catch(() => { silent = true; });
  }
  playing = true; last = 0; setIcons();
}

function pause() {
  t = clock(); audio.pause(); playing = false; dirty = true; setIcons();
}

function seek(x) {
  t = clamp(x, 0, DUR - 0.02);
  poster = false; startBtn.hidden = true; dirty = true;
  if (playing && !silent) { try { audio.currentTime = t; } catch (e) { /* ignore */ } }
  updateHud();
}

audio.addEventListener('error', () => { silent = true; });

function captions(Tnow) {
  let k = -1, b = -1;
  for (let i = 0; i < BEATS.length; i++) {
    if (Tnow >= BEATS[i][0]) b = i;
    if (Tnow >= BEATS[i][1] && Tnow < BEATS[i][2]) k = i;
  }
  if (poster) k = -1;
  if (k !== capShown) {
    if (k >= 0) {
      const q = cap.querySelector('b');
      q.textContent = BEATS[k][4];
      q.classList.toggle('long', BEATS[k][4].length > 115);
      cap.querySelector('span').innerHTML = `${P.esc(BEATS[k][3])} · ${cite(BEATS[k][5])}`;
    }
    cap.classList.toggle('on', k >= 0);
    capShown = k;
  }
  if (b !== beatShown) {
    beatBtns.forEach((e, j) => e.setAttribute('aria-current', String(j === b && !poster)));
    beatShown = b;
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  if (!player || player.lost) return;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (playing && (silent || audio.paused)) { t += dt; if (t >= DUR) t -= DUR; }
  // Smoothly return orbited camera when playback resumes (unless actively dragging)
  if (playing && !dragging && player.isOrbited()) {
    player.decayOrbit(0.08);
    updateHud();
  }
  const Tnow = poster ? t : clock();
  if (playing || dirty) {
    player.draw(Tnow, playing && lastDraw ? now - lastDraw : 0);
    lastDraw = playing ? now : 0;
    dirty = false;
  }
  captions(Tnow);
  if (!poster) {
    scrub.value = Tnow.toFixed(2);
    done.style.width = `${(Tnow / DUR * 100).toFixed(2)}%`;
    timeEl.textContent = `${mmss(Tnow)} / ${mmss(DUR)}`;
  }
}

// ---- Controls ----
startBtn.onclick = () => { t = 0; play(); };
playBtn.onclick = () => { if (poster) t = 0; playing ? pause() : play(); };
muteBtn.onclick = () => { audio.muted = !audio.muted; setIcons(); };
wordsBtn.onclick = () => { frame.classList.toggle('nocap'); setIcons(); };
scrub.oninput = () => seek(+scrub.value);
resetOrbitBtn.onclick = () => { if (!player) return; player.resetOrbit(); dirty = true; updateHud(); };

beatList.onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  seek(BEATS[+b.dataset.i][0] + 0.01);
  if (!playing) play();
};

viewBar.onclick = (e) => {
  const b = e.target.closest('button'); if (!b || !player) return;
  const v = b.dataset.view;
  player.setView(v);
  player.resetOrbit();
  viewBtns.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.view === v)));
  dirty = true;
  updateHud();
};

fillBtn.onclick = async () => {
  if (document.fullscreenElement === frame) { await document.exitFullscreen(); }
  else if (frame.classList.contains('fill')) { frame.classList.remove('fill'); document.documentElement.style.overflow = ''; }
  else if (frame.requestFullscreen && !/iPhone|iPod/.test(navigator.userAgent)) {
    try { await frame.requestFullscreen(); } catch (e) { frame.classList.add('fill'); document.documentElement.style.overflow = 'hidden'; }
  } else {
    frame.classList.add('fill'); document.documentElement.style.overflow = 'hidden';
  }
  setIcons(); if (player) player.resize(); dirty = true;
};
document.addEventListener('fullscreenchange', () => { setIcons(); if (player) player.resize(); dirty = true; });

// ---- Interactive 3D Pause & Orbit (drag with mouse or touch; wheel zoom when paused) ----
stage.addEventListener('pointerdown', (e) => {
  if (!player || poster || e.target.closest('button')) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  stage.classList.add('dragging');
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!player) return;
  if (dragging) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    player.orbitBy(-dx * 0.0065, -dy * 0.005, 0);
    dirty = true;
    updateHud();
    return;
  }
  if (e.pointerType === 'mouse' && !poster) {
    const r = stage.getBoundingClientRect();
    player.nudge((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
    if (!playing) dirty = true;
  }
});
const endDrag = () => { dragging = false; stage.classList.remove('dragging'); };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (e) => {
  if (!player || poster || playing) return;
  e.preventDefault();
  player.orbitBy(0, 0, Math.sign(e.deltaY) * 0.22);
  dirty = true;
  updateHud();
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range')) return;
  if (e.code === 'Space' && player) { e.preventDefault(); playBtn.onclick(); }
  else if (e.key === 'm' || e.key === 'M') muteBtn.onclick();
  else if (e.key === 'f' || e.key === 'F') fillBtn.onclick();
  else if (e.key === 'r' || e.key === 'R') resetOrbitBtn.onclick();
  else if (e.key === '1') viewBtns[0].click();
  else if (e.key === '2') viewBtns[1].click();
  else if (e.key === '3') viewBtns[2].click();
  else if (e.key === 'Escape' && frame.classList.contains('fill')) fillBtn.onclick();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });
setIcons();

if (allowed) {
  const qs = new URLSearchParams(location.search);
  if (qs.has('capture')) { document.documentElement.classList.add('capture'); frame.classList.add('fill'); }
  boot(canvas, {
    gentle: !!P.reducedMotion,
    onStage(label, f) {
      stageMsg.textContent = label === 'ready' ? '1 min 16 s · sound on' : label + '…';
      load.style.width = `${(f * 100).toFixed(1)}%`;
      if (label === 'ready') load.style.opacity = 0;
    },
    onLost() { pause(); veil('The picture was lost', 'The browser took the graphics away. Reload the page to bring the kata back.'); },
  }).then((p) => {
    player = p; window.__READY = true; startBtn.disabled = false;
    new ResizeObserver(() => { p.resize(); dirty = true; }).observe(stage);
    if (qs.has('view')) {
      const v = qs.get('view');
      viewBtns.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.view === v)));
    }
    if (qs.has('t')) { t = +qs.get('t') || 0; poster = false; startBtn.hidden = true; }
    if (!qs.has('capture')) requestAnimationFrame(loop);
  }).catch((e) => {
    console.error(e);
    window.__ERR = String(e && e.stack || e);
    veil('The kata can’t be drawn here', (e && e.message) || 'This browser could not start the film.');
  });
}
