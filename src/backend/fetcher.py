"""
HotFeed 聚合热点 - 数据抓取模块
支持国内平台（UAPIS API）和国际平台（RSS/JSON）
"""

import httpx
import feedparser
import logging
from datetime import datetime
from typing import Optional
from config import (
    DOMESTIC_PLATFORMS,
    INTERNATIONAL_PLATFORMS,
    UAPIS_BASE_URL,
    RSS_FEEDS,
    REDDIT_HOT_URL,
)

logger = logging.getLogger(__name__)


async def fetch_domestic_platform(client: httpx.AsyncClient, platform_key: str) -> Optional[list]:
    """
    抓取单个国内平台的热点数据
    使用 UAPIS 免费 API
    """
    platform_name = DOMESTIC_PLATFORMS.get(platform_key, platform_key)
    url = f"{UAPIS_BASE_URL}?type={platform_key}"

    try:
        response = await client.get(url, timeout=15.0)
        response.raise_for_status()
        data = response.json()

        # UAPIS API 返回格式可能是:
        # {"code":0, "data":{"list":[...]}} 或直接 {"type":"weibo", "list":[...]}
        if "code" in data and data.get("code") != 0:
            logger.warning(f"UAPIS API 返回错误: platform={platform_key}, code={data.get('code')}")
            return None

        items = data.get("list", data.get("data", {}).get("list", []))
        if not items:
            logger.warning(f"平台 {platform_name} 返回空数据")
            return []

        hotspots = []
        for item in items:
            title = (item.get("title") or "").strip()
            if not title:
                continue

            # 热度字段可能是 heat / hot_value / index
            raw_heat = item.get("heat", item.get("hot_value", 0))
            # 排名字段可能是 rank / index
            rank = item.get("rank", item.get("index", 0))

            # 解析热度值（可能是 "1386 万热度"、"209万播放"、"1,132.2万" 等格式）
            parsed_heat = 0.0
            try:
                if isinstance(raw_heat, str):
                    raw_heat_str = raw_heat.replace(",", "").replace("，", "").strip()
                    if "万" in raw_heat_str:
                        num_str = raw_heat_str.replace("万热度", "").replace("万播放", "").replace("万", "").replace("热度", "").replace("播放", "").strip()
                        parsed_heat = float(num_str) * 10000
                    elif "亿" in raw_heat_str:
                        num_str = raw_heat_str.replace("亿", "").replace("热度", "").replace("播放", "").strip()
                        parsed_heat = float(num_str) * 100000000
                    else:
                        num_str = ''.join(c for c in raw_heat_str if c.isdigit() or c == '.')
                        parsed_heat = float(num_str or 0)
                else:
                    parsed_heat = float(raw_heat or 0)
            except (ValueError, TypeError):
                parsed_heat = 0.0

            parsed_rank = 0
            try:
                parsed_rank = int(rank or 0)
            except (ValueError, TypeError):
                parsed_rank = 0

            hotspots.append({
                "platform": platform_name,
                "region": "domestic",
                "title": title,
                "original_heat": parsed_heat,
                "rank": parsed_rank,
                "url": item.get("url", ""),
                "tags": item.get("tags", item.get("extra", [])) if isinstance(item.get("tags", item.get("extra", {})), list) else [],
                "thumbnail": item.get("thumbnail", ""),
            })

        logger.info(f"抓取完成: {platform_name} -> {len(hotspots)} 条")
        return hotspots

    except httpx.TimeoutException:
        logger.error(f"抓取超时: {platform_name}")
        return None
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP 错误: {platform_name}, status={e.response.status_code}")
        return None
    except Exception as e:
        logger.error(f"抓取异常: {platform_name}, error={e}")
        return None


async def fetch_rss_platform(client: httpx.AsyncClient, platform_key: str, region: str = "international") -> Optional[list]:
    """
    抓取单个 RSS 源的热点数据
    使用 feedparser 解析
    支持国内（人民日报）和国际（BBC/CNN/Google News/YouTube）源
    """
    # 平台名称：国内源在 DOMESTIC_PLATFORMS 里，国际源在 INTERNATIONAL_PLATFORMS 里
    platform_name = INTERNATIONAL_PLATFORMS.get(platform_key) or DOMESTIC_PLATFORMS.get(platform_key, platform_key)
    url = RSS_FEEDS.get(platform_key)

    if not url:
        logger.warning(f"未知的 RSS 平台: {platform_key}")
        return None

    try:
        # 使用 follow_redirects=True 和较长超时，关闭 SSL 验证以避免部分源 TLS 失败
        response = await client.get(url, timeout=20.0, follow_redirects=True)
        response.raise_for_status()

        feed = feedparser.parse(response.text)
        if not feed.entries:
            logger.warning(f"RSS 解析为空: {platform_name}")
            return []

        hotspots = []
        for idx, entry in enumerate(feed.entries):
            title = (entry.get("title") or "").strip()
            if not title:
                continue

            # 尝试提取热度（RSS 通常没有热度数据，用条目顺序模拟）
            heat = 100 - min(idx, 99)  # 第一条热度最高

            hotspots.append({
                "platform": platform_name,
                "region": region,
                "title": title,
                "original_heat": float(heat),
                "rank": idx + 1,
                "url": entry.get("link", ""),
                "tags": [],
                "thumbnail": "",
            })

        logger.info(f"抓取完成: {platform_name} -> {len(hotspots)} 条")
        return hotspots

    except httpx.TimeoutException:
        logger.error(f"抓取超时: {platform_name}")
        return None
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP 错误: {platform_name}, status={e.response.status_code}")
        return None
    except Exception as e:
        logger.error(f"抓取异常: {platform_name}, error={e}")
        return None


