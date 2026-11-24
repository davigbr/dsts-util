/* ============================================================
   CONSTRUTOR DE TIME — cruza atributos e elementos da equipe
   ============================================================ */
const ATTR3 = ["Vaccine", "Data", "Virus"];
const ATTACK_KINDS = new Set(["Physical", "Magic", "HP Damage"]);

function teamNodes() {
  return state.team.map(nm => byName.get(nm)).filter(Boolean);
}

function toggleTeam(name) {
  const i = state.team.indexOf(name);
  if (i >= 0) state.team.splice(i, 1);
  else {
    if (state.team.length >= TEAM_MAX) {
      toast(`O time tem ${TEAM_MAX} slots — remova um antes de adicionar.`);
      return;
    }
    state.team.push(name);
  }
  saveState();
  renderTeam();
  updateTeamBadge();
  if (typeof routesTeamChanged === "function") routesTeamChanged();
  if (state.selected) showDetail(state.selected, { keepScroll: true });
}

function attackElements(n) {
  const out = new Set();
  [...(n.special || []), ...(n.skills || [])].forEach(s => {
    if (!ATTACK_KINDS.has((s.kind || "").trim())) return;
    const e = s.el;
    if (!e || e === "No Element") return;
    out.add(e);
  });
  return out;
}

function analyzeTeam(nodes) {
  const a = {
    offAttr: {}, defAttr: {}, offEl: {}, weakEl: {}, resistEl: {},
    per: nodes.map(n => ({
      n, beats: BEATS[n.attr] || null, els: attackElements(n),
      weak: ELEMENTS.filter(e => (n.resE || {})[e] > 1),
      resist: ELEMENTS.filter(e => (n.resE || {})[e] < 1 && (n.resE || {})[e] > 0),
      weakA: ATTR3.filter(x => (n.resA || {})[x] > 1),
      resistA: ATTR3.filter(x => (n.resA || {})[x] < 1),
    })),
  };
  ATTR3.forEach(x => { a.offAttr[x] = 0; a.defAttr[x] = 0; });
  ELEMENTS.forEach(e => { a.offEl[e] = 0; a.weakEl[e] = 0; a.resistEl[e] = 0; });
  a.per.forEach(p => {
    if (p.beats) a.offAttr[p.beats]++;
    p.weakA.forEach(x => a.defAttr[x]++);
    p.els.forEach(e => a.offEl[e]++);
    p.weak.forEach(e => a.weakEl[e]++);
    p.resist.forEach(e => a.resistEl[e]++);
  });
  return a;
}

function chipEl(label, kind, title, color) {
  const c = el("span", "tchip " + (kind || ""));
  if (color) { c.style.borderColor = color + "66"; c.style.color = color; }
  c.textContent = label;
  if (title) c.title = title;
  return c;
}

function teamSlot(name) {
  const row = el("div", "tslot");
  if (!name) {
    row.classList.add("empty");
    row.appendChild(el("span", "tslot-empty", "+ vazio"));
    return row;
  }
  const n = byName.get(name);
  if (!n) return row;
  const im = el("img", "tslot-img");
  if (n.img) im.src = n.img;
  row.appendChild(im);
  const txt = el("div", "tslot-txt");
  txt.appendChild(el("span", "tslot-name", n.name));
  const meta = el("span", "tslot-meta");
  meta.textContent = `${GEN_LABEL[n.gen] || n.gen} · ${n.attr}`;
  meta.style.color = ATTR_COLOR[n.attr];
  txt.appendChild(meta);
  row.appendChild(txt);
  row.onclick = () => openNodeBySlug(n.slug);
  row.title = "abrir ficha";
  const rm = el("button", "tslot-x", "×");
  rm.title = "remover do time";
  rm.onclick = ev => { ev.stopPropagation(); toggleTeam(n.name); };
  row.appendChild(rm);
  return row;
}

