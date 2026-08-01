const { ipcRenderer, shell } = require('electron');
const packageJson = require('./package.json');
const appVersion = packageJson.version;
const updateUrl = 'https://pan.baidu.com/s/1wcpReZs2-UG71g1idPyPmA?pwd=nkye';
console.log('[renderer] start');

let vlistData = null;
// 添加一个变量来控制是否允许显示返回按钮
let allowShowBackButton = true;
let currentPlatformCanShowVip = sessionStorage.getItem('current_platform_canvip') === '1';
let lastPlayableVideoUrl = sessionStorage.getItem('last_playable_video_url') || '';
let contentState = { url: '', title: '', canGoBack: false, isLoading: false, loadFailed: false, platformKey: '', pendingPlatformKey: '', warmViews: 0 };
let navigationSequence = 0;
let loadingStatusTimer = null;
let lastCacheSwitchAt = 0;

function platformSupportsVip(platform) {
  return Boolean(platform && (platform.canvip === 1 || platform.canvip === true));
}

function isVisibleVideoPlatform(platform) {
  return Boolean(platform && platform.category === 'video' && platformSupportsVip(platform));
}

function getVisibleVideoPlatforms() {
  return vlistData && Array.isArray(vlistData.platformlist)
    ? vlistData.platformlist.filter(isVisibleVideoPlatform)
    : [];
}

function setCurrentPlatformVip(platform) {
  currentPlatformCanShowVip = platformSupportsVip(platform);
  sessionStorage.setItem('current_platform_canvip', currentPlatformCanShowVip ? '1' : '0');

  const vipButton = document.getElementById('vip-route-button');
  if (vipButton) {
    vipButton.style.display = currentPlatformCanShowVip ? '' : 'none';
  }
}

function baseDomain(hostname) {
  const parts = String(hostname || '').toLowerCase().split('.').filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join('.') : parts[0] || '';
}

function findPlatformByUrl(url) {
  if (!url || !vlistData || !Array.isArray(vlistData.platformlist)) return null;
  const candidates = [url];
  try {
    const parsed = new URL(url);
    for (const value of parsed.searchParams.values()) {
      try {
        const decoded = decodeURIComponent(value || '');
        if (/^https?:\/\//i.test(decoded)) candidates.push(decoded);
      } catch (_) { }
    }
  } catch (_) { }

  for (const candidate of candidates) {
    try {
      const targetDomain = baseDomain(new URL(candidate).hostname);
      if (!targetDomain) continue;
      const platform = vlistData.platformlist.find((item) => {
        try {
          return baseDomain(new URL(item.url).hostname) === targetDomain;
        } catch (_) {
          return false;
        }
      });
      if (platform) return platform;
    } catch (_) { }
  }
  return null;
}

function isLikelyPlayableVideoUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (host.endsWith('bilibili.com')) return /^\/(video|bangumi\/play)\//.test(path);
    if (host.endsWith('qq.com')) return /^\/x\/(cover|page)\//.test(path);
    if (host.endsWith('iqiyi.com')) return /^\/(v_|w_|a_)/.test(path);
    if (host.endsWith('mgtv.com')) return /^\/(b|l)\//.test(path);
    if (host.endsWith('youku.com')) return path.includes('/v_show/');
  } catch (_) { }
  return false;
}

function rememberPlayableVideoUrl(url) {
  if (!isLikelyPlayableVideoUrl(url)) return;
  lastPlayableVideoUrl = url;
  sessionStorage.setItem('last_playable_video_url', url);
}

function clearRememberedVideoUrl() {
  lastPlayableVideoUrl = '';
  sessionStorage.removeItem('last_playable_video_url');
}

function isAllowedVideoWindowUrl(url) {
  try {
    const targetDomain = baseDomain(new URL(url).hostname);
    return getVisibleVideoPlatforms().some((platform) => (
      baseDomain(new URL(platform.url).hostname) === targetDomain
    ));
  } catch (_) {
    return false;
  }
}

function syncVipStateForUrl(url) {
  const platform = findPlatformByUrl(url);
  // 解析线路或站内外链通常无法匹配平台，此时保留用户当前选择的平台状态。
  if (platform) setCurrentPlatformVip(platform);
}

