#!/usr/bin/env python3
"""Baixa as 475 fichas do Game8 (retoma de onde parou)."""
import json, os, subprocess, sys, time

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "pages")
items = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
os.makedirs(PAGES, exist_ok=True)
todo = [i for i in items if not (os.path.exists(os.path.join(PAGES, i["url"].split("/")[-1] + ".html"))
                                and os.path.getsize(os.path.join(PAGES, i["url"].split("/")[-1] + ".html")) > 8000)]
print(f"faltam {len(todo)} de {len(items)}", flush=True)
for k, i in enumerate(todo):
    aid = i["url"].split("/")[-1]
    p = os.path.join(PAGES, aid + ".html")
    for attempt in range(3):
        r = subprocess.run(["curl", "-sL", "--compressed", "-A", UA, "--max-time", "30", i["url"], "-o", p])
        if os.path.exists(p) and os.path.getsize(p) > 8000:
            break
        if os.path.exists(p):
            os.remove(p)
        print("retry", aid, r.returncode, flush=True)
        time.sleep(2)
    if k % 25 == 0:
        print(f"{k}/{len(todo)} {i['name']}", flush=True)
    time.sleep(0.15)
print("done", flush=True)
