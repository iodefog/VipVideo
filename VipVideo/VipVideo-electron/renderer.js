const { ipcRenderer } = require('electron');

let vlistData;
// 添加一个变量来控制是否允许显示返回按钮
let allowShowBackButton = true;

try {
  vlistData = require('./vlist.json');
  console.log('vlistData loaded:', vlistData);
} catch (error) {
  console.error('Error loading vlist.json:', error);
}

const webview = document.getElementById('webview');
const platformButtons = document.getElementById('platform-buttons');
const customButton = document.getElementById('custom-button');
const historyButton = document.getElementById('history-button');

// 检查元素是否存在
if (!webview) console.error('Webview element not found');
if (!platformButtons) console.error('Platform buttons container not found');
if (!customButton) console.error('Custom button not found');
if (!historyButton) console.error('History button not found');

// 配置 webview
if (webview) {
  webview.setAttribute('webpreferences', 'contextIsolation=no, nodeIntegration=yes');
  webview.setAttribute('allowpopups', 'true');  // 允许弹出新窗口
  webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
}

// 创建回退按钮
const backButton = document.createElement('button');
backButton.id = 'back-button';
backButton.innerHTML = '←';
backButton.style.display = 'none';
document.body.appendChild(backButton);

// 添加回退按钮样式
const style = document.createElement('style');
style.textContent = `
  #back-button {
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 20px;
    cursor: pointer;
    transition: opacity 0.3s;
    display: none;
  }
  #back-button:hover {
    background: rgba(0, 0, 0, 0.7);
  }
`;
document.head.appendChild(style);

// 回退按钮功能
backButton.addEventListener('click', () => {
  if (webview.canGoBack()) {
    webview.goBack();
  }
});

// 更新返回按钮显示状态
function updateBackButton() {
  if (!allowShowBackButton) {
    backButton.style.display = 'none';
    return;
  }
  const canGoBack = webview.canGoBack();
  backButton.style.display = canGoBack ? 'block' : 'none';
}

// 修改 webview 导航事件监听
webview.addEventListener('did-navigate', () => {
  allowShowBackButton = true;
  updateBackButton();
});

webview.addEventListener('did-navigate-in-page', () => {
  allowShowBackButton = true;
  updateBackButton();
});

// 添加手势支持
let touchStartX = 0;
let touchEndX = 0;

webview.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
});

webview.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].clientX;
  const swipeDistance = touchEndX - touchStartX;
  
  if (swipeDistance > 50 && webview.canGoBack()) {
    webview.goBack();
  }
});

// 修改 loadURL 函数
function loadURL(url, title) {
  console.log("lihongli02, loadURL", url)

  if (!webview) {
    console.error('Webview not available');
    return;
  }
  try {
    allowShowBackButton = false;
    backButton.style.display = 'none';
    webview.loadURL(url).catch(err => {
      console.error('Failed to load URL:', err);
    });
    if (title) {
      document.title = title;
    }
    ipcRenderer.send('save-history', url);
  } catch (error) {
    console.error('Error loading URL:', error);
  }
}


// 创建平台按钮
function createButton(platform) {
  const button = document.createElement('button');
  button.textContent = platform.name;
  button.classList.add('platform-button');
  button.addEventListener('click', () => {
    allowShowBackButton = false;
    backButton.style.display = 'none';
    loadURL(platform.url, platform.name);
  });
  return button;
}

// 初始化平台按钮
if (vlistData && vlistData.platformlist && platformButtons) {
  console.log('Creating platform buttons');
  
  // 先创建所有按钮
  const createAllButtons = () => {
    vlistData.platformlist.forEach(platform => {
      const button = createButton(platform);
      platformButtons.appendChild(button);
    });
    console.log('Platform buttons created:', platformButtons.children.length);
  };

  // 然后加载第一个平台
  const loadFirstPlatform = () => {
    if (vlistData.platformlist.length > 0) {
      const firstPlatform = vlistData.platformlist[0];
      console.log("Loading first platform:", firstPlatform);
      // 使用 setTimeout 确保按钮渲染完成后再加载 URL
      setTimeout(() => {
        loadURL(firstPlatform.url, firstPlatform.name);
      }, 100);
    }
  };

  // 按顺序执行
  createAllButtons();
  loadFirstPlatform();
} else {
  console.error('Unable to create platform buttons');
}

// 自定义按钮事件
customButton.addEventListener('click', () => {
  const url = prompt('请输入要访问的URL：');
  if (url) {
    allowShowBackButton = false;
    backButton.style.display = 'none';
    loadURL(url, '自定义页面');
  }
});

// 历史记录按钮事件
historyButton.addEventListener('click', () => {
  allowShowBackButton = false;
  backButton.style.display = 'none';
  ipcRenderer.send('get-history');
});

// 处理历史记录显示
ipcRenderer.on('history', (event, history) => {
  const historyHTML = `
    <!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>操作记录</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
            background-color: #f5f5f5;
          }
          h1 { 
            color: #333; 
            margin-bottom: 20px;
          }
          ul { 
            list-style-type: none; 
            padding: 0; 
            margin: 0;
          }
          li { 
            margin-bottom: 10px; 
            cursor: pointer; 
            color: #0066cc;
            padding: 8px;
            background-color: white;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          li:hover { 
            background-color: #f0f7ff;
          }
        </style>
      </head>
      <body>
        <h1>操作记录</h1>
        <ul>
          ${history.map(url => `<li onclick="window.parent.loadURL('${url}', '历史记录')">${url}</li>`).join('')}
        </ul>
      </body>
    </html>
  `;
  
  const blob = new Blob([historyHTML], { type: 'text/html; charset=utf-8' });
  webview.loadURL(URL.createObjectURL(blob));
  document.title = '操作记录';
});

// 设置全局加载函数
window.loadURL = loadURL;

// webview 事件监听
webview.addEventListener('did-fail-load', (event) => {
  console.log('Load failed:', event.errorDescription);
  if (event.errorCode === -3) {
    console.log('Retrying...');
    webview.reload();
  }
});

webview.addEventListener('did-finish-load', () => {
  console.log('Page loaded successfully');
  updateBackButton();
});

webview.addEventListener('dom-ready', () => {
  // 可以在这里注入自定义样式或脚本
  webview.insertCSS(`
    * {
      user-select: auto !important;
      -webkit-user-select: auto !important;
    }
  `);
});

let urlStack = [];

// 只添加 new-window 事件处理
webview.addEventListener('new-window', (event) => {
  event.preventDefault();

  const newPageUrl = event.url; // 获取新窗口的跳链
  console.log('New window URL:', newPageUrl);

  // 通过 ipcRenderer 通知主进程创建新窗口
  ipcRenderer.send('create-new-window', newPageUrl);
});

// 添加返回功能
function goBack() {
  if (urlStack.length > 0) {
    const previousUrl = urlStack.pop();
    webview.loadURL(previousUrl);
  }
}

// 在你的 UI 中添加一个返回按钮，点击时调用 goBack 函数

