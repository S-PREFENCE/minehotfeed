#!/bin/bash
# HotFeed Backend — Render 一键部署脚本
set -e

echo "=== 安装依赖 ==="
pip install -r src/backend/requirements.txt

echo "=== 创建数据目录 ==="
mkdir -p src/backend/data

echo "=== 启动服务 ==="
cd src/backend && python -m uvicorn main:app --host 0.0.0.0 --port $PORT
