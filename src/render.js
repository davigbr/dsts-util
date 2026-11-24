/* ============================================================
   RENDER + UI
   ============================================================ */

let canvas, ctx, DPR = window.devicePixelRatio || 1;
let dirty = true, raf = null;
let hoverPos = null;
let lineage = new Set();   // nós destacados pelo foco

function initCanvas() {
  canvas = $("#graph");
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", () => { resize(); fitToView(true); draw(); });
  const ro = new ResizeObserver(() => { resize(); draw(); });
  ro.observe(canvas.parentElement);
}

let lastW = 0;
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  if (Math.abs(r.width - lastW) > 40 && lastW > 0) {
    // painel abriu/fechou: reancorar sem mudar o zoom
    setTimeout(() => {
      if (state.selected) centerOn(state.selected.name, state.cam.k);
      else { fitToView(true); draw(); }
    }, 30);
  }
  lastW = r.width;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(320, r.width * DPR);
  canvas.height = Math.max(240, r.height * DPR);
  canvas.style.width = r.width + "px";
  canvas.style.height = r.height + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

const viewW = () => canvas.width / DPR;
const viewH = () => canvas.height / DPR;

function bounds(l = layout) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  l.pos.forEach(p => {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  });
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 100, y1: 100 };
  return { x0, y0, x1, y1 };
}

function fitToView(horizontal = true, minK = 0.05) {
  const b = bounds();
  const w = (b.x1 - b.x0) + 190, h = (b.y1 - b.y0) + 90;
  const kx = (viewW() - 150) / Math.max(1, w);
  const ky = (viewH() - 130) / Math.max(1, h);
  const k = clamp(horizontal ? kx : Math.min(kx, ky), minK, 2.2);
  state.cam.k = k;
  state.cam.x = viewW() / 2 - ((b.x0 + b.x1) / 2) * k;
  state.cam.y = viewH() / 2 - ((b.y0 + b.y1) / 2) * k;
}

function centerOn(name, k) {
  const p = layout.pos.get(name);
  if (!p) return;
  state.cam.k = k || Math.max(state.cam.k, 0.85);
  state.cam.x = viewW() / 2 - p.x * state.cam.k;
  state.cam.y = viewH() / 2 - p.y * state.cam.k;
  draw();
}

const toScreen = (p) => ({ x: p.x * state.cam.k + state.cam.x, y: p.y * state.cam.k + state.cam.y });
const toWorld = (x, y) => ({ x: (x - state.cam.x) / state.cam.k, y: (y - state.cam.y) / state.cam.k });

/* ---------- cores / tamanho ---------- */
const GRAD = ["#2f7fd0", "#3aa6a0", "#79bf4a", "#e0b431", "#e07a2f", "#c0392b"];

function lerpColor(a, b, t) {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}
function heat(t) {
  t = clamp(t, 0, 1) * (GRAD.length - 1);
  const i = Math.min(GRAD.length - 2, Math.floor(t));
  return lerpColor(GRAD[i], GRAD[i + 1], t - i);
}

function colorFor(n) {
  const by = state.view.colorBy;
  if (by === "attr") return ATTR_COLOR[n.attr] || "#888";
  if (by === "gen") return heat(GEN_ORDER.indexOf(n.gen) / (GEN_ORDER.length - 1));
  if (by === "tier") return TIER_COLOR[n.tier] || "#666";
  if (by === "gtier") return TIER_COLOR[n.gtier || n.tier] || "#666";
  if (by === "power") return heat((n.pow || 0) / 100);
  if (by === "gpower") return heat((n.gpow ?? n.pow ?? 0) / 100);
  if (by === "pers") {
    const q = { Zealous: 0, Brave: .1, Reckless: .2, Daring: .3, Friendly: .45, Opportunistic: .5, Sociable: .55, Compassionate: .6, Adoring: .7, Devoted: .75, Tolerant: .8, Overprotective: .85, Enlightened: .9, Sly: .93, Astute: .96, Strategic: 1 };
    return heat((q[n.pers] ?? .4));
  }
  const s = by.toUpperCase();
  return heat(statVal(n, s) / (MAX_STAT[s] || 1));
}

function radiusFor(n) {
  const by = state.view.sizeBy;
  if (by === "fixed") return 9;
  if (by === "power") return clamp(5 + (n.pow || 0) / 100 * 15, 5, 21);
  if (by === "gpower") return clamp(5 + (n.gpow ?? n.pow ?? 0) / 100 * 15, 5, 21);
  let v;
  if (by === "bulk") v = bulk(n) / (1e6);
  else v = statVal(n, by.toUpperCase()) / 1000;
  const base = state.view.layout === "lineage" ? 10 : 9;
  return clamp(base + Math.sqrt(Math.max(0, v)) * (state.view.layout === "lineage" ? 2.6 : 2.1), 7, 26);
}

/* ---------- desenho ---------- */
const ELEMENTS = ["Fire", "Water", "Plant", "Ice", "Electricity", "Earth", "Steel", "Wind", "Light", "Dark", "Null"];
const EL_COLOR = {
  Fire: "#ff7a45", Water: "#4aa3df", Plant: "#54bf6d", Ice: "#7ad3e8",
  Electricity: "#ffd24a", Earth: "#c08a4a", Steel: "#9fb0c0",
  Wind: "#66d9b8", Light: "#ffe08a", Dark: "#a86fd6", Null: "#8b93a3",
};
const BEATS = { Vaccine: "Virus", Virus: "Data", Data: "Vaccine" };
const TIERS = ["S", "A", "B", "C", "D"];
const TIER_COLOR = { S: "#ff4d6d", A: "#ff9f43", B: "#ffd166", C: "#6f9bb5", D: "#55606f" };

const ICONS = new Map();
function iconReady(n, cb) {
  if (ICONS.has(n.name) || !n.img) return;
  ICONS.set(n.name, null);
  const im = new Image();
  im.onload = () => {
    const S = 96, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 1, 0, 7);
    g.clip();
    g.drawImage(im, 0, 0, S, S);
    g.restore();
    ICONS.set(n.name, c);
    cb && cb();
  };
  im.onerror = () => ICONS.set(n.name, null);
  im.src = n.img;
}
let iconsQueued = false;
function loadIcons() {
  if (iconsQueued) return;
  iconsQueued = true;
  DATA.nodes.forEach(n => iconReady(n, () => requestAnimationFrame(draw)));
}

