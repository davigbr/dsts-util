/* ============================================================
   ONBOARDING — página inicial + tutorial guiado (spotlight)
   ============================================================ */

const HOME_FEATURES = [
  { k: "map", icon: "◈" },
  { k: "profile", icon: "◉" },
  { k: "power", icon: "▲" },
  { k: "team", icon: "✚" },
  { k: "routes", icon: "⇢" },
  { k: "compare", icon: "⇄" },
];

function homeSeen() {
  try { return localStorage.getItem("dvz.home") === "1"; } catch (e) { return true; }
}
function markHomeSeen() {
  try { localStorage.setItem("dvz.home", "1"); } catch (e) {}
}

function renderHome() {
  const feats = document.getElementById("home-feats");
  if (!feats) return;
  feats.innerHTML = HOME_FEATURES.map(f => `
    <div class="hf">
      <span class="hf-ic">${f.icon}</span>
      <div>
        <b>${t("home." + f.k + ".t")}</b>
        <p>${t("home." + f.k + ".d")}</p>
      </div>
    </div>`).join("");
  const stats = document.getElementById("home-stats");
  if (stats) {
    const skills = DATA.nodes.reduce((s, n) => s + (n.special || []).length + (n.skills || []).length, 0);
    const edges = DATA.edges.length;
    stats.innerHTML = [
      [DATA.nodes.length, t("home.statNodes")],
      [edges.toLocaleString(LANG === "pt" ? "pt-BR" : "en-US"), t("home.statEdges")],
      [skills.toLocaleString(LANG === "pt" ? "pt-BR" : "en-US"), t("home.statSkills")],
      [11, t("home.statElems")],
    ].map(([v, l]) => `<div class="hs"><b>${v}</b><span>${l}</span></div>`).join("");
  }
}

function openHome() {
  renderHome();
  const h = document.getElementById("home");
  if (!h) return;
  h.classList.add("open");
  document.body.classList.add("home-open");
}
function closeHome() {
  const h = document.getElementById("home");
  if (h) h.classList.remove("open");
  document.body.classList.remove("home-open");
}

/* ---------------- tutorial guiado ---------------- */

let tourIdx = 0;
let tourSteps = [];

function tourDefs() {
  return [
    {
      sel: "#search",
      place: "bottom",
      t: "tour.search.t", d: "tour.search.d",
      before: () => { if (typeof closeHome === "function") closeHome(); if (typeof closeDetail === "function") closeDetail(); },
    },
    {
      sel: "#f-attrs",
      place: "right",
      t: "tour.filters.t", d: "tour.filters.d",
      before: () => {
        document.body.classList.add("filters-open");
      },
    },
    {
      sel: "#stage canvas",
      place: "center",
      t: "tour.graph.t", d: "tour.graph.d",
      before: () => { document.body.classList.remove("filters-open"); },
    },
    {
      sel: "#detail .d-name-row",
      place: "left",
      t: "tour.profile.t", d: "tour.profile.d",
      before: () => { openNodeBySlug("greymon"); },
    },
    {
      sel: "#detail .d-strength2",
      place: "left",
      t: "tour.power.t", d: "tour.power.d",
      before: () => { if (!state.selected) openNodeBySlug("greymon"); },
    },
    {
      sel: "#toggle-compare",
      place: "bottom",
      t: "tour.compare.t", d: "tour.compare.d",
      before: () => { if (typeof closeDetail === "function") closeDetail(); },
    },
    {
      sel: "#toggle-team",
      place: "bottom",
      t: "tour.team.t", d: "tour.team.d",
      before: () => {},
    },
    {
      sel: "#toggle-routes",
      place: "bottom",
      t: "tour.routes.t", d: "tour.routes.d",
      before: () => {},
    },
    {
      sel: "#viewbtn",
      place: "bottom",
      t: "tour.view.t", d: "tour.view.d",
      before: () => {},
    },
    {
      sel: "#lang",
      place: "bottom",
      t: "tour.lang.t", d: "tour.lang.d",
      before: () => {},
    },
  ];
}

function startTour() {
  tourSteps = tourDefs();
  tourIdx = 0;
  closeHome();
  document.body.classList.add("tour-on");
  const layer = document.getElementById("tour");
  if (layer) layer.classList.add("on");
  showTourStep();
  window.addEventListener("keydown", tourKeys, true);
}

function endTour(done) {
  document.body.classList.remove("tour-on");
  const layer = document.getElementById("tour");
  if (layer) layer.classList.remove("on");
  window.removeEventListener("keydown", tourKeys, true);
  try { localStorage.setItem("dvz.tour", done ? "1" : "0"); } catch (e) {}
  if (done) {
    if (typeof closeDetail === "function") closeDetail();
    document.body.classList.remove("filters-open");
    toast(t("tour.finished"));
  }
}

function tourKeys(ev) {
  if (ev.key === "Escape") { ev.preventDefault(); endTour(false); }
  else if (ev.key === "ArrowRight" || ev.key === "Enter") { ev.preventDefault(); tourNext(); }
  else if (ev.key === "ArrowLeft") { ev.preventDefault(); tourPrev(); }
}

function tourNext() {
  if (tourIdx >= tourSteps.length - 1) { endTour(true); return; }
  tourIdx++;
  showTourStep();
}
function tourPrev() {
  if (tourIdx <= 0) return;
  tourIdx--;
  showTourStep();
}

