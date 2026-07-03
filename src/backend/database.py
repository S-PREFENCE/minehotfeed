"""
HotFeed 聚合热点 - 数据库模块
使用 SQLite 存储数据，自动创建目录和表结构
"""

import sqlite3
import os
from config import DATABASE_PATH, DATA_DIR, DATA_RETENTION_DAYS, HISTORY_RETENTION_DAYS


def get_connection() -> sqlite3.Connection:
    """获取数据库连接，自动创建目录"""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """初始化数据库表结构"""
    conn = get_connection()
    cursor = conn.cursor()

    # 原始热点表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS raw_hotspots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            region TEXT NOT NULL DEFAULT 'domestic',
            title TEXT NOT NULL,
            original_heat REAL DEFAULT 0,
            rank INTEGER DEFAULT 0,
            url TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            thumbnail TEXT DEFAULT '',
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            batch_id TEXT NOT NULL
        )
    """)

    # 去重热点表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dedup_hotspots (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subtitle TEXT DEFAULT '',
            unified_heat REAL DEFAULT 0,
            category TEXT DEFAULT '社会',
            trend TEXT DEFAULT 'stable',
            primary_source_id INTEGER,
            secondary_source_ids TEXT DEFAULT '[]',
            region TEXT NOT NULL DEFAULT 'domestic',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (primary_source_id) REFERENCES raw_hotspots(id)
        )
    """)

    # 历史热搜表：每天保存 Top 15
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history_hotspots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            rank INTEGER NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT DEFAULT '',
            unified_heat REAL DEFAULT 0,
            category TEXT DEFAULT '社会',
            primary_platform TEXT DEFAULT '',
            primary_url TEXT DEFAULT '',
            multi_platforms TEXT DEFAULT '[]',
            region TEXT NOT NULL DEFAULT 'domestic',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 索引
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_raw_batch_id ON raw_hotspots(batch_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_raw_platform ON raw_hotspots(platform)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_raw_region ON raw_hotspots(region)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dedup_region ON dedup_hotspots(region)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dedup_category ON dedup_hotspots(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dedup_updated ON dedup_hotspots(updated_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_date ON history_hotspots(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_region ON history_hotspots(region)")

    conn.commit()
    conn.close()


def cleanup_old_data():
    """清理超过保留天数的旧数据（7天）"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "DELETE FROM raw_hotspots WHERE fetched_at < datetime('now', ?)",
        (f'-{DATA_RETENTION_DAYS} days',)
    )
    raw_deleted = cursor.rowcount

    cursor.execute(
        "DELETE FROM dedup_hotspots WHERE updated_at < datetime('now', ?)",
        (f'-{DATA_RETENTION_DAYS} days',)
    )
    dedup_deleted = cursor.rowcount

    # 清理超过 3 天的历史热搜
    cursor.execute(
        "DELETE FROM history_hotspots WHERE date < date('now', ?)",
        (f'-{HISTORY_RETENTION_DAYS} days',)
    )
    history_deleted = cursor.rowcount

    conn.commit()
    conn.close()

    return raw_deleted, dedup_deleted, history_deleted


def save_history_top15(conn, domestic_dedup, international_dedup):
    """保存当日 Top 15 到历史表（每天只保存一次，覆盖同日数据）"""
    import json
    from datetime import datetime
    cursor = conn.cursor()
    today = datetime.now().strftime('%Y-%m-%d')

    # 删除今天的旧记录（如果有）
    cursor.execute("DELETE FROM history_hotspots WHERE date = ?", (today,))

    def save_list(dedup_list, region):
        for dedup in dedup_list[:15]:  # 只取前 15
            data = dedup.to_dict()
            primary = data.get("primary_source", {})
            secondary = data.get("secondary_sources", [])
            platforms = [primary.get("platform", "")]
            for s in secondary:
                if s.get("platform") and s["platform"] not in platforms:
                    platforms.append(s["platform"])

            cursor.execute(
                """INSERT INTO history_hotspots
                   (date, rank, title, subtitle, unified_heat, category,
                    primary_platform, primary_url, multi_platforms, region)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    today,
                    data.get("rank", 0),
                    data["title"],
                    data.get("subtitle", ""),
                    data.get("unified_heat", 0),
                    data.get("category", "社会"),
                    primary.get("platform", ""),
                    primary.get("url", ""),
                    json.dumps(platforms, ensure_ascii=False),
                    region,
                )
            )

    save_list(domestic_dedup, "domestic")
    save_list(international_dedup, "international")
    conn.commit()
