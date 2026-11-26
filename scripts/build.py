#!/usr/bin/env python3
"""Monta o SPA: junta dados (md + html) e inlina tudo em dist/index.html."""
import base64, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
CAT = json.load(open(os.path.join(D, "catalog.json")))["collectionArraySchema"]["collectionItems"]
NAMES = {i["name"] for i in CAT}

md = {}
if os.path.exists(os.path.join(D, "digimon_md.json")):
    md = {n["name"]: n for n in json.load(open(os.path.join(D, "digimon_md.json")))}
html_nodes = {}
if os.path.exists(os.path.join(D, "digimon.json")):
    html_nodes = {n["name"]: n for n in json.load(open(os.path.join(D, "digimon.json")))["nodes"]}


def pick(a, b, key, default):
    if a and a.get(key) not in (None, "", [], {}):
        return a[key]
    if b and b.get(key) not in (None, "", [], {}):
        return b[key]
    return default


IMG = {}
_imdir = os.path.join(ROOT, "img")
if os.path.isdir(_imdir):
    for f in os.listdir(_imdir):
        if f.endswith(".webp"):
            with open(os.path.join(_imdir, f), "rb") as fh:
                IMG[f[:-5]] = "data:image/webp;base64," + base64.b64encode(fh.read()).decode()

STAT_KEYS = ["HP", "SP", "ATK", "DEF", "INT", "SPI", "SPD"]