// 通过IPC从主进程获取vlist数据
ipcRenderer.on('vlist-data', (event, data) => {
  vlistData = data;
  console.log('vlistData received from main process:', vlistData);
  const visiblePlatforms = getVisibleVideoPlatforms();

  const rememberedUrl = localStorage.getItem('lastUrl');
  const rememberedPlatform = findPlatformByUrl(rememberedUrl);
  const canRestoreRememberedUrl = isVisibleVideoPlatform(rememberedPlatform);
  const initialPlatform = canRestoreRememberedUrl ? rememberedPlatform : visiblePlatforms[0];
  if (initialPlatform) setCurrentPlatformVip(initialPlatform);

  // 如果已经加载了平台按钮容器，重新创建平台按钮
  // 如果已经加载了平台按钮容器，重新创建平台按钮
  renderPlatformButtons();

  // WebContentsView 为空时，恢复上次页面或打开第一个平台。
  if (visiblePlatforms.length > 0 && !/^https?:\/\//i.test(contentState.url || '')) {
    if (canRestoreRememberedUrl) {
      console.log('Loading last visited URL:', rememberedUrl);
      setTimeout(() => loadURL(rememberedUrl, rememberedPlatform && rememberedPlatform.name, 'startup-restore'), 100);
    } else if (initialPlatform) {
      console.log('Loading first visible video platform:', initialPlatform);
      setTimeout(() => loadURL(initialPlatform.url, initialPlatform.name, 'startup-default'), 100);
    }
  }
});

// 请求vlist数据
ipcRenderer.send('get-vlist-data');

const platformButtons = document.getElementById('platform-buttons');
const customButton = document.getElementById('custom-button');
const historyButton = document.getElementById('history-button');
const devtoolsButton = document.getElementById('devtools-button');
const topmostButton = document.getElementById('topmost-button');
const transparentTopmostButton = document.getElementById('transparent-topmost-button');
const vipRouteButton = document.getElementById('vip-route-button');
const loadingStatus = document.getElementById('loading-status');
const startupStatusText = document.getElementById('startup-status-text');

// 检查元素是否存在
if (!platformButtons) console.error('Platform buttons container not found');
if (!customButton) console.error('Custom button not found');
if (!historyButton) console.error('History button not found');
if (!devtoolsButton) console.error('DevTools button not found');
if (!topmostButton) console.error('Topmost button not found');
if (!transparentTopmostButton) console.error('Transparent topmost button not found');
if (!vipRouteButton) console.error('VIP route button not found');
if (!loadingStatus) console.error('Loading status element not found');

function setLoadingStatus(text, tone = 'loading', autoHideMs = 0) {
  if (!loadingStatus) return;
  clearTimeout(loadingStatusTimer);
  loadingStatusTimer = null;
  loadingStatus.textContent = text;
  loadingStatus.dataset.tone = tone;
  loadingStatus.classList.toggle('is-visible', Boolean(text));
  if (text && autoHideMs > 0) {
    loadingStatusTimer = setTimeout(() => {
      loadingStatus.textContent = '';
      loadingStatus.classList.remove('is-visible');
      loadingStatusTimer = null;
    }, autoHideMs);
  }
}

