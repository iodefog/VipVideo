const { app, BrowserWindow, ipcMain, Menu, Tray, screen, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs'); // 引入 fs 模块，用于读取 vlist.json 文件
const { openVipWindow } = require('./vipWindow');

// 简单的历史记录存储
const historyFile = path.join(app.getPath('userData'), 'history.json');
let historyData = [];

// vlist.json 文件路径
const vlistPath = path.join(__dirname, 'vlist.json');

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

// 保存历史记录
function saveHistory() {
  try {
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
  } catch (error) {
    console.warn('Failed to save history:', error);
  }
}

let mainWindow;
let tray;

// 放宽自动播放策略（命令行级别，尽量贴近 Chrome 行为）
try {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
  app.commandLine.appendSwitch('disable-site-isolation-trials')
} catch (_) {}

// 读取 vlist.json 文件
function readVlistData() {
  try {
    if (fs.existsSync(vlistPath)) {
      const data = fs.readFileSync(vlistPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to read vlist.json:', error);
  }
  return null;
}

let vlistData = readVlistData();
let vlistJsonContent = '';
// 读取原始 JSON 内容（保留格式）
try {
  if (fs.existsSync(vlistPath)) {
    vlistJsonContent = fs.readFileSync(vlistPath, 'utf-8');
  }
} catch (error) {
  console.error('Failed to read vlist.json content:', error);
  vlistJsonContent = JSON.stringify({ list: [], platformlist: [] }, null, 2);
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

  mainWindow.on('close', function (event) {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
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
      mainWindow.setAlwaysOnTop(true); // 设置窗口置顶
      mainWindow.show(); // 显示窗口
      mainWindow.focus(); // 确保窗口获得焦点
      mainWindow.setAlwaysOnTop(false); // 取消置顶（可选，根据需求）
    } else {
      createWindow();
    }
  });

  // 防止 macOS 弹出“音乐播放样式”
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(false);
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

// 监听渲染进程发来的 create-new-window 消息
ipcMain.on('create-new-window', (event, newPageUrl) => {
  console.log('[main] Creating new window for URL:', newPageUrl);

  // 创建一个新的 BrowserWindow
  const newWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // 根据需求设置
      contextIsolation: true, // 根据需求设置
      preload: path.join(__dirname, 'child_preload.js')
    },
  });

  // 加载新窗口的 URL
  newWindow.loadURL(newPageUrl);

  // 可选：监听新窗口关闭事件
  newWindow.on('closed', () => {
    console.log('New window closed');
  });
});

