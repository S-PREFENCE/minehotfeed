// HotFeed Worker v4 — 混合架构
// 接收本地 Python 脚本推送的数据，存入 D1，对外提供 API
// 部署：Cloudflare Dashboard → Workers → 编辑代码 → 粘贴此文件 → 保存并部署

// ============ 配置 ============
const UAPIS_BASE = "https://uapis.cn/api/v1/misc/hotboard";

const DOMESTIC_PLATFORMS = {
  weibo: "微博", douyin: "抖音", baidu: "百度", zhihu: "知乎",
  toutiao: "头条", bilibili: "B站", kuaishou: "快手", xiaohongshu: "小红书",
  "tencent-news": "腾讯新闻", "netease-news": "网易新闻", hupu: "虎扑",
};

const RSS_FEEDS = {
  google_news: { name: "Google News", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", region: "international" },
  bbc: { name: "BBC", url: "https://feeds.bbci.co.uk/news/rss.xml", region: "international" },
  cnn: { name: "CNN", url: "https://rss.cnn.com/rss/edition.rss", region: "international" },
};

const CATEGORY_KEYWORDS = {
  "科技": ["科技","AI","人工智能","芯片","手机","苹果","华为","特斯拉","SpaceX","Google","Apple","Microsoft","5G","机器人","大模型","ChatGPT","GPT","算法","数据","编程","软件","硬件","互联网","电商"],
  "娱乐": ["娱乐","电影","音乐","明星","综艺","电视剧","综艺节目","演出","演唱会","艺","歌","剧","MV","网红","直播","短视频"],
  "财经": ["财经","股票","基金","A股","美股","港股","比特币","加密货币","金融","投资","经济","GDP","通胀","利率","央行","银行","保险","房地产","房价","汇率","贸易"],
  "体育": ["体育","足球","篮球","NBA","世界杯","奥运会","欧冠","英超","中超","C罗","梅西","詹姆斯","库里","网球","F1","马拉松","电竞","比赛","决赛","联赛"],
  "社会": ["社会","政策","法律","民生","教育","医疗","环境","交通","天气","地震","事故","安全","犯罪","法院","政府","改革"],
};

const DEDUP_THRESHOLD = 0.65;

// ============ 工具函数 ============

function nowISO() { return new Date().toISOString(); }

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function classifyCategory(title) {
  const t = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (t.includes(kw.toLowerCase())) return cat;
    }
  }
  return "综合";
}

function parseHeat(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;
  const s = raw.replace(/[,，]/g, "").trim();
  if (/万/.test(s)) { const n = parseFloat(s.replace(/[^\d.]/g, "")); return isNaN(n) ? 0 : n * 10000; }
  if (/亿/.test(s)) { const n = parseFloat(s.replace(/[^\d.]/g, "")); return isNaN(n) ? 0 : n * 100000000; }
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function normalizeHeat(rawHeat, maxHeat, rank) {
  if (rawHeat > 0) return rawHeat;
  return Math.max(1, Math.round((100 - rank) * (maxHeat / 100)));
}

function computeTrend(prevRank, newRank) {
  if (!prevRank || prevRank === 0) return "stable";
  if (newRank < prevRank) return "up";
  if (newRank > prevRank) return "down";
  return "stable";
}

// ============ 文本相似度（Jaccard） ============

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ============ D1 数据库操作 ============

async function initDB(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS hotspots (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    unified_heat REAL DEFAULT 0,
    category TEXT DEFAULT '综合',
    trend TEXT DEFAULT 'stable',
    platform TEXT NOT NULL,
    url TEXT DEFAULT '',
    region TEXT NOT NULL DEFAULT 'domestic',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    region TEXT NOT NULL,
    rank INTEGER NOT NULL,
    title TEXT NOT NULL,
    unified_heat REAL DEFAULT 0,
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_refresh TEXT,
    failed_platforms TEXT DEFAULT '[]',
    total_domestic INTEGER DEFAULT 0,
    total_international INTEGER DEFAULT 0,
    updated_at TEXT
  )`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_hotspots_region ON hotspots(region)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_hotspots_heat ON hotspots(unified_heat DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_hotspots_category ON hotspots(category)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_history_date ON history(date)`).run();
}

async function getPreviousRanks(db) {
  try {
    const { results } = await db.prepare(`SELECT id, ROW_NUMBER() OVER (ORDER BY unified_heat DESC) as rank FROM hotspots WHERE region = 'domestic'`).all();
    const map = {};
    for (const r of results || []) map[r.id] = r.rank;
    return map;
  } catch { return {}; }
}