function draw() {
  if (!ctx) return;
  const k = state.cam.k;
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, viewW(), viewH());
  ctx.fillStyle = getCss("--bg");
  ctx.fillRect(0, 0, viewW(), viewH());

  const sel = state.selected;
  const hoverNode = state.hover ? byName.get(state.hover) : null;
  const active = hoverNode || sel;
  const activeSet = active ? lineageOf(active.name) : null;
  const focusOn = !!activeSet && state.view.focus;

  // ---------- arestas ----------
  const mode = state.view.edges;
  const showAll = mode === "all";
  const showLineage = mode === "lineage";
  if (mode !== "none") {
    layout.edges.forEach(e => {
      const a = layout.pos.get(e.s), b = layout.pos.get(e.t);
      if (!a || !b) return;
      const inLine = activeSet && activeSet.has(e.s) && activeSet.has(e.t);
      if (showLineage && !inLine) return;
      const A = toScreen(a), B = toScreen(b);
      const dim = focusOn && !inLine;
      const src = byName.get(e.s), tgt = byName.get(e.t);
      if (inLine) {
        ctx.strokeStyle = hexA(ATTR_COLOR[tgt?.attr] || "#ffc45c", .8);
        ctx.lineWidth = Math.max(1.1, 1.5 * Math.max(k, .8));
      } else if (showAll) {
        ctx.strokeStyle = hexA(ATTR_COLOR[src?.attr] || "#8fa0b8", dim ? .06 : .32);
        ctx.lineWidth = Math.max(0.5, .9 * k);
      } else {
        ctx.strokeStyle = `rgba(150,166,190,${dim ? .035 : .12})`;
        ctx.lineWidth = Math.max(0.4, .75 * k);
      }
      const mx = (A.x + B.x) / 2;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.bezierCurveTo(mx, A.y, mx, B.y, B.x, B.y);
      ctx.stroke();
      if (inLine) arrowHead({ x: mx, y: B.y }, B, ctx.strokeStyle);
    });
  }

  // ---------- nós ----------
  const labelsMode = state.view.labels;
  const nVis = layout.nodes.length;
  const labelK = nVis > 260 ? .9 : nVis > 130 ? .72 : .46;
  layout.nodes.forEach(n => {
    const p = layout.pos.get(n.name);
    if (!p) return;
    const S = toScreen(p);
    const r = radiusFor(n) * clamp(Math.pow(k, .42), .6, 2.2);
    const inSet = !activeSet || activeSet.has(n.name);
    const dim = focusOn && !inSet ? .3 : (activeSet && !inSet ? .55 : 1);
    const isSel = sel && sel.name === n.name;
    const isHover = state.hover === n.name;

    ctx.globalAlpha = dim;
    const icon = ICONS.get(n.name);
    const iconsOn = state.view.icons === "on" || (state.view.icons === "auto" && r >= 3.6);
    if (icon && iconsOn) {
      ctx.beginPath();
      ctx.arc(S.x, S.y, r, 0, 7);
      ctx.fillStyle = "rgba(19,24,34,.95)";
      ctx.fill();
      ctx.drawImage(icon, S.x - r, S.y - r, r * 2, r * 2);
      ctx.lineWidth = Math.max(1, r * .12);
      ctx.strokeStyle = colorFor(n);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(S.x, S.y, r, 0, 7);
      ctx.fillStyle = colorFor(n);
      ctx.fill();
      // contorno discreto para separar de arestas
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(10,12,18,.55)";
      ctx.stroke();
    }
    if (state.plan && state.plan.includes(n.name)) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(S.x, S.y, r + 6, 0, 7);
      ctx.strokeStyle = "rgba(160,120,255,.95)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    if (state.team && state.team.includes(n.name)) {
      ctx.beginPath();
      ctx.arc(S.x, S.y, r + 3, 0, 7);
      ctx.strokeStyle = "rgba(255,196,92,.9)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    if (isSel || isHover) {
      ctx.beginPath();
      ctx.arc(S.x, S.y, r + (isSel ? 4.5 : 3), 0, 7);
      ctx.strokeStyle = isSel ? "#ffffff" : "rgba(255,255,255,.65)";
      ctx.lineWidth = isSel ? 2 : 1.2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const showLabel = labelsMode === "all" ||
      (layout.mode === "lineage" && labelsMode !== "none" && layout.nodes.length <= 90) ||
      (labelsMode === "auto" && (k > labelK || isSel || isHover)) ||
      (labelsMode === "near" && activeSet && inSet) ||
      isSel || isHover;
    if (showLabel) {
      ctx.font = `${clamp(10 * Math.pow(k, .32), 9.5, 15)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const txt = n.name;
      const w = ctx.measureText(txt).width;
      const ty = S.y + r + 2.5;
      ctx.globalAlpha = dim < .6 ? .3 : .95;
      ctx.fillStyle = "rgba(9,11,17,.82)";
      roundRect(ctx, S.x - w / 2 - 3.5, ty - 1, w + 7, 13.5, 3);
      ctx.fill();
      ctx.fillStyle = isSel || isHover ? "#fff" : "#dfe6f2";
      ctx.fillText(txt, S.x, ty);
      ctx.globalAlpha = 1;
    }
    layout.screen.set(n.name, { x: S.x, y: S.y, r });
  });

  // ---------- faixas + cabeçalhos das colunas ----------
  if (layout.mode === "layers") {
    let topY = Infinity, botY = -Infinity, byGen = new Map();
    layout.nodes.forEach(n => {
      const p = layout.pos.get(n.name);
      if (!byGen.has(n.gen)) byGen.set(n.gen, []);
      byGen.get(n.gen).push(p);
      topY = Math.min(topY, p.y); botY = Math.max(botY, p.y);
    });
    // faixa de fundo por coluna
    const rMax = 22;
    byGen.forEach((ps, g) => {
      const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
      const A = toScreen({ x: x - 92, y: topY - 26 });
      const B = toScreen({ x: x + 92, y: botY + 40 });
      ctx.fillStyle = "rgba(255,255,255,.022)";
      roundRect(ctx, A.x, A.y, B.x - A.x, B.y - A.y, 14);
      ctx.fill();
    });
    // cabeçalhos fixos no topo da tela
    const cols = [];
    byGen.forEach((ps, g) => {
      const cx = toScreen({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: 0 }).x;
      cols.push({ g, cx });
    });
    cols.sort((a, b) => a.cx - b.cx);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 11px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    let lastRight = -1e9, row = 0;
    cols.forEach(({ g, cx }) => {
      if (cx < -60 || cx > viewW() + 60) return;
      const txt = (GEN_LABEL[g] || g).toUpperCase() + " · " + byGen.get(g).length;
      const w = ctx.measureText(txt).width;
      if (cx - w / 2 - 9 < lastRight + 5) return;
      lastRight = cx + w / 2 + 9;
      const y = 16;
      ctx.fillStyle = "rgba(14,18,26,.86)";
      roundRect(ctx, cx - w / 2 - 9, y - 9, w + 18, 18, 9);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.09)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(206,217,233,.9)";
      ctx.fillText(txt, cx, y + .5);
    });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function hexA(hex, a) {
  if (!hex || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function arrowHead(from, to, color) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 9;
  const tipX = to.x - Math.cos(ang) * 4;
  const tipY = to.y - Math.sin(ang) * 4;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - Math.cos(ang - .42) * size, tipY - Math.sin(ang - .42) * size);
  ctx.lineTo(tipX - Math.cos(ang + .42) * size, tipY - Math.sin(ang + .42) * size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function getCss(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#0d1017"; }

function schedule() {
  dirty = true;
  if (!raf) raf = requestAnimationFrame(() => { raf = null; if (dirty) { dirty = false; draw(); } });
}

/* ---------- foco de linhagem ---------- */
function computeLineage(n) {
  const set = new Set([n.name]);
  let q = [n];
  while (q.length) {
    const cur = q.shift();
    cur.inc.forEach(e => { if (!set.has(e.node.name)) { set.add(e.node.name); q.push(e.node); } });
  }
  q = [n];
  while (q.length) {
    const cur = q.shift();
    cur.out.forEach(e => { if (!set.has(e.node.name)) { set.add(e.node.name); q.push(e.node); } });
  }
  return set;
}

/* ============================================================
   PAINEL DE DETALHE
   ============================================================ */
function gScopeTier(by) { return by === "tier" || by === "gtier"; }

/* seletor de idioma no cabeçalho */
function initLangPicker() {
  const sel = document.getElementById("lang");
  if (!sel) return;
  sel.innerHTML = "";
  LANGS.forEach(l => {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.label;
    sel.appendChild(o);
  });
  sel.value = LANG;
  sel.onchange = () => setLang(sel.value);
}

/* redesenha tudo que está na tela depois de trocar o idioma */
function rerenderAll() {
  buildFilters();
  syncFilterUI();
  renderLegend();
  const ls3 = document.getElementById("list-sort");
  if (ls3) ls3.value = state.view.listSort || "name";
  applyFilters();
  buildList();
  if (state.selected && document.getElementById("detail").classList.contains("open")) {
    showDetail(state.selected, { nav: true });
  }
  if (document.getElementById("team")?.classList.contains("open") && typeof renderTeam === "function") renderTeam();
  if (document.getElementById("routes")?.classList.contains("open")) { rtDirty = true; renderRouteTabs(); renderRoutes(); }
  if (document.getElementById("compare")?.classList.contains("open")) renderCompare();
  const hmain = document.getElementById("hint-main");
  if (hmain) hmain.innerHTML = t("hint.canvas");
  if (typeof renderHome === "function") renderHome();
  updateTeamBadge();
  draw();
}

function showDetail(n, opts = {}) {
  if (typeof closeTeam === "function" && document.getElementById("team")?.classList.contains("open")) {
    closeTeam();
  }
  if (!opts.nav) {
    if (state.selected && state.selected.name !== n.name) {
      state.history.push(state.selected.name);
      if (state.history.length > 40) state.history.shift();
    }
    state.future = [];
  }
  state.selected = n;
  lineage = lineageOf(n.name);
  const p = $("#detail");
  p.classList.add("open");
  document.body.classList.add("detail-open");
  p.innerHTML = "";
  const head = el("div", "d-head");
  const title = el("div", "d-title");
  const nameRow = el("div", "d-name-row");
  if (n.img) {
    const ring = el("div", "d-portrait-ring");
    ring.style.background = `linear-gradient(160deg, ${ATTR_COLOR[n.attr]}66, transparent 65%)`;
    const im = el("img", "d-portrait");
    im.src = n.img;
    im.alt = n.name;
    im.style.borderColor = ATTR_COLOR[n.attr];
    ring.appendChild(im);
    nameRow.appendChild(ring);
  }
  nameRow.appendChild(el("h2", null, n.name));
  title.appendChild(nameRow);
  const sub = el("div", "d-sub");
  sub.appendChild(el("span", "tag", GEN_LABEL[n.gen] || n.gen));
  sub.appendChild(el("span", "tag", n.type || "—"));
  head.appendChild(title);
  title.appendChild(sub);
  const chips = el("div", "d-chips");
  const a = el("button", "chip attr", n.attr);
  a.style.borderColor = ATTR_COLOR[n.attr];
  a.style.color = ATTR_COLOR[n.attr];
  a.onclick = () => { state.filters.attrs = new Set([n.attr]); syncFilterUI(); applyFilters(); };
  chips.appendChild(a);
  chips.appendChild(el("span", "chip", t("detail.pers", { value: n.pers || "—" })));
  const rk = /none/i.test(n.rank) ? "—" : String(n.rank).replace(/^(\d+) or higher$/i, "$1+").replace(/ or higher/i, "+");
  chips.appendChild(el("span", "chip", t("detail.rank", { value: rk })));
  (n.traits || []).forEach(t => chips.appendChild(el("span", "chip soft", t)));
  head.appendChild(chips);
  // força calculada — duas escalas lado a lado
  if (n.tier) {
    const genName = GEN_LABEL[n.gen] || n.gen;
    const gc = (n.gcount || 1) > 1 ? genName + "s" : genName;
    const card = (label, tier, rk, total, pow, ut, tip) => {
      const c = el("div", "ds2");
      c.title = tip;
      c.appendChild(el("div", "ds2-h", label));
      const main = el("div", "ds2-main");
      const b = el("span", "ds2-badge", tier);
      b.style.background = TIER_COLOR[tier] + "22";
      b.style.color = TIER_COLOR[tier];
      b.style.borderColor = TIER_COLOR[tier] + "66";
      main.appendChild(b);
      const info = el("div", "ds2-info");
      info.appendChild(el("span", "ds2-rank", `#${rk}`));
      info.appendChild(el("span", "ds2-tot", t("detail.ofTotal", { total })));
      main.appendChild(info);
      c.appendChild(main);
      const bars = el("div", "ds2-bars");
      [[t("detail.powerP"), pow, "linear-gradient(90deg,#4a90e2,#8f6bff)"], [t("detail.powerU"), ut, "linear-gradient(90deg,#f2b544,#ff7a45)"]]
        .forEach(([lab, v, bg]) => {
          const row = el("div", "ds2-row");
          row.appendChild(el("span", "ds2-lab", lab));
          const tr = el("div", "dsbc-track");
          const fi = el("div", "dsbc-fill");
          fi.style.width = clamp(v || 0, 2, 100) + "%";
          fi.style.background = bg;
          tr.appendChild(fi);
          row.appendChild(tr);
          row.appendChild(el("span", "ds2-val", String(Math.round(v || 0))));
          bars.appendChild(row);
        });
      c.appendChild(bars);
      return c;
    };
    const grid = el("div", "d-strength2");
    grid.appendChild(card(t("detail.powerGen", { gen: genName }), n.gtier || n.tier, n.grk || 1, n.gcount || 1,
      n.gpow ?? n.pow, n.gut ?? n.ut, t("detail.powerGenTip")));
    grid.appendChild(card(t("detail.powerAbs", { total: DATA.nodes.length }), n.tier, n.rk, DATA.nodes.length,
      n.pow, n.ut, t("detail.powerAbsTip")));
    head.appendChild(grid);
  }
  if (n.desc) head.appendChild(el("p", "d-desc", n.desc));
  p.appendChild(head);

  setTimeout(() => {
    resize();
    if (state.view.layout === "lineage") { computeLayout(); fitToView(false, .6); }
    draw();
  }, 260);

  const close = el("button", "d-close", "×");
  close.title = t("detail.close");
  close.onclick = () => closeDetail();

  const hist = state.history || [];
  const fut = state.future || [];
  const back = el("button", "d-close d-back", "←");
  back.title = hist.length ? t("detail.backTo", { name: hist[hist.length - 1] }) : t("detail.noHistory");
  back.disabled = !hist.length;
  back.onclick = () => goBackDetail();

  const fwd = el("button", "d-close d-forward", "→");
  fwd.title = fut.length ? t("detail.fwdTo", { name: fut[fut.length - 1] }) : t("detail.noForward");
  fwd.disabled = !fut.length;
  fwd.onclick = () => goForwardDetail();

  p.appendChild(fwd);
  p.appendChild(back);
  p.appendChild(close);

  // stats
  const sec = el("section", "d-sec");
  sec.appendChild(el("h3", null, t("detail.stats")));
  if (!n.stats || !Object.keys(n.stats).length) {
    sec.appendChild(el("p", "muted", t("detail.noSheet")));
  }
  const bars = el("div", "bars");
  STATS.forEach(s => {
    const v = statVal(n, s);
    const pct = clamp((v / (MAX_STAT[s] || 1)) * 100, 1, 100);
    const row = el("div", "bar-row");
    row.appendChild(el("span", "bar-label", s));
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.width = pct + "%";
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "bar-val", fmt(v)));
    bars.appendChild(row);
  });
  sec.appendChild(bars);
  const bl = el("div", "d-note", `Casco (HP × (DEF+SPI)): ${fmt(Math.round(bulk(n)))}`);
  sec.appendChild(bl);
  p.appendChild(sec);

  // resistências
  const resSec = el("section", "d-sec");
  resSec.appendChild(el("h3", null, t("detail.weaknesses")));
  resSec.appendChild(el("p", "res-legend", t("detail.resLegend")));
  const weakEls = ELEMENTS.filter(e => (n.resE || {})[e] > 1);
  const strongEls = ELEMENTS.filter(e => (n.resE || {})[e] < 1 && (n.resE || {})[e] > 0);
  const nullEls = ELEMENTS.filter(e => (n.resE || {})[e] === 0);
  const weakAttrs = ["Vaccine", "Data", "Virus"].filter(a => (n.resA || {})[a] > 1);
  const strongAttrs = ["Vaccine", "Data", "Virus"].filter(a => (n.resA || {})[a] < 1);

  const line = (label, items, tone, colorOf) => {
    const row = el("div", "res-row");
    row.appendChild(el("span", "res-lab", label));
    const box = el("div", "res-chips");
    if (!items.length) box.appendChild(el("span", "res-none", "—"));
    items.forEach(it => {
      const t = el("span", "res-chip " + tone, it);
      if (colorOf) t.style.borderColor = (colorOf(it) || "#666") + "66";
      box.appendChild(t);
    });
    row.appendChild(box);
    return row;
  };
  resSec.appendChild(line(t("detail.weak"), weakEls, "w", e => EL_COLOR[e]));
  if (nullEls.length) resSec.appendChild(line(t("detail.immune"), nullEls, "n", e => EL_COLOR[e]));
  resSec.appendChild(line(t("detail.resists"), strongEls, "s", e => EL_COLOR[e]));
  resSec.appendChild(line(t("detail.attrRes"), [...weakAttrs.map(a => a + " ×1,5"), ...strongAttrs.map(a => a + " ×0,5")], weakAttrs.length ? "w" : "s"));

  // matriz dos 11 elementos
  const grid = el("div", "el-grid");
  ELEMENTS.forEach(e => {
    const v = (n.resE || {})[e];
    const cell = el("div", "el-cell");
    cell.style.setProperty("--c", EL_COLOR[e] || "#888");
    cell.dataset.k = v === undefined ? "u" : v > 1 ? "w" : v === 0 ? "n" : v < 1 ? "s" : "m";
    cell.appendChild(el("span", "el-name", e));
    const tag = v === undefined ? "?" : v > 1 ? `×${v}` : v === 0 ? "×0" : v < 1 ? `×${v}` : "—";
    const val = el("span", "el-val", tag);
    val.dataset.k = v === undefined ? "u" : v > 1 ? "w" : v === 0 ? "n" : v < 1 ? "s" : "m";
    cell.appendChild(val);
    grid.appendChild(cell);
  });
  resSec.appendChild(grid);
  p.appendChild(resSec);

  // evoluções
  const evoSec = el("section", "d-sec");
  evoSec.appendChild(el("h3", null, t("detail.evolvesToN", { n: n.out.length })));
  if (!n.out.length) evoSec.appendChild(el("p", "muted", t("detail.noEvolutions")));
  n.out.slice().sort(evoSort).forEach(e => evoSec.appendChild(evoRow(e)));
  p.appendChild(evoSec);

  const preSec = el("section", "d-sec");
  preSec.appendChild(el("h3", null, t("detail.comesFromN", { n: n.inc.length })));
  if (!n.inc.length) preSec.appendChild(el("p", "muted", t("detail.noPre")));
  n.inc.slice().sort(evoSort).forEach(e => preSec.appendChild(evoRow(e, true)));
  p.appendChild(preSec);

  // skills
  const sk = el("section", "d-sec");
  sk.appendChild(el("h3", null, t("detail.specials")));
  (n.special || []).forEach(s => sk.appendChild(skillRow(s)));
  const sk2 = el("h3", null, t("detail.learnable"));
  sk.appendChild(sk2);
  (n.skills || []).forEach(s => sk.appendChild(skillRow(s)));
  if (!(n.skills || []).length && !(n.special || []).length) sk.appendChild(el("p", "muted", t("detail.noSkills")));
  p.appendChild(sk);

  // ações
  const acts = el("div", "d-actions");
  const bcmp = el("button", "btn", t("detail.compare"));
  bcmp.onclick = () => openCompare(n.name, null);
  acts.appendChild(bcmp);
  const bt = el("button", "btn" + (state.team.includes(n.name) ? " on" : ""),
    state.team.includes(n.name) ? t("detail.inTeam") : t("detail.addTeam"));
  bt.onclick = () => { toggleTeam(n.name); };
  acts.appendChild(bt);
  const b1 = el("button", "btn", t("detail.center"));
  b1.onclick = () => { if (state.view.layout !== "lineage") { centerOn(n.name); } else { centerOn(n.name); } };
  acts.appendChild(b1);
  const b2 = el("button", "btn", t("detail.isolate"));
  b2.onclick = () => {
    state.view.layout = "lineage";
    $("#view-layout").value = "lineage";
    computeLayout(); fitToView(); draw();
  };
  acts.appendChild(b2);
  p.appendChild(acts);

  history.replaceState(null, "", `#/d/${n.slug}`);
  if (state.view.layout === "lineage") { computeLayout(); fitToView(false, .6); }
  draw();
}

