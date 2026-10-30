/* The Unfolding: who is connected to whom, drawn from codex/relations.toml.
   Layouts (web-layout.js) are computed once for everything visible, sized to the box they're
   drawn in, so scrubbing through chapters only lights, sizes and dims nodes in place. New nodes
   "infuse" into view, in step with the storm that sweeps each chapter in.

   Two views (opts.view) decide what is drawn and how:
   - "everyone" (the default, and all the home teaser knows): every name and every tie, one line
     per tie, spheres sized by ties. Called without a view, the web draws exactly as it always has.
   - "cast": people and groups, with things, places, field guide and lore as layers to switch on.
     A group's members share a territory instead of lines to its square; each pair gets one
     line, at the same strength as Everything's; spheres grow with how often the book names someone;
     names come and go with the zoom, like towns on a map.
   Spacing (Spacious or Compact) decides where everyone sits; each view keeps its own.

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
     focus rings, but have no say in a sphere's size, its name's priority, or the layout.

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
  const FOCUS_MS = 700, GLIDE_MS = 700, GROW_MS = 300;
  // lighter tints of the tie colours, for text on the dark sky
  const TINT = { family: "#e3ad4c", command: "#74afff", support: "#4fd1a0", hostile: "#f58e9b", other: "#b3bccb" };
  // which tie colours a pair's single line in The Cast
  const PRIORITY = ["family", "hostile", "command", "support", "other"];
  const ALWAYS = new Set(["cast", "groups"]);   // The Cast's layers that can't be switched off

  P.web = function (svgEl, opts = {}) {
    const lim = opts.limit ?? P.limit();
    const ent = P.entityById;
    const page = opts.view !== undefined;   // the Unfolding page; the teaser stays as it was
    const faint = (r) => !!(P.BASES[r.basis] || {}).faint;
    const rels = P.data.relations.concat(opts.implied ? P.data.implied || [] : [])
      .filter((r) => r.h <= lim && ent[r.from] && ent[r.to] && ent[r.from].h <= lim && ent[r.to].h <= lim);
    const ids = new Set();
    rels.forEach((r) => { ids.add(r.from); ids.add(r.to); });
    const nodes = [...ids].map((id) => ({ id, e: ent[id], degree: 0 }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    rels.forEach((r) => { if (!faint(r)) { byId[r.from].degree++; byId[r.to].degree++; } });
    const castR = (n, h) => Math.min(20, 4 + 0.55 * Math.sqrt(P.mentionsAt(n.e, h)));
    nodes.forEach((n) => {
      n.h = n.e.h;
      n.rE = 5 + Math.sqrt(n.degree) * 2.6;   // Everything: by ties
      n.rMax = castR(n, lim);                  // The Cast: by mentions, at its largest
      n.r = n.rE;
      n.square = ["group", "people"].includes(n.e.kind);
      n.circle = n.e.circle || "";
      n.layer = P.layerOf ? P.layerOf(n.e) : "cast";
      n.lw = n.e.name.replace(/^The /, "").length * 6.9;   // name width in layout px, before the fonts load
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
    const width = (l) => (faint(l) ? 1.1 : 2), flowWidth = (l) => (faint(l) ? 1.2 : 2.2);

    // ------------------------------------------------------------ state
    const state = {
      h: lim, types: new Set(Object.keys(P.TYPES)), styles: new Set(Object.keys(P.STYLES)), selected: null,
      view: opts.view || "everyone", layers: new Set(), tier: "all", rankBy: "named",
      spacing: { cast: "spacious", everyone: "compact" },   // each view keeps its own, for the visit
    };
    if (opts.spacing === "spacious" || opts.spacing === "compact") state.spacing[state.view] = opts.spacing;
    const cast = () => state.view === "cast";
    const styleOf = (l) => (P.BASES[l.basis] || P.BASES.seen).style;
    const shown = (l) => l.on <= state.h && state.types.has(l.type) && state.styles.has(styleOf(l));
    // in the current view: The Cast holds people, groups and the layers switched on
    const inView = (n) => !cast() || ALWAYS.has(n.layer) || state.layers.has(n.layer);

    // ------------------------------------------------------------ layouts, shaped to the box
    // Every screen gets the same room per name, shaped to the box: tall on a phone, wide on a monitor.
    const box0 = svgEl.getBoundingClientRect();
    const aspect = Math.max(0.6, Math.min(1.9, (box0.width || 1000) / (box0.height || 680)));
    const W = Math.sqrt(AREA * aspect), HGT = Math.sqrt(AREA / aspect);
    const layouts = {};
    function layout(name) {   // worked out the first time it's needed
      if (layouts[name]) return layouts[name];
      const stated = links.filter((l) => !faint(l));
      if (name === "compact") {
        layouts.compact = P.webLayout.compact(nodes.map((n) => ({ id: n.id, r: n.rE, circle: n.circle })),
          stated.map((l) => ({ source: l.from, target: l.to, type: l.type })), W, HGT);
      } else {
        const people = nodes.filter((n) => ALWAYS.has(n.layer)), inside = new Set(people.map((n) => n.id));
        // room for the larger sphere either view draws here
        const items = (ns) => ns.map((n) => ({ id: n.id, r: Math.max(n.rE, n.rMax), lw: n.lw, circle: n.circle }));
        const fixed = P.webLayout.spacious(items(people),
          stated.filter((l) => inside.has(l.from) && inside.has(l.to)).map((l) => ({ source: l.from, target: l.to, type: l.type, member: !!l.member })), W, HGT);
        const sats = nodes.filter((n) => !inside.has(n.id));
        layouts.spacious = sats.length ? P.webLayout.satellites(fixed, items(people), items(sats),
          stated.map((l) => [l.from, l.to]), (id) => P.mentionsAt(byId[id].e, lim)) : fixed;
      }
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
    // end markers: a second cue beside colour (arrow = command, dot = support, bar = hostility).
    // On the page they're drawn larger: for red-green colour-blind readers the shape is the cue.
    const markerSize = page ? 6.5 : 4.5;
    const marker = (id, color, draw) => {
      const m = defs.append("marker").attr("id", `${uid}-${id}`).attr("viewBox", "-6 -6 12 12").attr("refX", 0).attr("refY", 0)
        .attr("markerWidth", markerSize).attr("markerHeight", markerSize).attr("orient", "auto").attr("markerUnits", "strokeWidth");
      draw(m, color);
    };
    marker("command", P.TYPES.command.hex, (m, c) => m.append("path").attr("d", "M-4,-4L3,0L-4,4").attr("fill", "none").attr("stroke", c).attr("stroke-width", 2));
    marker("support", P.TYPES.support.hex, (m, c) => m.append("circle").attr("r", 3).attr("fill", c));
    marker("hostile", P.TYPES.hostile.hex, (m, c) => m.append("path").attr("d", "M0,-5L0,5").attr("stroke", c).attr("stroke-width", 2.5));
    const markerOf = (l) => (["command", "support", "hostile"].includes(l.type) ? `url(#${uid}-${l.type})` : null);

    const view = svg.append("g").attr("class", "web-view");
    const gTerr = page ? view.append("g").attr("class", "web-terrs") : null;
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
    function edges(g, data) {
      const sel = g.selectAll("g").data(data).join("g").attr("class", "edge").style("color", (l) => P.TYPES[l.type].hex);
      sel.append("path").attr("class", "edge-line").attr("fill", "none")
        .attr("stroke", (l) => P.TYPES[l.type].hex).attr("stroke-width", width).attr("stroke-linecap", "round")
        .attr("stroke-opacity", (l) => (faint(l) ? 0.5 : null))
        .attr("stroke-dasharray", (l) => (P.BASES[l.basis] || {}).dash || null)
        .attr("marker-end", markerOf);
      sel.append("path").attr("class", "edge-flow").attr("stroke-width", flowWidth).attr("stroke-dasharray", "1 22").attr("stroke-opacity", 0.55);
      sel.append("path").attr("class", "edge-hit").attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 14);
      return sel;
    }
    // Everything: one line per tie, parallel ties curving apart
    const gEvery = gLinks.append("g");
    const linkEvery = edges(gEvery, links);

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
      });
    }
    const gCast = page ? gLinks.append("g") : null;
    const linkCast = page ? edges(gCast, castPairs) : d3.select(null);
    let link = cast() ? linkCast : linkEvery;
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
      linkCast.style("color", (p) => P.TYPES[p.type].hex);
      linkCast.select(".edge-line").attr("stroke", (p) => P.TYPES[p.type].hex)
        .attr("stroke-opacity", (p) => (faint(p) ? 0.5 : null))
        .attr("stroke-dasharray", (p) => (P.BASES[p.basis] || {}).dash || null)
        .attr("marker-end", markerOf);
      linkCast.select(".edge-line").attr("stroke-width", (p) => width(p) * S);
      linkCast.select(".edge-flow").attr("stroke-width", (p) => flowWidth(p) * S);
    }

    const node = gNodes.selectAll("g").data(nodes).join("g").attr("class", "node")
      .attr("tabindex", opts.interactive ? 0 : null)
      .attr("role", opts.interactive ? "button" : null).attr("aria-label", (n) => n.e.name);
    const scaled = node.append("g").attr("class", "node-scale");
    scaled.append("circle").attr("class", "halo").attr("fill", `url(#${uid}-halo)`)
      .style("--d", (n, i) => `${(-i * 0.37) % 4.6}s`);
    scaled.append("circle").attr("class", "ring");
    const body = scaled.append("g").attr("class", "node-body");
    body.filter((n) => n.square).append("rect").attr("rx", 3);
    body.filter((n) => !n.square).append("circle");
    body.selectAll("rect,circle").attr("stroke-width", 1.5);
    function paintR() {
      node.select(".halo").attr("r", (n) => n.r * 2.6);
      node.select(".ring").attr("r", (n) => n.r + 6);
      body.select("rect").attr("x", (n) => -n.r).attr("y", (n) => -n.r).attr("width", (n) => n.r * 2).attr("height", (n) => n.r * 2);
      body.select("circle").attr("r", (n) => n.r);
    }
    paintR();
    const major = (n) => P.isPov(n.id, lim) || n.degree >= 3;
    const labelG = opts.labels === "none" ? d3.select(null) : gLabels.selectAll("g").data(nodes).join("g");
    const label = opts.labels === "none" ? d3.select(null) : labelG.append("text")
      .attr("class", (n) => `web-label${major(n) ? "" : " minor"}`)
      .attr("font-size", LABEL_PX);
    label.append("tspan").attr("class", "lm").text((n) => n.e.name.replace(/^The /, ""));
    const sub = label.append("tspan").attr("class", "web-sub");
    // measure each name at its on-screen size (and again when the web font arrives)
    let fontK = 1;   // the zoom the names' font size was last set for
    const measure = () => label.each(function (n) { const w = this.querySelector(".lm").getComputedTextLength(); if (w > 0) n.tw = page ? w * fontK : w; });
    measure();

    // ------------------------------------------------------------ territories (The Cast)
    // A group (a house, a crew, an order; never a whole people) with two or more marked
    // members on the map gets a soft region around them, drawn instead of their lines.
    const terrs = !page ? [] : nodes.filter((n) => n.e.kind === "group").map((g) => ({
      g, rows: links.filter((l) => l.member && l.target === g),
    })).filter((t) => t.rows.length >= 2);
    const terrPath = page ? gTerr.selectAll("path").data(terrs).join("path").attr("class", "web-terr") : d3.select(null);
    const terrName = page ? gTerr.selectAll("text").data(terrs).join("text").attr("class", "web-terr-name")
      .attr("font-size", TERR_PX).text((t) => t.g.e.name.replace(/^The /, "")) : d3.select(null);
    terrName.each(function (t) { t.tw = this.getComputedTextLength(); });
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
    function trace(t, k, coarse) {
      const mine = terrMembers(t).filter((n) => drawn.has(n.id));
      const ids = new Set([t.g.id, ...terrMembers(t).map((n) => n.id)]);
      const pad = 13 / k, bar = 6 / k, blend = 16 / k, clear = 7 / k, cell = (coarse ? 10 : 4) / k;
      const ms = [t.g, ...mine].map((n) => ({ x: n.x, y: n.y, R: n.r * S + pad, core: n.r * S + 2 / k }));
      const bars = mine.map((n) => [n.x, n.y, t.g.x, t.g.y]);
      const m = blend + 2 * cell;
      const x0 = Math.min(...ms.map((c) => c.x - c.R)) - m, x1 = Math.max(...ms.map((c) => c.x + c.R)) + m;
      const y0 = Math.min(...ms.map((c) => c.y - c.R)) - m, y1 = Math.max(...ms.map((c) => c.y + c.R)) + m;
      const others = nodes.filter((n) => drawn.has(n.id) && !ids.has(n.id))
        .map((n) => ({ x: n.x, y: n.y, R: n.r * S + clear, core: n.r * S + 1 / k }))
        .filter((c) => c.x + c.R > x0 && c.x - c.R < x1 && c.y + c.R > y0 && c.y - c.R < y1);
      const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
      const f = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const py = y0 + (j + 0.5) * cell;
        for (let i = 0; i < nx; i++) {
          const px = x0 + (i + 0.5) * cell;
          let d = Infinity;
          for (const c of ms) d = smin(d, dist(px - c.x, py - c.y) - c.R, blend);
          for (const b of bars) d = smin(d, segDist(px, py, b[0], b[1], b[2], b[3]) - bar, blend);
          if (d > 0) { f[j * nx + i] = -d; continue; }   // outside every member: nothing below can bring it in
          let v = -d;
          for (const c of others) v = Math.min(v, dist(px - c.x, py - c.y) - c.R);
          for (const c of ms) v = Math.max(v, c.core - dist(px - c.x, py - c.y));        // a member's own sphere is always in
          for (const c of others) v = Math.min(v, dist(px - c.x, py - c.y) - c.core);    // anyone else's never is
          f[j * nx + i] = v;
        }
      }
      // grid value i sits at contour coordinate i + 0.5, which is x0 + (i + 0.5) × cell
      const polys = d3.contours().size([nx, ny]).thresholds([0])(f)[0].coordinates;
      const curve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.7));
      t.pts = []; t.area = 0;
      t.d = polys.flatMap((rings) => rings.map((ring, r) => {
        const pts = ring.slice(0, -1).map(([X, Y]) => [x0 + X * cell, y0 + Y * cell]);
        if (!r) t.pts.push(...pts);
        t.area += (r ? -1 : 1) * Math.abs(d3.polygonArea(pts));
        return curve(pts);
      })).join("") || null;
    }
    let tracedK = null;   // the zoom the regions were last traced at
    // Traced finely at rest. While spheres glide they're traced coarsely, so they keep up;
    // mid-zoom they keep their shape, and they're traced again when the gesture ends.
    function renderTerrs(o = {}) {
      if (!page) return;
      const k = T.k;
      terrName.attr("font-size", TERR_PX / k).attr("stroke-width", 3 / k);
      if (o.zooming && tracedK !== null) return;
      tracedK = k;
      terrs.forEach((t) => {
        t.d = null;
        if (cast() && terrOf.has(t.g.id)) trace(t, k, o.moving);
      });
      const order = terrs.slice().sort((a, b) => (b.area || 0) - (a.area || 0));   // the largest first, so small ones sit on top
      terrPath.data(order, (t) => t.g.id).order().attr("d", (t) => t.d).style("display", (t) => (t.d ? null : "none"));
    }

    function render(moving) {
      node.attr("transform", (n) => `translate(${n.x},${n.y})`);
      labelG.attr("transform", (n) => `translate(${n.x},${n.y})`);
      link.selectAll("path").attr("d", linkPath);
      renderTerrs({ moving });
    }

    // ------------------------------------------------------------ name placement
    let T = d3.zoomIdentity, userMoved = false;
    const pad = { top: 24, right: 24, bottom: 24, left: 24, ...(opts.pad || {}) };
    let curH = lim, pinned = new Set(), drawn = new Set(nodes.map((n) => n.id));
    const subs = new Map();   // in focus: id -> [text, colour] for the tie under a name
    // Greedy, in rank order. Everything: whoever is picked and everyone tied to them, then
    // tonight's viewpoints, then other viewpoints, then the best-tied. The Cast: whoever is picked
    // and their ring, then viewpoints, then whoever is on the page in the chapter shown, then score.
    const nowPov = () => new Set((P.units[curH] || { pov: [] }).pov);
    const rankEvery = (n, now) => (pinned.has(n.id) ? 1e6 : 0) + (now.has(n.id) ? 1e5 : 0) + (P.isPov(n.id, curH) ? 1e4 : 0) + n.degree;
    const rankCast = (n) => (pinned.has(n.id) ? 1e6 : 0) + (P.isPov(n.id, curH) ? 1e5 : 0) + (P.onPage(n.e, curH) ? 1e4 : 0) - (n.srank ?? 9999);
    const boxHits = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const circleHits = (b, cx, cy, r) => {
      const dx = cx - Math.max(b[0], Math.min(cx, b[2])), dy = cy - Math.max(b[1], Math.min(cy, b[3]));
      return dx * dx + dy * dy < r * r;
    };
    // Map-style names: a budget that grows with the zoom, filled in priority order
    function budget(cw, ch) {
      const kFit = fitTransform(true).k;
      return Math.max(8, Math.round(((cw * ch) / 17000) * Math.pow(T.k / kFit, 2)));
    }
    // the page's own buttons and readout, as boxes in the map's screen space: names keep off them
    function avoidBoxes() {
      if (!opts.avoid) return [];
      const b = svgEl.getBoundingClientRect();
      return opts.avoid().map((r) => [r.left - b.left - 2, r.top - b.top - 2, r.right - b.left + 2, r.bottom - b.top + 2]);
    }
    function layoutLabels() {
      if (opts.labels === "none") return;
      const k = T.k, bb = svgEl.getBoundingClientRect(), cw = bb.width || W, ch = bb.height || HGT;
      const shownN = nodes.filter((n) => n.h <= curH && drawn.has(n.id));
      const spheres = shownN.map((n) => [T.applyX(n.x), T.applyY(n.y), n.r * S * k + 3, n]);
      const gap = 4, placed = avoidBoxes();
      const sphereCost = (b, self) => {
        let hits = 0;
        for (const [cx, cy, cr, m] of spheres) {
          if (m === self || !circleHits(b, cx, cy, cr)) continue;
          if (P.isPov(m.id, curH)) return Infinity;
          hits += 1;
        }
        return hits;
      };
      placeTerrNames(placed, spheres, cw, k);
      nodes.forEach((n) => { n.lab = null; });
      const now = nowPov();
      const castNow = cast();
      const order = castNow ? shownN.slice().sort((a, b) => rankCast(b) - rankCast(a)) : shownN.slice().sort((a, b) => rankEvery(b, now) - rankEvery(a, now));
      const B = castNow ? budget(cw, ch) : Infinity;
      let count = 0;
      for (const n of order) {
        const forced = pinned.has(n.id);
        if (!forced && count >= B) break;
        if (castNow && terrOf.has(n.id) && state.selected !== n) continue;   // the territory carries the group's name
        const want = forced || castNow || (opts.labels === "pov" ? P.isPov(n.id, curH) : opts.labels === "major" ? major(n) : true);
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
        const ord = n.pref ? [n.pref, ...base.filter((x) => x !== n.pref)] : base;
        // how many spheres a spot would cover (Infinity if it's off screen, over a name, or over a lit sphere)
        const cost = (c) => {
          const b = [c.x0 - 1, c.y0, c.x0 + w + 1, c.y0 + hh];
          if (b[0] < 2 || b[2] > cw - 2 || placed.some((p) => boxHits(b, p))) return Infinity;
          return sphereCost(b, n);
        };
        const costs = ord.map((o) => cost(cands[o]));
        const best = Math.min(...costs);
        // a clear spot if there is one; important names may sit over a sphere or two
        const important = forced || now.has(n.id) || P.isPov(n.id, curH) || n.degree >= 4;
        let pick = best === 0 || (important && best <= 2) ? cands[ord[costs.indexOf(best)]] : null;
        if (!pick && forced) pick = cands[ord[0]];
        if (!pick) continue;
        n.lab = { ...pick, w, sx, sy };
        placed.push([pick.x0 - 2, pick.y0, pick.x0 + w + 2, pick.y0 + hh]);
        count += 1;
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
    // A territory's name tries above its region, then below, then left and right, a little
    // further out each round, and takes the first spot that covers no sphere and no name.
    function placeTerrNames(placed, spheres, cw, k) {
      if (!page) return;
      const hh = TERR_PX * 1.25;
      const order = terrs.filter((t) => t.d).sort((a, b) => (a.area || 0) - (b.area || 0));
      terrs.forEach((t) => { t.lab = null; });
      for (const t of order) {
        const sp = t.pts.map(([x, y]) => [T.applyX(x), T.applyY(y)]);
        const xs = sp.map((p) => p[0]), ys = sp.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const top = sp[ys.indexOf(y0)], bot = sp[ys.indexOf(y1)];
        const w = t.tw + 4;
        let pick = null, fallback = null;
        for (let step = 0; step < 4 && !pick; step++) {
          const o = step * 10;
          const cands = [
            [top[0] - w / 2, y0 - hh - 2 - o], [bot[0] - w / 2, y1 + 2 + o],
            [x0 - w - 4 - o, (y0 + y1) / 2 - hh / 2], [x1 + 4 + o, (y0 + y1) / 2 - hh / 2],
          ];
          for (const [bx, by] of cands) {
            const b = [bx, by, bx + w, by + hh];
            if (b[0] < 2 || b[2] > cw - 2 || placed.some((p) => boxHits(b, p))) continue;
            let hits = 0;
            for (const [cx, cy, cr] of spheres) if (circleHits(b, cx, cy, cr)) hits += 1;
            if (!hits) { pick = b; break; }
            if (!fallback || hits < fallback[1]) fallback = [b, hits];
          }
        }
        if (!pick) continue;   // nowhere clear: better no name than one over a sphere
        t.lab = pick;
        placed.push(pick);
      }
      terrName.style("display", (t) => (t.lab ? null : "none"))
        .attr("x", (t) => (t.lab ? T.invertX((t.lab[0] + t.lab[2]) / 2) : 0))
        .attr("y", (t) => (t.lab ? T.invertY(t.lab[1] + TERR_PX * 0.95) : 0))
        .attr("text-anchor", "middle");
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
      fontK = t.k;
      renderTerrs({ zooming: true });
      layoutLabels();
    }
    // Fit everyone in the view: on Everything, everyone; in The Cast, everyone its layers hold.
    // { base: true } fits the resting map, ignoring a focus ring.
    function fitTransform(base) {
      const box = svgEl.getBoundingClientRect();
      const cw = box.width || W, ch = box.height || HGT;
      const ns = page ? nodes.filter((n) => inView(n)) : nodes;
      if (!ns.length) return d3.zoomIdentity;
      const xs = ns.map((n) => (base ? n.bx : n.x)), ys = ns.map((n) => (base ? n.by : n.y));
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
      }).on("end", () => { if (tracedK !== T.k) { renderTerrs(); layoutLabels(); } });
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
      const fit = fitTransform(true), ini = opts.initial;
      if (!ini || fit.k >= ini.k) return fit;
      const focusOnly = (ini.focus || []).map((id) => byId[id]).filter((n) => n && n.h <= lim);
      if (!focusOnly.length) return fit;
      const b = svgEl.getBoundingClientRect();
      const fx = focusOnly.reduce((a, n) => a + n.bx, 0) / focusOnly.length, fy = focusOnly.reduce((a, n) => a + n.by, 0) / focusOnly.length;
      return d3.zoomIdentity.translate(b.width / 2 - fx * ini.k, (ini.cy || 0.5) * b.height - fy * ini.k).scale(ini.k);
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
      const done = () => { paintR(); render(); layoutLabels(); };
      if (P.reducedMotion || !ms) { nodes.forEach((n, i) => { n.r = to[i]; }); done(); return; }
      grower = d3.timer((el) => {
        const t = Math.min(1, el / ms), e = d3.easeCubicOut(t);
        nodes.forEach((n, i) => { n.r = from[i] + (to[i] - from[i]) * e; });
        paintR();
        if (t === 1) { grower.stop(); grower = null; done(); } else render(true);
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
        const o = l.source.id === n.id ? l.target : l.source;
        if (!inView(o)) return;
        const cur = subs.get(o.id);
        const text = cur ? `${cur[0]} · ${l.label}` : l.label;
        subs.set(o.id, [text.length > 34 ? `${text.slice(0, 33).trim()}…` : text, cur ? cur[1] : TINT[l.type]]);
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
    // everyone tied to n on the map shown: in the view, met by the chapter, through a tie on show
    const neighbours = (n) => {
      const set = new Set([n.id]);
      links.forEach((l) => {
        if (!shown(l)) return;
        if (l.source.id === n.id && inView(l.target)) set.add(l.target.id);
        if (l.target.id === n.id && inView(l.source)) set.add(l.source.id);
      });
      return set;
    };
    function focusOn(n) {
      const near = n ? neighbours(n) : null;
      pinned = near || new Set();
      layoutLabels();
      node.style("opacity", (d) => (!near || near.has(d.id) ? null : 0.14));
      labelG.style("opacity", (d) => (!near || near.has(d.id) ? null : 0.14));
      const touches = (l) => !!n && (l.source.id === n.id || l.target.id === n.id);
      link.style("opacity", (l) => (!n || touches(l) ? null : 0.05))
        .classed("hot", touches);
      terrPath.style("opacity", (t) => (n && !near.has(t.g.id) ? 0.15 : null));
      terrName.style("opacity", (t) => (n && !near.has(t.g.id) ? 0.15 : null));
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
    const tieLine = (l) => {
      const u = P.unitById[l.cite], note = P.basisNote(l, { long: true });
      const who = !note || faint(l) ? "" : l.basis === "said" ? `, ${note}` : ` (${note})`;
      return `<strong>${P.esc(l.label)}</strong>${who}<br><span class="muted">${P.esc(P.TYPES[l.type].label)}, ${faint(l) ? note : P.esc(P.unitLabel(u, { short: true }))}</span>`;
    };
    const hoverable = matchMedia("(hover: hover)").matches;
    if (opts.interactive) {
      if (hoverable) {
        node.on("mouseenter", (evt, n) => {
          if (!focus) focusOn(n);
          const summary = P.summaryOf(n.e, state.h).replace(/<[^>]+>/g, "");
          showTip(evt, `<strong>${P.esc(n.e.name)}</strong>${summary ? `<br><span class="muted">${P.esc(summary)}</span>` : ""}`);
        }).on("mouseleave", () => { if (!focus) focusOn(state.selected); hideTip(); });
        linkEvery.on("mouseenter", (evt, l) => showTip(evt, `${P.esc(l.source.e.name)} → ${P.esc(l.target.e.name)}<br>${tieLine(l)}`))
          .on("mouseleave", hideTip);
        // a pair's line lists every tie between them
        linkCast.on("mouseenter", (evt, p) => {
          const ties = p.ties.filter((l) => l.on <= state.h);
          showTip(evt, `${P.esc(byId[p.a].e.name)} · ${P.esc(byId[p.b].e.name)}<br>${ties.map(tieLine).join("<br>")}`);
        }).on("mouseleave", hideTip);
      }
      node.on("click", (evt, n) => { evt.stopPropagation(); api.select(n.id); })
        .on("keydown", (evt, n) => { if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); api.select(n.id); } });
      // a tap inside a territory, off any sphere, picks the group
      terrPath.on("click", (evt, t) => { evt.stopPropagation(); api.select(t.g.id); });
      svg.on("click", (evt) => { if (evt.target === svgEl) api.select(null); });
    }

    // ------------------------------------------------------------ Show and Rank by
    // Score at the chapter shown: how often the book has named them (the default), or their
    // stated ties in this view. Ranked by score, then who we met first, then name. The tiers
    // are fixed shares of everyone on the map, the same for all.
    let tierSet = null;
    function tieScore(n) {
      let s = 0;
      links.forEach((l) => {
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
      const ring = sel ? neighbours(sel) : new Set();
      drawn = new Set(nodes.filter((n) => (n.h <= state.h && inView(n) && (!tierSet || tierSet.has(n.id))) || ring.has(n.id)).map((n) => n.id));
      const both = (l) => drawn.has(l.source.id) && drawn.has(l.target.id);
      terrOf.clear();
      if (page && cast()) {
        terrs.forEach((t) => { if (t.g.h <= state.h && drawn.has(t.g.id) && terrMembers(t).length >= 2) terrOf.add(t.g.id); });
      }
      node.style("display", (n) => (drawn.has(n.id) ? null : "none"));
      labelG.style("display", (n) => (drawn.has(n.id) ? null : "none"));
      if (page) {
        restyleCast();
        gEvery.style("display", cast() ? "none" : null);
        gCast.style("display", cast() ? null : "none");
        linkCast.style("display", (p) => (p.tie && both(p) ? null : "none"));
        linkEvery.style("display", (l) => (shown(l) && both(l) ? null : "none"));
      } else linkEvery.style("display", (l) => (shown(l) ? null : "none"));
      render();
    }
    function apply(prevH, sweepMs) {
      curH = state.h;
      rankAll();
      const lit = (n) => P.isPov(n.id, state.h);
      body.selectAll("rect,circle")
        .attr("fill", (n) => (lit(n) ? `url(#${uid}-lit)` : `url(#${uid}-dull)`))
        .attr("stroke", (n) => (lit(n) ? "#d8ecff" : n.square ? "#c9a46a" : "#ece4d2"))
        .attr("stroke-opacity", (n) => (lit(n) ? 1 : 0.8))
        .attr("filter", (n) => (lit(n) ? `url(#${uid}-glow)` : null));
      node.select(".halo").style("display", (n) => (lit(n) ? null : "none"));
      if (state.selected && state.selected.h > state.h) { state.selected = null; node.classed("selected", false); if (opts.onSelect) opts.onSelect(null); if (focus) leaveFocus(); }
      refresh();
      if (prevH !== undefined) resize(prevH === state.h ? 0 : GROW_MS);
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
      if (focus && opts.focusMode) enterFocus(focus, 400);   // the ring follows the chapter
      focusOn(state.selected);
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
      if (o.refit && !focus && zoom && !userMoved) setT(startTransform(), GLIDE_MS);
    }
    const api = {
      nodes, links,
      setHorizon(h, o = {}) { const prev = state.h; state.h = h; apply(prev, o.sweepMs); },
      setTypes(types) { state.types = new Set(types); apply(); },
      setStyles(styles) { state.styles = new Set(styles); apply(); },
      setView(v) {
        if (!page || v === state.view) return;
        state.view = v;
        link = cast() ? linkCast : linkEvery;
        link.selectAll("path").attr("d", linkPath);
        link.select(".edge-line").attr("stroke-width", (l) => width(l) * S);
        link.select(".edge-flow").attr("stroke-width", (l) => flowWidth(l) * S);
        link.select(".edge-hit").attr("stroke-width", 14 * S);
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
      select(id) {
        const n = id ? byId[id] : null;
        state.selected = n && n.h <= state.h ? n : null;
        node.classed("selected", (d) => d === state.selected);
        refresh();
        if (opts.onSelect) opts.onSelect(state.selected);   // first, so the focus can see the card's room
        if (opts.focusMode && zoom) { if (state.selected) enterFocus(state.selected); else leaveFocus(); }
        focusOn(state.selected);
      },
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
      zoomBy(f) { if (zoom) { userMoved = true; svg.transition("cam").duration(P.reducedMotion ? 0 : 300).call(zoom.scaleBy, f); } },
      reframe() { if (focus) enterFocus(focus, 450); },
      has: (id) => !!byId[id],
    };
    if (page) nodes.forEach((n) => { n.r = cast() ? castR(n, lim) : n.rE; });
    paintR();
    apply();
    if (nodes.length) setT(startTransform());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); terrName.each(function (t) { t.tw = this.getComputedTextLength() * T.k; }); layoutLabels(); });
    return api;
  };
})();
