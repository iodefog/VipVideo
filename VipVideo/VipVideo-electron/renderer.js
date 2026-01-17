const { ipcRenderer, shell } = require('electron');
const path = require('path');
const packageJson = require('./package.json');
const appVersion = packageJson.version;
const updateUrl = 'https://pan.baidu.com/s/1wcpReZs2-UG71g1idPyPmA?pwd=nkye';
console.log('[renderer] start');

let vlistData = null;
// 添加一个变量来控制是否允许显示返回按钮
let allowShowBackButton = true;
// 当前选中的分类
// 当前选中的分类，从 localStorage 读取，默认为 'all'
let currentCategory = localStorage.getItem('lastSelectedCategory') || 'all';

// 分类列表，将从 vlistData 中加载
let categoryList = [
  { id: 'all', name: 'All' }
];

// 通过IPC从主进程获取vlist数据
ipcRenderer.on('vlist-data', (event, data) => {
  vlistData = data;
  console.log('vlistData received from main process:', vlistData);
  // 暴露给新开的窗口通过 window.opener.vlistData 访问
  try { window.vlistData = vlistData; } catch (_) { }

  // 更新分类列表
  if (vlistData && vlistData.categorylist) {
    categoryList = vlistData.categorylist;
    // 确保有 all 选项，如果没有则添加
    if (!categoryList.find(c => c.id === 'all')) {
      categoryList.unshift({ id: 'all', name: 'All' });
    }
  } else {
    // 默认分类
    categoryList = [
      { "id": "all", "name": "All" },
      { "id": "tv", "name": "电视" },
      { "id": "video", "name": "视频" },
      { "id": "music", "name": "音乐" },
      { "id": "novel", "name": "小说" },
      { "id": "comic", "name": "漫画" },
      { "id": "other", "name": "其他" }
    ];
  }

  // 更新筛选按钮当前显示的文字
  updateFilterButtonText();

  // 如果已经加载了平台按钮容器，重新创建平台按钮
  // 如果已经加载了平台按钮容器，重新创建平台按钮
  renderPlatformButtons();

  // 如果有平台数据且页面为空，加载上次访问的页面或第一个平台
  if (vlistData && vlistData.platformlist && vlistData.platformlist.length > 0) {
    const webview = document.getElementById('webview');
    // 只有当 webview src 为空或者 about:blank 时才自动加载
    if (webview && (!webview.src || webview.src === 'about:blank')) {
      const lastUrl = localStorage.getItem('lastUrl');
      if (lastUrl) {
        console.log("Loading last visited URL:", lastUrl);
        setTimeout(() => {
          loadURL(lastUrl);
        }, 100);
      } else {
        const firstPlatform = vlistData.platformlist[0];
        console.log("Loading first platform:", firstPlatform);
        setTimeout(() => {
          loadURL(firstPlatform.url, firstPlatform.name);
        }, 100);
      }
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
  try { webview.setAttribute('allow', 'autoplay; encrypted-media'); } catch (e) { }
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

// 监听页面标题更新
webview.addEventListener('page-title-updated', (event) => {
  // 更新主窗口标题，带上版本号
  document.title = `${event.title}`;
});

// 修改 webview 导航事件监听，同时记录历史记录
webview.addEventListener('did-navigate', (event) => {
  console.log('did-navigate', event.url);
  allowShowBackButton = true;
  updateBackButton();

  // 记录内部导航到历史记录
  const url = event.url;
  // 忽略无效协议和 history.html 自身
  if (url && (url.startsWith('http') || url.startsWith('https')) && !url.includes('history.html')) {
    // 延迟获取标题，确保页面 title 已更新
    setTimeout(() => {
      const webviewTitle = webview.getTitle() || 'Unknown Page';
      console.log('[renderer] did-navigate 保存历史记录:', { url, title: webviewTitle });
      ipcRenderer.send('save-history', {
        url,
        title: webviewTitle
      });
    }, 500);
  }
});

webview.addEventListener('did-navigate-in-page', (event) => {
  console.log('did-navigate-in-page', event.url);
  allowShowBackButton = true;
  updateBackButton();

  // 记录页面内导航到历史记录
  const url = event.url;
  if (url && (url.startsWith('http') || url.startsWith('https')) && !url.includes('history.html')) {
    // 延迟获取标题
    setTimeout(() => {
      const webviewTitle = webview.getTitle() || 'Unknown Page';
      console.log('[renderer] did-navigate-in-page 保存历史记录:', { url, title: webviewTitle });
      ipcRenderer.send('save-history', {
        url,
        title: webviewTitle
      });
    }, 500);
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

    // 保存最后访问的 URL
    localStorage.setItem('lastUrl', url);

    if (title) {
      document.title = `${title}`;
    } else {
      document.title = `VipVideo`;
    }

    // 只有当URL不是history.html时才保存历史记录，避免重复保存
    // 注意：这里不再保存历史记录，改为在 page-title-updated 或 did-navigate 事件中保存
    // 以确保记录的是最终加载的 URL 和标题
    /*
    if (!url.includes('history.html')) {
      // 获取webview中页面的实际标题，如果参数中没有提供
      const webviewTitle = title || webview.getWebContents().getTitle() || 'Unknown Page';
      console.log('[renderer] 保存历史记录:', { url, title: webviewTitle });
      ipcRenderer.send('save-history', { url, title: webviewTitle });
    }
    */
  } catch (error) {
    console.error('[renderer] Error loading URL:', error);
  }
}


// 渲染平台按钮
function renderPlatformButtons() {
  const platformButtons = document.getElementById('platform-buttons');
  if (!platformButtons || !vlistData || !vlistData.platformlist) return;

  // 清空现有按钮
  platformButtons.innerHTML = '';

  // 获取有效的分类ID集合
  const validCategoryIds = new Set(categoryList.map(c => c.id));

  // 筛选列表
  const list = vlistData.platformlist.filter(item => {
    if (currentCategory === 'all') return true;

    // 如果 item 没有 category 或者 category 不在定义的列表中，归为 'other'
    let itemCategory = item.category;
    if (!itemCategory || !validCategoryIds.has(itemCategory)) {
      itemCategory = 'other';
    }

    return itemCategory === currentCategory;
  });

  // 重新创建按钮
  list.forEach(platform => {
    const button = createButton(platform);
    platformButtons.appendChild(button);
  });

  // 更新滚动按钮状态
  updateScrollButtonVisibility();
}

// 创建平台按钮
function createButton(platform) {
  const button = document.createElement('button');
  button.textContent = platform.name;
  button.classList.add('platform-button');
  button.addEventListener('click', () => {
    allowShowBackButton = false;
    backButton.style.display = 'none';
    // 传递 canvip 参数
    const canVip = platform.canvip === 1; // 确保是布尔值或数字1
    // 需要通知主进程该窗口是否支持VIP功能，以便控制VIP按钮显示
    // 目前 loadURL 函数尚未支持传递额外参数给 main process 
    // 但我们可以通过 vlistData 全局对象在 vipWindow 中判断，或者修改 create-new-window IPC

    // 这里我们稍微 hack 一下，将 canvip 信息暂存，供 new-window 事件使用
    // 或者直接修改 ipcRenderer.send 的逻辑。
    // 但由于 loadURL 只是 webview.loadURL，最终触发 new-window 是在页面内部跳转时？
    // 不，点击按钮是直接加载 URL。

    // 如果是点击下方按钮加载的页面，是在当前 webview 加载
    // 只有 webview 内部点击链接导致的新窗口才走 create-new-window
    // 所以我们需要通知 current webview 所在环境关于 VIP 按钮的状态？
    // 描述说：屏幕上的 “VIP” 按钮，根据数据中的 canvip 来显示。
    // 这通常是指新打开的独立 VIP 窗口中的按钮。

    // 修改 loadURL 逻辑，传递 title 和 potential vip status?
    // 当前架构下，首页是 webview，点击按钮直接在当前 webview 加载。
    // VIP 按钮是在 vipWindow.js 注入的，那是针对“新窗口”的。
    // 如果用户是在主界面 webview 浏览，是否有 VIP 按钮？
    // 主界面 renderer.js 没有注入 VIP 按钮逻辑。
    // 既然需求提到“屏幕上的 VIP 按钮”，可能是指 vipWindow 中的，或者主界面也要加？
    // 假设是指 vipWindow (因为 vipWindow.js 中有注入 VIP UI 的逻辑)
    // 那么只有当从 webview 打开新窗口时才涉及。

    // 另一种可能是主界面 webview 也需要注入 VIP 按钮？
    // 目前 index.html 没有 VIP 按钮，renderer.js 也没注入。
    // 只有 vipWindow.js 有 injectVipUI。
    // 如果用户意图是“在主界面点击平台，进入 webview 播放，此时要有 VIP 按钮”
    // 那么我们需要在 renderer.js 中也实现类似的注入逻辑，或者在 webview preload 中处理。
    // 但鉴于 vipWindow.js 的存在，通常是 popups 才有。

    // 无论如何，我们先保持 loadURL 调用。
    loadURL(platform.url, platform.name);

    // 记录当前平台的 canvip 状态
    const isVip = platform.canvip === 1;
    sessionStorage.setItem('current_platform_canvip', isVip ? '1' : '0');

    // 更新主界面 VIP 按钮显隐
    const mainVipBtn = document.getElementById('vip-drag-btn');
    if (mainVipBtn) {
      mainVipBtn.style.display = isVip ? 'flex' : 'none';
    }
  });
  return button;
}

// 更新 Filter 按钮文字
function updateFilterButtonText() {
  const filterButton = document.getElementById('filter-button');
  if (filterButton) {
    const category = categoryList.find(c => c.id === currentCategory);
    const label = category ? category.name : 'All';
    filterButton.textContent = `筛选: ${label}`;
  }
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
    #edit-dialog-reset {
      background: #faad14;
      color: white;
    }
    #edit-dialog-reset:hover {
      background: #d48806;
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
    #filter-popover {
      display: none;
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
      min-width: 100px;
    }
    .filter-option {
      padding: 8px 12px;
      cursor: pointer;
      font-size: 14px;
      color: #333;
    }
    .filter-option:hover {
      background: #f0f0f0;
    }
    .filter-option.active {
      color: #1890ff;
      background: #e6f7ff;
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
    <button id="edit-dialog-reset">重置</button>
    <button id="edit-dialog-save">保存</button>
  `;

  dialog.appendChild(header);
  dialog.appendChild(content);
  dialog.appendChild(footer);
  document.body.appendChild(dialog);

  // 添加事件监听
  document.getElementById('edit-dialog-close').addEventListener('click', closeEditDialog);
  document.getElementById('edit-dialog-cancel').addEventListener('click', closeEditDialog);
  document.getElementById('edit-dialog-reset').addEventListener('click', resetVlistContent);
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
    const parsed = JSON.parse(content);
    // 自动格式化 JSON (4空格缩进)
    const formatted = JSON.stringify(parsed, null, 4);

    // 更新文本框显示
    textarea.value = formatted;

    errorElement.textContent = '';
    // 发送到主进程保存
    ipcRenderer.send('save-vlist-content', formatted);
  } catch (error) {
    const msg = 'JSON 格式错误: ' + error.message;
    errorElement.textContent = msg;
    alert(msg);
  }
};

// 重置 vlist.json 内容
const resetVlistContent = () => {
  // 请求默认配置
  ipcRenderer.send('get-default-vlist-content');
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

// 筛选按钮事件
const filterButton = document.getElementById('filter-button');
if (filterButton) {
  // 创建 Popover 元素
  const popover = document.createElement('div');
  popover.id = 'filter-popover';
  document.body.appendChild(popover);

  const renderFilterOptions = () => {
    popover.innerHTML = '';
    categoryList.forEach(category => {
      const option = document.createElement('div');
      option.className = `filter-option ${currentCategory === category.id ? 'active' : ''}`;
      option.textContent = `[${category.name}]`;
      option.addEventListener('click', () => {
        currentCategory = category.id;
        // 保存到 localStorage
        localStorage.setItem('lastSelectedCategory', currentCategory);

        renderPlatformButtons();
        updateFilterButtonText();
        popover.style.display = 'none';
      });
      popover.appendChild(option);
    });
  };

  filterButton.addEventListener('click', (e) => {
    e.stopPropagation();

    // 移除红点并标记为已点击
    if (filterButton.classList.contains('red-dot')) {
      filterButton.classList.remove('red-dot');
      localStorage.setItem('hasClickedFilter', 'true');
    }

    if (popover.style.display === 'block') {
      popover.style.display = 'none';
      return;
    } else {
      renderFilterOptions();
      const rect = filterButton.getBoundingClientRect();
      popover.style.left = rect.left + 'px';
      popover.style.bottom = (window.innerHeight - rect.top + 5) + 'px'; // 显示在按钮上方
      popover.style.display = 'block';
    }
  });

  // 点击外部关闭 Popover
  document.addEventListener('click', (e) => {
    if (popover.style.display === 'block' && e.target !== filterButton && !popover.contains(e.target)) {
      popover.style.display = 'none';
    }
  });
}

// 监听 vlist 内容响应
ipcRenderer.on('vlist-content', (event, content) => {
  const textarea = document.getElementById('vlist-textarea');
  textarea.value = content;
});

// 监听默认配置内容响应
ipcRenderer.on('default-vlist-content', (event, content) => {
  const textarea = document.getElementById('vlist-textarea');
  if (confirm('确定要重置为默认配置吗？当前未保存的修改将丢失。')) {
    textarea.value = content;
    document.getElementById('error-message').textContent = '已加载默认配置，请点击保存以应用。';
  }
});

// 监听保存成功响应
ipcRenderer.on('vlist-save-success', () => {
  // alert('保存成功！请重启应用以应用更改。'); // 移除 Alert
  closeEditDialog();

  // 立即刷新数据
  ipcRenderer.send('get-vlist-data');

  // 显示轻量提示 (比如 Toast，或者复用 error-message 位置但不好因为 Dialog 已关闭)
  // 这里使用一个临时的 Toast
  const toast = document.createElement('div');
  toast.textContent = '保存成功，列表已刷新';
  toast.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 10px 20px; border-radius: 4px; z-index: 3000; transition: opacity 0.5s;';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 500);
  }, 2000);
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
// 监听返回按钮事件
ipcRenderer.on('go-back', () => {
  // 返回主页面
  const indexFilePath = path.join(__dirname, 'index.html');
  loadURL(`file://${indexFilePath}`, 'VipVideo');
});
window.loadURL = loadURL;

// 更新按钮点击事件
const updateButton = document.getElementById('update-button');
if (updateButton) {
  // 设置按钮内容：第一行“升级”，第二行小字版本号
  updateButton.innerHTML = `升级<span class="version-text">v${appVersion}</span>`;
  updateButton.addEventListener('click', () => {
    shell.openExternal(updateUrl);
  });
}

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
  } catch (e) { }
});

let urlStack = [];

// 只添加 new-window 事件处理
webview.addEventListener('new-window', (event) => {
  console.log('[renderer] new-window:', event.url);
  event.preventDefault();

  const newPageUrl = event.url; // 获取新窗口的跳链
  console.log('New window URL:', newPageUrl);

  // 获取当前平台的 canvip 状态
  const canShowVipString = sessionStorage.getItem('current_platform_canvip');
  // 转换为布尔值，'1' 或 'true' 为 true，其他为 false
  const canShowVip = canShowVipString === '1' || canShowVipString === 'true';

  // 通过 ipcRenderer 通知主进程创建新窗口
  ipcRenderer.send('create-new-window', newPageUrl, canShowVip);
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
        } catch (_) { }
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
    } catch (_) { }
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
  dragBtn.style.display = 'none'; // 默认隐藏，点击支持VIP的平台后才显示
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
      el.textContent = item.name || `解析${index + 1}`;
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
