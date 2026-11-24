#!/usr/bin/env python3
"""Busca em paralelo (via r.jina.ai) as fichas que faltam. Resumível."""
import json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, "pages_md")
items = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
os.makedirs(MD, exist_ok=True)
WORKERS = int(os.environ.get("W", "1"))
SLEEP = float(os.environ.get("SLEEP", "3.0"))

def need(i):
    p = os.path.join(MD, i["url"].split("/")[-1] + ".md")
    return not (os.path.exists(p) and os.path.getsize(p) > 3000)

def get(i):
    aid = i["url"].split("/")[-1]
    p = os.path.join(MD, aid + ".md")
    if not need(i):
        return True
    subprocess.run(["curl", "-s", "--max-time", "60", "-o", p, "https://r.jina.ai/" + i["url"]])
    time.sleep(SLEEP)
    ok = os.path.exists(p) and os.path.getsize(p) > 3000
    if not ok and os.path.exists(p):
        os.remove(p)
    return ok

rounds = 0
while True:
    todo = [i for i in items if need(i)]
    print(f"rodada {rounds}: faltam {len(todo)}", flush=True)
    if not todo or rounds >= 5:
        break
    okc = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for r in ex.map(get, todo):
            okc += 1 if r else 0
    print(f"  ok {okc}/{len(todo)}", flush=True)
    rounds += 1
    time.sleep(3)
print("faltando:", len([i for i in items if need(i)]), flush=True)
