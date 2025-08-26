const { ipcRenderer } = require('electron');
console.log('[renderer] start');

let vlistData;
// 添加一个变量来控制是否允许显示返回按钮
let allowShowBackButton = true;

try {
  vlistData = require('./vlist.json');
  console.log('vlistData loaded:', vlistData);
  // 暴露给新开的窗口通过 window.opener.vlistData 访问
  try { window.vlistData = vlistData; } catch (_) {}
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

// 配置 webview（注意：useragent/allowpopups 需在 index.html 中静态设置才会生效）
if (webview) {
  webview.setAttribute('webpreferences', 'contextIsolation=no, nodeIntegration=yes');
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
  console.log('did-navigate');
  allowShowBackButton = true;
  updateBackButton();
});

webview.addEventListener('did-navigate-in-page', () => {
  console.log('did-navigate-in-page');
  allowShowBackButton = true;
  updateBackButton();
});

// 添加手势支持
let touchStartX = 0;
let touchEndX = 0;

webview.addEventListener('touchstart', (e) => {
  console.log('touchstart');
  touchStartX = e.touches[0].clientX;
});

webview.addEventListener('touchend', (e) => {
  console.log('touchend');
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
  console.log('Load failed:', event.errorCode, event.errorDescription);
  // -3 是 ERR_ABORTED，通常是正常跳转中断，不要自动 reload 以免闪烁
});

webview.addEventListener('did-finish-load', () => {
  console.log('Page loaded successfully');
  updateBackButton();
});

