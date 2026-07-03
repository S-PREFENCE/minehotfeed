"""
HotFeed 聚合热点 - 去重引擎
基于 jieba 分词 + TF-IDF 余弦相似度的标题去重
"""

import re
import json
import math
import uuid
import logging
from datetime import datetime
from collections import Counter
from typing import Optional
import jieba

from config import (
    DEDUP_SIMILARITY_THRESHOLD,
    CATEGORY_KEYWORDS,
    DOMESTIC_PLATFORMS,
    INTERNATIONAL_PLATFORMS,
)
from models import RawHotspot, DedupHotspot

logger = logging.getLogger(__name__)

# 初始化 jieba
jieba.setLogLevel(logging.WARNING)


# ---------- 中文分词 ----------

def tokenize(text: str) -> list:
    """对文本进行分词，过滤停用词和单字词"""
    # 去除标点和特殊字符
    text = re.sub(r'[^\u4e00-\u9fff\w]', ' ', text)
    words = jieba.lcut(text)
    # 过滤：长度 >= 2 且非纯数字
    return [w.strip().lower() for w in words if len(w.strip()) >= 2 and not w.strip().isdigit()]


# ---------- TF-IDF ----------

def compute_tf(tokens: list) -> dict:
    """计算词频 (TF)"""
    total = len(tokens)
    if total == 0:
        return {}
    counter = Counter(tokens)
    return {word: count / total for word, count in counter.items()}


# 全局 IDF 缓存（在去重时更新）
_idf_cache: dict = {}
_total_doc_count = 0


def update_idf(all_tokens_list: list):
    """更新 IDF 值"""
    global _idf_cache, _total_doc_count
    _total_doc_count = len(all_tokens_list)
    _idf_cache = {}

    # 统计每个词出现在多少文档中
    doc_freq = Counter()
    for tokens in all_tokens_list:
        unique_words = set(tokens)
        for word in unique_words:
            doc_freq[word] += 1

    # 计算 IDF = log(总文档数 / 包含该词的文档数)
    for word, freq in doc_freq.items():
        _idf_cache[word] = math.log((_total_doc_count + 1) / (freq + 1)) + 1


def compute_tfidf_vector(tokens: list) -> dict:
    """计算 TF-IDF 向量"""
    tf = compute_tf(tokens)
    vector = {}
    for word, tf_val in tf.items():
        idf_val = _idf_cache.get(word, 1.0)
        vector[word] = tf_val * idf_val
    return vector


def cosine_similarity(vec1: dict, vec2: dict) -> float:
    """计算两个向量的余弦相似度"""
    if not vec1 or not vec2:
        return 0.0

    # 求点积
    dot_product = 0.0
    for word in vec1:
        if word in vec2:
            dot_product += vec1[word] * vec2[word]

    # 求模长
    norm1 = math.sqrt(sum(v ** 2 for v in vec1.values()))
    norm2 = math.sqrt(sum(v ** 2 for v in vec2.values()))

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return dot_product / (norm1 * norm2)


# ---------- 热度归一化 ----------

def normalize_heat(hotspots: list) -> list:
    """
    对同一平台的热度进行归一化
    统一热度分 = (原始热度 - 该平台最小热度) / (该平台最大热度 - 该平台最小热度) × 100
    """
    if not hotspots:
        return hotspots

    # 按平台分组
    platform_groups = {}
    for h in hotspots:
        platform = h.get("platform", "unknown")
        if platform not in platform_groups:
            platform_groups[platform] = []
        platform_groups[platform].append(h)

    # 对每个平台分别归一化
    for platform, items in platform_groups.items():
        heats = [item.get("original_heat", 0) for item in items]
        min_heat = min(heats) if heats else 0
        max_heat = max(heats) if heats else 1

        for item in items:
            raw_heat = item.get("original_heat", 0)
            if max_heat == min_heat:
                item["normalized_heat"] = 50.0  # 所有热度相同时给中间值
            else:
                item["normalized_heat"] = (raw_heat - min_heat) / (max_heat - min_heat) * 100

    return hotspots


# ---------- 分类 ----------

def classify_title(title: str) -> str:
    """通过关键词匹配对标题进行分类"""
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in title.lower():
                return category
    return "社会"  # 默认分类


# ---------- 去重主逻辑 ----------

def deduplicate(hotspots: list, region: str) -> list:
    """
    对热点列表进行去重合并
    返回去重后的 DedupHotspot 列表
    """
    if not hotspots:
        return []

    # 热度归一化
    hotspots = normalize_heat(hotspots)

    # 分词
    all_tokens = []
    for h in hotspots:
        tokens = tokenize(h.get("title", ""))
        h["_tokens"] = tokens
        all_tokens.append(tokens)

    # 更新 IDF
    update_idf(all_tokens)

    # 计算 TF-IDF 向量
    for h in hotspots:
        h["_vector"] = compute_tfidf_vector(h.get("_tokens", []))

    # 聚类：相似度 > 阈值的归为一组
    clusters = []
    used = set()

    for i, h1 in enumerate(hotspots):
        if i in used:
            continue

        cluster = [h1]
        used.add(i)

        for j, h2 in enumerate(hotspots):
            if j in used:
                continue
            sim = cosine_similarity(h1["_vector"], h2["_vector"])
            if sim >= DEDUP_SIMILARITY_THRESHOLD:
                cluster.append(h2)
                used.add(j)

        clusters.append(cluster)

    # 对每个簇生成一个去重结果
    dedup_results = []
    for cluster in clusters:
        # 按归一化热度排序，取最高的作为主来源
        cluster.sort(key=lambda x: x.get("normalized_heat", 0), reverse=True)
        primary = cluster[0]
        secondaries = cluster[1:] if len(cluster) > 1 else []

        # 统一热度 = 主来源的归一化热度（考虑次来源加权）
        unified_heat = primary.get("normalized_heat", 0)
        if secondaries:
            # 有多个来源时，热度略加权
            bonus = sum(s.get("normalized_heat", 0) for s in secondaries) * 0.05
            unified_heat = min(100, unified_heat + bonus)

        # 标题使用主来源的
        title = primary.get("title", "")

        # 副标题：如果有多个来源且标题不同，使用次来源的标题
        subtitle = ""
        if secondaries and secondaries[0].get("title", "") != title:
            subtitle = secondaries[0].get("title", "")

        # 分类
        category = classify_title(title)

        # 趋势（初期都标为 stable）
        trend = "stable"

        # 生成去重 ID
        dedup_id = f"dedup_{uuid.uuid4().hex[:12]}"

        now = datetime.now()
        dedup = DedupHotspot(
            id=dedup_id,
            title=title,
            subtitle=subtitle,
            unified_heat=round(unified_heat, 1),
            category=category,
            trend=trend,
            primary_source_id=primary.get("_db_id"),  # 需要在插入数据库后回填
            secondary_source_ids=[s.get("_db_id") for s in secondaries if s.get("_db_id")],
            region=region,
            created_at=now,
            updated_at=now,
        )

        # 附加原始来源信息，用于 API 返回
        dedup._primary_source_data = primary
        dedup._secondary_sources_data = secondaries

        dedup_results.append(dedup)

    # 按统一热度降序排列
    dedup_results.sort(key=lambda x: x.unified_heat, reverse=True)

    return dedup_results
