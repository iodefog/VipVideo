const { app, BrowserWindow, ipcMain, Menu, Tray, screen } = require('electron');
const path = require('path');
const fs = require('fs'); // 引入 fs 模块，用于读取 vlist.json 文件

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
let tray;
let mainWindowDisplayMode = 'normal';
const INACTIVE_WINDOW_OPACITY = 0.62;

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
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
  app.commandLine.appendSwitch('disable-site-isolation-trials')
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

function createWindow() {
  console.log('createWindow');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      webviewTag: true,
      autoplayPolicy: 'no-user-gesture-required', // 允许自动播放
      webSecurity: false, // 禁用web安全策略
      nodeIntegration: true, // 启用Node集成
      contextIsolation: false // 禁用上下文隔离
    }
  });

  mainWindow.loadFile('index.html');
  configureMainWindowDisplayMode();

  mainWindow.on('close', function (event) {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('load-url-in-current-window', newPageUrl);
  }
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
  loadHistory();

  app.on('applicationSupportsSecureRestorableState', () => true); // 启用安全的可恢复状态
  createWindow();
  createTray(); // 创建任务栏图标

  // 拦截所有 webview 的 window.open，始终复用主播放窗口。
  app.on('web-contents-created', (event, contents) => {
    try {
      if (contents.getType && contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
          try {
            console.log('[main] 拦截新窗口请求，在当前窗口加载 URL:', url);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('load-url-in-current-window', url);
            }
          } catch (e) {
            console.error('[main] 在当前窗口加载链接失败:', e);
          }
          return { action: 'deny' };
        });
      }
    } catch (e) {
      console.warn('[main] web-contents-created hook error:', e);
    }
  });
}

// 合并app.whenReady()调用，确保只执行一次
app.whenReady().then(() => {
  initializeApp();
});

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
