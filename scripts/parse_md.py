#!/usr/bin/env python3
"""Parse do markdown do r.jina.ai (fichas do Game8) -> mesma estrutura do parse.py."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, "pages_md")
CAT = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
STAT_KEYS = ["HP", "SP", "ATK", "DEF", "INT", "SPI", "SPD"]
IMG_ALT = re.compile(r"!\[Image \d+: ([^\]]*)\]\([^)]*\)")
IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


def clean(cell):
    return LINK.sub(r"\1", IMG.sub("", cell)).strip()


def alts(cell):
    return [a for a in IMG_ALT.findall(cell) if a and not re.match(r"^\d", a)]


def split_row(line):
    parts = line.strip().strip("|").split("|")
    return [p.strip() for p in parts]


ATTR_ORDER = ["Vaccine", "Data", "Virus"]
EL_ORDER = ["Fire", "Water", "Plant", "Ice", "Electricity", "Earth", "Steel", "Wind", "Light", "Dark", "Null"]
EL_ALIAS = {"Elec": "Electricity"}


def mult(sym):
    sym = (sym or "").strip()
    if sym in ("◎",):
        return 2.0
    if sym in ("⭘", "〇", "○", "O", "◯"):
        return 1.5
    if sym in ("△", "Δ"):
        return 0.5
    if sym in ("X", "x", "✕", "╳", "✗", "✖"):
        return 0.0
    return 1.0


def norm_key(txt):
    t = re.sub(r"\s*Icon$", "", (txt or "").strip(), flags=re.I)
    return EL_ALIAS.get(t, t)


def cell_name(cell, order):
    for cand in ([a for a in alts(cell)] + [clean(cell)]):
        k = norm_key(cand)
        if k in order:
            return k
    return None


def parse_res(rows, order):
    """Tabela de resistências em markdown: pares (cabeçalho, valores)."""
    out, i = {}, 0
    while i + 1 < len(rows):
        heads = [cell_name(c, order) for c in rows[i]]
        vals = rows[i + 1]
        for h, cell in zip(heads, vals):
            if h:
                syms = [a for a in alts(cell)]
                out[h] = mult(syms[0] if syms else clean(cell))
        i += 2
    return out


def parse_req(text):
    rank, stats, extra = None, {}, []
    for part in re.split(r"[・•]", text):
        p = clean(part).strip()
        if not p or p in ("* * *", "*"):
            continue
        m = re.search(r"Agent Rank (\d+)", p)
        if m:
            rank = int(m.group(1))
            continue
        m = re.search(r"([\d,]+)\+\s*(Max )?([A-Z]{2,3})", p)
        if m:
            stats[m.group(3)] = int(m.group(1).replace(",", ""))
            continue
        extra.append(re.sub(r"\s+", " ", p))
    return {"rank": rank, "stats": stats, "other": extra}


def blocks(md):
    """(heading, [rows]) por tabela markdown."""
    out, cur, rows, heading = [], None, [], ""
    for line in md.split("\n"):
        ls = line.strip()
        if ls.startswith("#"):
            if rows:
                out.append((heading, rows))
                rows = []
            heading = ls.lstrip("#").strip()
        elif ls.startswith("|"):
            cells = split_row(ls)
            if all(re.fullmatch(r":?-{2,}:?", c.replace(" ", "")) for c in cells if c):
                continue
            rows.append(cells)
        else:
            if rows:
                out.append((heading, rows))
                rows = []
    if rows:
        out.append((heading, rows))
    return out


def parse(item):
    aid = item["url"].split("/")[-1]
    p = os.path.join(MD, aid + ".md")
    if not os.path.exists(p):
        return None
    md = open(p, encoding="utf-8", errors="replace").read()
    node = {
        "n": int(item["number"]), "name": item["name"], "attr": item["attribute"],
        "gen": item["generation"], "pers": item["basePersonality"],
        "rank": item["agentRankReq"], "url": item["url"],
        "type": "", "traits": [], "stats": {}, "special": [], "skills": [],
        "evos": [], "pre": [], "enter": None, "desc": "",
        "resA": {}, "resE": {},
    }
    m = re.search(r"^" + re.escape(item["name"]) + r" is an? (.+?) Digimon", md, re.M)
    if m:
        node["desc"] = m.group(0).strip()

    for heading, rows in blocks(md):
        head = " ".join(rows[0])
        if "Basic Info" in heading:
            for idx, r in enumerate(rows):
                if len(r) >= 2 and clean(r[0]) == "Type" and clean(r[1]) == "Base Personality":
                    if idx + 1 < len(rows):
                        node["type"] = clean(rows[idx + 1][0])
                        pers = clean(rows[idx + 1][1])
                        if pers:
                            node["pers"] = pers
        elif heading == "Attribute Resistances":
            node["resA"] = {k: v for k, v in parse_res(rows, ATTR_ORDER).items()}
        elif heading == "Elemental Resistances":
            node["resE"] = {k: v for k, v in parse_res(rows, EL_ORDER).items()}
        elif heading == "Level 99 Stats":
            for r in rows[1:]:
                if len(r) >= 2 and clean(r[0]) in STAT_KEYS and re.fullmatch(r"\d+", clean(r[1])):
                    node["stats"][clean(r[0])] = int(clean(r[1]))
        elif heading == "Special Skills":
            cur = None
            for r in rows[1:]:
                if len(r) >= 4:
                    el = alts(r[1])
                    cur = {"name": clean(r[0]), "el": (el[0] if el else "No Element"),
                           "sp": clean(r[2]), "kind": clean(r[3]), "eff": ""}
                    node["special"].append(cur)
                elif len(r) == 1 and cur is not None:
                    cur["eff"] = clean(r[0])
        elif heading == "Learnable Attachment Skills":
            cur = None
            for r in rows[1:]:
                if len(r) >= 5:
                    el = alts(r[2])
                    cur = {"lv": clean(r[0]), "name": clean(r[1]), "el": (el[0] if el else ""),
                           "sp": clean(r[3]), "kind": clean(r[4]), "eff": ""}
                    node["skills"].append(cur)
                elif len(r) == 1 and cur is not None:
                    cur["eff"] = clean(r[0])
        elif heading.endswith("Evolutions") and "Requirements" not in heading and "De-Digivolution" not in heading:
            for r in rows[1:]:
                if len(r) >= 2 and clean(r[0]):
                    node["evos"].append({"to": clean(r[0]), "req": parse_req(r[1])})
        elif "Evolution Requirements" in heading:
            for r in rows[1:]:
                if len(r) >= 2:
                    node["enter"] = parse_req(r[1])
        elif "De-Digivolutions" in heading:
            for r in rows[1:]:
                for c in r:
                    for nm in [clean(x) for x in LINK.findall(c)] or [clean(c)]:
                        if nm and nm != node["name"]:
                            node["pre"].append(nm)
        elif heading.endswith("Traits"):
            for r in rows[1:]:
                for c in r:
                    labs = [clean(x) for x in LINK.findall(c)]
                    for lab in labs:
                        if lab and lab != "List of Traits":
                            node["traits"].append(lab)
    node["pre"] = list(dict.fromkeys([p for p in node["pre"] if p]))
    node["traits"] = list(dict.fromkeys(node["traits"]))[:8]
    return node


def main():
    nodes = []
    for item in CAT:
        nd = parse(item)
        if nd:
            nodes.append(nd)
    print("nós parseados:", len(nodes))
    if len(sys.argv) > 1 and sys.argv[1] == "--only-md":
        json.dump(nodes, open(os.path.join(ROOT, "data", "digimon_md.json"), "w"),
                  ensure_ascii=False, separators=(",", ":"))
    falta = [(n["name"], [k for k in STAT_KEYS if k not in n["stats"]]) for n in nodes if len(n["stats"]) < 7]
    print("sem stats completos:", len(falta), falta[:5])
    print("sem evoluções e sem pre:", len([n for n in nodes if not n["evos"] and not n["pre"]]))
    print("sem skills:", len([n for n in nodes if not n["skills"]]))
    print("sem tipo:", len([n for n in nodes if not n["type"]]))


if __name__ == "__main__":
    main()
