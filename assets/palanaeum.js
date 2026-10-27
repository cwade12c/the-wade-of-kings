/* The Wade of Kings — shared page code.
   Reads window.PALANAEUM (written by ./ardent build), draws the header, menu and footer,
   runs friend mode (a visitor's own bookmark hides everything stamped later), marks anything
   new since the visitor's last look, and renders the pieces several pages share: viewpoint
   colours, Wade's voice, sigils and the profile of a codex entry. */
(function () {
  "use strict";
  const DATA = window.PALANAEUM;
  const root = document.body.dataset.root || "";

  // Line icons for the nav, drawn on a 24-unit grid.
  const ICON = {
    home: '<circle cx="12" cy="12" r="5.2"/><circle cx="10.2" cy="10.2" r="1.3" fill="currentColor" stroke="none"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2"/>',
    unfolding: '<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="17" r="2.6"/><path d="M8 8.2l2.6 6.6M16.4 7.6l-2.9 7.3M8.2 6.8l7.6-.6"/>',
    dispatches: '<path d="M4 5.5l5-2 6 2 5-2v15l-5 2-6-2-5 2z"/><path d="M9 3.5v15M15 5.5v15"/>',
    codex: '<path d="M5 4.5h10.5a3 3 0 013 3V20H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h10.5"/><path d="M9 8h6"/>',
    journal: '<path d="M19.5 4.5c-6 .5-10.5 5-12 12l-1.5 3"/><path d="M7.5 16.5c3-.5 6.5-2.5 8.5-6"/><path d="M4 20.5h9"/>',
    theories: '<path d="M4.5 16a7.5 7.5 0 1115 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/>',
    chronicle: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/><circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
    bookmark: '<path d="M7 3.5h10v17l-5-4-5 4z"/>',
  };
  const icon = (name, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

  const NAV = [
    ["index.html", "Home", "home", "The bookmark, and what's new"],
    ["unfolding.html", "The Unfolding", "unfolding", "The living web of who's tied to whom"],
    ["dispatches.html", "Dispatches", "dispatches", "Maps, posters and illustrated guides"],
    ["codex.html", "Codex", "codex", "Everyone and everything met so far"],
    ["journal.html", "Journal", "journal", "Every chapter, and what Wade made of it"],
    ["ledger.html", "Theories", "theories", "Predictions, questions and The Deep End"],
    ["chronicle.html", "Chronicle", "chronicle", "The read itself, day by day"],
  ];
  const FOLDERS = {
    people: "People", peoples: "Peoples and groups", places: "Places", things: "Things",
    systems: "Systems and customs", fieldguide: "Field guide", lore: "Lore",
  };
  // Sigil colours for entries that aren't viewpoint characters: one quiet tone per codex folder.
  const FOLDER_COLOR = {
    people: "#c9d6e8", peoples: "#d9b77e", places: "#83cbb0", things: "#d7a6e6",
    systems: "#e7c98f", fieldguide: "#9fd1e6", lore: "#e6a7a7",
  };
  const TYPES = {
    family: { label: "Family", color: "var(--family)", hex: "#c98500" },
    command: { label: "Command", color: "var(--command)", hex: "#3987e5" },
    support: { label: "Support", color: "var(--support)", hex: "#199e70" },
    hostile: { label: "Hostility", color: "var(--hostile)", hex: "#ea5f6f" },
    other: { label: "Other ties", color: "var(--other)", hex: "#8a95a5" },
  };
  const FRIEND_KEY = "palanaeum.friend";
  const SEEN_KEY = "palanaeum.seen";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const units = DATA ? DATA.units : [];
  const unitById = Object.fromEntries(units.map((u) => [u.id, u]));
  const entities = DATA ? DATA.entities : [];
  const entityById = Object.fromEntries(entities.map((e) => [e.id, e]));
  const H = DATA ? DATA.meta.horizon.h : 0;
  // Viewpoint status is earned chapter by chapter, so friends never see who gets a POV later.
  const povFirst = {};
  units.forEach((u) => u.pov.forEach((id) => { if (!(id in povFirst)) povFirst[id] = u.h; }));

  // A shareable link like ?upto=wok:8 puts a friend's bookmark in place.
  (function fromLink() {
    const upto = new URLSearchParams(location.search).get("upto");
    if (!upto || !DATA) return;
    const u = DATA.units.find((x) => x.id === upto.toLowerCase());
    if (u && u.h < DATA.meta.horizon.h) localStorage.setItem("palanaeum.friend", String(u.h));
    else if (u) localStorage.removeItem("palanaeum.friend");
  })();

  function friendH() {
    const v = localStorage.getItem(FRIEND_KEY);
    if (v === null) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < H ? n : null;
  }
  const limit = () => (friendH() ?? H);
  const isPov = (id, h = limit()) => povFirst[id] !== undefined && povFirst[id] <= h;
  const summaryOf = (e, h = limit()) => (e.sh === undefined || e.sh <= h ? e.summary : "");
  const visible = (h) => h === null || h === undefined || h <= limit();
  const visibleAt = (h, at) => h === null || h === undefined || h <= at;

  // "New since last visit": anything stamped after the horizon the visitor last saw.
  const lastSeen = (() => { const v = localStorage.getItem(SEEN_KEY); return v === null ? null : Number(v); })();
  const isNew = (h) => lastSeen !== null && h > lastSeen && visible(h);
  setTimeout(() => localStorage.setItem(SEEN_KEY, String(H)), 4000);

  function unitLabel(u, opts = {}) {
    if (!u) return "";
    const title = u.title && u.title.toLowerCase() !== u.label.toLowerCase() ? u.title : "";
    if (opts.short) return u.short;
    return title ? `${u.label}: ${title}` : u.label;
  }
  const unitTitle = (u) => (u.title && u.title.toLowerCase() !== u.label.toLowerCase() ? u.title : u.label);
  // The big numeral for a unit: "12", "I-2", or the word for the prelude and prologue.
  const unitNumeral = (u) => (u.kind === "chapter" ? String(u.n) : u.kind === "interlude" ? u.short : u.label);
  const unitAnchor = (id) => id.replace(":", "-");
  const entName = (id) => (entityById[id] ? entityById[id].name : id);
  const entLink = (id) => entityById[id] && visible(entityById[id].h)
    ? `<a class="ent" href="${root}codex.html#${id}">${esc(entName(id))}</a>` : esc(entName(id));

  // ------------------------------------------------------------ viewpoint colours
  // The three Part One lanes keep the colours of the Part One poster; interludes are teal.
  // Everyone else draws from a neutral palette in order of their first viewpoint chapter,
  // so a colour is never chosen with hindsight.
  const POV_FIXED = { cenn: "#e3a94a", kaladin: "#5fb0ff", shallan: "#b993ff" };
  const POV_PALETTE = ["#f08f86", "#86d39b", "#f2d27a", "#8fa8ff", "#f5a3cf", "#c8a77e", "#7fd8e0", "#d4e27a"];
  const INTERLUDE = "#6fd6c4";
  const povColorMap = {};
  (function () {
    let i = 0;
    units.filter((u) => u.kind !== "interlude").forEach((u) => u.pov.forEach((id) => {
      if (povColorMap[id]) return;
      povColorMap[id] = POV_FIXED[id] || POV_PALETTE[i++ % POV_PALETTE.length];
    }));
    units.forEach((u) => u.pov.forEach((id) => { if (!povColorMap[id]) povColorMap[id] = INTERLUDE; }));
  })();
  const povColor = (id) => povColorMap[id] || "#d8ecff";
  const unitColor = (u) => (u.kind === "interlude" ? INTERLUDE : u.pov.length ? povColor(u.pov[0]) : "#d8ecff");
  const entColor = (e, h = limit()) => (isPov(e.id, h) ? povColor(e.id) : FOLDER_COLOR[e.folder] || "#c9d6e8");

  // ------------------------------------------------------------ rendered notes
  function renderSections(sections, opts = {}) {
    const at = opts.h ?? limit();
    let html = "";
    for (const s of sections || []) {
      const items = s.items.filter((it) => visibleAt(it.h, at));
      if (!items.length) continue;
      if (s.title && !opts.skipTitles) html += `<h3>${esc(s.title)}</h3>`;
      let list = false;
      for (const it of items) {
        const isLi = it.kind === "li";
        if (isLi && !list) { html += "<ul>"; list = true; }
        if (!isLi && list) { html += "</ul>"; list = false; }
        html += it.html.replace(/^<(li|p|blockquote)/, `<$1${isNew(it.h) ? ' data-new="1"' : ""}`);
      }
      if (list) html += "</ul>";
    }
    return html;
  }
  const sectionCount = (s, h = limit()) => (s ? s.items.filter((it) => visibleAt(it.h, h)).length : 0);

  // ------------------------------------------------------------ chrome
  function bookmarkLine() {
    const hz = DATA.meta.horizon, u = unitById[hz.id], f = friendH();
    if (f !== null) return `You're at <b>${esc(unitLabel(units[f]))}</b>. Wade is at ${esc(u.label)}.`;
    return `Wade is at <b>${esc(unitLabel(u))}</b>${hz.reading ? `, ${hz.reading.pct}% into the next` : ""}.`;
  }

  function friendSelect(id) {
    // a friend sees titles only up to their own bookmark; past it, just the chapter label
    const f = friendH();
    const options = units.slice(0, -1).map((u) =>
      `<option value="${u.h}"${f === u.h ? " selected" : ""}>${esc(f === null || u.h <= f ? unitLabel(u) : u.label)}</option>`).join("");
    return `<select id="${id}" class="friend-select" aria-label="Your bookmark">
      <option value="">Caught up with Wade</option>${options}</select>`;
  }
  function wireFriend(sel) {
    sel.addEventListener("change", (e) => {
      if (e.target.value === "") localStorage.removeItem(FRIEND_KEY);
      else localStorage.setItem(FRIEND_KEY, e.target.value);
      location.reload();
    });
  }

  function header() {
    const here = document.body.dataset.page === "dispatch" ? "dispatches.html" : (location.pathname.split("/").pop() || "index.html");
    const hereNav = NAV.find(([href]) => href === here);
    const nav = NAV.map(([href, label, ic]) =>
      `<a href="${root}${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("");
    const hz = DATA.meta.horizon, f = friendH();
    const at = f !== null ? units[f] : unitById[hz.id];
    const el = document.createElement("header");
    el.className = "site-head";
    el.innerHTML = `<div class="wrap head-row">
      <a class="masthead" href="${root}index.html"><span class="sigil-mark" aria-hidden="true"></span><span>${esc(DATA.meta.title)}</span></a>
      <nav class="nav" aria-label="Pages">${nav}</nav>
      <div class="head-tools">
        <button type="button" class="bookmark-btn" aria-haspopup="dialog" aria-expanded="false" title="Reading along?">
          ${icon("bookmark")}<span class="bm-at">${esc(at.short)}</span>${f !== null ? '<span class="bm-you">you</span>' : ""}</button>
        <button type="button" class="menu-btn" aria-label="Open the menu" aria-expanded="false">
          <span class="menu-here">${hereNav ? esc(hereNav[1]) : ""}</span>${icon("menu")}</button>
      </div></div>
      <div class="bookmark-pop" role="dialog" aria-label="Your bookmark" hidden>
        <p class="bp-line">${bookmarkLine()}</p>
        <label class="bp-label" for="friend-select">Reading along? Set your own bookmark and everything past it stays hidden.</label>
        ${friendSelect("friend-select")}
      </div>`;
    document.body.prepend(el);
    wireFriend(el.querySelector("#friend-select"));

    const pop = el.querySelector(".bookmark-pop"), bmb = el.querySelector(".bookmark-btn");
    const closePop = () => { pop.hidden = true; bmb.setAttribute("aria-expanded", "false"); };
    bmb.addEventListener("click", (ev) => {
      ev.stopPropagation();
      pop.hidden = !pop.hidden;
      bmb.setAttribute("aria-expanded", String(!pop.hidden));
      if (!pop.hidden) pop.querySelector("select").focus();
    });
    document.addEventListener("click", (ev) => { if (!pop.hidden && !pop.contains(ev.target)) closePop(); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closePop(); });

    // The phone menu: every page as a large row with a line of what it holds.
    const menu = document.createElement("div");
    menu.className = "menu-sheet";
    menu.hidden = true;
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-label", "Pages");
    menu.innerHTML = `<div class="menu-inner">
      <div class="menu-top"><span class="masthead"><span class="sigil-mark" aria-hidden="true"></span>${esc(DATA.meta.title)}</span>
        <button type="button" class="icon-btn menu-close" aria-label="Close the menu">${icon("close")}</button></div>
      <nav class="menu-list" aria-label="Pages">${NAV.map(([href, label, ic, desc], i) =>
        `<a href="${root}${href}"${href === here ? ' aria-current="page"' : ""} style="--i:${i}">
          <span class="menu-ico">${icon(ic)}</span><span class="menu-txt"><b>${label}</b><span>${desc}</span></span></a>`).join("")}</nav>
      <div class="menu-bookmark"><p class="bp-line">${bookmarkLine()}</p>
        <label class="bp-label" for="friend-select-m">Reading along? Set your bookmark:</label>${friendSelect("friend-select-m")}</div>
    </div>`;
    document.body.append(menu);
    wireFriend(menu.querySelector("#friend-select-m"));
    const mb = el.querySelector(".menu-btn");
    const openMenu = () => {
      menu.hidden = false; document.documentElement.classList.add("locked");
      requestAnimationFrame(() => menu.classList.add("open"));
      mb.setAttribute("aria-expanded", "true");
      menu.querySelector(".menu-close").focus();
    };
    const closeMenu = () => {
      menu.classList.remove("open"); document.documentElement.classList.remove("locked");
      mb.setAttribute("aria-expanded", "false");
      setTimeout(() => { menu.hidden = true; }, reducedMotion ? 0 : 260);
    };
    mb.addEventListener("click", openMenu);
    menu.querySelector(".menu-close").addEventListener("click", closeMenu);
    menu.addEventListener("click", (ev) => { if (ev.target === menu) closeMenu(); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !menu.hidden) closeMenu(); });

    if (f !== null) {
      const b = document.createElement("div");
      b.className = "friend-banner";
      b.innerHTML = `<div class="wrap"><span>Friend mode: showing only what's established by <b>${esc(unitLabel(units[f]))}</b>, your bookmark.</span>
        <button type="button">Show everything up to Wade's bookmark</button></div>`;
      b.querySelector("button").addEventListener("click", () => { localStorage.removeItem(FRIEND_KEY); location.reload(); });
      el.after(b);
    }
  }

  function footer() {
    const hz = DATA.meta.horizon;
    const el = document.createElement("footer");
    el.className = "site-foot";
    el.innerHTML = `<div class="wrap">
      <div class="meta"><nav class="foot-nav" aria-label="Pages">${NAV.map(([href, label]) => `<a href="${root}${href}">${label}</a>`).join("")}</nav>
        Spoilers through ${esc(hz.book)}, ${esc(friendH() === null ? unitLabel(unitById[hz.id]) : unitById[hz.id].label)}.<br>
        Kept by Wade's ardent in the Palanaeum. <a href="${root}feed.xml">Follow the feed</a></div></div>`;
    document.body.append(el);
  }

  function markNew() {
    document.querySelectorAll("[data-new]").forEach((n) => n.classList.add("is-new"));
  }

  // ------------------------------------------------------------ sigils
  // A glass sphere with the entry's initials: round for people and creatures, cut square for
  // groups and peoples, a lozenge for places and everything else. Lit if a viewpoint.
  let sid = 0;
  function sigil(e, opts = {}) {
    const size = opts.size || 64, h = opts.h ?? limit();
    const c = entColor(e, h), lit = isPov(e.id, h), id = `sg${(sid += 1)}`;
    const words = e.name.replace(/^The /, "").split(/[\s-]+/).filter(Boolean);
    const ini = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0]).toUpperCase();
    const shape = ["person", "spren", "creature"].includes(e.kind) ? "c" : ["group", "people"].includes(e.kind) ? "s" : "d";
    const body = shape === "c" ? `<circle r="40"/>` : shape === "s" ? `<rect x="-36" y="-36" width="72" height="72" rx="14"/>` : `<rect x="-33" y="-33" width="66" height="66" rx="10" transform="rotate(45)"/>`;
    return `<svg class="sigil${lit ? " lit" : ""}" viewBox="-50 -50 100 100" width="${size}" height="${size}" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity="${lit ? 0.95 : 0.5}"/>
        <stop offset=".32" stop-color="${c}" stop-opacity="${lit ? 0.95 : 0.55}"/><stop offset="1" stop-color="#0b1017" stop-opacity=".9"/></radialGradient></defs>
      ${lit ? `<circle class="sigil-halo" r="48" fill="${c}" opacity=".22"/>` : ""}
      <g fill="url(#${id})" stroke="${c}" stroke-opacity=".75" stroke-width="1.5">${body}</g>
      <text y="${ini.length > 1 ? 9 : 10}" text-anchor="middle" font-size="${ini.length > 1 ? 27 : 32}">${esc(ini)}</text></svg>`;
  }

  // ------------------------------------------------------------ the profile of a codex entry
  const tiesOf = (id, h) => DATA.relations.filter((r) => r.h <= h && (r.from === id || r.to === id) &&
    entityById[r.from] && entityById[r.to] && entityById[r.from].h <= h && entityById[r.to].h <= h);

  // Everyone this entry is tied to, around it in a ring, grouped by kind of tie.
  function egoWeb(e, h, opts = {}) {
    const ties = tiesOf(e.id, h);
    if (!ties.length) return "";
    const order = Object.keys(TYPES);
    const others = [];
    ties.slice().sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).forEach((r) => {
      const o = r.from === e.id ? r.to : r.from;
      let slot = others.find((x) => x.id === o);
      if (!slot) others.push(slot = { id: o, rels: [] });
      slot.rels.push(r);
    });
    const n = others.length, R = n > 12 ? 148 : 128, W = 520, HH = 420;
    const DASH = { seen: "", said: "6 5", inferred: "1.5 5", guess: "1.5 5" };
    let lines = "", dots = "";
    others.forEach((o, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * R * 1.25, y = Math.sin(a) * R;
      o.rels.forEach((r, k) => {
        const off = (k - (o.rels.length - 1) / 2) * 14;
        const mx = x / 2 - Math.sin(a) * off, my = y / 2 + Math.cos(a) * off;
        lines += `<path d="M0,0Q${mx.toFixed(1)},${my.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}" stroke="${TYPES[r.type].hex}" stroke-dasharray="${DASH[r.basis] || ""}"><title>${esc(entName(o.id))}: ${esc(r.label)}</title></path>`;
      });
      const oe = entityById[o.id], c = entColor(oe, h);
      const right = Math.cos(a) >= -0.01, anchor = Math.abs(Math.cos(a)) < 0.2 ? "middle" : right ? "start" : "end";
      const tx = anchor === "middle" ? x : x + (right ? 13 : -13), ty = anchor === "middle" ? y + (y > 0 ? 24 : -15) : y + 4;
      const href = opts.link ? opts.link(o.id) : `${root}codex.html#${o.id}`;
      dots += `<a href="${href}" class="ego-node" data-id="${o.id}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isPov(o.id, h) ? 8 : 6}" fill="${c}" ${isPov(o.id, h) ? 'class="lit"' : ""}/>
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${esc(oe.name.replace(/^The /, ""))}</text></a>`;
    });
    return `<svg class="ego" viewBox="${-W / 2} ${-HH / 2} ${W} ${HH}" role="img" aria-label="${esc(e.name)} and everyone tied to them">
      <g class="ego-lines" fill="none" stroke-width="2" stroke-linecap="round">${lines}</g>
      <circle r="30" class="ego-core" fill="${entColor(e, h)}" opacity=".16"/>
      <g transform="translate(-26,-26)">${sigil(e, { size: 52, h }).replace("<svg ", '<svg x="0" y="0" ')}</g>
      <g class="ego-dots">${dots}</g></svg>`;
  }

  // One sphere per chapter read: lit where this entry is on the page, ringed where it's a viewpoint.
  function presence(e, h) {
    const shown = units.filter((u) => u.h <= h);
    const on = new Set(e.units || []);
    return `<div class="presence" role="list">${shown.map((u) => {
      const here = on.has(u.id), pov = u.pov.includes(e.id);
      return `<a role="listitem" href="${root}journal.html#${unitAnchor(u.id)}" class="pr${here ? " on" : ""}${pov ? " pov" : ""}${u.kind === "interlude" ? " il" : ""}"
        style="--c:${unitColor(u)}" title="${esc(unitLabel(u))}${pov ? ", through their eyes" : here ? "" : ", not on the page"}"><span>${esc(unitNumeral(u).replace(/^Prelude$/, "Pre").replace(/^Prologue$/, "Pro"))}</span></a>`;
    }).join("")}</div>`;
  }

  function profile(e, opts = {}) {
    const h = opts.h ?? limit();
    const first = unitById[e.first_seen.split("@")[0]];
    const ties = tiesOf(e.id, h);
    const onstage = (e.units || []).map((u) => unitById[u]).filter((u) => u && u.h <= h);
    const povN = units.filter((u) => u.h <= h && u.pov.includes(e.id)).length;
    const link = opts.link || ((id) => `${root}codex.html#${id}`);
    const sections = (e.sections || []).map((s) => {
      const body = renderSections([s], { h, skipTitles: true });
      if (!body) return "";
      const wade = /wade/i.test(s.title);
      return `<section class="pf-sec${wade ? " pf-wade" : ""}"><h2>${esc(s.title)}</h2><div class="prose">${body}</div></section>`;
    }).join("");
    const tieRows = ties.map((r) => {
      const other = r.from === e.id ? r.to : r.from;
      const who = r.basis === "said" && r.said_by ? `says ${esc(r.said_by)}` : r.basis === "inferred" ? "Wade's reading" : "";
      const u = unitById[r.cite];
      return `<li style="--c:${TYPES[r.type].hex}"><span class="tie-swatch ${r.basis}" title="${TYPES[r.type].label}"></span>
        <a class="tie-who" href="${link(other)}" data-id="${other}">${esc(entName(other))}</a>
        <span class="tie-what">${esc(r.label)}${who ? ` <span class="muted small">· ${who}</span>` : ""}</span>
        <a class="cite" href="${root}journal.html#${unitAnchor(r.cite)}">${esc(unitLabel(u, { short: true }))}</a></li>`;
    }).join("");
    const summary = summaryOf(e, h);
    return `<div class="pf" style="--pc:${entColor(e, h)}">
      <header class="pf-hero">
        <div class="pf-sigil">${sigil(e, { size: 112, h })}</div>
        <div class="pf-id">
          <p class="pf-kind">${esc(FOLDERS[e.folder] || "")}${isPov(e.id, h) ? ' · <span class="pf-pov">a viewpoint</span>' : ""}${e.dossier ? "" : " · glossary entry"}</p>
          <h1 class="pf-name">${esc(e.name)}</h1>
          ${e.aka.length && friendH() === null ? `<p class="pf-aka">also ${e.aka.map(esc).join(", ")}</p>` : ""}
        </div>
      </header>
      ${summary ? `<p class="pf-summary">${summary}</p>` : ""}
      <div class="pf-stats">
        <div><b>${esc(first ? unitNumeral(first) : "")}</b><span>first met${first ? `, <a href="${root}journal.html#${unitAnchor(first.id)}">${esc(unitTitle(first))}</a>` : ""}</span></div>
        <div><b>${onstage.length}</b><span>chapter${onstage.length === 1 ? "" : "s"} on the page</span></div>
        <div><b>${ties.length}</b><span>tie${ties.length === 1 ? "" : "s"} drawn</span></div>
        <div><b>${povN}</b><span>through their eyes</span></div>
      </div>
      <section class="pf-sec"><h2>On the page</h2>${presence(e, h)}
        <p class="muted small">${DATA.meta.presence === "text" ? "Lit spheres are chapters whose text names this entry; ringed ones are told through their eyes." : "Lit spheres are chapters whose summary names this entry."}</p></section>
      ${ties.length ? `<section class="pf-sec pf-ties"><h2>Ties</h2><div class="pf-ties-grid">${egoWeb(e, h, { link })}<ul class="ties">${tieRows}</ul></div></section>` : ""}
      ${sections}
    </div>`;
  }

  // ------------------------------------------------------------ sheets (full-screen panels)
  function sheet(html, opts = {}) {
    const el = document.createElement("div");
    el.className = `sheet ${opts.cls || ""}`;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    if (opts.label) el.setAttribute("aria-label", opts.label);
    el.innerHTML = `<div class="sheet-panel"><div class="sheet-bar">${opts.bar || ""}<button type="button" class="icon-btn sheet-close" aria-label="Close">${icon("close")}</button></div>
      <div class="sheet-body">${html}</div></div>`;
    const prev = document.activeElement;
    const close = () => {
      el.classList.remove("open");
      document.documentElement.classList.remove("locked");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => el.remove(), reducedMotion ? 0 : 280);
      if (prev && prev.focus) prev.focus({ preventScroll: true });
      if (opts.onClose) opts.onClose();
    };
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    el.addEventListener("click", (ev) => { if (ev.target === el) close(); });
    el.querySelector(".sheet-close").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.append(el);
    document.documentElement.classList.add("locked");
    requestAnimationFrame(() => el.classList.add("open"));
    el.querySelector(".sheet-close").focus({ preventScroll: true });
    el.close = close;
    return el;
  }

  function openProfile(id, opts = {}) {
    const e = entityById[id];
    if (!e) return null;
    const s = sheet(profile(e, opts), {
      cls: "sheet-profile", label: e.name,
      bar: `<a class="sheet-link" href="${root}codex.html#${id}">${icon("codex")}Open in the codex</a>`,
    });
    s.querySelector(".sheet-body").addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-id]");
      if (!a || !opts.onPick) return;
      ev.preventDefault();
      s.close();
      opts.onPick(a.dataset.id);
    });
    return s;
  }

  function lightbox(src, alt) {
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = `<img src="${esc(src)}" alt="${esc(alt)}">`;
    box.addEventListener("click", () => box.remove());
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { box.remove(); document.removeEventListener("keydown", k); } });
    document.body.append(box);
  }

  // Confidence as a ring of light.
  function gauge(p, size = 96) {
    const r = 40, c = 2 * Math.PI * r;
    return `<svg class="gauge-ring" viewBox="-50 -50 100 100" width="${size}" height="${size}" role="img" aria-label="${p}% confident">
      <circle r="${r}" class="g-track"/><circle r="${r}" class="g-fill" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90)"/>
      <text y="7" text-anchor="middle" class="g-num">${p}<tspan class="g-pct" dy="-9" font-size="12">%</tspan></text></svg>`;
  }

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.P = {
    data: DATA, esc, units, unitById, entities, entityById, H, TYPES, FOLDERS, FOLDER_COLOR, NAV, icon,
    friendH, limit, visible, visibleAt, isNew, isPov, summaryOf, unitLabel, unitTitle, unitNumeral, unitAnchor,
    entName, entLink, renderSections, sectionCount, markNew, lightbox, sheet, gauge,
    povColor, unitColor, entColor, sigil, egoWeb, presence, profile, openProfile, tiesOf,
    reducedMotion,
  };

  if (!DATA) {
    document.body.insertAdjacentHTML("afterbegin", "<p class='wrap'>The site's data is missing; run <code>./ardent build</code>.</p>");
    return;
  }
  header();
  footer();
  document.addEventListener("DOMContentLoaded", markNew);
})();
