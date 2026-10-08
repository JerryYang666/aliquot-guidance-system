// The Aliquot Guide explainer video. Every frame is a pure function of time,
// so scripts/render-explainer.mjs can step through it frame by frame and get
// the same picture every time. Open index.html in a browser to watch it play: Space pauses,
// the arrow keys seek.
(function () {
  "use strict";

  const W = 1920;
  const H = 1080;
  const FPS = 30;
  const ICONS = window.EXPLAINER_ICONS;
  const SPOKEN = window.EXPLAINER_NARRATION || {};
  /** Seconds from the start of a beat to its first spoken word. */
  const LEAD = 0.35;
  /** Seconds of quiet after a beat's last word. */
  const TAIL = 0.5;
  /** How long a scene takes to fade in, and again to fade out. */
  const FADE = 0.4;

  const stage = document.getElementById("stage");
  let stageScale = 1;

  // ---------------------------------------------------------------- timing

  const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = {
    linear: (x) => x,
    out: (x) => 1 - (1 - x) ** 3,
    in: (x) => x ** 3,
    inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
    back: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
  };

  /** 0 before `start`, 1 after `start + dur`, eased in between. */
  const p = (t, start, dur = 0.5, e = ease.inOut) =>
    e(clamp((t - start) / dur));

  /** Fades in at `a` and out by `b`. */
  const vis = (t, a, b = Infinity, f = 0.35) =>
    Math.min(p(t, a, f, ease.out), 1 - p(t, b - f, f, ease.in));

  /** Interpolates [time, value, ease?] keyframes; values are numbers or arrays. */
  function kf(t, frames, e = ease.inOut) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      const [t1, v1, e1] = frames[i];
      if (t < t1) {
        const [t0, v0] = frames[i - 1];
        const k = (e1 || e)((t - t0) / (t1 - t0));
        return Array.isArray(v0)
          ? v0.map((v, j) => lerp(v, v1[j], k))
          : lerp(v0, v1, k);
      }
    }
    return frames[frames.length - 1][1];
  }

  /** A short press: 0 → 1 → 0 over `dur` seconds from `start`. */
  const pulse = (t, start, dur = 0.25) => {
    const x = (t - start) / dur;
    return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x);
  };

  // ------------------------------------------------------------------- DOM

  function make(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }

  function add(parent, html) {
    const el = make(html);
    parent.appendChild(el);
    return el;
  }

  const icon = (name, size = 24, stroke = 2) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  function size(el) {
    if (el._w === undefined) {
      el._w = el.offsetWidth;
      el._h = el.offsetHeight;
    }
    return el;
  }

  /**
   * Puts an `.abs` element with its anchor point (ax, ay: 0 = left/top,
   * 0.5 = center) at (x, y) on the stage, scaled around that anchor.
   */
  function place(
    el,
    { x = 0, y = 0, s = 1, o = 1, r = 0, ax = 0.5, ay = 0.5 },
  ) {
    size(el);
    el.style.transformOrigin = `${ax * 100}% ${ay * 100}%`;
    el.style.transform = `translate(${(x - el._w * ax).toFixed(2)}px, ${(y - el._h * ay).toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    show(el, o);
  }

  function show(el, o) {
    el.style.opacity = o.toFixed(3);
    el.style.visibility = o < 0.002 ? "hidden" : "visible";
  }

  /** An element's box in stage coordinates, whatever transforms it is under. */
  function rel(el) {
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const k = 1 / stageScale;
    const x = (r.left - s.left) * k;
    const y = (r.top - s.top) * k;
    const w = r.width * k;
    const h = r.height * k;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };

  // ----------------------------------------------------------------- data

  const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"];
  const SETS = ["Ship", "Keep2", "Keep3"];
  const SET_COLORS = ["#1d4ed8", "#047857", "#7c3aed"];

  const ROLES = {
    puller: {
      name: "Puller",
      icon: "package-open",
      line: "Takes source tubes from the freezer and returns them.",
      device: "laptop",
    },
    labeler: {
      name: "Labeler",
      icon: "tag",
      line: "Sticks the three labels on new tubes.",
      device: "laptop",
    },
    aliquoter: {
      name: "Aliquoter",
      icon: "beaker",
      line: "Pipettes, then scans each new tube with the camera.",
      device: "smartphone",
    },
    overview: {
      name: "Overview",
      icon: "eye",
      line: "Watches progress and fixes mistakes.",
      device: "laptop",
    },
  };

  /** Sample n of batch 1, as the pull list has it. */
  function sample(n) {
    const inCaseBox = n > 36;
    const at = inCaseBox ? n - 37 : n - 1;
    const row = ROWS[Math.floor(at / 10)];
    const col = (at % 10) + 1;
    const newId = `S${String(n).padStart(4, "0")}`;
    return {
      n,
      newId,
      originalId: String(41474 + n),
      box: inCaseBox ? "case_box 1" : "AIP Box 4",
      location: inCaseBox ? "case box" : "2nd shelf",
      position: `1-${row}-${col}`,
      cell: `${row}${col}`,
      slot: `${ROWS[Math.floor((n - 1) / 10)]}${((n - 1) % 10) + 1}`,
      label: (k) => `${newId}-${k}`,
    };
  }

  const S66 = sample(66);
  const S67 = sample(67);

  // ------------------------------------------------------------- drawings

  let uid = 0;

  function hash(text) {
    let h = 2166136261;
    for (const c of text) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** A Data Matrix look-alike for a label: finder edges, timing edges, noise. */
  function matrix(text, x, y, sizePx, n = 12) {
    let seed = hash(text);
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const m = sizePx / n;
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let on;
        if (c === 0 || r === n - 1) on = true;
        else if (r === 0) on = c % 2 === 0;
        else if (c === n - 1) on = r % 2 === 1;
        else on = rnd() < 0.48;
        if (on)
          d += `M${(x + c * m).toFixed(2)} ${(y + r * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h${(-m).toFixed(2)}z`;
      }
    }
    return `<path d="${d}" fill="#0f172a" shape-rendering="crispEdges"/>`;
  }

  /** A printed tube label: the text and its Data Matrix. */
  function labelSVG(text, w = 150) {
    const h = w * 0.62;
    return `<svg width="${w}" height="${h.toFixed(1)}" viewBox="0 0 150 93"><rect x="1" y="1" width="148" height="91" rx="8" fill="#fff" stroke="#cbd5e1" stroke-width="2"/>${matrix(text, 12, 14, 64, 14)}<text x="113" y="44" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="800" font-size="17" fill="#0f172a" text-anchor="middle">${text.slice(0, 5)}</text><text x="113" y="70" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="800" font-size="20" fill="#0f172a" text-anchor="middle">${text.slice(5)}</text></svg>`;
  }

  const TUBE_BODY =
    "M18 56 H82 V226 Q82 240 74 250 L57 270 Q50 278 43 270 L26 250 Q18 240 18 226 Z";

  /**
   * A screw-cap tube seen from the side, 100 × 280, with a fill level. New
   * tubes' labels carry a Data Matrix to scan; an original tube's label has
   * only its number (`code: false`).
   */
  function tube(
    parent,
    { label = "", cap = "#334155", level = 0, code = true } = {},
  ) {
    const id = `tube${uid++}`;
    let ridges = "";
    for (let x = 26; x <= 74; x += 8)
      ridges += `<line x1="${x}" y1="6" x2="${x}" y2="38" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>`;
    const mono = `font-family="JetBrains Mono, ui-monospace, monospace" font-weight="800" fill="#0f172a" text-anchor="middle"`;
    const text = code
      ? `<text x="50" y="83" ${mono} font-size="12">${label}</text>${matrix(label, 33, 94, 34)}`
      : `<text x="50" y="115" ${mono} font-size="17">${label}</text>`;
    const labelSvg = label
      ? `<g class="lbl-g"><rect x="20" y="66" width="60" height="86" rx="4" fill="#fff" stroke="#cbd5e1" stroke-width="1.5"/>${text}</g>`
      : "";
    const el = add(
      parent,
      `<div class="abs" style="width:100px;height:280px"><svg width="100" height="280" viewBox="0 0 100 280" overflow="visible">
        <defs><clipPath id="${id}"><path d="${TUBE_BODY}"/></clipPath></defs>
        <ellipse cx="50" cy="282" rx="40" ry="7" fill="rgba(15,23,42,0.12)"/>
        <path d="${TUBE_BODY}" fill="rgba(255,255,255,0.94)"/>
        <g clip-path="url(#${id})"><rect class="liq" x="0" y="280" width="100" height="300" fill="#f2c14e"/><rect class="liq-top" x="0" y="280" width="100" height="5" fill="#f8d98a"/></g>
        <rect x="25" y="62" width="7" height="160" rx="3.5" fill="#fff" opacity="0.85"/>
        <path d="${TUBE_BODY}" fill="none" stroke="#94a3b8" stroke-width="3"/>
        <rect x="12" y="38" width="76" height="20" rx="5" fill="#1e293b"/>
        <rect x="16" y="0" width="68" height="44" rx="9" fill="${cap}"/>${ridges}
        ${labelSvg}
      </svg></div>`,
    );
    el._w = 100;
    el._h = 280;
    const liq = el.querySelector(".liq");
    const top = el.querySelector(".liq-top");
    el.level = (v) => {
      const y = lerp(276, 150, clamp(v));
      liq.setAttribute("y", y.toFixed(1));
      top.setAttribute("y", y.toFixed(1));
      top.setAttribute("opacity", v > 0.02 ? "1" : "0");
    };
    el.level(level);
    return el;
  }

  /** A small tube glyph for diagrams. */
  function miniTube(color = "#f2c14e", cap = "#334155") {
    return `<svg width="34" height="96" viewBox="0 0 100 280"><path d="${TUBE_BODY}" fill="#fff" stroke="#94a3b8" stroke-width="6"/><path d="M18 170 H82 V226 Q82 240 74 250 L57 270 Q50 278 43 270 L26 250 Q18 240 18 226 Z" fill="${color}"/><rect x="12" y="38" width="76" height="20" rx="5" fill="#1e293b"/><rect x="16" y="0" width="68" height="44" rx="9" fill="${cap}"/></svg>`;
  }

  /** A single-channel pipette whose tip is its anchor point. */
  function pipette(parent) {
    const el = add(
      parent,
      `<div class="abs" style="width:90px;height:380px"><svg width="90" height="380" viewBox="0 0 90 380">
        <rect x="33" y="0" width="24" height="44" rx="8" fill="#94a3b8"/>
        <rect x="24" y="36" width="42" height="18" rx="6" fill="#64748b"/>
        <path d="M18 54 H72 Q80 54 78 66 L70 220 Q69 232 58 232 H32 Q21 232 20 220 L12 66 Q10 54 18 54 Z" fill="#334155"/>
        <rect x="30" y="80" width="30" height="60" rx="6" fill="#1e293b"/>
        <text x="45" y="116" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#e2e8f0" text-anchor="middle">200</text>
        <rect x="34" y="232" width="22" height="30" rx="4" fill="#475569"/>
        <path d="M35 262 H55 L47.5 378 H42.5 Z" fill="rgba(255,255,255,0.95)" stroke="#94a3b8" stroke-width="2"/>
        <path class="tip-liq" d="M40 340 H50 L47.5 378 H42.5 Z" fill="#f2c14e"/>
      </svg></div>`,
    );
    el._w = 90;
    el._h = 380;
    const liq = el.querySelector(".tip-liq");
    el.fill = (v) => {
      const y = lerp(377, 290, clamp(v));
      const half = lerp(2.5, 9, (y - 262) / 116 > 0 ? 1 - (y - 262) / 116 : 1);
      liq.setAttribute(
        "d",
        `M${(45 - half).toFixed(2)} ${y.toFixed(1)} H${(45 + half).toFixed(2)} L47.5 378 H42.5 Z`,
      );
      liq.setAttribute("opacity", v > 0.02 ? "1" : "0");
    };
    el.fill(0);
    return el;
  }

  /**
   * A 10 × 10 box seen from above. `kind` "source" has a cap in every hole;
   * "dest" starts empty. Returns the element and a way to style each cell.
   */
  function physBox(parent, { pitch = 40, kind = "source" }) {
    const pad = pitch * 0.4;
    const lab = pitch * 0.55;
    const w = pad * 2 + lab + pitch * 10;
    const h = w;
    const fillBox = kind === "source" ? "#dfe6ef" : "#ffffff";
    let svg = `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${pitch * 0.5}" fill="${fillBox}" stroke="#b8c4d4" stroke-width="3"/>`;
    const fs = Math.max(9, pitch * 0.34);
    for (let c = 1; c <= 10; c++)
      svg += `<text x="${pad + lab + pitch * (c - 0.5)}" y="${pad + lab * 0.62}" font-size="${fs}" font-family="Inter, sans-serif" font-weight="600" fill="#94a3b8" text-anchor="middle">${c}</text>`;
    ROWS.forEach((row, r) => {
      svg += `<text x="${pad + lab * 0.42}" y="${pad + lab + pitch * (r + 0.5) + fs * 0.36}" font-size="${fs}" font-family="Inter, sans-serif" font-weight="600" fill="#94a3b8" text-anchor="middle">${row}</text>`;
      for (let c = 1; c <= 10; c++) {
        const cx = pad + lab + pitch * (c - 0.5);
        const cy = pad + lab + pitch * (r + 0.5);
        const hole = kind === "source" ? "#b6c3d3" : "#f1f5f9";
        const holeStroke = kind === "source" ? "none" : "#e2e8f0";
        svg += `<circle cx="${cx}" cy="${cy}" r="${pitch * 0.4}" fill="${hole}" stroke="${holeStroke}" stroke-width="1.5"/>`;
        svg += `<circle data-key="${row}${c}" cx="${cx}" cy="${cy}" r="${pitch * 0.36}" fill="#475569" ${kind === "source" ? "" : 'opacity="0"'}/>`;
      }
    });
    svg += `<circle class="ring" cx="0" cy="0" r="${pitch * 0.55}" fill="none" stroke="#f59e0b" stroke-width="${pitch * 0.13}" opacity="0"/>`;
    const el = add(
      parent,
      `<div class="abs" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svg}</svg></div>`,
    );
    el._w = w;
    el._h = h;
    const cells = {};
    el.querySelectorAll("[data-key]").forEach((c) => {
      cells[c.dataset.key] = c;
    });
    const ring = el.querySelector(".ring");
    el.cells = cells;
    el.pitch = pitch;
    /** Where a cell's center is, relative to the box's center. */
    el.offset = (key) => {
      const row = ROWS.indexOf(key[0]);
      const col = Number(key.slice(1));
      return {
        dx: pad + lab + pitch * (col - 0.5) - w / 2,
        dy: pad + lab + pitch * (row + 0.5) - h / 2,
      };
    };
    el.ring = (key, o, scale = 1) => {
      const { dx, dy } = el.offset(key);
      ring.setAttribute("cx", dx + w / 2);
      ring.setAttribute("cy", dy + h / 2);
      ring.setAttribute("r", (pitch * 0.55 * scale).toFixed(2));
      ring.setAttribute("opacity", o.toFixed(3));
    };
    /** A cap in a cell: shown (k = 1) or not (k = 0), in a color. */
    el.cap = (key, k, color = "#475569") => {
      const c = cells[key];
      c.setAttribute("opacity", k > 0.01 ? "1" : "0");
      c.setAttribute("r", (pitch * 0.36 * clamp(k, 0, 1.3)).toFixed(2));
      c.setAttribute("fill", color);
    };
    return el;
  }

  /** Where a cell of a placed box is on the stage. */
  function cellOnStage(box, key, bx, by, s = 1) {
    const { dx, dy } = box.offset(key);
    return { x: bx + dx * s, y: by + dy * s };
  }

  function keycap(parent, label, glyph = "") {
    const el = add(
      parent,
      `<div class="abs keycap">${glyph ? icon(glyph, 40, 2.4) : ""}${label}</div>`,
    );
    /** k = how far the key is pressed down, 0 to 1. */
    el.press = (k) => {
      el.style.boxShadow = `0 ${(10 - 8 * k).toFixed(1)}px 0 #cbd5e1, 0 ${(22 - 12 * k).toFixed(1)}px 30px -10px rgba(15,23,42,${(0.35 - 0.15 * k).toFixed(2)})`;
      el.style.background =
        k > 0.3
          ? "linear-gradient(#f1f5f9, #e2e8f0)"
          : "linear-gradient(#ffffff, #f1f5f9)";
    };
    return el;
  }

  function roleChip(parent, role, dark = true) {
    const r = ROLES[role];
    return add(
      parent,
      `<div class="abs chip ${dark ? "dark" : "light"}" style="font-size:26px;padding:12px 22px">${icon(r.icon, 28)}${r.name}</div>`,
    );
  }

  function ripple(parent) {
    return add(
      parent,
      `<div class="abs" style="width:80px;height:80px;border-radius:50%;border:5px solid #f59e0b;background:rgba(245,158,11,0.18)"></div>`,
    );
  }

  /** A tap at (x, y) starting at `start`. */
  function tap(el, t, start, x, y) {
    const k = clamp((t - start) / 0.55);
    place(el, {
      x,
      y,
      s: lerp(0.35, 1.5, ease.out(k)),
      o: k <= 0 || k >= 1 ? 0 : 1 - k,
    });
  }

  /** An amber ring around a screen element; o = 0 hides it. */
  function highlight(el, o) {
    if (el._bg === undefined) el._bg = el.style.backgroundColor;
    el.style.outline = o > 0.01 ? `4px solid rgba(245,158,11,${o})` : "none";
    el.style.outlineOffset = "6px";
    el.style.borderRadius = el.style.borderRadius || "10px";
    el.style.backgroundColor =
      o > 0.01 ? `rgba(254,243,199,${(o * 0.8).toFixed(3)})` : el._bg;
  }

  const logoSVG = (px) =>
    `<svg width="${px}" height="${px}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0f172a"/><path d="M13 6h6v3h-1v13a2 2 0 0 1-4 0V9h-1z" fill="#fff"/><rect class="bar" x="6" y="20" width="4" height="7" rx="1.5" fill="#60a5fa"/><rect class="bar" x="14" y="24" width="4" height="3" rx="1" fill="#34d399"/><rect class="bar" x="22" y="20" width="4" height="7" rx="1.5" fill="#a78bfa"/></svg>`;

  // ------------------------------------------------------ the app's screens

  /** A station's top bar: role, batch and box, then name and job. */
  function stationHeader(role, name, { phone = false } = {}) {
    const r = ROLES[role];
    if (phone)
      return `<header class="hdr" style="padding:44px 16px 10px;flex-wrap:wrap;gap:10px">
        <span class="hdr-ic" style="width:36px;height:36px;border-radius:8px">${icon(r.icon, 20)}</span>
        <span class="hdr-role" style="font-size:24px;font-weight:700">${r.name}</span>
        <span style="margin-left:auto" class="live">Live</span>
        <div style="flex-basis:100%;display:flex;align-items:center;gap:8px">
          <span style="font-size:20px;font-weight:700">Batch 1 · Box 1</span>
          <span style="flex:1;font-size:13px;color:#cbd5e1;overflow:hidden;white-space:nowrap">${name}</span>
          <span class="qr-btn" style="font-size:12px">${icon("qr-code", 14)} QR code to join</span>
        </div>
      </header>`;
    return `<header class="hdr">
      <span class="hdr-ic">${icon(r.icon, 28)}</span>
      <div>
        <div class="hdr-line"><span class="hdr-role">${r.name}</span><span class="hdr-station">Batch 1 · Box 1</span></div>
        <div class="hdr-sub">${name} · Study aliquots <span class="mono" style="margin-left:6px;font-size:12px;color:#94a3b8">ABCD-EFGH</span></div>
      </div>
      <div class="hdr-right">
        <span class="live">Live</span>
        <span class="row" style="gap:4px">${icon("sun", 14)} Awake</span>
        <span class="row" style="gap:4px">${icon("users", 16)} 3</span>
        <span class="qr-btn">${icon("qr-code", 16)} QR code to join</span>
        ${icon("menu", 20)}
      </div>
    </header>`;
  }

  function stripHTML() {
    return `<div class="strip"><span>Pull<b class="st-pull">S0066</b></span><span>Label<b class="st-label">S0066</b></span><span>Aliquot<b class="st-aliquot">S0065</b></span><span>To return<b class="st-return">0</b></span><span>Done<b class="st-done">65/100</b></span></div>`;
  }

  /** The app's BoxGrid: a 10 × 10 grid with one cell picked out. */
  function gridHTML(
    width,
    highlightKey,
    { color = "#0f172a", labels = true } = {},
  ) {
    let html = `<div class="grid10" style="width:${width}px;grid-template-columns:${labels ? "16px " : ""}repeat(10,minmax(0,1fr))">`;
    if (labels) {
      html += "<div></div>";
      for (let c = 1; c <= 10; c++) html += `<div>${c}</div>`;
    }
    for (const row of ROWS) {
      if (labels) html += `<div>${row}</div>`;
      for (let c = 1; c <= 10; c++) {
        const key = `${row}${c}`;
        const on = key === highlightKey;
        html += `<div class="cell" data-key="${key}" style="${on ? `background:${color};box-shadow:0 0 0 2px #fff,0 0 0 4px ${color};font-size:${width > 250 ? 12 : 0}px` : ""}">${on ? key : ""}</div>`;
      }
    }
    return html + "</div>";
  }

  /** A swap region: two layers, `a` leaving and `b` arriving as k goes 0 → 1. */
  function swap(a, b, k, dist = 40) {
    a.style.transform = `translateX(${(-dist * k).toFixed(1)}px)`;
    b.style.transform = `translateX(${(dist * (1 - k)).toFixed(1)}px)`;
    show(a, 1 - clamp(k * 1.6));
    show(b, clamp(k * 1.6 - 0.6));
  }

  function windowFrame(parent, inner, w = 1280, h = 780) {
    const el = add(
      parent,
      `<div class="abs window" style="width:${w}px;height:${h + 40}px"><div class="window-bar"><i></i><i></i><i></i></div><div class="app" style="width:${w}px;height:${h}px">${inner}</div></div>`,
    );
    el._w = w;
    el._h = h + 40;
    return el;
  }

  function phoneFrame(parent, inner, w = 390, h = 844) {
    const el = add(
      parent,
      `<div class="abs phone" style="width:${w + 28}px;height:${h + 28}px"><div class="phone-screen app" style="width:${w}px;height:${h}px">${inner}<div style="position:absolute;left:50%;top:12px;width:110px;height:30px;margin-left:-55px;border-radius:20px;background:#0f172a"></div></div></div>`,
    );
    el._w = w + 28;
    el._h = h + 28;
    return el;
  }

  // ------------------------------------------------------------ the scenes

  const scenes = [];
  const scene = (def) => scenes.push(def);

  function sceneHeader(root, eyebrow, heading) {
    return add(
      root,
      `<div class="abs"><div class="eyebrow">${eyebrow}</div><div class="heading">${heading}</div></div>`,
    );
  }

  function placeHeader(el, t) {
    place(el, {
      x: 96,
      y: kf(t, [
        [0.1, 76],
        [0.8, 60],
      ]),
      ax: 0,
      ay: 0,
      o: p(t, 0.1, 0.6),
    });
  }

  // 1. Title
  scene({
    id: "intro",
    chrome: false,
    beats: [
      {
        id: "hello",
        say: "This is Aliquot Guide. Here's how we aliquot our samples, and what to do at your station.",
        min: 6,
      },
    ],
    build(root) {
      const r = {};
      r.logo = add(
        root,
        `<div class="abs" style="width:220px;height:220px">${logoSVG(220)}</div>`,
      );
      r.bars = [...r.logo.querySelectorAll(".bar")];
      r.title = add(
        root,
        `<div class="abs" style="font-size:120px;font-weight:800;letter-spacing:-0.045em">Aliquot Guide</div>`,
      );
      r.sub = add(
        root,
        `<div class="abs" style="font-size:38px;font-weight:500;color:var(--mute);letter-spacing:-0.01em">How we aliquot, and what to do at your station</div>`,
      );
      r.chips = ["puller", "labeler", "aliquoter"].map((role) =>
        roleChip(root, role, false),
      );
      return r;
    },
    render(t, T, r) {
      const k = p(t, 0.15, 0.7, ease.back);
      place(r.logo, { x: 960, y: 330, s: lerp(0.6, 1, k), o: p(t, 0.15, 0.4) });
      const full = [
        [20, 7],
        [24, 3],
        [20, 7],
      ];
      r.bars.forEach((bar, i) => {
        const g = p(t, 0.7 + i * 0.15, 0.6, ease.out);
        const [y, h] = full[i];
        bar.setAttribute("y", (y + h * (1 - g)).toFixed(2));
        bar.setAttribute("height", Math.max(0.01, h * g).toFixed(2));
      });
      place(r.title, {
        x: 960,
        y: lerp(560, 540, p(t, 0.9, 0.8)),
        o: p(t, 0.9, 0.6),
      });
      place(r.sub, {
        x: 960,
        y: lerp(650, 630, p(t, 1.3, 0.8)),
        o: p(t, 1.3, 0.6),
      });
      r.chips.forEach((chip, i) => {
        const g = p(t, 2.2 + i * 0.18, 0.6, ease.back);
        place(chip, {
          x: 690 + i * 270,
          y: lerp(800, 770, g),
          o: p(t, 2.2 + i * 0.18, 0.4),
          s: lerp(0.9, 1, g),
        });
      });
    },
  });

  // 2. The process: one original tube becomes three, in three boxes.
  scene({
    id: "process",
    beats: [
      {
        id: "pull",
        say: "Here's the job. We take one original tube out of the freezer.",
        min: 5,
      },
      { id: "split", say: "We split it into three new tubes.", min: 5.6 },
      {
        id: "labels",
        say: "Each new tube has its own label: the sample's new ID, then dash one, dash two, or dash three.",
        min: 5,
      },
      {
        id: "boxes",
        say: "Each one goes into its own box: Ship, Keep 2, and Keep 3. Always in the same slot.",
        min: 6,
      },
      {
        id: "back",
        say: "Then the original tube goes back into the freezer, right where it came from.",
        min: 5,
      },
    ],
    plan({ at, cue }) {
      const T = {
        pull: at("pull"),
        lift: at("pull") + 1.4,
        split: at("split"),
        labels: at("labels"),
        boxes: at("boxes"),
        back: at("back"),
      };
      T.pip = T.split + 0.9;
      T.fly = ["Ship", "Keep 2", "Keep 3"].map((ph) => cue("boxes", ph) + 0.1);
      T.home = cue("back", "freezer") + 0.2;
      T.dash = ["dash one", "dash two", "dash three"].map((ph) =>
        cue("labels", ph),
      );
      return T;
    },
    sounds(T) {
      return [
        ...T.fly.map((t) => ({ t: t + 0.75, kind: "pop" })),
        { t: T.home + 1.15, kind: "pop" },
      ];
    },
    build(root) {
      const r = {};
      r.head = sceneHeader(
        root,
        "The process",
        "One tube in. Three tubes out.",
      );
      r.freezer = physBox(root, { pitch: 40, kind: "source" });
      r.freezerTitle = add(
        root,
        `<div class="abs row" style="gap:10px;font-size:26px;font-weight:700;color:var(--ink-2)">${icon("snowflake", 28)} Freezer · case_box 1</div>`,
      );
      r.dest = [0, 1, 2].map(() => physBox(root, { pitch: 21, kind: "dest" }));
      r.destTitles = [0, 1, 2].map((k) =>
        add(
          root,
          `<div class="abs" style="width:250px;display:flex;justify-content:space-between;font-size:26px;font-weight:800;color:${SET_COLORS[k]}"><span>${SETS[k]} 1</span><span class="mono slot" style="font-size:22px">G6</span></div>`,
        ),
      );
      r.src = tube(root, { label: S66.originalId, level: 0.82, code: false });
      r.news = [1, 2, 3].map((k) =>
        tube(root, { label: S66.label(k), cap: "#475569" }),
      );
      r.pip = pipette(root);
      r.origChip = add(
        root,
        `<div class="abs chip dark" style="font-size:24px">Original ID <span class="mono" style="font-size:28px">41540</span></div>`,
      );
      r.newChip = add(
        root,
        `<div class="abs chip light" style="font-size:24px">New ID <span class="mono" style="font-size:28px">S0066</span></div>`,
      );
      r.dash = [1, 2, 3].map((k) =>
        add(
          root,
          `<div class="abs mono" style="padding:8px 16px;border-radius:12px;font-size:30px;font-weight:800;color:#fff;background:${SET_COLORS[k - 1]}">-${k}</div>`,
        ),
      );
      return r;
    },
    render(t, T, r) {
      placeHeader(r.head, t);

      // The freezer box: in, out of the way, and back again.
      const fx = kf(t, [
        [T.pull, -260],
        [T.pull + 0.8, 420, ease.out],
        [T.split + 0.1, 420],
        [T.split + 0.9, -340],
        [T.back + 0.7, -340],
        [T.back + 1.5, 420],
      ]);
      const fy = 610;
      place(r.freezer, { x: fx, y: fy });
      place(r.freezerTitle, { x: fx - 222, y: fy - 262, ax: 0 });
      const ringOn =
        vis(t, T.pull + 0.6, T.lift + 0.6) + vis(t, T.back + 1.5, T.home + 1.4);
      r.freezer.ring("C10", ringOn, 1 + 0.12 * Math.sin(t * 7));
      r.freezer.cap("C10", t < T.lift + 0.15 || t > T.home + 1.15 ? 1 : 0);

      // The original tube rises out of C10, then later sinks back in.
      const c10 = cellOnStage(r.freezer, "C10", fx, fy);
      const srcAt = kf(t, [
        [T.lift, [c10.x, c10.y, 0.2]],
        [T.lift + 0.9, [c10.x, c10.y - 260, 1.1], ease.out],
        [T.split + 0.1, [880, 560, 1.25]],
        [T.split + 0.8, [560, 600, 1.25]],
        [T.boxes + 0.1, [560, 600, 1.25]],
        [T.boxes + 0.9, [300, 600, 1.25]],
        [T.back + 0.2, [300, 600, 1.25]],
        [T.back + 0.8, [300, 300, 1.1]],
        [T.home, [cellOnStage(r.freezer, "C10", 420, fy).x, 300, 1.1]],
        [T.home + 1.1, [cellOnStage(r.freezer, "C10", 420, fy).x, c10.y, 0.2]],
      ]);
      const srcO =
        t < T.home + 0.9 ? p(t, T.lift, 0.3) : 1 - p(t, T.home + 0.9, 0.25);
      // Between lifting and the move to center, follow the freezer's cell.
      if (t < T.lift + 0.9) {
        const k = p(t, T.lift, 0.9, ease.out);
        srcAt[0] = c10.x;
        srcAt[1] = lerp(c10.y, c10.y - 260, k);
      } else if (t < T.split + 0.1) {
        const k = p(t, T.lift + 1.0, 0.9);
        srcAt[0] = lerp(c10.x, 880, k);
        srcAt[1] = lerp(c10.y - 260, 560, k);
        srcAt[2] = lerp(1.1, 1.25, k);
      }
      place(r.src, { x: srcAt[0], y: srcAt[1], s: srcAt[2], o: srcO });

      // The pipette moves liquid from the original into each new tube.
      const shift = kf(t, [
        [T.boxes + 0.1, 0],
        [T.boxes + 0.9, -260],
      ]);
      const tubeX = [840, 990, 1140].map((x) => x + shift);
      const cycle = 1.15;
      let srcLevel = 0.82;
      const levels = [0, 0, 0];
      let pipX = 560;
      let pipY = 380;
      let pipFill = 0;
      for (let k = 0; k < 3; k++) {
        const t0 = T.pip + k * cycle;
        const draw = p(t, t0 + 0.2, 0.25);
        const give = p(t, t0 + 0.8, 0.25);
        srcLevel -= 0.17 * draw;
        levels[k] = 0.42 * give;
        if (t >= t0 - 0.35) {
          const x = kf(t, [
            [t0 - 0.35, k === 0 ? 560 : tubeX[k - 1]],
            [t0, 560],
            [t0 + 0.55, 560],
            [t0 + 0.75, tubeX[k]],
          ]);
          const dip = pulse(t, t0, 0.55) * 120 + pulse(t, t0 + 0.75, 0.4) * 110;
          pipX = x;
          pipY = 330 + dip;
          pipFill = draw - give;
        }
      }
      place(r.pip, {
        x: pipX,
        y: pipY,
        ay: 1,
        o: vis(t, T.pip - 0.5, T.pip + 3 * cycle + 0.1),
      });
      r.pip.fill(pipFill);
      r.src.level(srcLevel);

      // The three new tubes, which later fly into slot G6 of their boxes.
      const destX = [1150, 1440, 1730];
      const destY = 610;
      r.dest.forEach((box, k) => {
        const g = p(t, T.boxes + 0.6 + k * 0.12, 0.7, ease.out);
        const x = lerp(destX[k] + 500, destX[k], g);
        place(box, { x, y: destY, o: g });
        place(r.destTitles[k], { x: x - 125, y: destY - 168, ax: 0, o: g });
        const fill = p(t, T.fly[k] + 0.7, 0.3, ease.back);
        box.cap("G6", fill, SET_COLORS[k]);
        box.ring("G6", vis(t, T.fly[k] + 0.7, T.back + 2.4) * 0.9);
        show(r.destTitles[k].querySelector(".slot"), p(t, T.fly[k] + 0.8, 0.3));
      });
      r.news.forEach((tb, k) => {
        tb.level(levels[k]);
        const appear = p(t, T.split + 0.3 + k * 0.12, 0.5, ease.back);
        const cell = cellOnStage(r.dest[k], "G6", destX[k], destY);
        const fly = p(t, T.fly[k], 0.75);
        const x = lerp(tubeX[k], cell.x, fly);
        const y = lerp(620, cell.y, fly) - Math.sin(Math.PI * fly) * 140;
        place(tb, {
          x,
          y: y + (1 - appear) * 40,
          s: lerp(1.1, 0.16, fly),
          o: Math.min(appear, 1 - p(t, T.fly[k] + 0.6, 0.15)),
        });
      });

      // The IDs.
      place(r.origChip, {
        x: 560,
        y: 365,
        o: vis(t, T.labels + 0.2, T.boxes + 0.2),
      });
      place(r.newChip, {
        x: 990,
        y: 365,
        o: vis(t, T.labels + 0.9, T.boxes + 0.2),
      });
      r.dash.forEach((d, k) => {
        const g = p(t, T.dash[k], 0.45, ease.back);
        place(d, {
          x: tubeX[k],
          y: 830,
          s: lerp(0.6, 1, g),
          o: Math.min(p(t, T.dash[k], 0.3), 1 - p(t, T.fly[k], 0.3)),
        });
      });
    },
  });

  // 3. A batch.
  scene({
    id: "batch",
    beats: [
      {
        id: "all",
        say: "We repeat this for every sample in a batch, up to a hundred of them, following the pull list. Its order keeps trips to the freezer short.",
        min: 9,
      },
    ],
    plan({ at, end }) {
      return { a: at("all") + 0.6, b: end("all") - 0.8 };
    },
    build(root) {
      const r = {};
      r.head = sceneHeader(
        root,
        "A batch",
        "Up to 100 samples, in pull-list order.",
      );
      const cols = `grid-template-columns:70px 170px 190px 140px 150px 80px`;
      let rows = "";
      for (let n = 1; n <= 100; n++) {
        const s = sample(n);
        rows += `<div class="pl-row" style="display:grid;${cols};align-items:center;height:52px;padding:0 20px;font-size:21px;border-radius:12px"><span style="color:var(--faint)">${n}</span><span class="mono" style="font-weight:700">${s.originalId}</span><span>${s.box}</span><span class="mono">${s.position}</span><span class="mono" style="font-weight:700">${s.newId}</span><span class="mono">${s.slot}</span></div>`;
      }
      r.list = add(
        root,
        `<div class="abs panel" style="width:880px;height:740px;overflow:hidden">
          <div style="display:grid;${cols};padding:22px 40px 14px;font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--mute);border-bottom:1px solid var(--line)"><span>#</span><span>Original ID</span><span>Source box</span><span>Position</span><span>New ID</span><span>Slot</span></div>
          <div style="position:relative;height:660px;overflow:hidden;padding:0 20px"><div class="pl-rows" style="position:absolute;left:20px;right:20px;top:0">${rows}</div></div>
          <div style="position:absolute;left:0;right:0;bottom:0;height:90px;background:linear-gradient(rgba(255,255,255,0),#fff)"></div>
        </div>`,
      );
      r.rows = r.list.querySelector(".pl-rows");
      r.rowEls = [...r.list.querySelectorAll(".pl-row")];
      r.boxes = [0, 1, 2].map(() => physBox(root, { pitch: 21, kind: "dest" }));
      r.titles = [0, 1, 2].map((k) =>
        add(
          root,
          `<div class="abs" style="font-size:26px;font-weight:800;color:${SET_COLORS[k]}">${SETS[k]} 1</div>`,
        ),
      );
      r.count = add(
        root,
        `<div class="abs" style="text-align:center"><div class="eyebrow">Done</div><div class="tnum" style="font-size:84px;font-weight:800;letter-spacing:-0.03em"><span class="n">0</span><span style="color:var(--faint)"> / 100</span></div></div>`,
      );
      r.n = r.count.querySelector(".n");
      r.filled = 0;
      return r;
    },
    render(t, T, r) {
      placeHeader(r.head, t);
      const appear = p(t, 0.2, 0.7, ease.out);
      place(r.list, { x: 96, y: 250, ax: 0, ay: 0, o: appear });
      const n = Math.round(100 * p(t, T.a, T.b - T.a, ease.inOut));
      const cur = Math.min(n, 99);
      const scroll = clamp(cur - 4, 0, 100 - 12);
      r.rows.style.transform = `translateY(${(-scroll * 52).toFixed(1)}px)`;
      r.rowEls.forEach((row, i) => {
        const done = i < n;
        const now = i === cur && n < 100;
        row.style.background = now ? "#0f172a" : "";
        row.style.color = now ? "#fff" : done ? "#94a3b8" : "";
      });
      [1145, 1440, 1735].forEach((x, k) => {
        const g = p(t, 0.5 + k * 0.12, 0.7, ease.out);
        place(r.boxes[k], { x, y: 560, o: g, s: lerp(0.9, 1, g) });
        place(r.titles[k], { x: x - 128, y: 400, ax: 0, o: g });
      });
      if (r.filled !== n) {
        for (let i = 0; i < 100; i++) {
          const key = sample(i + 1).slot;
          r.boxes.forEach((box, k) =>
            box.cap(key, i < n ? 1 : 0, SET_COLORS[k]),
          );
        }
        r.filled = n;
      }
      place(r.count, { x: 1440, y: 830, o: p(t, 0.8, 0.5) });
      setText(r.n, String(n));
    },
  });

  // 4. The team.
  scene({
    id: "team",
    beats: [
      {
        id: "three",
        say: "Three people work together, each at their own screen.",
        min: 4,
      },
      {
        id: "puller",
        say: "The Puller takes the original tube from the freezer, and hands it to the Aliquoter.",
        min: 4.5,
      },
      {
        id: "labeler",
        say: "At the same time, the Labeler sticks labels on three new tubes, and hands those over too.",
        min: 4.5,
      },
      {
        id: "aliquoter",
        say: "The Aliquoter fills the three tubes, scans each one, and puts it in its box.",
        min: 4.5,
      },
      {
        id: "back",
        say: "Then the original tube goes back to the Puller, who returns it to the freezer.",
        min: 4.5,
      },
      {
        id: "sync",
        say: "The screens stay in step, so everyone always knows which tube is next.",
        min: 4.5,
      },
    ],
    plan({ at }) {
      return {
        three: at("three"),
        puller: at("puller"),
        labeler: at("labeler"),
        aliquoter: at("aliquoter"),
        back: at("back"),
        sync: at("sync"),
      };
    },
    build(root) {
      const r = {};
      r.head = sceneHeader(root, "The team", "Three people, three screens.");
      const card = (role) => {
        const info = ROLES[role];
        return add(
          root,
          `<div class="abs panel" style="width:420px;height:210px;padding:26px 28px">
            <div class="row" style="gap:20px"><div class="role-square" style="width:76px;height:76px">${icon(info.icon, 40)}</div>
            <div><div style="font-size:40px;font-weight:800;letter-spacing:-0.02em">${info.name}</div>
            <div class="row" style="gap:8px;margin-top:4px;font-size:18px;font-weight:600;color:var(--mute)">${icon(info.device, 20)} ${info.device === "smartphone" ? "Phone" : "Laptop or tablet"}</div></div>
            <div class="sync-dot" style="margin-left:auto;align-self:flex-start;width:18px;height:18px;border-radius:50%;background:#34d399;box-shadow:0 0 0 6px rgba(52,211,153,0.25)"></div></div>
            <div style="margin-top:18px;font-size:22px;line-height:1.35;color:var(--ink-2)">${info.line}</div>
          </div>`,
        );
      };
      r.cards = {
        puller: card("puller"),
        labeler: card("labeler"),
        aliquoter: card("aliquoter"),
      };
      r.dots = Object.values(r.cards).map((c) => c.querySelector(".sync-dot"));
      r.svg = add(
        root,
        `<svg class="abs" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">
          <path class="a-pa" d="M560 330 C700 330 690 520 800 520" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
          <path class="a-la" d="M560 790 C700 790 690 600 800 600" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
          <path class="a-ab" d="M1240 560 L1400 560" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
          <path class="a-ap" d="M1010 455 C1010 300 820 250 560 270" fill="none" stroke="#64748b" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round"/>
          <path class="a-sync" d="M350 440 L350 680 M560 330 L800 520 M560 790 L800 600" fill="none" stroke="#34d399" stroke-width="4" stroke-dasharray="6 12" stroke-linecap="round"/>
        </svg>`,
      );
      r.svg._w = W;
      r.svg._h = H;
      r.paths = {};
      ["pa", "la", "ab", "ap"].forEach((k) => {
        const path = r.svg.querySelector(`.a-${k}`);
        r.paths[k] = { el: path, len: path.getTotalLength() };
      });
      r.sync = r.svg.querySelector(".a-sync");
      r.boxes = [0, 1, 2].map((k) =>
        add(
          root,
          `<div class="abs col" style="align-items:center;gap:10px"><div style="width:120px;height:120px;border-radius:18px;background:#fff;box-shadow:0 0 0 3px ${SET_COLORS[k]};display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:14px">${'<i style="border-radius:50%;background:#e2e8f0"></i>'.repeat(25)}</div><div style="font-size:24px;font-weight:800;color:${SET_COLORS[k]}">${SETS[k]}</div></div>`,
        ),
      );
      r.tokSrc = add(root, `<div class="abs">${miniTube()}</div>`);
      r.tokBack = add(root, `<div class="abs">${miniTube("#f2c14e")}</div>`);
      r.tokLabels = [0, 1, 2].map(() =>
        add(root, `<div class="abs">${miniTube("#fff", "#475569")}</div>`),
      );
      r.tokFilled = [0, 1, 2].map((k) =>
        add(
          root,
          `<div class="abs">${miniTube(SET_COLORS[k], "#475569")}</div>`,
        ),
      );
      r.syncChip = add(
        root,
        `<div class="abs chip dark" style="font-size:26px;background:#065f46">${icon("zap", 26)} Every screen updates together</div>`,
      );
      return r;
    },
    render(t, T, r) {
      placeHeader(r.head, t);
      const cardAt = {
        puller: [350, 330],
        labeler: [350, 790],
        aliquoter: [1020, 560],
      };
      Object.entries(cardAt).forEach(([role, [x, y]], i) => {
        const g = p(t, T.three + 0.2 + i * 0.25, 0.6, ease.back);
        place(r.cards[role], {
          x,
          y,
          s: lerp(0.9, 1, g),
          o: p(t, T.three + 0.2 + i * 0.25, 0.35),
        });
      });
      // Draw each arrow as its beat begins; the return arrow is dotted, so it fades in.
      const fadeArrows = 1 - 0.75 * p(t, T.sync, 0.6);
      const draw = (k, start) => {
        const { el, len } = r.paths[k];
        const g = p(t, start, 0.7, ease.out);
        if (k === "ap") {
          el.style.opacity = String(g * fadeArrows);
        } else {
          el.style.strokeDasharray = `${len}`;
          el.style.strokeDashoffset = `${(1 - g) * len}`;
          el.style.opacity = String(g > 0 ? fadeArrows : 0);
        }
      };
      draw("pa", T.puller + 0.3);
      draw("la", T.labeler + 0.3);
      draw("ab", T.aliquoter + 0.3);
      draw("ap", T.back + 0.3);
      place(r.svg, { x: 0, y: 0, ax: 0, ay: 0 });

      const along = (k, g) => {
        const { el, len } = r.paths[k];
        const pt = el.getPointAtLength(clamp(g) * len);
        return pt;
      };
      // The original tube to the aliquoter.
      {
        const g = p(t, T.puller + 0.9, 1.4);
        const pt = along("pa", g);
        place(r.tokSrc, {
          x: pt.x,
          y: pt.y - 30,
          o: vis(t, T.puller + 0.8, T.labeler + 0.6),
          s: 1,
        });
      }
      // Three labeled tubes to the aliquoter.
      r.tokLabels.forEach((tok, i) => {
        const g = p(t, T.labeler + 0.9 + i * 0.18, 1.4);
        const pt = along("la", g);
        place(tok, {
          x: pt.x + (i - 1) * 4,
          y: pt.y - 30,
          o: vis(t, T.labeler + 0.8 + i * 0.18, T.aliquoter + 0.5),
        });
      });
      // Filled tubes into their boxes.
      r.tokFilled.forEach((tok, i) => {
        const start = T.aliquoter + 0.9 + i * 0.45;
        const g = p(t, start, 1.0);
        const pt = along("ab", g);
        const boxX = 1490 + i * 150;
        const x = g < 1 ? pt.x : boxX;
        const y = g < 1 ? pt.y - 30 : 560;
        const into = p(t, start + 1.0, 0.5);
        place(tok, {
          x: lerp(x, boxX, into),
          y: lerp(y, 520, into),
          s: lerp(1, 0.6, into),
          o: Math.min(p(t, start, 0.3), 1 - p(t, start + 1.3, 0.3)),
        });
      });
      r.boxes.forEach((box, k) => {
        const g = p(t, T.aliquoter + 0.2 + k * 0.12, 0.6, ease.back);
        place(box, {
          x: 1490 + k * 150,
          y: 580,
          s: lerp(0.8, 1, g),
          o: p(t, T.aliquoter + 0.2 + k * 0.12, 0.3),
        });
      });
      // The original tube back to the puller.
      {
        const g = p(t, T.back + 0.9, 1.5);
        const pt = along("ap", g);
        place(r.tokBack, {
          x: pt.x,
          y: pt.y - 20,
          o: vis(t, T.back + 0.8, T.back + 2.6),
        });
      }
      // Sync.
      const s = p(t, T.sync + 0.2, 0.6);
      r.sync.style.opacity = String(s);
      r.sync.style.strokeDashoffset = String(-t * 40);
      r.dots.forEach((d) => {
        const k = s * (0.5 + 0.5 * Math.sin(t * 6));
        d.style.boxShadow = `0 0 0 ${(6 + 10 * k).toFixed(1)}px rgba(52,211,153,${(0.35 * s).toFixed(2)})`;
        d.style.opacity = String(0.25 + 0.75 * s);
      });
      place(r.syncChip, {
        x: 1020,
        y: 860,
        o: s,
        s: lerp(0.9, 1, p(t, T.sync + 0.2, 0.6, ease.back)),
      });
    },
  });

  // 5. Joining.
  scene({
    id: "join",
    beats: [
      {
        id: "code",
        say: "To join, scan the job's QR code, or type in its eight-letter code.",
        min: 5,
      },
      {
        id: "form",
        say: "Enter your name, then pick your batch and your role.",
        min: 5,
      },
      {
        id: "start",
        say: "Read the short instructions for your role, then press Start.",
        min: 5.5,
      },
    ],
    plan({ at, cue }) {
      return {
        code: at("code"),
        form: at("form"),
        start: at("start"),
        typing: cue("code", "type") + 0.1,
        name: cue("form", "name") - 0.3,
        batch: cue("form", "batch") - 0.1,
        role: cue("form", "role") - 0.1,
        press: at("start") + 4.6,
      };
    },
    sounds(T) {
      return [{ t: T.press, kind: "tap" }];
    },
    build(root) {
      const r = {};
      r.head = sceneHeader(root, "Getting started", "Join the job.");
      const steps = [
        ["Scan the QR code,", "or type the job code."],
        ["Enter your name.", "Pick your batch and role."],
        ["Read the instructions.", "Press Start."],
      ];
      r.steps = steps.map(([a, b], i) =>
        add(
          root,
          `<div class="abs row" style="gap:28px;width:760px;align-items:flex-start"><div class="num" style="display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:var(--ink);color:#fff;font-size:38px;font-weight:800;flex:none">${i + 1}</div><div style="font-size:42px;font-weight:800;letter-spacing:-0.025em;line-height:1.18">${a}<br><span style="font-weight:600;color:var(--ink-2)">${b}</span></div></div>`,
        ),
      );
      r.lang = add(
        root,
        `<div class="abs chip light" style="font-size:22px">${icon("languages", 24)} English · 中文</div>`,
      );

      const home = `<div class="layer home" style="padding:60px 20px 20px">
          <div style="font-size:30px;font-weight:700;letter-spacing:-0.02em">Aliquot Guide</div>
          <div style="margin-top:8px;color:#475569;font-size:15px;line-height:1.4">Guides a puller, a labeler and an aliquoter through a batch together, with every screen in sync and every step logged.</div>
          <div class="card" style="margin-top:22px;padding:22px">
            <div style="font-size:18px;font-weight:600">Join a job</div>
            <div style="margin:4px 0 14px;font-size:14px;color:#475569">Enter the code shown on the screen of whoever created the job.</div>
            <div class="code-in mono" style="height:56px;border-radius:12px;box-shadow:inset 0 0 0 2px #0f172a;display:flex;align-items:center;justify-content:center;font-size:24px;letter-spacing:0.12em"><span class="typed"></span><span class="caret" style="width:2px;height:28px;background:#0f172a;margin-left:2px"></span></div>
            <div class="btn primary join-btn" style="margin-top:12px;width:100%">Join ${icon("arrow-right", 20)}</div>
          </div>
          <div class="card" style="margin-top:16px;padding:22px;display:flex;gap:14px;align-items:center"><div style="color:#64748b">${icon("layout-grid", 30)}</div><div><div style="font-size:17px;font-weight:600">Create a job</div><div style="font-size:13px;color:#475569">Upload an aliquot workbook to start a new job.</div></div></div>
        </div>`;
      const roleBtn = (role) => {
        const info = ROLES[role];
        return `<div class="role-btn" data-role="${role}" style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:12px;box-shadow:inset 0 0 0 1px #e2e8f0;background:#fff">${icon(info.icon, 22)}<div><div style="font-weight:600;font-size:16px">${info.name}</div><div style="font-size:12.5px;opacity:0.8">${info.line}</div></div></div>`;
      };
      const form = `<div class="layer form" style="padding:56px 14px 14px;display:flex;flex-direction:column;gap:10px">
          <div class="row" style="justify-content:space-between"><div><div style="font-size:22px;font-weight:700">Study aliquots</div><div class="mono" style="font-size:13px;color:#64748b">Job ABCD-EFGH</div></div><div class="btn secondary sm">${icon("qr-code", 14)} QR code to join</div></div>
          <div class="card" style="padding:12px 14px"><div class="lbl">Your name</div><div class="name-in" style="margin-top:6px;height:42px;border-radius:8px;box-shadow:inset 0 0 0 1px #cbd5e1;display:flex;align-items:center;padding:0 12px;font-size:18px"><span class="typed-name"></span></div></div>
          <div class="card" style="padding:12px 14px"><div class="lbl">Batch</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            <div class="batch-btn" style="border-radius:12px;padding:10px;box-shadow:inset 0 0 0 1px #e2e8f0"><div style="font-weight:600">Batch 1</div><div class="mono" style="font-size:11px;opacity:0.8">S0001–S0100</div><div style="font-size:11px;opacity:0.8">65/100 done</div></div>
            <div style="border-radius:12px;padding:10px;box-shadow:inset 0 0 0 1px #e2e8f0"><div style="font-weight:600">Batch 2</div><div class="mono" style="font-size:11px;opacity:0.8">S0101–S0200</div><div style="font-size:11px;opacity:0.8">0/100 done</div></div>
          </div></div>
          <div class="card" style="padding:12px 14px"><div class="lbl">Your role</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${["puller", "labeler", "aliquoter", "overview"].map(roleBtn).join("")}</div></div>
          <div class="btn primary start-btn" style="height:56px">Start</div>
        </div>`;
      const steps4 = [
        "Find the three labels shown on your screen.",
        "Stick them on three empty tubes, one label each.",
        "Then tell the screen, one of two ways. With the camera: tap “Start camera” and scan each tube; after the third, the screen moves on by itself. Without it: press Space when all three labels are on.",
        "Hand the three tubes to the Aliquoter, then do the next one.",
      ];
      const modal = `<div class="layer modal"><div class="shade fill" style="background:rgba(15,23,42,0.5)"></div>
          <div class="sheet" style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:18px 18px 0 0">
            <div class="row" style="justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e8f0"><div style="font-size:18px;font-weight:600">You are the Labeler</div><div class="row" style="gap:8px;color:#64748b"><span class="row" style="gap:6px;padding:4px 10px;border-radius:8px;box-shadow:inset 0 0 0 1px #cbd5e1;font-size:13px;color:#0f172a">${icon("languages", 15)} 中文</span>${icon("x", 20)}</div></div>
            <div style="padding:14px 18px"><div style="font-size:13px;color:#475569">Read this before you start.</div>
            <ol style="list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:10px">${steps4.map((s, i) => `<li class="row" style="gap:10px;align-items:flex-start;font-size:15px;line-height:1.35"><span style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#0f172a;color:#fff;font-weight:600;font-size:13px;flex:none">${i + 1}</span><span>${s}</span></li>`).join("")}</ol></div>
            <div style="padding:12px 18px 26px;border-top:1px solid #e2e8f0"><div class="btn primary go" style="width:100%;height:48px;font-size:17px"><span class="go-text">Start (3)</span></div></div>
          </div></div>`;
      r.phone = phoneFrame(root, home + form + modal);
      r.home = r.phone.querySelector(".home");
      r.form = r.phone.querySelector(".form");
      r.modal = r.phone.querySelector(".modal");
      r.sheet = r.phone.querySelector(".sheet");
      r.shade = r.phone.querySelector(".shade");
      r.typed = r.phone.querySelector(".typed");
      r.caret = r.phone.querySelector(".caret");
      r.name = r.phone.querySelector(".typed-name");
      r.batchBtn = r.phone.querySelector(".batch-btn");
      r.roleBtns = [...r.phone.querySelectorAll(".role-btn")];
      r.go = r.phone.querySelector(".go");
      r.goText = r.phone.querySelector(".go-text");
      r.joinBtn = r.phone.querySelector(".join-btn");
      r.qr = add(
        root,
        `<div class="abs panel" style="width:280px;padding:22px;text-align:center">${qrSVG(236)}<div style="margin-top:12px;font-size:20px;font-weight:700">Scan to join</div><div class="mono" style="font-size:22px;color:var(--mute);margin-top:4px">ABCD-EFGH</div></div>`,
      );
      r.tap = ripple(root);
      return r;
    },
    render(t, T, r) {
      placeHeader(r.head, t);
      const starts = [T.code, T.form, T.start, Infinity];
      r.steps.forEach((s, i) => {
        const shown = p(t, starts[i] + 0.1, 0.4);
        const done = p(t, starts[i + 1], 0.4);
        place(s, {
          x: 96,
          y: 300 + i * 190,
          ax: 0,
          ay: 0,
          o: shown * (1 - 0.65 * done),
        });
      });
      place(r.lang, { x: 200, y: 830, ax: 0, o: p(t, T.start + 1.2, 0.4) });

      const ph = p(t, 0.2, 0.8, ease.out);
      place(r.phone, { x: 1290, y: lerp(600, 560, ph), s: 0.95, o: ph });

      // Home: the code is typed in.
      const code = "ABCD-EFGH";
      const typed = Math.floor(
        clamp((t - T.typing) / 1.2) * code.length + 0.0001,
      );
      setText(r.typed, code.slice(0, typed));
      r.caret.style.opacity =
        typed < code.length && Math.sin(t * 9) > 0
          ? "1"
          : typed < code.length
            ? "0"
            : "0";
      place(r.qr, {
        x: 1690,
        y: 470,
        o: vis(t, T.code + 0.4, T.form + 0.1),
        s: lerp(0.9, 1, p(t, T.code + 0.4, 0.5, ease.back)),
      });
      const toForm = p(t, T.form - 0.3, 0.5);
      swap(r.home, r.form, toForm, 60);

      // The form fills in.
      setText(
        r.name,
        "Mei".slice(0, Math.floor(clamp((t - T.name) / 0.5) * 3 + 0.0001)),
      );
      const pickBatch = t >= T.batch;
      r.batchBtn.style.background = pickBatch ? "#0f172a" : "#fff";
      r.batchBtn.style.color = pickBatch ? "#fff" : "#0f172a";
      r.roleBtns.forEach((b) => {
        const on = b.dataset.role === "labeler" && t >= T.role;
        b.style.background = on ? "#0f172a" : "#fff";
        b.style.color = on ? "#fff" : "#0f172a";
      });

      // The instructions, with Start held off for three seconds.
      const m = p(t, T.start + 0.1, 0.5, ease.out);
      show(r.modal, m > 0 ? 1 : 0);
      r.shade.style.opacity = String(m);
      r.sheet.style.transform = `translateY(${((1 - m) * 100).toFixed(1)}%)`;
      const left = Math.ceil(3 - clamp(t - (T.start + 0.6), 0, 3));
      setText(r.goText, left > 0 ? `Start (${left})` : "Start");
      r.go.style.background = left > 0 ? "#94a3b8" : "#0f172a";
      const pr = pulse(t, T.press, 0.3);
      r.go.style.transform = `scale(${(1 - 0.04 * pr).toFixed(3)})`;
      const gr = rel(r.go);
      tap(r.tap, t, T.press, gr.cx, gr.cy);
      const tr = rel(r.joinBtn);
      if (t < T.form) tap(r.tap, t, T.typing + 1.4, tr.cx, tr.cy);
    },
  });

  /** A QR-code look-alike. */
  function qrSVG(px) {
    const n = 25;
    const m = px / n;
    let seed = hash("ABCDEFGH");
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const finder = (r, c) =>
      (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (finder(r, c)) continue;
        if (
          (r === 7 || c === 7 || r === n - 8 || c === n - 8) &&
          (r < 8 || c < 8 || (r > n - 9 && c < 8))
        )
          continue;
        if (rnd() < 0.5) d += `M${c * m} ${r * m}h${m}v${m}h${-m}z`;
      }
    const eye = (x, y) =>
      `<rect x="${x + m / 2}" y="${y + m / 2}" width="${6 * m}" height="${6 * m}" fill="none" stroke="#0f172a" stroke-width="${m}"/><rect x="${x + 2 * m}" y="${y + 2 * m}" width="${3 * m}" height="${3 * m}" fill="#0f172a"/>`;
    return `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><path d="${d}" fill="#0f172a" shape-rendering="crispEdges"/>${eye(0, 0)}${eye((n - 7) * m, 0)}${eye(0, (n - 7) * m)}</svg>`;
  }

  // ----------------------------------------------- the three role scenes

  /** Builds the parts every role scene shares: its title and step captions. */
  function roleParts(root, role, steps) {
    const info = ROLES[role];
    const r = {};
    r.title = add(
      root,
      `<div class="abs row" style="gap:26px"><div class="role-square" style="width:96px;height:96px">${icon(info.icon, 52)}</div><div><div style="font-size:26px;font-weight:600;color:var(--mute)">If you're the</div><div style="font-size:64px;font-weight:800;letter-spacing:-0.035em;line-height:1">${info.name}</div></div></div>`,
    );
    r.line = add(
      root,
      `<div class="abs" style="font-size:34px;font-weight:500;color:var(--mute)">${info.line}</div>`,
    );
    r.captions = {};
    for (const [beat, step, text] of steps) {
      r.captions[beat] = add(
        root,
        `<div class="caption abs" style="left:0;top:0">${step === "!" ? `<div class="num" style="background:#dc2626">${icon("triangle-alert", 44, 2.4)}</div>` : `<div class="num">${step}</div>`}<div><div class="of">${step === "!" ? "Watch for this" : `Step ${step} of 4`}</div><div class="text">${text}</div></div></div>`,
      );
    }
    return r;
  }

  /** Moves the title from the center (while the role is introduced) to the top left. */
  function renderRoleParts(t, T, r, beats) {
    size(r.title);
    const k = p(t, T.introEnd - 0.7, 0.9);
    const s = lerp(1.7, 1, k);
    const cx = 960 - (r.title._w * s) / 2;
    const cy = 440 - (r.title._h * s) / 2;
    place(r.title, {
      x: lerp(cx, 96, k),
      y: lerp(cy, 52, k),
      s,
      ax: 0,
      ay: 0,
      o: p(t, 0.1, 0.5),
    });
    place(r.line, {
      x: 960,
      y: lerp(640, 620, p(t, 0.5, 0.6)),
      o: Math.min(p(t, 0.5, 0.5), 1 - p(t, T.introEnd - 0.9, 0.4)),
    });
    for (const [beat] of beats) {
      const a = T[`@${beat}`];
      const b = T[`/${beat}`];
      const g = p(t, a, 0.45, ease.out);
      place(r.captions[beat], {
        x: 96,
        y: 900 + (1 - g) * 24 - p(t, b - 0.3, 0.3, ease.in) * 12,
        ax: 0,
        ay: 0,
        o: vis(t, a, b, 0.3),
      });
    }
  }

  function roleTimes({ at, end }, beats) {
    const T = { introEnd: end("intro") };
    for (const b of beats) {
      T[`@${b.id}`] = at(b.id);
      T[`/${b.id}`] = end(b.id);
    }
    return T;
  }

  // 6. The puller.
  const PULLER_STEPS = [
    ["find", 1, "Find the tube your screen shows."],
    ["hand", 2, "Hand it to the Aliquoter."],
    ["space", 3, "Press Space."],
    ["return", 4, "Put returned tubes back. Press Enter."],
  ];
  scene({
    id: "puller",
    beats: [
      { id: "intro", say: "If you're the Puller:", min: 3 },
      {
        id: "find",
        say: "Your screen shows which tube to get: the freezer box, the position in the box, and the original ID on the tube.",
        min: 6,
      },
      {
        id: "hand",
        say: "Find it in the freezer, and hand it to the Aliquoter.",
        min: 4.6,
      },
      {
        id: "space",
        say: "Then press Space, or tap Pulled. Your screen moves on to the next tube.",
        min: 4.6,
      },
      {
        id: "return",
        say: "When the Aliquoter hands a tube back, put it back in its place, and press Enter.",
        min: 6,
      },
    ],
    plan(ctx) {
      const T = roleTimes(ctx, this.beats);
      const { cue, at } = ctx;
      T.hlBox = cue("find", "freezer box") - 0.1;
      T.hlPos = cue("find", "position") - 0.1;
      T.hlId = cue("find", "original ID") - 0.1;
      T.lift = at("hand") + 0.5;
      T.give = cue("hand", "hand it") + 0.1;
      T.press = cue("space", "Space") + 0.25;
      T.back = at("return") + 0.4;
      T.putBack = cue("return", "put it back") - 0.1;
      T.enter = cue("return", "Enter") + 0.25;
      return T;
    },
    sounds(T) {
      return [
        { t: T.press, kind: "key" },
        { t: T.enter, kind: "key" },
      ];
    },
    build(root) {
      const r = roleParts(root, "puller", PULLER_STEPS);
      const content = (s) => `
        <div style="display:grid;grid-template-columns:1fr 360px;gap:24px">
          <div>
            <div style="font-size:18px;color:#64748b">${s.location}</div>
            <div class="hl-box" style="display:inline-block;font-size:48px;font-weight:700;letter-spacing:-0.02em;padding:0 6px;margin-left:-6px">${s.box}</div>
            <div class="row" style="gap:36px;margin-top:18px;align-items:flex-end">
              <div class="hl-pos" style="padding:2px 6px;margin-left:-6px"><div style="font-size:14px;color:#64748b">Position</div><div class="mono" style="font-size:60px;font-weight:700;line-height:1.1">${s.cell}</div><div class="mono" style="font-size:14px;color:#64748b">${s.position}</div></div>
              <div class="hl-id" style="padding:2px 6px"><div style="font-size:14px;color:#64748b">Original ID</div><div class="mono" style="font-size:60px;font-weight:700;line-height:1.1">${s.originalId}</div><div style="font-size:14px">&nbsp;</div></div>
            </div>
            <div style="margin-top:18px;color:#475569;font-size:16px">Becomes <b class="mono">${s.newId}</b> · slot <b class="mono">${s.slot}</b></div>
          </div>
          <div class="hl-grid" style="padding:4px">${gridHTML(340, s.cell)}</div>
        </div>`;
      const app = `${stationHeader("puller", "Ana")}${stripHTML()}
        <div style="display:grid;grid-template-columns:1fr 380px;gap:16px;padding:16px">
          <div class="card" style="height:640px;padding:24px">
            <div class="lbl">Pull next</div>
            <div style="position:relative;height:520px;margin-top:12px">
              <div class="fill pa">${content(S66)}</div>
              <div class="fill pb">${content(S67)}</div>
              <div class="btns row" style="position:absolute;left:0;top:380px;gap:12px">
                <div class="btn primary pulled-btn">Pulled <span class="kbd">Space</span>${icon("arrow-right", 20)}</div>
                <div class="btn secondary">${icon("skip-forward", 20)} Can't find it <span class="kbd">S</span></div>
              </div>
              <div class="undo-pull row" style="position:absolute;left:0;top:462px;gap:8px;font-size:14px;color:#475569">${icon("undo-2", 16)} Undo pull of S0066 (41540) <span class="kbd">←</span></div>
            </div>
          </div>
          <div class="card" style="height:640px">
            <div class="row" style="justify-content:space-between"><div class="lbl">Return to freezer (<span class="ret-n">0</span>)</div><div class="undo-ret" style="font-size:12px;color:#64748b">Undo return of S0066</div></div>
            <div class="ret-empty" style="margin-top:12px;font-size:14px;color:#64748b">Aliquoted source tubes show up here.</div>
            <div class="ret-item row" style="margin-top:12px;gap:12px;padding:12px;border-radius:12px;background:#f8fafc;box-shadow:inset 0 0 0 1px #e2e8f0">
              <div style="flex:1"><div style="font-weight:600">case_box 1 <span class="mono">1-C-10</span></div><div class="mono" style="font-size:14px;color:#475569">41540 · S0066</div></div>
              <div class="btn primary sm ret-btn">Returned <span class="kbd">⏎</span></div>
            </div>
          </div>
        </div>`;
      r.win = windowFrame(root, app, 1280, 780);
      r.pa = r.win.querySelector(".pa");
      r.pb = r.win.querySelector(".pb");
      r.hlBox = r.pa.querySelector(".hl-box");
      r.hlPos = r.pa.querySelector(".hl-pos");
      r.hlId = r.pa.querySelector(".hl-id");
      r.pulledBtn = r.win.querySelector(".pulled-btn");
      r.undoPull = r.win.querySelector(".undo-pull");
      r.retN = r.win.querySelector(".ret-n");
      r.retEmpty = r.win.querySelector(".ret-empty");
      r.retItem = r.win.querySelector(".ret-item");
      r.retBtn = r.win.querySelector(".ret-btn");
      r.undoRet = r.win.querySelector(".undo-ret");
      r.st = {
        pull: r.win.querySelector(".st-pull"),
        ret: r.win.querySelector(".st-return"),
        done: r.win.querySelector(".st-done"),
      };
      r.freezer = physBox(root, { pitch: 44, kind: "source" });
      r.freezerTitle = add(
        root,
        `<div class="abs row" style="gap:10px;font-size:26px;font-weight:700;color:var(--ink-2)">${icon("snowflake", 28)} case_box 1</div>`,
      );
      r.tube = tube(root, { label: S66.originalId, level: 0.82, code: false });
      r.aliq = roleChip(root, "aliquoter");
      r.space = keycap(root, "Space");
      r.space.style.width = "420px";
      r.enter = keycap(root, "Enter", "corner-down-left");
      r.tap = ripple(root);
      r.callouts = ["Freezer box", "Position", "ID on the tube"].map((text) =>
        add(root, `<div class="abs callout">${text}</div>`),
      );
      return r;
    },
    render(t, T, r) {
      renderRoleParts(t, T, r, PULLER_STEPS);
      const sx = 0.84;
      const winIn = p(t, T.introEnd - 0.4, 0.8, ease.out);
      place(r.win, {
        x: 72,
        y: lerp(220, 168, winIn),
        s: sx,
        ax: 0,
        ay: 0,
        o: winIn,
      });

      // Step 1: what the screen says.
      const hl = (start) => vis(t, start, T["/find"] + 1.2, 0.3);
      highlight(r.hlBox, hl(T.hlBox));
      highlight(r.hlPos, hl(T.hlPos));
      highlight(r.hlId, hl(T.hlId));
      const rects = [r.hlBox, r.hlPos, r.hlId].map(rel);
      [T.hlBox, T.hlPos, T.hlId].forEach((start, i) => {
        const g = p(t, start, 0.45, ease.back);
        const rc = rects[i];
        const o = Math.min(p(t, start, 0.3), 1 - p(t, T["/find"] + 0.6, 0.3));
        if (i === 0)
          place(r.callouts[i], {
            x: rc.x + rc.w + 24,
            y: rc.cy,
            ax: 0,
            s: lerp(0.7, 1, g),
            o,
          });
        else
          place(r.callouts[i], {
            x: rc.cx,
            y: rc.y + rc.h + 22,
            ay: 0,
            s: lerp(0.7, 1, g),
            o,
          });
      });

      // The freezer box beside the screen, with the same position lit.
      const fx = 1530;
      const fy = 470;
      const fIn = p(t, T.hlPos, 0.7, ease.out);
      const fAway = vis(t, T["@space"], T["@return"] + 0.3);
      const fOut = p(t, T["/return"] - 0.3, 0.3);
      const fo = fIn * (1 - fOut) * (1 - fAway);
      place(r.freezer, {
        x: lerp(fx + 120, fx, fIn) + 60 * fAway,
        y: fy,
        o: fo,
      });
      place(r.freezerTitle, {
        x: lerp(fx + 120, fx, fIn) + 60 * fAway - 260,
        y: fy - 300,
        ax: 0,
        o: fo,
      });
      const c10 = cellOnStage(r.freezer, "C10", fx, fy);
      r.freezer.ring(
        "C10",
        Math.max(
          vis(t, T.hlPos + 0.2, T.lift + 0.6),
          vis(t, T.putBack, T.putBack + 1.8),
        ),
        1 + 0.12 * Math.sin(t * 7),
      );
      const gone = t > T.lift + 0.1 && t < T.putBack + 1.1;
      r.freezer.cap("C10", gone ? 0 : 1);

      // Step 2: lift the tube and hand it over.
      const aliqAt = { x: 1530, y: 820 };
      const out = kf(t, [
        [T.lift, [c10.x, c10.y, 0.15, 0]],
        [T.lift + 0.8, [c10.x, c10.y - 230, 1, 1], ease.out],
        [T.give, [c10.x, c10.y - 230, 1, 1]],
        [T.give + 0.9, [aliqAt.x, aliqAt.y - 120, 0.75, 1]],
        [T.give + 1.3, [aliqAt.x, aliqAt.y - 90, 0.6, 0]],
      ]);
      const back = kf(t, [
        [T.back, [aliqAt.x, aliqAt.y - 90, 0.6, 0]],
        [T.back + 0.4, [aliqAt.x, aliqAt.y - 120, 0.75, 1]],
        [T.putBack, [aliqAt.x, aliqAt.y - 120, 0.75, 1]],
        [T.putBack + 0.7, [c10.x, c10.y - 150, 0.75, 1]],
        [T.putBack + 1.2, [c10.x, c10.y, 0.15, 0]],
      ]);
      const tb = t < T.back ? out : back;
      place(r.tube, { x: tb[0], y: tb[1], s: tb[2], o: tb[3] });
      place(r.aliq, {
        x: aliqAt.x,
        y: aliqAt.y,
        o: Math.max(
          vis(t, T.give - 0.4, T["/hand"]),
          vis(t, T.back - 0.3, T.putBack + 0.2),
        ),
      });

      // Step 3: Space.
      const kIn = vis(t, T["@space"] + 0.1, T["/space"]);
      const press = pulse(t, T.press, 0.28);
      place(r.space, {
        x: 1530,
        y: 470 + press * 8,
        o: kIn,
        s: lerp(0.9, 1, p(t, T["@space"] + 0.1, 0.5, ease.back)),
      });
      r.space.press(press);
      r.pulledBtn.style.background = press > 0.05 ? "#334155" : "#0f172a";
      const br = rel(r.pulledBtn);
      tap(r.tap, t, T.press, br.cx, br.cy);
      swap(r.pa, r.pb, p(t, T.press + 0.15, 0.55));
      show(r.undoPull, p(t, T.press + 0.4, 0.3) * (1 - p(t, T.back, 0.3)));
      setText(r.st.pull, t > T.press + 0.15 ? "S0067" : "S0066");

      // Step 4: the returned tube goes back, then Enter.
      const listed = p(t, T.back, 0.4, ease.out);
      const cleared = p(t, T.enter + 0.15, 0.35);
      show(r.retItem, listed * (1 - cleared));
      r.retItem.style.transform = `translateY(${((1 - listed) * -12).toFixed(1)}px)`;
      show(r.retEmpty, t < T.back ? 1 : cleared);
      highlight(r.retItem, vis(t, T.back + 0.3, T.enter + 0.2) * 0.9);
      show(r.undoRet, p(t, T.enter + 0.3, 0.3));
      setText(r.retN, t > T.back && t < T.enter + 0.15 ? "1" : "0");
      setText(r.st.ret, t > T.back && t < T.enter + 0.15 ? "1" : "0");
      setText(r.st.done, t > T.back ? "66/100" : "65/100");
      const eIn = vis(t, T.enter - 0.9, T["/return"]);
      const ePress = pulse(t, T.enter, 0.28);
      place(r.enter, {
        x: 1530,
        y: 830 + ePress * 8,
        o: eIn,
        s: lerp(0.9, 1, p(t, T.enter - 0.9, 0.5, ease.back)),
      });
      r.enter.press(ePress);
      r.retBtn.style.background = ePress > 0.05 ? "#334155" : "#0f172a";
    },
  });

  // 7. The labeler.
  const LABELER_STEPS = [
    ["find", 1, "Find the three labels on your screen."],
    ["stick", 2, "Stick one on each empty tube."],
    ["confirm", 3, "Press Space, or scan each tube."],
    ["hand", 4, "Hand them to the Aliquoter."],
  ];
  scene({
    id: "labeler",
    beats: [
      { id: "intro", say: "If you're the Labeler:", min: 3 },
      {
        id: "find",
        say: "Your screen shows the next sample and its three labels. Find those three printed labels.",
        min: 5.5,
      },
      {
        id: "stick",
        say: "Stick them on three empty tubes, one label on each.",
        min: 4.8,
      },
      {
        id: "confirm",
        say: "Then tell the screen: press Space, or scan each tube with the camera. After the third scan, it moves on by itself.",
        min: 8.2,
      },
      {
        id: "hand",
        say: "Hand the three tubes to the Aliquoter, and start on the next one.",
        min: 4.6,
      },
    ],
    plan(ctx) {
      const T = roleTimes(ctx, this.beats);
      const { at, cue, end } = ctx;
      T.hlLabels = cue("find", "three labels") - 0.2;
      T.sheet = cue("find", "Find those") - 0.2;
      T.stick = [0, 1, 2].map((k) => at("stick") + 0.6 + k * 0.7);
      T.cam = cue("confirm", "scan each") - 0.2;
      T.scan = [0, 1, 2].map((k) => T.cam + 0.8 + k * 1.15);
      T.advance = Math.max(T.scan[2] + 0.9, cue("confirm", "moves on"));
      T.give = at("hand") + 0.4;
      T.endHand = end("hand");
      return T;
    },
    sounds(T) {
      return [
        { t: T.cam, kind: "tap" },
        { t: T.scan[0] + 0.35, kind: "ok" },
        { t: T.scan[1] + 0.35, kind: "ok" },
        { t: T.scan[2] + 0.35, kind: "done" },
      ];
    },
    build(root) {
      const r = roleParts(root, "labeler", LABELER_STEPS);
      const content = (s) => `
        <div class="mono" style="font-size:96px;font-weight:700;letter-spacing:-0.03em;line-height:1">${s.newId}</div>
        <div style="margin-top:8px;color:#475569;font-size:17px">Source tube <b class="mono">${s.originalId}</b> · slot <b class="mono">${s.slot}</b></div>
        <div class="lab-cards" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px">
          ${[1, 2, 3].map((k) => `<div class="tube-chip lab-card set-${k} pending" style="padding:16px"><div class="row mono" style="justify-content:space-between;font-size:30px;font-weight:700">${s.label(k)}<span class="chk" style="opacity:0">${icon("check", 28, 3)}</span></div><div style="font-size:14px;opacity:0.9">${SETS[k - 1]} box 1<span class="scn" style="opacity:0"> · scanned</span></div></div>`).join("")}
        </div>
        <div class="row" style="gap:8px;margin-top:16px;height:28px"><span class="badge green n-scanned" style="font-size:16px;opacity:0"><span class="nn">1</span> of 3 scanned</span></div>`;
      const next = (from) =>
        [0, 1, 2, 3, 4]
          .map((i) => {
            const x = sample(from + i);
            return `<div class="row" style="justify-content:space-between;margin-top:8px"><span class="mono" style="font-size:20px;font-weight:600">${x.newId}</span><span style="font-size:14px;color:#64748b">${i === 0 ? "pulled" : ""}</span></div>`;
          })
          .join("");
      const app = `${stationHeader("labeler", "Mei")}${stripHTML()}
        <div style="display:grid;grid-template-columns:1fr 380px;gap:16px;padding:16px">
          <div class="card" style="height:640px;padding:24px">
            <div class="lbl">Label next</div>
            <div style="position:relative;height:300px;margin-top:16px">
              <div class="fill la">${content(S66)}</div>
              <div class="fill lb">${content(S67)}</div>
            </div>
            <div class="row" style="gap:12px;margin-top:8px">
              <div class="btn primary labeled-btn">Labeled <span class="kbd">Space</span>${icon("arrow-right", 20)}</div>
              <div class="btn secondary">${icon("skip-forward", 20)} Can't find labels <span class="kbd">S</span></div>
            </div>
            <div style="margin-top:14px;font-size:14px;color:#64748b">Stick the labels on, then press Space — or scan each tube instead; the last scan moves on by itself.</div>
          </div>
          <div class="col" style="gap:12px">
            <div class="cam" style="position:relative;height:200px;border-radius:16px;overflow:hidden;background:radial-gradient(120% 90% at 50% 40%, #1e293b, #020617)">
              <div class="cam-idle fill col" style="align-items:center;justify-content:center;gap:12px;color:#fff;text-align:center;padding:16px"><div style="font-size:13px;color:#cbd5e1">Optional: scan each labeled tube to check it.</div><div class="btn primary start-cam" style="height:44px;font-size:15px;background:#0f172a;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.25)">${icon("camera", 18)} Start camera</div></div>
              <div class="cam-on fill" style="opacity:0">
                <div class="cam-label" style="position:absolute;left:50%;top:50%;width:150px;height:93px;margin:-46px 0 0 -75px"></div>
                <div class="reticle" style="position:absolute;left:50%;top:15%;height:70%;aspect-ratio:1;transform:translateX(-50%);border:2px dashed rgba(255,255,255,0.7);border-radius:12px"></div>
                <div style="position:absolute;left:8px;top:8px;display:flex;gap:4px;align-items:center;padding:3px 8px;border-radius:99px;background:rgba(0,0,0,0.6);color:#fff;font-size:11px">${icon("scan-line", 13)} Scanning</div>
              </div>
            </div>
            <div class="res" style="position:relative;height:52px">
              ${[1, 2, 3].map((k) => `<div class="res-${k} row set-${k} solid" style="position:absolute;inset:0;gap:10px;border-radius:12px;padding:0 12px;opacity:0">${icon("check", 20, 3)}<b class="mono" style="font-size:17px">${S66.label(k)}</b><span style="font-size:14px">label checked</span>${k === 3 ? '<span class="badge green" style="margin-left:auto;font-size:13px">S0066 labeled</span>' : '<span style="font-size:12px;opacity:0.8">saved</span>'}</div>`).join("")}
            </div>
            <div class="card" style="flex:1">
              <div class="lbl">Find these labels next</div>
              <div style="position:relative;height:220px">
                <div class="fill na">${next(67)}</div>
                <div class="fill nb">${next(68)}</div>
              </div>
            </div>
          </div>
        </div>`;
      r.win = windowFrame(root, app, 1280, 780);
      r.la = r.win.querySelector(".la");
      r.lb = r.win.querySelector(".lb");
      r.na = r.win.querySelector(".na");
      r.nb = r.win.querySelector(".nb");
      r.cards = [...r.la.querySelectorAll(".lab-card")];
      r.cardsWrap = r.la.querySelector(".lab-cards");
      r.nScanned = r.la.querySelector(".n-scanned");
      r.nn = r.la.querySelector(".nn");
      r.cam = r.win.querySelector(".cam");
      r.camIdle = r.win.querySelector(".cam-idle");
      r.camOn = r.win.querySelector(".cam-on");
      r.camLabel = r.win.querySelector(".cam-label");
      r.reticle = r.win.querySelector(".reticle");
      r.startCam = r.win.querySelector(".start-cam");
      r.camLabels = [1, 2, 3].map((k) => labelSVG(S66.label(k)));
      r.res = [1, 2, 3].map((k) => r.win.querySelector(`.res-${k}`));
      r.labeledBtn = r.win.querySelector(".labeled-btn");
      r.st = { label: r.win.querySelector(".st-label") };

      // Props: the sheet of printed labels and three empty tubes.
      let sheet = "";
      const sheetIds = [65, 66, 67, 68];
      sheetIds.forEach((n, row) => {
        for (let k = 1; k <= 3; k++) {
          const id = sample(n).label(k);
          sheet += `<div class="sl ${n === 66 ? "mine" : ""}" style="position:absolute;left:${16 + (k - 1) * 150}px;top:${16 + row * 96}px;width:140px;height:86px">${labelSVG(id, 140)}</div>`;
        }
      });
      r.sheet = add(
        root,
        `<div class="abs" style="width:482px;height:402px;background:#f8fafc;border-radius:14px;box-shadow:0 0 0 1px #e2e8f0,0 30px 60px -30px rgba(15,23,42,0.45)">${sheet}</div>`,
      );
      r.sheet._w = 482;
      r.sheet._h = 402;
      r.mine = [...r.sheet.querySelectorAll(".sl.mine")];
      r.flying = [1, 2, 3].map((k) =>
        add(
          root,
          `<div class="abs" style="width:140px;height:86px">${labelSVG(S66.label(k), 140)}</div>`,
        ),
      );
      r.flying.forEach((f) => {
        f._w = 140;
        f._h = 86;
      });
      r.tubes = [1, 2, 3].map((k) =>
        tube(root, { label: S66.label(k), cap: "#475569" }),
      );
      r.tubeLabels = r.tubes.map((tb) => tb.querySelector(".lbl-g"));
      r.space = keycap(root, "Space");
      r.space.style.width = "300px";
      r.or = add(
        root,
        `<div class="abs" style="font-size:30px;font-weight:800;color:var(--mute)">or</div>`,
      );
      r.camChip = add(
        root,
        `<div class="abs chip dark" style="font-size:28px;padding:18px 26px">${icon("camera", 32)} Scan</div>`,
      );
      r.aliq = roleChip(root, "aliquoter");
      r.tap = ripple(root);
      return r;
    },
    render(t, T, r) {
      renderRoleParts(t, T, r, LABELER_STEPS);
      const winIn = p(t, T.introEnd - 0.4, 0.8, ease.out);
      place(r.win, {
        x: 72,
        y: lerp(220, 168, winIn),
        s: 0.84,
        ax: 0,
        ay: 0,
        o: winIn,
      });

      // Step 1: the three labels on screen, and on the sheet.
      highlight(r.cardsWrap, vis(t, T.hlLabels, T["/find"] + 0.3));
      const sheetIn = p(t, T.sheet, 0.7, ease.out);
      const sheetOut = p(t, T["@confirm"] - 0.2, 0.5);
      place(r.sheet, {
        x: lerp(1630, 1530, sheetIn),
        y: 350,
        s: 0.92,
        o: sheetIn * (1 - sheetOut),
      });
      r.mine.forEach((m) => {
        m.style.outline = `5px solid rgba(245,158,11,${vis(t, T.sheet + 0.6, T["/find"] + 0.4).toFixed(3)})`;
        m.style.outlineOffset = "3px";
        m.style.borderRadius = "10px";
      });

      // Step 2: each label flies onto an empty tube.
      const tubeX = [1330, 1530, 1730];
      const tubeY = 700;
      const handOut = p(t, T.give, 1.0);
      r.tubes.forEach((tb, k) => {
        const appear = p(t, T["@stick"] + 0.1 + k * 0.1, 0.5, ease.back);
        const sm = rel(r.mine[k]);
        const stuck = p(t, T.stick[k] + 0.55, 0.15);
        const fly = p(t, T.stick[k], 0.6);
        place(r.flying[k], {
          x: lerp(sm.cx, tubeX[k], fly),
          y: lerp(sm.cy, tubeY - 22, fly),
          s: lerp(0.92, 0.42, fly),
          r: Math.sin(Math.PI * fly) * -8,
          o: t >= T.stick[k] && stuck < 1 ? 1 : 0,
        });
        r.tubeLabels[k].style.opacity = String(stuck);
        // In step 3 each tube is held up to the camera in turn.
        const cam = rel(r.cam);
        const scanAt = T.scan[k];
        const toCam = p(t, scanAt - 0.35, 0.4);
        const fromCam = p(t, scanAt + 0.5, 0.4);
        const hold = toCam - fromCam;
        const handX = lerp(tubeX[k], 1530 + (k - 1) * 46, handOut);
        const handY = lerp(tubeY, 770, handOut);
        place(tb, {
          x: lerp(handX, cam.x + cam.w + 50, hold),
          y: lerp(handY, cam.cy + 30, hold) - Math.sin(Math.PI * hold) * 10,
          s: lerp(1, 0.75, hold) * lerp(1, 0.45, handOut),
          r: -12 * hold,
          o: Math.min(appear, 1 - p(t, T.give + 1.0, 0.3)),
        });
      });

      // Step 3: Space or the camera; here, the camera.
      const optIn = p(t, T["@confirm"] + 0.1, 0.5, ease.back);
      const optOut = p(t, T.cam + 0.3, 0.4);
      place(r.space, {
        x: 1340,
        y: 300,
        s: lerp(0.85, 0.9, optIn),
        o:
          Math.min(p(t, T["@confirm"] + 0.1, 0.3), 1 - 0.65 * optOut) *
          (1 - p(t, T["/confirm"] - 0.3, 0.3)),
      });
      r.space.press(0);
      place(r.or, {
        x: 1570,
        y: 300,
        o: p(t, T["@confirm"] + 0.3, 0.3) * (1 - optOut),
      });
      place(r.camChip, {
        x: 1740,
        y: 300,
        s: lerp(0.85, 1, p(t, T["@confirm"] + 0.5, 0.5, ease.back)),
        o:
          p(t, T["@confirm"] + 0.5, 0.3) * (1 - p(t, T["/confirm"] - 0.3, 0.3)),
      });
      const camOn = p(t, T.cam + 0.15, 0.3);
      show(r.camIdle, 1 - camOn);
      show(r.camOn, camOn);
      const sc = rel(r.startCam);
      tap(r.tap, t, T.cam, sc.cx, sc.cy);
      let inView = -1;
      T.scan.forEach((s, k) => {
        if (t >= s - 0.1 && t < s + 0.6) inView = k;
      });
      if (r.shown !== inView) {
        r.camLabel.innerHTML = inView >= 0 ? r.camLabels[inView] : "";
        r.shown = inView;
      }
      const decoded = T.scan.some((s) => t >= s + 0.3 && t < s + 0.6);
      r.reticle.style.borderColor = decoded
        ? "#34d399"
        : "rgba(255,255,255,0.7)";
      r.reticle.style.borderStyle = decoded ? "solid" : "dashed";
      let scanned = 0;
      r.cards.forEach((c, k) => {
        const done = t >= T.scan[k] + 0.35;
        if (done) scanned++;
        c.classList.toggle("solid", done);
        c.classList.toggle("pending", !done);
        c.querySelector(".chk").style.opacity = done ? "1" : "0";
        c.querySelector(".scn").style.opacity = done ? "1" : "0";
      });
      show(r.nScanned, scanned > 0 ? 1 : 0);
      setText(r.nn, String(scanned));
      r.res.forEach((el, k) => {
        const on =
          t >= T.scan[k] + 0.35 && (k === 2 || t < T.scan[k + 1] + 0.35);
        show(el, on ? 1 : 0);
      });
      const adv = p(t, T.advance, 0.6);
      swap(r.la, r.lb, adv);
      swap(r.na, r.nb, adv, 20);
      setText(r.st.label, t > T.advance ? "S0067" : "S0066");

      // Step 4: hand the tubes over.
      place(r.aliq, { x: 1530, y: 860, o: vis(t, T["@hand"], T.endHand) });
    },
  });

  // 8. The aliquoter.
  const ALIQUOTER_STEPS = [
    ["check", 1, "Check the ID on the tube."],
    ["fill", 2, "Aliquot into the three tubes."],
    ["scan", 3, "Scan a tube. Place it where shown."],
    ["rest", 3, "Scan and place the other two."],
    ["next", 4, "Hand the original tube back."],
    ["wrong", "!", "Red screen? Don't place that tube."],
  ];
  scene({
    id: "aliquoter",
    beats: [
      { id: "intro", say: "If you're the Aliquoter:", min: 3 },
      {
        id: "check",
        say: "Take the original tube from the Puller, and check that its ID matches the big number on your screen.",
        min: 5.5,
      },
      {
        id: "fill",
        say: "Aliquot it into the three labeled tubes.",
        min: 5.2,
      },
      {
        id: "scan",
        say: "Now hold each tube up to the camera. The screen shows exactly where it goes: the box, and the slot.",
        min: 6.8,
      },
      {
        id: "rest",
        say: "Do the same for the other two tubes.",
        min: 5.4,
      },
      {
        id: "next",
        say: "After the third scan, your screen moves on to the next tube. Hand the original tube back to the Puller.",
        min: 5.5,
      },
      {
        id: "wrong",
        say: "If the screen turns red, that's the wrong tube. Don't place it.",
        min: 5,
      },
    ],
    plan(ctx) {
      const T = roleTimes(ctx, this.beats);
      const { at, cue } = ctx;
      T.match = cue("check", "matches") + 0.1;
      T.pip = at("fill") + 0.5;
      T.cam = at("scan") + 0.3;
      T.scan = [
        cue("scan", "camera") + 0.1,
        at("rest") + 0.4,
        at("rest") + 2.4,
      ];
      T.advance = at("next") + 0.7;
      T.giveBack = cue("next", "Hand the") + 0.1;
      T.wrong = at("wrong") + 0.5;
      return T;
    },
    sounds(T) {
      return [
        { t: T.cam, kind: "tap" },
        { t: T.scan[0] + 0.4, kind: "ok" },
        { t: T.scan[1] + 0.4, kind: "ok" },
        { t: T.scan[2] + 0.4, kind: "done" },
        { t: T.wrong + 0.4, kind: "error" },
      ];
    },
    build(root) {
      const r = roleParts(root, "aliquoter", ALIQUOTER_STEPS);
      const current = (s) => `
        <div class="lbl">Check the source tube</div>
        <div class="mono big-id" style="display:inline-block;font-size:60px;font-weight:700;letter-spacing:-0.03em;line-height:1.1;padding:0 6px;margin-left:-6px">${s.originalId}</div>
        <div style="color:#475569;font-size:15px">New ID <b class="mono">${s.newId}</b> · slot <b class="mono">${s.slot}</b></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
          ${[1, 2, 3].map((k) => `<div class="tube-chip set-${k} pending ali-chip" style="padding:10px"><div class="row mono" style="justify-content:space-between;font-size:17px;font-weight:700">-${k}<span class="chk" style="opacity:0">${icon("check", 18, 3)}</span></div><div style="font-size:13px">${SETS[k - 1]}</div><div style="font-size:11px;opacity:0.8">box 1 · ${s.slot}</div></div>`).join("")}
        </div>
        <div class="row" style="gap:8px;margin-top:12px"><div class="btn secondary md">Finish sample…</div><div class="btn md" style="color:#334155">${icon("message-square-plus", 16)} Note</div></div>`;
      const result = (
        k,
      ) => `<div class="res res-${k} set-${k} solid" style="position:absolute;inset:0;border-radius:16px;padding:16px;opacity:0">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div><div style="font-size:12px;font-weight:600;text-transform:uppercase;opacity:0.9">Place in</div><div style="font-size:32px;font-weight:900;text-transform:uppercase;line-height:1.05">${SETS[k - 1]}</div><div style="font-size:20px;font-weight:700">Box 1</div><div class="mono" style="font-size:56px;font-weight:800;line-height:1">G6</div></div>
            <div style="width:126px;border-radius:8px;background:#fff;padding:5px">${gridHTML(116, "G6", { color: SET_COLORS[k - 1], labels: false })}</div>
          </div>
          <div class="row" style="gap:8px;margin-top:8px;font-size:13px"><b class="mono">${S66.label(k)}</b><span class="row" style="gap:4px">${icon("check", 14)} saved</span>${k === 3 ? '<span class="badge green" style="margin-left:auto;font-size:12px">S0066 complete</span>' : ""}</div>
        </div>`;
      const app = `${stationHeader("aliquoter", "Jun", { phone: true })}
        <div style="padding:10px;display:flex;flex-direction:column;gap:10px">
          <div class="cam" style="position:relative;height:250px;border-radius:16px;overflow:hidden;background:radial-gradient(120% 90% at 50% 40%, #1e293b, #020617)">
            <div class="cam-idle fill col" style="align-items:center;justify-content:center;gap:12px;color:#fff;text-align:center;padding:16px"><div style="font-size:13px;color:#cbd5e1">Hold each new tube's label in the frame. The camera stays on.</div><div class="btn primary start-cam" style="height:44px;font-size:15px;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.25)">${icon("camera", 18)} Start camera</div></div>
            <div class="cam-on fill" style="opacity:0">
              <div class="cam-label" style="position:absolute;left:50%;top:50%;width:180px;height:112px;margin:-56px 0 0 -90px"></div>
              <div class="reticle" style="position:absolute;left:50%;top:15%;height:70%;aspect-ratio:1;transform:translateX(-50%);border:2px dashed rgba(255,255,255,0.7);border-radius:12px"></div>
              <div style="position:absolute;left:8px;top:8px;display:flex;gap:4px;align-items:center;padding:3px 8px;border-radius:99px;background:rgba(0,0,0,0.6);color:#fff;font-size:11px">${icon("scan-line", 13)} Scanning</div>
            </div>
          </div>
          <div style="position:relative;height:196px">
            <div class="res-empty fill" style="border-radius:16px;border:2px dashed #cbd5e1;display:grid;place-items:center;color:#64748b;font-size:15px">Scan a tube to see where it goes.</div>
            ${[1, 2, 3].map(result).join("")}
            <div class="res res-bad" style="position:absolute;inset:0;border-radius:16px;padding:16px;background:#dc2626;color:#fff;opacity:0"><div class="row" style="gap:8px;font-size:21px;font-weight:800">${icon("x", 26, 3)} Wrong tube — do not place it</div><div style="margin-top:8px;font-size:16px;line-height:1.35"><span class="mono">S0068-1</span> is not for the current tube <span class="mono">S0067</span> (<span class="mono">41541</span>).</div></div>
          </div>
          <div class="card" style="position:relative;height:262px;padding:14px">
            <div class="fill ca" style="padding:14px">${current(S66)}</div>
            <div class="fill cb" style="padding:14px">${current(S67)}</div>
          </div>
        </div>`;
      r.phone = phoneFrame(root, app);
      r.ca = r.phone.querySelector(".ca");
      r.cb = r.phone.querySelector(".cb");
      r.bigId = r.ca.querySelector(".big-id");
      r.chips = [...r.ca.querySelectorAll(".ali-chip")];
      r.cam = r.phone.querySelector(".cam");
      r.camIdle = r.phone.querySelector(".cam-idle");
      r.camOn = r.phone.querySelector(".cam-on");
      r.camLabel = r.phone.querySelector(".cam-label");
      r.reticle = r.phone.querySelector(".reticle");
      r.startCam = r.phone.querySelector(".start-cam");
      r.resEmpty = r.phone.querySelector(".res-empty");
      r.res = [1, 2, 3].map((k) => r.phone.querySelector(`.res-${k}`));
      r.bad = r.phone.querySelector(".res-bad");
      r.camLabels = [...[1, 2, 3].map((k) => S66.label(k)), "S0068-1"].map(
        (l) => labelSVG(l, 180),
      );

      r.src = tube(root, { label: S66.originalId, level: 0.82, code: false });
      r.news = [1, 2, 3].map((k) =>
        tube(root, { label: S66.label(k), cap: "#475569" }),
      );
      r.wrongTube = tube(root, {
        label: "S0068-1",
        cap: "#475569",
        level: 0.4,
      });
      r.pip = pipette(root);
      r.boxes = [0, 1, 2].map(() => physBox(root, { pitch: 17, kind: "dest" }));
      r.boxTitles = [0, 1, 2].map((k) =>
        add(
          root,
          `<div class="abs" style="font-size:22px;font-weight:800;color:${SET_COLORS[k]}">${SETS[k]} 1</div>`,
        ),
      );
      r.idChip = add(
        root,
        `<div class="abs callout mono" style="font-size:34px">41540</div>`,
      );
      r.match = add(
        root,
        `<div class="abs chip" style="background:#047857;color:#fff;font-size:26px">${icon("check", 28, 3)} Match</div>`,
      );
      r.puller = roleChip(root, "puller");
      r.tap = ripple(root);
      r.svg = add(
        root,
        `<svg class="abs" width="${W}" height="${H}" style="overflow:visible"><path class="link" fill="none" stroke="#f59e0b" stroke-width="4" stroke-dasharray="10 10" stroke-linecap="round"/></svg>`,
      );
      r.svg._w = W;
      r.svg._h = H;
      r.link = r.svg.querySelector(".link");
      r.cross = add(
        root,
        `<div class="abs" style="width:84px;height:84px;border-radius:50%;background:#dc2626;color:#fff;display:grid;place-items:center;box-shadow:0 10px 30px -10px rgba(220,38,38,0.8)">${icon("x", 52, 3.5)}</div>`,
      );
      r.cross._w = 84;
      r.cross._h = 84;
      return r;
    },
    render(t, T, r) {
      renderRoleParts(t, T, r, ALIQUOTER_STEPS);
      const phIn = p(t, T.introEnd - 0.4, 0.8, ease.out);
      place(r.phone, { x: 330, y: lerp(560, 515, phIn), s: 0.8, o: phIn });
      place(r.svg, { x: 0, y: 0, ax: 0, ay: 0 });

      // Step 1: the original tube arrives; its ID matches the screen.
      const srcX = 820;
      const srcY = 560;
      const arrive = p(t, T["@check"] + 0.3, 0.8, ease.out);
      const leave = p(t, T.giveBack, 1.0);
      const pullerAt = { x: 1100, y: 215 };
      const srcPos = {
        x: lerp(lerp(srcX + 260, srcX, arrive), pullerAt.x, leave),
        y: lerp(srcY, pullerAt.y + 70, leave),
        s: lerp(1.3, 0.55, leave),
      };
      place(r.src, {
        ...srcPos,
        o: Math.min(arrive, 1 - p(t, T.giveBack + 0.8, 0.3)),
      });
      const big = rel(r.bigId);
      highlight(r.bigId, vis(t, T.match - 0.6, T["/check"] + 0.2));
      place(r.idChip, {
        x: srcX,
        y: srcY - 250,
        o: vis(t, T["@check"] + 0.9, T["/check"] + 0.2),
        s: lerp(0.8, 1, p(t, T["@check"] + 0.9, 0.4, ease.back)),
      });
      const linkO = vis(t, T.match - 0.5, T["/check"] + 0.2);
      r.link.setAttribute(
        "d",
        `M${srcX - 80} ${srcY - 250} C ${srcX - 250} ${srcY - 250}, ${big.x + big.w + 150} ${big.cy}, ${big.x + big.w + 14} ${big.cy}`,
      );
      r.link.style.opacity = String(linkO);
      r.link.style.strokeDashoffset = String(-t * 30);
      place(r.match, {
        x: (srcX + big.x + big.w) / 2 + 40,
        y: srcY - 140,
        o: vis(t, T.match, T["/check"] + 0.2),
        s: lerp(0.7, 1, p(t, T.match, 0.4, ease.back)),
      });

      // Step 2: pipette into the three tubes.
      const tubeX = [1060, 1200, 1340];
      const tubeY = 600;
      const cycle = 1.15;
      let srcLevel = 0.82;
      const levels = [0, 0, 0];
      let pipX = srcX;
      let pipY = 330;
      let pipFill = 0;
      for (let k = 0; k < 3; k++) {
        const t0 = T.pip + k * cycle;
        const draw = p(t, t0 + 0.2, 0.25);
        const give = p(t, t0 + 0.8, 0.25);
        srcLevel -= 0.17 * draw;
        levels[k] = 0.42 * give;
        if (t >= t0 - 0.35) {
          pipX = kf(t, [
            [t0 - 0.35, k === 0 ? srcX : tubeX[k - 1]],
            [t0, srcX],
            [t0 + 0.55, srcX],
            [t0 + 0.75, tubeX[k]],
          ]);
          pipY =
            350 + pulse(t, t0, 0.55) * 130 + pulse(t, t0 + 0.75, 0.4) * 110;
          pipFill = draw - give;
        }
      }
      r.src.level(srcLevel);
      place(r.pip, {
        x: pipX,
        y: pipY,
        ay: 1,
        o: vis(t, T.pip - 0.5, T.pip + 3 * cycle + 0.1),
      });
      r.pip.fill(pipFill);

      // Steps 3 and 4: each tube to the camera, then into its box.
      const cam = rel(r.cam);
      const boxX = 1680;
      const boxY = [300, 545, 790];
      r.boxes.forEach((box, k) => {
        const g = p(t, T["@scan"] - 0.2 + k * 0.1, 0.6, ease.out);
        place(box, { x: lerp(boxX + 200, boxX, g), y: boxY[k], o: g });
        place(r.boxTitles[k], {
          x: lerp(boxX + 200, boxX, g) - 102,
          y: boxY[k] - 122,
          ax: 0,
          o: g,
        });
        box.cap("G6", p(t, T.scan[k] + 1.6, 0.3, ease.back), SET_COLORS[k]);
        box.ring("G6", vis(t, T.scan[k] + 1.6, T["/next"]) * 0.9);
      });
      const camOn = p(t, T.cam + 0.15, 0.3);
      show(r.camIdle, 1 - camOn);
      show(r.camOn, camOn);
      const sc = rel(r.startCam);
      tap(r.tap, t, T.cam, sc.cx, sc.cy);
      r.news.forEach((tb, k) => {
        tb.level(levels[k]);
        const appear = p(t, T["@fill"] + 0.1 + k * 0.1, 0.5, ease.back);
        const s = T.scan[k];
        const toCam = p(t, s - 0.45, 0.45);
        const cell = cellOnStage(r.boxes[k], "G6", boxX, boxY[k]);
        const fly = p(t, s + 0.9, 0.75);
        let x = lerp(tubeX[k], cam.cx + 150, toCam);
        let y = lerp(tubeY, cam.cy + 30, toCam);
        x = lerp(x, cell.x, fly);
        y = lerp(y, cell.y, fly) - Math.sin(Math.PI * fly) * 120;
        place(tb, {
          x,
          y,
          s: lerp(lerp(1, 0.8, toCam), 0.12, fly),
          r: -14 * toCam * (1 - fly),
          o: Math.min(appear, 1 - p(t, s + 1.5, 0.15)),
        });
      });
      // What the camera sees, and the answer.
      let inView = -1;
      T.scan.forEach((s, k) => {
        if (t >= s - 0.1 && t < s + 0.9) inView = k;
      });
      if (t >= T.wrong - 0.1 && t < T.wrong + 1.4) inView = 3;
      if (r.shown !== inView) {
        r.camLabel.innerHTML = inView >= 0 ? r.camLabels[inView] : "";
        r.shown = inView;
      }
      const decodedOk = T.scan.some((s) => t >= s + 0.35 && t < s + 0.9);
      const decodedBad = t >= T.wrong + 0.35 && t < T.wrong + 1.4;
      r.reticle.style.borderColor = decodedOk
        ? "#34d399"
        : decodedBad
          ? "#ef4444"
          : "rgba(255,255,255,0.7)";
      r.reticle.style.borderStyle =
        decodedOk || decodedBad ? "solid" : "dashed";
      let shownRes = -1;
      T.scan.forEach((s, k) => {
        if (t >= s + 0.4) shownRes = k;
      });
      if (t >= T.advance) shownRes = 2;
      r.res.forEach((el, k) => {
        const on = k === shownRes && t < T.wrong + 0.4;
        show(el, on ? 1 : 0);
        el.style.transform = `scale(${on ? lerp(0.96, 1, p(t, T.scan[k] + 0.4, 0.2, ease.back)) : 1})`;
      });
      show(r.bad, p(t, T.wrong + 0.4, 0.15));
      r.bad.style.transform = `translateX(${(Math.sin(t * 60) * 6 * pulse(t, T.wrong + 0.4, 0.5)).toFixed(1)}px)`;
      show(r.resEmpty, shownRes < 0 ? 1 : 0);
      r.chips.forEach((c, k) => {
        const done = t >= T.scan[k] + 0.4;
        c.classList.toggle("solid", done);
        c.classList.toggle("pending", !done);
        c.querySelector(".chk").style.opacity = done ? "1" : "0";
      });
      swap(r.ca, r.cb, p(t, T.advance, 0.6), 30);
      place(r.puller, {
        x: pullerAt.x,
        y: pullerAt.y,
        o: vis(t, T.giveBack - 0.5, T["/next"]),
      });

      // The wrong tube.
      const wIn = p(t, T.wrong - 0.6, 0.5);
      const wOut = p(t, T.wrong + 1.6, 0.6);
      place(r.wrongTube, {
        x: lerp(lerp(1250, cam.cx + 150, wIn), 1250, wOut),
        y: lerp(lerp(620, cam.cy + 30, wIn), 640, wOut),
        s: lerp(1, 0.8, wIn - wOut),
        r: -14 * (wIn - wOut),
        o: Math.min(p(t, T.wrong - 0.8, 0.3), 1 - p(t, T["/wrong"] - 0.3, 0.3)),
      });
      place(r.cross, {
        x: lerp(lerp(1250, cam.cx + 150, wIn), 1250, wOut) + 60,
        y: lerp(lerp(620, cam.cy + 30, wIn), 640, wOut) - 120,
        s: lerp(0.4, 1, p(t, T.wrong + 0.45, 0.35, ease.back)),
        o: Math.min(
          p(t, T.wrong + 0.45, 0.2),
          1 - p(t, T["/wrong"] - 0.3, 0.3),
        ),
      });
    },
  });

  // 9. Behind the scenes.
  const LOG = [
    ["10:41:02.315", "Ana", "pulled S0066"],
    ["10:41:04.877", "Mei", "labeled S0066 (all labels scanned)"],
    ["10:41:29.106", "Jun", "placed S0066-1 → Ship box 1 · G6"],
    ["10:41:33.452", "Jun", "placed S0066-2 → Keep2 box 1 · G6"],
    ["10:41:37.981", "Jun", "placed S0066-3 → Keep3 box 1 · G6"],
    ["10:41:38.004", "Jun", "finished S0066"],
    ["10:42:11.630", "Ana", "returned S0066 to case_box 1 1-C-10"],
    ["10:42:15.208", "Ana", "undid the pull of S0067"],
    ["10:42:19.744", "Ana", "skipped S0069 for now"],
  ];
  scene({
    id: "system",
    beats: [
      {
        id: "live",
        say: "Behind the scenes, every key press and every scan goes to the server, and every screen updates in under a second.",
        min: 6.5,
      },
      {
        id: "log",
        say: "Each step is saved in a log: what happened, who did it, and when, down to the millisecond.",
        min: 6,
      },
      {
        id: "fix",
        say: "Made a mistake? Press Undo. Can't find a tube? Press S to skip it for now. Nothing is ever erased; each fix is added to the log.",
        min: 8,
      },
      {
        id: "overview",
        say: "And the Overview screen shows the whole batch, live.",
        min: 5,
      },
    ],
    plan({ at, cue }) {
      return {
        live: at("live"),
        send: cue("live", "goes to") - 0.2,
        fan: cue("live", "every screen") - 0.1,
        log: at("log"),
        fix: at("fix"),
        undo: cue("fix", "Undo"),
        skip: cue("fix", "skip"),
        added: cue("fix", "added"),
        overview: at("overview"),
      };
    },
    sounds(T) {
      return [
        { t: T.undo + 0.2, kind: "key" },
        { t: T.skip + 0.2, kind: "key" },
      ];
    },
    build(root) {
      const r = {};
      r.head = sceneHeader(
        root,
        "Behind the scenes",
        "Always in sync. Every step on record.",
      );
      r.devices = ["puller", "labeler", "aliquoter"].map((role) => {
        const info = ROLES[role];
        return add(
          root,
          `<div class="abs panel row" style="width:380px;height:120px;padding:0 24px;gap:18px;border-radius:20px"><div class="role-square" style="width:64px;height:64px">${icon(info.icon, 34)}</div><div><div style="font-size:30px;font-weight:800">${info.name}</div><div class="dev-status mono" style="font-size:18px;color:var(--mute)">Pull S0067</div></div><div style="margin-left:auto;color:var(--faint)">${icon(info.device, 34)}</div></div>`,
        );
      });
      r.status = r.devices.map((d) => d.querySelector(".dev-status"));
      r.server = add(
        root,
        `<div class="abs panel col" style="width:250px;height:250px;align-items:center;justify-content:center;gap:12px;border-radius:28px"><div class="role-square" style="width:96px;height:96px;background:#1e293b">${icon("server", 52)}</div><div style="font-size:30px;font-weight:800">Server</div><div class="row" style="gap:8px;font-size:18px;font-weight:600;color:var(--mute)">${icon("database", 20)} Database</div></div>`,
      );
      r.lines = add(
        root,
        `<svg class="abs" width="${W}" height="${H}" style="overflow:visible">${[0, 1, 2].map((i) => `<path class="ln" d="M500 ${380 + i * 180} C620 ${380 + i * 180} 640 560 740 560" fill="none" stroke="#cbd5e1" stroke-width="4"/>`).join("")}</svg>`,
      );
      r.lines._w = W;
      r.lines._h = H;
      r.paths = [...r.lines.querySelectorAll(".ln")];
      r.packet = add(
        root,
        `<div class="abs chip dark" style="font-size:20px;padding:8px 14px">${icon("package-open", 20)} Pulled S0067</div>`,
      );
      r.pings = [0, 1, 2].map(() =>
        add(
          root,
          `<div class="abs" style="width:22px;height:22px;border-radius:50%;background:#10b981;box-shadow:0 0 0 6px rgba(16,185,129,0.25)"></div>`,
        ),
      );
      r.fast = add(
        root,
        `<div class="abs chip" style="font-size:22px;background:#d1fae5;color:#065f46">${icon("zap", 22)} under a second</div>`,
      );
      r.log = add(
        root,
        `<div class="abs panel" style="width:820px;height:640px;padding:28px 30px;overflow:hidden">
          <div class="row" style="justify-content:space-between"><div class="eyebrow" style="font-size:17px">Activity log</div><div class="row" style="gap:6px;font-size:16px;color:var(--mute)">${icon("history", 18)} append-only</div></div>
          <div style="margin-top:18px;display:flex;flex-direction:column;gap:6px">
          ${LOG.map(([time, who, what], i) => `<div class="log-line row" data-i="${i}" style="gap:16px;padding:9px 12px;border-radius:10px;font-size:21px"><span class="mono" style="font-size:17px;color:var(--faint)">${time}</span><b style="width:44px">${who}</b><span style="white-space:nowrap">${what}</span></div>`).join("")}
          </div>
        </div>`,
      );
      r.logLines = [...r.log.querySelectorAll(".log-line")];
      r.keys = [keycap(root, "Undo", "arrow-left"), keycap(root, "Skip", "")];
      r.keys[1].innerHTML = `<span class="mono" style="font-size:40px">S</span> Skip`;
      r.addedChip = add(
        root,
        `<div class="abs chip" style="font-size:22px;background:#fef3c7;color:#78350f">+ added, never erased</div>`,
      );

      // The overview screen.
      const stages = [
        ["Not started", "#fff", "inset 0 0 0 1px #e2e8f0"],
        ["Pulled or labeled", "#fffbeb", "inset 0 0 0 1px #fde68a"],
        ["Ready to aliquot", "#fde68a", "none"],
        ["Aliquoting", "#bae6fd", "none"],
        ["Done, source out", "#a7f3d0", "none"],
        ["Done, source returned", "#059669", "none"],
      ];
      r.stages = stages;
      let cells = "";
      for (let n = 1; n <= 100; n++)
        cells += `<div class="ov-cell mono" data-n="${n}" style="aspect-ratio:1;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:600"></div>`;
      r.ov = windowFrame(
        root,
        `${stationHeader("overview", "Lee")}
        <div style="display:grid;grid-template-columns:560px 1fr;gap:20px;padding:20px">
          <div class="card"><div class="lbl">Box 1</div><div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:12px">${cells}</div></div>
          <div class="col" style="gap:14px">
            <div class="card">${[
              ["Pulled", 68],
              ["Labeled", 67],
              ["Aliquoted", 65],
              ["Returned", 62],
            ]
              .map(
                ([l, v]) =>
                  `<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between;font-size:15px"><span style="color:#475569">${l}</span><b class="mono">${v}/100</b></div><div style="height:8px;border-radius:9px;background:#e2e8f0;margin-top:5px"><div style="height:8px;border-radius:9px;background:#0f172a;width:${v}%"></div></div></div>`,
              )
              .join("")}</div>
            <div class="card">${stages.map(([l, bg, ring]) => `<div class="row" style="gap:10px;font-size:15px;margin:5px 0"><span style="width:20px;height:20px;border-radius:5px;background:${bg};box-shadow:${ring}"></span>${l}</div>`).join("")}</div>
          </div>
        </div>`,
        1000,
        720,
      );
      r.ovCells = [...r.ov.querySelectorAll(".ov-cell")];
      r.ovState = "";
      return r;
    },
    render(t, T, r) {
      placeHeader(r.head, t);
      const ovIn = p(t, T.overview, 0.7);
      const away = 1 - ovIn;

      // Devices send to the server; the server tells every screen.
      r.devices.forEach((d, i) => {
        const g = p(t, T.live + 0.2 + i * 0.15, 0.6, ease.out);
        place(d, { x: 310 - (1 - g) * 40, y: 380 + i * 180, o: g * away });
      });
      const sIn = p(t, T.live + 0.6, 0.6, ease.back);
      place(r.server, {
        x: 860,
        y: 560,
        s: lerp(0.8, 1, sIn),
        o: p(t, T.live + 0.6, 0.3) * away,
      });
      place(r.lines, {
        x: 0,
        y: 0,
        ax: 0,
        ay: 0,
        o: p(t, T.live + 0.5, 0.5) * away,
      });
      const send = p(t, T.send, 1.0);
      const path = r.paths[0];
      const pt = path.getPointAtLength(send * path.getTotalLength());
      place(r.packet, {
        x: pt.x,
        y: pt.y - 34,
        o: vis(t, T.send - 0.1, T.send + 1.2, 0.2) * away,
      });
      r.pings.forEach((ping, i) => {
        const g = p(t, T.fan + i * 0.05, 0.6, ease.inOut);
        const pa = r.paths[i];
        const len = pa.getTotalLength();
        const q = pa.getPointAtLength((1 - g) * len);
        place(ping, { x: q.x, y: q.y, o: (g > 0 && g < 1 ? 1 : 0) * away });
        setText(
          r.status[i],
          t > T.fan + 0.6 + i * 0.05 ? "Pull S0068" : "Pull S0067",
        );
        r.status[i].style.color =
          vis(t, T.fan + 0.6, T.fan + 2.2) > 0.5 ? "#047857" : "";
      });
      place(r.fast, {
        x: 860,
        y: 740,
        o: vis(t, T.fan + 0.4, T.overview) * away,
      });

      // The log.
      const logIn = p(t, T.log, 0.7, ease.out);
      place(r.log, { x: lerp(1500, 1440, logIn), y: 590, o: logIn });
      r.logLines.forEach((line, i) => {
        let at = T.log + 0.5 + i * 0.35;
        if (i === 7) at = T.undo + 0.25;
        if (i === 8) at = T.skip + 0.25;
        const g = p(t, at, 0.35, ease.out);
        line.style.opacity = String(g);
        line.style.transform = `translateY(${((1 - g) * 10).toFixed(1)}px)`;
        line.style.background =
          i >= 7
            ? `rgba(254,243,199,${vis(t, at, T.overview + 0.4).toFixed(2)})`
            : "";
      });
      // Undo and Skip.
      const kIn = vis(t, T.fix + 0.2, T.overview + 0.1);
      r.keys.forEach((k, i) => {
        const at = i === 0 ? T.undo : T.skip;
        const pr = pulse(t, at + 0.2, 0.28);
        place(k, {
          x: 1180 + i * 290,
          y: 990 + pr * 6,
          s: 0.72,
          o: Math.min(kIn, p(t, at - 0.4, 0.3)),
        });
        k.press(pr);
      });
      place(r.addedChip, {
        x: 1440,
        y: 240,
        o: vis(t, T.added - 0.2, T.overview + 0.2),
      });

      // The overview.
      place(r.ov, {
        x: 96,
        y: lerp(250, 220, ovIn),
        s: 0.8,
        ax: 0,
        ay: 0,
        o: ovIn,
      });
      const wave = clamp((t - T.overview - 0.6) / 2.5);
      const state = (n) => {
        const ret = 62 + Math.floor(wave * 2);
        if (n <= ret) return 5;
        if (n <= 65 + Math.floor(wave * 1)) return 4;
        if (n === 66 + Math.floor(wave * 1)) return 3;
        if (n === 67 + Math.floor(wave * 1)) return 2;
        if (n <= 68 + Math.floor(wave * 2)) return 1;
        return 0;
      };
      const key = Math.floor(wave * 4);
      if (r.ovState !== key) {
        r.ovCells.forEach((c) => {
          const n = Number(c.dataset.n);
          const [, bg, ring] = r.stages[state(n)];
          c.style.background = bg;
          c.style.boxShadow = ring;
          c.style.color = state(n) === 5 ? "#fff" : "#64748b";
          c.textContent = sample(n).slot;
        });
        r.ovState = key;
      }
    },
  });

  // 10. Recap.
  const RECAP = [
    [
      "puller",
      [
        "Find the tube on your screen",
        "Hand it to the Aliquoter",
        "Press Space",
        "Put returns back, press Enter",
      ],
    ],
    [
      "labeler",
      [
        "Find the three labels",
        "Stick one on each tube",
        "Press Space, or scan them",
        "Hand them to the Aliquoter",
      ],
    ],
    [
      "aliquoter",
      [
        "Check the ID on the tube",
        "Aliquot into three tubes",
        "Scan each; place where shown",
        "Hand the original back",
      ],
    ],
  ];
  scene({
    id: "recap",
    chrome: false,
    beats: [
      {
        id: "recap",
        say: "That's it. Follow your screen, one tube at a time.",
        min: 7,
      },
      { id: "end", min: 3.5 },
    ],
    plan({ at }) {
      return { recap: at("recap"), end: at("end") };
    },
    build(root) {
      const r = {};
      r.cards = RECAP.map(([role, lines]) => {
        const info = ROLES[role];
        return add(
          root,
          `<div class="abs panel" style="width:520px;height:440px;padding:36px">
            <div class="row" style="gap:20px"><div class="role-square" style="width:80px;height:80px">${icon(info.icon, 44)}</div><div style="font-size:46px;font-weight:800;letter-spacing:-0.03em">${info.name}</div></div>
            <ol style="list-style:none;padding:0;margin:34px 0 0;display:flex;flex-direction:column;gap:22px">${lines.map((l, i) => `<li class="row" style="gap:16px;font-size:27px;font-weight:600;line-height:1.25;align-items:flex-start"><span style="display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#f1f5f9;font-size:22px;font-weight:800;flex:none">${i + 1}</span><span style="padding-top:5px">${l}</span></li>`).join("")}</ol>
          </div>`,
        );
      });
      r.head = add(
        root,
        `<div class="abs" style="font-size:72px;font-weight:800;letter-spacing:-0.04em">That's it.</div>`,
      );
      r.logo = add(
        root,
        `<div class="abs" style="width:160px;height:160px">${logoSVG(160)}</div>`,
      );
      r.title = add(
        root,
        `<div class="abs" style="font-size:96px;font-weight:800;letter-spacing:-0.045em">Aliquot Guide</div>`,
      );
      r.tag = add(
        root,
        `<div class="abs" style="font-size:38px;font-weight:500;color:var(--mute)">Follow your screen, one tube at a time.</div>`,
      );
      return r;
    },
    render(t, T, r) {
      const out = p(t, T.end - 0.2, 0.6);
      place(r.head, { x: 960, y: 140, o: p(t, T.recap, 0.5) * (1 - out) });
      r.cards.forEach((c, i) => {
        const g = p(t, T.recap + 0.3 + i * 0.25, 0.7, ease.back);
        place(c, {
          x: 400 + i * 560,
          y: lerp(600, 570, g),
          s: lerp(0.94, 1, g) * lerp(1, 0.96, out),
          o: p(t, T.recap + 0.3 + i * 0.25, 0.4) * (1 - out),
        });
      });
      const e = p(t, T.end + 0.2, 0.8, ease.back);
      place(r.logo, {
        x: 960,
        y: 380,
        s: lerp(0.6, 1, e),
        o: p(t, T.end + 0.2, 0.4),
      });
      place(r.title, {
        x: 960,
        y: lerp(560, 540, p(t, T.end + 0.5, 0.6)),
        o: p(t, T.end + 0.5, 0.5),
      });
      place(r.tag, {
        x: 960,
        y: lerp(640, 625, p(t, T.end + 0.8, 0.6)),
        o: p(t, T.end + 0.8, 0.5),
      });
    },
  });

  // -------------------------------------------------------------- timeline

  let total = 0;

  function speech(key, text) {
    if (!text) return 0;
    return SPOKEN[key] ?? text.length * 0.058;
  }

  for (const s of scenes) {
    s.start = total;
    let t = s.pre ?? 0.5;
    s.at = {};
    s.end = {};
    for (const b of s.beats) {
      b.key = `${s.id}.${b.id}`;
      b.speech = speech(b.key, b.say);
      b.start = t;
      b.dur = Math.max(b.min ?? 0, b.say ? LEAD + b.speech + TAIL : 0);
      t += b.dur;
      s.at[b.id] = b.start;
      s.end[b.id] = t;
    }
    s.dur = t + (s.post ?? 0.5);
    total += s.dur;
    const beatOf = (id) => s.beats.find((b) => b.id === id);
    const cue = (id, phrase) => {
      const b = beatOf(id);
      const i = b.say.indexOf(phrase);
      if (i < 0) throw new Error(`"${phrase}" is not in ${b.key}`);
      return b.start + LEAD + b.speech * (i / b.say.length);
    };
    s.ctx = {
      at: (id) => s.at[id],
      end: (id) => s.end[id],
      cue,
    };
    s.T = s.plan ? s.plan.call(s, s.ctx) : {};
  }

  // Build every scene, hidden, then the chrome on top.
  for (const s of scenes) {
    s.root = add(
      stage,
      `<section class="scene" style="display:none"></section>`,
    );
    s.refs = s.build(s.root);
  }
  const brand = add(
    stage,
    `<div class="abs brand">${logoSVG(40)}Aliquot Guide</div>`,
  );
  const bar = add(stage, `<div class="progress"><i></i></div>`);
  const barFill = bar.firstElementChild;

  let current = null;

  function render(time) {
    const t = clamp(time, 0, total - 1 / FPS);
    const s =
      scenes.find((x) => t < x.start + x.dur) || scenes[scenes.length - 1];
    if (current !== s) {
      // Hidden scenes are not laid out; elements are measured once shown.
      if (current) current.root.style.display = "none";
      s.root.style.display = "block";
      current = s;
    }
    const local = t - s.start;
    const o = Math.min(
      p(local, 0, FADE, ease.out),
      1 - p(local, s.dur - FADE, FADE, ease.in),
    );
    s.root.style.opacity = o.toFixed(3);
    s.render(local, s.T, s.refs);
    const chrome = s.chrome === false ? 0 : 1;
    place(brand, { x: W - 64, y: 64, ax: 1, ay: 0.5, o: chrome * 0.9 });
    barFill.style.transform = `scaleX(${(t / total).toFixed(5)})`;
    bar.style.opacity = String(chrome);
  }

  const cues = [];
  const sounds = [];
  for (const s of scenes) {
    for (const b of s.beats)
      if (b.say)
        cues.push({ id: b.key, text: b.say, t: s.start + b.start + LEAD });
    if (s.sounds)
      for (const x of s.sounds(s.T))
        sounds.push({ kind: x.kind, t: s.start + x.t });
  }

  window.explainer = {
    width: W,
    height: H,
    fps: FPS,
    duration: total,
    cues,
    sounds,
    chapters: scenes.map((s) => ({ id: s.id, t: s.start })),
    seek: render,
    ready: document.fonts.ready,
  };

  // -------------------------------------------------------------- preview

  const rendering = new URLSearchParams(location.search).has("render");
  function fit() {
    stageScale = rendering
      ? 1
      : Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `scale(${stageScale})`;
    stage.style.left = `${(window.innerWidth - W * stageScale) / 2}px`;
    stage.style.top = `${(window.innerHeight - H * stageScale) / 2}px`;
  }
  fit();
  if (rendering) return;

  window.addEventListener("resize", fit);
  const hud = add(document.body, `<div id="hud"></div>`);
  let playing = true;
  let at = Number(new URLSearchParams(location.search).get("t")) || 0;
  let last = null;
  const frame = (now) => {
    if (playing && last !== null) at = (at + (now - last) / 1000) % total;
    last = now;
    render(at);
    hud.textContent = `${at.toFixed(2)} / ${total.toFixed(1)} s  ${current.id}${playing ? "" : "  (paused)"}`;
    requestAnimationFrame(frame);
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === " ") playing = !playing;
    if (e.key === "ArrowRight") at = Math.min(total - 0.01, at + 5);
    if (e.key === "ArrowLeft") at = Math.max(0, at - 5);
    if (e.key === "]") {
      const next = scenes.find((s) => s.start > at + 0.01);
      if (next) at = next.start;
    }
    if (e.key === "[") {
      const prev = [...scenes].reverse().find((s) => s.start < at - 0.5);
      at = prev ? prev.start : 0;
    }
  });
  document.fonts.ready.then(() => requestAnimationFrame(frame));
})();
