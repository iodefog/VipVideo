const { app, BrowserWindow, WebContentsView, ipcMain, Menu, Tray, screen } = require('electron');
const path = require('path');
const fs = require('fs'); // 引入 fs 模块，用于读取 vlist.json 文件
const os = require('os');
const { NavigationPerformanceLogger, safeUrl } = require('./performanceLogger');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

// 简单的历史记录存储
const historyFile = path.join(app.getPath('userData'), 'history.json');
let historyData = [];
let historyWriteTimer = null;
let historyWriteInProgress = false;
let historyWriteQueued = false;

// 获取vlist.json的正确路径（优先使用用户数据目录，支持打包环境）
function getVlistPath() {
  const userVlistPath = path.join(app.getPath('userData'), 'vlist.json');
  return userVlistPath;
}

// 默认的vlist.json路径（用于读取初始配置）
const defaultVlistPath = path.join(__dirname, 'vlist.json');
// 用户数据目录中的vlist.json路径（用于保存和优先读取）
const userVlistPath = getVlistPath();

const CURRENT_VLIST_CONFIG_VERSION = 4;

// 迁移旧版用户配置。v1.1.6 的默认配置误把 bilibili 标记为不支持 VIP，
// 只在旧配置升级时修正一次，之后仍允许用户自行编辑 canvip。
function migrateVlistData(data, filePath) {
  if (!data || typeof data !== 'object') return data;

  const version = Number(data.configVersion) || 1;
  if (version >= CURRENT_VLIST_CONFIG_VERSION) return data;

  if (Array.isArray(data.platformlist)) {
    const bilibili = data.platformlist.find((item) => {
      if (!item) return false;
      if (String(item.name || '').toLowerCase() === 'bilibili') return true;
      try {
        return new URL(item.url).hostname.endsWith('bilibili.com');
      } catch (_) {
        return false;
      }
    });
    if (bilibili) bilibili.canvip = 1;
  }

  // v4 恢复“纯净1”线路；保留一次性迁移以同步已经升级到 v3 的用户配置。
  if (Array.isArray(data.list)) {
    const restoredParser = {
      name: '纯净1',
      url: 'https://im1907.top/?jx='
    };
    const parserExists = data.list.some((item) => String(item && item.url || '').includes('im1907.top'));
    if (!parserExists) {
      const originalIndex = data.list.findIndex((item) => !item || !item.url);
      data.list.splice(originalIndex >= 0 ? originalIndex + 1 : 0, 0, restoredParser);
    }
  }

  data.configVersion = CURRENT_VLIST_CONFIG_VERSION;
  if (filePath === userVlistPath) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
      console.log('[main] 已升级用户 vlist 配置到版本', CURRENT_VLIST_CONFIG_VERSION);
    } catch (error) {
      console.warn('[main] 写入升级后的用户配置失败:', error);
    }
  }
  return data;
}

// 读取历史记录
function loadHistory() {
  try {
    console.log('[main] 正在加载历史记录文件:', historyFile);
    if (fs.existsSync(historyFile)) {
      const data = fs.readFileSync(historyFile, 'utf-8');
      if (data.trim()) {
        historyData = JSON.parse(data);
        if (Array.isArray(historyData)) {
          console.log('[main] 历史记录加载成功，共', historyData.length, '条记录');
        } else {
          console.warn('[main] 历史记录文件格式不正确，应为数组');
          historyData = [];
        }
      } else {
        historyData = [];
      }
    } else {
      console.log('[main] 历史记录文件不存在，创建空历史记录');
      historyData = [];
      // 如果文件不存在，尝试创建一个空文件
      saveHistory();
    }
  } catch (error) {
    console.error('[main] 加载历史记录失败:', error);
    historyData = [];
  }
}

function writeHistoryAsync() {
  if (historyWriteInProgress) {
    historyWriteQueued = true;
    return;
  }

  historyWriteInProgress = true;
  const content = JSON.stringify(historyData, null, 2);
  fs.writeFile(historyFile, content, 'utf-8', (error) => {
    historyWriteInProgress = false;
    if (error) console.warn('Failed to save history:', error);
    if (historyWriteQueued) {
      historyWriteQueued = false;
      writeHistoryAsync();
    }
  });
}

// 合并短时间内的多次写入，并使用异步 I/O，避免 SPA 导航阻塞主进程。
function saveHistory() {
  clearTimeout(historyWriteTimer);
  historyWriteTimer = setTimeout(() => {
    historyWriteTimer = null;
    writeHistoryAsync();
  }, 200);
}

function flushHistorySync() {
  clearTimeout(historyWriteTimer);
  historyWriteTimer = null;
  try {
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Failed to flush history:', error);
  }
}

let mainWindow;
let contentView;
let contentPerformanceLogger;
let contentPerformanceReady = Promise.resolve();
let activeContentEntry;
let pendingContentEntry;
const contentViewPool = new Map();
let maxWarmContentViews = 2;
const backgroundPrewarmEnabled = process.env.VIPVIDEO_BACKGROUND_PREWARM === '1';
const TRANSIENT_NETWORK_ERRORS = new Set([-2, -7, -21, -101, -102, -105, -106, -118, -130, -137]);
const MAX_TRANSIENT_RETRIES = 2;
const prewarmFailedUntil = new Map();
let prewarmTimer = null;
let tray;
let mainWindowDisplayMode = 'normal';
const INACTIVE_WINDOW_OPACITY = 0.62;
const TOOLBAR_HEIGHT = 50;
const optimizedSessions = new WeakSet();
const sessionConfigurationPromises = new WeakMap();
const blockedTelemetryHosts = new Set([
  'h.trace.qq.com',
  'aegis.qq.com',
  'galileotelemetry.tencent.com',
  'snowflake.qq.com',
  'honey.mgtv.com',
  'web.da.mgtv.com',
  'vip.log.mgtv.com',
  'pcweb-v1.log.mgtv.com'
]);
let blockedRequestCount = 0;
let blockedRequestLogTimer = null;
let memoryLogTimer = null;

function scheduleBlockedRequestLog(lastDetails) {
  // 统计请求可能持续发送。固定节流而不是为每个请求重置定时器，避免日志刷屏。
  if (blockedRequestLogTimer) return;
  blockedRequestLogTimer = setTimeout(() => {
    blockedRequestLogTimer = null;
    const details = {
      totalBlocked: blockedRequestCount,
      lastType: lastDetails.resourceType,
      lastUrl: safeUrl(lastDetails.url)
    };
    console.log('[PERF][FAST] telemetry-blocked', details);
    sendToMainRenderer('performance-log', {
      line: '[PERF][FAST] telemetry-blocked',
      stage: 'TELEMETRY_BLOCKED',
      elapsedMs: null,
      navigationId: '-',
      details
    });
  }, 3000);
}

