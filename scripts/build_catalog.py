#!/usr/bin/env python3
"""把 Rebrickable 的 CSV dump 整理成 LEGO 零件目錄。

輸入：data/raw/rebrickable/*.csv.gz（從 https://rebrickable.com/downloads/ 下載）
輸出：
  data/catalog/lego_catalog.sqlite  全部零件、顏色、element、零件出現過的顏色
  data/catalog/parts_all.csv        全部零件一覽（含解析出的尺寸）
  data/catalog/colors_all.csv       全部顏色
  data/catalog/palette.json         builder 生成模型時能用的零件 x 顏色（含 element ID）
  data/catalog/SUMMARY.md           統計摘要

只用 Python 標準庫。重跑：python3 scripts/build_catalog.py（產生 palette 要設定 REBRICKABLE_API_KEY）；只要資料庫：python3 scripts/build_catalog.py --db-only
"""
import csv
import gzip
import json
import re
import sqlite3
from collections import defaultdict
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "rebrickable"
OUT = ROOT / "data" / "catalog"

# 「近期仍在生產」的判斷：這個零件＋顏色出現在這一年（含）之後發行的套組。
# 只是推估，Rebrickable dump 沒有 Pick a Brick 的庫存資料。
RECENT_YEAR = 2024

# 1 stud = 8.0 mm = 20 LDU；1 plate 高 = 3.2 mm = 8 LDU；1 brick 高 = 3 plates。
STUD_MM, PLATE_MM, STUD_LDU, PLATE_LDU = 8.0, 3.2, 20, 8

# builder 生成模型時用的零件。尺寸用 studs、照零件名稱「W x L」的順序，高度用 plates。
# 擺放方向不要看 W、L，一律看 LDraw 幾何（palette.json 的 ldraw.studs_x / studs_z）。
# kind: brick / plate / tile / slope45 / slope45_inv，特殊零件另見下方
PALETTE_PARTS = {
    # Bricks（高 3 plates）
    "3005": ("brick", 1, 1), "3004": ("brick", 1, 2), "3622": ("brick", 1, 3),
    "3010": ("brick", 1, 4), "3009": ("brick", 1, 6), "3008": ("brick", 1, 8),
    "3003": ("brick", 2, 2), "3002": ("brick", 2, 3), "3001": ("brick", 2, 4),
    "2456": ("brick", 2, 6), "3007": ("brick", 2, 8),
    # Plates（高 1 plate）
    "3024": ("plate", 1, 1), "3023": ("plate", 1, 2), "3623": ("plate", 1, 3),
    "3710": ("plate", 1, 4), "3666": ("plate", 1, 6), "3460": ("plate", 1, 8),
    "3022": ("plate", 2, 2), "3021": ("plate", 2, 3), "3020": ("plate", 2, 4),
    "3795": ("plate", 2, 6), "3034": ("plate", 2, 8),
    "3031": ("plate", 4, 4), "3032": ("plate", 4, 6), "3035": ("plate", 4, 8),
    "3958": ("plate", 6, 6), "3036": ("plate", 6, 8),
    # Tiles（高 1 plate，頂面沒有 stud）
    "3070b": ("tile", 1, 1), "3069b": ("tile", 1, 2), "63864": ("tile", 1, 3),
    "2431": ("tile", 1, 4), "6636": ("tile", 1, 6), "4162": ("tile", 1, 8),
    "3068b": ("tile", 2, 2), "87079": ("tile", 2, 4),
    # 45 度斜面（高 3 plates）。尺寸照名稱順序：「2 x 1」的 2 是沿斜面的深度、1 是寬
    "3040b": ("slope45", 2, 1), "3039": ("slope45", 2, 2),
    "3038": ("slope45", 2, 3), "3037": ("slope45", 2, 4),
    "3665": ("slope45_inv", 2, 1), "3660": ("slope45_inv", 2, 2),
    # 特殊零件（2026-09-27 加）。輪子組是 67687 輪軸座 + 2 個 6014b 輪框 + 2 個 87697 輪胎，
    # 2023 年後有 10 個套組這樣配（data/raw/rebrickable 的 inventory 交叉比對）
    "67687": ("wheel_holder", 2, 2), "6014b": ("wheel", 1, 1), "87697": ("tyre", 1, 1),
    "3062b": ("round", 1, 1), "3941": ("round", 2, 2),
    "59900": ("cone", 1, 1), "3942c": ("cone", 2, 2),
    # 大片的 plate（2026-09-27 加）：底板、地板這種大平面用，才不會拼成一堆小塊。BrickLink 編號都跟 Rebrickable 一樣（逐一查過）
    "4477": ("plate", 1, 10), "60479": ("plate", 1, 12),
    "3832": ("plate", 2, 10), "2445": ("plate", 2, 12), "91988": ("plate", 2, 14), "4282": ("plate", 2, 16),
    "3030": ("plate", 4, 10), "3029": ("plate", 4, 12),
    "3033": ("plate", 6, 10), "3028": ("plate", 6, 12), "3456": ("plate", 6, 14), "3027": ("plate", 6, 16),
    "41539": ("plate", 8, 8), "92438": ("plate", 8, 16), "91405": ("plate", 16, 16),
}
# 大片 plate 跟特殊零件一樣不參與顏色挑選，加進來之後顏色表不變
LARGE_PLATES = {"4477", "60479", "3832", "2445", "91988", "4282", "3030", "3029",
                "3033", "3028", "3456", "3027", "41539", "92438", "91405"}
