/* ============================================================
   Digimon Story: Time Stranger — Grafo de Digivoluções
   Motor: layout em camadas + foco de linhagem + filtros
   ============================================================ */
const DATA = __DATA__;

const GEN_ORDER = ["In-Training I", "In-Training II", "Rookie", "Armor", "Champion", "Hybrid", "Ultimate", "Mega", "Mega+"];
const LAYOUT_GEN = ["In-Training I", "In-Training II", "Rookie", "Champion", "Ultimate", "Mega", "Mega+", "Armor", "Hybrid"];
const GEN_LABEL = {
  "In-Training I": "Bebê I", "In-Training II": "Bebê II", "Rookie": "Rookie",
  "Armor": "Armor", "Champion": "Champion", "Hybrid": "Hybrid",
  "Ultimate": "Ultimate", "Mega": "Mega", "Mega+": "Mega+"
};
const ATTRS = ["Data", "Vaccine", "Virus", "Free", "Variable", "Unknown", "No Data"];
const ATTR_COLOR = {
  "Data": "#4aa3df", "Vaccine": "#4fb968", "Virus": "#d9544d", "Free": "#9aa0a6",
  "Variable": "#b07cc6", "Unknown": "#d8a93a", "No Data": "#6b7a8f"
};
const STATS = ["HP", "SP", "ATK", "DEF", "INT", "SPI", "SPD"];
const TEAM_MAX = 3;
// personalidades base realmente presentes nos dados (evita chip que não filtra nada)
const PERS = [...new Set(DATA.nodes.map(n => n.pers).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/* ---------- índices ---------- */
const byName = new Map();
DATA.nodes.forEach(n => {
  n.slug = n.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  n.out = []; n.inc = [];
  n.search = [n.name, n.type || "", n.attr, n.gen, n.pers || "", (n.traits || []).join(" "),
    (n.skills || []).map(s => s.name + " " + (s.eff || "")).join(" "),
    (n.special || []).map(s => s.name + " " + (s.eff || "")).join(" ")].join(" ").toLowerCase();
  byName.set(n.name, n);
});
DATA.edges.forEach(e => {
  const a = byName.get(e.s), b = byName.get(e.t);
  if (!a || !b) return;
  a.out.push({ node: b, req: e.req });
  b.inc.push({ node: a, req: e.req });
});
const MAX_STAT = {};
STATS.forEach(s => MAX_STAT[s] = Math.max(...DATA.nodes.map(n => (n.stats && n.stats[s]) || 0)));
const RANKS = [...new Map(DATA.nodes.map(n => [rankNum(n.rank), n.rank])).values()]
  .sort((a, b) => rankNum(a) - rankNum(b));
function rankNum(r) { if (!r || /none/i.test(r)) return 0; const m = /(\d+)/.exec(r); return m ? +m[1] : 0; }

/* ---------- estado ---------- */
const state = {
  filters: { attrs: new Set(ATTRS), gens: new Set(GEN_ORDER), tiers: new Set(), tierScope: "gen", pers: new Set(), rankMin: 0, stats: {}, q: "", onlyLinked: false },
  team: [],
  plan: [],
  history: [],
  future: [],
  view: { colorBy: "attr", sizeBy: "fixed", labels: "auto", edges: "lineage", icons: "auto", layout: "layers", focus: true, listSort: "name" },
  selected: null,
  hover: null,
  cam: { x: 0, y: 0, k: 1 },
  visible: new Set()
};

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const d = document.createElement(tag); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; };
const fmt = v => (v == null ? "—" : v.toLocaleString("pt-BR"));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function statVal(n, s) { return (n.stats && n.stats[s]) || 0; }
function bulk(n) { return statVal(n, "HP") * (statVal(n, "DEF") + statVal(n, "SPI")); }

/* cache de linhagem (ancestrais + descendentes) */
const LINEAGE_CACHE = new Map();
function lineageOf(name) {
  if (LINEAGE_CACHE.has(name)) return LINEAGE_CACHE.get(name);
  const n = byName.get(name);
  const set = new Set([name]);
  if (n) {
    let q = [n];
    while (q.length) { const c = q.shift(); c.inc.forEach(e => { if (!set.has(e.node.name)) { set.add(e.node.name); q.push(e.node); } }); }
    q = [n];
    while (q.length) { const c = q.shift(); c.out.forEach(e => { if (!set.has(e.node.name)) { set.add(e.node.name); q.push(e.node); } }); }
  }
  LINEAGE_CACHE.set(name, set);
  return set;
}

/* ============================================================
   LAYOUT
   ============================================================ */
let layout = { nodes: [], edges: [], bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, mode: "layers" };

function layeredLayout(nodeList, edgeList) {
  const cols = new Map(LAYOUT_GEN.map((g, i) => [g, i]));
  const groups = new Map(LAYOUT_GEN.map(g => [g, []]));
  nodeList.forEach(n => groups.get(n.gen) && groups.get(n.gen).push(n));

  // ordem inicial: por bulk desc (tanques no topo) e nome
  groups.forEach(arr => arr.sort((a, b) => bulk(b) - bulk(a) || a.name.localeCompare(b.name)));

  const adj = new Map();
  nodeList.forEach(n => adj.set(n.name, []));
  edgeList.forEach(e => { adj.get(e.s)?.push(e.t); adj.get(e.t)?.push(e.s); });

  const rowOf = new Map();
  const recomputeRows = () => {
    let y = 0;
    LAYOUT_GEN.forEach(g => {
      (groups.get(g) || []).forEach((n, i) => rowOf.set(n.name, i));
    });
  };
  recomputeRows();

  const rowOrder = LAYOUT_GEN.filter(g => (groups.get(g) || []).length);
  for (let pass = 0; pass < 6; pass++) {
    const order = pass % 2 ? [...rowOrder].reverse() : rowOrder;
    order.forEach(g => {
      const arr = groups.get(g);
      if (!arr || arr.length < 2) return;
      arr.forEach(n => {
        const peers = adj.get(n.name).filter(x => rowOf.has(x) && byName.get(x).gen !== g);
        n._bc = peers.length ? peers.reduce((s, x) => s + rowOf.get(x), 0) / peers.length : rowOf.get(n.name);
      });
      arr.sort((a, b) => a._bc - b._bc || a.name.localeCompare(b.name));
      arr.forEach((n, i) => rowOf.set(n.name, i));
    });
  }

  const colX = new Map();
  const colW = 230;
  rowOrder.forEach((g, i) => colX.set(g, i * colW));
  const pos = new Map();
  const rowH = 26;
  nodeList.forEach(n => {
    const x = colX.get(n.gen) ?? 0;
    const y = rowOf.get(n.name) * rowH;
    pos.set(n.name, { x, y });
  });
  // centralizar verticalmente cada coluna em relação à mais alta
  const maxRows = Math.max(...rowOrder.map(g => (groups.get(g) || []).length));
  rowOrder.forEach(g => {
    const arr = groups.get(g) || [];
    const off = (maxRows - arr.length) * rowH / 2;
    arr.forEach(n => { pos.get(n.name).y += off; });
  });

  return { pos, colX, nodes: nodeList, edges: edgeList };
}

function lineageLayout(center, edgeList) {
  // ancestrais à esquerda (por profundidade), descendentes à direita
  const depth = new Map([[center.name, 0]]);
  let frontier = [center];
  const depthMin = -1, depthMax = 1;
  const lows = new Map(), highs = new Map();
  // sobe
  let d = 0, q = [center], seen = new Set([center.name]);
  while (q.length && d < 8) {
    d++; const nq = [];
    q.forEach(n => n.inc.forEach(e => {
      if (seen.has(e.node.name)) return;
      seen.add(e.node.name); depth.set(e.node.name, -d); lows.set(e.node.name, -d); nq.push(e.node);
    }));
    q = nq;
  }
  d = 0; q = [center]; seen = new Set([center.name]);
  while (q.length && d < 8) {
    d++; const nq = [];
    q.forEach(n => n.out.forEach(e => {
      if (seen.has(e.node.name)) return;
      seen.add(e.node.name); depth.set(e.node.name, d); highs.set(e.node.name, d); nq.push(e.node);
    }));
    q = nq;
  }
  const nodes = [...depth.keys()].map(name => byName.get(name)).filter(Boolean);
  const keep = new Set(nodes.map(n => n.name));
  const edges = edgeList.filter(e => keep.has(e.s) && keep.has(e.t));
  // linhas: ordenar por profundidade, dentro dela por bulk
  const cols = new Map();
  nodes.forEach(n => {
    const dd = depth.get(n.name);
    if (!cols.has(dd)) cols.set(dd, []);
    cols.get(dd).push(n);
  });
  const pos = new Map();
  const colW = 250, rowH = 54;
  const depths = [...cols.keys()].sort((a, b) => a - b);
  const maxLen = Math.max(...[...cols.values()].map(a => a.length));
  depths.forEach(dd => {
    const arr = cols.get(dd).sort((a, b) => bulk(b) - bulk(a) || a.name.localeCompare(b.name));
    arr.forEach((n, i) => {
      pos.set(n.name, { x: (dd + 8) * colW, y: i * rowH + (maxLen - arr.length) * rowH / 2 });
    });
  });
  return { pos, nodes, edges, levels: depths };
}

function computeLayout(force = false) {
  const visible = DATA.nodes.filter(n => state.visible.has(n.name));
  const edges = DATA.edges.filter(e => state.visible.has(e.s) && state.visible.has(e.t));
  if (state.view.layout === "lineage" && state.selected) {
    layout = { ...lineageLayout(state.selected, DATA.edges), mode: "lineage" };
  } else if (force) {
    layout = { ...forceLayout(visible, edges), mode: "force" };
  } else {
    layout = { ...layeredLayout(visible, edges), mode: "layers" };
  }
  layout.screen = new Map();
  return layout;
}

/* layout de força simples (para exploração) */
function forceLayout(nodes, edges) {
  const pos = new Map();
  const W = 1600, H = 1200;
  nodes.forEach((n, i) => {
    const a = i * 2.399963;
    const r = Math.sqrt(i / Math.max(1, nodes.length)) * 620;
    pos.set(n.name, { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0 });
  });
  const idx = new Map(nodes.map((n, i) => [n.name, i]));
  const link = edges.filter(e => idx.has(e.s) && idx.has(e.t)).map(e => [pos.get(e.s), pos.get(e.t)]);
  const k = 60;
  for (let it = 0; it < 260; it++) {
    const arr = [...pos.values()];
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 90000) continue;
        const f = 900 / d2;
        dx *= f; dy *= f;
        a.x += dx; a.y += dy; b.x -= dx; b.y -= dy;
      }
    }
    link.forEach(([a, b]) => {
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d - k) * 0.02;
      dx /= d; dy /= d;
      a.x += dx * f; a.y += dy * f; b.x -= dx * f; b.y -= dy * f;
    });
    arr.forEach(a => { a.x = clamp(a.x, 40, W - 40); a.y = clamp(a.y, 40, H - 40); });
  }
  return { pos, nodes, edges };
}

