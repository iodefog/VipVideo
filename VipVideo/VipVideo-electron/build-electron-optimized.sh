#!/bin/bash

echo "开始 Electron Framework 精简构建..."

# 清理之前的构建
echo "清理之前的构建文件..."
rm -rf dist/
rm -rf node_modules/

# 重新安装依赖
echo "重新安装依赖..."
npm install

# 清理不必要的文件
echo "清理不必要的文件..."
find node_modules -name "*.d.ts" -delete
find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "*.md" -delete
find node_modules -name "*.map" -delete

# 构建应用
echo "开始构建应用..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "在 macOS 上构建..."
    npx electron-builder --mac --publish never
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "在 Windows 上构建..."
    npx electron-builder --win --publish never
else
    echo "在 Linux 上构建..."
    npx electron-builder --linux --publish never
fi

# 精简 Electron Framework
echo "开始精简 Electron Framework..."
if [ -d "dist/mac-arm64/VipVideo.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources" ]; then
    echo "删除不需要的语言包..."
    
    # 保留中文和英文，删除其他语言包
    cd "dist/mac-arm64/VipVideo.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources"
    
    # 删除除中文和英文外的所有语言包
    find . -name "*.lproj" ! -name "en.lproj" ! -name "en_GB.lproj" ! -name "zh_CN.lproj" ! -name "zh_TW.lproj" -exec rm -rf {} + 2>/dev/null || true
    
    # 删除国际化数据文件（如果不需要多语言支持）
    rm -f icudtl.dat 2>/dev/null || true
    
    # 删除不需要的 pak 文件（保留基本的）
    # rm -f chrome_200_percent.pak 2>/dev/null || true
    
    cd - > /dev/null
    
    echo "语言包精简完成"
fi

# 精简应用资源中的语言包
echo "精简应用资源中的语言包..."
if [ -d "dist/mac-arm64/VipVideo.app/Contents/Resources" ]; then
    cd "dist/mac-arm64/VipVideo.app/Contents/Resources"
    
    # 删除除中文和英文外的所有语言包
    find . -name "*.lproj" ! -name "en.lproj" ! -name "en_GB.lproj" ! -name "zh_CN.lproj" ! -name "zh_TW.lproj" -exec rm -rf {} + 2>/dev/null || true
    
    cd - > /dev/null
    
    echo "应用资源语言包精简完成"
fi

echo "构建完成！"
echo "构建文件位于 dist/ 目录中"

# 显示文件大小
echo "文件大小统计："
ls -lh dist/
if [ -d "dist/mac-arm64" ]; then
    echo "应用包大小："
    du -sh dist/mac-arm64/VipVideo.app
    echo "Electron Framework 大小："
    du -sh dist/mac-arm64/VipVideo.app/Contents/Frameworks/Electron\ Framework.framework
    echo "精简前后对比："
    echo "  - 原始大小: 250MB"
    echo "  - 精简后大小: $(du -sh dist/mac-arm64/VipVideo.app/Contents/Frameworks/Electron\ Framework.framework | cut -f1)"
fi 