async function saveHotspots(db, items, region) {
  const prevRanks = await getPreviousRanks(db);
  const maxHeat = Math.max(...items.map(i => i.originalHeat || 0), 1);

  // 先清理旧数据
  await db.prepare(`DELETE FROM hotspots WHERE region = ?`).bind(region).run();

  for (const item of items) {
    const id = item.id || crypto.randomUUID();
    const title = item.title || "";
    const subtitle = item.subtitle || "";
    const rawHeat = item.originalHeat || item.unified_heat || 0;
    const unifiedHeat = normalizeHeat(rawHeat, maxHeat, item.rank || 99);
    const category = item.category || classifyCategory(title);
    const trend = computeTrend(prevRanks[id], item.rank);
    const platform = item.platform || "未知";
    const url = item.url || "";
    const ts = nowISO();

    await db.prepare(
      `INSERT OR REPLACE INTO hotspots (id, title, subtitle, unified_heat, category, trend, platform, url, region, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, title, subtitle, unifiedHeat, category, trend, platform, url, region, ts, ts).run();
  }
}

async function saveHistory(db) {
  const today = new Date().toISOString().slice(0, 10);

  // 国内 Top15
  const { results: dom } = await db.prepare(
    `SELECT title, unified_heat, platform FROM hotspots WHERE region = 'domestic' ORDER BY unified_heat DESC LIMIT 15`
  ).all();

  // 国际 Top15
  const { results: intl } = await db.prepare(
    `SELECT title, unified_heat, platform FROM hotspots WHERE region = 'international' ORDER BY unified_heat DESC LIMIT 15`
  ).all();

  const ts = nowISO();

  for (let i = 0; i < (dom || []).length; i++) {
    await db.prepare(
      `INSERT INTO history (date, region, rank, title, unified_heat, platform, created_at) VALUES (?, 'domestic', ?, ?, ?, ?, ?)`
    ).bind(today, i + 1, dom[i].title, dom[i].unified_heat, dom[i].platform, ts).run();
  }

  for (let i = 0; i < (intl || []).length; i++) {
    await db.prepare(
      `INSERT INTO history (date, region, rank, title, unified_heat, platform, created_at) VALUES (?, 'international', ?, ?, ?, ?, ?)`
    ).bind(today, i + 1, intl[i].title, intl[i].unified_heat, intl[i].platform, ts).run();
  }
}

async function updateStatus(db, failedPlatforms) {
  await db.prepare(
    `INSERT OR REPLACE INTO status (id, last_refresh, failed_platforms, total_domestic, total_international, updated_at)
     VALUES (1, ?, ?, 
       (SELECT COUNT(*) FROM hotspots WHERE region = 'domestic'),
       (SELECT COUNT(*) FROM hotspots WHERE region = 'international'),
       ?)`
  ).bind(nowISO(), JSON.stringify(failedPlatforms), nowISO()).run();
}

async function queryHotspots(db, opts = {}) {
  const { region = "all", category, keyword, limit = 50 } = opts;

  let domestic = [], international = [];

  if (region === "all" || region === "domestic") {
    let sql = `SELECT * FROM hotspots WHERE region = 'domestic'`;
    const params = [];
    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (keyword) { sql += ` AND (title LIKE ? OR subtitle LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ` ORDER BY unified_heat DESC LIMIT ?`; params.push(limit);
    const { results } = await db.prepare(sql).bind(...params).all();
    domestic = results || [];
  }

  if (region === "all" || region === "international") {
    let sql = `SELECT * FROM hotspots WHERE region = 'international'`;
    const params = [];
    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (keyword) { sql += ` AND (title LIKE ? OR subtitle LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ` ORDER BY unified_heat DESC LIMIT ?`; params.push(limit);
    const { results } = await db.prepare(sql).bind(...params).all();
    international = results || [];
  }

  return { domestic, international };
}

async function getStatus(db) {
  try {
    const r = await db.prepare(`SELECT * FROM status WHERE id = 1`).first();
    if (!r) return { last_refresh: "", failed_platforms: "[]" };
    return {
      last_refresh: r.last_refresh || "",
      failed_platforms: JSON.parse(r.failed_platforms || "[]"),
    };
  } catch {
    return { last_refresh: "", failed_platforms: [] };
  }
}

async function queryHistory(db, days, region) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  let sql = `SELECT date, region, rank, title, unified_heat, platform FROM history WHERE date >= ?`;
  const params = [sinceStr];
  if (region !== "all") { sql += ` AND region = ?`; params.push(region); }
  sql += ` ORDER BY date DESC, rank ASC`;

  const { results } = await db.prepare(sql).bind(...params).all();
  const rows = results || [];

  // 按日期分组
  const dates = [...new Set(rows.map(r => r.date))].sort().reverse();
  const result = { dates, domestic: {}, international: {} };

  for (const row of rows) {
    const target = row.region === "domestic" ? result.domestic : result.international;
    if (!target[row.date]) target[row.date] = [];
    target[row.date].push(row);
  }

  return result;
}

// ============ 数据抓取（国内 UAPI + 国际 RSS） ============

function fetchWithTimeout(url, opts = {}) {
  const { timeoutMs = 15000, ...init } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchDomesticPlatform(key) {
  const name = DOMESTIC_PLATFORMS[key] || key;
  const url = `${UAPIS_BASE}?type=${key}`;
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 15000 });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.list || data.data?.list || [];
    if (!Array.isArray(items)) return [];
    return items
      .filter(item => typeof item.title === "string" && item.title.trim())
      .map((item, idx) => ({
        id: crypto.randomUUID(),
        platform: name,
        region: "domestic",
        title: String(item.title).trim(),
        subtitle: "",
        originalHeat: parseHeat(item.heat ?? item.hot_value ?? 0),
        unified_heat: 0,
        category: classifyCategory(String(item.title)),
        trend: "stable",
        rank: Number(item.rank ?? item.index ?? idx + 1),
        url: String(item.url || ""),
      }));
  } catch (e) {
    console.error(`[抓取失败] ${name}:`, e.message || e);
    return [];
  }
}

async function fetchRSS(key) {
  const feed = RSS_FEEDS[key];
  if (!feed) return [];
  const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
  try {
    const res = await fetchWithTimeout(proxyUrl, { timeoutMs: 20000 });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "ok" || !data.items?.length) return [];
    return data.items
      .filter(item => item.title?.trim())
      .map((item, idx) => ({
        id: crypto.randomUUID(),
        platform: feed.name,
        region: feed.region,
        title: item.title.trim(),
        subtitle: "",
        originalHeat: Math.max(1, 100 - idx),
        unified_heat: 0,
        category: classifyCategory(item.title),
        trend: "stable",
        rank: idx + 1,
        url: item.link || "",
      }));
  } catch (e) {
    console.error(`[RSS失败] ${feed.name}:`, e.message || e);
    return [];
  }
}

async function fetchReddit() {
  try {
    const res = await fetchWithTimeout("https://www.reddit.com/r/all/hot.json", {
      headers: { "User-Agent": "HotFeed/1.0" },
      timeoutMs: 15000,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const posts = data.data?.children || [];
    return posts
      .filter(p => p.data?.title?.trim())
      .map((p, idx) => ({
        id: crypto.randomUUID(),
        platform: "Reddit",
        region: "international",
        title: p.data.title.trim(),
        subtitle: "",
        originalHeat: (p.data.score || 0) + (p.data.num_comments || 0) * 2,
        unified_heat: 0,
        category: classifyCategory(p.data.title),
        trend: "stable",
        rank: idx + 1,
        url: `https://www.reddit.com${p.data.permalink || ""}`,
      }));
  } catch (e) {
    console.error("[Reddit失败]", e.message || e);
    return [];
  }
}

