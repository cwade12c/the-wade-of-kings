/* The Unfolding: who is connected to whom, drawn from codex/relations.toml.
   The layout is computed once for everything visible, so scrubbing through chapters
   only lights and dims nodes in place. New nodes "infuse" into view. */
(function () {
  "use strict";
  const W = 1000, HGT = 680;
  const CIRCLE_ORDER = ["heralds", "szeth", "kholin", "shattered-plains", "amaram-army", "kaladin-family",
    "caravan", "purelake", "davar", "kharbranth"];
  const DASH = { seen: null, said: "7 5", inferred: "1.5 5", guess: "1.5 5" };

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

    // clusters ("circles") sit on an ellipse, in an order that keeps related ones adjacent
    const circles = [...new Set(nodes.map((n) => n.circle))]
      .sort((a, b) => ((CIRCLE_ORDER.indexOf(a) + 1) || 99) - ((CIRCLE_ORDER.indexOf(b) + 1) || 99));
    const ring = circles.filter((c) => c);
    const anchor = { "": [W / 2, HGT / 2] };
    ring.forEach((c, i) => {
      const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      anchor[c] = [W / 2 + Math.cos(a) * 330, HGT / 2 + Math.sin(a) * 215];
    });
    nodes.forEach((n, i) => {
      const [ax, ay] = anchor[n.circle];
      n.x = ax + Math.cos(i * 2.4) * 25;
      n.y = ay + Math.sin(i * 2.4) * 25;
    });
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance((l) => (l.type === "family" ? 55 : 85)).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-230))
      .force("collide", d3.forceCollide((d) => d.r + 18))
      .force("x", d3.forceX((d) => anchor[d.circle][0]).strength(0.13))
      .force("y", d3.forceY((d) => anchor[d.circle][1]).strength(0.13))
      .stop();
    for (let i = 0; i < 420; i++) sim.tick();
    nodes.forEach((n) => {
      n.x = Math.max(50, Math.min(W - 50, n.x));
      n.y = Math.max(28, Math.min(HGT - 28, n.y));
    });

    const svg = d3.select(svgEl).attr("viewBox", `0 0 ${W} ${HGT}`).attr("preserveAspectRatio", "xMidYMid meet");
    svg.selectAll("*").remove();
    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id", "lit").attr("cx", "35%").attr("cy", "30%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff");
    grad.append("stop").attr("offset", "45%").attr("stop-color", "#d8ecff");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#6f8fb3");
    const glow = defs.append("filter").attr("id", "glow").attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
    glow.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "b");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "b");
    merge.append("feMergeNode").attr("in", "SourceGraphic");
    // end markers: a second cue beside colour (arrow = command, dot = support, bar = hostility)
    const marker = (id, color, draw) => {
      const m = defs.append("marker").attr("id", id).attr("viewBox", "-6 -6 12 12").attr("refX", 0).attr("refY", 0)
        .attr("markerWidth", 9).attr("markerHeight", 9).attr("orient", "auto").attr("markerUnits", "userSpaceOnUse");
      draw(m, color);
    };
    marker("m-command", P.TYPES.command.hex, (m, c) => m.append("path").attr("d", "M-4,-4L3,0L-4,4").attr("fill", "none").attr("stroke", c).attr("stroke-width", 2));
    marker("m-support", P.TYPES.support.hex, (m, c) => m.append("circle").attr("r", 3).attr("fill", c));
    marker("m-hostile", P.TYPES.hostile.hex, (m, c) => m.append("path").attr("d", "M0,-5L0,5").attr("stroke", c).attr("stroke-width", 2.5));

    const gLinks = svg.append("g");
    const gNodes = svg.append("g");

    function linkPath(l) {
      const s = l.source, t = l.target;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      let off = (l.idx - (l.total - 1) / 2) * 20;
      if (s.id > t.id) off = -off; // offsets relative to the pair's canonical direction
      const sx = s.x + ux * (s.r + 2), sy = s.y + uy * (s.r + 2);
      const end = l.type === "family" || l.type === "other" ? 2 : 7;
      const tx = t.x - ux * (t.r + end), ty = t.y - uy * (t.r + end);
      if (!off) return `M${sx},${sy}L${tx},${ty}`;
      return `M${sx},${sy}Q${(sx + tx) / 2 - uy * off},${(sy + ty) / 2 + ux * off} ${tx},${ty}`;
    }

    const link = gLinks.selectAll("g").data(links).join("g").attr("class", "edge");
    link.append("path").attr("class", "edge-line").attr("d", linkPath).attr("fill", "none")
      .attr("stroke", (l) => P.TYPES[l.type].hex).attr("stroke-width", 2).attr("stroke-linecap", "round")
      .attr("stroke-dasharray", (l) => DASH[l.basis])
      .attr("marker-end", (l) => (["command", "support", "hostile"].includes(l.type) ? `url(#m-${l.type})` : null));
    link.append("path").attr("class", "edge-hit").attr("d", linkPath).attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 12);

    const node = gNodes.selectAll("g").data(nodes).join("g").attr("class", "node")
      .attr("transform", (n) => `translate(${n.x},${n.y})`).attr("tabindex", opts.interactive ? 0 : null)
      .attr("role", opts.interactive ? "button" : null).attr("aria-label", (n) => n.e.name);
    const body = node.append("g").attr("class", "node-body");
    body.filter((n) => n.square).append("rect").attr("x", (n) => -n.r).attr("y", (n) => -n.r)
      .attr("width", (n) => n.r * 2).attr("height", (n) => n.r * 2).attr("rx", 3);
    body.filter((n) => !n.square).append("circle").attr("r", (n) => n.r);
    body.selectAll("rect,circle").attr("stroke-width", 1.5);
    const major = (n) => P.isPov(n.id, lim) || n.degree >= 3;
    const showLabel = (n) => opts.labels === "all" || (opts.labels === "major" && major(n));
    node.filter(showLabel).append("text").attr("class", (n) => `web-label${major(n) ? "" : " minor"}`)
      .attr("x", (n) => n.r + 5).attr("y", 4).text((n) => n.e.name.replace(/^The /, ""));

    // ------------------------------------------------------------ interaction
    const tip = opts.tip;
    const neighbours = (n) => {
      const set = new Set([n.id]);
      links.forEach((l) => { if (l.source.id === n.id) set.add(l.target.id); if (l.target.id === n.id) set.add(l.source.id); });
      return set;
    };
    function focusOn(n) {
      const near = n ? neighbours(n) : null;
      node.style("opacity", (d) => (!near || near.has(d.id) ? null : 0.18));
      link.style("opacity", (l) => (!n || l.source.id === n.id || l.target.id === n.id ? null : 0.08));
    }
    function showTip(evt, html) {
      if (!tip) return;
      const box = svgEl.getBoundingClientRect();
      tip.innerHTML = html;
      tip.style.left = `${Math.min(evt.clientX - box.left + 14, box.width - 290)}px`;
      tip.style.top = `${evt.clientY - box.top + 14}px`;
      tip.classList.add("on");
    }
    const hideTip = () => tip && tip.classList.remove("on");
    if (opts.interactive) {
      node.on("mouseenter", (evt, n) => {
        focusOn(n);
        const summary = P.summaryOf(n.e, state.h).replace(/<[^>]+>/g, "");
        showTip(evt, `<strong>${P.esc(n.e.name)}</strong><br><span class="muted">${P.esc(summary)}</span>`);
      }).on("mouseleave", () => { focusOn(state.selected); hideTip(); })
        .on("click", (evt, n) => api.select(n.id))
        .on("keydown", (evt, n) => { if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); api.select(n.id); } });
      link.on("mouseenter", (evt, l) => {
        const u = P.data.units.find((x) => x.id === l.cite);
        const who = l.basis === "said" && l.said_by ? `, says ${P.esc(l.said_by)}` : l.basis === "seen" ? "" : ` (${l.basis})`;
        showTip(evt, `${P.esc(l.source.e.name)} → ${P.esc(l.target.e.name)}<br><strong>${P.esc(l.label)}</strong>${who}<br><span class="muted">${P.esc(P.TYPES[l.type].label)}, ${P.esc(P.unitLabel(u, { short: true }))}</span>`);
      }).on("mouseleave", hideTip);
      svgEl.addEventListener("click", (evt) => { if (evt.target === svgEl) api.select(null); });
    }

    // ------------------------------------------------------------ state
    const state = { h: lim, types: new Set(Object.keys(P.TYPES)), selected: null };
    function apply(prevH) {
      const lit = (n) => P.isPov(n.id, state.h);
      body.selectAll("rect,circle")
        .attr("fill", (n) => (lit(n) ? "url(#lit)" : "#1e2937"))
        .attr("stroke", (n) => (lit(n) ? "#d8ecff" : "#ece4d2"))
        .attr("filter", (n) => (lit(n) ? "url(#glow)" : null));
      node.style("display", (n) => (n.h <= state.h ? null : "none"));
      link.style("display", (l) => (l.h <= state.h && state.types.has(l.type) ? null : "none"));
      if (prevH !== undefined && prevH < state.h && !P.reducedMotion) {
        node.filter((n) => n.h > prevH && n.h <= state.h).select(".node-body")
          .classed("infusing", false).each(function () { void this.getBoundingClientRect(); }).classed("infusing", true);
        link.filter((l) => l.h > prevH && l.h <= state.h).classed("drawing", false)
          .each(function () { void this.getBoundingClientRect(); }).classed("drawing", true);
      }
    }
    const api = {
      nodes, links,
      setHorizon(h) { const prev = state.h; state.h = h; apply(prev); },
      setTypes(types) { state.types = new Set(types); apply(); },
      select(id) {
        const n = id ? byId[id] : null;
        state.selected = n && n.h <= state.h ? n : null;
        node.classed("selected", (d) => d === state.selected);
        focusOn(state.selected);
        if (opts.onSelect) opts.onSelect(state.selected);
      },
      count: (type) => links.filter((l) => l.type === type && l.h <= state.h).length,
    };
    apply();
    return api;
  };
})();