function evoSort(a, b) {
  return (GEN_ORDER.indexOf(a.node.gen) - GEN_ORDER.indexOf(b.node.gen)) ||
    a.node.name.localeCompare(b.node.name);
}

function evoRow(e, reverse) {
  const n = e.node;
  const row = el("button", "evo");
  if (n.img) {
    const th = el("img", "evo-thumb");
    th.src = n.img;
    th.alt = "";
    row.appendChild(th);
  } else {
    const dot = el("span", "dot");
    dot.style.background = ATTR_COLOR[n.attr];
    row.appendChild(dot);
  }
  const name = el("span", "evo-name", n.name);
  row.appendChild(name);
  row.appendChild(el("span", "evo-gen", GEN_LABEL[n.gen] || n.gen));
  const reqs = [];
  if (e.req?.rank) reqs.push(`Rank ${e.req.rank}`);
  Object.entries(e.req?.stats || {}).forEach(([k, v]) => reqs.push(`${v} ${k}`));
  (e.req?.other || []).forEach(o => { if (/mode change/i.test(o)) reqs.push("Mode Change"); });
  if (reqs.length) row.appendChild(el("span", "evo-req", reqs.join(" · ")));
  row.onclick = () => { openNodeBySlug(n.slug); };
  return row;
}

function skillRow(s) {
  const d = el("div", "skill");
  const top = el("div", "skill-top");
  if (s.lv) top.appendChild(el("span", "lv", `Lv.${s.lv}`));
  if (s.el && s.el !== "No Element") {
    const e = el("span", "el", s.el);
    e.style.color = EL_COLOR[s.el] || "var(--muted)";
    e.style.borderColor = (EL_COLOR[s.el] || "#666") + "55";
    top.appendChild(e);
  }
  top.appendChild(el("span", "skill-name", s.name));
  if (s.sp) top.appendChild(el("span", "sp", `${s.sp} SP`));
  if (s.kind) top.appendChild(el("span", "kind", s.kind));
  d.appendChild(top);
  const eff = (s.eff || "").replace(/\*\*/g, "");
  if (eff) d.appendChild(el("p", "skill-eff", eff));
  return d;
}

