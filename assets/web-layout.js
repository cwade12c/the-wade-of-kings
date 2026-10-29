/* The Unfolding's layouts: where everyone sits. Each takes plain descriptions of the names and
   ties and returns Map id -> [x, y]; none of them touches the renderer's own nodes, so the
   renderer can keep several and glide between them.

   - compact: the original layout, run over everyone. It's what Everyone and the home teaser
     have always shown, and The Cast's Compact spacing reuses it.
   - spacious: The Cast's own map of people and groups, roomier, with every name's box (sphere
     plus name) kept clear of its neighbours' so each name has a place to sit.
   - satellites: things, places, field guide and lore, each set beside whoever it's most tied to
     on the spacious map, with the people held still. Switching a layer on never moves a person. */
(function () {
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

  P.webLayout = {
    // items: [{ id, r, circle }]; links: [{ source, target, type }] (stated ties, by id)
    compact(items, links, W, HGT) {
      const ns = items.map((d) => ({ id: d.id, r: d.r, circle: d.circle }));
      const anchor = anchors(ns, W, HGT, 1);
      ns.forEach((n, i) => {
        const [ax, ay] = anchor[n.circle];
        n.x = ax + Math.cos(i * 2.4) * 25;
        n.y = ay + Math.sin(i * 2.4) * 25;
      });
      const sim = d3.forceSimulation(ns)
        .force("link", d3.forceLink(links.map((l) => ({ ...l }))).id((d) => d.id).distance((l) => (l.type === "family" ? 62 : 92)).strength(0.3))
        .force("charge", d3.forceManyBody().strength(-260))
        .force("collide", d3.forceCollide((d) => d.r + 22))
        .force("x", d3.forceX((d) => anchor[d.circle][0]).strength(0.13))
        .force("y", d3.forceY((d) => anchor[d.circle][1]).strength(0.13))
        .stop();
      for (let i = 0; i < 420; i++) sim.tick();
      // A last pass of collisions alone, wide enough that no two spheres touch even when drawn
      // at their largest. (Nothing is clamped to the box afterwards: the view fits whatever
      // shape the web takes, so spheres are never pushed back on top of each other.)
      const settle = d3.forceSimulation(ns).force("collide", d3.forceCollide((d) => d.r * BOOST_MAX + 12).iterations(3)).stop();
      for (let i = 0; i < 90; i++) settle.tick();
      return positions(ns);
    },

    // items: [{ id, r, lw, circle }] (lw: name width in layout px); links: [{ source, target, type, member }]
    spacious(items, links, W, HGT) {
      const ns = items.map((d) => ({ id: d.id, r: d.r, lw: d.lw, circle: d.circle }));
      const anchor = anchors(ns, W, HGT, 1.5);
      ns.forEach((n, i) => {
        const [ax, ay] = anchor[n.circle];
        n.x = ax + Math.cos(i * 2.4) * 25;
        n.y = ay + Math.sin(i * 2.4) * 25;
      });
      const sim = d3.forceSimulation(ns)
        .force("link", d3.forceLink(links.map((l) => ({ ...l }))).id((d) => d.id)
          .distance((l) => (l.member ? 74 : l.type === "family" ? 84 : 124)).strength((l) => (l.member ? 0.5 : 0.3)))
        .force("charge", d3.forceManyBody().strength(-420))
        .force("collide", d3.forceCollide((d) => d.r + 22))
        .force("x", d3.forceX((d) => anchor[d.circle][0]).strength(0.13))
        .force("y", d3.forceY((d) => anchor[d.circle][1]).strength(0.13))
        .force("box", boxCollide(7, 0.35))
        .stop();
      for (let i = 0; i < 420; i++) sim.tick();
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
      // nudge the satellites clear of every name's box, people held still
      const ns = fixedItems.map((d) => ({ id: d.id, r: d.r, lw: d.lw, x: pos.get(d.id)[0], y: pos.get(d.id)[1], fx: pos.get(d.id)[0], fy: pos.get(d.id)[1] }))
        .concat(sats.map((d) => ({ id: d.id, r: d.r, lw: d.lw, x: pos.get(d.id)[0], y: pos.get(d.id)[1] })));
      const sim = d3.forceSimulation(ns).force("box", boxCollide(7, 0.5)).velocityDecay(0.5).stop();
      for (let i = 0; i < 120; i++) sim.tick();
      return positions(ns);
    },
  };
})();
