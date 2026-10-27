/* The Unfolding: who is connected to whom, drawn from codex/relations.toml.
   The layout is computed once for everything visible, sized to the box it's drawn in, so
   scrubbing through chapters only lights and dims nodes in place. New nodes "infuse" into
   view, in step with the storm that sweeps each chapter in.

   Reading it at any size:
   - Zoom spreads the web apart. Spheres, lines and names keep a steady size on screen, so
     zooming in opens up room between them rather than inflating them; zoomed far out,
     spheres and lines stop shrinking so they stay visible.
   - Names are placed, not just drawn: each tries right, left, below and above its sphere and
     takes the first spot that covers no other name and no other sphere.
   - Focus: pick someone and everyone tied to them glides into a ring around them, keeping
     roughly the direction they sat in, each labelled with what the tie is. Whatever else
     stood in the way drifts aside. Let go and everything glides home.
   - Ties that follow from the family lines (opts.implied) are drawn thin and faint. They join
     focus rings, but have no say in a sphere's size, its name's priority, or the layout. */
(function () {
  "use strict";
  const CIRCLE_ORDER = ["heralds", "szeth", "kholin", "shattered-plains", "amaram-army", "kaladin-family",
    "caravan", "purelake", "davar", "kharbranth"];
  const LABEL_PX = 12.5;      // on-screen name size
  const SUB_PX = 10.5;        // on-screen size of a tie's label under a name, in focus
  const AREA = 760000;        // layout room, the density that reads well on a desktop
  const BOOST_AT = 0.9;       // zoomed out past this, spheres and lines stop shrinking…
  const BOOST_MAX = 1.8;      // …until they're this much larger than drawn
  const CAP = 1.4;            // zoomed in past this, they stop growing: zoom only spreads
  const FOCUS_MS = 700;
  // lighter tints of the tie colours, for text on the dark sky
  const TINT = { family: "#e3ad4c", command: "#74afff", support: "#4fd1a0", hostile: "#f58e9b", other: "#b3bccb" };

  P.web = function (svgEl, opts = {}) {
    const lim = opts.limit ?? P.limit();
    const ent = P.entityById;
    const faint = (r) => !!(P.BASES[r.basis] || {}).faint;
    const rels = P.data.relations.concat(opts.implied ? P.data.implied || [] : [])
      .filter((r) => r.h <= lim && ent[r.from] && ent[r.to] && ent[r.from].h <= lim && ent[r.to].h <= lim);
    const ids = new Set();
    rels.forEach((r) => { ids.add(r.from); ids.add(r.to); });
    const nodes = [...ids].map((id) => ({ id, e: ent[id], degree: 0 }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    rels.forEach((r) => { if (!faint(r)) { byId[r.from].degree++; byId[r.to].degree++; } });
    nodes.forEach((n) => {
      n.h = n.e.h;
      n.r = 5 + Math.sqrt(n.degree) * 2.6;
      n.square = ["group", "people"].includes(n.e.kind);
      n.circle = n.e.circle || "";
    });

    const pairs = {};
    const links = rels.map((r) => {
      const key = [r.from, r.to].sort().join("|");
      pairs[key] = (pairs[key] ?? -1) + 1;
      return { ...r, source: r.from, target: r.to, idx: pairs[key], key };
    });
    links.forEach((l) => { l.total = pairs[l.key] + 1; });

    // ------------------------------------------------------------ layout, shaped to the box
    // Every screen gets the same room per name, shaped to the box: tall on a phone, wide on a monitor.
    const box0 = svgEl.getBoundingClientRect();
    const aspect = Math.max(0.6, Math.min(1.9, (box0.width || 1000) / (box0.height || 680)));
    const W = Math.sqrt(AREA * aspect), HGT = Math.sqrt(AREA / aspect);
    // clusters ("circles") sit on an ellipse, in an order that keeps related ones adjacent
    const circles = [...new Set(nodes.map((n) => n.circle))]
      .sort((a, b) => ((CIRCLE_ORDER.indexOf(a) + 1) || 99) - ((CIRCLE_ORDER.indexOf(b) + 1) || 99));
    const ring = circles.filter((c) => c);
    const anchor = { "": [W / 2, HGT / 2] };
    ring.forEach((c, i) => {
      const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      anchor[c] = [W / 2 + Math.cos(a) * W * 0.33, HGT / 2 + Math.sin(a) * HGT * 0.32];
    });
    nodes.forEach((n, i) => {
      const [ax, ay] = anchor[n.circle];
      n.x = ax + Math.cos(i * 2.4) * 25;
      n.y = ay + Math.sin(i * 2.4) * 25;
    });
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links.filter((l) => !faint(l))).id((d) => d.id).distance((l) => (l.type === "family" ? 62 : 92)).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("collide", d3.forceCollide((d) => d.r + 22))
      .force("x", d3.forceX((d) => anchor[d.circle][0]).strength(0.13))
      .force("y", d3.forceY((d) => anchor[d.circle][1]).strength(0.13))
      .stop();
    for (let i = 0; i < 420; i++) sim.tick();
    // a tie goes on the map once it's cited and both its ends have been met
    links.forEach((l) => {
      if (typeof l.source === "string") { l.source = byId[l.source]; l.target = byId[l.target]; }   // faint ties sat out the layout
      l.on = Math.max(l.h, l.source.h, l.target.h);
    });
    const width = (l) => (faint(l) ? 1.1 : 2), flowWidth = (l) => (faint(l) ? 1.2 : 2.2);
    // A last pass of collisions alone, wide enough that no two spheres touch even when drawn
    // at their largest. (Nothing is clamped to the box afterwards: the view fits whatever
    // shape the web takes, so spheres are never pushed back on top of each other.)
    const settle = d3.forceSimulation(nodes).force("collide", d3.forceCollide((d) => d.r * BOOST_MAX + 12).iterations(3)).stop();
    for (let i = 0; i < 90; i++) settle.tick();
    nodes.forEach((n) => { n.bx = n.x; n.by = n.y; n.flip = n.bx > W * 0.64; });

    // ------------------------------------------------------------ drawing
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const defs = svg.append("defs");
    const uid = `w${Math.random().toString(36).slice(2, 7)}`;
    const grad = defs.append("radialGradient").attr("id", `${uid}-lit`).attr("cx", "35%").attr("cy", "30%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff");
    grad.append("stop").attr("offset", "45%").attr("stop-color", "#d8ecff");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#6f8fb3");
    const dull = defs.append("radialGradient").attr("id", `${uid}-dull`).attr("cx", "35%").attr("cy", "30%");
    dull.append("stop").attr("offset", "0%").attr("stop-color", "#3a4a5e");
    dull.append("stop").attr("offset", "100%").attr("stop-color", "#18212c");
    const halo = defs.append("radialGradient").attr("id", `${uid}-halo`);
    halo.append("stop").attr("offset", "0%").attr("stop-color", "#d8ecff").attr("stop-opacity", 0.55);
    halo.append("stop").attr("offset", "100%").attr("stop-color", "#d8ecff").attr("stop-opacity", 0);
    const glow = defs.append("filter").attr("id", `${uid}-glow`).attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
    glow.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "b");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "b");
    merge.append("feMergeNode").attr("in", "SourceGraphic");
    // end markers: a second cue beside colour (arrow = command, dot = support, bar = hostility)
    const marker = (id, color, draw) => {
      const m = defs.append("marker").attr("id", `${uid}-${id}`).attr("viewBox", "-6 -6 12 12").attr("refX", 0).attr("refY", 0)
        .attr("markerWidth", 4.5).attr("markerHeight", 4.5).attr("orient", "auto").attr("markerUnits", "strokeWidth");
      draw(m, color);
    };
    marker("command", P.TYPES.command.hex, (m, c) => m.append("path").attr("d", "M-4,-4L3,0L-4,4").attr("fill", "none").attr("stroke", c).attr("stroke-width", 2));
    marker("support", P.TYPES.support.hex, (m, c) => m.append("circle").attr("r", 3).attr("fill", c));
    marker("hostile", P.TYPES.hostile.hex, (m, c) => m.append("path").attr("d", "M0,-5L0,5").attr("stroke", c).attr("stroke-width", 2.5));

    const view = svg.append("g").attr("class", "web-view");
    const gLinks = view.append("g");
    const gNodes = view.append("g");
    const gLabels = view.append("g").attr("class", "web-labels");   // names above every sphere, never under one

    let S = 1;   // how much larger than drawn spheres and lines are, at this zoom
    function linkPath(l) {
      const s = l.source, t = l.target;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      let off = (l.idx - (l.total - 1) / 2) * 20 * S;
      if (s.id > t.id) off = -off; // offsets relative to the pair's canonical direction
      const sx = s.x + ux * (s.r * S + 2), sy = s.y + uy * (s.r * S + 2);
      const end = (l.type === "family" || l.type === "other" ? 2 : 7) * S;
      const tx = t.x - ux * (t.r * S + end), ty = t.y - uy * (t.r * S + end);
      if (!off) return `M${sx},${sy}L${tx},${ty}`;
      return `M${sx},${sy}Q${(sx + tx) / 2 - uy * off},${(sy + ty) / 2 + ux * off} ${tx},${ty}`;
    }

    const link = gLinks.selectAll("g").data(links).join("g").attr("class", "edge").style("color", (l) => P.TYPES[l.type].hex);
    link.append("path").attr("class", "edge-line").attr("fill", "none")
      .attr("stroke", (l) => P.TYPES[l.type].hex).attr("stroke-width", width).attr("stroke-linecap", "round")
      .attr("stroke-opacity", (l) => (faint(l) ? 0.5 : null))
      .attr("stroke-dasharray", (l) => (P.BASES[l.basis] || {}).dash || null)
      .attr("marker-end", (l) => (["command", "support", "hostile"].includes(l.type) ? `url(#${uid}-${l.type})` : null));
    link.append("path").attr("class", "edge-flow").attr("stroke-width", flowWidth).attr("stroke-dasharray", "1 22").attr("stroke-opacity", 0.55);
    link.append("path").attr("class", "edge-hit").attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 14);

    const node = gNodes.selectAll("g").data(nodes).join("g").attr("class", "node")
      .attr("tabindex", opts.interactive ? 0 : null)
      .attr("role", opts.interactive ? "button" : null).attr("aria-label", (n) => n.e.name);
    const scaled = node.append("g").attr("class", "node-scale");
    scaled.append("circle").attr("class", "halo").attr("r", (n) => n.r * 2.6).attr("fill", `url(#${uid}-halo)`)
      .style("--d", (n, i) => `${(-i * 0.37) % 4.6}s`);
    scaled.append("circle").attr("class", "ring").attr("r", (n) => n.r + 6);
    const body = scaled.append("g").attr("class", "node-body");
    body.filter((n) => n.square).append("rect").attr("x", (n) => -n.r).attr("y", (n) => -n.r)
      .attr("width", (n) => n.r * 2).attr("height", (n) => n.r * 2).attr("rx", 3);
    body.filter((n) => !n.square).append("circle").attr("r", (n) => n.r);
    body.selectAll("rect,circle").attr("stroke-width", 1.5);
    const major = (n) => P.isPov(n.id, lim) || n.degree >= 3;
    const labelG = opts.labels === "none" ? d3.select(null) : gLabels.selectAll("g").data(nodes).join("g");
    const label = opts.labels === "none" ? d3.select(null) : labelG.append("text")
      .attr("class", (n) => `web-label${major(n) ? "" : " minor"}`)
      .attr("font-size", LABEL_PX);
    label.append("tspan").attr("class", "lm").text((n) => n.e.name.replace(/^The /, ""));
    const sub = label.append("tspan").attr("class", "web-sub");
    // measure each name once at its on-screen size (and again when the web font arrives)
    const measure = () => label.each(function (n) { const w = this.querySelector(".lm").getComputedTextLength(); if (w > 0) n.tw = w; });
    measure();

    function render() {
      node.attr("transform", (n) => `translate(${n.x},${n.y})`);
      labelG.attr("transform", (n) => `translate(${n.x},${n.y})`);
      link.selectAll("path").attr("d", linkPath);
    }
    render();

    // ------------------------------------------------------------ name placement
    let T = d3.zoomIdentity, userMoved = false;
    const pad = { top: 24, right: 24, bottom: 24, left: 24, ...(opts.pad || {}) };
    let curH = lim, pinned = new Set();
    const subs = new Map();   // in focus: id -> [text, colour] for the tie under a name
    // Greedy, in rank order: whoever is picked and everyone tied to them, then tonight's
    // viewpoints, then other viewpoints, then the best-tied.
    const nowPov = () => new Set((P.units[curH] || { pov: [] }).pov);
    const rank = (n, now) => (pinned.has(n.id) ? 1e6 : 0) + (now.has(n.id) ? 1e5 : 0) + (P.isPov(n.id, curH) ? 1e4 : 0) + n.degree;
    const boxHits = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const circleHits = (b, cx, cy, r) => {
      const dx = cx - Math.max(b[0], Math.min(cx, b[2])), dy = cy - Math.max(b[1], Math.min(cy, b[3]));
      return dx * dx + dy * dy < r * r;
    };
    function layoutLabels() {
      if (opts.labels === "none") return;
      const k = T.k, cw = svgEl.getBoundingClientRect().width || W;
      const shownN = nodes.filter((n) => n.h <= curH);
      const spheres = shownN.map((n) => [T.applyX(n.x), T.applyY(n.y), n.r * S * k + 3, n]);
      const gap = 4, placed = [];
      nodes.forEach((n) => { n.lab = null; });
      const now = nowPov();
      for (const n of shownN.slice().sort((a, b) => rank(b, now) - rank(a, now))) {
        const forced = pinned.has(n.id);
        const want = forced || (opts.labels === "pov" ? P.isPov(n.id, curH) : opts.labels === "major" ? major(n) : true);
        if (!want) continue;
        const sx = T.applyX(n.x), sy = T.applyY(n.y), r = n.r * S * k;
        const st = subs.get(n.id);
        const w = Math.max(n.tw || n.e.name.length * LABEL_PX * 0.55, st ? st[0].length * SUB_PX * 0.52 : 0);
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
        const order = n.pref ? [n.pref, ...base.filter((x) => x !== n.pref)] : base;
        // how many spheres a spot would cover (Infinity if it's off screen, over a name, or over a lit sphere)
        const cost = (c) => {
          const b = [c.x0 - 1, c.y0, c.x0 + w + 1, c.y0 + hh];
          if (b[0] < 2 || b[2] > cw - 2 || placed.some((p) => boxHits(b, p))) return Infinity;
          let hits = 0;
          for (const [cx, cy, cr, m] of spheres) {
            if (m === n || !circleHits(b, cx, cy, cr)) continue;
            if (P.isPov(m.id, curH)) return Infinity;
            hits += 1;
          }
          return hits;
        };
        const costs = order.map((o) => cost(cands[o]));
        const best = Math.min(...costs);
        // a clear spot if there is one; important names may sit over a sphere or two
        const important = forced || now.has(n.id) || P.isPov(n.id, curH) || n.degree >= 4;
        let pick = best === 0 || (important && best <= 2) ? cands[order[costs.indexOf(best)]] : null;
        if (!pick && forced) pick = cands[order[0]];
        if (!pick) continue;
        n.lab = { ...pick, w, sx, sy };
        placed.push([pick.x0 - 2, pick.y0, pick.x0 + w + 2, pick.y0 + hh]);
      }
      label.each(function (n) {
        const p = n.lab;
        if (!p) { this.style.opacity = 0; return; }
        this.style.opacity = "";
        const a = /r$/.test(p.k) ? "start" : /l$/.test(p.k) ? "end" : "middle";
        const xs = a === "start" ? p.x0 : a === "end" ? p.x0 + p.w : p.x0 + p.w / 2;
        const base = p.y0 + LABEL_PX * 0.86;
        const x = (xs - p.sx) / k, y = (base - p.sy) / k;
        this.setAttribute("x", x);
        this.setAttribute("y", y);
        this.setAttribute("text-anchor", a);
        const st = subs.get(n.id), sp = this.querySelector(".web-sub");
        if (st) {
          sp.textContent = st[0];
          sp.setAttribute("x", x);
          sp.setAttribute("y", (base + SUB_PX * 1.3 - p.sy) / k);
          sp.setAttribute("fill", st[1]);
          sp.setAttribute("font-size", SUB_PX / k);
          sp.style.display = "";
        } else sp.style.display = "none";
      });
    }

    // ------------------------------------------------------------ zoom: spreads, never inflates
    const sizeFor = (k) => (k < BOOST_AT ? Math.min(BOOST_MAX, BOOST_AT / k) : k > CAP ? CAP / k : 1);
    function applyZoom(t) {
      T = t;
      view.attr("transform", t);
      const s = sizeFor(t.k);
      if (Math.abs(s - S) / S > 0.01) {
        S = s;
        scaled.attr("transform", S === 1 ? null : `scale(${S.toFixed(4)})`);
        link.selectAll("path").attr("d", linkPath);
        link.select(".edge-line").attr("stroke-width", (l) => width(l) * S);
        link.select(".edge-flow").attr("stroke-width", (l) => flowWidth(l) * S);
        link.select(".edge-hit").attr("stroke-width", 14 * S);
      }
      label.attr("font-size", LABEL_PX / t.k).attr("stroke-width", 4 / t.k);
      layoutLabels();
    }
    function fitTransform() {
      const box = svgEl.getBoundingClientRect();
      const cw = box.width || W, ch = box.height || HGT;
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
      const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 22, y1 = Math.max(...ys) + 22;
      const k = Math.min((cw - pad.left - pad.right) / (x1 - x0), (ch - pad.top - pad.bottom) / (y1 - y0), 2.2);
      const tx = pad.left + (cw - pad.left - pad.right - (x1 - x0) * k) / 2 - x0 * k;
      const ty = pad.top + (ch - pad.top - pad.bottom - (y1 - y0) * k) / 2 - y0 * k;
      return d3.zoomIdentity.translate(tx, ty).scale(k);
    }
    let zoom = null;
    if (opts.zoom) {
      zoom = d3.zoom().scaleExtent([0.25, 6]).on("zoom", (ev) => {
        applyZoom(ev.transform);
        if (ev.sourceEvent) { userMoved = true; hideTip(); }
      });
      svg.call(zoom).on("dblclick.zoom", null);
    }
    function setT(t, ms = 0) {
      if (zoom) {
        const sel = ms && !P.reducedMotion ? svg.transition("cam").duration(ms).ease(d3.easeCubicInOut) : svg;
        sel.call(zoom.transform, t);
      } else applyZoom(t);
    }
    // On a small screen the whole web at once is too small to read, so it can open closer in,
    // centred on the names given (the chapter's viewpoints); the fit button shows everything.
    function startTransform() {
      const fit = fitTransform(), ini = opts.initial;
      if (!ini || fit.k >= ini.k) return fit;
      const focusOnly = (ini.focus || []).map((id) => byId[id]).filter((n) => n && n.h <= lim);
      if (!focusOnly.length) return fit;
      const b = svgEl.getBoundingClientRect();
      const fx = focusOnly.reduce((a, n) => a + n.x, 0) / focusOnly.length, fy = focusOnly.reduce((a, n) => a + n.y, 0) / focusOnly.length;
      return d3.zoomIdentity.translate(b.width / 2 - fx * ini.k, (ini.cy || 0.5) * b.height - fy * ini.k).scale(ini.k);
    }
    if (nodes.length) setT(startTransform());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); layoutLabels(); });

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
        render();
        layoutLabels();
        if (t === 1) { mover.stop(); mover = null; }
      });
    }

    // ------------------------------------------------------------ focus: a ring around whoever is picked
    let focus = null, before = null;
    const box = () => {
      const b = svgEl.getBoundingClientRect();
      const f = opts.focusBox ? opts.focusBox() : null;
      return f || { x: pad.left, y: pad.top, w: b.width - pad.left - pad.right, h: b.height - pad.top - pad.bottom };
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
    function tieSubs(n) {
      subs.clear();
      links.forEach((l) => {
        if (!shown(l) || (l.source.id !== n.id && l.target.id !== n.id)) return;
        const o = l.source.id === n.id ? l.target.id : l.source.id;
        const cur = subs.get(o);
        const text = cur ? `${cur[0]} · ${l.label}` : l.label;
        subs.set(o, [text.length > 34 ? `${text.slice(0, 33).trim()}…` : text, cur ? cur[1] : TINT[l.type]]);
      });
    }
    function enterFocus(n, ms = FOCUS_MS) {
      if (!focus) before = T;   // the view to come back to
      focus = n;
      tieSubs(n);
      const { target, cam } = focusLayout(n);
      moveTo(target, ms);
      if (zoom) setT(cam, ms);
    }
    function leaveFocus() {
      if (!focus) return;
      focus = null;
      subs.clear();
      nodes.forEach((m) => { m.pref = null; });
      moveTo(new Map(), FOCUS_MS);
      if (before && zoom) setT(before, FOCUS_MS);
      before = null;
    }

    if (window.ResizeObserver) {
      let last = `${box0.width}x${box0.height}`;
      new ResizeObserver(() => {
        const b = svgEl.getBoundingClientRect(), key = `${Math.round(b.width)}x${Math.round(b.height)}`;
        if (key === last || !b.width) return;
        last = key;
        if (focus) enterFocus(focus, 0);
        else if (!userMoved && nodes.length) setT(startTransform());
      }).observe(svgEl);
    }

    // ------------------------------------------------------------ interaction
    const tip = opts.tip;
    const neighbours = (n) => {
      const set = new Set([n.id]);
      links.forEach((l) => { if (!shown(l)) return; if (l.source.id === n.id) set.add(l.target.id); if (l.target.id === n.id) set.add(l.source.id); });
      return set;
    };
    function focusOn(n) {
      const near = n ? neighbours(n) : null;
      pinned = near || new Set();
      layoutLabels();
      node.style("opacity", (d) => (!near || near.has(d.id) ? null : 0.14));
      labelG.style("opacity", (d) => (!near || near.has(d.id) ? null : 0.14));
      link.style("opacity", (l) => (!n || l.source.id === n.id || l.target.id === n.id ? null : 0.05))
        .classed("hot", (l) => !!n && (l.source.id === n.id || l.target.id === n.id));
    }
    function showTip(evt, html) {
      if (!tip) return;
      const b = svgEl.getBoundingClientRect();
      tip.innerHTML = html;
      const w = tip.offsetWidth || 260;
      tip.style.left = `${Math.max(8, Math.min(evt.clientX - b.left + 14, b.width - w - 8))}px`;
      tip.style.top = `${evt.clientY - b.top + 16}px`;
      tip.classList.add("on");
    }
    const hideTip = () => tip && tip.classList.remove("on");
    const hoverable = matchMedia("(hover: hover)").matches;
    if (opts.interactive) {
      if (hoverable) {
        node.on("mouseenter", (evt, n) => {
          if (!focus) focusOn(n);
          const summary = P.summaryOf(n.e, state.h).replace(/<[^>]+>/g, "");
          showTip(evt, `<strong>${P.esc(n.e.name)}</strong>${summary ? `<br><span class="muted">${P.esc(summary)}</span>` : ""}`);
        }).on("mouseleave", () => { if (!focus) focusOn(state.selected); hideTip(); });
        link.on("mouseenter", (evt, l) => {
          const u = P.unitById[l.cite], note = P.basisNote(l, { long: true });
          const who = !note || faint(l) ? "" : l.basis === "said" ? `, ${note}` : ` (${note})`;
          showTip(evt, `${P.esc(l.source.e.name)} → ${P.esc(l.target.e.name)}<br><strong>${P.esc(l.label)}</strong>${who}<br><span class="muted">${P.esc(P.TYPES[l.type].label)}, ${faint(l) ? note : P.esc(P.unitLabel(u, { short: true }))}</span>`);
        }).on("mouseleave", hideTip);
      }
      node.on("click", (evt, n) => { evt.stopPropagation(); api.select(n.id); })
        .on("keydown", (evt, n) => { if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); api.select(n.id); } });
      svg.on("click", (evt) => { if (evt.target === svgEl) api.select(null); });
    }

    // ------------------------------------------------------------ state
    const state = { h: lim, types: new Set(Object.keys(P.TYPES)), styles: new Set(Object.keys(P.STYLES)), selected: null };
    const styleOf = (l) => (P.BASES[l.basis] || P.BASES.seen).style;
    const shown = (l) => l.on <= state.h && state.types.has(l.type) && state.styles.has(styleOf(l));
    function apply(prevH, sweepMs) {
      curH = state.h;
      const lit = (n) => P.isPov(n.id, state.h);
      body.selectAll("rect,circle")
        .attr("fill", (n) => (lit(n) ? `url(#${uid}-lit)` : `url(#${uid}-dull)`))
        .attr("stroke", (n) => (lit(n) ? "#d8ecff" : n.square ? "#c9a46a" : "#ece4d2"))
        .attr("stroke-opacity", (n) => (lit(n) ? 1 : 0.8))
        .attr("filter", (n) => (lit(n) ? `url(#${uid}-glow)` : null));
      node.select(".halo").style("display", (n) => (lit(n) ? null : "none"));
      node.style("display", (n) => (n.h <= state.h ? null : "none"));
      labelG.style("display", (n) => (n.h <= state.h ? null : "none"));
      link.style("display", (l) => (shown(l) ? null : "none"));
      if (prevH !== undefined && prevH < state.h && !P.reducedMotion) {
        const cw = svgEl.getBoundingClientRect().width || W;
        const delay = (n) => (sweepMs ? Math.max(0, Math.min(1, T.applyX(n.x) / cw)) * sweepMs * 0.9 : 0);
        node.filter((n) => n.h > prevH && n.h <= state.h).select(".node-body")
          .classed("infusing", false).style("animation-delay", (n) => `${delay(n)}ms`)
          .each(function () { void this.getBoundingClientRect(); }).classed("infusing", true);
        link.filter((l) => l.on > prevH && l.on <= state.h).classed("drawing", false)
          .each(function (l) {
            this.querySelector(".edge-line").style.animationDelay = `${Math.max(delay(l.source), delay(l.target)) + 250}ms`;
            void this.getBoundingClientRect();
          }).classed("drawing", true);
      }
      if (state.selected && state.selected.h > state.h) api.select(null);
      else {
        if (focus && opts.focusMode) enterFocus(focus, 400);   // the ring follows the chapter
        focusOn(state.selected);
      }
    }
    const api = {
      nodes, links,
      setHorizon(h, o = {}) { const prev = state.h; state.h = h; apply(prev, o.sweepMs); },
      setTypes(types) { state.types = new Set(types); apply(); },
      setStyles(styles) { state.styles = new Set(styles); apply(); },
      select(id) {
        const n = id ? byId[id] : null;
        state.selected = n && n.h <= state.h ? n : null;
        node.classed("selected", (d) => d === state.selected);
        if (opts.onSelect) opts.onSelect(state.selected);   // first, so the focus can see the card's room
        if (opts.focusMode && zoom) { if (state.selected) enterFocus(state.selected); else leaveFocus(); }
        focusOn(state.selected);
      },
      focused: () => focus,
      neighbours: (id) => (byId[id] ? [...neighbours(byId[id])].filter((x) => x !== id) : []),
      // stated ties only: the faint ones are counted on their own
      count: (type) => links.filter((l) => !faint(l) && l.type === type && l.on <= state.h).length,
      countStyle: (style) => links.filter((l) => styleOf(l) === style && l.on <= state.h).length,
      visibleCounts: () => ({ nodes: nodes.filter((n) => n.h <= state.h).length, links: links.filter((l) => !faint(l) && shown(l)).length }),
      fit() { userMoved = false; setT(fitTransform(), 500); },
      zoomBy(f) { if (zoom) svg.transition("cam").duration(P.reducedMotion ? 0 : 300).call(zoom.scaleBy, f); },
      reframe() { if (focus) enterFocus(focus, 450); },
      has: (id) => !!byId[id],
    };
    apply();
    return api;
  };
})();
