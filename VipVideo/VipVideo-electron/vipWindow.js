const { BrowserWindow } = require('electron');
const path = require('path');
const { buildScript } = require('./vipUI');

function injectVipUI(child, vlistArray, canShowVip) {
  child.webContents.executeJavaScript(buildScript(vlistArray, canShowVip)).catch((err) => {
    console.error('Failed to inject VIP UI:', err);
  });
  return child;
}

// UA 跟随真实 Chromium 版本（写死旧版本 + 会被 Sec-CH-UA 戳穿，站点容易判「版本太低」）
const CHROME_VER = (process.versions && process.versions.chrome) || '152.0.0.0';
const UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36`;

function openVipWindow(url, vlistArray, size = { width: 1200, height: 800 }, canShowVip = true) {
  // 统一成数组，后续注入/派生窗口都用它，避免列表丢失
  const list = Array.isArray(vlistArray) ? vlistArray : ((vlistArray && vlistArray.list) || []);
  const child = new BrowserWindow({
    width: size.width,
    height: size.height,
    webPreferences: {
      webviewTag: true,
      autoplayPolicy: 'no-user-gesture-required', // 允许自动播放
      webSecurity: false, // 禁用web安全策略
      nodeIntegration: true, // 启用Node集成
      contextIsolation: false, // 禁用上下文隔离
      preload: path.join(__dirname, 'child_preload.js'),
      // 启用插件支持（有些加密视频可能需要）
      plugins: true,
      // 启用JavaScript（默认启用，但显式设置）
      javascript: true,
      // 配置会话以支持媒体键系统（EME）
      partition: 'persist:vipvideo',
      // 禁用缓存可能有助于解决某些播放问题
      cache: true,
      userAgent: UA
    },
    userAgent: UA
  });
  // 自动允许媒体键系统权限请求
  child.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || '';
    console.log(`[vipWindow] 权限请求: ${permission} 来自: ${requestingUrl}`);
    // 允许媒体相关权限
    if (permission === 'mediaKeySystem' || permission === 'autoplay' || permission === 'media') {
      return callback(true);
    }
    callback(false);
  });
  child.webContents.setWindowOpenHandler(({ url }) => {
    openVipWindow(url, list, size, canShowVip);
    return { action: 'deny' };
  });

  child.loadURL(url);
  // 只注入一次：dom-ready 尽早注入，did-finish-load 兜底（避免与 preload 回退重复建 UI）
  let injected = false;
  const injectOnce = () => {
    if (injected || child.isDestroyed()) return;
    injected = true;
    injectVipUI(child, list, canShowVip);
  };
  child.webContents.on('dom-ready', injectOnce);
  child.webContents.on('did-finish-load', injectOnce);
  return child;
}

module.exports = { openVipWindow };