function scheduleMemoryLog(reason) {
  clearTimeout(memoryLogTimer);
  memoryLogTimer = setTimeout(() => {
    memoryLogTimer = null;
    const metrics = app.getAppMetrics();
    const workingSetMb = Math.round(metrics.reduce((total, processMetric) => (
      total + (Number(processMetric.memory && processMetric.memory.workingSetSize) || 0)
    ), 0) / 1024);
    const details = {
      reason,
      poolSize: contentViewPool.size,
      warmLimit: maxWarmContentViews,
      processes: metrics.length,
      systemMemoryMb: Math.round(os.totalmem() / (1024 ** 2)),
      workingSetMb,
      rendererCpuPercent: Math.round(metrics
        .filter((processMetric) => processMetric.type === 'Tab')
        .reduce((total, processMetric) => total + (Number(processMetric.cpu && processMetric.cpu.percentCPUUsage) || 0), 0) * 10) / 10
    };
    console.log('[PERF][MEMORY] app-metrics', details);
    sendToMainRenderer('performance-log', {
      line: '[PERF][MEMORY] app-metrics',
      stage: 'MEMORY_STATUS',
      elapsedMs: null,
      navigationId: '-',
      details
    });
  }, 700);
}

function configureFastSession(targetSession) {
  if (!targetSession) return Promise.resolve();
  if (sessionConfigurationPromises.has(targetSession)) {
    return sessionConfigurationPromises.get(targetSession);
  }

  if (!optimizedSessions.has(targetSession)) {
    optimizedSessions.add(targetSession);
    targetSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      let hostname = '';
      try { hostname = new URL(details.url).hostname.toLowerCase(); } catch (_) { }
      let pathname = '';
      try { pathname = new URL(details.url).pathname; } catch (_) { }
      const isMangoPromotionBootstrap = hostname === 'vip.bz.mgtv.com'
        && pathname === '/client/dynamic_entry';
      const isMangoCashierAsset = hostname === 'vipcdn.mgtv.com'
        && (pathname.startsWith('/upload4/mgtv_cashier/')
          || pathname.startsWith('/mrdb/cashier/'));
      const isMangoNonPlaybackScript = (hostname === 'tb.mgtv.com' && pathname.endsWith('/ad-sdk.js'))
        || (hostname === 'static.hitv.com'
          && (pathname === '/static/sentry.min.js' || pathname === '/static/ie.js'));
      const shouldBlock = details.resourceType === 'ping'
        || blockedTelemetryHosts.has(hostname)
        || isMangoPromotionBootstrap
        || isMangoCashierAsset
        || isMangoNonPlaybackScript;
      if (shouldBlock) {
        blockedRequestCount += 1;
        scheduleBlockedRequestLog(details);
        callback({ cancel: true });
        return;
      }
      callback({});
    });
  }

  const configurationReady = (async () => {
    const probeUrl = 'https://www.mgtv.com/';
    const before = await targetSession.resolveProxy(probeUrl).catch(() => 'UNKNOWN');
    const useSystemProxy = process.env.VIPVIDEO_USE_SYSTEM_PROXY === '1';
    const forceDirect = process.env.VIPVIDEO_FORCE_DIRECT === '1';
    let mode = 'system';

    if (forceDirect) {
      await targetSession.setProxy({ mode: 'direct' });
      mode = 'direct';
    } else if (!useSystemProxy) {
      const proxyMatch = String(before).match(/(?:PROXY|HTTPS?)\s+([^;\s]+)/i);
      if (proxyMatch) {
        const proxyEndpoint = proxyMatch[1];
        await targetSession.setProxy({
          mode: 'fixed_servers',
          proxyRules: `http=${proxyEndpoint};https=${proxyEndpoint}`,
          proxyBypassRules: '<local>'
        });
        mode = 'fixed-session-proxy';
      } else if (before === 'DIRECT') {
        mode = 'direct';
      }
    }

    if (mode !== 'system') {
      if (typeof targetSession.closeAllConnections === 'function') {
        await targetSession.closeAllConnections();
      }
    }
    const after = await targetSession.resolveProxy(probeUrl).catch(() => 'UNKNOWN');
    const mangoStaticRoute = await targetSession.resolveProxy('https://static.hitv.com/').catch(() => 'UNKNOWN');
    const otherPlatformRoute = await targetSession.resolveProxy('https://v.qq.com/').catch(() => 'UNKNOWN');
    console.log('[PERF][NETWORK] proxy-mode', {
      mode,
      before,
      after,
      mangoStaticRoute,
      otherPlatformRoute
    });
  })().catch((error) => {
    console.warn('[PERF][NETWORK] 代理配置失败，继续使用当前网络设置:', error.message);
  });
  sessionConfigurationPromises.set(targetSession, configurationReady);
  return configurationReady;
}

function preconnectNavigationOrigins(targetSession, targetUrl) {
  let targetOrigin = '';
  let targetHostname = '';
  try {
    const parsed = new URL(targetUrl);
    targetOrigin = parsed.origin;
    targetHostname = parsed.hostname.toLowerCase();
  } catch (_) { }
  const selectedOrigins = targetOrigin ? [targetOrigin] : [];
  if (targetHostname === 'www.mgtv.com' || targetHostname.endsWith('.mgtv.com')) {
    selectedOrigins.push('https://static.hitv.com', 'https://s1.hitv.com');
  }
  const uniqueOrigins = [...new Set(selectedOrigins)];
  for (const origin of uniqueOrigins) {
    try { targetSession.preconnect({ url: origin, numSockets: 1 }); } catch (_) { }
  }
  console.log('[PERF][FAST] target-preconnect', { origins: uniqueOrigins, socketsPerOrigin: 1 });
  Promise.all(uniqueOrigins.map(async (origin) => ({
    origin,
    proxy: await targetSession.resolveProxy(origin)
  }))).then((proxyModes) => {
    console.log('[PERF][NETWORK] target-proxy-routes', proxyModes);
  }).catch(() => {});
}

// 仅主播放窗口使用该显示模式。半透明模式在窗口失去焦点时透出背后的页面，
// 重新获得焦点后立即恢复为不透明，避免影响正常操作。
function applyMainWindowDisplayMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindowDisplayMode = mode;
  mainWindow.setAlwaysOnTop(mode !== 'normal');
  mainWindow.setOpacity(1);
  mainWindow.webContents.send('window-display-mode', mainWindowDisplayMode);
}

