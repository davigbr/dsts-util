/* ============================================================
   SKILLS — catálogo de attachment skills (discos)
   Cada skill diz quem a destrava e em que nível; qualquer Digimon
   pode equipar qualquer uma delas (4 slots).
   ============================================================ */

const SK_KINDS = ["Physical", "Magic", "Buff", "Debuff", "Recovery", "Status Ailment"];
const SK = { q: "", kind: "", el: "", sort: "name", expanded: new Set() };
let SKILL_INDEX = null;

function skillIndex() {
  if (SKILL_INDEX) return SKILL_INDEX;
  const map = new Map();
  DATA.nodes.forEach(n => (n.skills || []).forEach(s => {
    if (!s || !s.name) return;
    let e = map.get(s.name);
    if (!e) {
      e = { name: s.name, el: s.el || "", sp: +s.sp || 0, kind: s.kind || "", eff: s.eff || "", owners: [] };
      map.set(s.name, e);
    }
    if (!e.owners.some(o => o.slug === n.slug)) e.owners.push({ name: n.name, slug: n.slug, lv: +s.lv || 0 });
  }));
  map.forEach(e => e.owners.sort((a, b) => (a.lv || 999) - (b.lv || 999)));
  SKILL_INDEX = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return SKILL_INDEX;
}

function skFiltered() {
  const q = SK.q.trim().toLowerCase();
  let list = skillIndex().filter(s => {
    if (SK.kind && s.kind !== SK.kind) return false;
    if (SK.el && s.el !== SK.el) return false;
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.eff || "").toLowerCase().includes(q);
  });
  if (SK.sort === "shared") list.sort((a, b) => b.owners.length - a.owners.length || a.name.localeCompare(b.name));
  else if (SK.sort === "sp") list.sort((a, b) => a.sp - b.sp || a.name.localeCompare(b.name));
  else list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function skOwnerHTML(o) {
  return `<button class="sk-ow" data-slug="${o.slug}">${o.name}${o.lv ? `<i>Lv.${o.lv}</i>` : ""}</button>`;
}

function skCardHTML(s) {
  const owners = s.owners;
  const open = SK.expanded.has(s.name);
  const shown = open ? owners : owners.slice(0, 6);
  const rest = owners.length - shown.length;
  const elChip = s.el && s.el !== "No Element"
    ? `<span class="el" style="color:${EL_COLOR[s.el] || "var(--muted)"};border-color:${(EL_COLOR[s.el] || "#666")}55">${s.el}</span>`
    : `<span class="el">—</span>`;
  return `
    <article class="sk-card">
      <div class="sk-head">
        <span class="sk-name">${s.name}</span>
        ${elChip}
        <span class="sp">${s.sp ? s.sp + " SP" : ""}</span>
        <span class="kind">${s.kind ? t("sk.kind." + s.kind.replace(" ", "")) : ""}</span>
      </div>
      <p class="sk-eff">${(s.eff || "").replace(/\*\*/g, "")}</p>
      <div class="sk-owners">
        <span class="sk-ow-lab">${t("sk.unlockedBy", { n: owners.length })}</span>
        ${shown.map(skOwnerHTML).join("")}
        ${rest > 0 ? `<button class="sk-more" data-more="${s.name}">${t("sk.more", { n: rest })}</button>` : ""}
      </div>
    </article>`;
}

function renderSkills() {
  const body = document.getElementById("sk-body");
  const cnt = document.getElementById("sk-count");
  if (!body) return;
  const list = skFiltered();
  if (cnt) cnt.textContent = t("sk.count", { n: list.length, total: skillIndex().length });
  if (!list.length) {
    body.innerHTML = `<p class="sk-empty">${t("sk.empty")}</p>`;
    return;
  }
  body.innerHTML = list.map(skCardHTML).join("");
}

function openSkills() {
  const box = document.getElementById("skills");
  if (!box) return;
  if (typeof closeHome === "function") closeHome();
  if (typeof closeCompare === "function") closeCompare();
  if (document.getElementById("routes")?.classList.contains("open") && typeof closeRoutes === "function") closeRoutes();
  box.classList.add("open");
  renderSkills();
  const q = document.getElementById("sk-q");
  if (q && window.innerWidth > 720) q.focus();
}

function closeSkills() {
  document.getElementById("skills")?.classList.remove("open");
}

function toggleSkills() {
  const box = document.getElementById("skills");
  if (box && box.classList.contains("open")) closeSkills();
  else openSkills();
}

let SK_BOUND = false;
function initSkills() {
  const btn = document.getElementById("toggle-skills");
  if (btn) btn.onclick = toggleSkills;
  const close = document.getElementById("sk-close");
  if (close) close.onclick = closeSkills;

  const q = document.getElementById("sk-q");
  if (q) q.oninput = () => { SK.q = q.value; renderSkills(); };

  const kind = document.getElementById("sk-kind");
  if (kind) {
    kind.innerHTML = `<option value="">${t("sk.allKinds")}</option>` +
      SK_KINDS.map(k => `<option value="${k}">${t("sk.kind." + k.replace(" ", ""))}</option>`).join("");
    kind.value = SK.kind;
    kind.onchange = () => { SK.kind = kind.value; renderSkills(); };
  }

  const el = document.getElementById("sk-el");
  if (el) {
    el.innerHTML = `<option value="">${t("sk.allElems")}</option>` +
      ELEMENTS.map(e => `<option value="${e}">${e}</option>`).join("");
    el.value = SK.el;
    el.onchange = () => { SK.el = el.value; renderSkills(); };
  }

  const sort = document.getElementById("sk-sort");
  if (sort) {
    sort.innerHTML = `<option value="name">${t("sk.sortName")}</option>
      <option value="shared">${t("sk.sortShared")}</option>
      <option value="sp">${t("sk.sortSp")}</option>`;
    sort.value = SK.sort;
    sort.onchange = () => { SK.sort = sort.value; renderSkills(); };
  }

  document.getElementById("sk-body")?.addEventListener("click", ev => {
    const own = ev.target.closest(".sk-ow");
    if (own) { closeSkills(); openNodeBySlug(own.dataset.slug); return; }
    const more = ev.target.closest(".sk-more");
    if (more) {
      const nm = more.dataset.more;
      SK.expanded.add(nm);
      renderSkills();
    }
  });

  if (SK_BOUND) { if (document.getElementById("skills")?.classList.contains("open")) renderSkills(); return; }
  SK_BOUND = true;
  window.addEventListener("keydown", ev => {
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") {
      if (ev.key === "Escape") closeSkills();
      return;
    }
    if ((ev.key === "s" || ev.key === "S") && !ev.metaKey && !ev.ctrlKey && !ev.altKey) toggleSkills();
    if (ev.key === "Escape" && document.getElementById("skills")?.classList.contains("open")) closeSkills();
  });
}