function updateActivePlatformButton(platformKey = contentState.platformKey) {
  document.querySelectorAll('.platform-button').forEach((button) => {
    const isActive = Boolean(platformKey) && button.dataset.platformKey === platformKey;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function updateLoadingFeedback(nextState = {}) {
  updateActivePlatformButton(
    nextState.pendingPlatformKey || contentState.pendingPlatformKey
      || nextState.platformKey || contentState.platformKey
  );
  const warmViews = Number(nextState.warmViews ?? contentState.warmViews) || 0;
  const cacheLabel = warmViews > 0 ? ` · ${warmViews}页` : '';
  const retryAttempt = Number(nextState.retryAttempt ?? contentState.retryAttempt) || 0;
  const maxRetryAttempts = Number(nextState.maxRetryAttempts ?? contentState.maxRetryAttempts) || 2;

  if (nextState.isLoading === true && retryAttempt > 0) {
    setLoadingStatus(`网络波动 · 自动重试 ${retryAttempt}/${maxRetryAttempts}`, 'loading');
  } else if (nextState.pendingLoadFailed === true) {
    setLoadingStatus('打开失败 · 已保留当前页', 'error', 4000);
  } else if (nextState.loadFailed === true) {
    setLoadingStatus('加载失败', 'error', 3000);
  } else if (nextState.interactiveReady === true) {
    setLoadingStatus('已打开', 'success', 1800);
  } else if (nextState.cacheSwitch === true) {
    lastCacheSwitchAt = Date.now();
    setLoadingStatus(`已秒开${cacheLabel}`, 'success', 2000);
  } else if (nextState.isLoading === true) {
    // 冻结页恢复 active 时 Chromium 可能补发 did-start-loading；页面已经可见，
    // 不应把刚显示的“已秒开”误覆盖为“加载中”。
    const hasPendingPlatform = Boolean(nextState.pendingPlatformKey || contentState.pendingPlatformKey);
    if (!hasPendingPlatform && Date.now() - lastCacheSwitchAt < 2000) return;
    const slowLoading = nextState.slowLoading ?? contentState.slowLoading;
    setLoadingStatus(slowLoading ? '网络较慢 · 继续加载…' : '正在打开…', 'loading');
  } else if (nextState.isLoading === false) {
    setLoadingStatus(`已就绪${cacheLabel}`, 'success', 1200);
  }
}

function updateWindowDisplayModeButtons(mode) {
  if (!topmostButton || !transparentTopmostButton) return;

  const isTopmost = mode === 'topmost';
  const isTransparentTopmost = mode === 'transparent-topmost';
  topmostButton.classList.toggle('is-active', isTopmost);
  transparentTopmostButton.classList.toggle('is-active', isTransparentTopmost);
  topmostButton.setAttribute('aria-pressed', String(isTopmost));
  transparentTopmostButton.setAttribute('aria-pressed', String(isTransparentTopmost));
}

function toggleWindowDisplayMode(mode, button) {
  const nextMode = button.classList.contains('is-active') ? 'normal' : mode;
  ipcRenderer.send('set-window-display-mode', nextMode);
}

if (topmostButton) {
  topmostButton.addEventListener('click', () => {
    toggleWindowDisplayMode('topmost', topmostButton);
  });
}

if (transparentTopmostButton) {
  transparentTopmostButton.addEventListener('click', () => {
    toggleWindowDisplayMode('transparent-topmost', transparentTopmostButton);
  });
}

ipcRenderer.on('window-display-mode', (event, mode) => {
  updateWindowDisplayModeButtons(mode);
});

ipcRenderer.send('get-window-display-mode');

// 底部工具栏闲置后收起；移到窗口底边或操作工具栏时重新显示。
const buttonContainer = document.getElementById('button-container');
if (buttonContainer) {
  let bottomBarHideTimer = null;
  const showBottomBar = () => {
    buttonContainer.classList.remove('is-auto-hidden');
    if (bottomBarHideTimer) clearTimeout(bottomBarHideTimer);
    bottomBarHideTimer = null;
  };
  const scheduleBottomBarHide = (delay = 1400) => {
    if (bottomBarHideTimer) clearTimeout(bottomBarHideTimer);
    bottomBarHideTimer = setTimeout(() => {
      buttonContainer.classList.add('is-auto-hidden');
      bottomBarHideTimer = null;
    }, delay);
  };

  buttonContainer.addEventListener('mouseenter', showBottomBar);
  buttonContainer.addEventListener('mouseleave', () => scheduleBottomBarHide(500));
  buttonContainer.addEventListener('focusin', showBottomBar);
  buttonContainer.addEventListener('focusout', () => scheduleBottomBarHide(800));
  document.addEventListener('mousemove', (event) => {
    if (event.clientY >= window.innerHeight - 8) showBottomBar();
  });
  scheduleBottomBarHide();
}

// 创建回退按钮
const backButton = document.createElement('button');
backButton.id = 'back-button';
backButton.innerHTML = '←';
backButton.style.display = 'none';
if (buttonContainer) {
  buttonContainer.insertBefore(backButton, buttonContainer.firstChild);
}

// 添加回退按钮样式
const style = document.createElement('style');
style.textContent = `
  #back-button {
    flex-shrink: 0;
    min-width: 34px;
    height: 28px;
    font-size: 18px;
    cursor: pointer;
    display: none;
  }
`;
document.head.appendChild(style);

// 回退按钮功能
backButton.addEventListener('click', () => {
  ipcRenderer.invoke('content-go-back').catch((error) => console.error('[renderer] 返回失败:', error));
});

// 更新返回按钮显示状态
function updateBackButton() {
  if (!allowShowBackButton) {
    backButton.style.display = 'none';
    return;
  }
  backButton.style.display = contentState.canGoBack ? 'block' : 'none';
}

// 接收 WebContentsView 导航状态，同时记录历史记录
let historySaveTimer = null;
let lastSavedHistoryUrl = '';

function scheduleHistorySave(url) {
  if (!/^https?:\/\//i.test(url || '') || url.includes('history.html')) return;
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    if (url === lastSavedHistoryUrl) return;
    lastSavedHistoryUrl = url;
    ipcRenderer.send('save-history', {
      url,
      title: contentState.title || 'Unknown Page'
    });
  }, 700);
}

function handleContentNavigation(url) {
  allowShowBackButton = true;
  updateBackButton();
  syncVipStateForUrl(url);
  rememberPlayableVideoUrl(url);
  scheduleHistorySave(url);
}

ipcRenderer.on('content-state', (_event, nextState) => {
  const previousUrl = contentState.url;
  contentState = { ...contentState, ...nextState };
  updateLoadingFeedback(nextState);
  if (startupStatusText && (nextState.isLoading === true || nextState.pendingPlatformKey)) {
    startupStatusText.textContent = nextState.slowLoading
      ? '网络较慢，正在继续尝试…'
      : '正在连接视频网站…';
  }
  if (contentState.title) document.title = contentState.title;
  updateBackButton();
  if (contentState.url && contentState.url !== previousUrl) {
    handleContentNavigation(contentState.url);
  }
});

ipcRenderer.on('content-load-error', (_event, error) => {
  console.error('[renderer] 页面加载失败:', error);
  setLoadingStatus('加载失败', 'error', 3000);
  if (startupStatusText) startupStatusText.textContent = '连接失败，请切换平台重试';
});

ipcRenderer.on('performance-log', (_event, entry) => {
  console.log(entry.line, entry.details || {});
});

ipcRenderer.invoke('content-get-state').then((state) => {
  contentState = { ...contentState, ...state };
  updateLoadingFeedback(state);
  updateBackButton();
}).catch((error) => console.error('[renderer] 获取内容状态失败:', error));

// 请求主进程中的 WebContentsView 加载 URL，并记录点击到 IPC 往返耗时。
function loadURL(url, title, source = 'toolbar') {
  try {
    const requestId = `ui-${Date.now()}-${++navigationSequence}`;
    const rendererSentAt = Date.now();
    const rendererStart = performance.now();
    console.log(`[PERF][NAV ${requestId}] +0ms UI_NAVIGATE`, { source, url });
    setLoadingStatus('切换中…', 'loading');

    ipcRenderer.invoke('content-navigate', { url, title, source, requestId, rendererSentAt })
      .then((result) => {
        console.log(`[PERF][NAV ${requestId}] +${(performance.now() - rendererStart).toFixed(1)}ms IPC_ROUND_TRIP`, {
          ok: result.ok,
          mainQueueMs: result.mainReceivedAt - rendererSentAt,
          finalUrl: result.state && result.state.url
        });
      })
      .catch((error) => {
        console.error(`[PERF][NAV ${requestId}] NAVIGATION_REJECTED`, error);
        setLoadingStatus('切换失败', 'error', 3000);
      });

    // 保存最后访问的 URL
    localStorage.setItem('lastUrl', url);

    if (title) {
      document.title = `${title}`;
    } else {
      document.title = `VipVideo`;
    }

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

  const list = getVisibleVideoPlatforms();

  // 重新创建按钮
  list.forEach(platform => {
    const button = createButton(platform);
    platformButtons.appendChild(button);
  });

  updateActivePlatformButton();

  // 更新滚动按钮状态
  updateScrollButtonVisibility();
}

// 创建平台按钮
function createButton(platform) {
  const button = document.createElement('button');
  button.textContent = platform.name;
  button.classList.add('platform-button');
  button.dataset.platformKey = platformKeyForUrl(platform.url);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    allowShowBackButton = false;
    backButton.style.display = 'none';
    clearRememberedVideoUrl();
    setCurrentPlatformVip(platform);
    updateActivePlatformButton(button.dataset.platformKey);
    loadURL(platform.url, platform.name);
  });
  return button;
}

function platformKeyForUrl(url) {
  try { return baseDomain(new URL(url).hostname); } catch (_) { return ''; }
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
  ipcRenderer.send('set-content-view-visible', false);
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
  ipcRenderer.send('set-content-view-visible', true);
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
  ipcRenderer.send('set-content-view-visible', false);
  // 验证密码，通过后才打开编辑对话框
  const isVerified = await verifyPassword();
  if (isVerified) {
    openEditDialog();
  } else {
    ipcRenderer.send('set-content-view-visible', true);
  }
});

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

