#!/usr/bin/env python3
"""Insiste, um a um, nas fichas que ainda faltam (HTML cru)."""
import json, os, re, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "pages")
items = {i["name"]: i for i in json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]}
h = open(os.path.join(ROOT, "dist", "index.html"), encoding="utf-8").read()
data = json.loads(re.search(r"const DATA = (\{.*?\});\n", h, re.S).group(1))
faltando = [n["name"] for n in data["nodes"] if len(n["stats"]) < 7]
print("faltando:", len(faltando), faltando, flush=True)
for name in faltando:
    it = items[name]
    aid = it["url"].split("/")[-1]
    out = os.path.join(PAGES, aid + ".html")
    ok = False
    for attempt in range(4):
        subprocess.run(["curl", "-s", "--max-time", "60", "-H", "X-Return-Format: html",
                        "-o", out, "https://r.jina.ai/" + it["url"]])
        if os.path.exists(out) and "Level 99 Stats" in open(out, encoding="utf-8", errors="replace").read():
            ok = True
            break
        time.sleep(3 + attempt * 3)
    print(("ok  " if ok else "FAIL"), name, flush=True)
    time.sleep(1.5)