function showTourStep() {
  const step = tourSteps[tourIdx];
  if (!step) return;
  if (typeof step.before === "function") step.before();

  // espera o layout do passo (painel abrindo/fechando) antes de medir
  requestAnimationFrame(() => setTimeout(() => {
    const target = document.querySelector(step.sel);
    paintTour(step, target);
  }, 60));
}

function paintTour(step, target) {
  const hole = document.getElementById("tour-hole");
  const card = document.getElementById("tour-card");
  if (!hole || !card) return;

  let r = null;
  if (target) {
    if (target.scrollIntoView) {
      const tr = target.getBoundingClientRect();
      if (tr.top < 60 || tr.bottom > window.innerHeight - 60) {
        target.scrollIntoView({ block: "center", behavior: "instant" });
      }
    }
    r = target.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) r = null;
  }

  card.innerHTML = `
    <div class="tc-head">
      <span class="tc-step">${t("tour.step", { n: tourIdx + 1, total: tourSteps.length })}</span>
      <button class="tc-x" id="tour-skip" title="${t("tour.skip")}">×</button>
    </div>
    <h3>${t(step.t)}</h3>
    <p>${t(step.d)}</p>
    <div class="tc-foot">
      <div class="tc-dots">${tourSteps.map((_, i) => `<i class="${i === tourIdx ? "on" : ""}"></i>`).join("")}</div>
      <div class="tc-btns">
        <button class="btn ghost" id="tour-prev"${tourIdx === 0 ? " disabled" : ""}>${t("tour.back")}</button>
        <button class="btn primary" id="tour-next">${tourIdx >= tourSteps.length - 1 ? t("tour.done") : t("tour.next")}</button>
      </div>
    </div>`;

  card.querySelector("#tour-next").onclick = () => tourNext();
  card.querySelector("#tour-prev").onclick = () => tourPrev();
  card.querySelector("#tour-skip").onclick = () => endTour(false);

  const PAD = 6;
  // alvo quase do tamanho da tela: sem recorte e sem escurecer (o cartão explica)
  const tooBig = r && (r.width * r.height) > (window.innerWidth * window.innerHeight * 0.55);
  if (tooBig) r = null;
  if (r) {
    const x = Math.max(0, r.left - PAD), y = Math.max(0, r.top - PAD);
    const w = Math.min(window.innerWidth, r.width + PAD * 2), h = Math.min(window.innerHeight, r.height + PAD * 2);
    hole.style.display = "block";
    hole.style.left = x + "px";
    hole.style.top = y + "px";
    hole.style.width = w + "px";
    hole.style.height = h + "px";
    hole.style.borderRadius = (r.height > 80 ? 14 : 10) + "px";
  } else {
    hole.style.display = "none";
  }

  // posiciona o cartão
  card.style.visibility = "hidden";
  card.style.left = "0px";
  card.style.top = "0px";
  card.style.width = Math.min(360, window.innerWidth - 24) + "px";
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const M = 12;

  let left, top;
  if (!r || step.place === "center") {
    left = (vw - cw) / 2;
    top = (vh - ch) / 2;
  } else {
    const spaceBelow = vh - (r.bottom + M);
    const spaceAbove = r.top - M;
    const spaceRight = vw - (r.right + M);
    const spaceLeft = r.left - M;

    if (step.place === "right" && spaceRight >= cw) {
      left = r.right + M; top = r.top + r.height / 2 - ch / 2;
    } else if (step.place === "left" && spaceLeft >= cw) {
      left = r.left - cw - M; top = r.top + r.height / 2 - ch / 2;
    } else if (step.place === "bottom" && spaceBelow >= ch) {
      left = r.left + r.width / 2 - cw / 2; top = r.bottom + M;
    } else if (spaceBelow >= ch) {
      left = Math.min(vw - cw - M, Math.max(M, r.left + r.width / 2 - cw / 2)); top = r.bottom + M;
    } else if (spaceAbove >= ch) {
      left = Math.min(vw - cw - M, Math.max(M, r.left + r.width / 2 - cw / 2)); top = r.top - ch - M;
    } else {
      left = (vw - cw) / 2; top = (vh - ch) / 2;
    }
  }
  left = Math.min(vw - cw - M, Math.max(M, left));
  top = Math.min(vh - ch - M, Math.max(M, top));
  card.style.left = left + "px";
  card.style.top = top + "px";
  card.style.visibility = "visible";
}

function initOnboarding() {
  const start = document.getElementById("home-start");
  if (start) start.onclick = () => { markHomeSeen(); closeHome(); };
  const tourBtn = document.getElementById("home-tour");
  if (tourBtn) tourBtn.onclick = () => { markHomeSeen(); startTour(); };
  const skip = document.getElementById("home-skip");
  if (skip) skip.onclick = () => { markHomeSeen(); closeHome(); };
  const again = document.getElementById("replay-tour");
  if (again) again.onclick = () => {
    const menu = document.getElementById("viewmenu");
    if (menu) menu.classList.remove("open");
    startTour();
  };
  const homeBtn = document.getElementById("home-btn");
  if (homeBtn) homeBtn.onclick = () => openHome();

  window.addEventListener("resize", () => {
    if (document.getElementById("tour")?.classList.contains("on")) {
      paintTour(tourSteps[tourIdx], document.querySelector(tourSteps[tourIdx].sel));
    }
  });

  if (!homeSeen()) openHome();
}