function stepDetail(dir) {
  const from = dir < 0 ? state.history : state.future;
  const to = dir < 0 ? state.future : state.history;
  if (!from || !from.length) return;
  const nm = from.pop();
  const n = byName.get(nm);
  if (!n) return;
  if (state.selected) to.push(state.selected.name);
  showDetail(n, { nav: true });
  centerOn(n.name, Math.max(state.cam.k, 0.9));
}

function goBackDetail() { stepDetail(-1); }
function goForwardDetail() { stepDetail(1); }

function closeDetail() {
  state.selected = null;
  lineage = new Set();
  $("#detail").classList.remove("open");
  document.body.classList.remove("detail-open");
  if (location.hash.startsWith("#/d/")) history.replaceState(null, "", "#/");
  setTimeout(() => { resize(); fitToView(true); draw(); }, 260);
  draw();
}

/* ============================================================
   LISTA LATERAL
   ============================================================ */
function buildList() {
  const wrap = $("#list");
  wrap.innerHTML = "";
  const items = DATA.nodes.filter(n => state.visible.has(n.name));
  const groups = new Map();
  items.forEach(n => {
    if (!groups.has(n.gen)) groups.set(n.gen, []);
    groups.get(n.gen).push(n);
  });
  const sortMode = state.view.listSort || "name";
  const lc = document.getElementById("list-count");
  if (lc) lc.textContent = `${items.length} Digimon`;

  const row = n => {
    const b = el("button", "list-item");
    if (n.img) {
      const th = el("img", "list-thumb");
      th.src = n.img;
      th.alt = "";
      th.loading = "lazy";
      b.appendChild(th);
    }
    const dot = el("span", "dot");
    dot.style.background = ATTR_COLOR[n.attr];
    b.appendChild(dot);
    b.appendChild(el("span", null, n.name));
    const scopeGen = state.filters.tierScope !== "all";
    if (sortMode !== "name" && n.rk) b.appendChild(el("span", "list-rank", `#${n.rk}`));
    const shownTier = scopeGen ? (n.gtier || n.tier) : n.tier;
    const tb = el("span", "list-tier", shownTier || "");
    tb.style.color = TIER_COLOR[shownTier] || "var(--muted)";
    tb.title = scopeGen
      ? t("list.tierTipGen", { tier: shownTier, count: n.gcount, gen: GEN_LABEL[n.gen] || n.gen, rk: n.grk, rtier: n.tier, rrk: n.rk })
      : t("list.tierTipRoster", { tier: n.tier, rk: n.rk, gtier: n.gtier, grk: n.grk });
    b.appendChild(tb);
    b.onclick = () => { openNodeBySlug(n.slug); centerOn(n.name, Math.max(state.cam.k, 0.9)); };
    b.onmouseenter = () => { state.hover = n.name; schedule(); };
    b.onmouseleave = () => { state.hover = null; schedule(); };
    return b;
  };

  if (sortMode === "name") {
    const groups = new Map();
    items.forEach(n => {
      if (!groups.has(n.gen)) groups.set(n.gen, []);
      groups.get(n.gen).push(n);
    });
    GEN_ORDER.forEach(g => {
      const arr = groups.get(g);
      if (!arr) return;
      arr.sort((a, b) => a.name.localeCompare(b.name));
      const h = el("div", "list-gen");
      h.innerHTML = `<span>${GEN_LABEL[g]}</span><em>${arr.length}</em>`;
      wrap.appendChild(h);
      arr.forEach(n => wrap.appendChild(row(n)));
    });
  } else {
    const arr = items.slice();
    if (sortMode === "power") arr.sort((a, b) => (a.rk || 999) - (b.rk || 999));
    else arr.sort((a, b) => (TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)) || ((a.rk || 999) - (b.rk || 999)));
    arr.forEach(n => wrap.appendChild(row(n)));
  }
  if (!items.length) wrap.appendChild(el("p", "muted pad", t("filters.emptyT") + "."));
}

