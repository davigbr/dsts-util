#!/usr/bin/env python3
"""Para fichas que o markdown do jina trunca, busca o HTML cru (X-Return-Format: html)."""
import json, os, subprocess, time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "pages")
items = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
md = {}
p = os.path.join(ROOT, "data", "digimon_md.json")
if os.path.exists(p):
    md = {n["name"]: n for n in json.load(open(p))}
bad = [i for i in items if len((md.get(i["name"]) or {}).get("stats") or {}) < 7]
print("sem stats:", len(bad), flush=True)

def get(i):
    aid = i["url"].split("/")[-1]
    out = os.path.join(PAGES, aid + ".html")
    if os.path.exists(out) and os.path.getsize(out) > 50000:
        return True
    subprocess.run(["curl", "-s", "--max-time", "60", "-H", "X-Return-Format: html",
                    "-o", out, "https://r.jina.ai/" + i["url"]])
    ok = os.path.exists(out) and os.path.getsize(out) > 50000
    if not ok and os.path.exists(out):
        os.remove(out)
    return ok

with ThreadPoolExecutor(max_workers=4) as ex:
    res = list(ex.map(get, bad))
print("ok:", sum(res), "/", len(bad), flush=True)
