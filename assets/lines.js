/* The Wade of Kings — POV Lines, the Unfolding's second tab (playbooks/unfolding/pov-lines.md).
   Whose eyes each chapter uses, drawn as transit lines: one lane per viewpoint character, a
   station for each unit told through their eyes, an interchange where two share a unit, a dip
   for a flashback, and one teal lane for the interludes whose viewpoints have no lane of their
   own. One inline SVG draws the lanes; stations, names and labels are HTML over it. Everything
   is worked out at the reader's limit (Wade's bookmark, or a friend's), so nothing stands for a
   chapter not yet read, and every station and lane looks the same, whoever it belongs to.

   P.lines(host, opts) → { setHorizon(h, o), scrollTo(h, o), highlight(id | null), setReserve(r), debug() }
     opts.onPick(h)   a station was chosen
     opts.onLane(id)  a lane's name was tapped ("interludes" for the Interludes lane)
     opts.tip         an element for the desktop hover tip (.web-tip)
     opts.narrow()    whether the stage is a phone's */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const DIP = 0.45;        // a flashback station dips this much of a lane pitch below its lane
  const FADE = 0.6;        // every lane ends with a fade this much of a column past its latest station
  const UNREAD_W = 84;     // the dock's "unread" mark after the last column
  const WIDE = 900;        // stages at least this wide set each title at −40°, and a flashback's time beside it
  const TITLE_RUN = 140;   // how far right of its column a title at −40° reaches
  const PEEK = 96;         // the room a phone keeps under the lanes for the station card's peek bar
  const LEFT = 14;         // the strip's left margin, clear of the fade at its edge

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const numeral = (u) => (u.kind === "prelude" ? "Pre" : u.kind === "prologue" ? "Pro" : P.unitNumeral(u));
  const names = (ids) => ids.map(P.entName).join(" and ");

  // The lanes at the limit: each viewpoint with a unit there that isn't an interlude, in the order
  // they earned it (their first such unit, then their place in its pov); then the Interludes lane
  // for the interludes whose viewpoints have none. Lanes never move when a new one arrives.
  function model(lim) {
    const units = P.units.filter((u) => u.h <= lim);
    const lanes = [], laneOf = {};
    units.filter((u) => u.kind !== "interlude").forEach((u) => u.pov.forEach((id) => {
      if (laneOf[id] !== undefined) return;
      laneOf[id] = lanes.length;
      lanes.push({ id, name: P.entName(id), color: P.povColor(id, lim), i: lanes.length, stations: [] });
    }));
    const stray = units.some((u) => u.kind === "interlude" && u.pov.some((id) => laneOf[id] === undefined));
    const IL = stray ? { id: "interludes", name: "Interludes", color: P.INTERLUDE, i: lanes.length, stations: [], il: true } : null;
    if (IL) lanes.push(IL);
    const stations = [];
    units.forEach((u, c) => {
      if (!u.pov.length) return;
      const on = [...new Set(u.pov.map((id) => (laneOf[id] !== undefined ? laneOf[id] : IL.i)))].sort((a, b) => a - b);
      const s = { h: u.h, u, c, ids: u.pov.slice(), lanes: on, il: u.kind === "interlude", flash: !!u.flashback };
      stations.push(s);
      on.forEach((i) => lanes[i].stations.push(s));
    });
    return { units, lanes, stations, laneOf };
  }

  P.lines = function (host, opts = {}) {
    const lim = P.limit();
    const M = model(lim);
    const byH = new Map(M.stations.map((s) => [s.h, s]));
    const tip = opts.tip;
    const narrow = opts.narrow || (() => matchMedia("(max-width: 760px)").matches);
    let cur = lim, hi = null, reserve = { right: 0 }, G = null, glowT = null;

    host.classList.add("ln");
    host.innerHTML = `<div class="ln-names"><div class="ln-names-in"></div></div>
      <div class="ln-scroll" tabindex="-1"><div class="ln-inner">
        <div class="ln-head" aria-hidden="true"></div>
        <div class="ln-body"><svg class="ln-svg" aria-hidden="true"></svg><div class="ln-band" aria-hidden="true"></div><div class="ln-sts" role="group" aria-label="Chapters, in reading order"></div></div>
      </div></div>`;
    const namesIn = host.querySelector(".ln-names-in"), namesBox = host.querySelector(".ln-names");
    const scroller = host.querySelector(".ln-scroll"), inner = host.querySelector(".ln-inner");
    const head = host.querySelector(".ln-head"), body = host.querySelector(".ln-body");
    const svg = host.querySelector(".ln-svg"), band = host.querySelector(".ln-band"), sts = host.querySelector(".ln-sts");
    // the names stay put while the strip scrolls sideways, and follow it up and down
    scroller.addEventListener("scroll", () => { namesIn.style.transform = `translateY(${-scroller.scrollTop}px)`; hideTip(); }, { passive: true });

    // ------------------------------------------------------------ geometry
    function geometry() {
      const W = host.clientWidth, Hh = host.clientHeight, phone = narrow(), wide = W >= WIDE;
      const nameW = clamp(Math.round(W * 0.11), 84, 160);
      const n = M.units.length;
      const tail = wide ? TITLE_RUN : UNREAD_W;   // after the last column: the unread mark, and room for the last titles
      const colW = clamp((W - nameW - tail - LEFT - 12) / Math.max(1, n), 56, 96);
      const headH = 20 + (wide ? 112 : 0) + 18 + 22;   // part bands, titles, the bookmark, numerals
      const below = M.lanes.some((l) => l.il) ? 30 : 12;   // names under the Interludes lane's stations
      const room = Hh - headH - (phone ? PEEK : 0) - below - 8;
      const pitch = M.lanes.length ? clamp(room / M.lanes.length, 32, 52) : 44;
      host.classList.toggle("vscroll", M.lanes.length > 0 && room / M.lanes.length < 32);
      const laneY = (i) => pitch * (i + 0.5) + 4;
      const bodyH = Math.max(laneY(M.lanes.length - 1) + pitch / 2 + below, 60);
      return { W, Hh, phone, wide, nameW, n, colW, headH, pitch, laneY, bodyH, x: (c) => colW * (c + 0.5), innerW: n * colW + tail };
    }
    // where a station sits on a lane: a flashback dips below it
    const pt = (s, lane) => [G.x(s.c), G.laneY(lane.i) + (s.flash ? DIP * G.pitch : 0)];
    // from station a to station b along a lane: neighbours join directly; a dip far from its
    // neighbour curves within one column of it and runs level the rest of the way
    function seg(a, b, base) {
      const [xa, ya] = a, [xb, yb] = b, c = G.colW;
      const curve = (x0, y0, x1, y1) => `C ${(x0 + x1) / 2} ${y0}, ${(x0 + x1) / 2} ${y1}, ${x1} ${y1}`;
      if (xb - xa <= c * 1.05) return ya === yb ? `L ${xb} ${yb}` : curve(xa, ya, xb, yb);
      let d = "";
      let x = xa, y = ya;
      if (ya !== base) { d += curve(x, y, x + c, base); x += c; y = base; }
      if (yb !== base) { d += ` L ${xb - c} ${base} ${curve(xb - c, base, xb, yb)}`; return d; }
      return `${d} L ${xb} ${yb}`;
    }

    // ------------------------------------------------------------ drawing
    let stEls = new Map(), colEls = [], nameEls = [], clipLit = null, clipDim = null;
    function draw() {
      G = geometry();
      const { colW, headH, bodyH, pitch, wide } = G;
      host.style.setProperty("--name-w", `${G.nameW}px`);
      host.style.setProperty("--col-w", `${colW}px`);
      host.style.setProperty("--head-h", `${headH}px`);
      host.classList.toggle("wide", wide);
      inner.style.width = `${G.innerW + reserve.right}px`;
      inner.style.marginLeft = `${LEFT}px`;
      inner.style.height = `${headH + bodyH}px`;
      body.style.height = `${bodyH}px`;
      namesBox.style.top = `${headH}px`;

      // the header: part bands (and a book band once there are two books), the bookmark, numerals and titles
      const groups = [];
      M.units.forEach((u, c) => {
        const key = `${u.book}|${u.part}`;
        if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, u, from: c, to: c });
        groups[groups.length - 1].to = c;
      });
      const books = P.data.books.length > 1;
      const bandName = (g) => (g.u.part ? g.u.part.replace(/:\s*/, " · ") : `Before Part One`);
      const bookOf = (u) => (P.data.books.find((b) => b.code === u.book) || {}).title || "";
      const fb = P.friendH() !== null;
      let h = groups.map((g) => `<div class="ln-part" style="left:${g.from * colW + 3}px;width:${(g.to - g.from + 1) * colW - 6}px" title="${P.esc(g.u.part || "Before Part One")}"><span>${P.esc(books ? `${bookOf(g.u)} · ${bandName(g)}` : bandName(g))}</span></div>`).join("");
      h += M.units.map((u, c) => `<div class="ln-col${u.pov.length ? "" : " none"}" style="left:${c * colW}px" data-c="${c}">
          ${wide ? `<span class="ln-title">${P.esc(P.clip(P.unitTitle(u), 26))}</span>` : ""}
          ${u.h === lim ? `<span class="ln-bm" title="${fb ? "Your bookmark" : "Wade's bookmark"}" aria-label="${fb ? "Your bookmark" : "Wade's bookmark"}">${P.icon("bookmark")}</span>` : ""}
          <span class="ln-num">${P.esc(numeral(u))}</span></div>`).join("");
      h += `<span class="uf-ahead ln-ahead" style="left:${G.n * colW + 10}px" title="Not read yet"><span class="dun" style="--o:.6;--j:0"></span><span class="dun" style="--o:.38;--j:1"></span><span class="dun" style="--o:.2;--j:2"></span><small>unread</small></span>`;
      h += `<div class="ln-band head" aria-hidden="true"></div>`;
      head.innerHTML = h;
      colEls = [...head.querySelectorAll(".ln-col")];

      // the lanes, drawn twice: lit up to the chapter shown, dim after it
      svg.setAttribute("width", G.innerW + reserve.right);
      svg.setAttribute("height", bodyH);
      let defs = `<clipPath id="ln-lit"><rect x="0" y="-20" width="0" height="${bodyH + 40}"/></clipPath><clipPath id="ln-dim"><rect x="0" y="-20" width="${G.innerW}" height="${bodyH + 40}"/></clipPath>`;
      let lanes = "";
      M.lanes.forEach((l) => {
        const y = G.laneY(l.i), ss = l.stations;
        if (!ss.length) return;
        const ps = ss.map((s) => pt(s, l));
        let base = `M ${ps[0][0]} ${ps[0][1]}`;
        for (let k = 1; k < ps.length; k++) base += ` ${seg(ps[k - 1], ps[k], y)}`;
        const [lx, ly] = ps[ps.length - 1];
        // the end: a short fade past the latest station (level again if that station dipped)
        const fx = lx + FADE * colW;
        defs += `<linearGradient id="ln-fade-${l.i}" gradientUnits="userSpaceOnUse" x1="${lx}" y1="0" x2="${fx}" y2="0"><stop offset="0" stop-color="${l.color}" stop-opacity=".35"/><stop offset="1" stop-color="${l.color}" stop-opacity="0"/></linearGradient>`;
        const end = ly === y ? `M ${lx} ${y} L ${fx} ${y}` : `M ${lx} ${ly} C ${lx + FADE * colW / 2} ${ly}, ${lx + FADE * colW / 2} ${y}, ${fx} ${y}`;
        let g = `<g class="ln-lane" data-lane="${l.i}">`;
        if (l.il) g += `<path d="${base}" stroke="${l.color}" stroke-width="3" stroke-dasharray="0.5 8" stroke-linecap="round" fill="none" opacity=".8"/>`;
        else {
          g += `<path d="${base}" stroke="${l.color}" stroke-width="2" fill="none" opacity=".35"/>`;
          // runs: the same eyes in neighbouring columns, with a glow of layered strokes
          let run = "";
          for (let k = 1; k < ss.length; k++) if (ss[k].c - ss[k - 1].c === 1) run += `M ${ps[k - 1][0]} ${ps[k - 1][1]} ${seg(ps[k - 1], ps[k], y)} `;
          if (run) g += `<path d="${run}" stroke="${l.color}" stroke-width="10" stroke-linecap="round" fill="none" opacity=".18"/><path d="${run}" stroke="${l.color}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
        }
        g += `<path d="${end}" stroke="url(#ln-fade-${l.i})" stroke-width="2" fill="none"/></g>`;
        lanes += g;
      });
      svg.innerHTML = `<defs>${defs}</defs><g clip-path="url(#ln-lit)">${lanes}</g><g clip-path="url(#ln-dim)" opacity=".25">${lanes}</g>`;
      clipLit = svg.querySelector("#ln-lit rect");
      clipDim = svg.querySelector("#ln-dim rect");

      // stations: a button each, in reading order
      sts.innerHTML = M.stations.map((s) => {
        const x = G.x(s.c);
        const u = s.u, when = u.when ? `, ${u.when.charAt(0).toLowerCase()}${u.when.slice(1)}` : "";
        const label = `${P.unitLabel(u)}, through ${names(s.ids)}'s eyes${when}${s.flash ? ", a flashback" : ""}${s.h === lim ? (fb ? ", your bookmark" : ", Wade's bookmark") : ""}`;
        if (s.lanes.length > 1) {
          const y0 = G.laneY(s.lanes[0]), y1 = G.laneY(s.lanes[s.lanes.length - 1]), dip = s.flash ? DIP * pitch : 0;
          const dots = s.lanes.map((i) => `<i style="top:${G.laneY(i) - y0 + 11 - 4 - 2}px;--c:${M.lanes[i].color}"></i>`).join("");   // inside its 2 px border
          return `<button type="button" class="ln-st ix${s.flash ? " flash" : ""}" data-h="${s.h}" tabindex="-1" aria-label="${P.esc(label)}" style="left:${x - 11}px;top:${y0 - 11 + dip}px;height:${y1 - y0 + 22}px">${dots}</button>`;
        }
        const l = M.lanes[s.lanes[0]], [, y] = pt(s, l), r = s.il ? 7 : 9;
        return `<button type="button" class="ln-st${s.il ? " il" : ""}${s.flash ? " flash" : ""}" data-h="${s.h}" tabindex="-1" aria-label="${P.esc(label)}" style="left:${x - r}px;top:${y - r}px;--r:${r}px;--c:${l.color}"></button>`;
      }).join("");
      stEls = new Map([...sts.querySelectorAll(".ln-st")].map((b) => [Number(b.dataset.h), b]));
      // under the Interludes lane, whose eyes each station uses
      const IL = M.lanes.find((l) => l.il);
      let notes = IL ? IL.stations.map((s) => `<span class="ln-label ln-who" data-h="${s.h}" style="left:${G.x(s.c) - (colW - 6) / 2}px;top:${G.laneY(IL.i) + 11}px;width:${colW - 6}px">${P.esc(names(s.ids))}</span>`).join("") : "";
      sts.insertAdjacentHTML("beforeend", notes);
      // a flashback's time beside it, on a wide stage, if it fits clear of every station and label
      if (wide) M.stations.filter((s) => s.flash && s.u.when).forEach((s) => {
        const el = document.createElement("span");
        el.className = "ln-label ln-when";
        el.dataset.h = s.h;
        el.textContent = s.u.when;
        el.style.visibility = "hidden";
        sts.append(el);
        const w = el.offsetWidth, hh = el.offsetHeight, x = G.x(s.c), y = pt(s, M.lanes[s.lanes[0]])[1] + (s.lanes.length > 1 ? G.laneY(s.lanes[s.lanes.length - 1]) - G.laneY(s.lanes[0]) : 0);
        const tries = [[x + 15, y - hh / 2], [x - w / 2, y + 13], [x - w - 15, y - hh / 2]];
        const boxes = [...sts.querySelectorAll(".ln-st, .ln-label:not(.ln-when)")].map((b) => [b.offsetLeft, b.offsetTop, b.offsetLeft + b.offsetWidth, b.offsetTop + b.offsetHeight]);
        const free = tries.find(([l, t]) => l >= 2 && t >= 0 && t + hh <= bodyH && !boxes.some((b) => l - 4 < b[2] && b[0] < l + w + 4 && t - 3 < b[3] && b[1] < t + hh + 3));
        if (!free) { el.remove(); return; }
        el.style.left = `${free[0]}px`;
        el.style.top = `${free[1]}px`;
        el.style.visibility = "";
      });

      // lane names: a column that stays put, each name in its lane's colour
      namesIn.innerHTML = M.lanes.map((l) => `<button type="button" class="ln-label ln-name${l.il ? " il" : ""}" data-lane="${l.i}" style="top:${G.laneY(l.i)}px;--c:${l.color};--p:${pitch}px" aria-pressed="false">${P.esc(l.name)}</button>`).join("");
      nameEls = [...namesIn.querySelectorAll(".ln-name")];
      nameEls.forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); if (opts.onLane) opts.onLane(M.lanes[Number(b.dataset.lane)].id); }));
      wire();
      paint({});
      highlight(hi);
    }

    // ------------------------------------------------------------ the chapter shown
    function paint(o) {
      const c = M.units.findIndex((u) => u.h === cur);   // -1 before the Prelude
      const split = c < 0 ? 0 : G.x(c) + G.colW / 2;
      if (clipLit) { clipLit.setAttribute("width", split); clipDim.setAttribute("x", split); clipDim.setAttribute("width", Math.max(0, G.innerW + reserve.right - split)); }
      [band, head.querySelector(".ln-band.head")].forEach((b) => { b.hidden = c < 0; if (c >= 0) b.style.left = `${c * G.colW}px`; });
      colEls.forEach((el, i) => { el.classList.toggle("dim", i > c); el.classList.toggle("on", i === c); });
      const focusHere = document.activeElement && document.activeElement.classList.contains("ln-st") && host.contains(document.activeElement);
      const roving = byH.get(cur) || (c < 0 ? M.stations[0] : M.stations.filter((s) => s.h < cur).pop()) || M.stations[0];
      stEls.forEach((b, h) => {
        b.classList.toggle("dim", h > cur);
        b.classList.toggle("on", h === cur);
        b.tabIndex = roving && roving.h === h ? 0 : -1;
      });
      sts.querySelectorAll(".ln-label").forEach((el) => el.classList.toggle("dim", Number(el.dataset.h) > cur));
      nameEls.forEach((b) => { const l = M.lanes[Number(b.dataset.lane)]; b.classList.toggle("dim", !l.stations.length || l.stations[0].h > cur); });
      if (focusHere && roving && stEls.get(roving.h)) stEls.get(roving.h).focus({ preventScroll: true });
      const st = stEls.get(cur);
      if (o.glow && st && !P.reducedMotion) {
        st.classList.remove("infuse"); void st.offsetWidth; st.classList.add("infuse");
        clearTimeout(glowT);
        glowT = setTimeout(() => st.classList.remove("infuse"), 1300);
      }
    }
    // one lane at full strength and the others at 0.35, or all alike
    function highlight(id) {
      hi = id;
      const i = id === null ? -1 : M.lanes.findIndex((l) => l.id === id);
      host.classList.toggle("lane-on", i >= 0);
      svg.querySelectorAll(".ln-lane").forEach((g) => g.classList.toggle("off", i >= 0 && Number(g.dataset.lane) !== i));
      nameEls.forEach((b) => { const yes = Number(b.dataset.lane) === i; b.classList.toggle("off", i >= 0 && !yes); b.setAttribute("aria-pressed", String(yes)); });
      M.stations.forEach((s) => { const b = stEls.get(s.h); if (b) b.classList.toggle("off", i >= 0 && !s.lanes.includes(i)); });
      sts.querySelectorAll(".ln-label").forEach((el) => el.classList.toggle("off", i >= 0 && !(M.lanes[i] && M.lanes[i].il && el.classList.contains("ln-who"))));
    }

    // ------------------------------------------------------------ stations: choosing, the tip
    function wire() {
      stEls.forEach((b, h) => {
        b.addEventListener("click", (ev) => { ev.stopPropagation(); hideTip(); if (opts.onPick) opts.onPick(h); });
        b.addEventListener("pointerenter", (ev) => { if (ev.pointerType === "mouse") showTip(b, h); });
        b.addEventListener("pointerleave", hideTip);
        b.addEventListener("blur", hideTip);
      });
    }
    function showTip(b, h) {
      if (!tip) return;
      const u = P.units[h], s = byH.get(h);
      tip.innerHTML = `<strong>${P.esc(P.unitTitle(u))}</strong><br><span>${P.esc(u.label)} · through ${P.esc(names(s.ids))}'s eyes${u.when ? ` · ${P.esc(P.whenOf(u))}` : ""}</span>`;
      const r = b.getBoundingClientRect(), pr = tip.offsetParent ? tip.offsetParent.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth };
      tip.classList.add("on");
      const x = clamp(r.left - pr.left + r.width / 2 - tip.offsetWidth / 2, 8, pr.width - tip.offsetWidth - 8);
      tip.style.left = `${x}px`;
      tip.style.top = `${r.top - pr.top - tip.offsetHeight - 10}px`;
    }
    function hideTip() { if (tip) tip.classList.remove("on"); }

    // ------------------------------------------------------------ scrolling
    // Bring a chapter's column into view: at once, or smoothly; { center: true } centres it, and
    // otherwise it moves only when the column is out of view (left of the card on a desktop).
    function scrollTo(h, o = {}) {
      const c = M.units.findIndex((u) => u.h === h);
      if (c < 0 || !G) return;
      const vw = scroller.clientWidth - reserve.right, x = G.x(c) + LEFT, left = scroller.scrollLeft;
      if (!o.center && x - G.colW / 2 >= left && x + G.colW / 2 <= left + vw) return;
      scroller.scrollTo({ left: Math.max(0, x - vw / 2), behavior: o.smooth && !P.reducedMotion ? "smooth" : "auto" });
    }

    // a hidden tab has no size; when it's shown again at a new size, it's laid out again
    let last = "";
    if (window.ResizeObserver) new ResizeObserver(() => {
      const key = `${host.clientWidth}x${host.clientHeight}`;
      if (!host.clientWidth || key === last) return;
      const first = !last;
      last = key;
      draw();
      if (!first) scrollTo(cur);
    }).observe(host);

    const api = {
      setHorizon(h, o = {}) { cur = h; if (G) paint(o); },
      scrollTo,
      highlight(id) { highlight(id); },
      // room the station card takes on a desktop: the strip can scroll its last columns out from under it
      setReserve(r) { const right = Math.round(r.right || 0); if (right === reserve.right) return; reserve = { right }; if (G) { const l = scroller.scrollLeft; draw(); scroller.scrollLeft = l; } },
      lanes: () => M.lanes.map((l) => ({ id: l.id, name: l.name, color: l.color, il: !!l.il, stations: l.stations.map((s) => s.h) })),
      // for the checks in playbooks/unfolding/pov-lines.md
      debug: () => ({
        limit: lim, h: cur,
        units: M.units.map((u) => ({ h: u.h, id: u.id, pov: u.pov.slice() })),
        lanes: M.lanes.map((l) => ({ id: l.id, color: l.color, stations: l.stations.map((s) => s.h) })),
        stations: M.stations.map((s) => ({ h: s.h, ids: s.ids.slice(), lanes: s.lanes.map((i) => M.lanes[i].id), flash: s.flash })),
        geometry: G && { colW: G.colW, pitch: G.pitch, nameW: G.nameW, headH: G.headH },
        scroll: scroller.scrollLeft,
      }),
    };
    host.lines = api;   // so the checks can reach it from the page
    if (host.clientWidth) { last = `${host.clientWidth}x${host.clientHeight}`; draw(); }
    return api;
  };
})();
