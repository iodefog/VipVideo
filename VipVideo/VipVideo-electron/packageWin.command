#!/bin/bash
# VipVideo Windows 打包脚本（在 macOS 上双击运行，交叉打包 Windows 版）
# 说明：electron-builder 支持在 macOS 上直接打 Windows 包，不需要 Windows 机器，
#       唯一额外依赖是 Wine（NSIS / Portable 封装阶段要用它）。
#       若要在 Windows 本机打包，请用 packageWin.bat。
#
# 产出两个包（分目录存放，互不覆盖）：
#   dist/win-x64/    → 64 位：Electron ${X64_ELECTRON_VERSION}（项目默认版本）
#   dist/win-ia32/   → 32 位：Electron ${IA32_ELECTRON_VERSION}（44 起官方移除 win32-ia32，只能用 43.x）
# 每个目录里含：NSIS 安装包 + Portable 便携版

cd "$(dirname "$0")" || exit 1

# 国内网络加速：从 npmmirror 拉 Electron，避免 github 连接超时
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
# Windows 不做代码签名
export CSC_IDENTITY_AUTO_DISCOVERY=false

# Electron 版本：64 位用项目默认（44.4.5）；32 位用 43.7.5（最后一个带 win32-ia32 的版本）
IA32_ELECTRON_VERSION="${IA32_ELECTRON_VERSION:-43.7.5}"

echo "=========================================="
echo " VipVideo Windows 打包（macOS 交叉打包）"
echo " 输出 2 个包:"
echo "   [64位] x64   → Electron 默认版本  → dist/win-x64/"
echo "   [32位] ia32  → Electron $IA32_ELECTRON_VERSION  → dist/win-ia32/"
echo " 格式: NSIS 安装包 + Portable 便携版"
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

if ! command -v wine >/dev/null 2>&1 && ! command -v wine64 >/dev/null 2>&1; then
  echo "[警告] 未检测到 Wine，NSIS / Portable 封装阶段会失败。"
  echo "       请先安装： brew install --cask wine-stable"
  echo ""
fi

echo "node: $(node -v)   yarn: $(yarn -v)   Wine: $(command -v wine || command -v wine64 || echo '未安装')"

# 依赖检查
if [ ! -d "node_modules/electron" ] || [ ! -d "node_modules/electron-builder" ]; then
  echo "安装依赖..."
  yarn install || { echo "[错误] 依赖安装失败"; read -n 1 -s -r -p "按任意键关闭..."; exit 1; }
fi

# 清理旧的 win 产物
rm -rf dist/win-x64 dist/win-ia32 dist/win-unpacked dist/win-ia32-unpacked

echo ""
echo "=========================================="
echo " [1/2] 打包 64 位 (x64)"
echo "=========================================="
if npx electron-builder --win --x64 --publish never; then
  mkdir -p dist/win-x64
  find dist -maxdepth 1 \( -name "*.exe" -o -name "*.exe.blockmap" \) -exec mv {} dist/win-x64/ \; 2>/dev/null
  echo "[完成] 64 位产物已放入 dist/win-x64/"
else
  echo "[错误] 64 位打包失败"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
fi

echo ""
echo "=========================================="
echo " [2/2] 打包 32 位 (ia32)，使用 Electron $IA32_ELECTRON_VERSION"
echo "       （Electron 44 起官方不再发布 win32-ia32 二进制，故 32 位只能用 43.x）"
echo "=========================================="
if npx electron-builder --win --ia32 --config.electronVersion="$IA32_ELECTRON_VERSION" --publish never; then
  mkdir -p dist/win-ia32
  find dist -maxdepth 1 \( -name "*.exe" -o -name "*.exe.blockmap" \) -exec mv {} dist/win-ia32/ \; 2>/dev/null
  echo "[完成] 32 位产物已放入 dist/win-ia32/"
else
  echo "[警告] 32 位打包失败（常见原因：未装 Wine，或镜像上缺少该版本 ia32 包）"
  echo "       64 位产物不受影响，仍在 dist/win-x64/"
fi

echo ""
echo "=========================================="
echo " 产物列表"
echo "=========================================="
echo "[64位] dist/win-x64/:"
ls -lh dist/win-x64/*.exe 2>/dev/null || echo "  （无）"
echo "[32位] dist/win-ia32/:"
ls -lh dist/win-ia32/*.exe 2>/dev/null || echo "  （无）"

echo ""
echo "已打开 dist 目录"
open dist

read -n 1 -s -r -p "按任意键关闭..."
echo ""