/* ============================================================
   FILTROS
   ============================================================ */
function passes(n) {
  const f = state.filters;
  if (!f.attrs.has(n.attr)) return false;
  if (!f.gens.has(n.gen)) return false;
  const nTier = (f.tierScope === "all") ? n.tier : (n.gtier || n.tier);
  if (f.tiers && f.tiers.size && !f.tiers.has(nTier)) return false;
  if (f.pers.size && !f.pers.has(n.pers)) return false;
  if (rankNum(n.rank) < f.rankMin) return false;
  for (const s in f.stats) {
    const min = f.stats[s];
    if (min && statVal(n, s) < min) return false;
  }
  if (f.onlyLinked && !n.out.length && !n.inc.length) return false;
  if (f.q) {
    const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.every(t => n.search.includes(t))) return false;
  }
  return true;
}

function renderFilterSummary() {
  const box = document.getElementById("fsum");
  if (!box) return;
  const f = state.filters;
  const allA = !f.attrs || f.attrs.size === 0 || f.attrs.size >= ATTRS.length;
  const allG = !f.gens || f.gens.size === 0 || f.gens.size >= GEN_ORDER.length;
  const items = [];
  if (!allA) items.push({ t: [...f.attrs].join(" + "), undo: () => { f.attrs = new Set(ATTRS); } });
  if (!allG) items.push({ t: [...f.gens].map(g => GEN_LABEL[g] || g).join(" + "), undo: () => { f.gens = new Set(GEN_ORDER); } });
  if (f.tiers && f.tiers.size) items.push({ t: "Tier " + [...f.tiers].sort().join("/") + (f.tierScope === "all" ? " (roster)" : " (geração)"), undo: () => { f.tiers = new Set(); } });
  if (f.pers && f.pers.size) items.push({ t: [...f.pers].join(" + "), undo: () => { f.pers = new Set(); } });
  if (+f.rankMin) items.push({ t: `Rank ${f.rankMin}+`, undo: () => { f.rankMin = 0; } });
  const st = Object.entries(f.stats || {}).filter(([, v]) => +v > 0);
  if (st.length) items.push({ t: st.map(([k, v]) => `${k} ≥ ${v}`).join(" · "), undo: () => { f.stats = {}; } });
  if (String(f.q || "").trim()) items.push({ t: `“${f.q}”`, undo: () => { f.q = ""; } });
  if (f.onlyLinked) items.push({ t: "com digivolução", undo: () => { f.onlyLinked = false; } });
  box.innerHTML = "";
  items.forEach(it => {
    const b = document.createElement("button");
    b.className = "sumchip";
    const s1 = document.createElement("b"); s1.textContent = it.t; b.appendChild(s1);
    const x = document.createElement("i"); x.textContent = "×"; b.appendChild(x);
    b.title = "remover este filtro";
    b.onclick = () => { it.undo(); applyFilters(); };
    box.appendChild(b);
  });
}

