const { app, BrowserWindow, ipcMain, Menu, Tray, screen } = require('electron');
const path = require('path');
const fs = require('fs'); // 引入 fs 模块，用于读取 vlist.json 文件
const Store = require('electron-store');

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

  // 创建 VIP 子菜单
  const vipMenu = vlistData.map((item) => ({
    label: item.name,
    click: () => {
      // 获取当前 WebView 的 URL
      mainWindow.webContents.send('get-current-url', item.url);
    }
  }));

  // 创建任务栏菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'VIP',
      submenu: vipMenu // 添加 VIP 子菜单
    },
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

// 监听 WebView URL 拦截
ipcMain.on('current-url', (event, currentUrl) => {
  console.log("lihongli02", currentUrl, event);
    // 检查 URL 是否需要拦截
    if (currentUrl.includes('video')) {
      // 如果是视频页面，生成新的 URL
      const newUrl = `${currentUrl}`;
      mainWindow.loadURL(newUrl); // 使用 WebView 加载新 URL
    } else {
      // 如果是普通跳链，直接加载
      mainWindow.loadURL(currentUrl);
    }
});

// 监听渲染进程发来的 create-new-window 消息
ipcMain.on('create-new-window', (event, newPageUrl) => {
  console.log('Creating new window for URL:', newPageUrl);

  // 创建一个新的 BrowserWindow
  const newWindow = new BrowserWindow({
    width: 800, // 设置新窗口宽度
    height: 600, // 设置新窗口高度
    webPreferences: {
      nodeIntegration: false, // 根据需求设置
      contextIsolation: true, // 根据需求设置
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
