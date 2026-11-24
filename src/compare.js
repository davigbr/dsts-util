/* ============================================================
   COMPARAR — dois Digimon lado a lado, com as diferenças
   ============================================================ */
const CMP_STATS = ["HP", "SP", "ATK", "DEF", "INT", "SPI", "SPD"];
const cmpState = { a: null, b: null, pick: null };

function cmpNode(which) {
  const nm = cmpState[which];
  return nm ? byName.get(nm) : null;
}

function cmpStat(n, k) {
  const v = (n.stats || {})[k];
  return v == null ? 0 : Number(v);
}

function openCompare(a, b) {
  cmpState.a = a || cmpState.a || (state.selected && state.selected.name) || (state.team[0] || null);
  cmpState.b = b || cmpState.b || (state.team[1] && state.team[1] !== cmpState.a ? state.team[1] : null);
  document.body.classList.add("cmp-open");
  const el2 = document.getElementById("compare");
  el2.classList.add("open");
  renderCompare();
}

function closeCompare() {
  document.body.classList.remove("cmp-open");
  document.getElementById("compare").classList.remove("open");
  cmpState.pick = null;
}

function toggleCompare() {
  if (document.getElementById("compare").classList.contains("open")) closeCompare();
  else openCompare();
}

function cmpSuggest(q) {
  const s = (q || "").trim().toLowerCase();
  if (s.length < 2) return [];
  const terms = s.split(/\s+/).filter(Boolean);
  const hits = [];
  for (const n of DATA.nodes) {
    const nm = n.name.toLowerCase();
    if (!terms.every(t => nm.includes(t))) continue;
    const at = nm.indexOf(terms[0]);
    if (at < 0) continue;
    // 0 exato · 1 começa com · 2 começo de palavra · 3 no meio
    const rank = nm === s ? 0
      : at === 0 ? 1
      : /[\s(\-]/.test(nm[at - 1]) ? 2 : 3;
    hits.push({ n, rank, len: nm.length });
  }
  hits.sort((a, b) => a.rank - b.rank || a.len - b.len || (b.n.sc || 0) - (a.n.sc || 0));
  return hits.slice(0, 8).map(x => x.n);
}

function cmpSlotHTML(which) {
  const n = cmpNode(which);
  const label = which === "a" ? "A" : "B";
  if (!n) {
    return `<div class="cmp-slot empty" data-side="${which}">
      <span class="cmp-badge">${label}</span>
      <div class="cmp-empty-txt">${t("cmp.pick")}</div>
      <input class="cmp-search" id="cmp-q-${which}" placeholder="${t("cmp.searchPh")}" autocomplete="off">
      <div class="cmp-sug" id="cmp-sug-${which}"></div>
    </div>`;
  }
  return `<div class="cmp-slot" data-side="${which}">
    <span class="cmp-badge">${label}</span>
    ${n.img ? `<img class="cmp-img" src="${n.img}" alt="">` : ""}
    <div class="cmp-id">
      <b>${n.name}</b>
      <span>${GEN_LABEL[n.gen] || n.gen} · ${n.attr}</span>
      <span>${t("cmp.tierGen")} ${n.gtier || n.tier} · #${n.rk} ${t("cmp.tierRoster")}</span>
    </div>
    <div class="cmp-slot-btns">
      <button class="cmp-mini" data-act="trocar" data-side="${which}" title="${t("cmp.swap")}">⇄</button>
      <button class="cmp-mini" data-act="limpar" data-side="${which}" title="${t("cmp.remove")}">×</button>
      <button class="cmp-mini" data-act="ficha" data-side="${which}" title="${t("cmp.openProfile")}">↗</button>
    </div>
  </div>`;
}

function cmpBar(v, max, color) {
  const w = Math.max(2, Math.min(100, (v / Math.max(1, max)) * 100));
  return `<div class="cmp-track"><i style="width:${w}%;background:${color}"></i></div>`;
}

function renderCompare() {
  const body = document.getElementById("cmp-body");
  if (!body) return;
  const a = cmpNode("a"), b = cmpNode("b");
  const head = `
    <div class="cmp-head">
      ${cmpSlotHTML("a")}
      <div class="cmp-vs">vs</div>
      ${cmpSlotHTML("b")}
    </div>`;
  if (!a || !b) {
    body.innerHTML = head + `<p class="cmp-hint">${t("cmp.hint")}</p>`;
    cmpWire();
    return;
  }

  // resumo
  let winsA = 0, winsB = 0, ties = 0;
  CMP_STATS.forEach(k => {
    const va = cmpStat(a, k), vb = cmpStat(b, k);
    if (va > vb) winsA++; else if (vb > va) winsB++; else ties++;
  });
  const gA = a.grk || 1, gB = b.grk || 1;
  const sameGen = a.gen === b.gen;
  const summary = sameGen
    ? t("cmp.sameGen", { a: a.name, ra: gA, total: a.gcount, gen: GEN_LABEL[a.gen], b: b.name, rb: gB })
    : t("cmp.diffGen", { ga: GEN_LABEL[a.gen], gb: GEN_LABEL[b.gen], a: a.name, ra: a.rk, b: b.name, rb: b.rk });

  const statRow = k => {
    const va = cmpStat(a, k), vb = cmpStat(b, k);
    const max = Math.max(va, vb);
    const da = va - vb;
    const cls = da > 0 ? "up" : da < 0 ? "down" : "eq";
    const arrow = da > 0 ? "▲" : da < 0 ? "▼" : "=";
    return `<div class="cmp-row">
      <div class="cmp-cell a"><span>${fmt(va)}</span>${cmpBar(va, max, "#4a90e2")}</div>
      <div class="cmp-lab">${k}<em class="${cls}">${da === 0 ? "=" : (da > 0 ? "+" : "") + fmt(da)}</em></div>
      <div class="cmp-cell b"><span>${fmt(vb)}</span>${cmpBar(vb, max, "#b07cc6")}</div>
      <div class="cmp-flag ${cls}">${arrow}</div>
    </div>`;
  };

  const attr3 = ["Vaccine", "Data", "Virus"];
  const resRow = (label, vals, colorOf) => `<div class="cmp-row">
      <div class="cmp-cell a"><div class="cmp-chips">${vals.a.map(v => `<span class="tchip" style="border-color:${colorOf(v)}66;color:${colorOf(v)}">${v}</span>`).join("") || '<span class="cmp-none">—</span>'}</div></div>
      <div class="cmp-lab">${label}</div>
      <div class="cmp-cell b"><div class="cmp-chips">${vals.b.map(v => `<span class="tchip" style="border-color:${colorOf(v)}66;color:${colorOf(v)}">${v}</span>`).join("") || '<span class="cmp-none">—</span>'}</div></div>
      <div class="cmp-flag"></div>
    </div>`;

  const weakOf = n => ELEMENTS.filter(e => (n.resE || {})[e] > 1);
  const strongOf = n => ELEMENTS.filter(e => {
    const v = (n.resE || {})[e];
    return v < 1 && v > 0;
  });
  const weakA = weakOf(a), weakB = weakOf(b);
  const strongA = strongOf(a), strongB = strongOf(b);
  const onlyA = weakA.filter(e => !weakB.includes(e));
  const onlyB = weakB.filter(e => !weakA.includes(e));
  const shared = weakA.filter(e => weakB.includes(e));

  const skillsA = [...(a.special || [])], skillsB = [...(b.special || [])];

  body.innerHTML = head + `
    <p class="cmp-summary">${summary} ${winsA || winsB ? t("cmp.statsWin", { a: a.name, wa: winsA, b: b.name, wb: winsB, ties: ties ? t("cmp.ties", { n: ties }) : "" }) : ""}</p>
    <div class="cmp-table">
      <div class="cmp-row cmp-th">
        <div class="cmp-cell a">${a.name}</div>
        <div class="cmp-lab">${t("filters.attr")}</div>
        <div class="cmp-cell b">${b.name}</div>
        <div class="cmp-flag"></div>
      </div>
      <div class="cmp-row">
        <div class="cmp-cell a"><span>${GEN_LABEL[a.gen] || a.gen}</span></div>
        <div class="cmp-lab">${t("cmp.gen")}</div>
        <div class="cmp-cell b"><span>${GEN_LABEL[b.gen] || b.gen}</span></div>
        <div class="cmp-flag"></div>
      </div>
      <div class="cmp-row">
        <div class="cmp-cell a"><div class="cmp-chips"><span class="tchip" style="border-color:${ATTR_COLOR[a.attr]}66;color:${ATTR_COLOR[a.attr]}">${a.attr}</span></div></div>
        <div class="cmp-lab">${t("filters.attr")}</div>
        <div class="cmp-cell b"><div class="cmp-chips"><span class="tchip" style="border-color:${ATTR_COLOR[b.attr]}66;color:${ATTR_COLOR[b.attr]}">${b.attr}</span></div></div>
        <div class="cmp-flag"></div>
      </div>
      <div class="cmp-row">
        <div class="cmp-cell a"><span class="cmp-tier" style="color:${TIER_COLOR[a.gtier]}">${a.gtier} <em>#${a.grk}/${a.gcount}</em></span></div>
        <div class="cmp-lab">${t("cmp.tierGen")}</div>
        <div class="cmp-cell b"><span class="cmp-tier" style="color:${TIER_COLOR[b.gtier]}">${b.gtier} <em>#${b.grk}/${b.gcount}</em></span></div>
        <div class="cmp-flag ${(a.grk || 999) < (b.grk || 999) ? "up" : (a.grk || 999) > (b.grk || 999) ? "down" : ""}">${(a.grk || 999) < (b.grk || 999) ? "▲" : (a.grk || 999) > (b.grk || 999) ? "▼" : "="}</div>
      </div>
      ${!sameGen ? `<div class="cmp-row">
        <div class="cmp-cell a"><span>${a.tier} <em>#${a.rk}</em></span></div>
        <div class="cmp-lab">${t("cmp.tierRoster")}</div>
        <div class="cmp-cell b"><span>${b.tier} <em>#${b.rk}</em></span></div>
        <div class="cmp-flag"></div>
      </div>` : ""}
      <div class="cmp-sep">${t("cmp.stats")}</div>
      ${CMP_STATS.map(statRow).join("")}
      <div class="cmp-sep">${t("cmp.res")}</div>
      ${resRow(t("cmp.weak"), { a: weakA, b: weakB }, e => EL_COLOR[e])}
      ${resRow(t("cmp.resists"), { a: strongA, b: strongB }, e => EL_COLOR[e])}
      ${resRow(t("cmp.onlyA"), { a: onlyA, b: [] }, e => EL_COLOR[e])}
      ${resRow(t("cmp.onlyB"), { a: [], b: onlyB }, e => EL_COLOR[e])}
      <div class="cmp-sep">${t("detail.specials")}</div>
      <div class="cmp-row">
        <div class="cmp-cell a"><ul class="cmp-skills">${skillsA.map(s => `<li><b style="color:${EL_COLOR[s.el] || "#ddd"}">${s.name}</b> <em>${s.el || ""} · ${s.sp || ""}SP</em></li>`).join("") || '<li class="cmp-none">—</li>'}</ul></div>
        <div class="cmp-lab">${t("cmp.specials")}</div>
        <div class="cmp-cell b"><ul class="cmp-skills">${skillsB.map(s => `<li><b style="color:${EL_COLOR[s.el] || "#ddd"}">${s.name}</b> <em>${s.el || ""} · ${s.sp || ""}SP</em></li>`).join("") || '<li class="cmp-none">—</li>'}</ul></div>
        <div class="cmp-flag"></div>
      </div>
      ${shared.length ? `<p class="cmp-shared">${t("cmp.shared", { list: shared.join(", ") })}</p>` : ""}
    </div>`;
  cmpWire();
}

function cmpWire() {
  document.querySelectorAll("#compare [data-act]").forEach(b => {
    b.onclick = () => {
      const side = b.dataset.side;
      const act = b.dataset.act;
      if (act === "limpar") cmpState[side] = null;
      if (act === "trocar") { const t = cmpState.a; cmpState.a = cmpState.b; cmpState.b = t; }
      if (act === "ficha") {
        const n = cmpNode(side);
        if (n) { closeCompare(); openNodeBySlug(n.slug); return; }
      }
      renderCompare();
    };
  });
  ["a", "b"].forEach(side => {
    const inp = document.getElementById("cmp-q-" + side);
    if (!inp) return;
    inp.oninput = () => {
      const box = document.getElementById("cmp-sug-" + side);
      const list = cmpSuggest(inp.value);
      box.innerHTML = list.map(n => `<button class="cmp-sugg" data-side="${side}" data-name="${n.name}">
        ${n.img ? `<img src="${n.img}" alt="">` : ""}
        <span>${n.name}</span>
        <em>${GEN_LABEL[n.gen] || n.gen} · ${n.attr} · ${n.gtier} #${n.grk}</em>
      </button>`).join("");
      box.querySelectorAll(".cmp-sugg").forEach(btn => {
        btn.onclick = () => {
          cmpState[btn.dataset.side] = btn.dataset.name;
          renderCompare();
        };
      });
    };
    inp.onkeydown = ev => {
      if (ev.key === "Enter") {
        const first = document.querySelector("#cmp-sug-" + side + " .cmp-sugg");
        if (first) first.click();
      }
    };
  });
}