function applyFilters() {
  state.visible = new Set(DATA.nodes.filter(passes).map(n => n.name));
  $('#count').textContent = `${state.visible.size} de ${DATA.nodes.length}`;
  const f = state.filters;
  const allA = !f.attrs || f.attrs.size === 0 || f.attrs.size >= ATTRS.length;
  const allG = !f.gens || f.gens.size === 0 || f.gens.size >= GEN_ORDER.length;
  const anyStats = Object.values(f.stats || {}).some(v => +v > 0);
  const anyFilter = !allA || !allG || (f.tiers ? f.tiers.size : 0) > 0 || (f.pers ? f.pers.size : 0) > 0 ||
    (+f.rankMin || 0) > 0 || anyStats || String(f.q || "").trim() !== "" || !!f.onlyLinked;
  const fb = $('#toggle-filters');
  if (fb) fb.classList.toggle("dirty", !!anyFilter);
  if (typeof syncFilterUI === "function") syncFilterUI();
  renderFilterSummary();
  const em = document.getElementById("empty");
  if (em) em.hidden = state.visible.size > 0;
  if (!state.visible.size) { draw(); renderLegend(); return; }
  buildList();
  computeLayout();
  fitToView(true);
  draw();
  renderLegend();
  if (typeof saveState === "function") saveState();
}