function configureMainWindowDisplayMode() {
  mainWindow.on('focus', () => {
    if (!mainWindow.isDestroyed()) mainWindow.setOpacity(1);
  });

  mainWindow.on('blur', () => {
    if (!mainWindow.isDestroyed()) {
      const opacity = mainWindowDisplayMode === 'transparent-topmost'
        ? INACTIVE_WINDOW_OPACITY
        : 1;
      mainWindow.setOpacity(opacity);
    }
  });
}

// 放宽自动播放策略（命令行级别，尽量贴近 Chrome 行为）
try {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.userAgentFallback = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
} catch (_) { }

// 获取优先使用的 vlist.json 路径（基于修改时间和存在性）
function getPreferredVlistPath() {
  const userExists = fs.existsSync(userVlistPath);
  const defaultExists = fs.existsSync(defaultVlistPath);

  if (userExists && defaultExists) {
    // 如果是打包后的环境，始终优先使用用户配置
    // 除非用户完全删除了配置文件，否则不应该覆盖
    if (app.isPackaged) {
      return userVlistPath;
    }

    try {
      const userStat = fs.statSync(userVlistPath);
      const defaultStat = fs.statSync(defaultVlistPath);
      // 如果默认配置（开发/源码目录）比用户配置新，优先使用默认配置
      // 这允许开发者直接修改源文件并生效
      if (defaultStat.mtime > userStat.mtime) {
        console.log('[main] 检测到源文件更新，优先使用默认配置:', defaultVlistPath);
        return defaultVlistPath;
      }
    } catch (e) {
      console.warn('[main] 比较文件时间失败:', e);
    }
  }

  if (userExists) return userVlistPath;
  if (defaultExists) return defaultVlistPath;
  return null;
}

// 确保用户配置文件存在
function ensureUserVlistExists() {
  try {
    if (!fs.existsSync(userVlistPath) && fs.existsSync(defaultVlistPath)) {
      fs.copyFileSync(defaultVlistPath, userVlistPath);
      console.log('[main] 已初始化用户配置文件:', userVlistPath);
    }
  } catch (e) {
    console.error('[main] 初始化用户配置失败:', e);
  }
}

// 读取 vlist.json 文件
function readVlistData() {
  ensureUserVlistExists();
  const filePath = getPreferredVlistPath();
  if (!filePath) return null;

  try {
    console.log('[main] 读取 vlist.json:', filePath);
    const data = fs.readFileSync(filePath, 'utf-8');
    return migrateVlistData(JSON.parse(data), filePath);
  } catch (error) {
    console.error('Failed to read vlist.json:', error);
  }
  return null;
}

let vlistData = null;
let vlistJsonContent = '';

// 初始化读取
try {
  const filePath = getPreferredVlistPath();
  if (filePath) {
    vlistJsonContent = fs.readFileSync(filePath, 'utf-8');
    vlistData = migrateVlistData(JSON.parse(vlistJsonContent), filePath);
    vlistJsonContent = JSON.stringify(vlistData, null, 4);
  } else {
    // 默认空结构
    vlistData = { list: [], platformlist: [] };
    vlistJsonContent = JSON.stringify(vlistData, null, 2);
  }
} catch (error) {
  console.error('Failed to init vlist.json content:', error);
  vlistJsonContent = JSON.stringify({ list: [], platformlist: [] }, null, 2);
  vlistData = { list: [], platformlist: [] };
}

function sendToMainRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getContentState(entry = activeContentEntry) {
  if (!entry || !entry.view || !entry.contents || entry.contents.isDestroyed()) {
    return { url: '', title: '', canGoBack: false, isLoading: false };
  }
  const contents = entry.contents;
  return {
    url: contents.getURL(),
    title: contents.getTitle(),
    canGoBack: contents.navigationHistory.canGoBack(),
    isLoading: contents.isLoading(),
    loadFailed: Boolean(entry.mainFrameFailed),
    platformKey: entry.key,
    warmViews: [...contentViewPool.values()].filter((item) => item.isWarmed && !item.mainFrameFailed).length
  };
}

function broadcastContentState(extra = {}) {
  sendToMainRenderer('content-state', { ...getContentState(), ...extra });
}

function updateContentViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = mainWindow.getContentBounds();
  const bounds = {
    x: 0,
    y: 0,
    width: Math.max(1, width),
    height: Math.max(1, height - TOOLBAR_HEIGHT)
  };
  for (const entry of contentViewPool.values()) entry.view.setBounds(bounds);
}

function baseDomain(hostname) {
  const parts = String(hostname || '').toLowerCase().split('.').filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join('.') : parts[0] || '';
}

function isAllowedTopLevelUrl(url) {
  try {
    const domain = baseDomain(new URL(url).hostname);
    const platforms = Array.isArray(vlistData && vlistData.platformlist) ? vlistData.platformlist : [];
    const parsers = Array.isArray(vlistData && vlistData.list) ? vlistData.list : [];
    return platforms.some((item) => {
      try { return baseDomain(new URL(item.url).hostname) === domain; } catch (_) { return false; }
    }) || parsers.some((item) => {
      try { return item.url && baseDomain(new URL(item.url).hostname) === domain; } catch (_) { return false; }
    });
  } catch (_) {
    return false;
  }
}

function getPlatformForUrl(url) {
  try {
    const domain = baseDomain(new URL(url).hostname);
    const platforms = Array.isArray(vlistData && vlistData.platformlist) ? vlistData.platformlist : [];
    return platforms.find((item) => {
      try {
        return item && item.category === 'video' && (item.canvip === 1 || item.canvip === true)
          && baseDomain(new URL(item.url).hostname) === domain;
      } catch (_) {
        return false;
      }
    }) || null;
  } catch (_) {
    return null;
  }
}

function platformKey(platform) {
  try { return baseDomain(new URL(platform.url).hostname); } catch (_) { return ''; }
}

function destroyContentEntry(entry, reason = 'evicted') {
  if (!entry) return;
  clearPendingEntryTimers(entry);
  clearTimeout(entry.initialSlowTimer);
  clearTimeout(entry.initialTimeoutTimer);
  if (pendingContentEntry === entry) pendingContentEntry = null;
  console.log('[PERF][CACHE] view-destroyed', { key: entry.key, reason });
  contentViewPool.delete(entry.key);
  try { mainWindow.contentView.removeChildView(entry.view); } catch (_) { }
  try { entry.profiler.destroy(); } catch (_) { }
  try {
    if (entry.contents && !entry.contents.isDestroyed()) entry.contents.close();
  } catch (_) { }
  scheduleMemoryLog(`destroy:${reason}`);
}

function clearPendingEntryTimers(entry) {
  if (!entry) return;
  clearTimeout(entry.pendingSlowTimer);
  clearTimeout(entry.pendingTimeoutTimer);
  clearTimeout(entry.retryTimer);
  entry.pendingSlowTimer = null;
  entry.pendingTimeoutTimer = null;
  entry.retryTimer = null;
}

