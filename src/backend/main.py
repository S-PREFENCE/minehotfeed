"""
HotFeed 聚合热点 - 主入口
FastAPI 应用启动、路由注册、生命周期管理
"""

import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db
from scheduler import start_scheduler, stop_scheduler
from api.hotspots import router as hotspots_router

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)

# 前端静态文件目录
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI 生命周期管理
    启动时：初始化数据库、启动调度器
    关闭时：停止调度器
    """
    # 启动
    logger.info("正在初始化数据库...")
    init_db()
    logger.info("数据库初始化完成")

    logger.info("正在启动调度器...")
    await start_scheduler()
    logger.info("调度器启动完成")

    yield

    # 关闭
    logger.info("正在停止调度器...")
    stop_scheduler()
    logger.info("HotFeed 后端服务已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="HotFeed 聚合热点 API",
    description="全球热点聚合平台后端服务",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 中间件（开发阶段允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由（必须在静态文件之前）
app.include_router(hotspots_router)

# 挂载前端静态资源
if FRONTEND_DIST.exists():
    # 先挂载 assets 目录
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # SPA fallback: 非 /api 路径返回 index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA fallback — 所有非 API 路径返回前端入口"""
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file() and full_path:
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")

    logger.info(f"前端静态文件已挂载: {FRONTEND_DIST}")
else:
    logger.warning(f"前端静态文件目录不存在: {FRONTEND_DIST}")


@app.get("/api/health")
async def api_health():
    """健康检查"""
    return {"status": "ok", "version": "1.0.0"}
