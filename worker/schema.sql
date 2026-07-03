-- HotFeed D1 数据库初始化脚本
-- 在 Cloudflare Dashboard → Workers & Pages → D1 → 创建数据库后执行此 SQL

-- 去重热点表
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

-- 历史热搜表
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

-- 抓取状态表
CREATE TABLE IF NOT EXISTS fetch_status (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_dedup_region ON dedup_hotspots(region);
CREATE INDEX IF NOT EXISTS idx_dedup_category ON dedup_hotspots(category);
CREATE INDEX IF NOT EXISTS idx_dedup_updated ON dedup_hotspots(updated_at);
CREATE INDEX IF NOT EXISTS idx_history_date ON history_hotspots(date);
