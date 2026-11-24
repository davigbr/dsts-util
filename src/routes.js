/* ============================================================
   ROTAS DE EVOLUÇÃO — sugere caminhos para um time balanceado
   ============================================================ */
const ROUTE_TARGET_GENS = new Set(["Champion", "Ultimate", "Mega", "Mega+"]);
const NEUTRAL_ATTRS = new Set(["Free", "Variable", "Unknown", "No Data"]);

const ROUTE_META = [
  {
    id: "tri", name: "Triângulo",
    short: "um de cada atributo (ou um neutro no lugar)",
    long: "Procura um Vaccine, um Data e um Virus no mesmo time — ou um Free/Variable ocupando o lugar de um deles, porque neutro não entra no ciclo de fraqueza. É o algoritmo mais equilibrado: você bate 1,5× em alguém e alguém bate 1,5× em você, sem ficar refém de um único tipo de inimigo.",
    weights: "pesos: 42% triângulo · 18% vantagem ofensiva · 13% neutro · 12% não empilhar fraqueza · 15% força média",
  },
  {
    id: "wall", name: "Blindagem",
    short: "o time que menos leva dano dobrado",
    long: "Olha primeiro para o que te machuca: se dois membros levam ×1,5 de Ice, qualquer luta de gelo vira problema. Ele minimiza a soma das fraquezas repetidas, evita que o pior elemento atinja mais de um membro e maximiza quantos dos 11 elementos o time ao menos resiste com alguém.",
    weights: "pesos: 40% fraqueza repetida · 22% pior elemento · 23% resistências cobertas · 15% força média",
  },
  {
    id: "atk", name: "Ofensiva",
    short: "o time que acerta mais elementos",
    long: "Maximiza quantos dos 11 elementos os golpes do time cobrem, para não travar contra um chefe imune ao seu único elemento. Em troca costuma aceitar alvos com menos status e às vezes menos defesa.",
    weights: "pesos: 44% elementos de ataque · 20% atributo que fura · 16% triângulo · 20% força média",
  },
  {
    id: "power", name: "Poder",
    short: "os alvos mais fortes possíveis",
    long: "O mais direto: escolhe os alvos de maior score de força (a mesma nota 0–100 das fichas), mantendo o triângulo fechado e sem criar fraqueza nova. Bom quando você quer o time mais forte possível sem abandonar a base.",
    weights: "pesos: 62% força média · 18% triângulo · 20% pior elemento",
  },
];

const ROUTE_HELP = {
  tri: "Quantos dos três atributos do ciclo (Vaccine → Virus → Data → Vaccine) estão no time. 3/3 = um de cada.",
  maxStack: "O elemento que mais fura o time: quantos membros levam ×1,5 dele. 1 significa que nenhuma fraqueza é compartilhada.",
  offEls: "Quantos dos 11 elementos os golpes do time conseguem acertar (união das skills físicas e mágicas dos três).",
  avgSc: "Média da nota de força (0–100) dos três alvos — a mesma do painel de cada Digimon.",
  algoScore: "Nota interna do algoritmo, de 0 a 100. Só compara rotas dentro da mesma aba: escalas diferentes não se comparam.",
};

let routeResults = null;
let routeTab = "tri";
let rtDirty = true;

/* ---------- caminhos ---------- */
function routesForNode(start) {
  const seen = new Map([[start.name, [start.name]]]);
  const out = [{ node: start, path: [start.name] }];
  let frontier = [start.name];
  for (let d = 0; d < 5 && frontier.length; d++) {
    const next = [];
    for (const nm of frontier) {
      const n = byName.get(nm);
      if (!n) continue;
      for (const e of n.out) {
        if (seen.has(e.node.name)) continue;
        seen.set(e.node.name, seen.get(nm).concat(e.node.name));
        if (ROUTE_TARGET_GENS.has(e.node.gen)) out.push({ node: e.node, path: seen.get(e.node.name) });
        next.push(e.node.name);
      }
    }
    frontier = next;
    if (seen.size > 600) break;
  }
  return out;
}

function routeCandidates() {
  const members = teamNodes();
  return members.map(m => {
    const all = routesForNode(m);
    const best = all
      .filter(c => c.node === m || ROUTE_TARGET_GENS.has(c.node.gen))
      .sort((a, b) => (a.node === m ? -1 : 0) - (b.node === m ? -1 : 0) || (b.node.sc || 0) - (a.node.sc || 0));
    const uniq = [], seen = new Set();
    for (const c of best) {
      if (seen.has(c.node.name)) continue;
      seen.add(c.node.name);
      uniq.push(c);
      if (uniq.length >= 16) break;
    }
    return { member: m, options: uniq };
  });
}