def pct_rank(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    out = [0.0] * len(vals)
    n = max(1, len(vals) - 1)
    for r, i in enumerate(order):
        out[i] = r / n * 100
    return out


def _stat(n, k):
    try:
        return int((n.get("stats") or {}).get(k) or 0)
    except Exception:
        return 0


def utility(n):
    """Utilidade = suporte + type-killer + shred de resistência (texto da skill)."""
    su = tk = sh = 0
    for s in (n.get("special") or []) + (n.get("skills") or []):
        kind = (s.get("kind") or "").lower()
        eff = (s.get("eff") or "").lower()
        if kind in ("buff", "debuff", "recovery", "status ailment"):
            su += 1
        if "increased damage to targets with" in eff:
            tk += 1
        if "resistance" in eff and ("lower" in eff or "reduc" in eff):
            sh += 1
        elif re.search(r"(lower|reduc\w*)[^.]{0,40}\b(atk|def|int|spi)\b", eff):
            su += 1
    return su * 1.0 + tk * 1.5 + sh * 2.0


def _score_group(nodes, pre=""):
    """Percentis DENTRO do grupo -> (pow, ut, sc) por índice."""
    tot = [sum(_stat(n, k) for k in STAT_KEYS) for n in nodes]
    bulk = [_stat(n, "HP") * (_stat(n, "DEF") + _stat(n, "SPI")) for n in nodes]
    off = [max(_stat(n, "ATK"), _stat(n, "INT")) for n in nodes]
    spd = [_stat(n, "SPD") for n in nodes]
    pt, pb, po, ps = pct_rank(tot), pct_rank(bulk), pct_rank(off), pct_rank(spd)
    pu = pct_rank([utility(n) for n in nodes])
    power = [0.45 * pt[i] + 0.30 * pb[i] + 0.15 * po[i] + 0.10 * ps[i] for i in range(len(nodes))]
    score = [0.6 * power[i] + 0.4 * pu[i] for i in range(len(nodes))]
    return power, pu, score


def _assign(nodes, power, pu, score, pre="", label=None):
    """Grava rank/tier. Com pre != "" usa as chaves g* (ranking dentro da geração)."""
    order = sorted(range(len(nodes)), key=lambda i: -score[i])
    n = max(1, len(nodes))
    for rank, i in enumerate(order, 1):
        nd = nodes[i]
        nd[pre + "pow"] = round(power[i], 1)
        nd[pre + "ut"] = round(pu[i], 1)
        nd[pre + "sc"] = round(score[i], 1)
        nd[pre + "rk"] = rank
        p = rank / n
        nd[pre + "tier"] = ("S" if p <= 0.08 else "A" if p <= 0.25 else "B" if p <= 0.50
                            else "C" if p <= 0.78 else "D")
        if pre:
            nd["gcount"] = n
            nd["glabel"] = label


def skill_kind(eff, kind=None):
    """A base HTML trouxe o SP no campo `kind`; recupera o tipo pelo texto do efeito."""
    if kind and not str(kind).strip().isdigit():
        return kind
    t = (eff or "").lower()
    if "physical" in t or "physical attack" in t:
        return "Physical"
    if "magic" in t:
        return "Magic"
    if "recover" in t or "restore" in t or "heal" in t:
        return "Recovery"
    if t.startswith("removes") and ("buff" in t or "abnormalit" in t or "injury" in t):
        return "Debuff" if "stat buffs" in t else "Buff"
    if "lower" in t or "reduce" in t or "decrease" in t:
        return "Debuff"
    if "boost" in t or "increase" in t or "raise" in t or "cure" in t:
        return "Buff"
    if "chance" in t or "apply" in t:
        return "Status Ailment"
    return kind or ""


def norm_skills(items):
    out = []
    for s in items or []:
        if not isinstance(s, dict):
            continue
        s = dict(s)
        s["kind"] = skill_kind(s.get("eff"), s.get("kind"))
        out.append(s)
    return out


def score_nodes(nodes):
    """Força global (os 475) e força relativa à geração (comparação justa)."""
    power, pu, score = _score_group(nodes)
    _assign(nodes, power, pu, score)
    # por geração: percentis recalculados só entre os pares
    groups = {}
    for n in nodes:
        groups.setdefault(n.get("gen") or "?", []).append(n)
    for gen, group in groups.items():
        if len(group) < 2:
            for nd in group:
                nd["gpow"], nd["gut"], nd["gsc"] = nd["pow"], nd["ut"], nd["sc"]
                nd["grk"], nd["gtier"], nd["gcount"] = 1, nd["tier"], 1
                nd["glabel"] = gen
            continue
        gp, gu, gs = _score_group(group)
        _assign(group, gp, gu, gs, pre="g", label=gen)
        for nd in group:
            nd.setdefault("glabel", gen)


nodes, edges, missing = [], {}, []
for item in CAT:
    a, b = md.get(item["name"]), html_nodes.get(item["name"])
    if not a and not b:
        missing.append(item["name"])
    node = {
        "n": int(item["number"]),
        "name": item["name"],
        "attr": item["attribute"],
        "gen": item["generation"],
        "pers": pick(a, b, "pers", item["basePersonality"]),
        "rank": item["agentRankReq"],
        "type": pick(a, b, "type", ""),
        "traits": pick(a, b, "traits", []),
        "stats": pick(a, b, "stats", {}),
        "special": norm_skills(pick(a, b, "special", [])),
        "skills": norm_skills(pick(a, b, "skills", [])),
        "desc": pick(a, b, "desc", ""),
        "resA": pick(a, b, "resA", {}),
        "resE": pick(a, b, "resE", {}),
        "img": IMG.get(item["url"].split("/")[-1], ""),
        "partial": not (a or b),
    }
    nodes.append(node)
    evos = (a or {}).get("evos") or (b or {}).get("evos") or []
    pre = (a or {}).get("pre") or (b or {}).get("pre") or []
    enter = (a or {}).get("enter") or (b or {}).get("enter")
    for e in evos:
        t = e.get("to")
        if t in NAMES:
            edges[(node["name"], t)] = e.get("req") or {"rank": None, "stats": {}, "other": []}
    for p in pre:
        if p in NAMES and p != node["name"] and (p, node["name"]) not in edges:
            edges[(p, node["name"])] = {"rank": None, "stats": {}, "other": ["via de-digivolução"]}

edge_list = [{"s": s, "t": t, "req": r} for (s, t), r in edges.items()]
payload = {
    "nodes": nodes,
    "edges": edge_list,
    "meta": {
        "stats": "nível 99 com Agent Skills maximizados",
        "built": "2026-11",
        "no_edges": [n["name"] for n in nodes if not any(e["s"] == n["name"] or e["t"] == n["name"] for e in edge_list)],
    },
}

score_nodes(nodes)

data_js = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
tpl = open(os.path.join(ROOT, "src", "index.template.html"), encoding="utf-8").read()
eng = open(os.path.join(ROOT, "src", "engine.js"), encoding="utf-8").read()
ren = open(os.path.join(ROOT, "src", "render.js"), encoding="utf-8").read()
team = open(os.path.join(ROOT, "src", "team.js"), encoding="utf-8").read()
def check_i18n():
    """Chave usada e inexistente no dicionário aparece crua na interface: avisa no build."""
    import re
    files = ("render.js", "engine.js", "routes.js", "team.js", "compare.js",
             "onboarding.js", "index.template.html")
    used = set()
    for name in files:
        c = open(os.path.join(ROOT, "src", name), encoding="utf-8").read()
        used |= set(re.findall(r'\bt\(\s*"([a-zA-Z0-9_.]+)"', c))
        used |= set(re.findall(r'data-i18n(?:-title|-ph)?="([a-zA-Z0-9_.]+)"', c))
    src = open(os.path.join(ROOT, "src", "i18n.js"), encoding="utf-8").read()
    en_src, _, pt_src = src.partition("\n  pt: {")
    en = set(re.findall(r'^    "([a-zA-Z0-9_.]+)":', en_src, re.M))
    pt = set(re.findall(r'^    "([a-zA-Z0-9_.]+)":', pt_src, re.M))
    used = {k for k in used if not k.endswith(".")}  # "home." vem de concatenação dinâmica
    missing = sorted(k for k in used if k not in en or k not in pt)
    if missing:
        print("i18n: FALTANDO ->", ", ".join(missing))
    else:
        print(f"i18n: {len(used)} chaves, en e pt completos")


routes = open(os.path.join(ROOT, "src", "routes.js"), encoding="utf-8").read()
cmp = open(os.path.join(ROOT, "src", "compare.js"), encoding="utf-8").read()
i18n = open(os.path.join(ROOT, "src", "i18n.js"), encoding="utf-8").read()
onb = open(os.path.join(ROOT, "src", "onboarding.js"), encoding="utf-8").read()

out = tpl.replace('<script src="engine.js"></script>',
                  "<script>\nconst DATA = " + data_js + ";\n" + eng.split("const DATA = __DATA__;\n", 1)[-1] + "\n</script>")
out = out.replace('<script src="render.js"></script>', "<script>\n" + ren + "\n</script>")
out = out.replace('<script src="team.js"></script>', "<script>\n" + team + "\n</script>")
out = out.replace('<script src="routes.js"></script>', "<script>\n" + routes + "\n</script>")
out = out.replace('<script src="compare.js"></script>', "<script>\n" + cmp + "\n</script>")
out = out.replace('<script src="i18n.js"></script>', "<script>\n" + i18n + "\n</script>")
out = out.replace('<script src="onboarding.js"></script>', "<script>\n" + onb + "\n</script>")
os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
dst = os.path.join(ROOT, "dist", "index.html")
open(dst, "w", encoding="utf-8").write(out)

print(f"nós: {len(nodes)}  arestas: {len(edge_list)}  sem ficha: {len(missing)}")
print("sem aresta:", len(payload["meta"]["no_edges"]), payload["meta"]["no_edges"][:8])
check_i18n()
sem_stats = [n["name"] for n in nodes if len(n["stats"]) < 7]
print("sem stats:", len(sem_stats), sem_stats[:6])
print(f"arquivo: {dst}  ({os.path.getsize(dst)/1024/1024:.2f} MB)")
