#!/usr/bin/env python3
"""
HotFeed 本地抓取脚本 — 从国内环境抓取 UAPI 热点数据，推送到 Cloudflare Worker
使用方法：
  python3 fetch_and_push.py              # 单次抓取+推送
  python3 fetch_and_push.py --daemon     # 守护模式，每10分钟自动执行
  python3 fetch_and_push.py --dry-run    # 只抓取不推送（测试用）

依赖：pip install requests
"""

import json
import time
import sys
import os
import argparse
from datetime import datetime

try:
    import requests
except ImportError:
    print("[错误] 请先安装 requests: pip install requests")
    sys.exit(1)

# ============ 配置 ============

# Cloudflare Worker 地址（替换为你的实际地址）
WORKER_URL = "https://hotfeed-backend.2628944969.workers.dev/api/v1/push"

# UAPI 热点 API
UAPIS_BASE = "https://uapis.cn/api/v1/misc/hotboard"

# 国内平台列表
DOMESTIC_PLATFORMS = {
    "weibo": "微博",
    "douyin": "抖音",
    "baidu": "百度",
    "zhihu": "知乎",
    "toutiao": "头条",
    "bilibili": "B站",
    "kuaishou": "快手",
    "xiaohongshu": "小红书",
    "tencent-news": "腾讯新闻",
    "netease-news": "网易新闻",
    "hupu": "虎扑",
}

# 分类关键词
CATEGORY_KEYWORDS = {
    "科技": ["科技", "AI", "人工智能", "芯片", "手机", "苹果", "华为", "特斯拉",
             "SpaceX", "Google", "Apple", "Microsoft", "5G", "机器人", "大模型",
             "ChatGPT", "GPT", "算法", "数据", "编程", "软件", "硬件", "互联网", "电商"],
    "娱乐": ["娱乐", "电影", "音乐", "明星", "综艺", "电视剧", "演出", "演唱会",
             "网红", "直播", "短视频"],
    "财经": ["财经", "股票", "基金", "A股", "美股", "港股", "比特币", "加密货币",
             "金融", "投资", "经济", "GDP", "通胀", "利率", "央行", "银行", "保险",
             "房地产", "房价", "汇率", "贸易"],
    "体育": ["体育", "足球", "篮球", "NBA", "世界杯", "奥运会", "欧冠", "英超",
             "中超", "C罗", "梅西", "网球", "F1", "马拉松", "电竞", "比赛", "决赛", "联赛"],
    "社会": ["社会", "政策", "法律", "民生", "教育", "医疗", "环境", "交通",
             "天气", "地震", "事故", "安全", "犯罪", "法院", "政府", "改革"],
}


def classify_category(title):
    """根据标题关键词分类"""
    t = title.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in t:
                return cat
    return "综合"


def parse_heat(raw):
    """解析热度值"""
    if isinstance(raw, (int, float)):
        return float(raw)
    if not isinstance(raw, str):
        return 0.0
    s = raw.replace(",", "").replace("，", "").strip()
    if "万" in s:
        n = float(''.join(c for c in s if c.isdigit() or c == '.'))
        return n * 10000 if n else 0
    if "亿" in s:
        n = float(''.join(c for c in s if c.isdigit() or c == '.'))
        return n * 100000000 if n else 0
    n = float(''.join(c for c in s if c.isdigit() or c == '.'))
    return n if n else 0.0


def fetch_platform(platform_key):
    """抓取单个平台的热点"""
    name = DOMESTIC_PLATFORMS.get(platform_key, platform_key)
    url = f"{UAPIS_BASE}?type={platform_key}"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        items = data.get("list") or data.get("data", {}).get("list") or []
        if not isinstance(items, list):
            return [], name

        results = []
        for idx, item in enumerate(items):
            title = str(item.get("title", "")).strip()
            if not title:
                continue

            results.append({
                "id": f"{platform_key}-{idx}",
                "title": title,
                "subtitle": "",
                "platform": name,
                "region": "domestic",
                "originalHeat": parse_heat(item.get("heat") or item.get("hot_value") or 0),
                "unified_heat": 0,
                "category": classify_category(title),
                "trend": "stable",
                "rank": int(item.get("rank") or item.get("index") or idx + 1),
                "url": str(item.get("url", "")),
            })

        return results, name
    except Exception as e:
        print(f"  [失败] {name}: {e}")
        return [], name


