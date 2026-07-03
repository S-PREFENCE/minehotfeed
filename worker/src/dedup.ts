// HotFeed — 简化去重引擎（适配 Cloudflare Workers 环境）
// 不依赖 jieba，使用：关键词重叠 + 编辑距离 + 标题归一化

import { CATEGORY_KEYWORDS, DEDUP_THRESHOLD } from "./config";
import type { HotspotItem } from "./fetcher";

export interface DedupResult {
  id: string;
  title: string;
  subtitle: string;
  unifiedHeat: number;
  category: string;
  trend: string;
  platform: string;
  url: string;
}

// ============ 分词简化版 — 按字符+常见2字词切分 ============

function simpleTokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  // 去掉标点和空格
  const clean = text.replace(/[^\u4e00-\u9fa5\w]/g, " ");
  // 提取所有2-4字子串
  for (let i = 0; i < clean.length - 1; i++) {
    for (let len = 2; len <= Math.min(4, clean.length - i); len++) {
      tokens.add(clean.slice(i, i + len));
    }
  }
  return tokens;
}

// ============ Jaccard 相似度 ============

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ============ 分类 ============

function classify(title: string): string {
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return cat;
    }
  }
  return "社会";
}

// ============ 热度归一化（按平台） ============

function normalizeByPlatform(items: HotspotItem[]): void {
  const groups: Record<string, HotspotItem[]> = {};
  for (const item of items) {
    if (!groups[item.platform]) groups[item.platform] = [];
    groups[item.platform].push(item);
  }

  for (const [platform, group] of Object.entries(groups)) {
    // 🟡 修复：空数组保护，避免 Math.min/max 返回 Infinity
    if (group.length === 0) continue;
    const heats = group.map((g) => g.originalHeat);
    const minH = Math.min(...heats);
    const maxH = Math.max(...heats);
    // 🟡 修复：非有限值保护
    if (!isFinite(minH) || !isFinite(maxH)) continue;
    for (const item of group) {
      item.originalHeat =
        maxH === minH
          ? 50
          : ((item.originalHeat - minH) / (maxH - minH)) * 100;
    }
  }
}

// ============ 去重主逻辑 ============

export function deduplicate(
  hotspots: HotspotItem[],
  region: string
): DedupResult[] {
  if (!hotspots.length) return [];

  // 归一化热度
  normalizeByPlatform(hotspots);

  // 分词
  const tokenized = hotspots.map((h) => ({
    item: h,
    tokens: simpleTokenize(h.title),
  }));

  // 聚类
  const used = new Set<number>();
  const clusters: HotspotItem[][] = [];

  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(i)) continue;
    const cluster = [tokenized[i].item];
    used.add(i);

    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(j)) continue;
      const sim = jaccardSimilarity(
        tokenized[i].tokens,
        tokenized[j].tokens
      );
      if (sim >= DEDUP_THRESHOLD) {
        cluster.push(tokenized[j].item);
        used.add(j);
      }
    }

    clusters.push(cluster);
  }

  // 生成结果
  const results: DedupResult[] = [];
  for (const cluster of clusters) {
    cluster.sort((a, b) => b.originalHeat - a.originalHeat);
    const primary = cluster[0];
    const secondary = cluster[1];

    results.push({
      // 🟢 改进：使用 crypto.randomUUID() 替代 Date.now + Math.random
      id: crypto.randomUUID(),
      title: primary.title,
      subtitle: secondary?.title !== primary.title ? (secondary?.title || "") : "",
      unifiedHeat: Math.round(primary.originalHeat * 10) / 10,
      category: classify(primary.title),
      trend: "stable",
      platform: primary.platform,
      url: primary.url,
    });
  }

  results.sort((a, b) => b.unifiedHeat - a.unifiedHeat);
  return results;
}
