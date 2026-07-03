"""
HotFeed 聚合热点 - 定时调度器
使用 APScheduler 每 10 分钟执行一次数据抓取 + 去重流程
"""

import uuid
import asyncio
import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import FETCH_INTERVAL_MINUTES, DATA_RETENTION_DAYS, DOMESTIC_PLATFORMS, INTERNATIONAL_PLATFORMS
from database import get_connection, cleanup_old_data, save_history_top15
from fetcher import fetch_all
from dedup import deduplicate

logger = logging.getLogger(__name__)

# 全局状态：上次刷新时间和失败平台
_last_refresh: str = ""
_failed_platforms: list = []
_total_domestic: int = 0
_total_international: int = 0

# 调度器实例 - 使用异步调度器
scheduler = AsyncIOScheduler()


def get_status() -> dict:
    """获取当前抓取状态"""
    return {
        "last_refresh": _last_refresh,
        "failed_platforms": _failed_platforms,
        "total_domestic": _total_domestic,
        "total_international": _total_international,
    }


def save_raw_hotspots(conn, hotspots: list, batch_id: str, region: str):
    """将原始热点数据保存到数据库"""
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    for h in hotspots:
        cursor.execute(
            """INSERT INTO raw_hotspots 
               (platform, region, title, original_heat, rank, url, tags, thumbnail, fetched_at, batch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                h["platform"],
                region,
                h["title"],
                h.get("original_heat", 0),
                h.get("rank", 0),
                h.get("url", ""),
                str(h.get("tags", [])),
                h.get("thumbnail", ""),
                now,
                batch_id,
            )
        )
        # 回填数据库 ID
        h["_db_id"] = cursor.lastrowid

    conn.commit()


def save_dedup_hotspots(conn, dedup_list: list):
    """将去重热点保存到数据库，替换同 region 的旧数据"""
    cursor = conn.cursor()

    if not dedup_list:
        return

    region = dedup_list[0].region

    # 删除该 region 的旧去重数据
    cursor.execute("DELETE FROM dedup_hotspots WHERE region = ?", (region,))
    conn.commit()

    # 插入新数据
    for dedup in dedup_list:
        data = dedup.to_dict()
        cursor.execute(
            """INSERT INTO dedup_hotspots 
               (id, title, subtitle, unified_heat, category, trend, 
                primary_source_id, secondary_source_ids, region, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["id"],
                data["title"],
                data["subtitle"],
                data["unified_heat"],
                data["category"],
                data["trend"],
                data["primary_source_id"],
                data["secondary_source_ids"],
                data["region"],
                data["created_at"],
                data["updated_at"],
            )
        )

    conn.commit()


async def fetch_and_dedup():
    """
    核心任务：抓取数据 -> 去重 -> 存储
    异步版本，配合 AsyncIOScheduler 使用
    """
    global _last_refresh, _failed_platforms, _total_domestic, _total_international

    batch_id = str(uuid.uuid4())
    logger.info(f"开始抓取任务: batch_id={batch_id}")

    all_failed = []
    conn = None

    try:
        conn = get_connection()

        # 1. 异步抓取所有数据
        fetch_result = await fetch_all()

        # 2. 处理国内数据
        domestic_data = fetch_result.get("domestic", {})
        domestic_hotspots = domestic_data.get("results", [])
        domestic_failed = domestic_data.get("failed_platforms", [])
        all_failed.extend(domestic_failed)

        if domestic_hotspots:
            save_raw_hotspots(conn, domestic_hotspots, batch_id, "domestic")
            domestic_dedup = deduplicate(domestic_hotspots, "domestic")
            save_dedup_hotspots(conn, domestic_dedup)
            _total_domestic = len(domestic_dedup)
            logger.info(f"国内去重完成: {len(domestic_hotspots)} 条原始 -> {len(domestic_dedup)} 条去重")
        else:
            _total_domestic = 0

        # 3. 处理国际数据
        international_data = fetch_result.get("international", {})
        international_hotspots = international_data.get("results", [])
        international_failed = international_data.get("failed_platforms", [])
        all_failed.extend(international_failed)

        if international_hotspots:
            save_raw_hotspots(conn, international_hotspots, batch_id, "international")
            international_dedup = deduplicate(international_hotspots, "international")
            save_dedup_hotspots(conn, international_dedup)
            _total_international = len(international_dedup)
            logger.info(f"国际去重完成: {len(international_hotspots)} 条原始 -> {len(international_dedup)} 条去重")
        else:
            _total_international = 0

        # 4. 更新状态
        _last_refresh = datetime.now().isoformat()
        _failed_platforms = all_failed

        # 5. 保存历史 Top 15
        domestic_dedup_final = domestic_dedup if domestic_hotspots else []
        international_dedup_final = international_dedup if international_hotspots else []
        save_history_top15(conn, domestic_dedup_final, international_dedup_final)
        logger.info(f"历史 Top15 已保存")

        # 6. 清理旧数据（7天 + 历史3天）
        raw_deleted, dedup_deleted, history_deleted = cleanup_old_data()
        logger.info(f"清理旧数据: raw={raw_deleted}, dedup={dedup_deleted}, history={history_deleted}")

    except Exception as e:
        logger.error(f"抓取任务异常: {e}", exc_info=True)
    finally:
        if conn:
            conn.close()


async def start_scheduler():
    """启动定时调度器（异步）"""
    # 先启动调度器，不阻塞 FastAPI 启动
    scheduler.add_job(
        fetch_and_dedup,
        'interval',
        minutes=FETCH_INTERVAL_MINUTES,
        id='fetch_hotspots',
        name='定时抓取热点数据',
        replace_existing=True,
        next_run_time=datetime.now(),  # 立即执行首次抓取（但不阻塞）
    )

    scheduler.start()
    logger.info(f"调度器已启动，首次抓取将在后台执行，之后每 {FETCH_INTERVAL_MINUTES} 分钟执行一次")


def stop_scheduler():
    """停止调度器"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("调度器已停止")
