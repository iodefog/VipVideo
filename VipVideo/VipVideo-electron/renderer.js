const { ipcRenderer } = require('electron');
const path = require('path');
console.log('[renderer] start');

let vlistData = null;
// 添加一个变量来控制是否允许显示返回按钮
let allowShowBackButton = true;

// 通过IPC从主进程获取vlist数据
ipcRenderer.on('vlist-data', (event, data) => {
  vlistData = data;
  console.log('vlistData received from main process:', vlistData);
  // 暴露给新开的窗口通过 window.opener.vlistData 访问
  try { window.vlistData = vlistData; } catch (_) {}
  
  // 如果已经加载了平台按钮容器，重新创建平台按钮
  const platformButtons = document.getElementById('platform-buttons');
  if (platformButtons && vlistData && vlistData.platformlist) {
    // 清空现有按钮
    platformButtons.innerHTML = '';
    // 重新创建平台按钮
    vlistData.platformlist.forEach(platform => {
      const button = createButton(platform);
      platformButtons.appendChild(button);
    });
    
    // 如果有平台数据，加载第一个平台
    if (vlistData.platformlist.length > 0) {
      const firstPlatform = vlistData.platformlist[0];
      console.log("Loading first platform:", firstPlatform);
      setTimeout(() => {
        loadURL(firstPlatform.url, firstPlatform.name);
      }, 100);
    }
  }
  
  // 重新渲染VIP解析列表
  try {
    renderVipList();
  } catch (e) {
    console.error('Failed to render VIP list:', e);
  }
});

// 请求vlist数据
ipcRenderer.send('get-vlist-data');

const webview = document.getElementById('webview');
const platformButtons = document.getElementById('platform-buttons');
const customButton = document.getElementById('custom-button');
const historyButton = document.getElementById('history-button');
const devtoolsButton = document.getElementById('devtools-button');

// 检查元素是否存在
if (!webview) console.error('Webview element not found');
if (!platformButtons) console.error('Platform buttons container not found');
if (!customButton) console.error('Custom button not found');
if (!historyButton) console.error('History button not found');
if (!devtoolsButton) console.error('DevTools button not found');

