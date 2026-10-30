/* The Unfolding: who is connected to whom, drawn from codex/relations.toml.
   Layouts (web-layout.js) are computed once for everything visible, sized to the box they're
   drawn in, so scrubbing through chapters only lights, sizes and dims nodes in place. For Wade
   the build draws both maps ahead of time (gallery/data/layout.js), so the page opens without
   working them out; a friend's maps are always worked out live from their own bookmark, since
   positions encode ties. New nodes "infuse" into view, in step with the storm that sweeps each
   chapter in.

   Two views (opts.view) decide what is drawn and how:
   - "everyone" (the default, and all the home teaser knows): every name and every tie, one line
     per tie, spheres sized by ties. Called without a view, the web draws exactly as it always has.
   - "cast": people and groups, with things, places, field guide and lore as layers to switch on.
     A group's members share a territory instead of lines to its square; each pair gets one
     line, at the same strength as Everything's; spheres grow with how often the book names someone;
     names come and go with the zoom, like towns on a map.
   Spacing (Spacious or Compact) decides where everyone sits; each view keeps its own.

   Everything is drawn on one <canvas>: territories, then lines, then spheres, then names. It is
   redrawn on the next animation frame whenever something changes, and not otherwise; while only
   the glows pulse, the still picture is kept in two layers and the glows are laid between them.
   Spheres come from small cached images, one per size, look and shape. A hidden list of buttons,
   one per name drawn, A to Z, stands in for the canvas for keyboards and screen readers.

   Reading it at any size:
   - Zoom spreads the web apart. Spheres, lines and names keep a steady size on screen, so
     zooming in opens up room between them rather than inflating them; zoomed far out,
     spheres and lines stop shrinking so they stay visible.
   - Names are placed, not just drawn: each tries right, left, below and above its sphere and
     takes the first spot that covers no other name and no other sphere. What's already placed
     sits in a grid of 64 px cells, so each try looks only at its neighbours. During a pinch or a
     scroll the names ride along with the map, and they're placed afresh when the gesture ends
     (and every 250 ms through a long one).
   - Focus: pick someone and everyone tied to them glides into a ring around them, keeping
     roughly the direction they sat in, each labelled with what the tie is. Whatever else
     stood in the way drifts aside. Let go and everything glides home.
     In The Cast the ring is Ripples instead: people and groups only, grouped by their top kind
     of tie, clockwise from 12 o'clock, and "one more step" adds a second ring of the people
     they're tied to.
   - Ties that follow from the family lines (opts.implied) are drawn thin and faint. They join
     focus rings, but have no say in a sphere's size, its name's priority, or the layout.
   - Lenses (setLens) light some names and fade the rest. Nobody moves, nothing is hidden, and
     picking anyone still opens their whole ring. A traced path (showPath) is drawn the same way,
     with its own ties on top.

   Salience is mechanical: sizes, tiers and which names show come from counts of the text so far,
   chapter viewpoints and cited ties, by formulas applied to everyone alike, recomputed for
   whichever chapter is on screen. */
