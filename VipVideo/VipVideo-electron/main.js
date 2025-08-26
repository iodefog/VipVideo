const { app, BrowserWindow, ipcMain, Menu, Tray, screen } = require('electron');
const path = require('path');
const fs = require('fs'); // 引入 fs 模块，用于读取 vlist.json 文件
const Store = require('electron-store');
const { openVipWindow } = require('./vipWindow');

const store = new Store();
let mainWindow;
let tray;

// 读取 vlist.json 文件
const vlistPath = path.join(__dirname, 'vlist.json');
let vlistData = [];
if (fs.existsSync(vlistPath)) {
  vlistData = JSON.parse(fs.readFileSync(vlistPath, 'utf-8')).list || [];
}

function createWindow() {
  console.log('createWindow');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
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

app.whenReady().then(() => {
  app.on('applicationSupportsSecureRestorableState', () => true); // 启用安全的可恢复状态
  createWindow();
  createTray(); // 创建任务栏图标

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
});

app.on('ready', () => {
  app.applicationSupportsSecureRestorableState = () => true;
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

ipcMain.on('save-history', (event, url) => {
  let history = store.get('history', []);
  if (!Array.isArray(history)) {
    history = [];
  }
  history.unshift(url);
  history = history.slice(0, 10);
  store.set('history', history);
});

ipcMain.on('get-history', (event) => {
  event.reply('history', store.get('history', []));
});
