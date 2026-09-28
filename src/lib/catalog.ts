import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import palette from "../../data/catalog/palette.json";

// Docker 版把資料庫放在 volume 裡，用 CATALOG_DB_PATH 指定
export const DB_PATH = process.env.CATALOG_DB_PATH ?? join(process.cwd(), "data/catalog/lego_catalog.sqlite");
export const PAGE_SIZE = 60;
export const missingCatalogMessage = "還沒有零件目錄：先照 data/catalog/README.md 下載 Rebrickable 的資料，再執行 python3 scripts/build_catalog.py --db-only。";
type Result<T> = { ok: true; data: T } | { ok: false; error: "missing_catalog"; message: string };
export type Part = {
  part_num: string; name: string; category: string; family: string;
  num_colors: number; y1: number | null; y2: number | null;
  num_sets: number; img_url: string | null;
};
type Dimensions = { studs_w: number | null; studs_l: number | null; height_bricks: number | null; height_plates: number | null; width_mm: number | null; length_mm: number | null; height_mm: number | null };
type Color = { color_id: number; name: string; name_zh: string | null; rgb: string; y1: number | null; y2: number | null; num_sets: number; element_ids: string | null; img_url: string | null };
type Related = { rel_type: string; part_num: string; name: string };
export type Filters = { q?: string; category?: number; recent?: boolean; page?: number };
export function designerPartNums(): Set<string> {
  return new Set(palette.parts.map((part) => part.part_num));
}
function read<T>(path: string, query: (db: DatabaseSync) => T): Result<T> {
  if (!existsSync(path)) return { ok: false, error: "missing_catalog", message: missingCatalogMessage };
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { ok: true, data: query(db) }; } finally { db.close(); }
}
const summary = `SELECT p.part_num, p.name, p.category, p.family, p.num_colors, p.y1, p.y2,
  COALESCE((SELECT SUM(pc.num_sets) FROM part_colors pc WHERE pc.part_num = p.part_num), 0) AS num_sets,
  (SELECT pc.img_url FROM part_colors pc WHERE pc.part_num = p.part_num AND pc.img_url IS NOT NULL AND pc.img_url != '' ORDER BY pc.num_sets DESC, pc.color_id LIMIT 1) AS img_url`;
export function listParts(filters: Filters = {}, path = DB_PATH) {
  return read(path, (db) => {
    const q = (filters.q ?? "").trim().replace(/[\\%_]/g, "\\$&");
    const args = [q, `%${q}%`, `${q}%`, filters.category ?? null, filters.category ?? null, filters.recent ? 1 : 0];
    const where = `FROM parts p WHERE (? = '' OR p.name LIKE ? ESCAPE '\\' OR p.part_num LIKE ? ESCAPE '\\') AND (? IS NULL OR p.part_cat_id = ?) AND (? = 0 OR p.y2 >= 2024)`;
    const { total } = db.prepare(`SELECT COUNT(*) AS total ${where}`).get(...args) as { total: number };
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const requested = filters.page ?? 1;
    const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
    const parts = db.prepare(`${summary} ${where} ORDER BY num_sets DESC, p.part_num LIMIT ? OFFSET ?`).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Part[];
    const categories = db.prepare(`SELECT c.id, c.name, COUNT(p.part_num) AS count FROM part_categories c LEFT JOIN parts p ON p.part_cat_id = c.id GROUP BY c.id ORDER BY c.name`).all() as { id: number; name: string; count: number }[];
    return { parts, total, page, pages, categories };
  });
}
export function getPart(partNum: string, path = DB_PATH) {
  return read(path, (db) => {
    const part = db.prepare(`${summary} FROM parts p WHERE p.part_num = ?`).get(partNum) as Part | undefined;
    if (!part) return null;
    const dimensions = part.family === "other" ? null : db.prepare(`SELECT studs_w, studs_l, height_bricks, height_plates, width_mm, length_mm, height_mm FROM parts WHERE part_num = ?`).get(partNum) as Dimensions;
    const colors = db.prepare(`SELECT pc.color_id, c.name, c.name_zh, c.rgb, pc.y1, pc.y2, pc.num_sets, pc.element_ids, pc.img_url FROM part_colors pc JOIN colors c ON c.id = pc.color_id WHERE pc.part_num = ? ORDER BY pc.num_sets DESC, c.name`).all(partNum) as Color[];
    const related = db.prepare(`SELECT DISTINCT r.rel_type, p.part_num, p.name FROM part_relationships r JOIN parts p ON p.part_num = CASE WHEN r.parent_part_num = ? THEN r.child_part_num ELSE r.parent_part_num END WHERE r.parent_part_num = ? OR r.child_part_num = ? ORDER BY r.rel_type, p.part_num`).all(partNum, partNum, partNum) as Related[];
    return { ...part, dimensions, colors, related };
  });
}