async function fetchAll() {
  const domestic = [];
  const international = [];
  const failed = [];

  // 国内平台分批并发
  const domesticKeys = Object.keys(DOMESTIC_PLATFORMS);
  for (let i = 0; i < domesticKeys.length; i += 3) {
    const batch = domesticKeys.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map(k => fetchDomesticPlatform(k)));
    results.forEach((r, j) => {
      const key = batch[j];
      if (r.status === "fulfilled" && r.value.length > 0) {
        domestic.push(...r.value);
      } else {
        failed.push(DOMESTIC_PLATFORMS[key]);
      }
    });
    if (i + 3 < domesticKeys.length) await new Promise(r => setTimeout(r, 300));
  }

  // 国际源并发
  const intlKeys = Object.keys(RSS_FEEDS);
  const intlTasks = [...intlKeys.map(k => fetchRSS(k)), fetchReddit()];
  const intlNames = [...intlKeys.map(k => RSS_FEEDS[k].name), "Reddit"];
  const intlResults = await Promise.allSettled(intlTasks);
  intlResults.forEach((r, j) => {
    if (r.status === "fulfilled" && r.value.length > 0) {
      international.push(...r.value);
    } else {
      failed.push(intlNames[j]);
    }
  });

  return { domestic, international, failed };
}

// ============ 去重 ============

function deduplicate(items, region) {
  if (items.length <= 1) return items;
  const result = [];
  const seen = new Set();

  for (const item of items) {
    let isDup = false;
    for (const existing of result) {
      if (jaccardSimilarity(item.title, existing.title) >= DEDUP_THRESHOLD) {
        isDup = true;
        // 保留热度更高的
        if ((item.originalHeat || 0) > (existing.originalHeat || 0)) {
          Object.assign(existing, item);
        }
        break;
      }
    }
    if (!isDup && !seen.has(item.title)) {
      seen.add(item.title);
      result.push(item);
    }
  }

  return result;
}