// 配置 webview（关键参数已在 index.html 静态设置）
if (webview) {
  try { webview.setAttribute('allow', 'autoplay; encrypted-media'); } catch (e) {}
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

// 修改 webview 导航事件监听，同时记录历史记录
webview.addEventListener('did-navigate', (event) => {
  console.log('did-navigate');
  allowShowBackButton = true;
  updateBackButton();
  
  // 记录内部导航到历史记录
  const url = event.url;
  if (url && url.startsWith('http')) {
    // 获取webview中页面的实际标题
    const webviewTitle = webview.getWebContents().getTitle() || 'Unknown Page';
    ipcRenderer.send('save-history', { 
      url, 
      title: webviewTitle
    });
  }
});

webview.addEventListener('did-navigate-in-page', (event) => {
  console.log('did-navigate-in-page');
  allowShowBackButton = true;
  updateBackButton();
  
  // 记录页面内导航到历史记录
  const url = event.url;
  if (url && url.startsWith('http')) {
    // 获取webview中页面的实际标题
    const webviewTitle = webview.getWebContents().getTitle() || 'Unknown Page';
    ipcRenderer.send('save-history', { 
      url, 
      title: webviewTitle
    });
  }
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
    // 保留allowShowBackButton的当前值，不总是重置为false
    if (backButton) {
      backButton.style.display = allowShowBackButton ? 'block' : 'none';
    }
    
    console.log('[renderer] 准备加载URL:', url);
    console.log('[renderer] 当前allowShowBackButton状态:', allowShowBackButton);
    
    // 加载URL并添加错误处理
    webview.loadURL(url).then(() => {
      console.log('[renderer] URL加载成功:', url);
    }).catch(err => {
      console.error('[renderer] Failed to load URL:', err);
      console.error('[renderer] Error details:', err.code, err.errno);
    });
    
    if (title) {
      document.title = title;
    }
    
    // 只有当URL不是history.html时才保存历史记录，避免重复保存
    if (!url.includes('history.html')) {
      // 获取webview中页面的实际标题，如果参数中没有提供
      const webviewTitle = title || webview.getWebContents().getTitle() || 'Unknown Page';
      console.log('[renderer] 保存历史记录:', { url, title: webviewTitle });
      ipcRenderer.send('save-history', { url, title: webviewTitle });
    }
  } catch (error) {
    console.error('[renderer] Error loading URL:', error);
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

// 创建可重用的滚动函数
function scrollPlatformButtons(direction) {
  const platformButtons = document.getElementById('platform-buttons');
  const beforeButton = document.getElementById('before-button');
  
  if (platformButtons) {
    // 设置每次滚动的距离
    const scrollAmount = 200;
    // 计算滚动方向（正值向右，负值向左）
    const scrollDirection = direction === 'right' ? 1 : -1;
    
    platformButtons.scrollTo({
      left: platformButtons.scrollLeft + (scrollAmount * scrollDirection),
      behavior: 'smooth'
    });
    
    // 滚动后立即更新按钮显示状态
    updateScrollButtonVisibility();
    
    console.log(`平台按钮向${direction === 'right' ? '右' : '左'}滚动`);
  }
}

// 更新滚动按钮的显示状态
function updateScrollButtonVisibility() {
  const platformButtons = document.getElementById('platform-buttons');
  const beforeButton = document.getElementById('before-button');
  
  if (platformButtons && beforeButton) {
    // 当scrollLeft > 10时显示before-button（有一个小的阈值防止抖动）
    if (platformButtons.scrollLeft > 10) {
      beforeButton.style.display = 'flex';
    } else {
      beforeButton.style.display = 'none';
    }
  }
}

// 为向右滚动按钮添加事件监听
document.getElementById('more-button').addEventListener('click', () => {
  scrollPlatformButtons('right');
});

// 为向左滚动按钮添加事件监听（注意ID改为before-button）
document.getElementById('before-button').addEventListener('click', () => {
  scrollPlatformButtons('left');
});

// 添加滚动事件监听器来动态更新按钮显示状态
if (platformButtons) {
  platformButtons.addEventListener('scroll', updateScrollButtonVisibility);
  // 初始加载时检查一次
  updateScrollButtonVisibility();
}

// 初始化平台按钮的逻辑已经移到vlist-data事件监听器中
// 确保只在收到数据后才创建平台按钮

// 创建编辑弹框样式
const createEditDialogStyle = () => {
  const style = document.createElement('style');
  style.textContent = `
    #edit-dialog {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 800px;
      height: 600px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 2000;
      flex-direction: column;
    }
    #edit-dialog-header {
      padding: 15px;
      background: #f0f0f0;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 8px 8px 0 0;
    }
    #edit-dialog-title {
      font-size: 16px;
      font-weight: bold;
    }
    #edit-dialog-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #666;
    }
    #edit-dialog-content {
      flex: 1;
      padding: 15px;
      overflow: auto;
    }
    #vlist-textarea {
      width: 100%;
      height: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 10px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      resize: none;
    }
    #edit-dialog-footer {
      padding: 15px;
      background: #f0f0f0;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      border-radius: 0 0 8px 8px;
    }
    #edit-dialog-save, #edit-dialog-cancel {
      padding: 8px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    #edit-dialog-save {
      background: #1890ff;
      color: white;
    }
    #edit-dialog-save:hover {
      background: #40a9ff;
    }
    #edit-dialog-cancel {
      background: #f5f5f5;
      color: #333;
    }
    #edit-dialog-cancel:hover {
      background: #e6e6e6;
    }
    #dialog-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1999;
    }
    #error-message {
      color: #ff4d4f;
      margin-top: 10px;
      font-size: 12px;
    }
  `;
  document.head.appendChild(style);
};

// 创建编辑弹框
const createEditDialog = () => {
  const overlay = document.createElement('div');
  overlay.id = 'dialog-overlay';
  document.body.appendChild(overlay);

  const dialog = document.createElement('div');
  dialog.id = 'edit-dialog';
  dialog.style.display = 'none';

  const header = document.createElement('div');
  header.id = 'edit-dialog-header';
  header.innerHTML = `
    <div id="edit-dialog-title">编辑 vlist.json</div>
    <button id="edit-dialog-close">×</button>
  `;

  const content = document.createElement('div');
  content.id = 'edit-dialog-content';
  content.innerHTML = `
    <textarea id="vlist-textarea"></textarea>
    <div id="error-message"></div>
  `;

  const footer = document.createElement('div');
  footer.id = 'edit-dialog-footer';
  footer.innerHTML = `
    <button id="edit-dialog-cancel">取消</button>
    <button id="edit-dialog-save">保存</button>
  `;

  dialog.appendChild(header);
  dialog.appendChild(content);
  dialog.appendChild(footer);
  document.body.appendChild(dialog);

  // 添加事件监听
  document.getElementById('edit-dialog-close').addEventListener('click', closeEditDialog);
  document.getElementById('edit-dialog-cancel').addEventListener('click', closeEditDialog);
  document.getElementById('edit-dialog-save').addEventListener('click', saveVlistContent);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEditDialog();
  });
};

// 打开编辑弹框
const openEditDialog = () => {
  document.getElementById('dialog-overlay').style.display = 'block';
  document.getElementById('edit-dialog').style.display = 'flex';
  document.getElementById('error-message').textContent = '';
  
  // 请求 vlist.json 内容
  ipcRenderer.send('get-vlist-content');
};

// 关闭编辑弹框
const closeEditDialog = () => {
  document.getElementById('dialog-overlay').style.display = 'none';
  document.getElementById('edit-dialog').style.display = 'none';
};

// 保存 vlist.json 内容
const saveVlistContent = () => {
  const textarea = document.getElementById('vlist-textarea');
  const content = textarea.value;
  const errorElement = document.getElementById('error-message');
  
  try {
    // 先在前端验证 JSON 格式
    JSON.parse(content);
    errorElement.textContent = '';
    // 发送到主进程保存
    ipcRenderer.send('save-vlist-content', content);
  } catch (error) {
    errorElement.textContent = 'JSON 格式错误: ' + error.message;
  }
};

// 初始化编辑弹框
createEditDialogStyle();
createEditDialog();

// 创建密码输入模态框样式
function createPasswordModalStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .password-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    .password-modal-content {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      width: 300px;
      text-align: center;
    }
    .password-modal-content h3 {
      margin-top: 0;
      margin-bottom: 15px;
    }
    .password-modal-content p {
      font-size: 12px;
      color: #666666;
      margin-bottom: 15px;
    }
    .password-modal-content input {
      width: 100%;
      padding: 8px;
      margin-bottom: 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
    }
    .password-modal-buttons {
      display: flex;
      justify-content: space-between;
    }
    .password-modal-buttons button {
      padding: 8px 15px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .password-modal-buttons button:first-child {
      background-color: #f0f0f0;
    }
    .password-modal-buttons button:last-child {
      background-color: #4CAF50;
      color: white;
    }
  `;
  document.head.appendChild(style);
}

// 创建并显示密码输入模态框
function showPasswordModal() {
  return new Promise((resolve) => {
    // 创建模态框元素
    const modal = document.createElement('div');
    modal.className = 'password-modal';
    modal.innerHTML = `
      <div class="password-modal-content">
        <h3>请输入密码</h3>
        <p>密码格式：6-10位数字，默认密码：VipVideo</p>
        <input type="password" id="password-input" placeholder="请输入密码">
        <div class="password-modal-buttons">
          <button id="cancel-button">取消</button>
          <button id="confirm-button">确认</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const passwordInput = document.getElementById('password-input');
    const cancelButton = document.getElementById('cancel-button');
    const confirmButton = document.getElementById('confirm-button');
    
    // 自动聚焦到密码输入框
    passwordInput.focus();
    
    // 确认按钮事件
    confirmButton.addEventListener('click', () => {
      const password = passwordInput.value;
      document.body.removeChild(modal);
      resolve(password);
    });
    
    // 取消按钮事件
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(modal);
      resolve(null);
    });
    
    // 按回车键确认
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmButton.click();
      }
    });
    
    // 按ESC键取消
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cancelButton.click();
      }
    });
  });
}

