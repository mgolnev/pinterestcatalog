import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "@/lib/env";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "catalog.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  _db = db;
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      external_product_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      price REAL,
      old_price REAL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      category_id TEXT,
      category_path TEXT NOT NULL,
      leaf_category TEXT,
      root_section TEXT NOT NULL,
      subsection TEXT,
      gender_or_age_group TEXT,
      attributes TEXT NOT NULL DEFAULT '{}',
      color TEXT,
      normalized_color TEXT,
      product_type TEXT,
      fit TEXT,
      silhouette TEXT,
      season TEXT,
      collection TEXT,
      image_urls TEXT NOT NULL,
      main_image_url TEXT,
      main_image_aspect_ratio REAL,
      photo_type TEXT,
      image_quality_score REAL,
      product_url TEXT NOT NULL,
      availability_status TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      feed_version TEXT NOT NULL,
      popularity_score REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_products_feed_section
      ON products(feed_version, root_section, publication_status, availability_status);

    CREATE INDEX IF NOT EXISTS idx_products_external ON products(external_product_id);
  `);
}

export function getMeta(key: string): string | undefined {
  const row = getDb()
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}
