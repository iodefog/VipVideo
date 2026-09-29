@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo  VipVideo Windows 打包（Windows 本机运行）
echo  默认架构: x64 (64位)
echo  格式: NSIS 安装包 + Portable 便携版
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node，请先安装 Node.js: https://nodejs.org
  pause
  exit /b 1
)

where yarn >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 yarn，请先安装: npm install -g yarn
  pause
  exit /b 1
)

REM 国内网络加速：从 npmmirror 下载 Electron，避免 github 超时
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set CSC_IDENTITY_AUTO_DISCOVERY=false

if not exist "node_modules\electron-builder" (
  echo 安装依赖...
  call yarn install
  if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
  )
)

if exist "dist\win-unpacked" rmdir /s /q "dist\win-unpacked"
if exist "dist\win-ia32-unpacked" rmdir /s /q "dist\win-ia32-unpacked"
del /q "dist\*.exe" 2>nul
del /q "dist\*.exe.blockmap" 2>nul

echo.
if "%BUILD_IA32%"=="1" (
  echo 开始打包 x64 + ia32（32位）...
  echo 注意: Electron 44 已不再提供 win32-ia32 二进制，32 位打包会失败
  call npx electron-builder --win --x64 --ia32 --publish never
  if errorlevel 1 (
    echo.
    echo [警告] 32 位打包失败，回退为仅打包 64 位
    call npx electron-builder --win --x64 --publish never
  )
) else (
  echo 开始打包 x64（如需尝试 32 位，先执行 set BUILD_IA32=1）...
  call npx electron-builder --win --x64 --publish never
)

if errorlevel 1 (
  echo.
  echo [错误] 打包失败
  pause
  exit /b 1
)

echo.
echo 产物列表:
dir /b dist\*.exe 2>nul
echo.
echo 已打开 dist 目录
start "" dist

pause
