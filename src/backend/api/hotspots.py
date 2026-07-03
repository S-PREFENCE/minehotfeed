"""
HotFeed 聚合热点 - API 路由
提供热点数据查询接口
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, Query, HTTPException

from database import get_connection
from scheduler import get_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["hotspots"])


def build_source_info(row: dict, platform_map: dict) -> dict:
    """构建来源信息"""
    tags_str = row.get("tags", "[]")
    try:
        tags = json.loads(tags_str) if isinstance(tags_str, str) else tags_str
    except (json.JSONDecodeError, TypeError):
        tags = []

    return {
        "platform": row.get("platform", ""),
        "rank": row.get("rank", 0),
        "original_heat": row.get("original_heat", 0),
        "url": row.get("url", ""),
        "tags": tags if isinstance(tags, list) else [],
    }


def build_dedup_response(conn, dedup_row: dict) -> dict:
    """
    根据去重记录构建完整的 API 响应格式
    """
    # 主来源信息
    primary_source_id = dedup_row.get("primary_source_id")
    primary_source = {}
    if primary_source_id:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM raw_hotspots WHERE id = ?", (primary_source_id,))
        raw = cursor.fetchone()
        if raw:
            raw_dict = dict(raw)
            primary_source = build_source_info(raw_dict, {})

    # 次要来源信息
    secondary_source_ids_str = dedup_row.get("secondary_source_ids", "[]")
    try:
        secondary_source_ids = json.loads(secondary_source_ids_str) if isinstance(secondary_source_ids_str, str) else secondary_source_ids_str
    except (json.JSONDecodeError, TypeError):
        secondary_source_ids = []

    secondary_sources = []
    if secondary_source_ids:
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in secondary_source_ids)
        cursor.execute(
            f"SELECT * FROM raw_hotspots WHERE id IN ({placeholders})",
            secondary_source_ids
        )
        for raw in cursor.fetchall():
            raw_dict = dict(raw)
            secondary_sources.append(build_source_info(raw_dict, {}))

    return {
        "id": dedup_row.get("id", ""),
        "title": dedup_row.get("title", ""),
        "subtitle": dedup_row.get("subtitle", ""),
        "unified_heat": round(dedup_row.get("unified_heat", 0), 1),
        "category": dedup_row.get("category", "社会"),
        "trend": dedup_row.get("trend", "stable"),
        "primary_source": primary_source,
        "secondary_sources": secondary_sources,
        "updated_at": dedup_row.get("updated_at", ""),
    }


@router.get("/hotspots")
async def get_hotspots(
    region: Optional[str] = Query("all", description="地区过滤: domestic, international, all"),
    category: Optional[str] = Query(None, description="分类过滤: 科技, 娱乐, 财经, 体育, 社会"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    limit: int = Query(50, ge=1, le=200, description="返回数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """
    获取热点数据
    返回国内和国际两个数组，以及元信息
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # 构建查询条件
        def build_query(target_region: str) -> tuple:
            """构建 SQL 查询"""
            conditions = ["region = ?"]
            params = [target_region]

            if category:
                conditions.append("category = ?")
                params.append(category)

            if keyword:
                conditions.append("title LIKE ?")
                params.append(f"%{keyword}%")

            where_clause = " AND ".join(conditions)
            return where_clause, params

        domestic = []
        international = []

        # 查询国内数据
        if region in ("domestic", "all"):
            where, params = build_query("domestic")
            count_sql = f"SELECT COUNT(*) FROM dedup_hotspots WHERE {where}"
            cursor.execute(count_sql, params)
            total_domestic = cursor.fetchone()[0]

            query_sql = f"""
                SELECT * FROM dedup_hotspots 
                WHERE {where}
                ORDER BY unified_heat DESC
                LIMIT ? OFFSET ?
            """
            cursor.execute(query_sql, params + [limit, offset])

            for row in cursor.fetchall():
                row_dict = dict(row)
                domestic.append(build_dedup_response(conn, row_dict))

        # 查询国际数据
        if region in ("international", "all"):
            where, params = build_query("international")
            count_sql = f"SELECT COUNT(*) FROM dedup_hotspots WHERE {where}"
            cursor.execute(count_sql, params)
            total_international = cursor.fetchone()[0]

            query_sql = f"""
                SELECT * FROM dedup_hotspots 
                WHERE {where}
                ORDER BY unified_heat DESC
                LIMIT ? OFFSET ?
            """
            cursor.execute(query_sql, params + [limit, offset])

            for row in cursor.fetchall():
                row_dict = dict(row)
                international.append(build_dedup_response(conn, row_dict))

        # 获取调度状态
        status = get_status()

        return {
            "code": 0,
            "data": {
                "domestic": domestic,
                "international": international,
                "meta": {
                    "total_domestic": status.get("total_domestic", len(domestic)),
                    "total_international": status.get("total_international", len(international)),
                    "last_refresh": status.get("last_refresh", ""),
                    "failed_platforms": status.get("failed_platforms", []),
                }
            }
        }

    except Exception as e:
        logger.error(f"查询热点失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok", "timestamp": __import__("datetime").datetime.now().isoformat()}


@router.get("/history")
async def get_history(
    days: int = Query(3, ge=1, le=7, description="返回最近 N 天的历史"),
    region: Optional[str] = Query("all", description="地区: domestic, international, all"),
):
    """
    获取历史热搜 Top 15
    返回前 N 天每天国内/国际各 Top 15
    """
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # 查询最近 N 天的日期列表
        cursor.execute(
            "SELECT DISTINCT date FROM history_hotspots WHERE date >= date('now', ?) ORDER BY date DESC",
            (f'-{days} days',)
        )
        dates = [row[0] for row in cursor.fetchall()]

        result = {"dates": dates, "domestic": {}, "international": {}}

        for date_str in dates:
            if region in ("domestic", "all"):
                cursor.execute(
                    "SELECT * FROM history_hotspots WHERE date = ? AND region = 'domestic' ORDER BY rank ASC LIMIT 15",
                    (date_str,)
                )
                rows = [dict(r) for r in cursor.fetchall()]
                for r in rows:
                    try:
                        r["multi_platforms"] = json.loads(r.get("multi_platforms", "[]"))
                    except:
                        r["multi_platforms"] = []
                result["domestic"][date_str] = rows

            if region in ("international", "all"):
                cursor.execute(
                    "SELECT * FROM history_hotspots WHERE date = ? AND region = 'international' ORDER BY rank ASC LIMIT 15",
                    (date_str,)
                )
                rows = [dict(r) for r in cursor.fetchall()]
                for r in rows:
                    try:
                        r["multi_platforms"] = json.loads(r.get("multi_platforms", "[]"))
                    except:
                        r["multi_platforms"] = []
                result["international"][date_str] = rows

        return {"code": 0, "data": result}

    except Exception as e:
        logger.error(f"查询历史热搜失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