// DevTools 按钮事件（切换 WebContentsView 的 DevTools）
if (devtoolsButton) {
  devtoolsButton.addEventListener('click', () => {
    ipcRenderer.invoke('content-toggle-devtools').catch((error) => {
      console.error('toggle devtools failed', error);
    });
  });
}

// 绑定快捷键：Cmd/Ctrl+Shift+I 或 F12 打开 WebContentsView DevTools
document.addEventListener('keydown', (e) => {
  const isToggle = ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') || e.key === 'F12';
  if (isToggle) {
    e.preventDefault();
    ipcRenderer.invoke('content-toggle-devtools').catch((error) => {
      console.error('hotkey toggle devtools failed', error);
    });
  }
});
// 历史记录按钮事件已在前面实现



// 监听来自历史记录页面的URL加载请求
ipcRenderer.on('load-url-from-history', (event, data) => {
  const { url, title } = data;
  if (isAllowedVideoWindowUrl(url)) {
    loadURL(url, title, 'history');
  } else {
    alert('该历史记录不属于当前启用的视频平台，已阻止加载。');
  }
});

// 兼容旧通道：网页的 target="_blank" 与 window.open 请求仍复用当前内容区域。
ipcRenderer.on('load-url-in-current-window', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url) && isAllowedVideoWindowUrl(url)) {
    loadURL(url, '', 'legacy-window-open');
  } else {
    console.warn('[renderer] 已阻止第三方或广告新窗口:', url);
  }
});