function errorCodeFromLoadError(error) {
  if (Number.isFinite(error && error.errorCode)) return Number(error.errorCode);
  const match = String((error && (error.message || error.errorDescription)) || '').match(/\((-?\d+)\)/);
  return match ? Number(match[1]) : null;
}

function isRetryableEntry(entry) {
  return pendingContentEntry === entry
    || (entry === activeContentEntry && !entry.viewVisible);
}

function finalizeEntryLoadFailure(entry, error = {}) {
  if (!entry || entry.contents.isDestroyed()) return;
  const errorCode = errorCodeFromLoadError(error);
  const errorDescription = error.errorDescription || error.message || '页面连接失败';
  entry.mainFrameFailed = true;
  entry.isWarmed = false;

  if (pendingContentEntry === entry) {
    failPendingContentEntry(entry, 'pending-main-frame-failed', { errorCode, errorDescription });
    return;
  }
  if (entry === activeContentEntry) {
    clearTimeout(entry.initialSlowTimer);
    clearTimeout(entry.initialTimeoutTimer);
    sendToMainRenderer('content-load-error', {
      errorCode,
      errorDescription,
      url: entry.requestedUrl
    });
    broadcastContentState({ isLoading: false, loadFailed: true, slowLoading: false, retryAttempt: 0 });
  }
}

function scheduleTransientRetry(entry, error = {}) {
  if (!entry || !isRetryableEntry(entry) || entry.contents.isDestroyed()) return false;
  if (entry.retryTimer) return true;
  const errorCode = errorCodeFromLoadError(error);
  if (!TRANSIENT_NETWORK_ERRORS.has(errorCode) || entry.retryAttempts >= MAX_TRANSIENT_RETRIES) {
    return false;
  }

  entry.retryAttempts += 1;
  entry.mainFrameFailed = false;
  const attempt = entry.retryAttempts;
  const delayMs = attempt === 1 ? 700 : 1800;
  const details = {
    key: entry.key,
    attempt,
    maxAttempts: MAX_TRANSIENT_RETRIES,
    delayMs,
    errorCode,
    errorDescription: error.errorDescription || error.message
  };
  console.warn('[PERF][STABILITY] transient-retry-scheduled', details);
  broadcastContentState({
    pendingPlatformKey: pendingContentEntry === entry ? entry.key : '',
    isLoading: true,
    loadFailed: false,
    slowLoading: true,
    retryAttempt: attempt,
    maxRetryAttempts: MAX_TRANSIENT_RETRIES
  });

  entry.retryTimer = setTimeout(() => {
    entry.retryTimer = null;
    if (!isRetryableEntry(entry) || entry.contents.isDestroyed()) return;
    entry.profiler.log('TRANSIENT_RETRY_STARTED', {
      attempt,
      errorCode,
      url: safeUrl(entry.requestedUrl),
      viewKey: entry.key
    });
    preconnectNavigationOrigins(entry.contents.session, entry.requestedUrl);
    entry.contents.loadURL(entry.requestedUrl).catch((retryError) => {
      if (!isRetryableEntry(entry)) return;
      if (!scheduleTransientRetry(entry, retryError)) finalizeEntryLoadFailure(entry, retryError);
    });
  }, delayMs);
  return true;
}

function failPendingContentEntry(entry, reason, error = {}) {
  if (!entry || pendingContentEntry !== entry) return;
  clearPendingEntryTimers(entry);
  pendingContentEntry = null;
  entry.pendingActivation = false;
  entry.mainFrameFailed = true;
  entry.isWarmed = false;
  prewarmFailedUntil.set(entry.key, Date.now() + 60000);

  const details = {
    key: entry.key,
    reason,
    errorCode: error.errorCode,
    errorDescription: error.errorDescription || error.message
  };
  console.warn('[PERF][STABILITY] pending-view-failed', details);
  destroyContentEntry(entry, reason);
  broadcastContentState({
    pendingPlatformKey: '',
    isLoading: false,
    loadFailed: false,
    pendingLoadFailed: true,
    failureReason: details.errorDescription || reason
  });
  schedulePlatformPrewarm(activeContentEntry && activeContentEntry.key);
}

function beginPendingActivation(entry) {
  if (!entry || entry === activeContentEntry) return;
  if (pendingContentEntry && pendingContentEntry !== entry) {
    destroyContentEntry(pendingContentEntry, 'pending-superseded');
  }
  pendingContentEntry = entry;
  entry.pendingActivation = true;
  clearPendingEntryTimers(entry);
  broadcastContentState({
    pendingPlatformKey: entry.key,
    isLoading: true,
    loadFailed: false,
    pendingLoadFailed: false,
    slowLoading: false,
    retryAttempt: 0,
    maxRetryAttempts: MAX_TRANSIENT_RETRIES
  });

  entry.pendingSlowTimer = setTimeout(() => {
    if (pendingContentEntry !== entry) return;
    broadcastContentState({ pendingPlatformKey: entry.key, isLoading: true, slowLoading: true });
  }, 6000);
  entry.pendingTimeoutTimer = setTimeout(() => {
    if (pendingContentEntry !== entry) return;
    try { if (!entry.contents.isDestroyed()) entry.contents.stop(); } catch (_) { }
    failPendingContentEntry(entry, 'pending-timeout', {
      errorDescription: '45 秒内多次尝试后页面仍未准备完成'
    });
  }, 45000);
  console.log('[PERF][STABILITY] pending-view-started', { key: entry.key });
}

function completePendingActivation(entry) {
  if (!entry || pendingContentEntry !== entry || entry.mainFrameFailed) return;
  clearPendingEntryTimers(entry);
  pendingContentEntry = null;
  entry.pendingActivation = false;
  activateContentEntry(entry, 'new-platform-dom-ready', {
    cacheSwitch: false,
    interactiveReady: true
  });
  schedulePlatformPrewarm(entry.key);
}

function evictWarmViewIfNeeded(excludedKeys = new Set()) {
  if (contentViewPool.size < maxWarmContentViews) return;
  const candidates = [...contentViewPool.values()]
    .filter((entry) => entry !== activeContentEntry && !excludedKeys.has(entry.key))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  if (candidates[0]) destroyContentEntry(candidates[0], 'lru-limit');
}

