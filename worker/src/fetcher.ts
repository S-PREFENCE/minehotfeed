// HotFeed — 抓取模块
// 支持：UAPIS API（国内） + RSS2JSON（国际） + Reddit JSON

import {
  UAPIS_BASE,
  DOMESTIC_PLATFORMS,
  RSS_FEEDS,
  REDDIT_URL,
} from "./config";

export interface HotspotItem {
  platform: string;
  region: string;
  title: string;
  originalHeat: number;
  rank: number;
  url: string;
}

// ============ 工具函数 ============

// 🔴 修复：Cloudflare Workers 的标准 fetch() 不支持 timeout 选项
// 使用 AbortController + setTimeout 实现超时控制
function fetchWithTimeout(
  url: string | Request,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function parseHeat(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;
  const s = raw.replace(/[,，]/g, "").trim();
  if (/万/.test(s)) {
    const num = parseFloat(s.replace(/万热度|万播放|热度|播放|万/g, ""));
    return isNaN(num) ? 0 : num * 10000;
  }
  if (/亿/.test(s)) {
    const num = parseFloat(s.replace(/亿热度|亿播放|热度|播放|亿/g, ""));
    return isNaN(num) ? 0 : num * 100000000;
  }
  const num = parseFloat(s.replace(/[^\d.]/g, ""));
  return isNaN(num) ? 0 : num;
}

// ============ 国内平台（UAPIS） ============

async function fetchDomestic(
  platformKey: string
): Promise<HotspotItem[]> {
  const name = DOMESTIC_PLATFORMS[platformKey] || platformKey;
  const url = `${UAPIS_BASE}?type=${platformKey}`;

  try {
    // 🔴 修复：使用 fetchWithTimeout 替代不支持的 { timeout }
    const res = await fetchWithTimeout(url, { timeoutMs: 15000 });
    if (!res.ok) return [];
    const data = await res.json();

    // 兼容两种返回格式
    const items =
      data.list ||
      data.data?.list ||
      [];
    if (!Array.isArray(items)) return [];

    // 🟢 改进：添加字段校验确保数据结构正确
    return items
      .filter((item: Record<string, unknown>) =>
        typeof item.title === "string" && item.title.trim()
      )
      .map((item: Record<string, unknown>, idx: number) => ({
        platform: name,
        region: "domestic",
        title: String(item.title).trim(),
        originalHeat: parseHeat(item.heat ?? item.hot_value ?? 0),
        rank: Number(item.rank ?? item.index ?? idx),
        url: String(item.url ?? ""),
      }));
  } catch (e) {
    console.error(`[抓取失败] ${name}:`, e);
    return [];
  }
}

// ============ RSS 平台（通过 rss2json 代理） ============
// Cloudflare Workers 无法直接解析 XML RSS，用免费 rss2json.com 转换

async function fetchRSS(
  key: string
): Promise<HotspotItem[]> {
  const feed = RSS_FEEDS[key];
  if (!feed) return [];

  // 使用 rss2json 免费 API 将 RSS 转 JSON
  const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;

  try {
    // 🔴 修复：使用 fetchWithTimeout
    const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 20000 });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "ok" || !data.items?.length) return [];

    return data.items
      .filter((item: { title?: string }) => item.title?.trim())
      .map(
        (item: { title: string; link?: string }, idx: number): HotspotItem => ({
          platform: feed.name,
          region: feed.region,
          title: item.title.trim(),
          originalHeat: Math.max(1, 100 - idx),
          rank: idx + 1,
          url: item.link || "",
        })
      );
  } catch (e) {
    console.error(`[RSS失败] ${feed.name}:`, e);
    return [];
  }
}

// ============ Reddit JSON ============

async function fetchReddit(): Promise<HotspotItem[]> {
  try {
    // 🔴 修复：使用 fetchWithTimeout
    const res = await fetchWithTimeout(REDDIT_URL, {
      headers: { "User-Agent": "HotFeed/1.0" },
      timeoutMs: 15000,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const posts = data.data?.children || [];

    return posts
      .filter(
        (p: { data?: { title?: string } }) =>
          p.data?.title?.trim()
      )
      .map(
        (
          p: {
            data: {
              title: string;
              score?: number;
              num_comments?: number;
              permalink?: string;
            };
          },
          idx: number
        ): HotspotItem => ({
          platform: "Reddit",
          region: "international",
          title: p.data.title.trim(),
          originalHeat:
            (p.data.score || 0) + (p.data.num_comments || 0) * 2,
          rank: idx + 1,
          url: `https://www.reddit.com${p.data.permalink || ""}`,
        })
      );
  } catch (e) {
    console.error("[Reddit失败]", e);
    return [];
  }
}

// ============ 全量抓取 ============
// 🟡 优化：并发抓取（带信号量控制），减少 Cron 总耗时

const CONCURRENCY_LIMIT = 3; // 同时最多3个请求，避免触发429

export async function fetchAll(): Promise<{
  domestic: HotspotItem[];
  international: HotspotItem[];
  failed: string[];
}> {
  const domestic: HotspotItem[] = [];
  const international: HotspotItem[] = [];
  const failed: string[] = [];

  // ———— 国内平台：分批并发 ———
  const domesticKeys = Object.keys(DOMESTIC_PLATFORMS);

  async function fetchBatch(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(
      keys.map((key) => fetchDomestic(key))
    );
    results.forEach((r, i) => {
      const key = keys[i];
      if (r.status === "fulfilled" && r.value.length > 0) {
        domestic.push(...r.value);
      } else {
        failed.push(DOMESTIC_PLATFORMS[key]);
      }
    });
  }

  for (let i = 0; i < domesticKeys.length; i += CONCURRENCY_LIMIT) {
    const batch = domesticKeys.slice(i, i + CONCURRENCY_LIMIT);
    await fetchBatch(batch);
    // 批次间短暂延迟防限流
    if (i + CONCURRENCY_LIMIT < domesticKeys.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // ———— 人民日报 RSS（国内区域）————
  const people = await fetchRSS("people");
  if (people.length > 0) {
    domestic.push(...people);
  } else {
    failed.push("人民日报");
  }

  // ———— 国际源：RSS + Reddit 全部并发 ———
  const intlTasks: Promise<HotspotItem[]>[] = [
    ...Object.keys(RSS_FEEDS)
      .filter((k) => k !== "people")
      .map((key) => fetchRSS(key)),
    fetchReddit(),
  ];

  const intlNames: string[] = [
    ...Object.keys(RSS_FEEDS)
      .filter((k) => k !== "people")
      .map((key) => RSS_FEEDS[key].name),
    "Reddit",
  ];

  const intlResults = await Promise.allSettled(intlTasks);
  intlResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length > 0) {
      international.push(...r.value);
    } else {
      failed.push(intlNames[i]);
    }
  });

  return { domestic, international, failed };
}