// 验证密码函数
async function verifyPassword() {
  const defaultPassword = 'VipVideo';
  
  // 确保样式已创建
  if (!document.querySelector('style[textContent*="password-modal"]')) {
    createPasswordModalStyle();
  }
  
  // 显示密码输入模态框
  const password = await showPasswordModal();
  
  // 检查密码是否存在且符合要求
  if (!password) {
    return false; // 用户取消输入
  }
  
  // 验证密码格式：6-10位数字，或者是默认密码
  if (password === defaultPassword || /^\d{6,10}$/.test(password)) {
    return true;
  } else {
    alert('密码格式不正确，请输入6-10位数字，或者使用默认密码。');
    return false;
  }
}

// 自定义按钮事件
customButton.addEventListener('click', async () => {
  // 验证密码，通过后才打开编辑对话框
  const isVerified = await verifyPassword();
  if (isVerified) {
    openEditDialog();
  }
});

// 监听 vlist 内容响应
ipcRenderer.on('vlist-content', (event, content) => {
  const textarea = document.getElementById('vlist-textarea');
  textarea.value = content;
});

// 监听保存成功响应
ipcRenderer.on('vlist-save-success', () => {
  alert('保存成功！请重启应用以应用更改。');
  closeEditDialog();
});

// 监听保存错误响应
ipcRenderer.on('vlist-save-error', (event, message) => {
  document.getElementById('error-message').textContent = '保存失败: ' + message;
});