function suspendContentEntry(entry, reason = 'hidden') {
  if (!entry || entry === activeContentEntry || !entry.contents || entry.contents.isDestroyed()) return;
  try { entry.contents.setAudioMuted(true); } catch (_) { }
  entry.view.setVisible(false);
  entry.viewVisible = false;

  console.log('[PERF][CACHE] view-suspended', { key: entry.key, reason });
  scheduleMemoryLog(`suspend:${reason}`);

  // 不再对仍在加载的官网调用 stop()。DOMContentLoaded 后仍可能有播放器、
  // 登录态和路由脚本，提前中断会造成缓存页再次显示时黑屏或功能缺失。
  if (entry.contents.isLoading()) {
    entry.freezeDeferred = true;
    entry.freezeReason = reason;
    console.log('[PERF][STABILITY] hidden-view-freeze-deferred', { key: entry.key, reason });
    return;
  }
  entry.freezeDeferred = false;
  entry.freezeReason = '';

  (async () => {
    if (entry.profiler.active && !entry.profiler.active.completed) {
      await entry.profiler.finish('view-suspended');
    }
    if (entry === activeContentEntry || !entry.contents || entry.contents.isDestroyed()) return;
    await entry.profiler.setLifecycleState('frozen');
  })().catch(() => {});
}

function activateContentEntry(entry, reason = 'navigation', options = {}) {
  if (!entry || entry === activeContentEntry) return;
  const previous = activeContentEntry;
  if (previous) {
    previous.view.setVisible(false);
    try { previous.contents.setAudioMuted(true); } catch (_) { }
  }

  activeContentEntry = entry;
  if (!entry.profileAttached) {
    entry.profileAttached = true;
    entry.performanceReady = entry.profiler.attachDebugger();
  }
  contentView = entry.view;
  contentPerformanceLogger = entry.profiler;
  contentPerformanceReady = entry.performanceReady;
  entry.lastUsedAt = Date.now();
  entry.freezeDeferred = false;
  entry.freezeReason = '';
  entry.profiler.setLifecycleState('active').catch(() => {});
  entry.view.setVisible(true);
  entry.viewVisible = true;
  try { entry.contents.setAudioMuted(false); } catch (_) { }
  updateContentViewBounds();
  const cacheSwitch = options.cacheSwitch !== false;
  broadcastContentState({
    cacheSwitch,
    interactiveReady: Boolean(options.interactiveReady),
    pendingPlatformKey: '',
    slowLoading: false,
    pendingLoadFailed: false,
    retryAttempt: 0,
    maxRetryAttempts: MAX_TRANSIENT_RETRIES
  });

  const details = {
    reason,
    from: previous && previous.key,
    to: entry.key,
    cachedUrl: safeUrl(entry.contents.getURL()),
    poolSize: contentViewPool.size
  };
  console.log('[PERF][CACHE] view-activated', details);
  scheduleMemoryLog(`activate:${reason}`);
  sendToMainRenderer('performance-log', {
    line: '[PERF][CACHE] view-activated',
    stage: cacheSwitch ? 'VIEW_CACHE_HIT' : 'VIEW_READY',
    elapsedMs: 0,
    navigationId: '-',
    details
  });
  if (previous) setTimeout(() => suspendContentEntry(previous, 'platform-switch'), 0);
}

async function loadContentEntry(entry, url, metadata = {}) {
  if (!/^https?:\/\//i.test(url || '')) {
    throw new Error(`已阻止非 HTTP(S) 地址: ${url}`);
  }

  await entry.performanceReady;
  preconnectNavigationOrigins(entry.contents.session, url);
  entry.mainFrameFailed = false;
  entry.requestedUrl = url;
  entry.requestMetadata = metadata;
  entry.retryAttempts = 0;
  clearTimeout(entry.retryTimer);
  entry.retryTimer = null;
  const requestId = metadata.requestId || `main-${Date.now()}`;
  entry.profiler.start({
    requestId,
    source: metadata.source || 'renderer',
    url,
    rendererSentAt: metadata.rendererSentAt
  });
  entry.profiler.log('LOAD_URL_CALLED', { url: safeUrl(url), viewKey: entry.key });
  if (entry === activeContentEntry) {
    broadcastContentState({
      requestedUrl: url,
      requestId,
      isLoading: true,
      loadFailed: false,
      retryAttempt: 0,
      maxRetryAttempts: MAX_TRANSIENT_RETRIES
    });
    if (!entry.viewVisible) {
      clearTimeout(entry.initialSlowTimer);
      clearTimeout(entry.initialTimeoutTimer);
      entry.initialSlowTimer = setTimeout(() => {
        if (entry === activeContentEntry && !entry.viewVisible && !entry.mainFrameFailed) {
          broadcastContentState({ isLoading: true, slowLoading: true });
        }
      }, 6000);
      entry.initialTimeoutTimer = setTimeout(() => {
        if (entry !== activeContentEntry || entry.viewVisible || entry.mainFrameFailed) return;
        clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
        entry.mainFrameFailed = true;
        try { entry.contents.stop(); } catch (_) { }
        sendToMainRenderer('content-load-error', {
          errorCode: 'STARTUP_TIMEOUT',
          errorDescription: '45 秒内多次尝试后页面仍未准备完成',
          url
        });
        broadcastContentState({ isLoading: false, loadFailed: true, slowLoading: false });
      }, 45000);
    }
  }

  entry.contents.loadURL(url).then(() => {
    entry.isWarmed = true;
    entry.profiler.log('LOAD_URL_PROMISE_RESOLVED', {
      url: safeUrl(entry.contents && !entry.contents.isDestroyed() ? entry.contents.getURL() : url),
      viewKey: entry.key
    });
  }).catch((error) => {
    const stoppedAfterReady = metadata.source === 'background-prewarm'
      && entry.isWarmed && /ERR_ABORTED|\(-3\)/i.test(error.message);
    entry.profiler.log(stoppedAfterReady ? 'PREWARM_TAIL_STOPPED' : 'LOAD_URL_PROMISE_REJECTED', {
      message: error.message,
      url: safeUrl(url),
      viewKey: entry.key
    });
    if (isRetryableEntry(entry) && !stoppedAfterReady && scheduleTransientRetry(entry, error)) {
      return;
    }
    if (metadata.source === 'background-prewarm' && !stoppedAfterReady) {
      entry.isWarmed = false;
      entry.mainFrameFailed = true;
      prewarmFailedUntil.set(entry.key, Date.now() + 60000);
      if (entry !== activeContentEntry) destroyContentEntry(entry, 'prewarm-failed');
      setTimeout(() => schedulePlatformPrewarm(activeContentEntry && activeContentEntry.key), 1000);
    } else if (entry.pendingActivation && !stoppedAfterReady) {
      finalizeEntryLoadFailure(entry, error);
    } else if (entry === activeContentEntry && !entry.viewVisible && !stoppedAfterReady) {
      finalizeEntryLoadFailure(entry, error);
    }
  });
  return { ok: true, requestId, state: getContentState(entry) };
}

