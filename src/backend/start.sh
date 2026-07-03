#!/bin/bash
# HotFeed 聚合热点 - 启动脚本

set -e

# 进入脚本所在目录
cd "$(dirname "$0")"

# 创建数据目录
mkdir -p data

# 安装依赖
echo "正在安装依赖..."
pip install -r requirements.txt

# 启动服务
echo "正在启动 HotFeed 后端服务..."
python -m uvicorn main:app --host 0.0.0.0 --port 8001