# 顏色挑選只看這些基本零件，加特殊零件不會改到顏色表
BASE_KINDS = {"brick", "plate", "tile", "slope45", "slope45_inv"}
# LDraw 官方庫沒有 67687，用同模具的舊版 4600 顯示（Rebrickable part_relationships 標為 M）
LDRAW_FILE = {"67687": "4600.dat"}

HEIGHT_PLATES = {"brick": 3, "plate": 1, "tile": 1, "slope45": 3, "slope45_inv": 3,
                 "wheel_holder": 1, "wheel": 0, "tyre": 0, "round": 3, "cone": 3}
HEIGHT_PLATES_PART = {"3942c": 6}
# 輪框、輪胎不是方塊，尺寸用 LDraw bounding box 量的：寬（沿輪軸）、直徑、直徑，單位 mm
SIZE_MM = {"6014b": [11.2, 10.4, 10.4], "87697": [11.2, 20.0, 20.0]}

# 自訂中文色名，LEGO 沒有官方繁中色名。沒列到的顏色在 palette 裡就用英文名。
ZH_COLOR = {
    "White": "白色", "Black": "黑色", "Red": "紅色", "Blue": "藍色", "Yellow": "黃色",
    "Light Bluish Gray": "淺灰色", "Dark Bluish Gray": "深灰色",
    "Green": "綠色", "Bright Green": "亮綠色", "Dark Green": "深綠色", "Lime": "萊姆綠",
    "Reddish Brown": "紅棕色", "Dark Brown": "深棕色", "Tan": "沙色", "Dark Tan": "深沙色",
    "Orange": "橘色", "Dark Orange": "深橘色", "Bright Light Orange": "亮橘黃",
    "Bright Light Yellow": "淺黃色", "Dark Red": "深紅色", "Dark Blue": "深藍色",
    "Medium Blue": "中藍色", "Medium Azure": "天藍色", "Dark Azure": "深天藍",
    "Light Aqua": "淺水藍", "Sand Green": "沙綠色", "Sand Blue": "沙藍色",
    "Bright Pink": "亮粉紅", "Dark Pink": "深粉紅", "Magenta": "洋紅色",
    "Medium Lavender": "中薰衣草紫", "Lavender": "薰衣草紫", "Dark Purple": "深紫色",
    "Nougat": "牛軋糖色", "Medium Nougat": "中牛軋糖色", "Light Nougat": "淺牛軋糖色",
    "Coral": "珊瑚色", "Olive Green": "橄欖綠", "Pearl Gold": "珍珠金",
    "Flat Silver": "霧銀色", "Trans-Clear": "透明", "Trans-Light Blue": "透明淺藍",
    "Trans-Red": "透明紅", "Trans-Yellow": "透明黃", "Trans-Orange": "透明橘",
    "Trans-Green": "透明綠", "Trans-Dark Blue": "透明深藍", "Trans-Bright Green": "透明亮綠",
    "Dark Turquoise": "深藍綠", "Bright Light Blue": "淺天藍", "Vibrant Yellow": "鮮黃色",
    "Reddish Orange": "紅橘色", "Blue Violet": "藍紫色", "Yellowish Green": "黃綠色",
    "Warm Tan": "暖沙色", "Metallic Silver": "金屬銀", "Metallic Gold": "金屬金",
    "Warm Pink": "暖粉紅", "Trans-Purple": "透明紫", "Trans-Black": "透明黑",
    "Trans-Brown": "透明茶", "Pearl Titanium": "珍珠鈦灰", "Trans-Dark Pink": "透明深粉紅",
}