def fetch_all():
    """抓取所有平台"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 开始抓取 {len(DOMESTIC_PLATFORMS)} 个平台...")

    domestic = []
    failed = []

    delay = 0.3  # 平台间延迟，避免 429
    for i, key in enumerate(DOMESTIC_PLATFORMS):
        if i > 0:
            time.sleep(delay)
        items, name = fetch_platform(key)
        if items:
            domestic.extend(items)
            print(f"  [OK] {name}: {len(items)} 条")
        else:
            failed.append(name)

    # 按热度排序
    domestic.sort(key=lambda x: x["originalHeat"], reverse=True)

    # 简单去重（完全相同的标题）
    seen = set()
    deduped = []
    for item in domestic:
        if item["title"] not in seen:
            seen.add(item["title"])
            deduped.append(item)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] 完成: 国内 {len(deduped)} 条, 失败 {len(failed)} 个平台")
    if failed:
        print(f"  失败平台: {', '.join(failed)}")

    return deduped, failed


def push_to_worker(domestic, failed, dry_run=False):
    """推送数据到 Worker"""
    payload = {
        "domestic": domestic,
        "international": [],
        "failed": failed,
    }

    if dry_run:
        print(f"\n[DRY RUN] 将推送 {len(domestic)} 条国内数据到 {WORKER_URL}")
        print(f"[DRY RUN] 前5条预览:")
        for item in domestic[:5]:
            print(f"  [{item['platform']}] {item['title']} (热度:{item['originalHeat']})")
        return True

    print(f"\n推送 {len(domestic)} 条数据到 Worker...")
    try:
        resp = requests.post(WORKER_URL, json=payload, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        print(f"  Worker 响应: {json.dumps(result, ensure_ascii=False)}")
        return result.get("ok", False)
    except Exception as e:
        print(f"  [推送失败] {e}")
        return False


def daemon_mode(interval=600):
    """守护模式：每 interval 秒执行一次"""
    print(f"HotFeed 本地抓取守护进程启动")
    print(f"推送目标: {WORKER_URL}")
    print(f"抓取间隔: {interval}秒 ({interval//60}分钟)")
    print(f"按 Ctrl+C 停止\n")

    while True:
        try:
            domestic, failed = fetch_all()
            if domestic:
                push_to_worker(domestic, failed)
            else:
                print("[警告] 未抓取到任何数据，跳过推送")
        except Exception as e:
            print(f"[错误] {e}")

        print(f"\n下次抓取: {(datetime.now().timestamp() + interval)}")
        print("-" * 50)
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="HotFeed 本地热点抓取脚本")
    parser.add_argument("--daemon", action="store_true", help="守护模式，持续运行")
    parser.add_argument("--dry-run", action="store_true", help="只抓取不推送")
    parser.add_argument("--interval", type=int, default=600, help="守护模式抓取间隔（秒），默认600")
    parser.add_argument("--worker-url", type=str, default=WORKER_URL, help="Worker 推送地址")
    args = parser.parse_args()

    worker_url = args.worker_url

    if args.daemon:
        # 更新全局变量供 daemon_mode 使用
        import __main__
        __main__.WORKER_URL = worker_url
        daemon_mode(args.interval)
    else:
        domestic, failed = fetch_all()
        if domestic:
            push_to_worker(domestic, failed, args.dry_run)
        else:
            print("[错误] 未抓取到任何数据！请检查网络连接。")


if __name__ == "__main__":
    main()