/* ---------- métricas de um conjunto final ---------- */
function evalRoute(nodes) {
  const n = nodes.length;
  const attrs = nodes.map(x => x.attr);
  const triCover = ["Vaccine", "Data", "Virus"].filter(a => attrs.includes(a)).length;
  const neutral = attrs.filter(a => NEUTRAL_ATTRS.has(a)).length;
  const offAttr = ["Vaccine", "Data", "Virus"].filter(a => nodes.some(x => BEATS[x.attr] === a)).length;
  const weak = {}, resist = {};
  ELEMENTS.forEach(e => { weak[e] = 0; resist[e] = 0; });
  nodes.forEach(x => ELEMENTS.forEach(e => {
    const v = (x.resE || {})[e];
    if (v > 1) weak[e]++;
    if (v < 1) resist[e]++;
  }));
  const maxStack = Math.max(0, ...ELEMENTS.map(e => weak[e]));
  const stackSum = ELEMENTS.reduce((s, e) => s + weak[e] * weak[e], 0);
  const stacked = ELEMENTS.filter(e => weak[e] > 1);
  const resistCover = ELEMENTS.filter(e => resist[e] > 0).length;
  const offEls = new Set();
  nodes.forEach(x => attackElements(x).forEach(e => offEls.add(e)));
  const avgSc = nodes.reduce((s, x) => s + (x.sc || 0), 0) / Math.max(1, n);
  return {
    nodes, attrs, triCover, neutral, offAttr, maxStack, stackSum, stacked,
    resistCover, offEls: [...offEls], avgSc: Math.round(avgSc * 10) / 10,
  };
}

/* ---------- algoritmos ---------- */
const ROUTE_ALGOS = {
  tri(m) {
    return 0.42 * (m.triCover / 3) * 100
      + 0.13 * Math.min(m.neutral, 1) * 100
      + 0.18 * (m.offAttr / 3) * 100
      + 0.12 * (1 - Math.min(m.maxStack, 3) / 3) * 100
      + 0.15 * m.avgSc;
  },
  wall(m) {
    return 0.40 * (1 - Math.min(m.stackSum, 12) / 12) * 100
      + 0.22 * (1 - Math.min(m.maxStack, 3) / 3) * 100
      + 0.23 * (m.resistCover / ELEMENTS.length) * 100
      + 0.15 * m.avgSc;
  },
  atk(m) {
    return 0.44 * (m.offEls.length / ELEMENTS.length) * 100
      + 0.20 * (m.offAttr / 3) * 100
      + 0.16 * (m.triCover / 3) * 100
      + 0.20 * m.avgSc;
  },
  power(m) {
    const penalty = m.maxStack > 2 ? (m.maxStack - 2) * 6 : 0;
    return 0.62 * m.avgSc
      + 0.18 * (m.triCover / 3) * 100
      + 0.20 * (1 - Math.min(m.maxStack, 3) / 3) * 100
      - penalty;
  },
};

