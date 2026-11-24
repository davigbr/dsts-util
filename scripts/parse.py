#!/usr/bin/env python3
"""Parse das 475 fichas do Game8 -> data/digimon.json (nós + arestas de digivolução)."""
import json, os, re, html, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "pages")
CAT = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
STAT_KEYS = ["HP", "SP", "ATK", "DEF", "INT", "SPI", "SPD"]
NAME_SET = {i["name"] for i in CAT}
ATTR_ORDER = ["Vaccine", "Data", "Virus"]
EL_ORDER = ["Fire", "Water", "Plant", "Ice", "Electricity", "Earth", "Steel", "Wind", "Light", "Dark", "Null"]
EL_ALIAS = {"Elec": "Electricity"}
SYMS = {"-", "△", "Δ", "⭘", "〇", "○", "◯", "◎", "X", "x", "✕", "ー", "╳", "✗", "✖"}


def mult(sym):
    sym = (sym or "").strip()
    if sym == "◎":
        return 2.0
    if sym in ("⭘", "〇", "○", "O", "◯"):
        return 1.5
    if sym in ("△", "Δ"):
        return 0.5
    if sym in ("X", "x", "✕", "╳", "✗", "✖"):
        return 0.0
    return 1.0


def norm_key(t):
    t = re.sub(r"\s*Icon$", "", (t or "").strip(), flags=re.I)
    return EL_ALIAS.get(t, t)


def table_res(rows, order):
    out, i = {}, 0
    while i + 1 < len(rows):
        heads = [norm_key(c["t"]) for c in rows[i]]
        for h, c in zip(heads, rows[i + 1]):
            if h in order:
                out[h] = mult(c["alt"][0] if c["alt"] else c["t"])
        i += 2
    return out


def cells_of(row_html):
    out = []
    for c in re.findall(r"<t[hd][^>]*>.*?</t[hd]>", row_html, re.S):
        alt = re.findall(r"alt=['\"]([^'\"]*)['\"]", c)
        txt = html.unescape(re.sub(r"<[^>]+>", " ", c))
        txt = re.sub(r"\s+", " ", txt).strip(" |")
        out.append({"t": txt, "alt": [a for a in alt if a and a.lower() not in ("image",)]})
    return out


def tables(raw):
    res = []
    for tm in re.finditer(r"<table.*?</table>", raw, re.S):
        rows = [cells_of(r) for r in re.findall(r"<tr.*?</tr>", tm.group(0), re.S)]
        rows = [r for r in rows if r]
        if rows:
            res.append(rows)
    return res


def parse_req(txt):
    rank, stats, extra = None, {}, []
    for part in re.split(r"[・•]", txt):
        p = part.strip()
        if not p:
            continue
        m = re.search(r"Agent Rank (\d+)", p)
        if m:
            rank = int(m.group(1))
            continue
        m = re.search(r"([\d,]+)\+\s*(Max )?([A-Z]{2,3})", p)
        if m:
            stats[m.group(3)] = int(m.group(1).replace(",", ""))
            continue
        if p not in ("", "-"):
            extra.append(p)
    return {"rank": rank, "stats": stats, "other": extra}


