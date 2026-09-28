"""Docker 第一次啟動時執行：下載 Rebrickable 的 CSV（已經下載過就沿用），再建立零件總覽頁的資料庫。

Rebrickable 允許任何用途使用這些資料，條件是註明出處，並要求自動下載一天最多一次；
檔案存在 volume 裡，所以只有第一次會下載。
"""
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "rebrickable"
FILES = ["colors", "part_categories", "parts", "part_relationships", "elements", "themes", "sets", "inventories", "inventory_parts"]

# RAW 是指向 volume 的連結，第一次啟動時目標還不存在，要建的是連結指向的資料夾
RAW.resolve().mkdir(parents=True, exist_ok=True)
for name in FILES:
    target = RAW / f"{name}.csv.gz"
    if target.exists():
        continue
    url = f"https://cdn.rebrickable.com/media/downloads/{name}.csv.gz"
    print(f"下載 {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "brick-talk-docker/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(target, "wb") as f:
        shutil.copyfileobj(r, f)

subprocess.run([sys.executable, str(ROOT / "scripts" / "build_catalog.py"), "--db-only"], check=True)
shutil.move(str(ROOT / "data" / "catalog" / "lego_catalog.sqlite"), os.environ["CATALOG_DB_PATH"])