function computeRoutes() {
  const cands = routeCandidates();
  if (!cands.length) { routeResults = null; return null; }
  const combos = [];
  const walk = (i, acc) => {
    if (i === cands.length) {
      combos.push({ picks: acc.slice(), m: evalRoute(acc.map(a => a.node)) });
      return;
    }
    for (const opt of cands[i].options) {
      acc.push(opt);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);

  const key = c => c.picks.map(p => p.node.name).sort().join("|");
  const needTri = Math.min(3, cands.length);
  const base = evalRoute(teamNodes());
  const penalty = c => 45 * Math.max(0, needTri - c.m.triCover)
    + 10 * Math.max(0, c.m.maxStack - Math.max(1, base.maxStack));

  const res = [];
  const used = new Set();
  for (const algo of ROUTE_META) {
    const scored = combos
      .map(c => ({ c, s: ROUTE_ALGOS[algo.id](c.m) - penalty(c) }))
      .sort((a, b) => b.s - a.s);
    const accepted = res.map(r => r.combo.picks.map(x => x.node.name));
    const diffCount = names => {
      let mn = 99;
      accepted.forEach(a => { mn = Math.min(mn, a.filter((nm, i) => nm !== names[i]).length); });
      return mn;
    };
    const best = scored.find(x => diffCount(x.c.picks.map(p => p.node.name)) >= 2)
      || scored.find(x => !used.has(key(x.c)))
      || scored[0];
    used.add(key(best.c));
    res.push({
      algo: algo.id, name: algo.name, desc: algo.short, long: algo.long, weights: algo.weights,
      score: Math.round(best.s * 10) / 10, combo: best.c, metrics: best.c.m,
    });
  }
  routeResults = res;
  rtDirty = false;
  return res;
}

/* ---------- canvas: mundo + câmera ---------- */
const rt = {
  canvas: null, ctx: null, w: 0, h: 0,
  view: { x: 0, y: 0, k: 1 },
  nodes: [], world: null, drag: null, hover: null, sel: null, moved: false,
};

const RT_LANE_H = 132;
const RT_COL_W = 178;
const RT_R = 21;

function rtResize() {
  const c = document.getElementById("rt-canvas");
  if (!c) return;
  const r = c.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(320, Math.floor(r.width * dpr));
  c.height = Math.max(200, Math.floor(r.height * dpr));
  c.style.width = r.width + "px";
  c.style.height = r.height + "px";
  rt.canvas = c;
  rt.ctx = c.getContext("2d");
  rt.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rt.w = r.width;
  rt.h = r.height;
  if (!c.dataset.bound) { rtBind(c); c.dataset.bound = "1"; }
}

function rtLayout() {
  const res = routeResults && routeResults.find(r => r.algo === routeTab);
  if (!res) { rt.nodes = []; rt.world = null; return; }
  const lanes = res.combo.picks;
  const steps = Math.max(...lanes.map(p => p.path.length));
  const ww = RT_COL_W * (steps - 1) + RT_R * 2 + 24;
  const wh = RT_LANE_H * lanes.length + 20;
  const nodes = [];
  lanes.forEach((pick, li) => {
    const y = 14 + RT_LANE_H * li + RT_LANE_H / 2;
    pick.path.forEach((nm, si) => {
      const n = byName.get(nm);
      if (!n) return;
      const x = ww - RT_R - 8 - RT_COL_W * (pick.path.length - 1 - si);
      nodes.push({
        x, y, r: RT_R, node: n, lane: li, step: si,
        isTarget: si === pick.path.length - 1, path: pick.path,
      });
    });
  });
  rt.nodes = nodes;
  rt.world = { w: ww, h: wh };
}

function rtFit() {
  if (!rt.world) return;
  const pad = 26;
  const fitK = Math.min((rt.w - pad * 2) / rt.world.w, (rt.h - pad * 2) / rt.world.h, 1.6);
  const minK = 0.66;                 // abaixo disso os retratos viram pontos: navega em vez de encolher
  rt.view.k = Math.max(minK, fitK);
  rt.view.y = (rt.h - rt.world.h * rt.view.k) / 2;
  if (fitK >= minK) rt.view.x = (rt.w - rt.world.w * rt.view.k) / 2;
  else rt.view.x = Math.min(pad, rt.w - pad - rt.world.w * rt.view.k);   // encosta no alvo (direita)
}

function rtToWorld(px, py) {
  return { x: (px - rt.view.x) / rt.view.k, y: (py - rt.view.y) / rt.view.k };
}

function rtHit(px, py) {
  const p = rtToWorld(px, py);
  let best = null, bd = 1e9;
  rt.nodes.forEach(n => {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < n.r * 1.15 && d < bd) { bd = d; best = n; }
  });
  return best;
}