/* ============================================================
   CONTROLES
   ============================================================ */
function soloToggle(set, value, all, ev) {
  const additive = ev && (ev.shiftKey || ev.metaKey || ev.altKey);
  const full = set.size >= all.length;
  if (additive) {
    set.has(value) ? set.delete(value) : set.add(value);
    if (!set.size) all.forEach(x => set.add(x));
  } else if (full) {
    // tudo marcado -> isola este
    set.clear();
    set.add(value);
  } else if (set.has(value)) {
    // já marcado -> desmarca; se era o último, volta a todos
    set.delete(value);
    if (!set.size) all.forEach(x => set.add(x));
  } else {
    // não marcado -> soma (permite múltiplos com clique simples)
    set.add(value);
  }
}

let suggestIdx = -1;
function renderSuggest(q) {
  const box = $("#suggest");
  const v = String(q || "").trim().toLowerCase();
  if (!v) { box.innerHTML = ""; box.style.display = "none"; return; }
  const items = DATA.nodes
    .filter(n => n.name.toLowerCase().includes(v))
    .sort((a, b) =>
      (b.name.toLowerCase().startsWith(v) - a.name.toLowerCase().startsWith(v)) ||
      a.name.localeCompare(b.name))
    .slice(0, 8);
  box.innerHTML = "";
  if (!items.length) {
    box.appendChild(el("div", "sg-empty", t("search.noName")));
  } else {
    items.forEach(n => {
      const b = el("button", "sg-item");
      if (n.img) { const im = el("img", "sg-img"); im.src = n.img; im.alt = ""; b.appendChild(im); }
      const wrap = el("span", "sg-txt");
      wrap.appendChild(el("span", "sg-name", n.name));
      wrap.appendChild(el("span", "sg-meta", `${GEN_LABEL[n.gen] || n.gen} · ${n.attr}`));
      b.appendChild(wrap);
      b.onclick = () => {
        box.style.display = "none";
        $("#search").value = "";
        openNodeBySlug(n.slug);
      };
      box.appendChild(b);
    });
  }
  suggestIdx = -1;
  box.style.display = "block";
}

