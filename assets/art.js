/* The Wade of Kings — procedural art for the living dispatches.
   Faceted gems, glass spheres and irises, drawn as SVG strings so the same code runs in the
   browser and in node (for the static previews on the Dispatches wall). No external images. */
(function (root) {
  "use strict";

  // ------------------------------------------------------------ colour helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${clamp(s, 0, 100).toFixed(1)}%,${clamp(l, 0, 100).toFixed(1)}%,${a})`;
  // Deterministic jitter so every render of a gem sparkles the same way.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  let uid = 0;
  const nextId = (p) => `${p}${(uid += 1).toString(36)}`;
  const pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const poly = (pts) => pts.map((p) => p.map((v) => v.toFixed(2)).join(",")).join(" ");

  // ------------------------------------------------------------ the gems we've met
  // hue/sat/light describe the stone; glow is the colour of its Stormlight.
  const GEMS = {
    diamond:    { h: 205, s: 35, l: 86, glow: "#eef6ff", fire: true },
    garnet:     { h: 322, s: 62, l: 30, glow: "#c45fb8" },
    amethyst:   { h: 276, s: 58, l: 56, glow: "#b993ff" },
    sapphire:   { h: 214, s: 82, l: 48, glow: "#5fb0ff" },
    ruby:       { h: 352, s: 82, l: 44, glow: "#ff5a6e" },
    emerald:    { h: 152, s: 72, l: 38, glow: "#46e39c" },
    smokestone: { h: 222, s: 10, l: 14, glow: "#cfd5e2" },
  };

  // ------------------------------------------------------------ a round brilliant, seen from above
  function gem(kind, opts = {}) {
    const g = GEMS[kind] || GEMS.diamond;
    const size = opts.size || 120;
    const R = 48;
    const glow = opts.glow === undefined ? 1 : opts.glow;     // 0 = dun, 1 = fully infused
    const rand = rng(opts.seed || kind.length * 97 + 13);
    const id = nextId("g");
    const light = -Math.PI * 0.72;                             // light from the upper left
    const shade = (a, depth) => {
      const facing = Math.cos(a - light);                     // -1 .. 1
      const j = (rand() - 0.5) * 16;
      const l = g.l + facing * (g.l > 70 ? 9 : 16) + depth + j;
      const s = g.s + (rand() - 0.5) * 10;
      return hsl(g.h + (rand() - 0.5) * (g.fire ? 70 : 8), g.fire ? s * 0.6 : s, l);
    };
    const facets = [];
    const n = 8, step = (Math.PI * 2) / n, off = -Math.PI / 2;
    const table = Array.from({ length: n }, (_, i) => pt(R * 0.52, off + i * step));
    const star = Array.from({ length: n }, (_, i) => pt(R * 0.78, off + (i + 0.5) * step));
    const girdle = Array.from({ length: n * 2 }, (_, i) => pt(R, off + i * step / 2));
    for (let i = 0; i < n; i++) {
      const a = off + i * step, b = (i + 1) % n;
      // star facet: table edge out to a star point
      facets.push([[table[i], table[b], star[i]], shade(a + step / 2, 4)]);
      // kite (bezel): table vertex, star either side, girdle vertex
      const prevStar = star[(i + n - 1) % n];
      facets.push([[table[i], star[i], girdle[i * 2], prevStar], shade(a, -2)]);
      // upper girdle pair
      facets.push([[star[i], girdle[i * 2], girdle[i * 2 + 1]], shade(a + step * 0.25, -8)]);
      facets.push([[star[i], girdle[i * 2 + 1], girdle[(i * 2 + 2) % (n * 2)]], shade(a + step * 0.75, -10)]);
    }
    const tableFill = shade(light + Math.PI, 10);
    const anim = opts.animate === false ? "" : ' class="facet-shimmer"';
    const glowA = (0.25 + 0.75 * glow).toFixed(2);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 -70 140 140" width="${size}" height="${size}" role="img" aria-label="${opts.label || kind}">
<defs>
  <radialGradient id="${id}h" cx="38%" cy="30%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity="${(0.55 * (0.4 + glow)).toFixed(2)}"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset=".35" stop-color="${g.glow}" stop-opacity="${glowA}"/><stop offset="1" stop-color="${g.glow}" stop-opacity="0"/></radialGradient>
  <filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<circle r="66" fill="url(#${id}g)" opacity="${(0.15 + 0.85 * glow).toFixed(2)}" filter="url(#${id}b)"/>
<g stroke="${hsl(g.h, g.s, Math.min(96, g.l + 26), 0.55)}" stroke-width=".55" stroke-linejoin="round">`;
    facets.forEach(([p, fill], i) => {
      svg += `<polygon points="${poly(p)}" fill="${fill}"${anim} style="--d:${(i * 0.137) % 4}s"/>`;
    });
    svg += `<polygon points="${poly(table)}" fill="${tableFill}"${anim} style="--d:1.3s"/></g>
<polygon points="${poly(girdle)}" fill="url(#${id}h)"/>
<polygon points="${poly(girdle)}" fill="none" stroke="${hsl(g.h, g.s * 0.5, Math.min(97, g.l + 35), 0.8)}" stroke-width="1"/>`;
    // a few glints
    if (glow > 0.2) {
      for (let k = 0; k < 3; k++) {
        const [x, y] = pt(R * (0.25 + rand() * 0.55), light + (rand() - 0.5) * 1.6);
        const s = 2 + rand() * 3.5;
        svg += `<path class="glint" style="--d:${(k * 1.7).toFixed(1)}s" d="M${(x - s).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y - s * 0.25).toFixed(1)}L${(x + s).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y + s * 0.25).toFixed(1)}ZM${x.toFixed(1)} ${(y - s).toFixed(1)}L${(x + s * 0.25).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y + s).toFixed(1)}L${(x - s * 0.25).toFixed(1)} ${y.toFixed(1)}Z" fill="#fff" opacity="${(0.5 * glow + 0.2).toFixed(2)}"/>`;
      }
    }
    return svg + "</svg>";
  }

  // ------------------------------------------------------------ a sphere: glass bead with a gem at its heart
  function sphere(kind, opts = {}) {
    const size = opts.size || 140;
    const gemScale = opts.gemScale || 0.34;                    // chip ~0.16, mark ~0.27, broam ~0.42
    const glow = opts.glow === undefined ? 1 : opts.glow;
    const g = GEMS[kind] || GEMS.diamond;
    const id = nextId("s");
    const inner = gem(kind, { size: 140, glow, seed: opts.seed, animate: opts.animate })
      .replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const halo = (0.1 + 0.9 * glow) * (0.45 + gemScale);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -80 160 160" width="${size}" height="${size}" role="img" aria-label="${opts.label || kind + " sphere"}">
<defs>
  <radialGradient id="${id}glass" cx="50%" cy="50%" r="50%"><stop offset=".62" stop-color="#b9d3ee" stop-opacity=".04"/><stop offset=".93" stop-color="#cfe3f8" stop-opacity=".22"/><stop offset="1" stop-color="#e8f3ff" stop-opacity=".5"/></radialGradient>
  <radialGradient id="${id}spec" cx="34%" cy="26%" r="34%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${g.glow}" stop-opacity="${halo.toFixed(2)}"/><stop offset=".6" stop-color="${g.glow}" stop-opacity="${(halo * 0.35).toFixed(2)}"/><stop offset="1" stop-color="${g.glow}" stop-opacity="0"/></radialGradient>
  <filter id="${id}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
<circle r="78" fill="url(#${id}halo)" filter="url(#${id}blur)" class="halo"/>
<circle r="46" fill="${hsl(g.h, g.s * 0.4, 14, 0.35)}"/>
<g transform="scale(${(gemScale * 1.7).toFixed(3)})">${inner}</g>
<circle r="46" fill="url(#${id}glass)" stroke="rgba(220,236,255,.45)" stroke-width="1"/>
<ellipse cx="-14" cy="-20" rx="20" ry="11" transform="rotate(-28 -14 -20)" fill="url(#${id}spec)"/>
<path d="M 30 26 A 40 40 0 0 1 8 42" stroke="rgba(255,255,255,.28)" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;
  }

  // A sphere whose light is black: a dark heart that seems to glow anyway.
  function blackSphere(opts = {}) {
    const size = opts.size || 140;
    const id = nextId("k");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -80 160 160" width="${size}" height="${size}" role="img" aria-label="${opts.label || "a sphere with a black light"}">
<defs>
  <radialGradient id="${id}a" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".95"/><stop offset=".55" stop-color="#05040a" stop-opacity=".75"/><stop offset="1" stop-color="#0a0812" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}r" cx="50%" cy="50%" r="50%"><stop offset=".78" stop-color="#8f86b8" stop-opacity="0"/><stop offset=".9" stop-color="#b7b0e0" stop-opacity=".55"/><stop offset="1" stop-color="#b7b0e0" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}spec" cx="34%" cy="26%" r="34%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
</defs>
<circle r="80" fill="url(#${id}a)" filter="url(#${id}b)" class="halo dark-halo"/>
<circle r="60" fill="url(#${id}r)" filter="url(#${id}b)" class="halo"/>
<circle r="46" fill="#030306"/>
<circle r="18" fill="#000" stroke="#2c2840" stroke-width="1.2"/>
<circle r="46" fill="none" stroke="rgba(200,195,235,.4)" stroke-width="1"/>
<ellipse cx="-14" cy="-20" rx="20" ry="11" transform="rotate(-28 -14 -20)" fill="url(#${id}spec)"/>
</svg>`;
  }

  // ------------------------------------------------------------ an iris
  // tone: {h,s,l}; dark=true squeezes the colour toward brown-black, revealed only "in the right light".
  function iris(tone, opts = {}) {
    const size = opts.size || 120;
    const rand = rng(opts.seed || Math.round(tone.h * 31 + tone.l * 7) || 7);
    const id = nextId("i");
    const lit = opts.lit === undefined ? 1 : opts.lit;          // 0..1, how much light falls on it
    const glowing = opts.glowing || 0;                           // 0..1, the iris itself gives off light
    const R = 50, pupil = (opts.pupil || 0.34) * R;
    const base = (dl = 0, ds = 0) => hsl(tone.h, tone.s + ds, tone.l + dl);
    let fibres = "";
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * Math.PI * 2 + (rand() - 0.5) * 0.03;
      const r0 = pupil + 1 + rand() * 4, r1 = R * (0.82 + rand() * 0.17);
      const bend = (rand() - 0.5) * 0.12;
      const [x0, y0] = pt(r0, a), [xm, ym] = pt((r0 + r1) / 2, a + bend), [x1, y1] = pt(r1, a);
      const l = tone.l + (rand() - 0.35) * 26 * (0.4 + lit * 0.6);
      fibres += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}Q${xm.toFixed(1)} ${ym.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${hsl(tone.h + (rand() - 0.5) * 14, tone.s + (rand() - 0.5) * 20, l, 0.55)}" stroke-width="${(0.5 + rand() * 1.1).toFixed(2)}"/>`;
    }
    let crypts = "";
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2, r = pupil + 6 + rand() * (R * 0.45);
      const [x, y] = pt(r, a);
      crypts += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(1.5 + rand() * 2.5).toFixed(1)}" ry="${(0.8 + rand() * 1.2).toFixed(1)}" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${base(-18)}" opacity=".55"/>`;
    }
    const glowCol = hsl(tone.h, Math.min(100, tone.s + 20), Math.min(85, tone.l + 30));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 128 128" width="${size}" height="${size}" role="img" aria-label="${opts.label || "an eye"}">
<defs>
  <radialGradient id="${id}b" cx="50%" cy="50%" r="50%"><stop offset="${(pupil / R).toFixed(2)}" stop-color="${base(-14, 6)}"/><stop offset=".55" stop-color="${base(4)}"/><stop offset=".86" stop-color="${base(-6)}"/><stop offset="1" stop-color="${base(-30, -10)}"/></radialGradient>
  <radialGradient id="${id}glow" cx="50%" cy="50%" r="50%"><stop offset=".5" stop-color="${glowCol}" stop-opacity="${(0.8 * glowing).toFixed(2)}"/><stop offset="1" stop-color="${glowCol}" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}shade" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
  <filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <clipPath id="${id}c"><circle r="${R}"/></clipPath>
</defs>
${glowing ? `<circle r="62" fill="url(#${id}glow)" filter="url(#${id}f)" class="iris-glow"/>` : ""}
<circle r="${R}" fill="url(#${id}b)"/>
<g clip-path="url(#${id}c)" fill="none">${fibres}${crypts}
  <circle r="${(pupil + R * 0.2).toFixed(1)}" stroke="${base(10, -5)}" stroke-width="2.2" stroke-dasharray="3 2.2" opacity=".55"/>
</g>
<circle r="${R}" fill="url(#${id}shade)"/>
<circle r="${R - 0.6}" fill="none" stroke="${base(-32, -20)}" stroke-width="2.4" opacity=".9"/>
<circle r="${pupil.toFixed(1)}" fill="#050608" class="pupil"/>
<ellipse cx="-17" cy="-19" rx="9" ry="6.5" transform="rotate(-25 -17 -19)" fill="#fff" opacity="${(0.25 + 0.6 * lit).toFixed(2)}"/>
<circle cx="15" cy="14" r="2.6" fill="#fff" opacity="${(0.15 + 0.35 * lit).toFixed(2)}"/>
<circle r="${R}" fill="#000" opacity="${((1 - lit) * 0.55).toFixed(2)}"/>
</svg>`;
  }

  // Shared bits for the dispatch pages.
  const STYLE = `
  .facet-shimmer { animation: facet 5.5s ease-in-out infinite; animation-delay: calc(var(--d) * -1); }
  @keyframes facet { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.28); } }
  .glint { transform-box: fill-box; transform-origin: center; animation: glint 4.2s ease-in-out infinite; animation-delay: var(--d); }
  @keyframes glint { 0%, 70%, 100% { opacity: 0; transform: scale(.4); } 80% { opacity: .95; transform: scale(1.15); } }
  .halo { animation: breathe 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes breathe { 0%, 100% { opacity: .85; transform: scale(.97); } 50% { opacity: 1; transform: scale(1.03); } }
  @media (prefers-reduced-motion: reduce) { .facet-shimmer, .glint, .halo { animation: none; } }`;

  root.ART = { GEMS, gem, sphere, blackSphere, iris, STYLE, hsl };
  if (typeof module !== "undefined") module.exports = root.ART;
})(typeof window !== "undefined" ? window : globalThis);