# 顏色分級：看這個顏色在 palette 的 brick＋plate（共 27 種）裡，近期還有生產幾種。
# core：>= 21 種，生成模型時優先用；extended：其他不透明色；special：透明、金屬、珍珠、螢光等。
CORE_MIN_BRICK_PLATE = 21

DIM_RE = re.compile(r"(\d+(?: \d+/\d+)?)\s*x\s*(\d+(?: \d+/\d+)?)(?:\s*x\s*(\d+(?: \d+/\d+)?))?")
FAMILY_BY_CAT = {
    1: "baseplate", 3: "slope", 5: "brick_special", 6: "wedge", 9: "plate_special",
    11: "brick", 14: "plate", 15: "tile_special", 19: "tile", 20: "round",
    21: "plate_round", 37: "curved", 49: "plate_wedge", 67: "tile_round",
}


def read_ldconfig():
    """讀 LDraw 的 LDConfig.ldr：色碼 -> (LDraw 名稱, [LEGO 色號], LEGO 官方色名)。"""
    path = ROOT / "data" / "raw" / "ldraw" / "LDConfig.ldr"
    out, lego = {}, None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.search(r"LEGOID\s+([\d /]+?)\s+-\s+(.+)$", line)
        if m:
            lego = ([int(x) for x in m.group(1).split("/")], m.group(2).strip())
            continue
        m = re.search(r"!COLOUR\s+(\S+)\s+CODE\s+(\d+)", line)
        if m:
            out[int(m.group(2))] = (m.group(1), lego)
            lego = None
    return out