function renderTeam() {
  const box = document.getElementById("team");
  if (!box) return;
  const body = document.getElementById("team-body");
  if (!body) return;
  body.innerHTML = "";
  const nodes = teamNodes();

  // slots
  const slots = el("div", "tslots");
  for (let i = 0; i < TEAM_MAX; i++) slots.appendChild(teamSlot(state.team[i]));
  body.appendChild(slots);
  const hint = el("p", "tslot-hint", nodes.length < TEAM_MAX
    ? "Adicione pela ficha do Digimon (botão “＋ Time”) ou pelo atalho T com um nó selecionado."
    : "Time completo. Clique num slot para abrir a ficha.");
  body.appendChild(hint);
  const go = el("button", "btn wide", "Ver rotas de evolução");
  go.onclick = () => openRoutes();
  body.appendChild(go);

  if (!nodes.length) {
    const empty = el("p", "muted pad", "Com dois ou três Digimon o cruzamento de tipos e elementos aparece aqui.");
    body.appendChild(empty);
    return;
  }

  const a = analyzeTeam(nodes);

  /* ---------- confronto por atributo ---------- */
  const s1 = el("section", "t-sec");
  s1.appendChild(el("h3", null, "Triângulo de atributos"));
  const cov = ATTR3.filter(x => a.offAttr[x]).length;
  s1.appendChild(el("p", "t-cap", `Vaccine ▸ Virus ▸ Data ▸ Vaccine (×1,5 é vantagem, ×0,5 resistência). Cada cartão é um atributo inimigo: quantos dos seus ${nodes.length} membros batem com vantagem e quantos levam ×1,5 dele. Cobertura: ${cov}/3.`));
  const grid = el("div", "tgrid");
  ATTR3.forEach(enemy => {
    const ours = a.offAttr[enemy], theirs = a.defAttr[enemy];
    const card = el("div", "tcard");
    card.style.setProperty("--c", ATTR_COLOR[enemy]);
    card.appendChild(el("div", "tcard-h", `Inimigo ${enemy}`));
    card.appendChild(chipEl(`nós batemos: ${ours}/${nodes.length}`, ours ? "good" : "bad",
      ours ? `${ours} membro(s) com vantagem ×1,5 contra ${enemy}` : `nenhum membro bate ${enemy} com vantagem`));
    card.appendChild(chipEl(`eles batem: ${theirs}/${nodes.length}`, theirs ? "bad" : "good",
      theirs ? `${theirs} membro(s) levam ×1,5 de ${enemy}` : `ninguém do time é fraco contra ${enemy}`));
    grid.appendChild(card);
  });
  s1.appendChild(grid);
  body.appendChild(s1);

  /* ---------- cobertura elemental ofensiva ---------- */
  const s2 = el("section", "t-sec");
  s2.appendChild(el("h3", null, "Elementos que o time ataca"));
  const missing = ELEMENTS.filter(e => !a.offEl[e]);
  const covered = ELEMENTS.filter(e => a.offEl[e]);
  s2.appendChild(el("p", "t-cap", `Cobertos: ${covered.length} de 11.` +
    (missing.length ? " Sem golpe de: " + missing.join(", ") + "." : " Todos cobertos.")));
  const elGrid = el("div", "tels");
  ELEMENTS.forEach(e => {
    const c = chipEl(a.offEl[e] ? `✓ ${e} ×${a.offEl[e]}` : e, a.offEl[e] ? "on" : "off",
      a.offEl[e] ? `${a.offEl[e]} membro(s) com golpe de ${e}` : `ninguém ataca com ${e}`,
      EL_COLOR[e]);
    c.style.setProperty("--c", EL_COLOR[e]);
    elGrid.appendChild(c);
  });
  s2.appendChild(elGrid);
  body.appendChild(s2);

  /* ---------- exposição defensiva ---------- */
  const s3 = el("section", "t-sec");
  s3.appendChild(el("h3", null, "O que fura o time"));
  const stacked = ELEMENTS.filter(e => a.weakEl[e] >= 2);
  s3.appendChild(el("p", "t-cap", stacked.length
    ? "Fraqueza repetida (dois ou mais membros): " + stacked.join(", ")
    : "Nenhuma fraqueza elemental repetida"));
  const elGrid2 = el("div", "tels");
  ELEMENTS.forEach(e => {
    const c = chipEl(a.weakEl[e] ? `${e} ×${a.weakEl[e]}` : e, a.weakEl[e] >= 2 ? "bad" : a.weakEl[e] ? "warn" : "off",
      a.weakEl[e] ? `${a.weakEl[e]} membro(s) levam ×1,5 de ${e}` : `ninguém é fraco a ${e}`,
      EL_COLOR[e]);
    elGrid2.appendChild(c);
  });
  s3.appendChild(elGrid2);
  body.appendChild(s3);

  /* ---------- resumo por membro ---------- */
  const s4 = el("section", "t-sec");
  s4.appendChild(el("h3", null, "Por membro"));
  s4.appendChild(el("p", "t-cap", "verde: bate ou resiste · vermelho: fraqueza · amarelo: atributo que fura"));
  a.per.forEach(p => {
    const row = el("div", "tper");
    const nm = el("span", "tper-name", p.n.name);
    nm.style.color = ATTR_COLOR[p.n.attr];
    nm.onclick = () => openNodeBySlug(p.n.slug);
    row.appendChild(nm);
    const box2 = el("div", "tper-chips");
    if (p.beats) box2.appendChild(chipEl("bate " + p.beats, "good"));
    p.els.forEach(e => box2.appendChild(chipEl(e, "on", null, EL_COLOR[e])));
    p.weak.forEach(e => box2.appendChild(chipEl("fraco " + e, "bad")));
    p.resist.forEach(e => box2.appendChild(chipEl("resiste " + e, "good")));
    p.weakA.forEach(x => box2.appendChild(chipEl(`leva ×1,5 de ${x}`, "warn")));
    row.appendChild(box2);
    s4.appendChild(row);
  });
  body.appendChild(s4);

  /* ---------- veredito ---------- */
  const s5 = el("section", "t-sec");
  s5.appendChild(el("h3", null, "Leitura rápida"));
  const tips = [];
  ATTR3.forEach(enemy => {
    if (!a.offAttr[enemy]) tips.push(`Ninguém do time tem vantagem contra ${enemy} — considere um membro ${Object.keys(BEATS).find(k => BEATS[k] === enemy)}.`);
    if (a.defAttr[enemy] >= 2) tips.push(`${a.defAttr[enemy]} membros levam ×1,5 de ${enemy}: evite atacar em grupo contra ${enemy}.`);
  });
  if (stacked.length) tips.push(`Cuidado com ${stacked.join(" / ")}: atinge mais de um membro.`);
  if (missing.length && missing.length <= 4) tips.push(`Elementos sem cobertura ofensiva: ${missing.join(", ")}.`);
  if (!tips.length) tips.push("Time equilibrado nos dois eixos (atributo e elemento).");
  const ul = el("ul", "t-tips");
  tips.slice(0, 6).forEach(t => ul.appendChild(el("li", null, t)));
  s5.appendChild(ul);
  body.appendChild(s5);
}

function updateTeamBadge() {
  const b = document.getElementById("toggle-team");
  if (!b) return;
  const n = state.team.length;
  b.classList.toggle("on", n > 0);
  b.querySelector(".badge").textContent = n || "";
  b.classList.toggle("has", n > 0);
}

function openTeam() {
  if (typeof closeDetail === "function") closeDetail();
  renderTeam();
  document.body.classList.add("team-open");
  document.getElementById("team").classList.add("open");
}

function closeTeam() {
  document.body.classList.remove("team-open");
  document.getElementById("team").classList.remove("open");
  setTimeout(() => { resize(); draw(); }, 240);
}

function toggleTeamPanel() {
  if (document.getElementById("team").classList.contains("open")) closeTeam();
  else openTeam();
}
