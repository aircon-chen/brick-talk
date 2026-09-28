#!/usr/bin/env python3
"""算出 palette 零件在 LDraw 裡的 bounding box（LDU，Y 軸朝下）。

用途：確認每個零件的原生方向（長邊沿 X 還是 Z）和原點位置，匯出 .ldr 時要用。
.dat 檔從 LDraw 官方庫抓，快取在 data/raw/ldraw/cache/。結果寫回 data/catalog/ldraw_bbox.json。
重跑：python3 scripts/ldraw_bbox.py
"""
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "ldraw" / "cache"
BASE = "https://library.ldraw.org/library/official/"
IDENTITY = (0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)


def fetch(name):
    name = name.replace("\\", "/").lower()
    local = CACHE / name.replace("/", "__")
    if local.exists():
        return local.read_text(encoding="utf-8", errors="replace")
    for prefix in ("parts/", "p/"):
        for attempt in range(6):
            try:
                req = urllib.request.Request(BASE + prefix + name, headers={"User-Agent": "lego-builder-catalog/1.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    text = r.read().decode("utf-8", errors="replace")
                local.write_text(text, encoding="utf-8")
                return text
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    break
                time.sleep(2 ** attempt)
    raise FileNotFoundError(name)


def mul(a, b):
    """組合兩個 LDraw 變換 (x y z a b c d e f g h i)：先 b 再 a。"""
    ax, ay, az, *am = a
    bx, by, bz, *bm = b
    m = [sum(am[r * 3 + k] * bm[k * 3 + c] for k in range(3)) for r in range(3) for c in range(3)]
    t = [ax + am[0] * bx + am[1] * by + am[2] * bz,
         ay + am[3] * bx + am[4] * by + am[5] * bz,
         az + am[6] * bx + am[7] * by + am[8] * bz]
    return (*t, *m)


def apply(tf, p):
    x, y, z, a, b, c, d, e, f, g, h, i = tf
    return (x + a * p[0] + b * p[1] + c * p[2], y + d * p[0] + e * p[1] + f * p[2], z + g * p[0] + h * p[1] + i * p[2])


def bbox(name, tf, box, depth=0):
    for line in fetch(name).splitlines():
        tok = line.split()
        if not tok:
            continue
        if tok[0] == "1" and len(tok) >= 15:
            sub = mul(tf, tuple(float(v) for v in tok[2:14]))
            bbox(" ".join(tok[14:]), sub, box, depth + 1)
        elif tok[0] in ("3", "4"):
            n = int(tok[0])
            for k in range(n):
                p = apply(tf, tuple(float(v) for v in tok[2 + k * 3:5 + k * 3]))
                for ax in range(3):
                    box[0][ax] = min(box[0][ax], p[ax])
                    box[1][ax] = max(box[1][ax], p[ax])


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    palette = json.loads((ROOT / "data" / "catalog" / "palette.json").read_text(encoding="utf-8"))
    out = {}
    for part in palette["parts"]:
        box = [[1e9] * 3, [-1e9] * 3]
        bbox(part["ldraw_file"], IDENTITY, box)
        mn, mx = [round(v, 2) for v in box[0]], [round(v, 2) for v in box[1]]
        out[part["part_num"]] = {"min": mn, "max": mx, "size": [round(mx[i] - mn[i], 2) for i in range(3)]}
        print(part["part_num"], part["name"], "min", mn, "max", mx)
    (ROOT / "data" / "catalog" / "ldraw_bbox.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
