// HotFeed — Worker 入口（API + Cron）
// 部署到 Cloudflare Workers / Pages Functions

import { fetchAll } from "./fetcher";
import { deduplicate } from "./dedup";
import {
  initDB,
  saveDedup,
  saveHistory,
  queryHotspots,
  queryHistory,
  getStatus,
  updateStatus,
} from "./database";
import type { Env, HistoryRow } from "./database";

// ============ Cron 定时任务（每10分钟） ============

async function handleCron(env: Env): Promise<Response> {
  console.log("[Cron] 开始定时抓取...");

  try {
    // 确保数据库已初始化
    await initDB(env.DB);

    // 抓取数据
    const { domestic, international, failed } = await fetchAll();
    console.log(`[Cron] 国内 ${domestic.length} 条，国际 ${international.length} 条`);

    // 去重
    const domesticDedup = deduplicate(domestic, "domestic");
    const intlDedup = deduplicate(international, "international");
    console.log(`[Cron] 去重后: 国内 ${domesticDedup.length} 条, 国际 ${intlDedup.length} 条`);

    // 存入 D1
    await saveDedup(
      env.DB,
      domesticDedup.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        unifiedHeat: r.unifiedHeat,
        category: r.category,
        trend: r.trend,
        platform: r.platform,
        url: r.url,
      })),
      "domestic"
    );
    await saveDedup(
      env.DB,
      intlDedup.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        unifiedHeat: r.unifiedHeat,
        category: r.category,
        trend: r.trend,
        platform: r.platform,
        url: r.url,
      })),
      "international"
    );

    // 保存历史 Top15
    const domRows = (await queryHotspots(env.DB, { limit: 15, region: "domestic" })).domestic;
    const intlRows = (await queryHotspots(env.DB, { limit: 15, region: "international" })).international;
    await saveHistory(env.DB, domRows, intlRows);

    // 更新状态
    await updateStatus(env.DB, failed);

    return new Response(
      JSON.stringify({
        ok: true,
        domestic: domesticDedup.length,
        international: intlDedup.length,
        failed,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[Cron] 执行失败:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ============ HTTP API 路由 ============

export default {
  // Cron Trigger
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await handleCron(env);
  },

  // HTTP Request Handler
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API 路由前缀
    const path = url.pathname;

    try {
      // 确保 DB 初始化
      await initDB(env.DB);

      // GET /api/v1/health — 健康检查
      if (path === "/api/v1/health") {
        return new Response(
          JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // GET /api/v1/hotspots — 获取热点数据
      if (path === "/api/v1/hotspots") {
        const region = url.searchParams.get("region") || "all";
        const category = url.searchParams.get("category") || undefined;
        const keyword = url.searchParams.get("keyword") || undefined;
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

        const { domestic, international } = await queryHotspots(env.DB, {
          region, category, keyword, limit,
        });

        const status = await getStatus(env.DB);

        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              domestic,
              international,
              meta: {
                total_domestic: domestic.length,
                total_international: international.length,
                last_refresh: status.last_refresh || "",
                failed_platforms: status.failed_platforms || [],
              },
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // GET /api/v1/history — 历史热搜
      if (path === "/api/v1/history") {
        const days = Math.min(parseInt(url.searchParams.get("days") || "3"), 7);
        const region = url.searchParams.get("region") || "all";

        const result = await queryHistory(env.DB, days, region);
        return new Response(
          JSON.stringify({ code: 0, data: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // POST /api/v1/refresh — 手动触发抓取（用于首次或紧急刷新）
      if (path === "/api/v1/refresh" && request.method === "POST") {
        return handleCron(env);
      }

      // 404 — 未匹配的路由
      return new Response(JSON.stringify({ code: 404, error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    } catch (e) {
      console.error("[API Error]", e);
      return new Response(
        JSON.stringify({ code: 500, error: String(e) }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  },
};
