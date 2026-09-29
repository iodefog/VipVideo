#!/bin/bash
# VipVideo macOS 打包脚本（双击运行）
# 目标：Intel 旧款 (x64) + Apple 芯片 新款 (arm64)

cd "$(dirname "$0")" || exit 1

echo "=========================================="
echo " VipVideo macOS 打包"
echo " 架构: x64 (Intel 旧款) + arm64 (Apple 芯片 新款)"
echo "=========================================="

# 环境检查
if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未找到 node，请先安装 Node.js: https://nodejs.org"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
fi
if ! command -v yarn >/dev/null 2>&1; then
  echo "[错误] 未找到 yarn，请先安装: npm install -g yarn"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
fi

echo "node: $(node -v)   yarn: $(yarn -v)"

# 依赖检查（缺失才装，避免每次全量安装）
if [ ! -d "node_modules/electron" ] || [ ! -d "node_modules/electron-builder" ]; then
  echo "安装依赖..."
  yarn install || { echo "[错误] 依赖安装失败"; read -n 1 -s -r -p "按任意键关闭..."; exit 1; }
fi

# 清理旧的 mac 产物（保留其它平台产物）
rm -rf dist/mac dist/mac-arm64 dist/mac-universal
rm -f dist/*-mac.zip dist/*-mac.zip.blockmap

echo ""
echo "开始打包 x64 + arm64（首次打包会下载 Electron，约 130MB/架构，请耐心等待）..."
echo ""

if npx electron-builder --mac --x64 --arm64 --publish never; then
  echo ""
  echo "[完成] x64 + arm64 均已打包"
else
  echo ""
  echo "[警告] 双架构打包失败，回退为仅打包本机架构"
  if [ "$(uname -m)" = "arm64" ]; then
    npx electron-builder --mac --arm64 --publish never || {
      echo "[错误] 打包失败"; read -n 1 -s -r -p "按任意键关闭..."; exit 1; }
  else
    npx electron-builder --mac --x64 --publish never || {
      echo "[错误] 打包失败"; read -n 1 -s -r -p "按任意键关闭..."; exit 1; }
  fi
fi

echo ""
echo "产物列表:"
ls -lh dist/*.zip 2>/dev/null || ls -lh dist

echo ""
echo "已打开 dist 目录"
open dist

read -n 1 -s -r -p "按任意键关闭..."
echo ""
