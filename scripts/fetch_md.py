#!/usr/bin/env python3
"""Baixa cada ficha do Game8 via r.jina.ai (markdown) — resumível e com backoff.

A rede local passou a bloquear game8.co (FortiGuard), então o HTML direto não
funciona mais; o relay r.jina.ai busca do lado dele e devolve markdown.
"""
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, "pages_md")
items = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
os.makedirs(MD, exist_ok=True)
SLEEP = float(os.environ.get("SLEEP", "2.2"))
todo = [i for i in items if not (os.path.exists(os.path.join(MD, i["url"].split("/")[-1] + ".md"))
                                 and os.path.getsize(os.path.join(MD, i["url"].split("/")[-1] + ".md")) > 3000)]
SHARD = int(os.environ.get("SHARD", "0"))
NSHARD = int(os.environ.get("NSHARD", "1"))
if NSHARD > 1:
    todo = todo[SHARD::NSHARD]
print(f"faltam {len(todo)} de {len(items)} (shard {SHARD}/{NSHARD})", flush=True)
fails = []
for k, i in enumerate(todo):
    aid = i["url"].split("/")[-1]
    p = os.path.join(MD, aid + ".md")
    ok = False
    for attempt in range(4):
        r = subprocess.run(["curl", "-sL", "--compressed", "--max-time", "40",
                            "https://r.jina.ai/" + i["url"], "-o", p])
        if os.path.exists(p) and os.path.getsize(p) > 3000:
            body = open(p, encoding="utf-8", errors="replace").read(400)
            if "Title:" in body:
                ok = True
                break
        if os.path.exists(p):
            os.remove(p)
        time.sleep(8 * (attempt + 1))
    if not ok:
        fails.append(i["name"])
        print("FAIL", aid, i["name"], flush=True)
    if k % 20 == 0:
        print(f"{k}/{len(todo)} ok={ok} {i['name']}", flush=True)
    time.sleep(SLEEP)
print("done; fails:", len(fails), fails[:20], flush=True)