// 监听返回按钮事件
// 监听返回按钮事件
ipcRenderer.on('go-back', () => {
  ipcRenderer.invoke('content-go-back').catch((error) => console.error('[renderer] 返回失败:', error));
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

function getParserPrefixes() {
  return Array.isArray(vlistData && vlistData.list)
    ? vlistData.list.map((item) => item.url).filter(Boolean)
    : [];
}

function isParserUrl(url) {
  return getParserPrefixes().some((prefix) => url && url.startsWith(prefix));
}

function extractOriginalFromParsed(url) {
  try {
    const parsed = new URL(url);
    for (const value of parsed.searchParams.values()) {
      const decoded = decodeURIComponent(value || '');
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
  } catch (_) { }
  return url;
}

if (vipRouteButton) {
  vipRouteButton.style.display = currentPlatformCanShowVip ? '' : 'none';
  vipRouteButton.addEventListener('click', () => {
    const nowUrl = contentState.url || '';
    const originalUrl = isParserUrl(nowUrl) ? extractOriginalFromParsed(nowUrl) : nowUrl;
    const baseUrl = isLikelyPlayableVideoUrl(originalUrl) ? originalUrl : lastPlayableVideoUrl;
    if (!baseUrl) {
      alert('请先进入具体视频或剧集的播放页面，再选择 VIP 解析线路。');
      return;
    }
    allowShowBackButton = false;
    backButton.style.display = 'none';
    ipcRenderer.send('show-vip-route-menu', { baseUrl });
  });
}