function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

function chipToggle(container, label, on, color, cb) {
  const b = el("button", "fchip" + (on ? " on" : ""), label);
  if (color) { b.style.setProperty("--c", color); b.dataset.attr = label; }
  b.onclick = ev => { cb(!on, ev); applyFilters(); };
  container.appendChild(b);
  return b;
}

function buildFilters() {
  // os chips são recriados a cada troca de idioma: limpar antes evita duplicar
  ["#f-attrs", "#f-gens", "#f-tiers", "#f-pers", "#f-rank", "#f-stats"].forEach(id => {
    const box = $(id);
    if (box) box.innerHTML = "";
  });

  const attrs = $("#f-attrs");
  ATTRS.forEach(a => chipToggle(attrs, a, true, ATTR_COLOR[a], (on, ev) => {
    soloToggle(state.filters.attrs, a, ATTRS, ev);
  }));

  const gens = $("#f-gens");
  GEN_ORDER.forEach(g => chipToggle(gens, GEN_LABEL[g], true, null, (on, ev) => {
    soloToggle(state.filters.gens, g, GEN_ORDER, ev);
  }));

  const tiers = $("#f-tiers");
  if (tiers) TIERS.forEach(t => chipToggle(tiers, t, false, TIER_COLOR[t], on => {
    on ? state.filters.tiers.add(t) : state.filters.tiers.delete(t);
  }));
  document.querySelectorAll("#tier-scope button").forEach(b => {
    b.onclick = () => { state.filters.tierScope = b.dataset.scope; syncFilterUI(); applyFilters(); };
  });

  const pers = $("#f-pers");
  PERS.forEach(p => chipToggle(pers, p, false, null, on => {
    on ? state.filters.pers.add(p) : state.filters.pers.delete(p);
  }));

  const rank = $("#f-rank");
  RANKS.forEach(r => {
    const o = el("option", null, /none/i.test(r) ? t("detail.notRequired") : r.replace(" or higher", "+"));
    o.value = rankNum(r);
    rank.appendChild(o);
  });
  rank.value = String(state.filters.rankMin || 0);
  rank.onchange = () => { state.filters.rankMin = +rank.value; applyFilters(); };

  const stats = $("#f-stats");
  STATS.forEach(s => {
    const row = el("div", "range-row");
    row.appendChild(el("label", null, s));
    const inp = el("input");
    const cur = (state.filters.stats && state.filters.stats[s]) || 0;
    inp.type = "range"; inp.min = 0; inp.max = MAX_STAT[s]; inp.step = 50; inp.value = cur;
    const fmtN = v => Number(v).toLocaleString(LANG === "pt" ? "pt-BR" : "en-US");
    const out = el("span", "range-val", fmtN(cur));
    inp.oninput = () => {
      out.textContent = fmtN(+inp.value);
      state.filters.stats[s] = +inp.value;
      applyFilters();
    };
    row.appendChild(inp);
    row.appendChild(out);
    stats.appendChild(row);
  });

  const ec = document.getElementById("empty-clear");
  if (ec) ec.onclick = () => clearFilters();
  $("#f-q").oninput = e => { state.filters.q = e.target.value; applyFilters(); };
  $("#f-linked").onchange = e => { state.filters.onlyLinked = e.target.checked; applyFilters(); };

  $("#clear").onclick = () => clearFilters();

  // vista
  $("#view-color").onchange = e => { state.view.colorBy = e.target.value; renderLegend(); draw(); saveState(); };
  $("#view-size").onchange = e => { state.view.sizeBy = e.target.value; draw(); saveState(); };
  $("#view-labels").onchange = e => { state.view.labels = e.target.value; draw(); saveState(); };
  $("#view-edges").onchange = e => { state.view.edges = e.target.value; computeLayout(); draw(); saveState(); };
  $("#view-icons").onchange = e => { state.view.icons = e.target.value; draw(); saveState(); };
  const ls = document.getElementById("list-sort");
  if (ls) ls.onchange = e => { state.view.listSort = e.target.value; buildList(); saveState(); };
  $("#view-layout").onchange = e => {
    state.view.layout = e.target.value;
    if (e.target.value === "lineage" && !state.selected) {
      const first = DATA.nodes.find(n => n.out.length > 2) || DATA.nodes[0];
      state.selected = first; lineage = lineageOf(first.name);
    }
    if (e.target.value === "force") { computeLayout(true); fitToView(false); }
    else { computeLayout(); 
      if (e.target.value === "lineage" && state.selected) fitToView(false, .6);
      else fitToView(false); }
    draw();
  };
  $("#view-focus").onchange = e => { state.view.focus = e.target.checked; draw(); saveState(); };
}

function clearFilters() {
  state.filters.attrs = new Set(ATTRS);
  state.filters.gens = new Set(GEN_ORDER);
  state.filters.tiers = new Set();
  state.filters.tierScope = "gen";
  state.filters.pers = new Set();
  state.filters.rankMin = 0;
  state.filters.stats = {};
  state.filters.q = "";
  state.filters.onlyLinked = false;
  const d = document.getElementById("stats-details"); if (d) d.open = false;
  syncFilterUI();
  applyFilters();
}