// 确保loadHistory()函数在应用启动时被调用
function initializeApp() {
  console.log('[main] 初始化应用...');
  loadHistory();
  
  app.on('applicationSupportsSecureRestorableState', () => true); // 启用安全的可恢复状态
  createWindow();
  createTray(); // 创建任务栏图标

  // 为网易云音乐等域名补齐必要请求头（Referer/Origin），避免播放接口校验失败
  try {
    const s = session.fromPartition('persist:netease');
    const preflightHeadersMap = new Map();
    const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
    s.webRequest.onBeforeSendHeaders((details, callback) => {
      const url = details.url || '';
      const headers = details.requestHeaders || {};
      const needs163 = /https?:\/\/([^\/]*\.)?music\.163\.com\//i.test(url) || /https?:\/\/([^\/]*\.)?126\.net\//i.test(url);
      if (needs163 && details.method === 'OPTIONS') {
        const acrh = headers['Access-Control-Request-Headers'] || headers['access-control-request-headers'];
        const key = url.split('?')[0];
        if (acrh && key) preflightHeadersMap.set(key, String(acrh));
      }
      if (needs163) {
        headers['Referer'] = 'https://music.163.com/';
        headers['Origin'] = 'https://music.163.com';
        headers['swimlane'] = '51453-ckqqw'
        // 伪装为 Safari，贴近 macOS Safari 行为
        headers['User-Agent'] = SAFARI_UA;
        // 一些资源需要 Range 支持，保持原有 Range
      }
      callback({ requestHeaders: headers });
    });

    // 放宽部分跨域头，减少媒体请求受限（谨慎，仅针对网易云相关域名）
    s.webRequest.onHeadersReceived((details, callback) => {
      const url = details.url || '';
      if (/https?:\/\/([^\/]*\.)?music\.163\.com\//i.test(url) || /https?:\/\/([^\/]*\.)?126\.net\//i.test(url)) {
        const responseHeaders = details.responseHeaders || {};
        // 不能使用 *，需要与请求的 Origin 一致，这里固定为网易云主站
        responseHeaders['access-control-allow-origin'] = ['https://music.163.com'];
        responseHeaders['access-control-allow-credentials'] = ['true'];
        // 动态镜像客户端声明的预检请求头
        const key = url.split('?')[0];
        const requestedHeaders = preflightHeadersMap.get(key);
        if (requestedHeaders) {
          responseHeaders['access-control-allow-headers'] = [requestedHeaders];
          preflightHeadersMap.delete(key);
        } else {
          responseHeaders['access-control-allow-headers'] = [
            'nm-gcore-status, content-type, x-requested-with, authorization, origin, accept, referer, user-agent, cookie, sec-fetch-mode, sec-fetch-site, sec-fetch-dest'
          ];
        }
        responseHeaders['access-control-allow-methods'] = ['GET,POST,OPTIONS,HEAD'];
        // 添加 Vary 头避免缓存问题
        const vary = responseHeaders['vary'] || responseHeaders['Vary'] || [];
        const varySet = new Set((Array.isArray(vary) ? vary : [vary]).flatMap(v => String(v || '').split(',').map(s => s.trim()).filter(Boolean)));
        ['Origin','Access-Control-Request-Headers','Access-Control-Request-Method'].forEach(h => varySet.add(h));
        responseHeaders['Vary'] = [Array.from(varySet).join(', ')];
        return callback({ responseHeaders });
      }
      callback({ responseHeaders: details.responseHeaders });
    });
  } catch (e) {
    console.warn('[main] set 163 headers failed:', e);
  }

  // 自动允许网易云相关权限（autoplay / EME），避免点击播放被拦截
  try {
    const s = session.defaultSession;
    s.setPermissionRequestHandler((wc, permission, callback, details) => {
      const url = (details && details.requestingUrl) || (wc && wc.getURL && wc.getURL()) || '';
      const is163 = /https?:\/\/([^\/]*\.)?music\.163\.com\//i.test(url) || /https?:\/\/([^\/]*\.)?126\.net\//i.test(url);
      if (is163 && (permission === 'autoplay' || permission === 'mediaKeySystem')) {
        return callback(true);
      }
      // 默认行为
      callback(false);
    });
  } catch (e) {
    console.warn('[main] setPermissionRequestHandler failed:', e);
  }

  // 拦截所有 webview 的 window.open，统一用自定义尺寸创建窗口
  app.on('web-contents-created', (event, contents) => {
    try {
      if (contents.getType && contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
          try {
            console.log('[main] setWindowOpenHandler URL:', url);
            openVipWindow(url, vlistData, { width: 1200, height: 800 });
          } catch (e) {
            console.error('[main] create child window failed:', e);
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

// 保存 vlist.json 内容
ipcMain.on('save-vlist-content', (event, content) => {
  try {
    // 验证 JSON 格式
    const parsed = JSON.parse(content);
    // 保存到文件
    fs.writeFileSync(vlistPath, content, 'utf-8');
    // 更新内存中的数据
    vlistData = parsed;
    vlistJsonContent = content;
    event.sender.send('vlist-save-success');
  } catch (error) {
    console.error('Failed to save vlist.json:', error);
    event.sender.send('vlist-save-error', error.message);
  }
});
