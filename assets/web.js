/* The Unfolding: who is connected to whom, drawn from codex/relations.toml.
   The layout is computed once for everything visible, sized to the box it's drawn in, so
   scrubbing through chapters only lights and dims nodes in place. New nodes "infuse" into
   view, in step with the storm that sweeps each chapter in. Labels keep a steady on-screen
   size at any zoom; zoomed out, only viewpoints and well-tied names keep theirs. */
(function () {
  "use strict";
  const CIRCLE_ORDER = ["heralds", "szeth", "kholin", "shattered-plains", "amaram-army", "kaladin-family",
    "caravan", "purelake", "davar", "kharbranth"];
  const DASH = { seen: null, said: "7 5", inferred: "1.5 5", guess: "1.5 5" };
  const LABEL_PX = 12.5;      // on-screen label size
  const AREA = 760000;        // layout room, the density that reads well on a desktop
  const BOOST_AT = 0.9;       // zoomed out past this, spheres and lines keep their on-screen size…
  const BOOST_MAX = 1.8;      // …up to this much

  P.web = function (svgEl, opts = {}) {
    const lim = opts.limit ?? P.limit();
    const ent = P.entityById;
    const rels = P.data.relations.filter((r) => r.h <= lim && ent[r.from] && ent[r.to] && ent[r.from].h <= lim && ent[r.to].h <= lim);
    const ids = new Set();
    rels.forEach((r) => { ids.add(r.from); ids.add(r.to); });
    const nodes = [...ids].map((id) => ({ id, e: ent[id], degree: 0 }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    rels.forEach((r) => { byId[r.from].degree++; byId[r.to].degree++; });
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
      .force("link", d3.forceLink(links).id((d) => d.id).distance((l) => (l.type === "family" ? 62 : 92)).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("collide", d3.forceCollide((d) => d.r + 22))
      .force("x", d3.forceX((d) => anchor[d.circle][0]).strength(0.13))
      .force("y", d3.forceY((d) => anchor[d.circle][1]).strength(0.13))
      .stop();
    for (let i = 0; i < 420; i++) sim.tick();
    nodes.forEach((n) => {
      n.x = Math.max(40, Math.min(W - 40, n.x));
      n.y = Math.max(28, Math.min(HGT - 28, n.y));
      n.flip = n.x > W * 0.64;   // labels on the right-hand side read leftwards, away from the edge
    });

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

    let S = 1;   // the current size boost for spheres and lines
    function linkPath(l) {
      const s = l.source, t = l.target;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      let off = (l.idx - (l.total - 1) / 2) * 20;
      if (s.id > t.id) off = -off; // offsets relative to the pair's canonical direction
      const sx = s.x + ux * (s.r * S + 2), sy = s.y + uy * (s.r * S + 2);
      const end = (l.type === "family" || l.type === "other" ? 2 : 7) * S;
      const tx = t.x - ux * (t.r * S + end), ty = t.y - uy * (t.r * S + end);
      if (!off) return `M${sx},${sy}L${tx},${ty}`;
      return `M${sx},${sy}Q${(sx + tx) / 2 - uy * off},${(sy + ty) / 2 + ux * off} ${tx},${ty}`;
    }

    const link = gLinks.selectAll("g").data(links).join("g").attr("class", "edge").style("color", (l) => P.TYPES[l.type].hex);
    link.append("path").attr("class", "edge-line").attr("d", linkPath).attr("fill", "none")
      .attr("stroke", (l) => P.TYPES[l.type].hex).attr("stroke-width", 2).attr("stroke-linecap", "round")
      .attr("stroke-dasharray", (l) => DASH[l.basis])
      .attr("marker-end", (l) => (["command", "support", "hostile"].includes(l.type) ? `url(#${uid}-${l.type})` : null));
    link.append("path").attr("class", "edge-flow").attr("d", linkPath).attr("stroke-width", 2.2).attr("stroke-dasharray", "1.5 12.5").attr("stroke-opacity", 0.85);
    link.append("path").attr("class", "edge-hit").attr("d", linkPath).attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 14);

    const node = gNodes.selectAll("g").data(nodes).join("g").attr("class", "node")
      .attr("transform", (n) => `translate(${n.x},${n.y})`).attr("tabindex", opts.interactive ? 0 : null)
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
    const label = opts.labels === "none" ? d3.select(null) : node.append("text")
      .attr("class", (n) => `web-label${major(n) ? "" : " minor"}`)
      .attr("font-size", LABEL_PX)
      .text((n) => n.e.name.replace(/^The /, ""));
    // measure each name once at its on-screen size (and again when the web font arrives)
    const measure = () => label.each(function (n) { const w = this.getComputedTextLength(); if (w > 0) n.tw = w; });
    measure();

    // ------------------------------------------------------------ zoom and fit
    let T = d3.zoomIdentity, userMoved = false;
    const pad = { top: 24, right: 24, bottom: 24, left: 24, ...(opts.pad || {}) };
    let curH = lim, pinned = new Set();
    // Label placement, greedy: whoever is picked (and everyone tied to them) first, then
    // viewpoints, then the best-tied. Each name tries right, left, below and above, and takes
    // the first spot that covers no other label and no other sphere. A name with no free spot
    // waits until you zoom in far enough to make room.
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
      const shown = nodes.filter((n) => n.h <= curH);
      const spheres = shown.map((n) => [T.applyX(n.x), T.applyY(n.y), n.r * S * k + 3, n]);
      const hh = LABEL_PX * 1.15, gap = 4, placed = [];
      nodes.forEach((n) => { n.lab = null; });
      const now = nowPov();
      for (const n of shown.slice().sort((a, b) => rank(b, now) - rank(a, now))) {
        const forced = pinned.has(n.id);
        const want = forced || (opts.labels === "pov" ? P.isPov(n.id, curH) : opts.labels === "major" ? major(n) : true);
        if (!want) continue;
        const sx = T.applyX(n.x), sy = T.applyY(n.y), r = n.r * S * k;
        const w = n.tw || n.e.name.length * LABEL_PX * 0.55;
        const side = [{ k: "r", x0: sx + r + gap, y0: sy - hh / 2 }, { k: "l", x0: sx - r - gap - w, y0: sy - hh / 2 }];
        if (n.flip) side.reverse();
        const cands = [...side, { k: "b", x0: sx - w / 2, y0: sy + r + 1 }, { k: "t", x0: sx - w / 2, y0: sy - r - 1 - hh }];
        // first look for a spot clear of everything; important names may then sit over a
        // sphere (the dark halo keeps them legible), but never over another name
        const important = forced || now.has(n.id) || P.isPov(n.id, curH) || n.degree >= 4;
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
        const costs = cands.map(cost);
        const best = Math.min(...costs);
        let pick = best === 0 || (important && best <= 2) ? cands[costs.indexOf(best)] : null;
        if (!pick && forced) pick = cands[0];
        if (!pick) continue;
        n.lab = pick.k;
        placed.push([pick.x0 - 2, pick.y0, pick.x0 + w + 2, pick.y0 + hh]);
      }
      label.each(function (n) {
        if (!n.lab) { this.style.opacity = 0; return; }
        this.style.opacity = "";
        const r = n.r * S, g = gap / k;
        const [x, y, a] = {
          r: [r + g, (LABEL_PX * 0.36) / k, "start"],
          l: [-(r + g), (LABEL_PX * 0.36) / k, "end"],
          b: [0, r + (1 + LABEL_PX * 0.86) / k, "middle"],
          t: [0, -(r + (1 + LABEL_PX * 0.3) / k), "middle"],
        }[n.lab];
        this.setAttribute("x", x);
        this.setAttribute("y", y);
        this.setAttribute("text-anchor", a);
      });
    }
    function applyZoom(t) {
      T = t;
      view.attr("transform", t);
      const k = t.k;
      // zoomed out, spheres and lines stay a readable size on screen
      const s = Math.max(1, Math.min(BOOST_MAX, BOOST_AT / k));
      if (Math.abs(s - S) > 0.015) {
        S = s;
        scaled.attr("transform", S === 1 ? null : `scale(${S.toFixed(3)})`);
        link.selectAll("path").attr("d", linkPath);
        link.select(".edge-line").attr("stroke-width", 2 * S);
        link.select(".edge-flow").attr("stroke-width", 2.2 * S);
        link.select(".edge-hit").attr("stroke-width", 14 * S);
      }
      label.attr("font-size", LABEL_PX / k).attr("stroke-width", 4 / k);
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
      zoom = d3.zoom().scaleExtent([0.25, 5]).on("zoom", (ev) => {
        applyZoom(ev.transform);
        if (ev.sourceEvent) { userMoved = true; hideTip(); }
      });
      svg.call(zoom).on("dblclick.zoom", null);
    }
    function setT(t, ms = 0) {
      if (zoom) {
        const sel = ms && !P.reducedMotion ? svg.transition().duration(ms).ease(d3.easeCubicOut) : svg;
        sel.call(zoom.transform, t);
      } else applyZoom(t);
    }
    // On a small screen the whole web at once is too small to read, so it can open closer in,
    // centred on the names given (the chapter's viewpoints); the fit button shows everything.
    function startTransform() {
      const fit = fitTransform(), ini = opts.initial;
      if (!ini || fit.k >= ini.k) return fit;
      const focus = (ini.focus || []).map((id) => byId[id]).filter((n) => n && n.h <= lim);
      if (!focus.length) return fit;
      const b = svgEl.getBoundingClientRect();
      const fx = focus.reduce((a, n) => a + n.x, 0) / focus.length, fy = focus.reduce((a, n) => a + n.y, 0) / focus.length;
      return d3.zoomIdentity.translate(b.width / 2 - fx * ini.k, (ini.cy || 0.5) * b.height - fy * ini.k).scale(ini.k);
    }
    if (nodes.length) setT(startTransform());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); layoutLabels(); });
    if (window.ResizeObserver) {
      let last = `${box0.width}x${box0.height}`;
      new ResizeObserver(() => {
        const b = svgEl.getBoundingClientRect(), key = `${Math.round(b.width)}x${Math.round(b.height)}`;
        if (key === last || !b.width) return;
        last = key;
        if (!userMoved && nodes.length) setT(startTransform());
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
      node.style("opacity", (d) => (!near || near.has(d.id) ? null : 0.16));
      link.style("opacity", (l) => (!n || l.source.id === n.id || l.target.id === n.id ? null : 0.06))
        .classed("hot", (l) => !!n && (l.source.id === n.id || l.target.id === n.id));
    }
    function showTip(evt, html) {
      if (!tip) return;
      const box = svgEl.getBoundingClientRect();
      tip.innerHTML = html;
      const w = tip.offsetWidth || 260;
      tip.style.left = `${Math.max(8, Math.min(evt.clientX - box.left + 14, box.width - w - 8))}px`;
      tip.style.top = `${evt.clientY - box.top + 16}px`;
      tip.classList.add("on");
    }
    const hideTip = () => tip && tip.classList.remove("on");
    const hoverable = matchMedia("(hover: hover)").matches;
    if (opts.interactive) {
      if (hoverable) {
        node.on("mouseenter", (evt, n) => {
          focusOn(n);
          const summary = P.summaryOf(n.e, state.h).replace(/<[^>]+>/g, "");
          showTip(evt, `<strong>${P.esc(n.e.name)}</strong>${summary ? `<br><span class="muted">${P.esc(summary)}</span>` : ""}`);
        }).on("mouseleave", () => { focusOn(state.selected); hideTip(); });
        link.on("mouseenter", (evt, l) => {
          const u = P.unitById[l.cite];
          const who = l.basis === "said" && l.said_by ? `, says ${P.esc(l.said_by)}` : l.basis === "seen" ? "" : ` (${l.basis === "inferred" ? "Wade's reading" : l.basis})`;
          showTip(evt, `${P.esc(l.source.e.name)} → ${P.esc(l.target.e.name)}<br><strong>${P.esc(l.label)}</strong>${who}<br><span class="muted">${P.esc(P.TYPES[l.type].label)}, ${P.esc(P.unitLabel(u, { short: true }))}</span>`);
        }).on("mouseleave", hideTip);
      }
      node.on("click", (evt, n) => { evt.stopPropagation(); api.select(n.id); })
        .on("keydown", (evt, n) => { if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); api.select(n.id); } });
      svg.on("click", (evt) => { if (evt.target === svgEl) api.select(null); });
    }

    // ------------------------------------------------------------ state
    const state = { h: lim, types: new Set(Object.keys(P.TYPES)), selected: null };
    const shown = (l) => l.h <= state.h && state.types.has(l.type);
    function apply(prevH, sweepMs) {
      curH = state.h;
      layoutLabels();
      const lit = (n) => P.isPov(n.id, state.h);
      body.selectAll("rect,circle")
        .attr("fill", (n) => (lit(n) ? `url(#${uid}-lit)` : `url(#${uid}-dull)`))
        .attr("stroke", (n) => (lit(n) ? "#d8ecff" : n.square ? "#c9a46a" : "#ece4d2"))
        .attr("stroke-opacity", (n) => (lit(n) ? 1 : 0.8))
        .attr("filter", (n) => (lit(n) ? `url(#${uid}-glow)` : null));
      node.select(".halo").style("display", (n) => (lit(n) ? null : "none"));
      node.style("display", (n) => (n.h <= state.h ? null : "none"));
      link.style("display", (l) => (shown(l) ? null : "none"));
      if (prevH !== undefined && prevH < state.h && !P.reducedMotion) {
        const cw = svgEl.getBoundingClientRect().width || W;
        const delay = (n) => (sweepMs ? Math.max(0, Math.min(1, T.applyX(n.x) / cw)) * sweepMs * 0.9 : 0);
        node.filter((n) => n.h > prevH && n.h <= state.h).select(".node-body")
          .classed("infusing", false).style("animation-delay", (n) => `${delay(n)}ms`)
          .each(function () { void this.getBoundingClientRect(); }).classed("infusing", true);
        link.filter((l) => l.h > prevH && l.h <= state.h).classed("drawing", false)
          .style("--dl", null).each(function (l) {
            this.querySelector(".edge-line").style.animationDelay = `${Math.max(delay(l.source), delay(l.target)) + 250}ms`;
            void this.getBoundingClientRect();
          }).classed("drawing", true);
      }
      if (state.selected && state.selected.h > state.h) api.select(null);
      else focusOn(state.selected);
    }
    const api = {
      nodes, links,
      setHorizon(h, o = {}) { const prev = state.h; state.h = h; apply(prev, o.sweepMs); },
      setTypes(types) { state.types = new Set(types); apply(); },
      select(id, o = {}) {
        const n = id ? byId[id] : null;
        state.selected = n && n.h <= state.h ? n : null;
        node.classed("selected", (d) => d === state.selected);
        focusOn(state.selected);
        if (state.selected && o.center && zoom) {
          const b = svgEl.getBoundingClientRect(), k = Math.max(T.k, 1.1);
          setT(d3.zoomIdentity.translate(b.width / 2 - n.x * k, b.height * 0.4 - n.y * k).scale(k), 600);
          userMoved = true;
        }
        if (opts.onSelect) opts.onSelect(state.selected);
      },
      neighbours: (id) => (byId[id] ? [...neighbours(byId[id])].filter((x) => x !== id) : []),
      count: (type) => links.filter((l) => l.type === type && l.h <= state.h).length,
      visibleCounts: () => ({ nodes: nodes.filter((n) => n.h <= state.h).length, links: links.filter(shown).length }),
      fit() { userMoved = false; setT(fitTransform(), 500); },
      zoomBy(f) { if (zoom) svg.transition().duration(P.reducedMotion ? 0 : 300).call(zoom.scaleBy, f); },
      has: (id) => !!byId[id],
    };
    apply();
    return api;
  };
})();