def rebrickable_get(path, cache_name):
    """GET Rebrickable API，結果快取在 data/raw/rebrickable/<cache_name>（Rebrickable 要求自動化存取要節制）。
    要設定環境變數 REBRICKABLE_API_KEY（到 rebrickable.com 免費申請）。"""
    import os
    import time
    import urllib.request

    cache = ROOT / "data" / "raw" / "rebrickable" / cache_name
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    key = os.environ.get("REBRICKABLE_API_KEY")
    if not key:
        raise SystemExit("產生 palette 需要 BrickLink 色號與零件編號，請設定 REBRICKABLE_API_KEY。只要零件總覽頁的資料庫，改用 --db-only。")
    time.sleep(1.1)  # Rebrickable API 的速率限制約每秒 1 次
    req = urllib.request.Request("https://rebrickable.com/api/v3" + path,
                                 headers={"Authorization": f"key {key}", "User-Agent": "brick-talk-catalog/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def first_bricklink_id(external_ids):
    """external_ids.BrickLink 取第一個編號；沒有就 None。
    2026-09-28 實測：零件的是陣列（["3001"]），顏色的是 {"ext_ids": [11], "ext_descrs": [...]}。"""
    bl = (external_ids or {}).get("BrickLink")
    ids = bl.get("ext_ids") if isinstance(bl, dict) else bl
    return ids[0] if ids else None


def read_bricklink_colors():
    """Rebrickable 色號 -> BrickLink 色號，來源是 Rebrickable API 的 external_ids。"""
    results = rebrickable_get("/lego/colors/?page_size=1000", "colors_api.json")["results"]
    out = {}
    for c in results:
        bl = first_bricklink_id(c.get("external_ids"))
        if bl is not None:
            out[int(c["id"])] = int(bl)
    return out


def read_bricklink_part_ids(part_nums):
    """palette 零件的 BrickLink 零件編號，來源是 Rebrickable API 的 external_ids；沒有對照就沿用 Rebrickable 編號。"""
    out = {}
    for pn in part_nums:
        part = rebrickable_get(f"/lego/parts/{pn}/", f"part_{pn}.json")
        out[pn] = str(first_bricklink_id(part.get("external_ids")) or pn)
    return out


def norm_color(name):
    return name.replace("_", " ").replace("-", " ").replace("Grey", "Gray").lower()


def read(name):
    with gzip.open(RAW / f"{name}.csv.gz", "rt", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def to_num(s):
    if s is None:
        return None
    parts = s.split(" ")
    return float(sum(Fraction(p) for p in parts))


def parse_dims(name, cat_id):
    """從零件名稱抓出 W x L (x H)。H 在 brick 類是以 brick 高為單位。"""
    m = DIM_RE.search(name)
    if not m:
        return None, None, None, None
    w, l, h = to_num(m.group(1)), to_num(m.group(2)), to_num(m.group(3))
    family = FAMILY_BY_CAT.get(cat_id)
    if family in ("plate", "tile", "baseplate", "plate_round", "tile_round", "plate_special", "tile_special", "plate_wedge"):
        height_plates = 1.0 if h is None else None
    elif family in ("brick", "brick_special", "slope", "round", "curved", "wedge"):
        height_plates = 3.0 if h is None else h * 3
    else:
        height_plates = None
    return w, l, h, height_plates


def ldraw_geom(b):
    """LDraw 原生擺放：X、Z 各佔幾個 stud，原點相對零件的位置。Y 軸朝下，單位 LDU。"""
    if not b:
        return None
    return {"bbox_min": b["min"], "bbox_max": b["max"],
            "studs_x": round(b["size"][0] / STUD_LDU, 2), "studs_z": round(b["size"][2] / STUD_LDU, 2),
            "centered_xz": b["min"][0] == -b["max"][0] and b["min"][2] == -b["max"][2]}


def ldraw_fields(ldconfig, cid, name):
    hit = ldconfig.get(cid)
    if not hit or norm_color(hit[0]) != norm_color(name):
        return {"ldraw_code": None, "lego_color_ids": None, "lego_color_name": None}
    lego = hit[1]
    return {"ldraw_code": cid, "lego_color_ids": lego[0] if lego else None,
            "lego_color_name": lego[1] if lego else None}


def main(db_only=False):
    OUT.mkdir(parents=True, exist_ok=True)
    cats = {int(r["id"]): r["name"] for r in read("part_categories")}
    colors = read("colors")
    color_by_id = {int(c["id"]): c for c in colors}
    parts = read("parts")
    elements = read("elements")
    sets = {r["set_num"]: int(r["year"]) for r in read("sets")}
    inv_year = {r["id"]: sets.get(r["set_num"]) for r in read("inventories")}

    # 零件＋顏色在套組裡出現的統計：出現幾個套組、最早／最晚年份、總數量、一張代表圖
    pc = defaultdict(lambda: {"sets": set(), "y1": None, "y2": None, "qty": 0, "img": ""})
    for r in read("inventory_parts"):
        if r["is_spare"] == "True":
            continue
        y = inv_year.get(r["inventory_id"])
        key = (r["part_num"], int(r["color_id"]))
        s = pc[key]
        s["sets"].add(r["inventory_id"])
        s["qty"] += int(r["quantity"])
        if y is not None:
            s["y1"] = y if s["y1"] is None else min(s["y1"], y)
            s["y2"] = y if s["y2"] is None else max(s["y2"], y)
        if not s["img"] and r["img_url"]:
            s["img"] = r["img_url"]

    elems_by_pc = defaultdict(list)
    for e in elements:
        elems_by_pc[(e["part_num"], int(e["color_id"]))].append(e["element_id"])

    # ---------- SQLite ----------
    db_path = OUT / "lego_catalog.sqlite"
    if db_path.exists():
        db_path.unlink()
    db = sqlite3.connect(db_path)
    db.executescript("""
    CREATE TABLE part_categories (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE colors (id INTEGER PRIMARY KEY, name TEXT, rgb TEXT, is_trans INTEGER,
        num_parts INTEGER, num_sets INTEGER, y1 INTEGER, y2 INTEGER, name_zh TEXT);
    CREATE TABLE parts (part_num TEXT PRIMARY KEY, name TEXT, part_cat_id INTEGER, category TEXT,
        material TEXT, family TEXT, studs_w REAL, studs_l REAL, height_bricks REAL, height_plates REAL,
        width_mm REAL, length_mm REAL, height_mm REAL, num_colors INTEGER, y1 INTEGER, y2 INTEGER);
    CREATE TABLE elements (element_id TEXT PRIMARY KEY, part_num TEXT, color_id INTEGER, design_id TEXT);
    CREATE TABLE part_colors (part_num TEXT, color_id INTEGER, num_sets INTEGER, total_qty INTEGER,
        y1 INTEGER, y2 INTEGER, element_ids TEXT, img_url TEXT, PRIMARY KEY (part_num, color_id));
    CREATE TABLE part_relationships (rel_type TEXT, child_part_num TEXT, parent_part_num TEXT);
    """)
    db.executemany("INSERT INTO part_categories VALUES (?,?)", cats.items())
    db.executemany(
        "INSERT INTO colors VALUES (?,?,?,?,?,?,?,?,?)",
        [(int(c["id"]), c["name"], c["rgb"], c["is_trans"] == "True", int(c["num_parts"] or 0),
          int(c["num_sets"] or 0), int(c["y1"]) if c["y1"] else None, int(c["y2"]) if c["y2"] else None,
          ZH_COLOR.get(c["name"])) for c in colors],
    )
    db.executemany("INSERT INTO elements VALUES (?,?,?,?)",
                   [(e["element_id"], e["part_num"], int(e["color_id"]), e["design_id"] or None) for e in elements])
    db.executemany("INSERT INTO part_relationships VALUES (?,?,?)",
                   [(r["rel_type"], r["child_part_num"], r["parent_part_num"]) for r in read("part_relationships")])

    colors_of_part = defaultdict(set)
    for (p, c) in list(pc.keys()) + list(elems_by_pc.keys()):
        colors_of_part[p].add(c)
    years_of_part = defaultdict(list)
    for (p, c), s in pc.items():
        if s["y1"] is not None:
            years_of_part[p] += [s["y1"], s["y2"]]

    part_rows = []
    for p in parts:
        cat_id = int(p["part_cat_id"])
        w, l, h, hp = parse_dims(p["name"], cat_id)
        ys = years_of_part.get(p["part_num"])
        part_rows.append((
            p["part_num"], p["name"], cat_id, cats.get(cat_id), p["part_material"],
            FAMILY_BY_CAT.get(cat_id, "other"), w, l, h, hp,
            round(w * STUD_MM - 0.2, 2) if w else None,
            round(l * STUD_MM - 0.2, 2) if l else None,
            round(hp * PLATE_MM, 2) if hp else None,
            len(colors_of_part.get(p["part_num"], ())),
            min(ys) if ys else None, max(ys) if ys else None,
        ))
    db.executemany("INSERT INTO parts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", part_rows)

    keys = set(pc.keys()) | set(elems_by_pc.keys())
    db.executemany("INSERT INTO part_colors VALUES (?,?,?,?,?,?,?,?)", [
        (p, c, len(pc[(p, c)]["sets"]) if (p, c) in pc else 0, pc[(p, c)]["qty"] if (p, c) in pc else 0,
         pc[(p, c)]["y1"] if (p, c) in pc else None, pc[(p, c)]["y2"] if (p, c) in pc else None,
         ",".join(sorted(elems_by_pc.get((p, c), []))), pc[(p, c)]["img"] if (p, c) in pc else "")
        for (p, c) in keys])
    db.commit()

    # ---------- CSV ----------
    with open(OUT / "parts_all.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["part_num", "name", "part_cat_id", "category", "material", "family", "studs_w", "studs_l",
                     "height_bricks", "height_plates", "width_mm", "length_mm", "height_mm", "num_colors",
                     "first_year", "last_year"])
        wr.writerows(part_rows)
    with open(OUT / "colors_all.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["id", "name", "name_zh", "rgb", "is_trans", "num_parts", "num_sets", "first_year", "last_year"])
        for c in colors:
            wr.writerow([c["id"], c["name"], ZH_COLOR.get(c["name"], ""), c["rgb"], c["is_trans"],
                         c["num_parts"], c["num_sets"], c["y1"], c["y2"]])

    if db_only:
        print(f"已產生 {db_path}（--db-only，沒有重建 palette）")
        return

    # ---------- palette.json ----------
    part_name = {p["part_num"]: p["name"] for p in parts}
    missing = [p for p in PALETTE_PARTS if p not in part_name]
    if missing:
        raise SystemExit(f"palette 零件不在 parts.csv：{missing}")

    # LDraw 幾何（由 scripts/ldraw_bbox.py 產生）：確認每個零件的原生方向與原點
    bbox_path = OUT / "ldraw_bbox.json"
    bboxes = json.loads(bbox_path.read_text(encoding="utf-8")) if bbox_path.exists() else {}

    bl_part_ids = read_bricklink_part_ids(PALETTE_PARTS)
    palette_parts = []
    for pn, (kind, w, l) in PALETTE_PARTS.items():
        hp = HEIGHT_PLATES_PART.get(pn, HEIGHT_PLATES[kind])
        combos = []
        for c in sorted(colors_of_part[pn]):
            if c < 0:
                continue
            s = pc.get((pn, c))
            eids = sorted(elems_by_pc.get((pn, c), []))
            y2 = s["y2"] if s else None
            if not eids:
                continue  # 沒有 element ID 就沒辦法去買
            combos.append({
                "color_id": c,
                "element_ids": eids,
                "num_sets": len(s["sets"]) if s else 0,
                "first_year": s["y1"] if s else None,
                "last_year": y2,
                "recent": bool(y2 and y2 >= RECENT_YEAR),
            })
        palette_parts.append({
            "part_num": pn, "name": part_name[pn], "kind": kind,
            "studs_w": w, "studs_l": l, "height_plates": hp,
            "size_mm": SIZE_MM.get(pn, [round(w * STUD_MM - 0.2, 1), round(l * STUD_MM - 0.2, 1), round(hp * PLATE_MM, 1)]),
            "size_ldu": [w * STUD_LDU, l * STUD_LDU, hp * PLATE_LDU],
            "has_studs": kind not in ("tile", "wheel", "tyre"),
            "bricklink_part_id": bl_part_ids[pn],
            "ldraw_file": LDRAW_FILE.get(pn, f"{pn}.dat"),
            "ldraw": ldraw_geom(bboxes.get(pn)),
            "colors": combos,
        })

    # 顏色挑選：在 palette 零件裡，近期仍有生產的零件數夠多的顏色
    recent_count = defaultdict(int)
    recent_bp = defaultdict(int)
    for pp in palette_parts:
        if pp["kind"] not in BASE_KINDS or pp["part_num"] in LARGE_PLATES:
            continue
        for cb in pp["colors"]:
            if cb["recent"]:
                recent_count[cb["color_id"]] += 1
                if pp["kind"] in ("brick", "plate"):
                    recent_bp[cb["color_id"]] += 1
    # LDraw 色碼只有在「同號而且名稱一樣」時才填，例如 Rebrickable 326 是 Olive Green，
    # LDraw 326 卻是 Yellowish_Green，這種就留空，不能直接拿 Rebrickable 色號去匯出 .ldr。
    ldconfig = read_ldconfig()
    # BrickLink 色號跟 Rebrickable 色號是不同系統（Black：BL 11、RB 0），用 Rebrickable 維護的對照
    bl_colors = read_bricklink_colors()
    palette_colors = []
    for cid, n in sorted(recent_count.items(), key=lambda x: -x[1]):
        c = color_by_id[cid]
        special = c["is_trans"] == "True" or any(k in c["name"] for k in ("Metallic", "Pearl", "Opal", "Glitter", "Chrome", "Glow"))
        tier = "special" if special else ("core" if recent_bp[cid] >= CORE_MIN_BRICK_PLATE else "extended")
        palette_colors.append({
            "rebrickable_id": cid, "name": c["name"], "name_zh": ZH_COLOR.get(c["name"]),
            "rgb": "#" + c["rgb"], "is_trans": c["is_trans"] == "True",
            "tier": tier,
            "bricklink_id": bl_colors.get(cid),
            **ldraw_fields(ldconfig, cid, c["name"]),
            "recent_palette_parts": n,
            "recent_brick_plate": recent_bp[cid],
        })

    palette = {
        "source": "Rebrickable CSV dump (https://rebrickable.com/downloads/)；LDraw 色碼與 LEGO 色號來自 LDraw LDConfig.ldr；BrickLink 色號與零件編號來自 Rebrickable API 的 external_ids",
        "recent_rule": f"零件＋顏色出現在 {RECENT_YEAR} 年（含）之後發行的套組，視為近期仍在生產（推估）",
        "units": {"stud_mm": STUD_MM, "plate_height_mm": PLATE_MM, "brick_height_plates": 3,
                  "stud_ldu": STUD_LDU, "plate_height_ldu": PLATE_LDU},
        "colors": palette_colors,
        "parts": palette_parts,
    }
    (OUT / "palette.json").write_text(json.dumps(palette, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---------- SUMMARY ----------
    fam_count = defaultdict(int)
    parsed = 0
    for r in part_rows:
        fam_count[r[5]] += 1
        if r[6] is not None:
            parsed += 1
    lines = [
        "# LEGO 零件目錄摘要（自動產生）", "",
        f"- 零件（part_num）：{len(parts):,}",
        f"- 零件分類：{len(cats)}",
        f"- 顏色：{len(colors):,}（含 id=-1 Unknown）",
        f"- Element ID（零件＋顏色的購買編號）：{len(elements):,}",
        f"- 有出現在套組或有 element 的零件＋顏色組合：{len(keys):,}",
        f"- 名稱解析得出 W x L 尺寸的零件：{parsed:,}",
        f"- palette 零件：{len(palette_parts)}，palette 顏色（近期至少 1 個 palette 零件有生產）：{len(palette_colors)}",
        "", "## palette 顏色覆蓋（近期有生產的 palette 零件數 / 共 "
        f"{len(palette_parts)} 種）", "",
        "| Rebrickable ID | 顏色 | 中文 | RGB | 分級 | 近期 brick+plate / 27 | 近期零件數 |", "|---|---|---|---|---|---|---|",
    ]
    for c in palette_colors:
        lines.append(f"| {c['rebrickable_id']} | {c['name']} | {c['name_zh'] or ''} | {c['rgb']} | {c['tier']} | {c['recent_brick_plate']} | {c['recent_palette_parts']} |")
    (OUT / "SUMMARY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:9]))


if __name__ == "__main__":
    import sys
    main(db_only="--db-only" in sys.argv[1:])