function createContentEntry(key, options = {}) {
  const view = new WebContentsView({
    webPreferences: {
      // 使用独立的新会话，避开旧 persist:netease 中已经损坏的
      // Service Worker / Quota 数据库；首次升级后需要重新登录一次。
      partition: 'persist:vipvideo',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  view.setBackgroundColor('#ffffff');
  view.setVisible(Boolean(options.visible));
  mainWindow.contentView.addChildView(view);

  const contents = view.webContents;
  const sessionReady = configureFastSession(contents.session);
  contents.setUserAgent(app.userAgentFallback);
  contents.setAudioMuted(!options.visible);
  contents.setBackgroundThrottling(true);

  const entry = {
    key,
    view,
    contents,
    profiler: null,
    performanceReady: Promise.resolve(),
    profileAttached: options.profile !== false,
    lastUsedAt: options.visible ? Date.now() : 0,
    isWarmed: false,
    mainFrameFailed: false,
    pendingActivation: false,
    pendingSlowTimer: null,
    pendingTimeoutTimer: null,
    retryTimer: null,
    retryAttempts: 0,
    requestedUrl: '',
    requestMetadata: null,
    initialSlowTimer: null,
    initialTimeoutTimer: null,
    freezeDeferred: false,
    freezeReason: '',
    viewVisible: Boolean(options.visible)
  };

  entry.profiler = new NavigationPerformanceLogger(contents, (logEntry) => {
    sendToMainRenderer('performance-log', {
      ...logEntry,
      details: { ...(logEntry.details || {}), viewKey: entry.key }
    });
  });
  // 隐藏的预热页不挂 CDP，减少额外采样开销；成为活动页后仍可记录 Electron 阶段。
  const profilerReady = options.profile === false
    ? Promise.resolve()
    : entry.profiler.attachDebugger();
  entry.performanceReady = Promise.all([sessionReady, profilerReady]).then(() => true);
  contentViewPool.set(key, entry);

  contents.setWindowOpenHandler(({ url }) => {
    if (entry === activeContentEntry && isAllowedTopLevelUrl(url)) {
      navigateContent(url, { source: 'window-open' }).catch((error) => {
        console.error('[main] 当前窗口加载新链接失败:', error);
      });
    } else {
      console.warn('[main] 已阻止第三方或广告新窗口:', safeUrl(url));
    }
    return { action: 'deny' };
  });

  contents.on('did-start-loading', () => {
    if (entry === activeContentEntry) broadcastContentState({ isLoading: true });
  });
  contents.on('did-stop-loading', () => {
    if (!entry.mainFrameFailed) entry.isWarmed = true;
    if (entry === activeContentEntry) {
      broadcastContentState({ isLoading: false, loadFailed: entry.mainFrameFailed });
    } else if (entry.freezeDeferred && !entry.pendingActivation) {
      const deferredReason = entry.freezeReason || 'hidden-load-complete';
      setTimeout(() => suspendContentEntry(entry, deferredReason), 0);
    }
  });
  contents.on('did-navigate', (_event, url, httpResponseCode, httpStatusText) => {
    if (entry === activeContentEntry) {
      broadcastContentState({ url, httpResponseCode, httpStatusText, navigationType: 'document' });
    }
  });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame && entry === activeContentEntry) {
      broadcastContentState({ url, navigationType: 'in-page' });
    }
  });
  contents.on('page-title-updated', (_event, title) => {
    if (entry === activeContentEntry) broadcastContentState({ title });
  });
  contents.on('dom-ready', () => {
    clearTimeout(entry.initialSlowTimer);
    clearTimeout(entry.initialTimeoutTimer);
    if (!entry.mainFrameFailed) entry.isWarmed = true;
    if (entry.pendingActivation) completePendingActivation(entry);
    else if (entry === activeContentEntry && !entry.mainFrameFailed) {
      if (!entry.viewVisible) {
        entry.view.setVisible(true);
        entry.viewVisible = true;
        try { entry.contents.setAudioMuted(false); } catch (_) { }
        broadcastContentState({
          interactiveReady: true,
          isLoading: entry.contents.isLoading(),
          retryAttempt: 0,
          maxRetryAttempts: MAX_TRANSIENT_RETRIES
        });
      }
      schedulePlatformPrewarm(entry.key);
    }
    else setTimeout(() => suspendContentEntry(entry, 'hidden-dom-ready'), 1000);
  });
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    const failure = { errorCode, errorDescription, validatedURL };
    if (scheduleTransientRetry(entry, failure)) return;
    finalizeEntryLoadFailure(entry, failure);
  });
  updateContentViewBounds();
  return entry;
}

function schedulePlatformPrewarm(activeKey) {
  clearTimeout(prewarmTimer);
  prewarmTimer = null;
  // 默认稳定模式不在后台加载另一家完整视频网站。需要做性能对照时，
  // 可显式设置 VIPVIDEO_BACKGROUND_PREWARM=1 恢复预热。
  if (!backgroundPrewarmEnabled) return;
  prewarmTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || contentViewPool.size >= maxWarmContentViews) return;
    const platforms = Array.isArray(vlistData && vlistData.platformlist) ? vlistData.platformlist : [];
    const candidate = platforms.find((item) => {
      const key = platformKey(item || {});
      return key && key !== activeKey && item.category === 'video'
        && (item.canvip === 1 || item.canvip === true) && !contentViewPool.has(key)
        && (prewarmFailedUntil.get(key) || 0) <= Date.now();
    });
    if (!candidate) return;

    const key = platformKey(candidate);
    const entry = createContentEntry(key, { visible: false, profile: false });
    console.log('[PERF][CACHE] prewarm-started', { key, url: safeUrl(candidate.url) });
    loadContentEntry(entry, candidate.url, {
      source: 'background-prewarm',
      requestId: `warm-${key}-${Date.now()}`
    }).catch((error) => console.warn('[PERF][CACHE] 预热失败:', key, error.message));
    contentsReadyForNextPrewarm(entry, activeKey);
  }, 1800);
}

function contentsReadyForNextPrewarm(entry, activeKey) {
  const scheduleNext = () => schedulePlatformPrewarm(activeKey);
  if (entry.contents && !entry.contents.isDestroyed()) {
    entry.contents.once('dom-ready', () => setTimeout(scheduleNext, 1200));
  }
  setTimeout(scheduleNext, 8000);
}