function rtDraw() {
  if (!rt.ctx) rtResize();
  const ctx = rt.ctx;
  if (!ctx) return;
  ctx.clearRect(0, 0, rt.w, rt.h);
  if (!rt.world) {
    ctx.fillStyle = "#7c8798";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Sem rotas para desenhar.", 20, 34);
    return;
  }
  ctx.save();
  ctx.translate(rt.view.x, rt.view.y);
  ctx.scale(rt.view.k, rt.view.k);

  const steps = Math.max(...rt.nodes.map(n => n.step));
  const minStep = Math.min(...rt.nodes.map(n => n.step));

  // cabeçalho de passos
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#5c6674";
  ctx.font = "10px system-ui, sans-serif";
  for (let s = minStep; s <= steps; s++) {
    const x = rt.world.w - RT_R - 8 - RT_COL_W * (steps - s);
    const lab = s === steps ? "alvo" : s === 0 ? "hoje" : `+${s}`;
    ctx.fillText(lab, x, 2);
  }

  // conectores
  rt.nodes.forEach(a => {
    const b = rt.nodes.find(z => z.lane === a.lane && z.step === a.step + 1);
    if (!b) return;
    const gold = b.isTarget;
    ctx.strokeStyle = gold ? "rgba(255,196,92,.8)" : "rgba(255,255,255,.22)";
    ctx.lineWidth = gold ? 2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(a.x + a.r + 2, a.y);
    ctx.lineTo(b.x - b.r - 5, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x - b.r - 5, b.y);
    ctx.lineTo(b.x - b.r - 10, b.y - 3.4);
    ctx.lineTo(b.x - b.r - 10, b.y + 3.4);
    ctx.closePath();
    ctx.fillStyle = gold ? "rgba(255,196,92,.9)" : "rgba(255,255,255,.3)";
    ctx.fill();
  });

  // nós
  rt.nodes.forEach(n => {
    const im = ICONS.get(n.node.name);
    const isSel = rt.sel && rt.sel.node.name === n.node.name;
    const isHover = rt.hover && rt.hover.node.name === n.node.name;
    if (n.isTarget) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 8, 0, 7);
      ctx.fillStyle = "rgba(255,196,92,.10)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, 7);
    const g = ctx.createRadialGradient(n.x - n.r * .3, n.y - n.r * .35, n.r * .2, n.x, n.y, n.r);
    g.addColorStop(0, "rgba(255,255,255,.16)");
    g.addColorStop(1, (ATTR_COLOR[n.node.attr] || "#3a4656") + "44");
    ctx.fillStyle = g;
    ctx.fill();
    if (im) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = .95;
      ctx.drawImage(im, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r + (isSel ? 3 : 0), 0, 7);
    ctx.lineWidth = isSel ? 2.4 : n.isTarget ? 2.2 : 1.4;
    ctx.strokeStyle = isSel ? "#ffffff" : n.isTarget ? (TIER_COLOR[n.node.tier] || "#ffc45c")
      : isHover ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.18)";
    ctx.stroke();
    if (n.isTarget) {
      const tx = n.x + n.r * .76, ty = n.y - n.r * .76;
      ctx.beginPath();
      ctx.arc(tx, ty, 7.5, 0, 7);
      ctx.fillStyle = TIER_COLOR[n.node.tier] || "#ffc45c";
      ctx.fill();
      ctx.fillStyle = "#12161f";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.node.tier || "", tx, ty + .5);
    }
    const showLabel = rt.view.k > 0.6 || n.isTarget || n.step === 0;
    if (showLabel) {
      const maxW = RT_COL_W - 8;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `${n.isTarget ? "600 11.5px" : "10.5px"} system-ui, sans-serif`;
      const lines = [];
      if (ctx.measureText(n.node.name).width <= maxW) lines.push(n.node.name);
      else {
        let cur = "";
        n.node.name.split(" ").forEach(w => {
          const t = cur ? cur + " " + w : w;
          if (ctx.measureText(t).width <= maxW || !cur) cur = t;
          else { lines.push(cur); cur = w; }
        });
        if (cur) lines.push(cur);
        if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, Math.max(4, lines[1].length - 1)) + "…"; }
      }
      ctx.fillStyle = isSel ? "#ffffff" : n.isTarget ? "#f2f5fa" : "#a9b4c4";
      lines.forEach((ln, k) => ctx.fillText(ln, n.x, n.y + n.r + 6 + k * 11.5));
      if (n.isTarget) {
        ctx.fillStyle = "#7c8798";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(`#${n.node.rk} · ${n.node.sc}`, n.x, n.y + n.r + 6 + lines.length * 11.5 + 1);
      }
    }
  });

  ctx.restore();
}

