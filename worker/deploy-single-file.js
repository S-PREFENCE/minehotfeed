// ============================================================
// HotFeed Worker v2 — 修复版
// 粘贴到 Cloudflare Dashboard → Workers → hotfeed-backend → 编辑代码
// ============================================================

const UAPIS_BASE = "https://uapis.cn/api/v1/misc/hotboard";

const DOMESTIC_PLATFORMS = {
  weibo: "微博", douyin: "抖音", baidu: "百度", zhihu: "知乎",
  toutiao: "头条", bilibili: "B站", kuaishou: "快手", xiaohongshu: "小红书",
  "tencent-news": "腾讯新闻", "netease-news": "网易新闻", hupu: "虎扑",
};

const RSS_FEEDS = {
  people: { name: "人民日报", url: "http://www.people.com.cn/rss/politics.xml", region: "domestic" },
  google_news: { name: "Google News", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", region: "international" },
  bbc: { name: "BBC", url: "https://feeds.bbci.co.uk/news/rss.xml", region: "international" },
  cnn: { name: "CNN", url: "https://rss.cnn.com/rss/edition.rss", region: "international" },
};

const REDDIT_URL = "https://www.reddit.com/r/all/hot.json";

const CATEGORY_KEYWORDS = {
  科技: ["科技","AI","人工智能","芯片","手机","苹果","华为","特斯拉","SpaceX","Google","Apple","Microsoft","5G","机器人","大模型","ChatGPT","GPT","算法","数据","编程","软件","硬件","互联网","电商"],
  娱乐: ["娱乐","电影","音乐","明星","综艺","电视剧","演出","演唱会","艺","歌","剧","MV","网红","直播","短视频"],
  财经: ["财经","股票","基金","A股","美股","港股","比特币","加密货币","金融","投资","经济","GDP","通胀","利率","央行","银行","保险","房地产","房价","汇率","贸易"],
  体育: ["体育","足球","篮球","NBA","世界杯","奥运会","欧冠","英超","中超","C罗","梅西","詹姆斯","库里","网球","F1","马拉松","电竞","比赛","决赛","联赛"],
  社会: ["社会","政策","法律","民生","教育","医疗","环境","交通","天气","地震","事故","安全","犯罪","法院","政府","改革"],
};

const DEDUP_THRESHOLD = 0.65;
const CONCURRENCY_LIMIT = 3;

// ============ fetcher ============
function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = 25000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function parseHeat(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;
  const s = raw.replace(/[,，]/g, "").trim();
  if (/万/.test(s)) { const num = parseFloat(s.replace(/[^0-9.]/g, "")); return isNaN(num) ? 0 : num * 10000; }
  if (/亿/.test(s)) { const num = parseFloat(s.replace(/[^0-9.]/g, "")); return isNaN(num) ? 0 : num * 100000000; }
  const num = parseFloat(s.replace(/[^\d.]/g, ""));
  return isNaN(num) ? 0 : num;
}

// 国内平台：直接 fetch UAPI（加 UA 头）
async function fetchDomestic(platformKey) {
  const name = DOMESTIC_PLATFORMS[platformKey] || platformKey;
  const url = `${UAPIS_BASE}?type=${platformKey}`;
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 25000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HotFeed/1.0)" },
    });
    if (!res.ok) { console.error(`[${name}] HTTP ${res.status}`); return []; }
    const data = await res.json();
    const items = data.list || data.data?.list || [];
    if (!Array.isArray(items)) { console.error(`[${name}] items not array:`, typeof items); return []; }
    return items
      .filter((item) => typeof item.title === "string" && item.title.trim())
      .map((item, idx) => ({
        platform: name, region: "domestic",
        title: String(item.title).trim(),
        originalHeat: parseHeat(item.heat ?? item.hot_value ?? 0),
        rank: Number(item.rank ?? item.index ?? idx),
        url: String(item.url ?? ""),
      }));
  } catch (e) {
    console.error(`[抓取失败] ${name}:`, e.message || e);
    return [];
  }
}