function syncFilterUI() {
  const f = state.filters;
  document.querySelectorAll("#f-attrs .fchip").forEach(b => {
    b.classList.toggle("on", f.attrs.has(b.textContent.trim()));
  });
  document.querySelectorAll("#f-gens .fchip").forEach(b => {
    const g = GEN_ORDER.find(x => GEN_LABEL[x] === b.textContent.trim());
    b.classList.toggle("on", f.gens.has(g));
  });
  document.querySelectorAll("#f-tiers .fchip").forEach(b => {
    b.classList.toggle("on", !!(state.filters.tiers && state.filters.tiers.has(b.textContent.trim().replace(/\s.*$/, ""))));
  });
  document.querySelectorAll("#tier-scope button").forEach(b => {
    b.classList.toggle("on", (b.dataset.scope || "gen") === (state.filters.tierScope || "gen"));
  });
  document.querySelectorAll("#f-pers .fchip").forEach(b => {
    b.classList.toggle("on", f.pers.has(b.textContent.trim()));
  });
  if (+$("#f-rank").value !== +f.rankMin) $("#f-rank").value = f.rankMin;
  document.querySelectorAll("#f-stats input[type=range]").forEach((inp, i) => {
    inp.value = f.stats[STATS[i]] || 0;
    inp.nextSibling.textContent = inp.value;
  });
  if ($("#f-q").value !== f.q) $("#f-q").value = f.q;
  $("#f-linked").checked = f.onlyLinked;
}

function renderLegend() {
  const box = $("#legend");
  box.innerHTML = "";
  const by = state.view.colorBy;
  if (by === "attr") {
    ATTRS.forEach(a => {
      const i = el("button", "leg");
      i.title = t("chip.filterAttr", { attr: a });
      const d = el("span", "dot");
      d.style.background = ATTR_COLOR[a];
      i.appendChild(d);
      i.appendChild(el("span", null, a));
      i.onclick = () => {
        const only = state.filters.attrs.size === 1 && state.filters.attrs.has(a);
        state.filters.attrs = only ? new Set(ATTRS) : new Set([a]);
        syncFilterUI(); applyFilters();
      };
      box.appendChild(i);
    });
  } else if (by === "tier" || by === "gtier") {
    const gScope = by === "gtier";
    box.appendChild(el("div", "leg-cap", gScope ? t("view.legendTierGen") : t("view.legendTierRoster")));
    TIERS.forEach(t => {
      const i = el("button", "leg");
      i.title = `filtrar tier ${t}`;
      const d = el("span", "dot");
      d.style.background = TIER_COLOR[t];
      i.appendChild(d);
      i.appendChild(el("span", null, t));
      i.onclick = () => {
        const only = state.filters.tiers.size === 1 && state.filters.tiers.has(t);
        state.filters.tiers = only ? new Set() : new Set([t]);
        state.filters.tierScope = gScope ? "gen" : "all";
        syncFilterUI(); applyFilters();
      };
      box.appendChild(i);
    });
  } else {
    const lab = by === "gen" ? t("view.legendGen") : by === "pers" ? t("view.legendPers")
      : by === "power" ? t("view.legendPower") : by === "gpower" ? t("view.legendPowerGen")
      : gScopeTier(by) ? "" : t("view.legendRange", { by });
    box.appendChild(el("div", "leg-cap", lab));
    const grad = el("div", "leg-grad");
    box.appendChild(grad);
  }
}

/* ============================================================
   INTERAÇÃO NO CANVAS
   ============================================================ */
function hitTest(x, y) {
  let best = null, bestD = Infinity;
  layout.screen.forEach((s, name) => {
    const d = Math.hypot(s.x - x, s.y - y);
    const lim = Math.max(s.r + 5, 11);
    if (d < lim && d < bestD) { bestD = d; best = name; }
  });
  return best ? byName.get(best) : null;
}

function initCanvasEvents() {
  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.offsetX, y: e.offsetY, cx: state.cam.x, cy: state.cam.y, moved: false };
  });
  canvas.addEventListener("pointermove", e => {
    const mx = e.offsetX, my = e.offsetY;
    if (drag) {
      const dx = mx - drag.x, dy = my - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      state.cam.x = drag.cx + dx;
      state.cam.y = drag.cy + dy;
      draw();
      return;
    }
    const n = hitTest(mx, my);
    const prev = state.hover;
    state.hover = n ? n.name : null;
    canvas.style.cursor = n ? "pointer" : "grab";
    if (prev !== state.hover) schedule();
    const tip = $("#tip");
    if (n) {
      tip.style.display = "block";
      tip.style.left = Math.min(viewW() - 210, mx + 14) + "px";
      tip.style.top = Math.min(viewH() - 110, my + 12) + "px";
      tip.innerHTML = `${n.img ? `<img class="tip-img" src="${n.img}" alt="" style="box-shadow:0 0 0 1.5px ${ATTR_COLOR[n.attr]}">` : ""}<strong>${n.name}</strong><span>${t("tip.genTier", { gen: GEN_LABEL[n.gen] || n.gen, attr: n.attr, tier: n.gtier || n.tier })}</span>
        <span class="tiprank">${t("tip.rank", { rk: n.grk || 1, count: n.gcount || 1, gen: GEN_LABEL[n.gen] || n.gen, rrk: n.rk })}</span>
        <span class="tipstats">HP ${fmt(statVal(n, "HP"))} · DEF ${fmt(statVal(n, "DEF"))} · SPI ${fmt(statVal(n, "SPI"))}</span>`;
    } else tip.style.display = "none";
  });
  canvas.addEventListener("pointerup", e => {
    const wasDrag = drag && drag.moved;
    drag = null;
    if (wasDrag) return;
    const n = hitTest(e.offsetX, e.offsetY);
    if (n) {
      if (state.selected && state.selected.name === n.name) return;
      showDetail(n);
    } else {
      closeDetail();
    }
  });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0016);
    const wx = toWorld(e.offsetX, e.offsetY);
    const k = clamp(state.cam.k * factor, 0.05, 5);
    state.cam.k = k;
    state.cam.x = e.offsetX - wx.x * k;
    state.cam.y = e.offsetY - wx.y * k;
    draw();
  }, { passive: false });
  canvas.addEventListener("dblclick", e => {
    const n = hitTest(e.offsetX, e.offsetY);
    if (n) centerOn(n.name, Math.max(state.cam.k * 1.6, 1));
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") closeDetail();
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#f-q").focus(); }
    if (e.key === "+" || e.key === "=") { state.cam.k = clamp(state.cam.k * 1.2, .05, 5); draw(); }
    if (e.key === "-") { state.cam.k = clamp(state.cam.k / 1.2, .05, 5); draw(); }
    if (e.key === "0") { fitToView(); draw(); }
    if ((e.key === "r" || e.key === "R") && document.activeElement.tagName !== "INPUT") {
      toggleRoutes();
    }
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      goBackDetail();
      return;
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      goForwardDetail();
      return;
    }
    if ((e.key === "c" || e.key === "C") && document.activeElement.tagName !== "INPUT") {
      toggleCompare();
    }
    if (e.key === "Escape" && document.getElementById("routes")?.classList.contains("open")) {
      closeRoutes();
    }
    if (e.key === "Escape" && document.getElementById("compare")?.classList.contains("open")) {
      closeCompare();
    }
    if ((e.key === "t" || e.key === "T") && document.activeElement.tagName !== "INPUT") {
      if (state.selected) toggleTeam(state.selected.name);
    }
  });
}