// 历史记录按钮事件
historyButton.addEventListener('click', () => {
  // 使用IPC通知主进程打开历史记录窗口
  console.log('[renderer] 点击历史记录按钮，请求打开历史记录窗口');
  ipcRenderer.send('open-history-window');
});

// DevTools 按钮事件（切换 webview 的 DevTools）
if (devtoolsButton) {
  devtoolsButton.addEventListener('click', () => {
    try {
      if (webview.isDevToolsOpened()) webview.closeDevTools();
      else webview.openDevTools();
    } catch (e) { console.error('toggle devtools failed', e); }
  });
}

// 绑定快捷键：Cmd/Ctrl+Shift+I 或 F12 打开 webview DevTools
document.addEventListener('keydown', (e) => {
  const isToggle = ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') || e.key === 'F12';
  if (isToggle) {
    e.preventDefault();
    try {
      if (webview.isDevToolsOpened()) webview.closeDevTools();
      else webview.openDevTools();
    } catch (err) { console.error('hotkey toggle devtools failed', err); }
  }
});
// 历史记录按钮事件已在前面实现



// 监听来自历史记录页面的URL加载请求
ipcRenderer.on('load-url-from-history', (event, data) => {
  const { url, title } = data;
  loadURL(url, title);
});

// 监听返回按钮事件
ipcRenderer.on('go-back', () => {
  // 返回主页面
  const indexFilePath = path.join(__dirname, 'index.html');
  loadURL(`file://${indexFilePath}`, 'VipVideo');
});
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
  // 对网易云音乐启用媒体权限
  try {
    webview.setAudioMuted(false);
  } catch (e) {}
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