/* ---------- interação: pan, zoom, seleção ---------- */
function rtBind(c) {
  const pos = ev => {
    const r = c.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  c.addEventListener("pointerdown", ev => {
    const p = pos(ev);
    rt.drag = { x: p.x, y: p.y, vx: rt.view.x, vy: rt.view.y };
    rt.moved = false;
    try { c.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  c.addEventListener("pointermove", ev => {
    const p = pos(ev);
    if (rt.drag) {
      const dx = p.x - rt.drag.x, dy = p.y - rt.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) rt.moved = true;
      rt.view.x = rt.drag.vx + dx;
      rt.view.y = rt.drag.vy + dy;
      c.style.cursor = "grabbing";
      rtTip(null);
      rtDraw();
      return;
    }
    const h = rtHit(p.x, p.y);
    if (h !== rt.hover) {
      rt.hover = h;
      c.style.cursor = h ? "pointer" : "grab";
      rtTip(h, p);
      rtDraw();
    } else if (h) rtTip(h, p);
  });
  c.addEventListener("pointerup", ev => {
    const p = pos(ev);
    const wasMoved = rt.moved;
    rt.drag = null;
    rt.moved = false;
    c.style.cursor = rt.hover ? "pointer" : "grab";
    if (!wasMoved) {
      rt.sel = rtHit(p.x, p.y);
      rtTip(rt.sel, p);
      rtDraw();
      renderRouteSelection();
    }
  });
  c.addEventListener("pointerleave", () => {
    rt.hover = null;
    rtTip(null);
    rtDraw();
  });
  c.addEventListener("wheel", ev => {
    ev.preventDefault();
    const p = pos(ev);
    const before = rtToWorld(p.x, p.y);
    const k2 = Math.max(0.3, Math.min(4, rt.view.k * Math.exp(-ev.deltaY * 0.0016)));
    rt.view.k = k2;
    rt.view.x = p.x - before.x * k2;
    rt.view.y = p.y - before.y * k2;
    rtDraw();
  }, { passive: false });
  c.addEventListener("dblclick", ev => {
    const p = pos(ev);
    const h = rtHit(p.x, p.y);
    if (h) {
      const n = h.node;
      closeRoutes();
      openNodeBySlug(n.slug);
    }
  });
  c.style.cursor = "grab";
}

function rtTip(node, p) {
  const wrapEl = document.querySelector(".rt-canvas-wrap");
  if (!wrapEl) return;
  let tip = document.getElementById("rt-tip");
  if (!node) { if (tip) tip.style.display = "none"; return; }
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "rt-tip";
    wrapEl.appendChild(tip);
  }
  const n = node.node;
  tip.innerHTML = `<b>${n.name}</b>
    <span>${GEN_LABEL[n.gen] || n.gen} · ${n.attr} · tier ${n.tier}</span>
    <span>#${n.rk} de 475 · força ${n.sc}</span>
    <em>clique para detalhes · duplo clique abre a ficha</em>`;
  tip.style.display = "block";
  if (p) {
    const box = wrapEl.getBoundingClientRect();
    const w = 216;
    let left = p.x + 16;
    if (left + w > box.width) left = p.x - w - 16;
    tip.style.left = Math.max(4, left) + "px";
    tip.style.top = Math.max(4, Math.min(p.y - 8, box.height - 96)) + "px";
  }
}

function rtZoom(factor) {
  const cx = rt.w / 2, cy = rt.h / 2;
  const before = rtToWorld(cx, cy);
  rt.view.k = Math.max(0.3, Math.min(4, rt.view.k * factor));
  rt.view.x = cx - before.x * rt.view.k;
  rt.view.y = cy - before.y * rt.view.k;
  rtDraw();
}

/* ---------- painel ---------- */
function rtChip(label, color) {
  return `<span class="tchip" style="border-color:${color}66;color:${color}">${label}</span>`;
}

function renderRouteSelection() {
  const box = document.getElementById("rt-sel");
  if (!box) return;
  if (!rt.sel) { box.innerHTML = ""; box.style.display = "none"; return; }
  const n = rt.sel.node;
  const weak = ELEMENTS.filter(e => (n.resE || {})[e] > 1);
  const strong = ELEMENTS.filter(e => (n.resE || {})[e] < 1 && (n.resE || {})[e] > 0);
  const inTeam = state.team.includes(n.name);
  box.style.display = "block";
  box.innerHTML = `
    <div class="rts-head">
      ${n.img ? `<img src="${n.img}" class="rts-img" alt="">` : ""}
      <div class="rts-id">
        <b>${n.name}</b>
        <span>${GEN_LABEL[n.gen] || n.gen} · ${n.attr}</span>
        <span>tier ${n.gtier || n.tier} entre ${GEN_LABEL[n.gen] || n.gen}s (#${n.grk}/${n.gcount}) · roster #${n.rk}</span>
      </div>
      <button class="rts-x" id="rts-close" title="fechar detalhe">×</button>
    </div>
    <div class="rts-chips">
      ${weak.length ? `<span class="rts-lab">fraco</span>${weak.map(e => rtChip(e, EL_COLOR[e])).join("")}` : ""}
      ${strong.length ? `<span class="rts-lab">resiste</span>${strong.map(e => rtChip(e, EL_COLOR[e])).join("")}` : ""}
    </div>
    <div class="rts-actions">
      <button class="btn" id="rts-open">Abrir ficha</button>
      <button class="btn" id="rts-team">${inTeam ? "✓ No time" : "＋ Time"}</button>
    </div>`;
  const x = document.getElementById("rts-close");
  if (x) x.onclick = () => { rt.sel = null; rtDraw(); renderRouteSelection(); };
  const op = document.getElementById("rts-open");
  if (op) op.onclick = () => { closeRoutes(); openNodeBySlug(n.slug); };
  const tm = document.getElementById("rts-team");
  if (tm) tm.onclick = () => { toggleTeam(n.name); renderRouteSelection(); };
}

function deltaHTML(m) {
  const base = evalRoute(teamNodes());
  const row = (lab, a, b, better, suffix, tip) => {
    const diff = Number(b) - Number(a);
    const good = better === "up" ? diff > 0 : diff < 0;
    const col = !isFinite(diff) || diff === 0 ? "var(--muted)" : good ? "#6fd08a" : "#ff8a7a";
    const sfx = suffix || "";
    return `<div class="rt-delta"><span data-tip="${tip}">${lab} <i>?</i></span><em style="color:${col}">${a}${sfx} → ${b}${sfx}</em></div>`;
  };
  return `
    <div class="rt-block">
      <div class="rt-lab">Hoje → alvo</div>
      ${row("triângulo", base.triCover, m.triCover, "up", "/3", ROUTE_HELP.tri)}
      ${row("pior elemento atinge", base.maxStack, m.maxStack, "down", "", ROUTE_HELP.maxStack)}
      ${row("elementos de ataque", base.offEls.length, m.offEls.length, "up", "/11", ROUTE_HELP.offEls)}
      ${row("score médio", base.avgSc, m.avgSc, "up", "", ROUTE_HELP.avgSc)}
    </div>`;
}

function routeMetricsHTML(m) {
  const res = routeResults.find(x => x.algo === routeTab);
  const weakChips = ELEMENTS.filter(e => m.stacked.includes(e))
    .map(e => `<span class="tchip bad" style="border-color:${EL_COLOR[e]}66;color:${EL_COLOR[e]}">${e} ×${m.nodes.filter(n => (n.resE || {})[e] > 1).length}</span>`).join("");
  const attrChips = m.attrs.map(a => `<span class="tchip" style="border-color:${ATTR_COLOR[a]}66;color:${ATTR_COLOR[a]}">${a}</span>`).join("");
  const offMissing = ELEMENTS.filter(e => !m.offEls.includes(e));
  return `
    <div class="rt-block">
      <div class="rt-lab" data-tip="Os três alvos sugeridos: atributo e geração de cada um.">Atributos <i>?</i></div>
      <div class="rt-chips">${attrChips}</div>
      <div class="rt-note">triângulo ${m.triCover}/3 · vantagem contra ${m.offAttr}/3 atributos${m.neutral ? ` · ${m.neutral} neutro(s)` : ""}</div>
    </div>
    <div class="rt-block">
      <div class="rt-lab" data-tip="Elementos em que mais de um membro leva ×1,5 de dano — o que o time não pode repetir.">O que fura o time <i>?</i></div>
      <div class="rt-chips">${weakChips || '<span class="rt-note">nenhuma fraqueza repetida</span>'}</div>
      <div class="rt-note">pior elemento atinge ${m.maxStack} membro(s) · resiste ${m.resistCover}/11</div>
    </div>
    <div class="rt-block">
      <div class="rt-lab" data-tip="${ROUTE_HELP.offEls}">Ataque elemental <i>?</i></div>
      <div class="rt-note">${m.offEls.length}/11 cobertos${offMissing.length <= 5 ? " · faltam " + offMissing.join(", ") : ""}</div>
    </div>
    <div class="rt-block">
      <div class="rt-lab" data-tip="Cada elo da digivolução com o requisito real do jogo (rank e stats) lido da linha evolutiva.">Passos <i>?</i></div>
      <ol class="rt-steps">${m.nodes.map((n, i) => {
        const path = res.combo.picks[i].path;
        const reqs = path.slice(1).map((nm, k) => {
          const from = byName.get(path[k]);
          const e = (from.out || []).find(o => o.node.name === nm);
          const rq = e && e.req ? e.req : null;
          const bits = [];
          if (rq) {
            if (rq.rank) bits.push(`rank ${rq.rank}+`);
            Object.keys(rq.stats || {}).forEach(k2 => bits.push(`${k2} ${rq.stats[k2]}`));
          }
          return `${path[k]} → ${nm}${bits.length ? " (" + bits.join(", ") + ")" : ""}`;
        });
        return `<li><b style="color:${ATTR_COLOR[n.attr]}">${n.name}</b> <span class="rt-tier" style="color:${TIER_COLOR[n.tier]}">${n.tier}</span>
          <div class="rt-req">${reqs.length ? reqs.join("<br>") : "já está na forma final"}</div></li>`;
      }).join("")}</ol>
    </div>`;
}

function renderRoutes() {
  const wrap = document.getElementById("routes-body");
  if (!wrap) return;
  const members = teamNodes();
  if (!members.length) {
    wrap.innerHTML = `<p class="rt-empty">Adicione até 3 Digimon ao time (botão <b>＋ Time</b> na ficha) e as rotas aparecem aqui.</p>`;
    rt.nodes = []; rt.world = null;
    return;
  }
  if (!routeResults || rtDirty) computeRoutes();
  const uniq = new Set(routeResults.map(r => r.combo.picks.map(pp => pp.node.name).sort().join("|")));
  const converge = uniq.size < routeResults.length;
  const res = routeResults.find(r => r.algo === routeTab) || routeResults[0];
  routeTab = res.algo;
  const m = res.metrics;
  const prevSel = rt.sel && rt.sel.node.name;

  wrap.innerHTML = `
    <div class="rt-main">
      <div class="rt-canvas-wrap">
        <canvas id="rt-canvas"></canvas>
        <div class="rt-zoom">
          <button id="rt-zo" title="afastar">−</button>
          <button id="rt-zf" title="ajustar à tela">⤢</button>
          <button id="rt-zi" title="aproximar">+</button>
        </div>
        <div class="rt-canvas-hint">arraste para mover · roda do mouse para zoom · clique seleciona · duplo clique abre a ficha</div>
      </div>
      <aside class="rt-side">
        <div id="rt-sel" class="rt-sel" style="display:none"></div>
        <div class="rt-headline">
          <span class="rt-algo">${res.name}</span>
          <span class="rt-score-wrap"><span class="rt-score" data-tip="${ROUTE_HELP.algoScore}">${res.score}</span><span class="rt-score-cap">nota 0–100</span></span>
        </div>
        <p class="rt-desc">${res.desc}</p>
        <p class="rt-long">${res.long}</p>
        <p class="rt-w"><b>Pesos</b> ${res.weights.replace(/^pesos:\s*/i, "")}</p>
        ${converge ? '<p class="rt-warn">Com ' + members.length + ' membro(s) as rotas convergem — complete o time para ver caminhos diferentes por algoritmo.</p>' : ''}
        ${deltaHTML(m)}
        ${routeMetricsHTML(m)}
        <div class="rt-actions">
          <button id="rt-plan" class="btn">Marcar no grafo</button>
          <button id="rt-close2" class="btn">Fechar</button>
        </div>
      </aside>
    </div>`;
  rtResize();
  rtLayout();
  if (!rt.world) return;
  rtFit();
  rt.sel = prevSel ? (rt.nodes.find(n => n.node.name === prevSel) || null) : null;
  rt.hover = null;
  rtDraw();
  renderRouteSelection();
  rtBindTips();

  const zo = document.getElementById("rt-zo"); if (zo) zo.onclick = () => rtZoom(0.85);
  const zi = document.getElementById("rt-zi"); if (zi) zi.onclick = () => rtZoom(1.18);
  const zf = document.getElementById("rt-zf"); if (zf) zf.onclick = () => { rtFit(); rtDraw(); };
  const apply = document.getElementById("rt-plan");
  if (apply) apply.onclick = () => {
    state.plan = m.nodes.map(n => n.name);
    saveState(); draw();
    toast("Alvos marcados no grafo (anel tracejado).");
  };
  const cl = document.getElementById("rt-close2");
  if (cl) cl.onclick = () => closeRoutes();
}

/* ---------- tooltips via data-tip ---------- */
function rtBindTips() {
  document.querySelectorAll("#routes [data-tip]").forEach(elx => {
    if (elx.dataset.tipBound) return;
    elx.dataset.tipBound = "1";
    elx.addEventListener("mouseenter", () => showTip(elx));
    elx.addEventListener("mouseleave", hideTip);
    elx.addEventListener("click", () => showTip(elx));
  });
}
function showTip(elx) {
  const txt = elx.dataset.tip;
  if (!txt) return;
  let tip = document.getElementById("rt-tip2");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "rt-tip2";
    document.getElementById("routes").appendChild(tip);
  }
  tip.textContent = txt;
  tip.style.display = "block";
  const r = elx.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 20);
  tip.style.width = w + "px";
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  tip.style.left = left + "px";
  tip.style.top = Math.min(window.innerHeight - 120, r.bottom + 8) + "px";
}
function hideTip() {
  const tip = document.getElementById("rt-tip2");
  if (tip) tip.style.display = "none";
}

