// The Stormwall · the page around the film: horizon veil, captions in the book's words, the deck, sound as the clock
import { boot } from './src/main.js';

const P = window.P, $ = (id) => document.getElementById(id);
const U = (id) => P.unitById[id];
const cite = (c) => `<a class="cite" href="../../journal.html#${P.unitAnchor(c)}" title="${P.esc(U(c).full)}">${P.esc(U(c).short)}</a>`;
const HORIZON = 'wok:19', DUR = 84;
$('safe').innerHTML = cite(HORIZON);
document.querySelectorAll('[data-cite]').forEach((e) => { e.innerHTML = cite(e.dataset.cite); });
$('credits').innerHTML = (window.STORMWALL_CREDITS || []).map(([t, a, l, u]) => `<li><a href="${u}">${P.esc(t)}</a> by ${P.esc(a)}, ${P.esc(l)}</li>`).join('');

// the beats, each with a sentence or two of the book's own (start, end of the caption, label, words, where they are from)
const BEATS = [
  [0.0, 2.6, 7.6, 'Calm', 'The plants had learned to survive. That’s what you had to do, learn to survive.', 'wok:2'],
  [8.0, 8.6, 13.2, 'The horizon', 'The horizon was growing dark.', 'wok:18'],
  [14.0, 14.4, 20.4, 'First gusts', 'Whenever the wind picked up, the more sensitive of the grass stalks shrank down into their burrows, leaving the landscape patchy, like the coat of a sickly horse.', 'wok:2'],
  [21.0, 21.2, 26.2, 'The wall', 'The massive sheet of rain was a silvery grey, the clouds above onyx black, lit from within by occasional flashes of lightning.', 'wok:18'],
  [26.5, 26.8, 31.2, 'Dust and leaves', 'The grey sky grew clotted with dust and leaves blown ahead of the stormwall and the air grew dense with humid anticipation.', 'wok:18'],
  [32.0, 33.6, 39.6, 'The stormwall', 'In fact, the storm’s initial tempest of water and wind—the stormwall—was the most dangerous part.', 'wok:4'],
  [40.6, 41.0, 45.6, 'Light, no thunder', 'Occasionally, light would flash without the thunder.', 'wok:4'],
  [47.0, 47.4, 53.6, 'Easing', 'The blasts of wind grew more lethargic. Lightning stopped flashing, and the maddening drumming of rain became a quiet tapping instead.', 'wok:4'],
  [57.5, 57.8, 63.4, 'Waking', 'The time right after a highstorm was when the land was most alive. Rockbud polyps split and sent out their vines.', 'wok:4'],
  [64.0, 64.2, 68.6, 'Lifespren', 'Tiny lights rose around the plants. Lifespren.', 'wok:4'],
  [70.0, 70.6, 75.6, 'The sky clears', '…the sky cleared, the highstorm a smudge of blackness on the western horizon.', 'wok:4'],
  [76.0, 76.2, 81.0, 'Windspren', '…a half-dozen windspren flitting overhead, their translucent forms chasing after—or perhaps cruising along with—the highstorm’s last gusts.', 'wok:4'],
];

const frame = $('frame'), stage = $('stage'), canvas = $('cv'), cap = $('cap'), startBtn = $('start'), stageMsg = $('stagemsg'), load = $('load');
const playBtn = $('play'), muteBtn = $('mute'), fillBtn = $('fill'), wordsBtn = $('words'), scrub = $('scrub'), done = $('done'), timeEl = $('time');
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
const beatList = $('beats');
beatList.innerHTML = BEATS.map((b, i) => `<li><button type="button" data-i="${i}"><em>${mmss(b[0])}</em>${P.esc(b[3])}</button></li>`).join('');
const beatBtns = [...beatList.querySelectorAll('button')];

const allowed = P.visible(U(HORIZON).h);
if (!allowed) veil('Past your bookmark', 'This draws on chapters up to Chapter 19. Read that far, then come back.');

// ---- sound: one mixed track of real recordings; while it plays it is the film's clock ----
const audio = new Audio('stormwall.m4a'); audio.preload = 'auto'; audio.loop = true;
let player = null, playing = false, silent = false, poster = true, t = 21.6, last = 0, lastDraw = 0, dirty = true, capShown = -1, beatShown = -1;
const clock = () => (playing && !silent && !audio.paused ? audio.currentTime % DUR : t);

function setIcons() {
  playBtn.innerHTML = playing ? ICON.pause : ICON.play; playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  muteBtn.innerHTML = audio.muted ? ICON.muted : ICON.sound; muteBtn.setAttribute('aria-pressed', String(audio.muted));
  const full = frame.classList.contains('fill') || document.fullscreenElement === frame;
  fillBtn.innerHTML = full ? ICON.unfill : ICON.fill; fillBtn.setAttribute('aria-pressed', String(full));
  wordsBtn.innerHTML = ICON.words; wordsBtn.setAttribute('aria-pressed', String(!frame.classList.contains('nocap')));
}
function play() {
  if (!player) return;
  poster = false; startBtn.hidden = true;
  if (!silent) { try { audio.currentTime = t; } catch (e) { /* not seekable yet */ } const pr = audio.play(); if (pr && pr.catch) pr.catch(() => { silent = true; }); }
  playing = true; last = 0; setIcons();
}
function pause() { t = clock(); audio.pause(); playing = false; dirty = true; setIcons(); }
function seek(x) { t = clamp(x, 0, DUR - 0.02); poster = false; startBtn.hidden = true; dirty = true; if (playing && !silent) { try { audio.currentTime = t; } catch (e) { /* ignore */ } } }
audio.addEventListener('error', () => { silent = true; });

