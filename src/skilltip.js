/* ============================================================
   SKILLTIP — cartão flutuante com os detalhes de uma skill
   Qualquer elemento com data-skill="<nome>" mostra o cartão no
   hover/focus (e no toque, em telas pequenas).
   ============================================================ */

let SKILL_DB = null;

function skillDB() {
  if (SKILL_DB) return SKILL_DB;
  const db = new Map();
  const add = (s, kindOf) => {
    if (!s || !s.name) return;
    const prev = db.get(s.name);
    if (prev && prev.kindOf === "signature") return;
    db.set(s.name, {
      name: s.name,
      el: s.el || "",
      sp: s.sp || "",
      kind: s.kind || "",
      eff: (s.eff || "").replace(/\*\*/g, ""),
      kindOf,
      users: prev ? prev.users : 0,
    });
  };
  DATA.nodes.forEach(n => {
    (n.special || []).forEach(s => add(s, "signature"));
    (n.skills || []).forEach(s => {
      const cur = db.get(s.name);
      if (cur) { cur.users++; return; }
      add(s, "attachment");
      const e = db.get(s.name);
      if (e) e.users = 1;
    });
  });
  SKILL_DB = db;
  return db;
}

function skillMeta(name) {
  const e = skillDB().get(name);
  if (!e) return null;
  const eff = e.eff;
  const pw = /power\s+(\d+(?:\.\d+)?)/i.exec(eff);
  const hits = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*hit/i.exec(eff);
  const tgt = /target\s*:\s*([^.|]+)/i.exec(eff);
  return { ...e, power: pw ? pw[1] : null, hits: hits ? { base: hits[1], n: hits[2] } : null, target: tgt ? tgt[1].trim() : "" };
}

function skillTipHTML(name) {
  const m = skillMeta(name);
  if (!m) return "";
  const elColor = EL_COLOR[m.el] || "#8b98ab";
  const chips = [];
  if (m.el && m.el !== "No Element" && m.el !== "Null") chips.push(`<span class="st-el" style="color:${elColor};border-color:${elColor}55">${m.el}</span>`);
  if (m.kind) chips.push(`<span class="st-kind">${t("sk.kind." + String(m.kind).replace(" ", ""))}</span>`);
  if (m.sp) chips.push(`<span class="st-sp">${m.sp} SP</span>`);

  const rows = [];
  if (m.power) {
    const dmg = m.hits ? `${m.power} × ${m.hits.n}` : m.power;
    rows.push(`<div class="st-row"><span>${t("tip.power")}</span><b>${dmg}</b></div>`);
  }
  if (m.target) rows.push(`<div class="st-row"><span>${t("tip.target")}</span><b>${m.target}</b></div>`);
  if (m.kindOf === "signature") rows.push(`<div class="st-row"><span>${t("tip.type")}</span><b>${t("tip.signature")}</b></div>`);
  else rows.push(`<div class="st-row"><span>${t("tip.type")}</span><b>${t("tip.attachment")}</b></div>`);
  if (m.kindOf === "attachment" && m.users) rows.push(`<div class="st-row"><span>${t("tip.unlockedBy")}</span><b>${m.users}</b></div>`);

  return `
    <div class="st-head"><b>${m.name}</b></div>
    <div class="st-chips">${chips.join("")}</div>
    ${rows.length ? `<div class="st-rows">${rows.join("")}</div>` : ""}
    ${m.eff ? `<p class="st-eff">${m.eff}</p>` : ""}`;
}

function ensureTip() {
  let tip = document.getElementById("skilltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "skilltip";
    document.body.appendChild(tip);
  }
  return tip;
}

function showTip(el) {
  const name = el.dataset.skill;
  if (!name) return;
  const html = skillTipHTML(name);
  if (!html) return;
  const tip = ensureTip();
  tip.innerHTML = html;
  tip.classList.add("on");

  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const M = 8;
  // alvo fora da tela (mobile): centraliza antes de medir
  const r0 = el.getBoundingClientRect();
  if (r0.top < 70 || r0.bottom > window.innerHeight - 70) el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  let left = Math.min(window.innerWidth - tw - M, Math.max(M, r.left + r.width / 2 - tw / 2));
  let top = r.bottom + 6;
  if (top + th > window.innerHeight - M) top = r.top - th - 6;
  top = Math.min(Math.max(M, top), Math.max(M, window.innerHeight - th - M));
  tip.style.left = left + "px";
  tip.style.top = top + "px";
  tip.dataset.active = name;
  window.__skTipAt = Date.now();  // ignora o scroll disparado pelo próprio scrollIntoView
}

function hideTip() {
  const tip = document.getElementById("skilltip");
  if (tip) { tip.classList.remove("on"); tip.dataset.active = ""; }
}

function initSkillTip() {
  if (window.__skTipBound) return;
  window.__skTipBound = true;
  let timer = null;
  document.addEventListener("mouseover", ev => {
    const el = ev.target.closest("[data-skill]");
    if (!el) return;
    clearTimeout(timer);
    timer = setTimeout(() => showTip(el), 120);
  });
  document.addEventListener("mouseout", ev => {
    if (ev.target.closest("[data-skill]")) { clearTimeout(timer); hideTip(); }
  });
  document.addEventListener("focusin", ev => {
    const el = ev.target.closest("[data-skill]");
    if (el) showTip(el);
  });
  document.addEventListener("focusout", ev => {
    if (ev.target.closest("[data-skill]")) hideTip();
  });
  // toque (ou clique): mostra; clicar de novo na mesma skill esconde
  document.addEventListener("click", ev => {
    const el = ev.target.closest("[data-skill]");
    if (!el) return;
    const tip = document.getElementById("skilltip");
    if (tip && tip.classList.contains("on") && tip.dataset.active === el.dataset.skill) { hideTip(); return; }
    showTip(el);
  });
  window.addEventListener("scroll", () => {
    if (Date.now() - (window.__skTipAt || 0) < 300) return;
    hideTip();
  }, true);
  window.addEventListener("resize", hideTip);
}