async function navigateContent(url, metadata = {}) {
  if (!activeContentEntry || !activeContentEntry.contents || activeContentEntry.contents.isDestroyed()) {
    throw new Error('WebContentsView 尚未初始化');
  }
  const source = metadata.source || 'renderer';
  const canUsePlatformCache = ['toolbar', 'startup-default', 'startup-restore'].includes(source);
  const platform = canUsePlatformCache ? getPlatformForUrl(url) : null;
  const key = platform ? platformKey(platform) : '';

  if (key) {
    if (pendingContentEntry && pendingContentEntry.key !== key) {
      destroyContentEntry(pendingContentEntry, 'pending-platform-changed');
      broadcastContentState({ pendingPlatformKey: '', slowLoading: false });
    }
    if (pendingContentEntry && pendingContentEntry.key === key) {
      return { ok: true, requestId: metadata.requestId, pending: true, state: getContentState() };
    }

    const cached = contentViewPool.get(key);
    if (cached && cached !== activeContentEntry) {
      if (cached.isWarmed && !cached.mainFrameFailed) {
        activateContentEntry(cached, 'warm-cache-hit');
        schedulePlatformPrewarm(key);
        return { ok: true, requestId: metadata.requestId, cached: true, state: getContentState() };
      }
      beginPendingActivation(cached);
      return { ok: true, requestId: metadata.requestId, pending: true, state: getContentState() };
    }

    if (activeContentEntry.key === '__initial__' && !activeContentEntry.contents.getURL()) {
      contentViewPool.delete('__initial__');
      activeContentEntry.key = key;
      contentViewPool.set(key, activeContentEntry);
    } else if (!cached && activeContentEntry.key !== key) {
      evictWarmViewIfNeeded(new Set([key]));
      const newEntry = createContentEntry(key, { visible: false, profile: true });
      beginPendingActivation(newEntry);
      const result = await loadContentEntry(newEntry, url, metadata);
      return { ...result, pending: true, state: getContentState() };
    }
  }

  return loadContentEntry(activeContentEntry, url, metadata);
}

function createContentView() {
  // 首次远程页面在 DOM 就绪前保持隐藏，让本地加载页始终可见，避免启动黑屏。
  const entry = createContentEntry('__initial__', { visible: false, profile: true });
  activeContentEntry = entry;
  contentView = entry.view;
  contentPerformanceLogger = entry.profiler;
  contentPerformanceReady = entry.performanceReady;
}

function createWindow() {
  console.log('createWindow');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      autoplayPolicy: 'no-user-gesture-required', // 允许自动播放
      nodeIntegration: true, // 启用Node集成
      contextIsolation: false // 禁用上下文隔离
    }
  });

  mainWindow.loadFile('index.html');
  createContentView();
  mainWindow.on('resize', updateContentViewBounds);
  configureMainWindowDisplayMode();

  mainWindow.on('close', function (event) {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    clearTimeout(prewarmTimer);
    prewarmTimer = null;
    clearTimeout(memoryLogTimer);
    memoryLogTimer = null;
    for (const entry of contentViewPool.values()) {
      try { entry.profiler.destroy(); } catch (_) { }
      try {
        if (entry.contents && !entry.contents.isDestroyed()) entry.contents.close();
      } catch (_) { }
    }
    contentViewPool.clear();
    pendingContentEntry = null;
    activeContentEntry = null;
    contentPerformanceLogger = null;
    contentPerformanceReady = Promise.resolve();
    contentView = null;
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'images/iconStatus@2x.png')); // 设置任务栏图标

  // 创建任务栏菜单（移除自动拼接相关逻辑）
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('VipVideo'); // 设置鼠标悬停提示
  tray.setContextMenu(contextMenu); // 设置右键菜单

  // 点击任务栏图标时显示窗口并置顶
  tray.on('click', () => {
    console.log('tray click');
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { width, height } = mainWindow.getBounds(); // 获取窗口宽高
      const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize; // 获取屏幕工作区大小

      // 计算窗口居中位置
      const x = Math.round((screenWidth - width) / 2);
      const y = Math.round((screenHeight - height) / 2);

      mainWindow.setBounds({ x, y, width, height }); // 设置窗口位置
      mainWindow.show(); // 显示窗口
      mainWindow.focus(); // 确保窗口获得焦点
    } else {
      createWindow();
    }
  });

  // 防止 macOS 弹出“音乐播放样式”
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  // macOS 特定行为：确保点击图标时不会触发默认的“Now Playing”界面
  if (process.platform === 'darwin') {
    tray.on('right-click', () => {
      tray.popUpContextMenu(contextMenu); // 显示右键菜单
    });
  }
}

// 兼容旧版渲染逻辑：网页请求新窗口时，改为在主播放窗口中加载。
ipcMain.on('create-new-window', (event, newPageUrl, canShowVip) => {
  console.log('[main] 在当前窗口加载 URL:', newPageUrl);
  navigateContent(newPageUrl, { source: 'legacy-window-open' }).catch((error) => {
    console.error('[main] 当前窗口加载 URL 失败:', error);
  });
});

ipcMain.handle('content-navigate', async (_event, payload = {}) => {
  const receivedAt = Date.now();
  const result = await navigateContent(payload.url, {
    requestId: payload.requestId,
    source: payload.source || 'renderer',
    rendererSentAt: payload.rendererSentAt
  });
  return {
    ...result,
    mainReceivedAt: receivedAt,
    mainRespondedAt: Date.now()
  };
});

ipcMain.handle('content-get-state', () => getContentState());

ipcMain.handle('content-go-back', () => {
  if (!contentView || contentView.webContents.isDestroyed()) return getContentState();
  const history = contentView.webContents.navigationHistory;
  if (history.canGoBack()) history.goBack();
  return getContentState();
});

ipcMain.handle('content-toggle-devtools', (event) => {
  // 打开本地工具栏页面的 DevTools；性能日志会同步到这里的 Console，
  // 且不会抢占远程页面用于 CDP 性能采样的调试连接。
  const contents = event.sender;
  if (contents.isDevToolsOpened()) contents.closeDevTools();
  else contents.openDevTools({ mode: 'detach' });
  return contents.isDevToolsOpened();
});

ipcMain.on('set-content-view-visible', (_event, visible) => {
  if (contentView) contentView.setVisible(Boolean(visible));
});

ipcMain.on('show-vip-route-menu', (_event, data = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const baseUrl = String(data.baseUrl || '');
  const routes = Array.isArray(vlistData && vlistData.list) ? vlistData.list : [];
  if (!baseUrl || routes.length === 0) return;

  const menu = Menu.buildFromTemplate(routes.map((route, index) => ({
    label: route.name || `解析${index + 1}`,
    click: () => {
      const parser = String(route.url || '');
      const target = parser ? `${parser}${baseUrl}` : baseUrl;
      navigateContent(target, {
        source: parser ? 'vip-route' : 'original-route',
        requestId: `vip-${Date.now()}`
      }).catch((error) => console.error('[main] VIP 路线加载失败:', error));
    }
  })));
  menu.popup({ window: mainWindow });
});