function captions(T) {
  let k = -1, b = -1;
  for (let i = 0; i < BEATS.length; i++) { if (T >= BEATS[i][0]) b = i; if (T >= BEATS[i][1] && T < BEATS[i][2]) k = i; }
  if (poster) k = -1;
  if (k !== capShown) {
    if (k >= 0) { const q = cap.querySelector('b'); q.textContent = BEATS[k][4]; q.classList.toggle('long', BEATS[k][4].length > 120); cap.querySelector('span').innerHTML = `${P.esc(BEATS[k][3])} · ${cite(BEATS[k][5])}`; }
    cap.classList.toggle('on', k >= 0); capShown = k;
  }
  if (b !== beatShown) { beatBtns.forEach((e, j) => e.setAttribute('aria-current', String(j === b && !poster))); beatShown = b; }
}
function loop(now) {
  requestAnimationFrame(loop);
  if (!player || player.lost) return;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
  if (playing && (silent || audio.paused)) { t += dt; if (t >= DUR) t -= DUR; }
  const T = poster ? t : clock();
  if (playing || dirty) { player.draw(T, playing && lastDraw ? now - lastDraw : 0); lastDraw = playing ? now : 0; dirty = false; }
  captions(T);
  if (!poster) { scrub.value = T.toFixed(2); done.style.width = `${(T / DUR * 100).toFixed(2)}%`; timeEl.textContent = `${mmss(T)} / ${mmss(DUR)}`; }
}

startBtn.onclick = () => { t = 0; play(); };
playBtn.onclick = () => { if (poster) t = 0; playing ? pause() : play(); };
muteBtn.onclick = () => { audio.muted = !audio.muted; setIcons(); };
wordsBtn.onclick = () => { frame.classList.toggle('nocap'); setIcons(); };
scrub.oninput = () => seek(+scrub.value);
beatList.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; seek(BEATS[+b.dataset.i][0] + 0.01); if (!playing) play(); };
fillBtn.onclick = async () => {
  if (document.fullscreenElement === frame) { await document.exitFullscreen(); }
  else if (frame.classList.contains('fill')) { frame.classList.remove('fill'); document.documentElement.style.overflow = ''; }
  else if (frame.requestFullscreen && !/iPhone|iPod/.test(navigator.userAgent)) { try { await frame.requestFullscreen(); } catch (e) { frame.classList.add('fill'); document.documentElement.style.overflow = 'hidden'; } }
  else { frame.classList.add('fill'); document.documentElement.style.overflow = 'hidden'; }
  setIcons(); if (player) player.resize(); dirty = true;
};
document.addEventListener('fullscreenchange', () => { setIcons(); if (player) player.resize(); dirty = true; });
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.code === 'Space' && player) { e.preventDefault(); playBtn.onclick(); }
  else if (e.key === 'm' || e.key === 'M') muteBtn.onclick();
  else if (e.key === 'f' || e.key === 'F') fillBtn.onclick();
  else if (e.key === 'Escape' && frame.classList.contains('fill')) fillBtn.onclick();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });
stage.addEventListener('pointermove', (e) => { if (!player || e.pointerType !== 'mouse') return; const r = stage.getBoundingClientRect(); player.nudge((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5); if (!playing) dirty = true; });
setIcons();

if (allowed) {
  const qs = new URLSearchParams(location.search);
  if (qs.has('capture')) { document.documentElement.classList.add('capture'); frame.classList.add('fill'); }
  boot(canvas, {
    gentle: !!P.reducedMotion,
    onStage(label, f) { stageMsg.textContent = label === 'ready' ? '1 min 24 s · sound on' : label + '…'; load.style.width = `${(f * 100).toFixed(1)}%`; if (label === 'ready') load.style.opacity = 0; },
    onLost() { pause(); veil('The picture was lost', 'The browser took the graphics away. Reload the page to bring the storm back.'); },
  }).then((p) => {
    player = p; window.__READY = true; startBtn.disabled = false;
    new ResizeObserver(() => { p.resize(); dirty = true; }).observe(stage);
    if (qs.has('t')) { t = +qs.get('t') || 0; poster = false; startBtn.hidden = true; }
    if (!qs.has('capture')) requestAnimationFrame(loop);
  }).catch((e) => { console.error(e); window.__ERR = String(e && e.stack || e); veil('The storm can’t be drawn here', (e && e.message) || 'This browser could not start the film.'); });
}
