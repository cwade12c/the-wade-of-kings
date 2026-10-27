/* The Wade of Kings — shared page code.
   Reads window.PALANAEUM (written by ./ardent build), draws the header and footer,
   runs friend mode (a visitor's own bookmark hides everything stamped later), and marks
   anything new since the visitor's last look. */
(function () {
  "use strict";
  const DATA = window.PALANAEUM;
  const root = document.body.dataset.root || "";
  const NAV = [
    ["index.html", "Home"],
    ["unfolding.html", "The Unfolding"],
    ["codex.html", "Codex"],
    ["journal.html", "Journal"],
    ["ledger.html", "Called It"],
    ["dispatches.html", "Dispatches"],
    ["chronicle.html", "Chronicle"],
  ];
  const FOLDERS = {
    people: "People", peoples: "Peoples and groups", places: "Places", things: "Things",
    systems: "Systems and customs", fieldguide: "Field guide", lore: "Lore",
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
  const unitAnchor = (id) => id.replace(":", "-");
  const entName = (id) => (entityById[id] ? entityById[id].name : id);
  const entLink = (id) => entityById[id] && visible(entityById[id].h)
    ? `<a class="ent" href="${root}codex.html#${id}">${esc(entName(id))}</a>` : esc(entName(id));

  function renderSections(sections, opts = {}) {
    let html = "";
    for (const s of sections || []) {
      const items = s.items.filter((it) => visible(it.h));
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

  // ------------------------------------------------------------ chrome
  function header() {
    const here = document.body.dataset.page === "dispatch" ? "dispatches.html" : (location.pathname.split("/").pop() || "index.html");
    const nav = NAV.map(([href, label]) =>
      `<a href="${root}${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("");
    const options = units.slice(0, -1).map((u) =>
      `<option value="${u.h}"${friendH() === u.h ? " selected" : ""}>${esc(unitLabel(u))}</option>`).join("");
    const el = document.createElement("header");
    el.className = "site-head";
    el.innerHTML = `<div class="wrap">
      <a class="masthead" href="${root}index.html">${esc(DATA.meta.title)}</a>
      <nav class="nav" aria-label="Pages">${nav}</nav>
      <label class="friend">Reading along?
        <select id="friend-select" aria-label="Your bookmark">
          <option value="">I'm caught up with Wade</option>${options}
        </select></label></div>`;
    document.body.prepend(el);
    el.querySelector("#friend-select").addEventListener("change", (e) => {
      if (e.target.value === "") localStorage.removeItem(FRIEND_KEY);
      else localStorage.setItem(FRIEND_KEY, e.target.value);
      location.reload();
    });
    const f = friendH();
    if (f !== null) {
      const b = document.createElement("div");
      b.className = "friend-banner";
      b.innerHTML = `<div class="wrap"><span>Friend mode: showing only what's been established by ${esc(unitLabel(units[f]))}, your bookmark. Summaries written later are hidden line by line.</span>
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
      <p class="poker">Read further than Wade? Please don't react to his predictions, not even with a 👀. Every reaction is a spoiler.</p>
      <div class="meta">Spoilers through ${esc(hz.book)}, ${esc(unitLabel(unitById[hz.id]))}.<br>
        Kept by Wade's ardent in the Palanaeum. <a href="${root}feed.xml">Follow the feed</a></div></div>`;
    document.body.append(el);
  }

  function markNew() {
    document.querySelectorAll("[data-new]").forEach((n) => n.classList.add("is-new"));
  }

  // The sphere string: one sphere per unit read (no placeholders for what's ahead; the
  // storm edge is all that marks the unread). Used on the home page and as the scrubber.
  function sphereString(el, caption, opts = {}) {
    const shown = units.filter((u) => visible(u.h));
    el.innerHTML = shown.map((u) => {
      const cls = ["sphere-btn", u.kind === "interlude" ? "interlude" : ""].join(" ");
      return `<button type="button" class="${cls}" data-h="${u.h}" aria-label="${esc(unitLabel(u))}"></button>`;
    }).join("") + `<span class="storm-edge" title="Not read yet"></span>`;
    const describe = (u) => {
      const pov = u.pov.map(entName).join(" and ");
      return `<strong>${esc(unitLabel(u))}</strong>${pov ? ` &nbsp;through ${esc(pov)}'s eyes` : ""}${u.part ? ` &nbsp;<span class="muted">${esc(u.part)}</span>` : ""}`;
    };
    const set = (u) => { if (caption) caption.innerHTML = describe(u); };
    if (caption) caption.innerHTML = opts.idle || describe(shown[shown.length - 1]);
    el.querySelectorAll(".sphere-btn").forEach((b) => {
      const u = units[Number(b.dataset.h)];
      b.addEventListener("mouseenter", () => set(u));
      b.addEventListener("focus", () => set(u));
      b.addEventListener("click", () => opts.onSelect ? opts.onSelect(u) : (location.href = `${root}journal.html#${unitAnchor(u.id)}`));
    });
    return {
      setActive(h) {
        el.querySelectorAll(".sphere-btn").forEach((b) => {
          const bh = Number(b.dataset.h);
          b.classList.toggle("dim", bh > h);
          b.setAttribute("aria-pressed", String(bh === h));
        });
        if (units[h]) set(units[h]);
      },
    };
  }

  function lightbox(src, alt) {
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = `<img src="${esc(src)}" alt="${esc(alt)}">`;
    box.addEventListener("click", () => box.remove());
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { box.remove(); document.removeEventListener("keydown", k); } });
    document.body.append(box);
  }

  window.P = {
    data: DATA, esc, units, unitById, entities, entityById, H, TYPES, FOLDERS,
    friendH, limit, visible, isNew, isPov, summaryOf, unitLabel, unitAnchor, entName, entLink, renderSections, markNew, lightbox, sphereString,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };

  if (!DATA) {
    document.body.insertAdjacentHTML("afterbegin", "<p class='wrap'>Gallery data is missing. Run <code>./ardent build</code>.</p>");
    return;
  }
  header();
  footer();
  document.addEventListener("DOMContentLoaded", markNew);
})();
