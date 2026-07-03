// HotFeed — D1 数据库操作

import type { D1Database } from "@cloudflare/workers-types";

export interface DedupRow {
  id: string;
  title: string;
  subtitle: string;
  unified_heat: number;
  category: string;
  trend: string;
  platform: string;
  url: string;
  region: string;
  created_at: string;
  updated_at: string;
}

export interface HistoryRow {
  id: number;
  date: string;
  rank: number;
  title: string;
  subtitle: string;
  unified_heat: number;
  category: string;
  platform: string;
  url: string;
  region: string;
}

// ============ 初始化表结构（首次部署时执行）============

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dedup_hotspots (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    unified_heat REAL DEFAULT 0,
    category TEXT DEFAULT '社会',
    trend TEXT DEFAULT 'stable',
    platform TEXT DEFAULT '',
    url TEXT DEFAULT '',
    region TEXT NOT NULL DEFAULT 'domestic',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dedup_region ON dedup_hotspots(region);
CREATE INDEX IF NOT EXISTS idx_dedup_category ON dedup_hotspots(category);
CREATE INDEX IF NOT EXISTS idx_dedup_updated ON dedup_hotspots(updated_at);

CREATE TABLE IF NOT EXISTS history_hotspots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    rank INTEGER NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    unified_heat REAL DEFAULT 0,
    category TEXT DEFAULT '社会',
    platform TEXT DEFAULT '',
    url TEXT DEFAULT '',
    region TEXT NOT NULL DEFAULT 'domestic',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_date ON history_hotspots(date);

CREATE TABLE IF NOT EXISTS fetch_status (
    key TEXT PRIMARY KEY,
    value TEXT
);
`;

export async function initDB(db: D1Database): Promise<void> {
  await db.batch(SCHEMA_SQL.split(";").filter((s) => s.trim()).map((s) => db.prepare(s.trim())));
}

// ============ 存储去重结果 ============

export async function saveDedup(
  db: D1Database,
  results: Array<{
    id: string; title: string; subtitle: string; unifiedHeat: number;
    category: string; trend: string; platform: string; url: string;
  }>,
  region: string
): Promise<void> {
  // 先清空该区域的旧数据
  await db.prepare("DELETE FROM dedup_hotspots WHERE region = ?").bind(region).run();

  // 批量插入新数据
  if (!results.length) return;

  const stmt = db.prepare(
    `INSERT INTO dedup_hotspots (id, title, subtitle, unified_heat, category, trend, platform, url, region)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  await db.batch(
    results.map((r) =>
      stmt.bind(
        r.id, r.title, r.subtitle, r.unifiedHeat,
        r.category, r.trend, r.platform, r.url, region
      )
    )
  );
}

// ============ 查询热点数据 ============

export async function queryHotspots(
  db: D1Database,
  options?: { region?: string; category?: string; keyword?: string; limit?: number }
): Promise<{ domestic: DedupRow[]; international: DedupRow[] }> {
  const limit = options?.limit || 50;
  const domestic: DedupRow[] = [];
  const international: DedupRow[] = [];

  const buildWhere = (region: string) => {
    const conds: string[] = [`region='${region}'`];
    const params: unknown[] = [];
    if (options?.category) { conds.push("category = ?"); params.push(options.category); }
    if (options?.keyword) { conds.push("title LIKE ?"); params.push(`%${options.keyword}%`); }
    return { where: conds.join(" AND "), params };
  };

  if (!options?.region || options.region === "all" || options.region === "domestic") {
    const w = buildWhere("domestic");
    const rows = await db.prepare(
      `SELECT * FROM dedup_hotspots WHERE ${w.where} ORDER BY unified_heat DESC LIMIT ?`
    ).bind(...w.params, limit).all<DedupRow>();
    domestic.push(...(rows.results || []));
  }

  if (!options?.region || options.region === "all" || options.region === "international") {
    const w = buildWhere("international");
    const rows = await db.prepare(
      `SELECT * FROM dedup_hotspots WHERE ${w.where} ORDER BY unified_heat DESC LIMIT ?`
    ).bind(...w.params, limit).all<DedupRow>();
    international.push(...(rows.results || []));
  }

  return { domestic, international };
}

// ============ 保存历史 Top15 ============

export async function saveHistory(
  db: D1Database,
  domesticResults: DedupRow[],
  internationalResults: DedupRow[]
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // 删除今天的旧记录
  await db.prepare("DELETE FROM history_hotspots WHERE date = ?").bind(today).run();

  const saveList = async (list: DedupRow[], region: string) => {
    const top15 = list.slice(0, 15);
    if (!top15.length) return;
    const stmt = db.prepare(
      `INSERT INTO history_hotspots (date, rank, title, subtitle, unified_heat, category, platform, url, region)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    await db.batch(
      top15.map((r, i) =>
        stmt.bind(today, i + 1, r.title, r.subtitle, r.unifiedHeat, r.category, r.platform, r.url, region)
      )
    );
  };

  await saveList(domesticResults, "domestic");
  await saveList(internationalResults, "international");
}

// ============ 查询历史数据 ============

export async function queryHistory(
  db: D1Database,
  days: number = 3,
  regionFilter: string = "all"
): Promise<{
  dates: string[];
  domestic: Record<string, HistoryRow[]>;
  international: Record<string, HistoryRow[]>;
}> {
  const rows = await db.prepare(
    `SELECT * FROM history_hotspots WHERE date >= date('now', ?) ORDER BY date DESC, rank ASC`
  ).bind(`-${days} days`).all<HistoryRow>();

  const datesSet = new Set<string>();
  const domestic: Record<string, HistoryRow[]> = {};
  const international: Record<string, HistoryRow[]> = {};

  for (const row of rows.results || []) {
    datesSet.add(row.date);
    if ((regionFilter === "all" || regionFilter === "domestic") && row.region === "domestic") {
      if (!domestic[row.date]) domestic[row.date] = [];
      domestic[row.date].push(row);
    }
    if ((regionFilter === "all" || regionFilter === "international") && row.region === "international") {
      if (!international[row.date]) international[row.date] = [];
      international[row.date].push(row);
    }
  }

  return {
    dates: [...datesSet].sort().reverse(),
    domestic,
    international,
  };
}

// ============ 获取/更新状态 ============

export async function getStatus(db: D1Database): Promise<Record<string, unknown>> {
  const row = await db.prepare("SELECT * FROM fetch_status WHERE key = 'last_refresh'").first();
  return {
    last_refresh: row?.value || "",
  };
}

export async function updateStatus(db: D1Database, failed: string[]): Promise<void> {
  await db.prepare(`INSERT OR REPLACE INTO fetch_status (key, value) VALUES ('last_refresh', ?)`).bind(new Date().toISOString()).run();
}