def parse(item):
    aid = item["url"].split("/")[-1]
    p = os.path.join(PAGES, aid + ".html")
    if not os.path.exists(p):
        return None
    raw = open(p, encoding="utf-8", errors="replace").read()
    tbs = tables(raw)
    node = {
        "n": int(item["number"]), "name": item["name"], "attr": item["attribute"],
        "gen": item["generation"], "pers": item["basePersonality"],
        "rank": item["agentRankReq"], "url": item["url"],
        "type": "", "traits": [], "stats": {}, "special": [], "skills": [],
        "evos": [], "pre": [], "resA": {}, "resE": {},
    }
    for rows in tbs:
        head = " ".join(c["t"] for c in rows[0])
        if "Field Guide" in head:
            for idx, r in enumerate(rows):
                if len(r) >= 2 and r[0]["t"] == "Type" and r[1]["t"] == "Base Personality":
                    if idx + 1 < len(rows) and len(rows[idx + 1]) >= 2:
                        node["type"] = rows[idx + 1][0]["t"]
                        node["pers"] = rows[idx + 1][1]["t"] or node["pers"]
        elif (len(rows) == 2 and len(rows[0]) == 3
              and all(norm_key(c["t"]) in ATTR_ORDER for c in rows[0])
              and all((c["alt"] or [""])[0] in SYMS for c in rows[1])):
            node["resA"] = table_res(rows, ATTR_ORDER)
        elif (len(rows) == 4
              and all(norm_key(c["t"]) in EL_ORDER for r in (rows[0], rows[2]) for c in r)
              and all((c["alt"] or [""])[0] in SYMS for r in (rows[1], rows[3]) for c in r)):
            node["resE"] = table_res(rows, EL_ORDER)
        elif "Stat" in head and "Value" in head:
            for r in rows[1:]:
                if len(r) >= 2:
                    k, v = r[0]["t"], r[1]["t"]
                    if k in STAT_KEYS and re.match(r"^\d+$", v):
                        node["stats"][k] = int(v)
        elif "Lv." in head and "Skill" in head:
            cur = None
            for r in rows[1:]:
                if len(r) >= 4:
                    cur = {"lv": r[0]["t"], "name": r[1]["t"],
                           "el": (r[2]["alt"][0] if r[2]["alt"] else ""),
                           "sp": r[2]["t"] or r[3]["t"], "kind": r[3]["t"] if len(r) > 3 else "",
                           "eff": ""}
                    node["skills"].append(cur)
                elif len(r) == 1 and cur is not None:
                    cur["eff"] = r[0]["t"]
        elif head.strip().startswith("Skill") and "Element" in head and "Type" in head:
            cur = None
            for r in rows[1:]:
                if len(r) >= 4:
                    cur = {"name": r[0]["t"], "el": (r[1]["alt"][0] if r[1]["alt"] else ""),
                           "sp": r[2]["t"], "kind": r[3]["t"], "eff": ""}
                    node["special"].append(cur)
                elif len(r) == 1 and cur is not None:
                    cur["eff"] = r[0]["t"]
        elif head.strip().startswith("Digivolution") and "Requirements" in head:
            for r in rows[1:]:
                if len(r) >= 2 and r[0]["t"]:
                    if r[0]["t"].strip().lower() == node["name"].strip().lower():
                        node["enter"] = parse_req(r[1]["t"])
                    else:
                        node["evos"].append({"to": r[0]["t"], "req": parse_req(r[1]["t"])})
        elif "De-Digivolution" in head:
            for r in rows[1:]:
                for c in r:
                    if c["t"] and c["t"] not in ("-",):
                        for nm in re.split(r",\s*", c["t"]):
                            if nm.strip():
                                node["pre"].append(nm.strip() if nm.strip() != node["name"] else "")
    # traits + de-digivoluções (tabela do game8 só tem o cabeçalho; os nomes vêm em texto)
    flat = html.unescape(re.sub(r"<[^>]+>", "\n", raw))
    i = flat.find("List of Traits")
    j = flat.find("List of All Digimon Traits", i if i > 0 else 0)
    if 0 < i < j:
        words = [w.strip() for w in flat[i:j].split("\n") if w.strip() and w.strip() != "|"]
        node["traits"] = [w for w in words if w not in ("List of Traits",) and len(w) < 22][:6]

    k = flat.find(f"{node['name']} De-Digivolutions")
    m = flat.find(f"{node['name']} Stats", k if k > 0 else 0)
    if 0 < k < m:
        chunk = flat[k:m].replace("De-Digivolutions", "\n")
        for tok in re.split(r"[|\n]", chunk):
            tok = re.sub(r"\s+", " ", tok).strip()
            if tok in NAME_SET and tok != node["name"]:
                node["pre"].append(tok)
    node["pre"] = list(dict.fromkeys([p for p in node["pre"] if p]))
    return node


def main():
    nodes = []
    for item in CAT:
        nd = parse(item)
        if nd:
            nodes.append(nd)
    by_name = {n["name"]: n for n in nodes}
    # completar arestas reversas: pre -> evo
    edges = {}
    for n in nodes:
        for e in n["evos"]:
            tgt = e["to"]
            if tgt in by_name:
                edges[(n["name"], tgt)] = e["req"]
    for n in nodes:
        for p in n["pre"]:
            if p in by_name and (p, n["name"]) not in edges:
                edges[(p, n["name"])] = {"rank": None, "stats": {}, "other": []}
    out = {
        "nodes": nodes,
        "edges": [{"s": s, "t": t, "req": r} for (s, t), r in edges.items()],
        "meta": {"total_nodes": len(nodes), "total_edges": len(edges), "source": "game8.co",
                 "note": "Stats Lv99 com agent skills maximizados"},
    }
    json.dump(out, open(os.path.join(ROOT, "data", "digimon.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("nodes", len(nodes), "edges", len(edges))
    sem = [n["name"] for n in nodes if not n["evos"] and not n["pre"]]
    print("sem aresta:", len(sem), sem[:15])
    nostats = [n["name"] for n in nodes if len(n["stats"]) < 7]
    print("sem stats completos:", len(nostats), nostats[:10])
    print("sem skills:", len([n for n in nodes if not n["skills"]]))
    print("evos vazias por nó:", len([n for n in nodes if not n["evos"]]))


if __name__ == "__main__":
    main()