(function () {
  "use strict";
  const LABEL_PX = 12.5;      // on-screen name size
  const SUB_PX = 10.5;        // on-screen size of a tie's label under a name, in focus
  const TERR_PX = 9.5;        // on-screen size of a territory's name
  const AREA = 760000;        // layout room, the density that reads well on a desktop
  const BOOST_AT = 0.9;       // zoomed out past this, spheres and lines stop shrinking…
  const BOOST_MAX = 1.8;      // …until they're this much larger than drawn
  const CAP = 1.4;            // zoomed in past this, they stop growing: zoom only spreads
  const FOCUS_MS = 700, GLIDE_MS = 700, GROW_MS = 300, LENS_MS = 600;
  const CELL = 64;            // the name grid's cell, in screen px
  const REPLACE_MS = 250;     // during a long gesture, names are placed afresh this often
  // how a lens or a path fades what it doesn't light
  const FADE = { node: 0.28, out: 0.3, none: 0.05, terr: 0.15 };
  // Ripples: everyone off the rings, and the second ring's spheres, names and ties
  const RIPPLE = { rest: 0.06, node2: 0.6, name2: 0.7, tie2: 0.32, gap2: 70 };
  // lighter tints of the tie colours, for text on the dark sky
  const TINT = { family: "#e3ad4c", command: "#74afff", support: "#4fd1a0", hostile: "#f58e9b", other: "#b3bccb" };
  // which tie colours a pair's single line in The Cast
  const PRIORITY = ["family", "hostile", "command", "support", "other"];
  const ALWAYS = new Set(["cast", "groups"]);   // The Cast's layers that can't be switched off
  // the palette the stylesheet gives the web's text
  const INK = { name: "#ece4d2", minor: "#a9b3c1", halo: "#0e151e", terr: "#d9b77e" };

  // CSS timing curves, for the transitions the canvas plays itself
  function bezier(x1, y1, x2, y2) {
    const f = (a, b, t) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
    return (x) => {
      if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) { const v = f(x1, x2, t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return f(y1, y2, t);
    };
  }
  const EASE = bezier(0.25, 0.1, 0.25, 1), EASE_IN_OUT = bezier(0.42, 0, 0.58, 1), EASE_OUT = bezier(0, 0, 0.58, 1);
  const EASE_SOFT = bezier(0.2, 0.8, 0.2, 1), EASE_SPRING = bezier(0.2, 0.9, 0.3, 1.2);

  P.web = function (el, opts = {}) {
    const lim = opts.limit ?? P.limit();
    const page = opts.view !== undefined;   // the Unfolding page; the teaser stays as it was
    const faint = (r) => !!(P.BASES[r.basis] || {}).faint;
    const g = P.webLayout.graph(P.data, lim, { implied: !!opts.implied, faint, layerOf: P.layerOf, mentionsAt: P.mentionsAt });
    const { nodes, byId, rels } = g;
    const castR = (n, h) => P.webLayout.byMentions(P.mentionsAt(n.e, h));
    nodes.forEach((n, i) => {
      n.i = i;
      n.h = n.e.h;
      n.r = n.rE;
      n.square = ["group", "people"].includes(n.e.kind);
    });

    const pairs = {};
    const links = rels.map((r) => {
      const key = [r.from, r.to].sort().join("|");
      pairs[key] = (pairs[key] ?? -1) + 1;
      return { ...r, source: byId[r.from], target: byId[r.to], idx: pairs[key], key };
    });
    links.forEach((l) => { l.total = pairs[l.key] + 1; });
    // a tie goes on the map once it's cited and both its ends have been met
    links.forEach((l) => { l.on = Math.max(l.h, l.source.h, l.target.h); });
    // each name's ties, in the order they're listed
    const adj = new Map(nodes.map((n) => [n.id, []]));
    links.forEach((l) => { adj.get(l.source.id).push(l); if (l.target !== l.source) adj.get(l.target.id).push(l); });
    const width = (l) => (faint(l) ? 1.1 : 2), flowWidth = (l) => (faint(l) ? 1.2 : 2.2);

    // ------------------------------------------------------------ state
    const state = {
      h: lim, types: new Set(Object.keys(P.TYPES)), styles: new Set(Object.keys(P.STYLES)), selected: null,
      view: opts.view || "everyone", layers: new Set(), tier: "all", rankBy: "named",
      spacing: { cast: "spacious", everyone: "compact" },   // each view keeps its own, for the visit
      lens: null,   // { kind, ids, ring }: the names a lens lights, and who gets a belonging ring
      path: null,   // { ids, ties }: a traced chain of ties
      step: null,   // one more step: null until the reader chooses; then on by stage width
    };
    if (opts.spacing === "spacious" || opts.spacing === "compact") state.spacing[state.view] = opts.spacing;
    const cast = () => state.view === "cast";
    const styleOf = (l) => (P.BASES[l.basis] || P.BASES.seen).style;
    const shown = (l) => l.on <= state.h && state.types.has(l.type) && state.styles.has(styleOf(l));
    // in the current view: The Cast holds people, groups and the layers switched on
    const inView = (n) => !cast() || ALWAYS.has(n.layer) || state.layers.has(n.layer);

    // ------------------------------------------------------------ layouts, shaped to the box
    // Every screen gets the same room per name, shaped to the box: tall on a phone, wide on a
    // monitor. The maps drawn ahead of time come in those two shapes; they're used only on the
    // page, for Wade's own bookmark, and only if they place everyone drawn.
    const box0 = el.getBoundingClientRect();
    const ahead = page && P.friendH() === null && window.PALANAEUM_LAYOUT && window.PALANAEUM_LAYOUT.horizon === lim
      ? window.PALANAEUM_LAYOUT[(box0.height || 680) > (box0.width || 1000) ? "tall" : "wide"] : null;
    const aspect = ahead ? ahead.aspect : Math.max(0.6, Math.min(1.9, (box0.width || 1000) / (box0.height || 680)));
    const W = Math.sqrt(AREA * aspect), HGT = Math.sqrt(AREA / aspect);
    const layouts = {};
    function layout(name) {   // read from the drawn-ahead map, else worked out the first time it's needed
      if (layouts[name]) return layouts[name];
      const pos = ahead && ahead[name];
      layouts[name] = pos && nodes.every((n) => pos[n.id]) ? new Map(nodes.map((n) => [n.id, pos[n.id]])) : P.webLayout.map(name, g, W, HGT);
      return layouts[name];
    }
    const layoutName = () => (page && state.spacing[state.view] === "spacious" ? "spacious" : "compact");
    let current = layoutName();
    function setBase(name) {
      const pos = layout(name);
      current = name;
      nodes.forEach((n) => { [n.bx, n.by] = pos.get(n.id); n.flip = name === "compact" && n.bx > W * 0.64; });
    }
    setBase(current);
    nodes.forEach((n) => { n.x = n.bx; n.y = n.by; });

    // ------------------------------------------------------------ the canvas
    const canvas = el;
    const ctx = canvas.getContext("2d");
    const textFont = (getComputedStyle(document.documentElement).getPropertyValue("--text") || "").trim() || "system-ui, sans-serif";
    const font = (px, weight = 400) => `${weight} ${px}px ${textFont}`;
    let dpr = 1, size = [box0.width || W, box0.height || HGT];   // the stage, in CSS px (kept by fitCanvas)
    function fitCanvas() {
      const b = canvas.getBoundingClientRect();
      size = [b.width || W, b.height || HGT];
      dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round((b.width || W) * dpr)), h = Math.max(1, Math.round((b.height || HGT) * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; layersStale = true; }
    }
    const stageSize = () => size;

    // A value that eases to where it's sent over ms, as a CSS transition would. Reading it while
    // it moves asks for another frame.
    let clock = performance.now(), busy = false;
    function ramp(v, ms, curve = EASE) {
      const r = { v, to: v, from: v, t0: 0, ms: 0 };
      r.set = (to, dur = ms) => {
        if (to === r.to) return;
        r.from = r.now(); r.to = to; r.t0 = performance.now(); r.ms = P.reducedMotion ? 0 : dur;
        invalidate();
      };
      r.jump = (to) => { r.to = to; r.ms = 0; };
      r.now = () => {
        if (!r.ms) return r.to;
        const t = (clock - r.t0) / r.ms;
        if (t >= 1) { r.ms = 0; return r.to; }
        busy = true;
        return r.from + (r.to - r.from) * curve(Math.max(0, t));
      };
      return r;
    }
    nodes.forEach((n) => {
      n.alpha = 1;                 // the sphere's opacity (instant, as before)
      n.lg = 1;                    // its name's group opacity (instant)
      n.la = ramp(1, 250);         // its name's own opacity, placed or not
      n.hs = ramp(1, 400, EASE_SOFT);   // half size, for Ripples' second ring
    });
    const tieLooks = (l) => { l.op = ramp(1, 300); l.fl = ramp(0, 300); l.hot = false; l.vis = false; };
    links.forEach(tieLooks);

    // cached spheres: one image per look, shape, size (1 px steps) and zoom (0.1 steps)
    const sprites = new Map();
    function sprite(look, square, rb, u) {
      const key = `${look}|${square ? 1 : 0}|${rb}|${u}|${dpr}`;
      let s = sprites.get(key);
      if (s) return s;
      if (sprites.size > 900) sprites.clear();
      const lit = look === "lit" || look === "lit-sel";
      const sel = look.endsWith("-sel");
      const pad = Math.ceil((lit ? 14 : 4) * u) + 2, half = rb + pad, size = half * 2;
      const c = document.createElement("canvas");
      c.width = c.height = Math.ceil(size * dpr);
      const x = c.getContext("2d");
      x.scale(c.width / size, c.height / size);
      x.translate(half, half);
      const R = rb;
      const shape = () => {
        x.beginPath();
        if (!square) { x.arc(0, 0, R, 0, Math.PI * 2); return; }
        const q = Math.min(3 * u, R);
        x.moveTo(-R + q, -R); x.arcTo(R, -R, R, R, q); x.arcTo(R, R, -R, R, q); x.arcTo(-R, R, -R, -R, q); x.arcTo(-R, -R, R, -R, q); x.closePath();
      };
      // the body: a radial light from the upper left, as the SVG gradients drew it
      const gr = x.createRadialGradient(-0.3 * R, -0.4 * R, 0, -0.3 * R, -0.4 * R, R);
      if (lit) { gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#d8ecff"); gr.addColorStop(1, "#6f8fb3"); }
      else { gr.addColorStop(0, "#3a4a5e"); gr.addColorStop(1, "#18212c"); }
      shape();
      x.fillStyle = gr;
      if (lit) {   // a viewpoint's glow, blurred once here and never per frame
        x.save();
        x.shadowColor = "rgba(216, 236, 255, 0.85)";
        x.shadowBlur = 8 * u * (c.width / size);
        x.fill();
        x.restore();
      }
      x.fill();
      x.lineWidth = (sel ? 3 : 1.5) * u;
      x.strokeStyle = sel ? "#fff" : lit ? "#d8ecff" : square ? "#c9a46a" : "#ece4d2";
      x.globalAlpha = lit ? 1 : 0.8;
      x.stroke();
      s = { c, half };
      sprites.set(key, s);
      return s;
    }
    // a soft round glow, drawn at any size: the viewpoint halo and the infusion's flash
    function glowSprite(color, a0) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const x = c.getContext("2d");
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, `rgba(${color}, ${a0})`);
      gr.addColorStop(1, `rgba(${color}, 0)`);
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
      return c;
    }
    const HALO = glowSprite("216, 236, 255", 0.55), FLASH = glowSprite("216, 236, 255", 1);
    // end markers: a second cue beside colour (arrow = command, dot = support, bar = hostility).
    // On the page they're drawn larger: for red-green colour-blind readers the shape is the cue.
    const markerSize = page ? 6.5 : 4.5;
    const marked = (l) => l.type === "command" || l.type === "support" || l.type === "hostile";

    let S = 1;   // how much larger than drawn spheres and lines are, at this zoom
    // a tie's line, in layout units: start, the curve's control point (or null) and end
    function geom(l) {
      const s = l.source, t = l.target;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      let off = (l.idx - (l.total - 1) / 2) * 20 * S;
      if (s.id > t.id) off = -off; // offsets relative to the pair's canonical direction
      const sr = s.r * (s.half ? 0.5 : 1), tr = t.r * (t.half ? 0.5 : 1);
      const sx = s.x + ux * (sr * S + 2), sy = s.y + uy * (sr * S + 2);
      const end = (l.type === "family" || l.type === "other" ? 2 : 7) * S;
      const tx = t.x - ux * (tr * S + end), ty = t.y - uy * (tr * S + end);
      if (!off) return [sx, sy, null, null, tx, ty];
      return [sx, sy, (sx + tx) / 2 - uy * off, (sy + ty) / 2 + ux * off, tx, ty];
    }

    // Everything: one line per tie, parallel ties curving apart
    // The Cast: one line per pair. It takes the colour, direction and dash of the pair's
    // highest-priority tie on show; family ties that only follow from others are drawn only
    // where a pair has no stated tie at all. Member ties aren't drawn: the territory says it.
    const castPairs = [];
    if (page) {
      const byKey = new Map();
      links.forEach((l) => {
        let p = byKey.get(l.key);
        if (!p) {
          const [a, b] = l.key.split("|");
          byKey.set(l.key, p = { key: l.key, a, b, ties: [], idx: 0, total: 1, on: Infinity });
          castPairs.push(p);
        }
        p.ties.push(l);
      });
      castPairs.forEach((p) => {
        const best = p.ties.slice().sort((x, y) => (faint(x) - faint(y)) || PRIORITY.indexOf(x.type) - PRIORITY.indexOf(y.type))[0];
        Object.assign(p, { type: best.type, basis: best.basis, from: best.from, to: best.to, label: best.label, source: best.source, target: best.target });
        tieLooks(p);
      });
    }
    let link = cast() ? castPairs : links;
    // a traced path: its own ties, one straight line per step, drawn over the rest with labels
    let pathTies = [];
    // the tie a pair's line stands for right now, or null if the pair has no line
    function pairTie(p) {
      const on = p.ties.filter(shown);
      const stated = on.filter((l) => !faint(l));
      const pick = (ls) => ls.slice().sort((x, y) => PRIORITY.indexOf(x.type) - PRIORITY.indexOf(y.type))[0];
      const drawn = stated.filter((l) => !l.member);
      if (drawn.length) return pick(drawn);
      const sel = state.selected;
      if (stated.length && sel && (p.a === sel.id || p.b === sel.id)) return pick(stated);   // a picked member's ties
      if (!p.ties.some((l) => !faint(l) && l.on <= state.h) && on.length) return on[0];      // implied, and nothing stated
      return null;
    }
    function restyleCast() {
      castPairs.forEach((p) => {
        const t = pairTie(p);
        p.tie = t;
        p.on = Math.min(...p.ties.map((l) => l.on));
        if (t) Object.assign(p, { type: t.type, basis: t.basis, from: t.from, to: t.to, label: t.label, source: t.source, target: t.target });
      });
    }

    const major = (n) => P.isPov(n.id, lim) || n.degree >= 3;
    const named = opts.labels !== "none";
    const plain = (n) => n.e.name.replace(/^The /, "");
    let namesReady = !document.fonts;   // names are drawn once the web font is in
    // measure each name at its on-screen size (and again when the web font arrives)
    function measure() {
      ctx.save();
      ctx.font = font(LABEL_PX);
      nodes.forEach((n) => { n.tw = ctx.measureText(plain(n)).width; });
      ctx.restore();
    }
    measure();

    // ------------------------------------------------------------ territories (The Cast)
    // A group (a house, a crew, an order; never a whole people) with two or more marked
    // members on the map gets a soft region around them, drawn instead of their lines.
    const terrs = !page ? [] : nodes.filter((n) => n.e.kind === "group").map((g) => ({
      g, rows: links.filter((l) => l.member && l.target === g), op: ramp(1, 300), name: plain(g),
    })).filter((t) => t.rows.length >= 2);
    // a territory's name, in small capitals spaced apart: each letter, its size and its advance
    function smallCaps(t) {
      if (t.caps) return t.caps;
      ctx.save();
      const caps = [...t.name.toLowerCase()].map((ch) => {
        const up = ch.toUpperCase(), small = up !== ch;
        ctx.font = font(small ? TERR_PX * 0.7 : TERR_PX, 700);
        return { ch: up, px: small ? TERR_PX * 0.7 : TERR_PX, w: ctx.measureText(up).width + TERR_PX * 0.16 };
      });
      ctx.restore();
      t.caps = caps;
      t.tw = caps.reduce((a, c) => a + c.w, 0);
      return caps;
    }
    terrs.forEach(smallCaps);
    const terrOf = new Set();   // groups whose territory is on the map right now
    function terrMembers(t) {
      return t.rows.filter((l) => l.on <= state.h).map((l) => l.source);
    }
    // A region hugs its members and routes around everyone else. It's the zero contour of a
    // field that is positive near the members and along their member rows to the group's square
    // (smoothly joined), and negative near every other name drawn, so it never takes in someone
    // who isn't marked as one of them. Where a non-member stands in the way, the region parts:
    // a gap is better than a false member. Sizes are on-screen px, divided by the zoom.
    const smin = (a, b, w) => { const h = Math.max(w - Math.abs(a - b), 0) / w; return Math.min(a, b) - h * h * w * 0.25; };
    const dist = (dx, dy) => Math.sqrt(dx * dx + dy * dy);
    const segDist = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      return dist(px - ax - u * dx, py - ay - u * dy);
    };
    const curve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.7));
    // Only regions on screen are traced, and a region is traced again only when something it's
    // drawn from has changed: the zoom, the detail, or where its members and neighbours stand.
    function trace(t, k, coarse) {
      const mine = terrMembers(t).filter((n) => drawn.has(n.id));
      const ids = new Set([t.g.id, ...terrMembers(t).map((n) => n.id)]);
      const pad = 13 / k, bar = 6 / k, blend = 16 / k, clear = 7 / k, cell = (coarse ? 10 : 4) / k;
      const ms = [t.g, ...mine].map((n) => ({ x: n.x, y: n.y, R: n.r * S + pad, core: n.r * S + 2 / k }));
      const bars = mine.map((n) => [n.x, n.y, t.g.x, t.g.y]);
      const m = blend + 2 * cell;
      const x0 = Math.min(...ms.map((c) => c.x - c.R)) - m, x1 = Math.max(...ms.map((c) => c.x + c.R)) + m;
      const y0 = Math.min(...ms.map((c) => c.y - c.R)) - m, y1 = Math.max(...ms.map((c) => c.y + c.R)) + m;
      const [cw, ch] = stageSize();
      if (T.applyX(x1) < 0 || T.applyX(x0) > cw || T.applyY(y1) < 0 || T.applyY(y0) > ch) {
        t.key = null; t.path = null; t.rings = []; t.pts = []; t.area = 0;
        return;
      }
      const others = nodes.filter((n) => drawn.has(n.id) && !ids.has(n.id))
        .map((n) => ({ x: n.x, y: n.y, R: n.r * S + clear, core: n.r * S + 1 / k }))
        .filter((c) => c.x + c.R > x0 && c.x - c.R < x1 && c.y + c.R > y0 && c.y - c.R < y1);
      const key = [k, coarse ? 1 : 0, ...ms.flatMap((c) => [c.x, c.y, c.R]), "|", ...others.flatMap((c) => [c.x, c.y, c.R])].join(",");
      if (key === t.key) return;
      t.key = key;
      const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
      const at = (px, py) => {
        let d = Infinity;
        for (const c of ms) d = smin(d, dist(px - c.x, py - c.y) - c.R, blend);
        for (const b of bars) d = smin(d, segDist(px, py, b[0], b[1], b[2], b[3]) - bar, blend);
        if (d > 0) return -d;   // outside every member: nothing below can bring it in
        let v = -d;
        for (const c of others) v = Math.min(v, dist(px - c.x, py - c.y) - c.R);
        for (const c of ms) v = Math.max(v, c.core - dist(px - c.x, py - c.y));        // a member's own sphere is always in
        for (const c of others) v = Math.min(v, dist(px - c.x, py - c.y) - c.core);    // anyone else's never is
        return v;
      };
      // The field changes by at most one unit per unit of distance, so it's first read every 4th
      // cell: a cell near a reading far from zero lies on the same side of the edge and isn't
      // beside it, and its value only matters for its sign. Only cells near the edge are worked
      // out exactly (the contour runs between those).
      const C = 4, cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, far = 4.4 * cell;
      const rough = new Float64Array(cx * cy);
      for (let J = 0; J < cy; J++) for (let I = 0; I < cx; I++) rough[J * cx + I] = at(x0 + (I * C + 0.5) * cell, y0 + (J * C + 0.5) * cell);
      const f = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const J = Math.min(cy - 1, Math.round(j / C));
        for (let i = 0; i < nx; i++) {
          const c = rough[J * cx + Math.min(cx - 1, Math.round(i / C))];
          f[j * nx + i] = c > far || c < -far ? c : at(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell);
        }
      }
      // grid value i sits at contour coordinate i + 0.5, which is x0 + (i + 0.5) × cell
      const polys = d3.contours().size([nx, ny]).thresholds([0])(f)[0].coordinates;
      t.pts = []; t.area = 0; t.rings = [];
      const path = new Path2D();
      polys.forEach((rings) => rings.forEach((ring, r) => {
        const pts = ring.slice(0, -1).map(([X, Y]) => [x0 + X * cell, y0 + Y * cell]);
        if (!r) t.pts.push(...pts);
        t.area += (r ? -1 : 1) * Math.abs(d3.polygonArea(pts));
        t.rings.push(pts);
        curve.context(path)(pts);
      }));
      t.path = t.rings.length ? path : null;
    }
    let tracedK = null;   // the zoom the regions were last traced at
    let terrOrder = [];
    let needTrace = false, traceFine = false, settle = 0;
    // When anything moves, regions are traced coarsely at once, so they keep up, and finely once
    // everything has been still for 180 ms. Mid-zoom they keep their shape until it settles.
    // Asking only marks them: they're traced once, just before the next frame is drawn.
    function renderTerrs(o = {}) {
      if (!page || !terrs.length) return;
      if (!o.zooming || tracedK === null) { needTrace = true; invalidate(); }
      traceSoon();
    }
    function traceSoon() {
      clearTimeout(settle);
      settle = setTimeout(() => { needTrace = true; traceFine = true; invalidate(); }, 180);
    }
    function doTrace() {
      tracedK = T.k;
      terrs.forEach((t) => {
        if (cast() && terrOf.has(t.g.id)) trace(t, T.k, !traceFine);
        else { t.key = null; t.path = null; t.rings = []; }
      });
      terrOrder = terrs.filter((t) => t.path).sort((a, b) => (b.area || 0) - (a.area || 0));   // the largest first, so small ones sit on top
      needTrace = false; traceFine = false;
      needPlace = true;   // a territory's name follows its region
    }

    function render() {
      renderTerrs();
      invalidate();
    }

    // ------------------------------------------------------------ name placement
    let T = d3.zoomIdentity, userMoved = false;
    const pad = { top: 24, right: 24, bottom: 24, left: 24, ...(opts.pad || {}) };
    let curH = lim, pinned = new Set(), drawn = new Set(nodes.map((n) => n.id));
    let soft = new Set();     // Ripples' second ring: named before anyone else, where there's room
    const subs = new Map();   // in focus: id -> [text, colour] for the tie under a name
    // the names a lens or a traced path lights, among those drawn; null when nothing is lit
    // that way, or when someone is picked (their ring sits above the lens)
    function lightSet() {
      if (state.selected) return null;
      if (state.path) return new Set([...state.path.ids].filter((id) => byId[id].h <= state.h));
      if (!state.lens) return null;
      return new Set([...state.lens.ids].filter((id) => drawn.has(id) && byId[id].h <= state.h));
    }
    // Greedy, in rank order. Everything: whoever is picked and everyone tied to them, then
    // tonight's viewpoints, then other viewpoints, then the best-tied. The Cast: whoever is picked
    // and their ring, then viewpoints, then whoever is on the page in the chapter shown, then score.
    const nowPov = () => new Set((P.units[curH] || { pov: [] }).pov);
    const rankEvery = (n, now) => (pinned.has(n.id) ? 1e6 : 0) + (now.has(n.id) ? 1e5 : 0) + (P.isPov(n.id, curH) ? 1e4 : 0) + n.degree;
    const rankCast = (n) => (pinned.has(n.id) ? 1e6 : 0) + (soft.has(n.id) ? 5e5 : 0) + (P.isPov(n.id, curH) ? 1e5 : 0) + (P.onPage(n.e, curH) ? 1e4 : 0) - (n.srank ?? 9999);
    const boxHits = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const circleHits = (b, cx, cy, r) => {
      const dx = cx - Math.max(b[0], Math.min(cx, b[2])), dy = cy - Math.max(b[1], Math.min(cy, b[3]));
      return dx * dx + dy * dy < r * r;
    };
    // A grid of 64 px cells: each item sits in every cell its box touches, and a question about
    // a box asks only the items in its own cells (each once).
    function grid() {
      const cells = new Map();
      let stamp = 0;
      const each = (b, fn) => {
        const i0 = Math.floor(b[0] / CELL), i1 = Math.floor(b[2] / CELL), j0 = Math.floor(b[1] / CELL), j1 = Math.floor(b[3] / CELL);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (fn(i * 1048576 + j)) return true;
        return false;
      };
      return {
        add(item, b) { each(b, (key) => { const c = cells.get(key); if (c) c.push(item); else cells.set(key, [item]); }); },
        // fn(item) for each item near box b, until it returns true
        near(b, fn) {
          stamp += 1;
          return each(b, (key) => {
            const c = cells.get(key);
            if (!c) return false;
            for (const it of c) { if (it.s === stamp) continue; it.s = stamp; if (fn(it)) return true; }
            return false;
          });
        },
      };
    }
    // the boxes names keep clear of: a grid, plus the plain list for counting
    function boxes() {
      const gr = grid();
      return { add(b) { gr.add(b, b); }, hits: (b) => gr.near(b, (p) => boxHits(b, p)), count(b) { let c = 0; gr.near(b, (p) => { if (boxHits(b, p)) c += 1; return false; }); return c; } };
    }
    // Map-style names: a budget that grows with the zoom, filled in priority order
    function budget(cw, ch) {
      const kFit = fitTransform(true).k;
      return Math.max(8, Math.round(((cw * ch) / 17000) * Math.pow(T.k / kFit, 2)));
    }
    // the page's own buttons and readout, as boxes in the map's screen space: names keep off them
    function avoidBoxes() {
      if (!opts.avoid) return [];
      const b = canvas.getBoundingClientRect();
      return opts.avoid().map((r) => [r.left - b.left - 2, r.top - b.top - 2, r.right - b.left + 2, r.bottom - b.top + 2]);
    }
    let placedAt = 0, needPlace = false;   // when names were last placed; whether they're due again
    // Asking only marks the names: they're placed once, just before the next frame is drawn.
    function layoutLabels() { needPlace = true; invalidate(); }
    function placeNames() {
      placedAt = performance.now();
      needPlace = false;
      if (!named) return;
      const k = T.k, [cw, ch] = stageSize();
      const shownN = nodes.filter((n) => n.h <= curH && drawn.has(n.id));
      const spheres = grid();
      shownN.forEach((n) => {
        const cx = T.applyX(n.x), cy = T.applyY(n.y), cr = n.r * S * k + 3;
        spheres.add({ cx, cy, cr, n }, [cx - cr, cy - cr, cx + cr, cy + cr]);
      });
      const gap = 4, placed = boxes();
      avoidBoxes().forEach((b) => placed.add(b));
      const sphereCost = (b, self) => {
        let hits = 0;
        const pov = spheres.near(b, (s) => {
          if (s.n === self || !circleHits(b, s.cx, s.cy, s.cr)) return false;
          if (P.isPov(s.n.id, curH)) return true;
          hits += 1;
          return false;
        });
        return pov ? Infinity : hits;
      };
      placePathLabels(placed);
      placeTerrNames(placed, spheres, cw);
      nodes.forEach((n) => { n.lab = null; });
      const now = nowPov();
      const castNow = cast();
      const lit = lightSet();   // under a lens, the budget fills from lit names only
      const order = castNow ? shownN.slice().sort((a, b) => rankCast(b) - rankCast(a)) : shownN.slice().sort((a, b) => rankEvery(b, now) - rankEvery(a, now));
      const B = castNow ? budget(cw, ch) : Infinity;
      let count = 0;
      for (const n of order) {
        const forced = pinned.has(n.id);
        if (!forced && !soft.has(n.id) && count >= B) break;
        if (lit && !forced && !lit.has(n.id)) continue;
        if (castNow && terrOf.has(n.id) && state.selected !== n) continue;   // the territory carries the group's name
        const want = forced || castNow || (opts.labels === "pov" ? P.isPov(n.id, curH) : opts.labels === "major" ? major(n) : true);
        if (!want) continue;
        const sx = T.applyX(n.x), sy = T.applyY(n.y), r = n.r * S * k;
        const full = subs.get(n.id);
        const important = forced || now.has(n.id) || P.isPov(n.id, curH) || n.degree >= 4;
        // the spots around the sphere for a box w × hh, in preference order
        const spots = (st, only) => {
          const w = Math.max(n.tw || n.e.name.length * LABEL_PX * 0.55, st ? st[0].length * SUB_PX * (castNow ? 0.6 : 0.52) : 0);
          const hh = LABEL_PX * 1.15 + (st ? SUB_PX * 1.3 : 0);
          const mid = sy - LABEL_PX * 0.575;   // the name's line sits level with the sphere
          const d = r * 0.72;   // the diagonal spots tuck in at the sphere's shoulders
          const cands = {
            r: { k: "r", x0: sx + r + gap, y0: mid },
            l: { k: "l", x0: sx - r - gap - w, y0: mid },
            b: { k: "b", x0: sx - w / 2, y0: sy + r + 1 },
            t: { k: "t", x0: sx - w / 2, y0: sy - r - 1 - hh },
            tr: { k: "tr", x0: sx + d + 1, y0: sy - d - hh + 2 },
            tl: { k: "tl", x0: sx - d - 1 - w, y0: sy - d - hh + 2 },
            br: { k: "br", x0: sx + d + 1, y0: sy + d - 2 },
            bl: { k: "bl", x0: sx - d - 1 - w, y0: sy + d - 2 },
          };
          const base = n.flip ? ["l", "r", "tl", "tr", "b", "t", "bl", "br"] : ["r", "l", "tr", "tl", "b", "t", "br", "bl"];
          const ord = n.pref ? [n.pref, ...base.filter((x) => x !== n.pref)] : base;
          // in The Cast a ring name may also stand a little further out, its own side first
          if (castNow && forced) {
            const far = { r: [16, 0], l: [-16, 0], t: [0, -14], b: [0, 14] };
            const sides = n.pref && far[n.pref] ? [n.pref, ...Object.keys(far).filter((x) => x !== n.pref)] : Object.keys(far);
            sides.forEach((x) => { cands[`${x}2`] = { k: x, x0: cands[x].x0 + far[x][0], y0: cands[x].y0 + far[x][1] }; ord.push(`${x}2`); });
          }
          // how many spheres a spot would cover (Infinity if it's off screen, over a name, or over a lit sphere)
          const cost = (c) => {
            const b = [c.x0 - 1, c.y0, c.x0 + w + 1, c.y0 + hh];
            if (b[0] < 2 || b[2] > cw - 2 || placed.hits(b)) return Infinity;
            if (castNow && (b[1] < 2 || b[3] > ch - 2)) return Infinity;
            return sphereCost(b, n);
          };
          if (only) ord.splice(0, ord.length, ...ord.filter((o) => only.includes(o)));
          const costs = ord.map((o) => cost(cands[o]));
          const best = Math.min(...costs);
          // a clear spot if there is one; important names may sit over a sphere or two
          const pick = best === 0 || (important && best <= 2) ? cands[ord[costs.indexOf(best)]] : null;
          return { pick, w, hh, st, cands, ord };
        };
        // A ring name must show, and in The Cast it points outward: on its own side with its tie
        // beneath, else on its own side without the tie (the card lists it), else anywhere with
        // the tie, else anywhere without; failing all that, the bare name takes the spot that's
        // least in the way: on screen first, then over the fewest names, then spheres. Everything
        // keeps its first choice.
        const own = castNow && forced && n.pref ? [n.pref, `${n.pref}2`] : null;
        let s = own ? spots(full, own) : spots(full);
        if (own && !s.pick && full) s = spots(null, own);
        if (own && !s.pick) s = spots(full);
        if (!s.pick && forced && castNow) {
          const bare = full ? spots(null) : null;
          if (bare) s = bare;
          if (!s.pick) {
            const worse = (c) => {
              const b = [c.x0 - 1, c.y0, c.x0 + s.w + 1, c.y0 + s.hh];
              const off = Math.max(0, 2 - b[0]) + Math.max(0, b[2] - (cw - 2)) + Math.max(0, -b[1]) + Math.max(0, b[3] - ch);
              return off * 100 + placed.count(b) * 40 + Math.min(sphereCost(b, n), 20);
            };
            const ws = s.ord.map((o) => worse(s.cands[o]));
            s.pick = s.cands[s.ord[ws.indexOf(Math.min(...ws))]];
          }
        }
        if (!s.pick && forced) s.pick = s.cands[s.ord[0]];
        if (!s.pick) continue;
        const { pick, w, hh } = s;
        const a = /r$/.test(pick.k) ? "start" : /l$/.test(pick.k) ? "end" : "middle";
        const xs = a === "start" ? pick.x0 : a === "end" ? pick.x0 + w : pick.x0 + w / 2;
        // kept as offsets from the sphere on screen, so the name rides along while the map moves
        n.lab = { a, dx: xs - sx, dy: pick.y0 + LABEL_PX * 0.86 - sy, st: s.st };
        placed.add([pick.x0 - 2, pick.y0, pick.x0 + w + 2, pick.y0 + hh]);
        count += 1;
      }
      nodes.forEach((n) => {
        if (n.lab) { n.shownLab = n.lab; n.la.set(1); } else n.la.set(0);
      });
    }
    // A traced path's ties carry their labels at their midpoints; names keep clear of them.
    function placePathLabels(placed) {
      pathTies.forEach((l) => {
        const x = (l.source.x + l.target.x) / 2, y = (l.source.y + l.target.y) / 2;
        const sx = T.applyX(x), sy = T.applyY(y), w = l.label.length * SUB_PX * 0.56, hh = SUB_PX * 1.3;
        placed.add([sx - w / 2 - 2, sy - hh / 2, sx + w / 2 + 2, sy + hh / 2]);
      });
    }
    // A territory's name tries above its region, then below, then left and right, a little
    // further out each round, and takes the first spot that covers no sphere and no name.
    function placeTerrNames(placed, spheres, cw) {
      if (!page) return;
      const hh = TERR_PX * 1.25;
      const order = terrs.filter((t) => t.path).sort((a, b) => (a.area || 0) - (b.area || 0));
      terrs.forEach((t) => { t.lab = null; });
      for (const t of order) {
        const sp = t.pts.map(([x, y]) => [T.applyX(x), T.applyY(y)]);
        const xs = sp.map((p) => p[0]), ys = sp.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const top = sp[ys.indexOf(y0)], bot = sp[ys.indexOf(y1)];
        const w = t.tw + 4;
        let pick = null;
        for (let step = 0; step < 4 && !pick; step++) {
          const o = step * 10;
          const cands = [
            [top[0] - w / 2, y0 - hh - 2 - o], [bot[0] - w / 2, y1 + 2 + o],
            [x0 - w - 4 - o, (y0 + y1) / 2 - hh / 2], [x1 + 4 + o, (y0 + y1) / 2 - hh / 2],
          ];
          for (const [bx, by] of cands) {
            const b = [bx, by, bx + w, by + hh];
            if (b[0] < 2 || b[2] > cw - 2 || placed.hits(b)) continue;
            if (!spheres.near(b, (s) => circleHits(b, s.cx, s.cy, s.cr))) { pick = b; break; }
          }
        }
        if (!pick) continue;   // nowhere clear: better no name than one over a sphere
        // kept in layout units, so the name stays with its region while the map moves
        t.lab = [T.invertX((pick[0] + pick[2]) / 2), T.invertY(pick[1] + TERR_PX * 0.95)];
        placed.add(pick);
      }
    }

    // ------------------------------------------------------------ zoom: spreads, never inflates
    const sizeFor = (k) => (k < BOOST_AT ? Math.min(BOOST_MAX, BOOST_AT / k) : k > CAP ? CAP / k : 1);
    // gesture: a pinch, a scroll or a glide of the camera is under way, so names ride along and
    // are placed afresh only every so often; they're placed properly when it ends
    function applyZoom(t, gesture) {
      T = t;
      const s = sizeFor(t.k);
      if (Math.abs(s - S) / S > 0.01) S = s;
      renderTerrs({ zooming: true });
      if (!gesture || performance.now() - placedAt >= REPLACE_MS) layoutLabels();
      else invalidate();
    }
    // Fit everyone in the view: on Everything, everyone; in The Cast, everyone its layers hold.
    // { base: true } fits the resting map, ignoring a focus ring.
    function fitTransform(base) {
      const [cw, ch] = stageSize();
      const ns = page ? nodes.filter((n) => inView(n)) : nodes;
      if (!ns.length) return d3.zoomIdentity;
      const xs = ns.map((n) => (base ? n.bx : n.x)), ys = ns.map((n) => (base ? n.by : n.y));
      const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 22, y1 = Math.max(...ys) + 22;
      const k = Math.min((cw - pad.left - pad.right) / (x1 - x0), (ch - pad.top - pad.bottom) / (y1 - y0), 2.2);
      const tx = pad.left + (cw - pad.left - pad.right - (x1 - x0) * k) / 2 - x0 * k;
      const ty = pad.top + (ch - pad.top - pad.bottom - (y1 - y0) * k) / 2 - y0 * k;
      return d3.zoomIdentity.translate(tx, ty).scale(k);
    }
    // Fit a few names (a lens's lit names, a path) where they sit at rest: inside the page's
    // margins and the focus box, with 60 px more on the right for their names.
    function fitNodes(ns) {
      const [cw, ch] = stageSize(), fb = box();
      const L = Math.max(pad.left, fb.x), Tp = Math.max(pad.top, fb.y);
      const R = Math.min(cw - pad.right, fb.x + fb.w) - 60, Bt = Math.min(ch - pad.bottom, fb.y + fb.h);
      const xs = ns.map((n) => n.bx), ys = ns.map((n) => n.by);
      const x0 = Math.min(...xs) - 24, x1 = Math.max(...xs) + 24, y0 = Math.min(...ys) - 22, y1 = Math.max(...ys) + 36;
      const k = Math.max(0.25, Math.min((R - L) / (x1 - x0), (Bt - Tp) / (y1 - y0), 1.8));
      return d3.zoomIdentity.translate(L + (R - L - (x1 - x0) * k) / 2 - x0 * k, Tp + (Bt - Tp - (y1 - y0) * k) / 2 - y0 * k).scale(k);
    }
    function fitLit(ms) {
      const lit = lightSet();
      const ns = lit ? [...lit].map((id) => byId[id]) : [];
      if (!ns.length || !zoom) return false;
      userMoved = false;
      setT(fitNodes(ns), ms);
      return true;
    }
    const sel$ = d3.select(canvas);
    let zoom = null;
    if (opts.zoom) {
      zoom = d3.zoom().scaleExtent([0.25, 6]).on("zoom", (ev) => {
        applyZoom(ev.transform, true);
        if (ev.sourceEvent) { userMoved = true; hideTip(); }
      }).on("end", () => layoutLabels());
      sel$.call(zoom).on("dblclick.zoom", null);
    }
    function setT(t, ms = 0) {
      if (zoom) {
        const sel = ms && !P.reducedMotion ? sel$.transition("cam").duration(ms).ease(d3.easeCubicInOut) : sel$;
        sel.call(zoom.transform, t);
      } else applyZoom(t);
    }
    // On a small screen the whole web at once is too small to read, so it can open closer in,
    // centred on the names given (the chapter's viewpoints); the fit button shows everything.
    function startTransform() {
      const fit = fitTransform(true), ini = opts.initial;
      if (!ini || fit.k >= ini.k) return fit;
      const focusOnly = (ini.focus || []).map((id) => byId[id]).filter((n) => n && n.h <= lim);
      if (!focusOnly.length) return fit;
      const [bw, bh] = stageSize();
      const fx = focusOnly.reduce((a, n) => a + n.bx, 0) / focusOnly.length, fy = focusOnly.reduce((a, n) => a + n.by, 0) / focusOnly.length;
      return d3.zoomIdentity.translate(bw / 2 - fx * ini.k, (ini.cy || 0.5) * bh - fy * ini.k).scale(ini.k);
    }

    // ------------------------------------------------------------ moving spheres
    let mover = null;
    function moveTo(target, ms) {
      if (mover) mover.stop();
      const from = nodes.map((n) => [n.x, n.y]);
      const to = nodes.map((n) => target.get(n.id) || [n.bx, n.by]);
      if (P.reducedMotion || !ms) {
        nodes.forEach((n, i) => { [n.x, n.y] = to[i]; });
        render(); layoutLabels();
        return;
      }
      mover = d3.timer((el) => {
        const t = Math.min(1, el / ms), e = d3.easeCubicInOut(t);
        nodes.forEach((n, i) => { n.x = from[i][0] + (to[i][0] - from[i][0]) * e; n.y = from[i][1] + (to[i][1] - from[i][1]) * e; });
        render(t < 1);
        layoutLabels();
        if (t === 1) { mover.stop(); mover = null; }
      });
    }
    // spheres grow and shrink with the chapter shown (The Cast) or switch to ties (Everything)
    let grower = null;
    function resize(ms) {
      if (!page) return;
      if (grower) grower.stop();
      const from = nodes.map((n) => n.r);
      const to = nodes.map((n) => (cast() ? castR(n, state.h) : n.rE));
      const done = () => { render(); layoutLabels(); };
      if (P.reducedMotion || !ms) { nodes.forEach((n, i) => { n.r = to[i]; }); done(); return; }
      grower = d3.timer((el) => {
        const t = Math.min(1, el / ms), e = d3.easeCubicOut(t);
        nodes.forEach((n, i) => { n.r = from[i] + (to[i] - from[i]) * e; });
        if (t === 1) { grower.stop(); grower = null; done(); } else render(true);
      });
    }

    // ------------------------------------------------------------ focus: a ring around whoever is picked
    let focus = null, before = null;
    const box = () => {
      const [bw, bh] = stageSize();
      const f = opts.focusBox ? opts.focusBox() : null;
      return f || { x: pad.left, y: pad.top, w: bw - pad.left - pad.right, h: bh - pad.top - pad.bottom };
    };
    function focusLayout(n) {
      const fb = box();
      const k = Math.max(0.75, Math.min(1.35, T.k));
      const near = [...neighbours(n)].filter((id) => id !== n.id).map((id) => byId[id]);
      const N = near.length;
      // an ellipse that fills the free space, leaving room around it for names
      const narrow = fb.w < 560;
      let rx = Math.max(80, Math.min(300, fb.w / 2 - (narrow ? 72 : 140)));
      let ry = Math.max(80, Math.min(260, fb.h / 2 - 46));
      const need = (N * 46) / (2 * Math.PI);   // enough perimeter that neighbours never crowd
      if (Math.min(rx, ry) < need) { rx = Math.max(rx, need); ry = Math.max(ry, need); }
      const RX = rx / k, RY = ry / k;
      // keep everyone's rough bearing: sort by the angle they sat at, then space evenly,
      // turned so the total movement is as small as it can be
      const ang = near.map((m) => Math.atan2(m.by - n.by, m.bx - n.bx));
      const order = near.map((m, i) => i).sort((a, b) => ang[a] - ang[b]);
      const step = (Math.PI * 2) / Math.max(1, N);
      let sx = 0, sy = 0;
      order.forEach((i, j) => { sx += Math.cos(ang[i] - j * step); sy += Math.sin(ang[i] - j * step); });
      const t0 = N ? Math.atan2(sy, sx) : 0;
      const target = new Map();
      target.set(n.id, [n.bx, n.by]);
      nodes.forEach((m) => { m.pref = null; });
      order.forEach((i, j) => {
        const m = near[i], th = t0 + j * step, c = Math.cos(th), s = Math.sin(th);
        target.set(m.id, [n.bx + c * RX, n.by + s * RY]);
        m.pref = Math.abs(c) > 0.5 ? (c > 0 ? "r" : "l") : s > 0 ? "b" : "t";
      });
      n.pref = "t";
      // everyone else inside (or just outside) the ring drifts outward, keeping their bearing
      nodes.forEach((m) => {
        if (target.has(m.id)) return;
        const dx = m.bx - n.bx, dy = m.by - n.by;
        const e = Math.hypot(dx / RX, dy / RY);
        if (e >= 1.5 || e === 0) return;
        const f = (1.5 + e * 0.35) / e;
        target.set(m.id, [n.bx + dx * f, n.by + dy * f]);
      });
      const cam = d3.zoomIdentity.translate(fb.x + fb.w / 2 - n.bx * k, fb.y + fb.h / 2 - n.by * k).scale(k);
      return { target, cam };
    }
    // ---- Ripples (The Cast): people and groups in a ring grouped by kind of tie, and one more step
    let ring2 = new Map();   // second-ring id -> the first-ring people who connect them
    let ring2Count = 0;      // how many one more step would add, on or off
    const stepOn = () => state.step ?? (stageSize()[0] >= 900);
    // the pair's top tie on show, as a place in the merge priority (stated before implied)
    function topTie(n, m) {
      let best = Infinity;
      adj.get(n.id).forEach((l) => {
        if (!shown(l) || !((l.source === n && l.target === m) || (l.source === m && l.target === n))) return;
        best = Math.min(best, PRIORITY.indexOf(l.type) + (faint(l) ? PRIORITY.length : 0));
      });
      return best;
    }
    // drawn at rest: met by the chapter, in the view and in the tier on Show
    const atRest = (m) => m.h <= state.h && inView(m) && (!tierSet || tierSet.has(m.id));
    function secondRing(n, ring1) {
      const out = new Map();
      links.forEach((l) => {
        if (!shown(l)) return;
        [[l.source, l.target], [l.target, l.source]].forEach(([a, b]) => {
          if (!ring1.has(a.id) || ring1.has(b.id) || b === n || !ALWAYS.has(b.layer) || !atRest(b)) return;
          if (!out.has(b.id)) out.set(b.id, new Set());
          out.get(b.id).add(a);
        });
      });
      return out;
    }
    // outward from the ring: right half right, left half left, near the top or bottom above or below
    const outward = (c, s) => (Math.abs(c) < 0.38 ? (s < 0 ? "t" : "b") : c > 0 ? "r" : "l");
    function rippleLayout(n) {
      const fb = box();
      const near = ringOf(n).filter((m) => m !== n);
      near.forEach((m) => { m.tie = topTie(n, m); });
      near.sort((a, b) => a.tie - b.tie || (b.score ?? 0) - (a.score ?? 0) || a.e.name.localeCompare(b.e.name));
      const all = secondRing(n, new Set(near.map((m) => m.id)));
      ring2Count = all.size;
      ring2 = stepOn() ? all : new Map();
      const N = near.length, need = Math.max(100, (N * 40) / (2 * Math.PI));
      // a tall stage keeps 120 px above and below for the second ring and its names; with no
      // second ring out, 56 px is room enough for a name and its tie
      let rx, ry;
      if (fb.h >= fb.w) { rx = Math.min(fb.w / 2 - 92, need); ry = Math.max(rx * 1.35, Math.min(fb.h / 2 - (ring2.size ? 120 : 56), 230)); }
      else { ry = Math.min(fb.h / 2 - 92, need); rx = Math.max(ry * 1.35, Math.min(fb.w / 2 - 120, 230)); }
      const target = new Map([[n.id, [n.bx, n.by]]]);
      nodes.forEach((m) => { m.pref = null; m.half = false; });
      n.pref = "t";
      const th = new Map();
      near.forEach((m, j) => {
        const a = -Math.PI / 2 + ((j + 0.5) / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        th.set(m.id, a);
        target.set(m.id, [n.bx + c * rx, n.by + s * ry]);
        m.pref = outward(c, s);
      });
      // one more step: at the circular mean of the people who connect them, nudged apart
      const two = [...ring2].map(([id, via]) => {
        let sx = 0, sy = 0;
        via.forEach((m) => { sx += Math.cos(th.get(m.id)); sy += Math.sin(th.get(m.id)); });
        return { m: byId[id], a: Math.atan2(sy, sx) };
      }).sort((p, q) => p.a - q.a || p.m.e.name.localeCompare(q.m.e.name));
      const gap = (Math.PI * 2) / Math.max(two.length, 26);
      for (let pass = 0; pass < 30 && two.length > 1; pass++) {
        let moved = false;
        two.forEach((p, i) => {
          const q = two[(i + 1) % two.length];
          let d = q.a - p.a;
          if (i === two.length - 1) d += Math.PI * 2;
          if (d >= gap - 1e-6) return;
          const push = (gap - d) / 2;
          p.a -= push; q.a += push; moved = true;
        });
        if (!moved) break;
      }
      const RX2 = rx + RIPPLE.gap2, RY2 = ry + RIPPLE.gap2;
      two.forEach(({ m, a }) => {
        const c = Math.cos(a), s = Math.sin(a);
        target.set(m.id, [n.bx + c * RX2, n.by + s * RY2]);
        m.pref = outward(c, s);
        m.half = true;
      });
      soft = new Set(ring2.keys());
      // everyone else within 1.5 ring-radii drifts outward, keeping their bearing (past the
      // second ring when it's out)
      const reach = two.length ? Math.max(1.5, (Math.min(rx, ry) + RIPPLE.gap2 + 30) / Math.min(rx, ry)) : 1.5;
      nodes.forEach((m) => {
        if (target.has(m.id)) return;
        const dx = m.bx - n.bx, dy = m.by - n.by;
        const e = Math.hypot(dx / rx, dy / ry);
        if (e >= reach || e === 0) return;
        const f = (reach + e * 0.35) / e;
        target.set(m.id, [n.bx + dx * f, n.by + dy * f]);
      });
      // at k = 1 while focused, so names sit at their designed size
      const cam = d3.zoomIdentity.translate(fb.x + fb.w / 2 - n.bx, fb.y + fb.h / 2 - n.by);
      return { target, cam };
    }
    function tieSubs(n) {
      subs.clear();
      const cut = cast() ? 30 : 34;
      adj.get(n.id).forEach((l) => {
        if (!shown(l)) return;
        const o = l.source.id === n.id ? l.target : l.source;
        if (!inView(o)) return;
        const cur = subs.get(o.id);
        const text = cur ? `${cur[0]} · ${l.label}` : l.label;
        subs.set(o.id, [text.length > cut ? `${text.slice(0, cut - 1).trim()}…` : text, cur ? cur[1] : TINT[l.type]]);
      });
    }
    function enterFocus(n, ms = FOCUS_MS) {
      if (!focus) before = T;   // the view to come back to
      focus = n;
      tieSubs(n);
      ring2 = new Map(); soft = new Set();
      nodes.forEach((m) => { m.half = false; });
      const { target, cam } = cast() ? rippleLayout(n) : focusLayout(n);
      refresh();
      paintHalf();
      moveTo(target, ms);
      if (zoom) setT(cam, ms);
      if (opts.onRing) opts.onRing();
    }
    function leaveFocus() {
      if (!focus) return;
      focus = null;
      subs.clear();
      ring2 = new Map(); soft = new Set();
      nodes.forEach((m) => { m.pref = null; m.half = false; });
      refresh();
      paintHalf();
      moveTo(new Map(), FOCUS_MS);
      if (before && zoom) setT(before, FOCUS_MS);
      before = null;
      if (opts.onRing) opts.onRing();
    }
    // the second ring's spheres are drawn at half size
    function paintHalf() { nodes.forEach((n) => n.hs.set(n.half ? 0.5 : 1)); }

    if (window.ResizeObserver) {
      let last = `${box0.width}x${box0.height}`;
      new ResizeObserver(() => {
        const b = canvas.getBoundingClientRect(), key = `${Math.round(b.width)}x${Math.round(b.height)}`;
        if (key === last || !b.width) return;
        last = key;
        fitCanvas();
        invalidate();
        if (focus) enterFocus(focus, 0);
        else if (!userMoved && nodes.length && !fitLit(0)) setT(startTransform());
      }).observe(canvas);
    }

    // ------------------------------------------------------------ interaction
    const tip = opts.tip;
    // everyone tied to n on the map shown: in the view, met by the chapter, through a tie on show
    const neighbours = (n) => {
      const set = new Set([n.id]);
      adj.get(n.id).forEach((l) => {
        if (!shown(l)) return;
        if (l.source.id === n.id && inView(l.target)) set.add(l.target.id);
        if (l.target.id === n.id && inView(l.source)) set.add(l.source.id);
      });
      return set;
    };
    // whoever joins n's ring: in The Cast only people and groups (the card lists the rest)
    const ringOf = (n) => [...neighbours(n)].map((id) => byId[id]).filter((m) => !cast() || ALWAYS.has(m.layer));
    // How everything is lit: a ring around n (picked, or hovered), else a lens or a path, else all.
    function focusOn(n) {
      const near = n ? new Set(ringOf(n).map((m) => m.id)) : null;
      pinned = near || (state.path ? new Set(state.path.ids) : new Set());
      layoutLabels();
      const lit = n ? null : lightSet();
      const ripples = n && n === focus && cast();
      const rest = ripples ? RIPPLE.rest : 0.14;
      const two = (d) => ripples && ring2.has(d.id);
      nodes.forEach((d) => {
        d.alpha = near ? (near.has(d.id) ? 1 : two(d) ? RIPPLE.node2 : rest) : lit && !lit.has(d.id) ? FADE.node : 1;
        d.lg = near ? (near.has(d.id) ? 1 : two(d) ? RIPPLE.name2 : rest) : 1;
      });
      const touches = (l) => !!n && (l.source.id === n.id || l.target.id === n.id);
      // a second-ring name's ties to the first-ring people who connect them
      const reach2 = (l) => ripples && ((ring2.has(l.source.id) && ring2.get(l.source.id).has(l.target)) || (ring2.has(l.target.id) && ring2.get(l.target.id).has(l.source)));
      const onPath = (l) => !!state.path && state.path.keys.has(l.key);
      link.forEach((l) => {
        let o;
        if (n) o = touches(l) ? 1 : reach2(l) ? RIPPLE.tie2 : 0.05;
        else if (onPath(l)) o = 0;   // drawn by the path's own lines
        else if (!lit) o = 1;
        else { const ends = lit.has(l.source.id) + lit.has(l.target.id); o = ends === 2 ? 1 : ends === 1 ? FADE.out : FADE.none; }
        l.op.set(o);
        l.hot = touches(l);
        l.fl.set(l.hot ? 1 : 0);
      });
      const terrLit = (t) => lit.has(t.g.id) || terrMembers(t).filter((m) => drawn.has(m.id)).every((m) => lit.has(m.id));
      terrs.forEach((t) => t.op.set(n ? (near.has(t.g.id) ? 1 : 0.15) : lit && !terrLit(t) ? FADE.terr : 1));
      // a people has no territory: a lens on it gives its lit members a thin gold ring
      const belongs = !n && state.lens && state.lens.ring;
      nodes.forEach((d) => { d.belongs = !!belongs && belongs.has(d.id) && lit.has(d.id); });
      invalidate();
    }
    function showTip(evt, html) {
      if (!tip) return;
      const b = canvas.getBoundingClientRect();
      tip.innerHTML = html;
      const w = tip.offsetWidth || 260;
      tip.style.left = `${Math.max(8, Math.min(evt.clientX - b.left + 14, b.width - w - 8))}px`;
      tip.style.top = `${evt.clientY - b.top + 16}px`;
      tip.classList.add("on");
    }
    const hideTip = () => tip && tip.classList.remove("on");
    const tieLine = (l) => {
      const u = P.unitById[l.cite], note = P.basisNote(l, { long: true });
      const who = !note || faint(l) ? "" : l.basis === "said" ? `, ${note}` : ` (${note})`;
      return `<strong>${P.esc(l.label)}</strong>${who}<br><span class="muted">${P.esc(P.TYPES[l.type].label)}, ${faint(l) ? note : P.esc(P.unitLabel(u, { short: true }))}</span>`;
    };

    // ---- what's under a point on the canvas (screen px)
    // a sphere: within its own radius, or within 22 px of its centre on a touch screen
    function nodeAt(x, y, touch) {
      const reach = touch ? 22 : 6;
      const qt = d3.quadtree().x((n) => T.applyX(n.x)).y((n) => T.applyY(n.y))
        .addAll(nodes.filter((n) => drawn.has(n.id) && n.h <= state.h));
      let best = null, bestD = Infinity, R = reach;
      qt.data().forEach((n) => { R = Math.max(R, n.r * S * T.k); });
      qt.visit((q, x0, y0, x1, y1) => {
        if (!q.length) {
          for (let d = q; d; d = d.next) {
            const n = d.data, rs = n.r * S * T.k * (n.half ? 0.5 : 1);
            const dd = Math.hypot(T.applyX(n.x) - x, T.applyY(n.y) - y);
            if (dd <= Math.max(rs, reach) && dd - rs < bestD) { best = n; bestD = dd - rs; }
          }
        }
        return x0 > x + R || x1 < x - R || y0 > y + R || y1 < y - R;
      });
      return best;
    }
    // a line, for the hover tip: within 7 px of it (at this zoom), the nearest
    function lineAt(x, y) {
      const lx = T.invertX(x), ly = T.invertY(y), reach = 7 * S;   // half the old 14 px hit line
      let best = null, bestD = reach;
      link.forEach((l) => {
        if (!l.vis || l.op.to < 0.5) return;
        const [sx, sy, cx, cy, tx, ty] = geom(l);
        if (lx < Math.min(sx, tx, cx ?? sx) - reach || lx > Math.max(sx, tx, cx ?? sx) + reach || ly < Math.min(sy, ty, cy ?? sy) - reach || ly > Math.max(sy, ty, cy ?? sy) + reach) return;
        let d;
        if (cx === null) d = segDist(lx, ly, sx, sy, tx, ty);
        else {
          d = Infinity;
          let px = sx, py = sy;
          for (let i = 1; i <= 12; i++) {
            const t = i / 12, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
            const qx = a * sx + b * cx + c * tx, qy = a * sy + b * cy + c * ty;
            d = Math.min(d, segDist(lx, ly, px, py, qx, qy));
            px = qx; py = qy;
          }
        }
        if (d < bestD) { best = l; bestD = d; }
      });
      return best;
    }
    const hitCtx = document.createElement("canvas").getContext("2d");
    function terrAt(x, y) {
      if (!cast()) return null;
      const lx = T.invertX(x), ly = T.invertY(y);
      for (let i = terrOrder.length - 1; i >= 0; i--) {
        const t = terrOrder[i];
        if (t.path && t.op.to > 0.5 && hitCtx.isPointInPath(t.path, lx, ly, "evenodd")) return t;
      }
      return null;
    }
    const hoverable = matchMedia("(hover: hover)").matches;
    let kb = null;   // the name whose button has the keyboard's focus
    let list = null;
    const buttons = new Map();
    if (opts.interactive) {
      let hoverN = null, hoverL = null, touch = false;
      canvas.addEventListener("pointerdown", (ev) => { touch = ev.pointerType !== "mouse"; });
      if (hoverable) {
        canvas.addEventListener("pointermove", (ev) => {
          if (ev.pointerType !== "mouse" || ev.buttons) return;
          const n = nodeAt(ev.offsetX, ev.offsetY, false);
          const l = n ? null : lineAt(ev.offsetX, ev.offsetY);
          if (n !== hoverN) {
            if (hoverN) { if (!focus) focusOn(state.selected); hideTip(); }
            hoverN = n;
            if (n) {
              if (!focus) focusOn(n);
              const summary = P.summaryOf(n.e, state.h).replace(/<[^>]+>/g, "");
              showTip(ev, `<strong>${P.esc(n.e.name)}</strong>${summary ? `<br><span class="muted">${P.esc(summary)}</span>` : ""}`);
            }
          }
          if (l !== hoverL) {
            hoverL = l;
            if (!l) { if (!n) hideTip(); }
            else if (cast()) {   // a pair's line lists every tie between them
              const ties = l.ties.filter((x) => x.on <= state.h);
              showTip(ev, `${P.esc(byId[l.a].e.name)} · ${P.esc(byId[l.b].e.name)}<br>${ties.map(tieLine).join("<br>")}`);
            } else showTip(ev, `${P.esc(l.source.e.name)} → ${P.esc(l.target.e.name)}<br>${tieLine(l)}`);
          }
          canvas.style.cursor = n || terrAt(ev.offsetX, ev.offsetY) ? "pointer" : "";
        });
        canvas.addEventListener("pointerleave", () => {
          if (hoverN && !focus) focusOn(state.selected);
          hoverN = null; hoverL = null; hideTip();
        });
      }
      canvas.addEventListener("click", (ev) => {
        const n = nodeAt(ev.offsetX, ev.offsetY, touch);
        if (n) { api.select(n.id); return; }
        // a tap inside a territory, off any sphere, picks the group
        const t = terrAt(ev.offsetX, ev.offsetY);
        if (t) { api.select(t.g.id); return; }
        if (lineAt(ev.offsetX, ev.offsetY)) return;
        api.select(null);
      });
      // a button for each name drawn, A to Z, for keyboards and screen readers
      list = document.createElement("div");
      list.className = "visually-hidden web-names";
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", "Names on the map, A to Z");
      nodes.slice().sort((a, b) => plain(a).localeCompare(plain(b))).forEach((n) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = n.e.name;
        b.dataset.id = n.id;
        b.addEventListener("click", () => api.select(n.id));
        b.addEventListener("focus", () => { kb = n; invalidate(); });
        b.addEventListener("blur", () => { if (kb === n) { kb = null; invalidate(); } });
        buttons.set(n.id, b);
        list.append(b);
      });
      canvas.after(list);
      if (!canvas.getAttribute("role")) canvas.setAttribute("role", "img");
    }

    // ------------------------------------------------------------ Show and Rank by
    // Score at the chapter shown: how often the book has named them (the default), or their
    // stated ties in this view. Ranked by score, then who we met first, then name. The tiers
    // are fixed shares of everyone on the map, the same for all.
    let tierSet = null;
    function tieScore(n) {
      let s = 0;
      adj.get(n.id).forEach((l) => {
        if (faint(l) || l.member || l.on > state.h) return;
        if (l.source === n && inView(l.target)) s += 1;
        else if (l.target === n && inView(l.source)) s += 1;
      });
      return s;
    }
    function rankAll() {
      const list = nodes.filter((n) => n.h <= state.h && inView(n));
      list.forEach((n) => { n.score = state.rankBy === "ties" ? tieScore(n) : P.mentionsAt(n.e, state.h); });
      list.sort((a, b) => b.score - a.score || a.h - b.h || a.e.name.localeCompare(b.e.name));
      nodes.forEach((n) => { n.srank = undefined; });
      list.forEach((n, i) => { n.srank = i; });
      if (state.tier === "all") { tierSet = null; return; }
      const N = list.length;
      const lead = Math.max(5, Math.ceil(N * 0.1));
      const top = state.tier === "leading" ? lead : lead + Math.ceil(N * 0.3);
      tierSet = new Set(list.slice(0, top).map((n) => n.id));
      list.forEach((n) => { if (P.isPov(n.id, state.h)) tierSet.add(n.id); });
    }

    // ------------------------------------------------------------ what's drawn
    // On the map: met by the chapter shown, in the view, in the tier on Show. Whoever is picked
    // and everyone tied to them are always drawn, whatever the tier.
    function refresh() {
      const sel = state.selected;
      const ring = new Set(sel ? ringOf(sel).map((m) => m.id) : state.path ? state.path.ids : []);
      drawn = new Set(nodes.filter((n) => atRest(n) || (ring.has(n.id) && n.h <= state.h)).map((n) => n.id));
      const both = (l) => drawn.has(l.source.id) && drawn.has(l.target.id);
      terrOf.clear();
      if (page && cast()) {
        terrs.forEach((t) => { if (t.g.h <= state.h && drawn.has(t.g.id) && terrMembers(t).length >= 2) terrOf.add(t.g.id); });
      }
      if (page) {
        restyleCast();
        castPairs.forEach((p) => { p.vis = cast() && !!p.tie && both(p); });
        links.forEach((l) => { l.vis = !cast() && shown(l) && both(l); });
      } else links.forEach((l) => { l.vis = shown(l); });
      buttons.forEach((b, id) => {   // touched only where they change, so the page isn't restyled for nothing
        const hide = !drawn.has(id) || byId[id].h > state.h, on = state.selected === byId[id];
        if (b.hidden !== hide) b.hidden = hide;
        if (b.pressed !== on) { b.pressed = on; b.setAttribute("aria-pressed", String(on)); }
      });
      render();
    }
    function apply(prevH, sweepMs) {
      curH = state.h;
      rankAll();
      nodes.forEach((n) => { n.lit = P.isPov(n.id, state.h); });
      if (state.selected && state.selected.h > state.h) { state.selected = null; if (opts.onSelect) opts.onSelect(null); if (focus) leaveFocus(); }
      refresh();
      if (prevH !== undefined) resize(prevH === state.h ? 0 : GROW_MS);
      if (prevH !== undefined && prevH < state.h && !P.reducedMotion) {
        const cw = stageSize()[0], t0 = performance.now();
        const delay = (n) => (sweepMs ? Math.max(0, Math.min(1, T.applyX(n.x) / cw)) * sweepMs * 0.9 : 0);
        nodes.forEach((n) => { if (n.h > prevH && n.h <= state.h) n.inf = t0 + delay(n); });
        link.forEach((l) => { if (l.on > prevH && l.on <= state.h) l.drawT = t0 + Math.max(delay(l.source), delay(l.target)) + 250; });
      }
      if (focus && opts.focusMode) enterFocus(focus, 400);   // the ring follows the chapter
      focusOn(state.selected);
    }
    // ------------------------------------------------------------ trace a path
    // Every tie at the chapter shown counts, hidden layers and member rows included. Stated ties
    // first; implied family ties only when nothing stated joins the two. Breadth-first, visiting
    // neighbours in alphabetical order, so path 1 is always the same one.
    const plainName = (id) => plain(byId[id]);
    const byName = (a, b) => plainName(a).localeCompare(plainName(b)) || (a < b ? -1 : 1);
    function tracePaths(a, b, max = 20) {
      const run = (withImplied) => {
        const adjT = new Map();
        const add = (x, y, l) => {
          if (!adjT.has(x)) adjT.set(x, new Map());
          const m = adjT.get(x);
          if (!m.has(y)) m.set(y, []);
          m.get(y).push(l);
        };
        links.forEach((l) => {
          if (l.on > state.h || (faint(l) && !withImplied)) return;
          add(l.source.id, l.target.id, l); add(l.target.id, l.source.id, l);
        });
        const nbrs = new Map([...adjT].map(([x, m]) => [x, [...m.keys()].sort(byName)]));
        const bfs = (s) => {
          const d = new Map([[s, 0]]), q = [s];
          for (let i = 0; i < q.length; i++) for (const v of nbrs.get(q[i]) || []) if (!d.has(v)) { d.set(v, d.get(q[i]) + 1); q.push(v); }
          return [d, q];
        };
        const [da, order] = bfs(a);
        if (!da.has(b)) return null;
        const [db] = bfs(b);
        const D = da.get(b);
        const onShortest = (v) => da.has(v) && db.has(v) && da.get(v) + db.get(v) === D;
        // how many shortest paths there are, counted layer by layer
        const cnt = new Map([[a, 1]]);
        order.forEach((u) => (nbrs.get(u) || []).forEach((v) => { if (da.get(v) === da.get(u) + 1) cnt.set(v, (cnt.get(v) || 0) + cnt.get(u)); }));
        // the first few, in alphabetical order step by step
        const paths = [];
        const walk = (u, acc) => {
          if (paths.length >= max) return;
          if (u === b) { paths.push(acc.slice()); return; }
          for (const v of nbrs.get(u) || []) if (da.get(v) === da.get(u) + 1 && onShortest(v)) { acc.push(v); walk(v, acc); acc.pop(); }
        };
        walk(a, [a]);
        // each step's tie: stated before implied, then the merge priority
        const tieOf = (x, y) => adjT.get(x).get(y).slice().sort((p, q) => (faint(p) - faint(q)) || PRIORITY.indexOf(p.type) - PRIORITY.indexOf(q.type))[0];
        return { count: cnt.get(b), implied: withImplied, paths: paths.map((ids) => ({ ids, ties: ids.slice(1).map((y, i) => tieOf(ids[i], y)) })) };
      };
      if (!byId[a] || !byId[b] || a === b) return null;
      return run(false) || (opts.implied ? run(true) : null);
    }
    function showPath(p) {
      if (!page) return;
      state.path = p ? { ids: new Set(p.ids), ties: p.ties, keys: new Set(p.ties.map((l) => l.key)) } : null;
      pathTies = p ? p.ties.map((l) => ({ ...l, idx: 0, total: 1, drawT: undefined })) : [];
      pathTies.forEach((l) => { tieLooks(l); l.hot = true; l.vis = true; l.fl.jump(1); });
      refresh();
      focusOn(null);
    }
    // a new view or spacing: everyone glides to their place on the map it uses
    function reshape(o = {}) {
      const name = layoutName();
      if (name !== current) {
        setBase(name);
        if (focus) enterFocus(focus, GLIDE_MS);
        else moveTo(new Map(), GLIDE_MS);
      }
      // the camera follows only if the reader hasn't moved it and nobody is picked
      if (o.refit && !focus && zoom && !userMoved && !fitLit(GLIDE_MS)) setT(startTransform(), GLIDE_MS);
    }

    // ------------------------------------------------------------ drawing
    // Each frame draws the territories and lines (layer A), the glows that pulse (halos, the
    // picked name's turning ring, the light running along their ties), then the spheres and
    // names (layer B). When only the glows move, A and B are kept as pictures and reused.
    let raf = 0, dirty = false, layersStale = true, pulsing = false, onScreen = true;
    let layerA = null, layerB = null;
    function invalidate() { dirty = true; schedule(); }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
    function frame() {
      raf = 0;
      clock = performance.now();
      busy = false;
      if (needTrace) doTrace();
      if (needPlace) placeNames();
      if (dirty) {
        dirty = false;
        layersStale = true;
        clear(ctx);
        drawA(ctx);
        drawGlows(ctx);
        drawB(ctx);
      } else if (pulsing && onScreen) {
        if (layersStale) {
          layerA = layerA || document.createElement("canvas");
          layerB = layerB || document.createElement("canvas");
          [layerA, layerB].forEach((c) => { c.width = canvas.width; c.height = canvas.height; });
          const a = layerA.getContext("2d"), b = layerB.getContext("2d");
          drawA(a); drawB(b);
          layersStale = false;
        }
        clear(ctx);
        ctx.drawImage(layerA, 0, 0);
        drawGlows(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(layerB, 0, 0);
      }
      if (busy) dirty = true;
      if (busy || (pulsing && onScreen)) schedule();
    }
    function clear(c) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height); }
    const inLayout = (c) => c.setTransform(dpr * T.k, 0, 0, dpr * T.k, dpr * T.x, dpr * T.y);
    const onScreenPx = (c) => c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dashOf = (l) => { const d = (P.BASES[l.basis] || {}).dash; return d ? d.split(" ").map(Number) : []; };
    // a tie's own fade-in, when it first goes on the map
    function drawIn(l) {
      if (l.drawT === undefined) return 1;
      const t = (clock - l.drawT) / 1000;
      if (t >= 1) { l.drawT = undefined; return 1; }
      busy = true;
      return t <= 0 ? 0 : EASE_OUT(t);
    }
    function trace2(c, l, G) {
      const [sx, sy, cx, cy, tx, ty] = G;
      c.moveTo(sx, sy);
      if (cx === null) c.lineTo(tx, ty); else c.quadraticCurveTo(cx, cy, tx, ty);
    }
    // end markers, added to the batch's paths: chevrons and bars stroked, dots filled
    function addMarker(strokes, dots, l, G) {
      const [sx, sy, cx, cy, tx, ty] = G;
      const ang = cx === null ? Math.atan2(ty - sy, tx - sx) : Math.atan2(ty - cy, tx - cx);
      const m = (markerSize * width(l) * S) / 12, co = Math.cos(ang) * m, si = Math.sin(ang) * m;
      const at = (x, y) => [tx + x * co - y * si, ty + x * si + y * co];
      if (l.type === "support") { const [x, y] = at(0, 0); dots.moveTo(x + 3 * m, y); dots.arc(x, y, 3 * m, 0, Math.PI * 2); return; }
      const pts = l.type === "command" ? [at(-4, -4), at(3, 0), at(-4, 4)] : [at(0, -5), at(0, 5)];
      strokes.moveTo(...pts[0]);
      pts.slice(1).forEach((q) => strokes.lineTo(...q));
    }
    // lines, batched by look: colour, dash, strength and glow; those wholly off screen are skipped
    function drawLines(c, list) {
      const batches = new Map();
      const [cw, ch] = stageSize(), mg = 40 / T.k;
      const vx0 = T.invertX(0) - mg, vx1 = T.invertX(cw) + mg, vy0 = T.invertY(0) - mg, vy1 = T.invertY(ch) + mg;
      for (const l of list) {
        if (!l.vis) continue;
        const G = geom(l), xa = G[2] === null ? G[0] : G[2], ya = G[3] === null ? G[1] : G[3];
        if (Math.max(G[0], G[4], xa) < vx0 || Math.min(G[0], G[4], xa) > vx1 || Math.max(G[1], G[5], ya) < vy0 || Math.min(G[1], G[5], ya) > vy1) continue;
        const a = Math.round(l.op.now() * drawIn(l) * 50) / 50;
        if (a <= 0) continue;
        const key = `${l.type}|${l.basis}|${a}|${l.hot ? 1 : 0}`;
        let b = batches.get(key);
        if (!b) batches.set(key, b = { l, a, items: [], geoms: [] });
        b.items.push(l);
        b.geoms.push(G);
      }
      for (const b of batches.values()) {
        const l = b.l, hex = P.TYPES[l.type].hex;
        c.save();
        c.strokeStyle = c.fillStyle = hex;
        if (l.hot) { c.shadowColor = hex; c.shadowBlur = 4 * T.k * dpr; }
        c.globalAlpha = b.a * (faint(l) ? 0.5 : 1);
        c.lineWidth = width(l) * S;
        c.lineCap = "round";
        c.setLineDash(dashOf(l));
        c.beginPath();
        b.items.forEach((x, i) => trace2(c, x, b.geoms[i]));
        c.stroke();
        if (marked(l)) {
          const m = (markerSize * width(l) * S) / 12;
          const strokes = new Path2D(), dots = new Path2D();
          b.items.forEach((x, i) => addMarker(strokes, dots, x, b.geoms[i]));
          c.globalAlpha = b.a;
          c.setLineDash([]);
          c.lineCap = "butt";
          if (l.type === "support") c.fill(dots);
          else { c.lineWidth = (l.type === "command" ? 2 : 2.5) * m; c.stroke(strokes); }
        }
        c.restore();
      }
    }
    // the light that runs along the picked name's ties (and a traced path's)
    function drawFlows(c) {
      const off = P.reducedMotion ? 0 : -40 * ((clock / 1400) % 1);
      inLayout(c);
      c.save();
      c.strokeStyle = "#fff";
      c.lineCap = "round";
      c.setLineDash([1, 22]);
      c.lineDashOffset = off;
      for (const l of link.concat(pathTies)) {
        if (!l.vis) continue;
        const a = l.fl.now() * l.op.now();
        if (a <= 0.01) continue;
        if (!P.reducedMotion) pulsing = true;
        c.globalAlpha = a * 0.55;
        c.lineWidth = flowWidth(l) * S;
        c.beginPath();
        trace2(c, l, geom(l));
        c.stroke();
      }
      c.restore();
    }
    function drawA(c) {
      inLayout(c);
      // territories, the largest first
      if (page && cast()) {
        for (const t of terrOrder) {
          const a = t.op.now();
          if (!t.path || a <= 0) continue;
          c.globalAlpha = a;
          c.fillStyle = "rgba(217, 183, 126, 0.07)";
          c.fill(t.path, "evenodd");
          c.setLineDash([3 / T.k, 4 / T.k]);
          c.lineWidth = 1.1 / T.k;
          c.strokeStyle = "rgba(217, 183, 126, 0.42)";
          c.stroke(t.path);
        }
        c.setLineDash([]);
        c.globalAlpha = 1;
        if (namesReady) {
          onScreenPx(c);
          c.lineJoin = "round";
          c.strokeStyle = INK.halo;
          c.fillStyle = INK.terr;
          c.lineWidth = 3;
          for (const t of terrOrder) {
            const a = t.op.now();
            if (!t.lab || a <= 0) continue;
            c.globalAlpha = a;
            const caps = t.caps;
            let x = T.applyX(t.lab[0]) - t.tw / 2;
            const y = T.applyY(t.lab[1]);
            for (const pass of ["stroke", "fill"]) {
              let cx = x;
              caps.forEach((ch) => { c.font = font(ch.px, 700); if (pass === "stroke") c.strokeText(ch.ch, cx, y); else c.fillText(ch.ch, cx, y); cx += ch.w; });
            }
          }
          c.globalAlpha = 1;
          inLayout(c);
        }
      }
      drawLines(c, link);
      if (pathTies.length) drawLines(c, pathTies);
    }
    // halos that breathe on the viewpoints, and the picked name's ring (or a lens's gold ring)
    function drawGlows(c) {
      pulsing = false;
      onScreenPx(c);
      const u = S * T.k, sec = clock / 1000;
      const [cw, ch] = stageSize();
      for (const n of nodes) {
        if (!drawn.has(n.id) || n.h > state.h || n.alpha <= 0) continue;
        const sx = T.applyX(n.x), sy = T.applyY(n.y), far = n.r * 2.6 * BOOST_MAX * u;
        if (sx < -far || sx > cw + far || sy < -far || sy > ch + far) continue;
        if (n.lit && !n.half) {
          let o = 1, sc = 1;
          if (!P.reducedMotion) {
            pulsing = true;
            const p = ((sec + ((n.i * 0.37) % 4.6)) % 4.6) / 4.6;
            const e = EASE_IN_OUT(p < 0.5 ? p * 2 : 2 - p * 2);
            o = 0.35 + 0.4 * e; sc = 0.85 + 0.27 * e;
          }
          const R = n.r * 2.6 * u * sc;
          c.globalAlpha = n.alpha * o;
          c.drawImage(HALO, sx - R, sy - R, R * 2, R * 2);
        }
        const sel = n === state.selected;
        if (sel || n.belongs) {
          c.save();
          c.globalAlpha = n.alpha * (sel ? 1 : 0.9);
          c.strokeStyle = sel ? "#fff" : INK.terr;
          c.lineWidth = (sel ? 1.2 : 1) * u;
          c.setLineDash(sel ? [3 * u, 4 * u] : []);
          const turn = sel && !P.reducedMotion ? (sec / 12) * Math.PI * 2 : 0;
          if (sel && !P.reducedMotion) pulsing = true;
          c.beginPath();
          c.arc(sx, sy, (n.r + 6) * u, turn, turn + Math.PI * 2);
          c.stroke();
          c.restore();
        }
      }
      c.globalAlpha = 1;
      drawFlows(c);
    }
    function drawB(c) {
      onScreenPx(c);
      const u = S * T.k, uq = Math.max(0.1, Math.round(u * 10) / 10), [cw, ch] = stageSize();
      for (const n of nodes) {
        if (!drawn.has(n.id) || n.h > state.h || n.alpha <= 0) continue;
        const far = (n.r + 16) * u * 1.5;
        if (T.applyX(n.x) < -far || T.applyX(n.x) > cw + far || T.applyY(n.y) < -far || T.applyY(n.y) > ch + far) continue;
        let sc = n.hs.now(), flash = 0;
        if (n.inf !== undefined) {   // infusing: grows past its size in a flash of light, then settles
          const t = (clock - n.inf) / 1300;
          if (t >= 1) n.inf = undefined;
          else {
            busy = true;
            if (t <= 0) continue;
            if (t < 0.4) { const e = EASE_SPRING(t / 0.4); sc *= 1.45 * e; flash = e; }
            else { const e = EASE_SPRING((t - 0.4) / 0.6); sc *= 1.45 - 0.45 * e; flash = 1 - e; }
          }
        }
        const rs = n.r * u * sc;
        if (rs <= 0.05) continue;
        const sx = T.applyX(n.x), sy = T.applyY(n.y);
        c.globalAlpha = n.alpha;
        if (flash > 0) {
          const R = rs + 16 * u;
          c.globalAlpha = n.alpha * flash;
          c.drawImage(FLASH, sx - R, sy - R, R * 2, R * 2);
          c.globalAlpha = n.alpha;
        }
        const sel = n === state.selected || n === kb;
        const rb = Math.max(1, Math.round(rs));
        const sp = sprite(`${n.lit ? "lit" : "dull"}${sel ? "-sel" : ""}`, n.square, rb, uq);
        const f = rs / rb, half = sp.half * f;
        c.drawImage(sp.c, sx - half, sy - half, half * 2, half * 2);
      }
      c.globalAlpha = 1;
      if (named && namesReady) drawNames(c);
    }
    function drawNames(c) {
      const [cw, ch] = stageSize();
      c.lineJoin = "round";
      c.strokeStyle = INK.halo;
      for (const n of nodes) {
        if (!drawn.has(n.id) || n.h > state.h) continue;
        const lab = n.lab || n.shownLab;
        const a = n.la.now() * n.lg;
        if (!lab || a <= 0.004) continue;
        const x = T.applyX(n.x) + lab.dx, y = T.applyY(n.y) + lab.dy;
        if (x < -300 || x > cw + 300 || y < -30 || y > ch + 30) continue;
        c.globalAlpha = a;
        c.textAlign = lab.a === "start" ? "left" : lab.a === "end" ? "right" : "center";
        c.font = font(LABEL_PX);
        c.lineWidth = 4;
        c.fillStyle = major(n) ? INK.name : INK.minor;
        c.strokeText(plain(n), x, y);
        c.fillText(plain(n), x, y);
        if (lab.st) {
          c.font = font(SUB_PX, 700);
          c.fillStyle = lab.st[1];
          c.strokeText(lab.st[0], x, y + SUB_PX * 1.3);
          c.fillText(lab.st[0], x, y + SUB_PX * 1.3);
        }
      }
      // a traced path's tie labels, at the middle of each step
      c.globalAlpha = 1;
      c.textAlign = "center";
      c.font = font(SUB_PX, 700);
      c.lineWidth = 3.5;
      pathTies.forEach((l) => {
        const x = T.applyX((l.source.x + l.target.x) / 2), y = T.applyY((l.source.y + l.target.y) / 2) + SUB_PX * 0.36;
        c.fillStyle = TINT[l.type];
        c.strokeText(l.label, x, y);
        c.fillText(l.label, x, y);
      });
      c.textAlign = "left";
    }
    // the teaser rests while it's scrolled out of sight
    if (window.IntersectionObserver) new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; if (onScreen) schedule(); }).observe(canvas);

    const api = {
      nodes, links,
      setHorizon(h, o = {}) { const prev = state.h; state.h = h; apply(prev, o.sweepMs); },
      setTypes(types) { state.types = new Set(types); apply(); },
      setStyles(styles) { state.styles = new Set(styles); apply(); },
      setView(v) {
        if (!page || v === state.view) return;
        state.view = v;
        link = cast() ? castPairs : links;
        if (state.selected && !inView(state.selected)) api.select(null);
        apply();
        resize(GROW_MS);
        reshape({ refit: true });
      },
      setLayers(set) { state.layers = new Set([...set].filter((x) => !ALWAYS.has(x))); apply(); if (focus) enterFocus(focus, 400); },
      setShow(tier) { state.tier = tier; apply(); },
      setRankBy(by) { state.rankBy = by; apply(); },
      setSpacing(sp) { state.spacing[state.view] = sp; reshape({ refit: true }); },
      spacing: () => state.spacing[state.view],
      // A lens: { kind, ids, ring } or null. It changes opacity only. Turning one on fits its lit
      // names; { auto: true } (a new chapter under the same lens) re-fits only if the reader
      // hasn't panned or zoomed since the last fit.
      setLens(l, o = {}) {
        state.lens = l ? { kind: l.kind, ids: new Set(l.ids), ring: l.ring ? new Set(l.ring) : null } : null;
        focusOn(state.selected);
        if (state.lens && !focus && !state.path && (!o.auto || !userMoved)) fitLit(LENS_MS);
      },
      // how many names the lens (or path) lights, of those drawn
      litCount: () => { const s = lightSet(); return s ? s.size : null; },
      trace: (a, b) => tracePaths(a, b),
      // show one path from trace(), or null to let it go; the camera fits it
      showPath(p) {
        if (p && state.selected) api.select(null);
        showPath(p);
        if (p) fitLit(LENS_MS);
      },
      // one more step (Ripples' second ring): the reader's choice lasts for the visit
      setStep(on) { state.step = !!on; if (focus && cast()) { enterFocus(focus, 450); focusOn(state.selected); } },
      step: () => stepOn(),
      // how many names one more step would add around id, in The Cast
      stepCount(id) {
        const n = byId[id];
        if (!n || !cast()) return 0;
        const r1 = ringOf(n).filter((m) => m !== n);
        return secondRing(n, new Set(r1.map((m) => m.id))).size;
      },
      view: () => state.view,
      ring: () => ({ ripples: !!focus && cast(), second: focus && cast() ? ring2Count : 0, on: stepOn() }),
      select(id) {
        const n = id ? byId[id] : null;
        if (n && state.path) showPath(null);
        state.selected = n && n.h <= state.h ? n : null;
        refresh();
        if (opts.onSelect) opts.onSelect(state.selected);   // first, so the focus can see the card's room
        if (opts.focusMode && zoom) { if (state.selected) enterFocus(state.selected); else leaveFocus(); }
        focusOn(state.selected);
      },
      // give the keyboard's focus to a name's button (it stands in for the sphere)
      focusName(id) { const b = buttons.get(id); if (b && !b.hidden) b.focus({ preventScroll: true }); },
      focused: () => focus,
      neighbours: (id) => (byId[id] ? [...neighbours(byId[id])].filter((x) => x !== id) : []),
      // stated ties only: the faint ones are counted on their own
      count: (type) => links.filter((l) => !faint(l) && l.type === type && l.on <= state.h).length,
      countStyle: (style) => links.filter((l) => styleOf(l) === style && l.on <= state.h).length,
      // what's drawn in the current view: names, and stated ties that aren't memberships
      visibleCounts: () => {
        if (!page) return { nodes: nodes.filter((n) => n.h <= state.h).length, links: links.filter((l) => !faint(l) && shown(l)).length };
        return {
          nodes: nodes.filter((n) => drawn.has(n.id) && n.h <= state.h).length,
          links: links.filter((l) => !faint(l) && !l.member && shown(l) && drawn.has(l.source.id) && drawn.has(l.target.id)).length,
        };
      },
      // how many names each layer would add to The Cast at the chapter shown
      layerCounts: () => {
        const c = {};
        nodes.forEach((n) => { if (n.h <= state.h && !ALWAYS.has(n.layer)) c[n.layer] = (c[n.layer] || 0) + 1; });
        return c;
      },
      inView: (id) => !!byId[id] && inView(byId[id]),
      fit() { userMoved = false; setT(fitTransform(), 500); },
      zoomBy(f) { if (zoom) { userMoved = true; sel$.transition("cam").duration(P.reducedMotion ? 0 : 300).call(zoom.scaleBy, f); } },
      reframe() { if (focus) enterFocus(focus, 450); },
      has: (id) => !!byId[id],
      // for the checks in playbooks/unfolding.md: who is drawn where, and each territory's region
      // (a Path2D in layout units, filled even-odd) with the names marked as its members
      debug: () => ({
        T, S, ahead: !!ahead && Object.keys(layouts).every((k) => ahead[k] && nodes.every((n) => ahead[k][n.id])),
        nodes: nodes.filter((n) => drawn.has(n.id) && n.h <= state.h).map((n) => ({ id: n.id, x: n.x, y: n.y, bx: n.bx, by: n.by, r: n.r, label: !!n.lab })),
        terrs: terrs.filter((t) => t.path).map((t) => ({ id: t.g.id, path: t.path, members: [t.g.id, ...t.rows.filter((l) => l.on <= state.h).map((l) => l.source.id)] })),
      }),
    };
    canvas.web = api;   // so the checks in playbooks/unfolding.md can reach it from the page
    fitCanvas();
    if (page) nodes.forEach((n) => { n.r = cast() ? castR(n, lim) : n.rE; });
    apply();
    if (nodes.length) setT(startTransform());
    if (document.fonts) {
      Promise.all([document.fonts.load(font(LABEL_PX)), document.fonts.load(font(SUB_PX, 700))]).catch(() => {}).then(() => {
        namesReady = true;
        measure();
        terrs.forEach((t) => { t.caps = null; smallCaps(t); });
        layoutLabels();
      });
    }
    return api;
  };
})();
