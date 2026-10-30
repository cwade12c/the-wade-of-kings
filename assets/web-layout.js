/* The Unfolding's layouts: where everyone sits. Each takes plain descriptions of the names and
   ties and returns Map id -> [x, y]; none of them touches the renderer's own nodes, so the
   renderer can keep several and glide between them.

   - compact: the original layout, run over everyone. It's what Everything opens on and the home
     teaser has always shown; The Cast can use it too.
   - spacious: both views' roomier map. People and groups are laid out with every name's box
     (sphere plus name) kept clear of its neighbours', each with room for the larger sphere
     either view draws, so the same map serves The Cast and Everything.
   - satellites: things, places, field guide and lore, each set beside whoever it's most tied to
     on the spacious map and kept clear of every sphere at its largest, with the people held
     still. Switching a layer on never moves a person.

   The same file runs in the browser and in Node (tools/layout/layout.mjs), so the map the build
   draws ahead of time and the one the page works out live come from one copy of the maths.
   Given the previous map (prev), compact and spacious start everyone already placed where they
   were, held there by a spring, and newcomers beside the people they're tied to, so the map
   changes as little as it can from one checkpoint to the next. Nothing here is random: the same
   inputs always give the same map. */
(function (root) {
  "use strict";
  const CIRCLE_ORDER = ["heralds", "szeth", "kholin", "shattered-plains", "amaram-army", "kaladin-family",
    "caravan", "purelake", "davar", "kharbranth"];
  const BOOST_MAX = 1.8;   // as in web.js: the largest spheres are ever drawn, zoomed far out

  // clusters ("circles") sit on an ellipse, in an order that keeps related ones adjacent
  function anchors(items, W, HGT, spread) {
    const circles = [...new Set(items.map((n) => n.circle))]
      .sort((a, b) => ((CIRCLE_ORDER.indexOf(a) + 1) || 99) - ((CIRCLE_ORDER.indexOf(b) + 1) || 99));
    const ring = circles.filter((c) => c);
    const anchor = { "": [W / 2, HGT / 2] };
    ring.forEach((c, i) => {
      const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      anchor[c] = [W / 2 + Math.cos(a) * W * 0.33 * spread, HGT / 2 + Math.sin(a) * HGT * 0.32 * spread];
    });
    return anchor;
  }

  // Label-aware collision: each node's box spans its sphere and its name to the right. Where two
  // boxes overlap, both are pushed apart along the axis of smaller overlap.
  function boxCollide(pad, strength) {
    let ns = [];
    const bx = (n) => [n.x - n.r - pad, n.y - Math.max(n.r, 9) - pad, n.x + n.r + 5 + n.lw + pad, n.y + Math.max(n.r, 9) + pad];
    function force() {
      for (let i = 0; i < ns.length; i++) {
        const a = ns[i], A = bx(a);
        for (let j = i + 1; j < ns.length; j++) {
          const b = ns[j], B = bx(b);
          const ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
          if (ox <= 0 || oy <= 0) continue;
          if (ox < oy) { const d = (A[0] + A[2] < B[0] + B[2] ? -1 : 1) * ox * strength; a.vx += d; b.vx -= d; }
          else { const d = (A[1] + A[3] < B[1] + B[3] ? -1 : 1) * oy * strength; a.vy += d; b.vy -= d; }
        }
      }
    }
    force.initialize = (n) => { ns = n; };
    return force;
  }

  const positions = (ns) => new Map(ns.map((n) => [n.id, [n.x, n.y]]));

  // a number in [0, 1) from an id: the same id always gives the same number
  function hash(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  // Where everyone starts. With no previous map: around their circle's anchor, as always. With
  // one: where they were, and a newcomer at the mean of its tied neighbours already placed (else
  // its anchor), nudged a little in a direction taken from its id.
  function start(ns, links, anchor, prev) {
    ns.forEach((n, i) => {
      const [ax, ay] = anchor[n.circle];
      n.x = ax + Math.cos(i * 2.4) * 25;
      n.y = ay + Math.sin(i * 2.4) * 25;
    });
    if (!prev) return;
    ns.forEach((n) => { const p = prev.get(n.id); if (p) { [n.x, n.y] = p; n.px = p[0]; n.py = p[1]; } });
    const byId = new Map(ns.map((n) => [n.id, n]));
    ns.forEach((n) => {
      if (n.px !== undefined) return;
      const near = links.filter((l) => l.source === n.id || l.target === n.id)
        .map((l) => byId.get(l.source === n.id ? l.target : l.source)).filter((m) => m && m.px !== undefined);
      const [mx, my] = near.length ? [near.reduce((a, m) => a + m.px, 0) / near.length, near.reduce((a, m) => a + m.py, 0) / near.length] : anchor[n.circle];
      const a = hash(n.id) * Math.PI * 2;
      n.x = mx + Math.cos(a) * 12;
      n.y = my + Math.sin(a) * 12;
    });
  }
  // the normal forces, run from scratch (420 ticks) or, from a previous map, for 300 ticks from
  // alpha 0.3 with everyone already placed held by a spring of strength 0.3
  function run(sim, prev) {
    if (prev) {
      sim.force("px", root.d3.forceX((d) => d.px ?? 0).strength((d) => (d.px === undefined ? 0 : 0.3)))
        .force("py", root.d3.forceY((d) => d.py ?? 0).strength((d) => (d.py === undefined ? 0 : 0.3)))
        .alpha(0.3);
    }
    for (let i = 0, n = prev ? 300 : 420; i < n; i++) sim.tick();
  }

  // Sphere sizes, as the views draw them: Everything by ties, The Cast by how often the book names them.
  const byTies = (degree) => 5 + Math.sqrt(degree) * 2.6;
  const byMentions = (m) => Math.min(20, 4 + 0.55 * Math.sqrt(m));

  const P = root.P || (root.P = {});
  P.webLayout = {
    byTies, byMentions,
    // Everyone the page draws at horizon lim: a name is on the map once it has a tie there (with
    // the family ties that follow from others, if asked) and both ends have been met.
    // h: { implied, faint(r), layerOf(e), mentionsAt(e, h) }, the page's own helpers.
    graph(D, lim, h) {
      const ent = Object.fromEntries(D.entities.map((e) => [e.id, e]));
      const rels = D.relations.concat(h.implied ? D.implied || [] : [])
        .filter((r) => r.h <= lim && ent[r.from] && ent[r.to] && ent[r.from].h <= lim && ent[r.to].h <= lim);
      const ids = new Set();
      rels.forEach((r) => { ids.add(r.from); ids.add(r.to); });
      const nodes = [...ids].map((id) => ({ id, e: ent[id], degree: 0 }));
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      rels.forEach((r) => { if (!h.faint(r)) { byId[r.from].degree++; byId[r.to].degree++; } });
      nodes.forEach((n) => {
        n.rE = byTies(n.degree);
        n.rMax = byMentions(h.mentionsAt(n.e, lim));   // The Cast's sphere, at its largest
        n.circle = n.e.circle || "";
        n.layer = h.layerOf(n.e);
        n.lw = n.e.name.replace(/^The /, "").length * 6.9;   // name width in layout px, before the fonts load
        n.named = h.mentionsAt(n.e, lim);    // how often the book names them by lim
      });
      return { nodes, byId, rels, stated: rels.filter((r) => !h.faint(r)) };
    },
    // One of the two maps of a graph, in a box W × HGT: "compact" or "spacious" (with its
    // satellites). prev: the same map at an earlier checkpoint (Map id -> [x, y]), or nothing.
    map(name, g, W, HGT, prev) {
      const L = P.webLayout;
      if (name === "compact") {
        return L.compact(g.nodes.map((n) => ({ id: n.id, r: n.rE, circle: n.circle })),
          g.stated.map((l) => ({ source: l.from, target: l.to, type: l.type })), W, HGT, prev);
      }
      const people = g.nodes.filter((n) => n.layer === "cast" || n.layer === "groups"), inside = new Set(people.map((n) => n.id));
      // room for the larger sphere either view draws here
      const items = (ns) => ns.map((n) => ({ id: n.id, r: Math.max(n.rE, n.rMax), lw: n.lw, circle: n.circle }));
      const fixed = L.spacious(items(people),
        g.stated.filter((l) => inside.has(l.from) && inside.has(l.to)).map((l) => ({ source: l.from, target: l.to, type: l.type, member: !!l.member })), W, HGT, prev);
      const sats = g.nodes.filter((n) => !inside.has(n.id));
      return sats.length ? L.satellites(fixed, items(people), items(sats), g.stated.map((l) => [l.from, l.to]), (id) => g.byId[id].named) : fixed;
    },

    // items: [{ id, r, circle }]; links: [{ source, target, type }] (stated ties, by id)
    compact(items, links, W, HGT, prev) {
      const d3 = root.d3;
      const ns = items.map((d) => ({ id: d.id, r: d.r, circle: d.circle }));
      const anchor = anchors(ns, W, HGT, 1);
      start(ns, links, anchor, prev);
      const sim = d3.forceSimulation(ns)
        .force("link", d3.forceLink(links.map((l) => ({ ...l }))).id((d) => d.id).distance((l) => (l.type === "family" ? 62 : 92)).strength(0.3))
        .force("charge", d3.forceManyBody().strength(-260))
        .force("collide", d3.forceCollide((d) => d.r + 22))
        .force("x", d3.forceX((d) => anchor[d.circle][0]).strength(0.13))
        .force("y", d3.forceY((d) => anchor[d.circle][1]).strength(0.13))
        .stop();
      run(sim, prev);
      // A last pass of collisions alone, wide enough that no two spheres touch even when drawn
      // at their largest. (Nothing is clamped to the box afterwards: the view fits whatever
      // shape the web takes, so spheres are never pushed back on top of each other.)
      const settle = d3.forceSimulation(ns).force("collide", d3.forceCollide((d) => d.r * BOOST_MAX + 12).iterations(3)).stop();
      for (let i = 0; i < 90; i++) settle.tick();
      return positions(ns);
    },

    // items: [{ id, r, lw, circle }] (lw: name width in layout px); links: [{ source, target, type, member }]
    spacious(items, links, W, HGT, prev) {
      const d3 = root.d3;
      const ns = items.map((d) => ({ id: d.id, r: d.r, lw: d.lw, circle: d.circle }));
      const anchor = anchors(ns, W, HGT, 1.5);
      start(ns, links, anchor, prev);
      const sim = d3.forceSimulation(ns)
        .force("link", d3.forceLink(links.map((l) => ({ ...l }))).id((d) => d.id)
          .distance((l) => (l.member ? 74 : l.type === "family" ? 84 : 124)).strength((l) => (l.member ? 0.5 : 0.3)))
        .force("charge", d3.forceManyBody().strength(-420))
        .force("collide", d3.forceCollide((d) => d.r + 22))
        .force("x", d3.forceX((d) => anchor[d.circle][0]).strength(0.13))
        .force("y", d3.forceY((d) => anchor[d.circle][1]).strength(0.13))
        .force("box", boxCollide(7, 0.35))
        .stop();
      run(sim, prev);
      const settle = d3.forceSimulation(ns)
        .force("collide", d3.forceCollide((d) => d.r * 1.8 + 12).iterations(3))
        .force("box", boxCollide(7, 0.5))
        .stop();
      for (let i = 0; i < 160; i++) settle.tick();
      return positions(ns);
    },

    // fixed: Map id -> [x, y] of people and groups, with their items [{ id, r, lw }];
    // sats: [{ id, r, lw }]; ties: [[a, b]] (stated ties, by id, one entry per tie);
    // score(id): the tie-breaker between equally tied neighbours (higher first)
    satellites(fixed, fixedItems, sats, ties, score) {
      const d3 = root.d3;
      const pos = new Map(fixed);
      const adj = new Map();
      const bump = (a, b) => {
        if (!adj.has(a)) adj.set(a, new Map());
        adj.get(a).set(b, (adj.get(a).get(b) || 0) + 1);
      };
      ties.forEach(([a, b]) => { if (a !== b) { bump(a, b); bump(b, a); } });
      const rOf = new Map(fixedItems.concat(sats).map((d) => [d.id, d.r]));
      const xs = [...fixed.values()];
      const cx = xs.reduce((a, p) => a + p[0], 0) / Math.max(1, xs.length), cy = xs.reduce((a, p) => a + p[1], 0) / Math.max(1, xs.length);
      const tiesTo = (id, set) => [...(adj.get(id) || new Map())].filter(([o]) => set.has(o));
      const left = sats.slice();
      const used = new Map();   // how many satellites already sit by each neighbour
      while (left.length) {
        // the best-anchored satellite next: most ties to anyone already placed, then by id
        left.sort((a, b) => tiesTo(b.id, pos).reduce((s, x) => s + x[1], 0) - tiesTo(a.id, pos).reduce((s, x) => s + x[1], 0) || (a.id < b.id ? -1 : 1));
        const s = left.shift();
        const cands = tiesTo(s.id, pos).sort((a, b) => b[1] - a[1] || score(b[0]) - score(a[0]) || (a[0] < b[0] ? -1 : 1));
        if (!cands.length) {   // tied to no one placed: the edge of the map, out of everyone's way
          const k = used.get("") || 0;
          used.set("", k + 1);
          const a = k * 0.7;
          pos.set(s.id, [cx + Math.cos(a) * (300 + k * 8), cy + Math.sin(a) * (300 + k * 8)]);
          continue;
        }
        const nb = cands[0][0], [nx, ny] = pos.get(nb);
        // face away from the neighbour's own neighbours
        let vx = 0, vy = 0;
        for (const [o] of tiesTo(nb, pos)) {
          const [ox, oy] = pos.get(o), d = Math.hypot(ox - nx, oy - ny) || 1;
          vx += (ox - nx) / d; vy += (oy - ny) / d;
        }
        if (Math.hypot(vx, vy) < 1e-6) { vx = nx - cx; vy = ny - cy; } else { vx = -vx; vy = -vy; }
        if (Math.hypot(vx, vy) < 1e-6) vx = 1;
        const k = used.get(nb) || 0;
        used.set(nb, k + 1);
        const a = Math.atan2(vy, vx) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
        const dist = (rOf.get(nb) || 6) + 40;
        pos.set(s.id, [nx + Math.cos(a) * dist, ny + Math.sin(a) * dist]);
      }
      // nudge the satellites clear of every name's box and every sphere at its largest, people held still
      const ns = fixedItems.map((d) => ({ id: d.id, r: d.r, lw: d.lw, x: pos.get(d.id)[0], y: pos.get(d.id)[1], fx: pos.get(d.id)[0], fy: pos.get(d.id)[1] }))
        .concat(sats.map((d) => ({ id: d.id, r: d.r, lw: d.lw, x: pos.get(d.id)[0], y: pos.get(d.id)[1] })));
      const sim = d3.forceSimulation(ns)
        .force("collide", d3.forceCollide((d) => d.r * BOOST_MAX + 12).iterations(4))
        .force("box", boxCollide(7, 0.5)).velocityDecay(0.5).stop();
      for (let i = 0; i < 240; i++) sim.tick();
      // a last pass of collisions alone, as the other two maps end: no sphere touches another, even zoomed far out
      const settle = d3.forceSimulation(ns).force("collide", d3.forceCollide((d) => d.r * BOOST_MAX + 12).iterations(3)).velocityDecay(0.5).stop();
      for (let i = 0; i < 90; i++) settle.tick();
      return positions(ns);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
