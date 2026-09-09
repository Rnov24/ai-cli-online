#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3001}"

echo "================================"
echo "  AGY Online (Antigravity CLI) 启动脚本"
echo "================================"

# 1. 清理占用端口的旧进程
if fuser "$PORT/tcp" >/dev/null 2>&1; then
  echo "[清理] 端口 $PORT 被占用，正在终止旧进程..."
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
  sleep 1
  # 如果 SIGTERM 没杀掉，强制 kill
  if fuser "$PORT/tcp" >/dev/null 2>&1; then
    echo "[清理] 旧进程未响应，强制终止..."
    fuser -k -9 "$PORT/tcp" >/dev/null 2>&1 || true
    sleep 1
  fi
  echo "[清理] 旧进程已终止"
else
  echo "[清理] 端口 $PORT 空闲，无需清理"
fi

# 2. 清理残留的旧进程（仅限本项目）
pkill -f "agy-online" 2>/dev/null || true
pkill -f "ai-cli-online" 2>/dev/null || true

# 3. 检查或构建 Go 二进制
cd "$PROJECT_DIR"
if [[ ! -f "bin/agy-online" ]]; then
  echo "[构建] 首次运行，编译 Web UI 与 Go 单二进制..."
  npm run build --workspace=web
  go build -o bin/agy-online ./cmd/agy-online
  echo "[构建] 完成"
fi

# 4. 启动服务
echo "[启动] 启动 AGY Online (端口: $PORT)..."
exec "$PROJECT_DIR/bin/agy-online" start -p "$PORT"