// 主播放窗口的置顶状态由底部工具栏控制。
ipcMain.on('set-window-display-mode', (event, mode) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow !== mainWindow) return;

  const supportedModes = new Set(['normal', 'topmost', 'transparent-topmost']);
  applyMainWindowDisplayMode(supportedModes.has(mode) ? mode : 'normal');
});

ipcMain.on('get-window-display-mode', (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow === mainWindow) {
    event.sender.send('window-display-mode', mainWindowDisplayMode);
  }
});

// 确保loadHistory()函数在应用启动时被调用
function initializeApp() {
  console.log('[main] 初始化应用...');
  const systemMemoryMb = Math.round(os.totalmem() / (1024 ** 2));
  // 默认只缓存用户已经成功打开的页面，不主动后台加载其他官网。
  // 8/16 GB 设备保留最近两页；24 GB 以上设备最多保留三页。
  maxWarmContentViews = systemMemoryMb >= 24576 ? 3 : 2;
  console.log('[PERF][CACHE] warm-limit', {
    maxWarmContentViews,
    systemMemoryMb,
    backgroundPrewarmEnabled
  });
  loadHistory();

  app.on('applicationSupportsSecureRestorableState', () => true); // 启用安全的可恢复状态
  createWindow();
  createTray(); // 创建任务栏图标

  let gpuStatusLogged = false;
  const logGpuStatus = () => {
    if (gpuStatusLogged) return;
    gpuStatusLogged = true;
    try {
      const status = app.getGPUFeatureStatus();
      console.log('[PERF][GPU] feature-status', status);
      sendToMainRenderer('performance-log', {
        line: '[PERF][GPU] feature-status',
        stage: 'GPU_STATUS',
        elapsedMs: null,
        navigationId: '-',
        details: status
      });
    } catch (error) {
      console.warn('[PERF][GPU] 无法读取 GPU 状态:', error.message);
    }
  };
  app.once('gpu-info-update', logGpuStatus);
  setTimeout(logGpuStatus, 2000);
}

// 合并app.whenReady()调用，确保只执行一次
if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    initializeApp();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  flushHistorySync();
});

// 保存历史记录
ipcMain.on('save-history', (event, data) => {
  // 实现保存历史记录的逻辑
  console.log('Saving history:', data);
  // 兼容对象格式和字符串格式
  const url = typeof data === 'object' ? data.url : data;
  const title = typeof data === 'object' ? (data.title || '未知页面') : '未知页面';
  // 添加新记录到历史
  const timestamp = Date.now(); // 使用时间戳而非ISO字符串，更易于前端处理
  if (historyData[0] && historyData[0].url === url) {
    historyData[0] = { url, title, timestamp };
    saveHistory();
    return;
  }
  historyData.unshift({ url, title, timestamp });
  // 限制历史记录数量
  if (historyData.length > 100) {
    historyData = historyData.slice(0, 100);
  }
  saveHistory();
});

// 获取历史记录
ipcMain.on('get-history', (event) => {
  try {
    console.log('[main] 获取历史记录请求，数据条数:', historyData.length);
    // 返回历史记录，使用history-data通道与renderer.js保持一致
    event.sender.send('history-data', historyData);
  } catch (error) {
    console.error('[main] 获取历史记录失败:', error);
    // 如果出错，发送错误事件给渲染进程
    event.sender.send('history-error', error.message);
  }
});

// 清空历史记录
ipcMain.on('clear-history', (event) => {
  // 清空历史记录
  try {
    historyData = [];
    saveHistory();
    event.sender.send('history-cleared');
  } catch (error) {
    console.error('Failed to clear history:', error);
    event.sender.send('history-clear-error', error.message);
  }
});

// 为历史记录页面提供访问历史数据的能力
// 历史数据加载已在initializeApp函数中处理

// 处理从历史记录页面加载URL的请求
ipcMain.on('load-url', (event, data) => {
  const { url, title } = data;
  if (mainWindow) {
    // 通过IPC通知主窗口加载URL
    mainWindow.webContents.send('load-url-from-history', { url, title });
  }
});

// 打开历史记录页面
ipcMain.on('open-history-window', () => {
  console.log('[main] 打开历史记录页面');
  const historyWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: '操作记录',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  // 加载history.html文件
  const historyFilePath = path.join(__dirname, './history.html');
  console.log('[main] 历史记录文件路径:', historyFilePath);
  historyWindow.loadFile(historyFilePath);

  // 可选：打开开发者工具以便调试
  // historyWindow.webContents.openDevTools();

  // 监听窗口关闭事件
  historyWindow.on('closed', () => {
    console.log('[main] 历史记录窗口已关闭');
  });
});

// 处理返回按钮事件
ipcMain.on('go-back', (event) => {
  if (mainWindow) {
    // 通过IPC通知主窗口返回
    mainWindow.webContents.send('go-back');
  }
});

// 获取 vlist.json 内容
ipcMain.on('get-vlist-content', (event) => {
  event.sender.send('vlist-content', vlistJsonContent);
});

// 获取 vlist 数据对象
ipcMain.on('get-vlist-data', (event) => {
  // 确保vlistData是最新的
  const currentVlistData = readVlistData();
  if (currentVlistData) {
    vlistData = currentVlistData;
    vlistJsonContent = JSON.stringify(currentVlistData, null, 4);
  }
  event.sender.send('vlist-data', currentVlistData);
});

// 获取默认/原始的 vlist.json 内容 (用于重置)
ipcMain.on('get-default-vlist-content', (event) => {
  try {
    if (fs.existsSync(defaultVlistPath)) {
      const content = fs.readFileSync(defaultVlistPath, 'utf-8');
      event.sender.send('default-vlist-content', content);
    } else {
      event.sender.send('default-vlist-content', JSON.stringify({ list: [], platformlist: [] }, null, 2));
    }
  } catch (error) {
    console.error('Failed to read default vlist.json:', error);
    event.sender.send('vlist-save-error', '无法读取默认配置: ' + error.message);
  }
});

// 保存 vlist.json 内容到用户数据目录（可写目录）
ipcMain.on('save-vlist-content', (event, content) => {
  try {
    // 验证 JSON 格式
    const parsed = JSON.parse(content);

    // 确保用户数据目录存在
    const userDataDir = app.getPath('userData');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    // 保存到用户数据目录
    console.log('[main] 保存配置到用户数据目录:', userVlistPath);
    fs.writeFileSync(userVlistPath, content, 'utf-8');

    // 更新内存中的数据
    vlistData = parsed;
    vlistJsonContent = content;

    event.sender.send('vlist-save-success');
  } catch (error) {
    console.error('Failed to save vlist.json:', error);
    event.sender.send('vlist-save-error', error.message);
  }
});