function renderRouteTabs() {
  const box = document.getElementById("rt-tabs");
  if (!box) return;
  box.innerHTML = "";
  ROUTE_META.forEach(a => {
    const b = el("button", "rt-tab" + (a.id === routeTab ? " on" : ""), a.name);
    b.dataset.tip = a.short;
    b.onclick = () => { routeTab = a.id; rt.sel = null; renderRouteTabs(); renderRoutes(); };
    box.appendChild(b);
  });
  rtBindTips();
}

/* ---------- ajuda ---------- */
function openRouteHelp() {
  const box = document.getElementById("rt-help");
  if (!box) return;
  hideTip();
  const now = ROUTE_META.find(a => a.id === routeTab) || ROUTE_META[0];
  box.innerHTML = `
    <div class="rth-card">
      <div class="rth-head">
        <h2>Como ler esta tela</h2>
        <button class="d-close" id="rth-x" title="Fechar">×</button>
      </div>
      <div class="rth-body">
        <p>Esta tela pega o time de agora e procura, em <b>todas as digivoluções possíveis de cada membro</b> (até 5 passos),
        a combinação que fecha melhor um time equilibrado. Cada trilha do grafo é um membro: a coluna <b>hoje</b> é a forma atual,
        a coluna <b>alvo</b> é a forma sugerida, e o trecho dourado é o último passo.</p>

        <h3>Os quatro algoritmos · você está vendo ${now.name}</h3>
        ${ROUTE_META.map(a => `
          <div class="rth-algo${a.id === routeTab ? " now" : ""}">
            <b>${a.name}</b> ${a.id === routeTab ? '<span class="rth-badge">aba aberta</span>' : ""}
            <span class="rth-short">${a.short}</span>
            <p>${a.long}</p>
            <em><b>Pesos:</b> ${a.weights.replace(/^pesos:\s*/i, "")}</em>
          </div>`).join("")}
        <p class="rth-note">Todos os quatro obedecem a duas travas: nunca baixar o triângulo abaixo do que é possível e nunca
        aumentar a fraqueza repetida em relação ao time de hoje. A nota de cada aba usa escala própria — só serve para
        comparar rotas dentro da mesma aba.</p>

        <h3>O que cada número quer dizer</h3>
        <table class="rth-table">
          <tr><td>triângulo</td><td>${ROUTE_HELP.tri}</td></tr>
          <tr><td>pior elemento atinge</td><td>${ROUTE_HELP.maxStack}</td></tr>
          <tr><td>elementos de ataque</td><td>${ROUTE_HELP.offEls}</td></tr>
          <tr><td>score médio</td><td>${ROUTE_HELP.avgSc}</td></tr>
          <tr><td>nota da aba</td><td>${ROUTE_HELP.algoScore}</td></tr>
          <tr><td>tier S–D</td><td>Nota de força geral: S = top 8% do roster, D = os 22% mais fracos.</td></tr>
        </table>

        <h3>Como navegar</h3>
        <ul>
          <li><b>Arraste</b> para mover o grafo; a <b>roda do mouse</b> dá zoom no ponto do cursor (botões − ⤢ + no canto).</li>
          <li><b>Clique</b> num Digimon para selecionar — os detalhes aparecem no painel, com atalho para abrir a ficha ou colocar no time.</li>
          <li><b>Duplo clique</b> abre a ficha completa.</li>
          <li><b>Marcar no grafo</b> deixa anel tracejado violeta nos três alvos, no grafo principal.</li>
          <li><b>R</b> abre e fecha esta tela · <b>Esc</b> fecha.</li>
        </ul>
      </div>
    </div>`;
  box.classList.add("open");
  const x = document.getElementById("rth-x");
  if (x) x.onclick = () => box.classList.remove("open");
  box.onclick = ev => { if (ev.target === box) box.classList.remove("open"); };
}

/* ---------- ciclo de vida ---------- */
function openRoutes() {
  if (document.getElementById("routes").classList.contains("open")) return;
  rtDirty = true;
  rt.sel = null;
  if (typeof closeTeam === "function") closeTeam();
  if (typeof closeDetail === "function") closeDetail();
  document.getElementById("routes").classList.add("open");
  document.body.classList.add("routes-open");
  renderRouteTabs();
  renderRoutes();
}

function closeRoutes() {
  document.getElementById("routes").classList.remove("open");
  document.body.classList.remove("routes-open");
  const h = document.getElementById("rt-help");
  if (h) h.classList.remove("open");
  hideTip();
  rtTip(null);
}

function toggleRoutes() {
  if (document.getElementById("routes").classList.contains("open")) closeRoutes();
  else openRoutes();
}

function routesTeamChanged() {
  rtDirty = true;
  if (document.getElementById("routes") && document.getElementById("routes").classList.contains("open")) renderRoutes();
}

window.addEventListener("resize", () => {
  if (document.getElementById("routes") && document.getElementById("routes").classList.contains("open")) {
    rtResize();
    rtLayout();
    if (rt.world) { rtFit(); rtDraw(); }
  }
});