webview.addEventListener('dom-ready', () => {
  console.log('dom-ready');
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
  console.log('[renderer] new-window:', event.url);
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


// ----------------------
// 可拖动的解析按钮与弹出列表
// ----------------------
try {
  // 记录原始内容页 URL，避免解析器之间相互嵌套导致地址错误
  let lastOriginalUrl = '';
  const parserPrefixes = Array.isArray(vlistData?.list)
    ? vlistData.list.map(i => i.url).filter(Boolean)
    : [];

  function isParserUrl(u) {
    if (!u) return false;
    return parserPrefixes.some(prefix => typeof prefix === 'string' && prefix.length > 0 && u.startsWith(prefix));
  }

  function extractOriginalFromParsed(u) {
    try {
      const parsed = new URL(u);
      // 优先返回看起来像 URL 的参数值
      for (const [key, value] of parsed.searchParams.entries()) {
        try {
          const maybe = decodeURIComponent(value || '');
          if (maybe.startsWith('http://') || maybe.startsWith('https://')) {
            return maybe;
          }
        } catch (_) {}
      }
      // 兜底：取第一个参数值
      const first = [...parsed.searchParams.values()][0];
      if (first) {
        try {
          const dec = decodeURIComponent(first);
          return dec;
        } catch (_) {
          return first;
        }
      }
    } catch (_) {}
    return u;
  }

  function updateLastOriginalFromWebview() {
    try {
      const current = typeof webview.getURL === 'function' ? webview.getURL() : webview?.src;
      if (!current) return;
      if (isParserUrl(current)) {
        const orig = extractOriginalFromParsed(current);
        if (orig) lastOriginalUrl = orig;
      } else {
        lastOriginalUrl = current;
      }
    } catch (e) {
      // 忽略
    }
  }

  // 初次与每次导航后更新原始 URL
  if (webview) {
    updateLastOriginalFromWebview();
    webview.addEventListener('did-navigate', updateLastOriginalFromWebview);
    webview.addEventListener('did-navigate-in-page', updateLastOriginalFromWebview);
    webview.addEventListener('did-finish-load', updateLastOriginalFromWebview);
  }

  // 创建样式
  const vipStyle = document.createElement('style');
  vipStyle.textContent = `
    #vip-drag-btn {
      position: fixed;
      top: 70px;
      right: 30px;
      z-index: 2000;
      width: 44px;
      height: 44px;
      border-radius: 22px;
      background: #ff4d4f;
      color: #fff;
      border: none;
      cursor: move;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      user-select: none;
    }
    #vip-drag-btn:hover {
      background: #f5222d;
    }
    #vip-popover {
      position: fixed;
      top: 120px;
      right: 20px;
      z-index: 2000;
      width: 160px;
      max-height: 360px;
      overflow: auto;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.2);
      padding: 8px 0;
      display: none;
    }
    .vip-item {
      padding: 6px 10px;
      cursor: pointer;
      font-size: 10px;
      width: 150px;
      color: #333;
      white-space: normal; 
      word-wrap: break-word; 
      overflow: visible; 
      border-bottom: 1px solid #eee;
    }
    .vip-item:hover {
      background: #f5f5f5;
    }
    .vip-divider {
      margin: 6px 0;
      height: 1px;
      background: #eee;
    }
  `;
  document.head.appendChild(vipStyle);

  // 创建可拖动按钮
  const dragBtn = document.createElement('button');
  dragBtn.id = 'vip-drag-btn';
  dragBtn.title = '解析列表';
  dragBtn.textContent = 'VIP';
  document.body.appendChild(dragBtn);

  // 创建弹出层
  const pop = document.createElement('div');
  pop.id = 'vip-popover';
  document.body.appendChild(pop);

  // 渲染列表
  function renderVipList() {
    if (!vlistData || !Array.isArray(vlistData.list)) return;
    const frag = document.createDocumentFragment();

    vlistData.list.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'vip-item';
      el.textContent = item.name || `解析${index+1}`;
      el.addEventListener('click', () => {
        try {
          // 实时获取当前 webview 页地址；若当前已是解析页，则抽取其原始地址
          const nowUrl = (typeof webview.getURL === 'function' ? webview.getURL() : webview.src) || '';
          const baseUrl = isParserUrl(nowUrl) ? extractOriginalFromParsed(nowUrl) : nowUrl;
          const parser = item.url || '';
          const target = parser ? `${parser}${baseUrl}` : baseUrl;
          allowShowBackButton = false;
          backButton.style.display = 'none';
          loadURL(target, item.name || '解析');
        } catch (e) {
          console.error('Compose/Load VIP URL failed:', e);
        } finally {
          pop.style.display = 'none';
        }
      });
      frag.appendChild(el);
      if (index === 0) {
        const div = document.createElement('div');
        div.className = 'vip-divider';
        frag.appendChild(div);
      }
    });

    pop.innerHTML = '';
    pop.appendChild(frag);
  }

  renderVipList();

  // 切换弹出层显示
  dragBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const curr = (typeof getComputedStyle === 'function') ? getComputedStyle(pop).display : pop.style.display;
    if (curr === 'none') {
      renderVipList();
      pop.style.display = 'block';
    } else {
      pop.style.display = 'none';
    }
  });

  // 点击外部关闭
  document.addEventListener('click', (e) => {
    if (pop.style.display === 'block') {
      if (e.target !== pop && e.target !== dragBtn && !pop.contains(e.target)) {
        pop.style.display = 'none';
      }
    }
  });

  // 拖拽实现：需按住一定时间再拖动
  let isDragging = false;
  let dragHoldTimer = null;
  const dragHoldDelayMs = 180; // 按住阈值
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function pxToNumber(value) {
    const n = parseFloat(value || '0');
    return Number.isNaN(n) ? 0 : n;
  }

  dragBtn.addEventListener('mousedown', (e) => {
    // 延时触发拖动，避免误触
    startX = e.clientX;
    startY = e.clientY;
    const rect = dragBtn.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    dragHoldTimer = setTimeout(() => {
      isDragging = true;
      dragBtn.style.cursor = 'grabbing';
    }, dragHoldDelayMs);
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextLeft = Math.max(0, Math.min(window.innerWidth - dragBtn.offsetWidth, startLeft + dx));
    const nextTop = Math.max(0, Math.min(window.innerHeight - dragBtn.offsetHeight, startTop + dy));
    dragBtn.style.left = `${nextLeft}px`;
    dragBtn.style.top = `${nextTop}px`;
    dragBtn.style.right = 'auto';
  });

  window.addEventListener('mouseup', (e) => {
    clearTimeout(dragHoldTimer);
    dragHoldTimer = null;
    if (isDragging) {
      isDragging = false;
      dragBtn.style.cursor = 'move';
      // 同步弹出层位置到按钮旁边
      const rect = dragBtn.getBoundingClientRect();
      pop.style.top = `${rect.bottom + 6}px`;
      pop.style.left = `${Math.max(0, rect.left - (pop.offsetWidth - rect.width))}px`;
      pop.style.right = 'auto';
    }
  });

  // 若按住延时未到且发生点击，则维持原有点击行为（打开/关闭 pop）
} catch (e) {
  console.error('Init draggable VIP button failed:', e);
}