// RSS: 用 rss2json 代理
async function fetchRSS(key) {
  const feed = RSS_FEEDS[key];
  if (!feed) return [];
  const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
  try {
    const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 25000 });
    if (!res.ok) { console.error(`[RSS ${feed.name}] HTTP ${res.status}`); return []; }
    const data = await res.json();
    if (data.status !== "ok" || !data.items?.length) { console.error(`[RSS ${feed.name}] no items`); return []; }
    return data.items
      .filter((item) => item.title?.trim())
      .map((item, idx) => ({
        platform: feed.name, region: feed.region,
        title: item.title.trim(),
        originalHeat: Math.max(1, 100 - idx), rank: idx + 1,
        url: item.link || "",
      }));
  } catch (e) {
    console.error(`[RSS失败] ${feed.name}:`, e.message || e);
    return [];
  }
}

// Reddit JSON
async function fetchReddit() {
  try {
    const res = await fetchWithTimeout(REDDIT_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HotFeed/1.0)" },
      timeoutMs: 25000,
    });
    if (!res.ok) { console.error(`[Reddit] HTTP ${res.status}`); return []; }
    const data = await res.json();
    const posts = data.data?.children || [];
    return posts
      .filter((p) => p.data?.title?.trim())
      .map((p, idx) => ({
        platform: "Reddit", region: "international",
        title: p.data.title.trim(),
        originalHeat: (p.data.score || 0) + (p.data.num_comments || 0) * 2,
        rank: idx + 1,
        url: `https://www.reddit.com${p.data.permalink || ""}`,
      }));
  } catch (e) {
    console.error("[Reddit失败]", e.message || e);
    return [];
  }
}

async function fetchAll() {
  const domestic = [], international = [], failed = [];
  const domesticKeys = Object.keys(DOMESTIC_PLATFORMS);

  // 国内平台逐个串行抓取（避免并发被限流）
  for (const key of domesticKeys) {
    const results = await fetchDomestic(key);
    if (results.length > 0) {
      domestic.push(...results);
    } else {
      failed.push(DOMESTIC_PLATFORMS[key]);
    }
  }

  // 人民日报 RSS
  const people = await fetchRSS("people");
  if (people.length > 0) domestic.push(...people);
  else failed.push("人民日报");

  // 国际源全部并发
  const intlKeys = Object.keys(RSS_FEEDS).filter((k) => k !== "people");
  const intlTasks = [...intlKeys.map((key) => fetchRSS(key)), fetchReddit()];
  const intlNames = [...intlKeys.map((key) => RSS_FEEDS[key].name), "Reddit"];

  const intlResults = await Promise.allSettled(intlTasks);
  intlResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length > 0) international.push(...r.value);
    else failed.push(intlNames[i]);
  });

  return { domestic, international, failed };
}

// ============ dedup ============
function simpleTokenize(text) {
  const tokens = new Set();
  const clean = text.replace(/[^\u4e00-\u9fa5\w]/g, " ");
  for (let i = 0; i < clean.length - 1; i++) {
    for (let len = 2; len <= Math.min(4, clean.length - i); len++) {
      tokens.add(clean.slice(i, i + len));
    }
  }
  return tokens;
}

function jaccardSimilarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) { if (b.has(t)) intersection++; }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function classify(title) {
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return cat;
    }
  }
  return "社会";
}

function normalizeByPlatform(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.platform]) groups[item.platform] = [];
    groups[item.platform].push(item);
  }
  for (const [platform, group] of Object.entries(groups)) {
    if (group.length === 0) continue;
    const heats = group.map((g) => g.originalHeat);
    const minH = Math.min(...heats);
    const maxH = Math.max(...heats);
    if (!isFinite(minH) || !isFinite(maxH)) continue;
    for (const item of group) {
      item.originalHeat = maxH === minH ? 50 : ((item.originalHeat - minH) / (maxH - minH)) * 100;
    }
  }
}