/* ============================================================
   ROTEAMENTO
   ============================================================ */
function openNodeBySlug(slug) {
  const n = DATA.nodes.find(x => x.slug === slug);
  if (!n) return;
  if (!state.visible.has(n.name)) {
    state.filters.attrs = new Set(ATTRS);
    state.filters.gens = new Set(GEN_ORDER);
    state.filters.pers = new Set();
    state.filters.rankMin = 0;
    state.filters.stats = {};
    state.filters.q = "";
    syncFilterUI();
    state.visible = new Set(DATA.nodes.map(x => x.name));
    computeLayout();
  }
  showDetail(n);
  if (state.view.layout !== "lineage" && layout.pos.get(n.name)) centerOn(n.name, Math.max(state.cam.k, 0.75));
}

function route() {
  const h = location.hash || "#/";
  const m = /^#\/d\/(.+)$/.exec(h);
  if (m) openNodeBySlug(m[1]);
}

/* ============================================================
   PERSISTÊNCIA
   ============================================================ */
const LS_KEY = "dsts-graph-v1";
function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      attrs: [...state.filters.attrs], gens: [...state.filters.gens], tiers: [...(state.filters.tiers || [])],
      tierScope: state.filters.tierScope, pers: [...state.filters.pers],
      rankMin: state.filters.rankMin, stats: state.filters.stats, q: state.filters.q,
      onlyLinked: state.filters.onlyLinked, view: state.view, team: state.team, plan: state.plan || []
    }));
  } catch (e) { }
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.attrs) state.filters.attrs = new Set(s.attrs);
    if (s.gens) state.filters.gens = new Set(s.gens);
    if (s.tiers) state.filters.tiers = new Set(s.tiers);
    if (s.tierScope) state.filters.tierScope = s.tierScope;
    if (s.pers) state.filters.pers = new Set(s.pers);
    state.filters.rankMin = s.rankMin || 0;
    state.filters.stats = s.stats || {};
    state.filters.q = s.q || "";
    state.filters.onlyLinked = !!s.onlyLinked;
    if (s.view) Object.assign(state.view, s.view);
    if (Array.isArray(s.team)) state.team = s.team.slice(0, TEAM_MAX);
    if (Array.isArray(s.plan)) state.plan = s.plan;
  } catch (e) { }
}

/* ============================================================
   BOOT
   ============================================================ */
window.addEventListener("DOMContentLoaded", async () => {
  document.documentElement.style.setProperty("--bg", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0d1017");
  loadState();
  initLang();
  initLangPicker();
  applyI18n();
  const hmain = document.getElementById("hint-main");
  if (hmain) hmain.innerHTML = t("hint.canvas");
  initCanvas();
  initCanvasEvents();
  buildFilters();
  // refletir estado salvo nos controles
  $("#view-color").value = state.view.colorBy;
  $("#view-size").value = state.view.sizeBy;
  $("#view-labels").value = state.view.labels;
  $("#view-edges").value = state.view.edges;
  $("#view-icons").value = state.view.icons;
  const ls2 = document.getElementById("list-sort");
  if (ls2) ls2.value = state.view.listSort || "name";
  $("#view-layout").value = state.view.layout;
  $("#view-focus").checked = state.view.focus;
  syncFilterUI();
  renderLegend();
  const hint = document.getElementById("hint");
  if (hint && !hint.dataset.ext) {
    hint.dataset.ext = "1";
    hint.innerHTML += ' · <span class="hint-extra">' + t("hint.extra") + '</span>';
  }
  applyFilters();
  buildList();
  loadIcons();
  requestAnimationFrame(() => {
    resize();
    computeLayout();
    fitToView(true);
    draw();
    if (typeof initOnboarding === "function") initOnboarding();
  });


  // painéis
  $("#toggle-filters").onclick = () => document.body.classList.toggle("filters-open");
  const rb = document.getElementById("toggle-routes");
  if (rb) rb.onclick = () => toggleRoutes();
  const rc = document.getElementById("rt-close");
  if (rc) rc.onclick = () => closeRoutes();
  const rh = document.getElementById("rt-help-btn");
  if (rh) rh.onclick = () => openRouteHelp();
  const cb = document.getElementById("toggle-compare");
  if (cb) cb.onclick = () => toggleCompare();
  const cc = document.getElementById("cmp-close");
  if (cc) cc.onclick = () => closeCompare();
  const tb = document.getElementById("toggle-team");
  if (tb) tb.onclick = () => toggleTeamPanel();
  const tc = document.getElementById("team-close");
  if (tc) tc.onclick = () => closeTeam();
  updateTeamBadge();
  $("#toggle-list").onclick = () => document.body.classList.toggle("list-open");
  $("#zoom-in").onclick = () => { state.cam.k = clamp(state.cam.k * 1.25, .05, 5); draw(); };
  $("#zoom-out").onclick = () => { state.cam.k = clamp(state.cam.k / 1.25, .05, 5); draw(); };
  $("#fit").onclick = () => { fitToView(false); draw(); };

  window.addEventListener("hashchange", route);
  route();

  $("#search").oninput = (e) => {
    const v = e.target.value.trim();
    if (!v) return;
    const hit = DATA.nodes.find(n => n.name.toLowerCase() === v.toLowerCase())
      || DATA.nodes.find(n => n.name.toLowerCase().startsWith(v.toLowerCase()));
    if (hit) { $("#suggest").style.display = "none"; openNodeBySlug(hit.slug); }
  };
  $("#search").onfocus = () => renderSuggest($("#search").value);
  $("#search").oninput = e => renderSuggest(e.target.value);
  $("#search").onkeydown = e => {
    const items = [...document.querySelectorAll("#suggest .sg-item")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      suggestIdx = (suggestIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((b, i) => b.classList.toggle("sel", i === suggestIdx));
      items[suggestIdx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const pick = items[suggestIdx] || items[0];
      if (pick) { pick.click(); e.preventDefault(); }
    } else if (e.key === "Escape") {
      $("#suggest").style.display = "none";
    }
  };
  $("#search").onblur = () => setTimeout(() => $("#suggest").style.display = "none", 150);

  $("#suggest").innerHTML = "";
  if (window.innerWidth > 900) document.body.classList.add("filters-open");
  else document.getElementById("toggle-filters").classList.remove("on");
  const cd = document.getElementById("close-drawer");
  if (cd) cd.onclick = () => {
    document.body.classList.remove("filters-open");
    document.getElementById("toggle-filters").classList.remove("on");
  };
});
