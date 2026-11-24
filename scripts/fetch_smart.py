#!/usr/bin/env python3
"""Busca em paralelo as fichas faltantes, validando o conteúdo (nome + Level 99 Stats)."""
import json, os, subprocess, time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, "pages_md")
items = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
os.makedirs(MD, exist_ok=True)
W = int(os.environ.get("W", "4"))

def path_of(i): return os.path.join(MD, i["url"].split("/")[-1] + ".md")

def valid(i):
    p = path_of(i)
    if not (os.path.exists(p) and os.path.getsize(p) > 3000):
        return False
    head = open(p, encoding="utf-8", errors="replace").read(4000)
    return ("Level 99 Stats" in head) or (i["name"] in head and "Evolution Line" in head)

def get(i):
    if valid(i):
        return True
    p = path_of(i)
    for _ in range(2):
        subprocess.run(["curl", "-s", "--max-time", "30", "-o", p, "https://r.jina.ai/" + i["url"]])
        if valid(i):
            return True
        time.sleep(1.5)
    if os.path.exists(p) and not valid(i):
        os.remove(p)
    return False

for rnd in range(4):
    todo = [i for i in items if not valid(i)]
    print(f"rodada {rnd}: faltam {len(todo)}", flush=True)
    if not todo:
        break
    with ThreadPoolExecutor(max_workers=W) as ex:
        res = list(ex.map(get, todo))
    print("  ok:", sum(res), "/", len(todo), flush=True)
    time.sleep(2)
print("faltando:", len([i for i in items if not valid(i)]), flush=True)