// ============ 主入口 ============

export default {
  // Cron 定时任务：Worker 自己尝试抓取（国际源通常可用）+ 接受本地推送
  async scheduled(_event, env) {
    console.log("[Cron] 开始定时抓取...");
    try {
      await initDB(env.DB);

      const { domestic, international, failed } = await fetchAll();
      console.log(`[Cron] 国内 ${domestic.length} 条，国际 ${international.length} 条，失败: ${failed.join(",")}`);

      const domDedup = deduplicate(domestic, "domestic");
      const intlDedup = deduplicate(international, "international");

      if (domDedup.length > 0) await saveHotspots(env.DB, domDedup, "domestic");
      if (intlDedup.length > 0) await saveHotspots(env.DB, intlDedup, "international");

      if (domDedup.length > 0 || intlDedup.length > 0) {
        await saveHistory(env.DB);
        await updateStatus(env.DB, failed);
      }

      console.log(`[Cron] 完成: 国内${domDedup.length}条, 国际${intlDedup.length}条`);
    } catch (e) {
      console.error("[Cron] 失败:", e);
    }
  },

  // HTTP 请求处理
  async fetch(request, env) {
    const url = new URL(request.url);
    const ch = corsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: ch });
    }

    const path = url.pathname;

    try {
      await initDB(env.DB);

      // GET /api/v1/health
      if (path === "/api/v1/health") {
        return new Response(JSON.stringify({
          status: "ok",
          timestamp: nowISO(),
          mode: "hybrid",
        }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      // GET /api/v1/hotspots
      if (path === "/api/v1/hotspots") {
        const region = url.searchParams.get("region") || "all";
        const category = url.searchParams.get("category") || undefined;
        const keyword = url.searchParams.get("keyword") || undefined;
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

        const { domestic, international } = await queryHotspots(env.DB, { region, category, keyword, limit });
        const status = await getStatus(env.DB);

        return new Response(JSON.stringify({
          code: 0,
          data: {
            domestic,
            international,
            meta: {
              total_domestic: domestic.length,
              total_international: international.length,
              last_refresh: status.last_refresh || "",
              failed_platforms: status.failed_platforms || [],
              mode: "hybrid",
            },
          },
        }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      // GET /api/v1/history
      if (path === "/api/v1/history") {
        const days = Math.min(parseInt(url.searchParams.get("days") || "3"), 7);
        const region = url.searchParams.get("region") || "all";
        const result = await queryHistory(env.DB, days, region);
        return new Response(JSON.stringify({ code: 0, data: result }), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      // POST /api/v1/push — 接收本地 Python 脚本推送的数据
      if (path === "/api/v1/push" && request.method === "POST") {
        try {
          const body = await request.json();

          if (body.domestic && Array.isArray(body.domestic)) {
            await saveHotspots(env.DB, body.domestic, "domestic");
          }
          if (body.international && Array.isArray(body.international)) {
            await saveHotspots(env.DB, body.international, "international");
          }

          await saveHistory(env.DB);
          await updateStatus(env.DB, body.failed || []);

          return new Response(JSON.stringify({
            ok: true,
            domestic: body.domestic?.length || 0,
            international: body.international?.length || 0,
            timestamp: nowISO(),
          }), { headers: { ...ch, "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: String(e) }), {
            status: 400,
            headers: { ...ch, "Content-Type": "application/json" },
          });
        }
      }

      // GET /api/v1/refresh — 手动触发抓取（GET + POST 都支持）
      if (path === "/api/v1/refresh" && (request.method === "POST" || request.method === "GET")) {
        const { domestic, international, failed } = await fetchAll();

        const domDedup = deduplicate(domestic, "domestic");
        const intlDedup = deduplicate(international, "international");

        if (domDedup.length > 0) await saveHotspots(env.DB, domDedup, "domestic");
        if (intlDedup.length > 0) await saveHotspots(env.DB, intlDedup, "international");

        if (domDedup.length > 0 || intlDedup.length > 0) {
          await saveHistory(env.DB);
          await updateStatus(env.DB, failed);
        }

        return new Response(JSON.stringify({
          ok: true,
          domestic: domDedup.length,
          international: intlDedup.length,
          failed,
        }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      // 404
      return new Response(JSON.stringify({ code: 404, error: "Not Found" }), {
        status: 404,
        headers: { ...ch, "Content-Type": "application/json" },
      });

    } catch (e) {
      console.error("[API Error]", e);
      return new Response(JSON.stringify({ code: 500, error: String(e) }), {
        status: 500,
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }
  },
};