function deduplicate(hotspots, region) {
  if (!hotspots.length) return [];
  normalizeByPlatform(hotspots);
  const tokenized = hotspots.map((h) => ({ item: h, tokens: simpleTokenize(h.title) }));
  const used = new Set(), clusters = [];

  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(i)) continue;
    const cluster = [tokenized[i].item];
    used.add(i);
    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(j)) continue;
      if (jaccardSimilarity(tokenized[i].tokens, tokenized[j].tokens) >= DEDUP_THRESHOLD) {
        cluster.push(tokenized[j].item);
        used.add(j);
      }
    }
    clusters.push(cluster);
  }

  const results = [];
  for (const cluster of clusters) {
    cluster.sort((a, b) => b.originalHeat - a.originalHeat);
    const primary = cluster[0], secondary = cluster[1];
    results.push({
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

// ============ database ============
async function initDB(db) {
  const SCHEMA_SQL = [
    "CREATE TABLE IF NOT EXISTS dedup_hotspots (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT DEFAULT '', unified_heat REAL DEFAULT 0, category TEXT DEFAULT '社会', trend TEXT DEFAULT 'stable', platform TEXT DEFAULT '', url TEXT DEFAULT '', region TEXT NOT NULL DEFAULT 'domestic', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
    "CREATE INDEX IF NOT EXISTS idx_dedup_region ON dedup_hotspots(region)",
    "CREATE INDEX IF NOT EXISTS idx_dedup_category ON dedup_hotspots(category)",
    "CREATE INDEX IF NOT EXISTS idx_dedup_updated ON dedup_hotspots(updated_at)",
    "CREATE TABLE IF NOT EXISTS history_hotspots (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, rank INTEGER NOT NULL, title TEXT NOT NULL, subtitle TEXT DEFAULT '', unified_heat REAL DEFAULT 0, category TEXT DEFAULT '社会', platform TEXT DEFAULT '', url TEXT DEFAULT '', region TEXT NOT NULL DEFAULT 'domestic', created_at TEXT DEFAULT (datetime('now')))",
    "CREATE INDEX IF NOT EXISTS idx_history_date ON history_hotspots(date)",
    "CREATE TABLE IF NOT EXISTS fetch_status (key TEXT PRIMARY KEY, value TEXT)",
  ];
  for (const sql of SCHEMA_SQL) {
    await db.prepare(sql).run();
  }
}

async function saveDedup(db, results, region) {
  await db.prepare("DELETE FROM dedup_hotspots WHERE region = ?").bind(region).run();
  if (!results.length) return;
  const stmt = db.prepare(
    "INSERT INTO dedup_hotspots (id, title, subtitle, unified_heat, category, trend, platform, url, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  await db.batch(results.map((r) => stmt.bind(r.id, r.title, r.subtitle, r.unifiedHeat, r.category, r.trend, r.platform, r.url, region)));
}

async function queryHotspots(db, options = {}) {
  const limit = options.limit || 50;
  const domestic = [], international = [];

  const buildWhere = (region) => {
    const conds = ["region = ?"];
    const params = [region];
    if (options.category) { conds.push("category = ?"); params.push(options.category); }
    if (options.keyword) { conds.push("title LIKE ?"); params.push(`%${options.keyword}%`); }
    return { where: conds.join(" AND "), params };
  };

  if (!options.region || options.region === "all" || options.region === "domestic") {
    const w = buildWhere("domestic");
    const rows = await db.prepare(`SELECT * FROM dedup_hotspots WHERE ${w.where} ORDER BY unified_heat DESC LIMIT ?`).bind(...w.params, limit).all();
    domestic.push(...(rows.results || []));
  }
  if (!options.region || options.region === "all" || options.region === "international") {
    const w = buildWhere("international");
    const rows = await db.prepare(`SELECT * FROM dedup_hotspots WHERE ${w.where} ORDER BY unified_heat DESC LIMIT ?`).bind(...w.params, limit).all();
    international.push(...(rows.results || []));
  }
  return { domestic, international };
}

async function saveHistory(db, domesticResults, internationalResults) {
  const today = new Date().toISOString().slice(0, 10);
  await db.prepare("DELETE FROM history_hotspots WHERE date = ?").bind(today).run();

  const saveList = async (list, region) => {
    const top15 = list.slice(0, 15);
    if (!top15.length) return;
    const stmt = db.prepare(
      "INSERT INTO history_hotspots (date, rank, title, subtitle, unified_heat, category, platform, url, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    await db.batch(top15.map((r, i) => stmt.bind(today, i + 1, r.title, r.subtitle, r.unifiedHeat, r.category, r.platform, r.url, region)));
  };
  await saveList(domesticResults, "domestic");
  await saveList(internationalResults, "international");
}

async function queryHistory(db, days = 3, regionFilter = "all") {
  const rows = await db.prepare("SELECT * FROM history_hotspots WHERE date >= date('now', ?) ORDER BY date DESC, rank ASC").bind(`-${days} days`).all();
  const datesSet = new Set();
  const domestic = {}, international = {};
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
  return { dates: [...datesSet].sort().reverse(), domestic, international };
}

async function getStatus(db) {
  const row = await db.prepare("SELECT * FROM fetch_status WHERE key = 'last_refresh'").first();
  const failedRow = await db.prepare("SELECT * FROM fetch_status WHERE key = 'failed_platforms'").first();
  return {
    last_refresh: row?.value || "",
    failed_platforms: failedRow?.value ? JSON.parse(failedRow.value) : [],
  };
}

async function updateStatus(db, failed) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO fetch_status (key, value) VALUES ('last_refresh', ?)").bind(now),
    db.prepare("INSERT OR REPLACE INTO fetch_status (key, value) VALUES ('failed_platforms', ?)").bind(JSON.stringify(failed)),
  ]);
}

// ============ 主逻辑 ============
async function handleCron(env) {
  console.log("[Cron] 开始抓取...");
  try {
    await initDB(env.DB);
    const { domestic, international, failed } = await fetchAll();
    console.log(`[Cron] 国内 ${domestic.length} 条, 国际 ${international.length} 条, 失败: ${failed.join(",")}`);

    const domesticDedup = deduplicate(domestic, "domestic");
    const intlDedup = deduplicate(international, "international");

    await saveDedup(env.DB, domesticDedup.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle, unifiedHeat: r.unifiedHeat, category: r.category, trend: r.trend, platform: r.platform, url: r.url })), "domestic");
    await saveDedup(env.DB, intlDedup.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle, unifiedHeat: r.unifiedHeat, category: r.category, trend: r.trend, platform: r.platform, url: r.url })), "international");

    const domRows = (await queryHotspots(env.DB, { limit: 15, region: "domestic" })).domestic;
    const intlRows = (await queryHotspots(env.DB, { limit: 15, region: "international" })).international;
    await saveHistory(env.DB, domRows, intlRows);
    await updateStatus(env.DB, failed);

    return new Response(JSON.stringify({ ok: true, domestic: domesticDedup.length, international: intlDedup.length, failed }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[Cron] 错误:", e.message || e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export default {
  async scheduled(_event, env) { await handleCron(env); },
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const path = url.pathname;
    try {
      await initDB(env.DB);

      if (path === "/api/v1/health") {
        return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (path === "/api/v1/hotspots") {
        const region = url.searchParams.get("region") || "all";
        const category = url.searchParams.get("category") || undefined;
        const keyword = url.searchParams.get("keyword") || undefined;
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
        const { domestic, international } = await queryHotspots(env.DB, { region, category, keyword, limit });
        const status = await getStatus(env.DB);
        return new Response(JSON.stringify({
          code: 0, data: {
            domestic, international,
            meta: {
              total_domestic: domestic.length, total_international: international.length,
              last_refresh: status.last_refresh || "",
              failed_platforms: status.failed_platforms || [],
            },
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (path === "/api/v1/history") {
        const days = Math.min(parseInt(url.searchParams.get("days") || "3"), 7);
        const region = url.searchParams.get("region") || "all";
        const result = await queryHistory(env.DB, days, region);
        return new Response(JSON.stringify({ code: 0, data: result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 🔥 支持 GET 和 POST，方便浏览器直接访问触发
      if (path === "/api/v1/refresh") {
        const result = await handleCron(env);
        // 如果是 POST 返回 JSON，GET 也返回 JSON
        const body = await result.text();
        return new Response(body, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ code: 404, error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
    } catch (e) {
      console.error("[API Error]", e.message || e);
      return new Response(JSON.stringify({ code: 500, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
  },
};