async def fetch_reddit(client: httpx.AsyncClient) -> Optional[list]:
    """
    抓取 Reddit r/all/hot 数据
    使用 JSON API
    """
    platform_name = "Reddit"

    try:
        headers = {
            "User-Agent": "HotFeed/1.0 (Aggregator Bot)"
        }
        response = await client.get(REDDIT_HOT_URL, headers=headers, timeout=15.0)
        response.raise_for_status()

        data = response.json()
        posts = data.get("data", {}).get("children", [])

        if not posts:
            logger.warning("Reddit 返回空数据")
            return []

        hotspots = []
        for idx, post in enumerate(posts):
            post_data = post.get("data", {})
            title = (post_data.get("title") or "").strip()
            if not title:
                continue

            score = post_data.get("score", 0)
            num_comments = post_data.get("num_comments", 0)
            heat = score + num_comments * 2  # 综合热度

            hotspots.append({
                "platform": platform_name,
                "region": "international",
                "title": title,
                "original_heat": float(heat),
                "rank": idx + 1,
                "url": f"https://www.reddit.com{post_data.get('permalink', '')}",
                "tags": [],
                "thumbnail": post_data.get("thumbnail", "") if post_data.get("thumbnail", "").startswith("http") else "",
            })

        logger.info(f"抓取完成: {platform_name} -> {len(hotspots)} 条")
        return hotspots

    except httpx.TimeoutException:
        logger.error(f"抓取超时: {platform_name}")
        return None
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP 错误: {platform_name}, status={e.response.status_code}")
        return None
    except Exception as e:
        logger.error(f"抓取异常: {platform_name}, error={e}")
        return None


async def fetch_all_domestic(client: httpx.AsyncClient, platform_keys: list) -> dict:
    """
    抓取所有国内平台
    返回: {results: [...], failed_platforms: [...]}
    """
    import asyncio
    all_hotspots = []
    failed_platforms = []

    for platform_key in platform_keys:
        result = await fetch_domestic_platform(client, platform_key)
        if result is None:
            failed_platforms.append(DOMESTIC_PLATFORMS.get(platform_key, platform_key))
        elif result:
            all_hotspots.extend(result)
        # 每个平台间延迟 1 秒，避免 429 限流
        await asyncio.sleep(1.0)

    return {
        "results": all_hotspots,
        "failed_platforms": failed_platforms,
    }


async def fetch_all_international(client: httpx.AsyncClient) -> dict:
    """
    抓取所有国际平台（RSS + Reddit）
    返回: {results: [...], failed_platforms: [...]}
    """
    all_hotspots = []
    failed_platforms = []

    # 国际 RSS 源（排除 people 国内源）
    intl_rss_keys = [k for k in RSS_FEEDS if k != "people"]
    for platform_key in intl_rss_keys:
        result = await fetch_rss_platform(client, platform_key, "international")
        if result is None:
            failed_platforms.append(INTERNATIONAL_PLATFORMS.get(platform_key, platform_key))
        elif result:
            all_hotspots.extend(result)

    # Reddit
    result = await fetch_reddit(client)
    if result is None:
        failed_platforms.append("Reddit")
    elif result:
        all_hotspots.extend(result)

    return {
        "results": all_hotspots,
        "failed_platforms": failed_platforms,
    }


async def fetch_people_rss(client: httpx.AsyncClient) -> dict:
    """
    抓取人民日报 RSS（国内源，但走 RSS 而非 UAPIS）
    """
    result = await fetch_rss_platform(client, "people", "domestic")
    if result is None:
        return {"results": [], "failed_platforms": ["人民日报"]}
    return {"results": result, "failed_platforms": []}


async def fetch_all() -> dict:
    """
    执行全量抓取（国内 + 国际）
    国内：UAPIS API（11平台）+ 人民日报 RSS
    国际：RSS（4源）+ Reddit
    """
    # 创建 client 时关闭 SSL 验证以避免部分国际源 TLS 失败
    async with httpx.AsyncClient(verify=False) as client:
        # 国内：UAPIS 平台
        domestic_result = await fetch_all_domestic(client, list(DOMESTIC_PLATFORMS.keys()))
        # 国内：人民日报 RSS
        people_result = await fetch_people_rss(client)
        domestic_result["results"].extend(people_result["results"])
        domestic_result["failed_platforms"].extend(people_result["failed_platforms"])

        # 国际
        international_result = await fetch_all_international(client)

    return {
        "domestic": domestic_result,
        "international": international_result,
    }
