#!/usr/bin/env python3
"""Baixa as artes oficiais (game8) via wsrv.nl, redimensionadas para 144px webp."""
import json, os, subprocess, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "img")
items = json.load(open(os.path.join(ROOT, "data", "catalog.json")))["collectionArraySchema"]["collectionItems"]
os.makedirs(IMG, exist_ok=True)

def path_of(i):
    return os.path.join(IMG, i["url"].split("/")[-1] + ".webp")

def ok(p):
    if not (os.path.exists(p) and os.path.getsize(p) > 400):
        return False
    with open(p, "rb") as f:
        head = f.read(16)
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"

def get(i):
    p = path_of(i)
    if ok(p):
        return True
    q = urllib.parse.quote(i["imageUrl"], safe="")
    url = f"https://wsrv.nl/?url={q}&w=144&h=144&fit=contain&output=webp&q=78"
    for _ in range(3):
        subprocess.run(["curl", "-sL", "--max-time", "40", "-o", p, url])
        if ok(p):
            return True
        time.sleep(1.5)
    if os.path.exists(p):
        os.remove(p)
    return False

faltando = [i for i in items if not ok(path_of(i))]
print("faltam:", len(faltando), "/", len(items), flush=True)
for rnd in range(3):
    todo = [i for i in items if not ok(path_of(i))]
    if not todo:
        break
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = list(ex.map(get, todo))
    print(f"  rodada {rnd}: ok {sum(res)}/{len(todo)}", flush=True)
total = sum(os.path.getsize(path_of(i)) for i in items if ok(path_of(i)))
print("com imagem:", sum(1 for i in items if ok(path_of(i))), "peso:", round(total/1024), "KB", flush=True)
