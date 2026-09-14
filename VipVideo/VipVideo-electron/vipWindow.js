const { BrowserWindow, webFrameMain } = require('electron');
const path = require('path');

function injectVipUI(child, vlistArray, canShowVip) {
  const list = Array.isArray(vlistArray) ? vlistArray : [];

  // 1. CSS样式添加
  const css = `
    #back-button { position: fixed; top: 70px; left: 30px; z-index: 2147483647; width: 44px; height: 44px; border-radius: 22px; background: #1890ff; color: #fff; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: block; text-align: center; line-height: 44px; font-size: 18px; font-weight: bold; user-select: none; }
    #back-button:hover { background: #40a9ff; }
    #vip-drag-btn { position: fixed; top: 70px; right: 30px; z-index: 2147483647; width: 44px; height: 44px; border-radius: 22px; background: #ff4d4f; color: #fff; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px; user-select: none; }
    #vip-drag-btn:hover { background: #f5222d; }
    #vip-popover { position: fixed; top: 120px; right: 30px; z-index: 2147483647; width: 160px; max-height: 360px; overflow: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.2); padding: 8px 0; display: none; }
    .vip-item { padding: 6px 10px; cursor: pointer; font-size: 12px; width: 150px; color: #333; white-space: normal; word-wrap: break-word; overflow: visible; border-bottom: 1px solid #eee; }
    .vip-item:hover { background: #f5f5f5; }
  `;
  const injected = `(() => {
    try {
      const list = ${JSON.stringify(list)};
      const canShowVip = ${JSON.stringify(canShowVip)};
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      (document.head || document.documentElement).appendChild(style);
      
      // 创建并添加返回按钮
      if (!document.getElementById('back-button')) {
        const backButton = document.createElement('button');
        backButton.id = 'back-button';
        backButton.textContent = '←';
        (document.body || document.documentElement).appendChild(backButton);
        
        // 添加返回按钮点击事件
        backButton.addEventListener('click', function() {
          if (window.history.length > 1) {
            window.history.back();
          }
        });
        
        // 监听历史记录变化，更新返回按钮状态
        function updateBackButtonState() {
          backButton.style.display = window.history.length > 1 ? 'block' : 'block';
        }
        
        // 初始化按钮状态
        updateBackButtonState();
        
        // 监听页面导航事件
        window.addEventListener('popstate', updateBackButtonState);
        window.addEventListener('hashchange', updateBackButtonState);
      }

      if (canShowVip) {
        if (document.getElementById('vip-drag-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'vip-drag-btn';
        btn.textContent = 'VIP';
        (document.body || document.documentElement).appendChild(btn);

        const pop = document.createElement('div');
        pop.id = 'vip-popover';
        (document.body || document.documentElement).appendChild(pop);

        const prefixes = list.map(function(i){ return i && i.url; }).filter(Boolean);
        function isParser(u) { return prefixes.some(function(p){ return typeof p === 'string' && u.indexOf(p) === 0; }); }
        function extract(u) {
          try {
            var parsed = new URL(u);
            var params = Array.from(parsed.searchParams.values());
            for (var i = 0; i < params.length; i++) {
              var v = params[i] || '';
              try {
                var dec = decodeURIComponent(v);
                if (dec.indexOf('http://') === 0 || dec.indexOf('https://') === 0) return dec;
              } catch(e) {}
              if (v.indexOf('http://') === 0 || v.indexOf('https://') === 0) return v;
            }
            return params.length > 0 ? params[0] : u;
          } catch(e) { return u; }
        }

        function updateOriginal() {
          try {
            var now = location.href || '';
            if (isParser(now)) {
              var orig = extract(now);
              if (orig) window.__VIP_ORIGINAL__ = orig;
            } else {
              window.__VIP_ORIGINAL__ = now;
            }
          } catch(e) {}
        }

        // 初始化与监听导航变化，保持原始 URL
        updateOriginal();
        window.addEventListener('hashchange', updateOriginal);
        window.addEventListener('popstate', updateOriginal);
        try {
          var _push = history.pushState;
          history.pushState = function(){ var r = _push.apply(this, arguments); try{ updateOriginal(); }catch(e){} return r; }
          var _replace = history.replaceState;
          history.replaceState = function(){ var r2 = _replace.apply(this, arguments); try{ updateOriginal(); }catch(e){} return r2; }
        } catch(e) {}

        function render() {
          const frag = document.createDocumentFragment();
          list.forEach((it, idx) => {
            const el = document.createElement('div');
            el.className = 'vip-item';
            el.textContent = (it && it.name) ? it.name : ('解析' + (idx + 1));
            el.addEventListener('click', function() {
              var now = location.href || '';
              // 优先使用保留的原始 URL，确保多次解析仍基于原始内容地址
              var baseCandidate = window.__VIP_ORIGINAL__ || now;
              var base = isParser(baseCandidate) ? extract(baseCandidate) : baseCandidate;
              var target = (it && it.url) ? ('' + it.url + base) : base;
              location.href = target;
              pop.style.display = 'none';
            });
            frag.appendChild(el);
          });
          pop.innerHTML = '';
          pop.appendChild(frag);
        }

        render();

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          var curr = (typeof getComputedStyle === 'function') ? getComputedStyle(pop).display : pop.style.display;
          pop.style.display = (curr === 'none') ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
          if (pop instanceof Node && btn instanceof Node && pop.style.display === 'block' && e.target !== pop && e.target !== btn && !pop.contains(e.target)) {
            pop.style.display = 'none';
          }
        });
      }
    } catch (e) { console.warn('VIP inject failed:', e); }
  })();`;
  // 执行注入脚本到渲染进程
  child.webContents.executeJavaScript(injected).catch(err => {
    console.error('Failed to inject VIP UI:', err);
  });
  return child;
}

function openVipWindow(url, vlistArray, size = { width: 1200, height: 800 }, canShowVip = true) {
  const child = new BrowserWindow({
    width: size.width,
    height: size.height,
    // 显式声明允许进入/退出全屏，避免某些 Electron 版本下 HTML5 requestFullscreen 静默失败
    fullscreenable: true,
    webPreferences: {
      webviewTag: true,
      autoplayPolicy: 'no-user-gesture-required', // 允许自动播放
      webSecurity: false, // 禁用web安全策略
      nodeIntegration: true, // 启用Node集成
      contextIsolation: false, // 禁用上下文隔离
      preload: path.join(__dirname, 'child_preload.js'),
      // 启用插件支持（有些加密视频可能需要）
      plugins: true,
      // 启用JavaScript（默认启用，但显式设置）
      javascript: true,
      // 配置会话以支持媒体键系统（EME）
      partition: 'persist:vipvideo',
      // 禁用缓存可能有助于解决某些播放问题
      cache: true,
      userAgent: '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    },
    userAgent: '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
  });
  // 自动允许媒体键系统权限请求
  child.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || '';
    console.log(`[vipWindow] 权限请求: ${permission} 来自: ${requestingUrl}`);
    // 允许媒体相关权限 + 全屏权限（否则部分播放器的 HTML5 全屏会被静默拒绝）
    if (permission === 'mediaKeySystem' || permission === 'autoplay' || permission === 'media' || permission === 'fullscreen') {
      return callback(true);
    }
    callback(false);
  });
  child.webContents.setWindowOpenHandler(({ url }) => {
    openVipWindow(url, vlistArray, size, canShowVip);
    return { action: 'deny' };
  });

  child.loadURL(url);

  // 监听 HTML5 全屏事件，确保 Electron 窗口与页面全屏状态同步
  child.webContents.on('enter-html-full-screen', () => {
    if (!child.isFullScreen()) child.setFullScreen(true);
  });
  child.webContents.on('leave-html-full-screen', () => {
    if (child.isFullScreen()) child.setFullScreen(false);
  });

  child.webContents.on('did-finish-load', () => {
    // 先注入全屏补丁（处理 iframe 嵌套播放器），再注入 VIP UI
    injectFullscreenPatch(child);
    injectVipUI(child, vlistArray, canShowVip);
  });

  // 播放器通常在子 frame(iframe) 内：did-finish-load 只覆盖主 frame，
  // 因此对每个 frame 单独注入，保证 iframe 内的全屏按钮也能被拦截
  child.webContents.on('did-frame-finish-load', (event, isMainFrame, frameProcessId, frameRoutingId) => {
    try {
      const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
      if (frame && !frame.isDestroyed()) {
        frame.executeJavaScript(getFullscreenPatch()).catch(() => {});
      }
    } catch (e) {
      // 忽略：某些 frame 可能在事件触发时已销毁
    }
  });

  return child;
}

// 注入全屏 API 补丁：
//  1) 覆盖 Element.requestFullscreen / webkitRequestFullscreen，失败时回退到 documentElement
//  2) 给所有 iframe 补上 allowfullscreen / allow="fullscreen"
//  3) 覆盖 Document.fullscreenElement / fullscreenEnabled 让播放器 UI 状态正确
//  4) 捕获阶段 click 拦截：识别全屏按钮，直接通过 IPC 驱动 BrowserWindow.setFullScreen()
function getFullscreenPatch() {
  const patch = `
    (function patchFullscreen() {
      if (window.__FULLSCREEN_PATCHED__) return;
      window.__FULLSCREEN_PATCHED__ = true;

      var IS_TOP = true;
      try { IS_TOP = (window.top === window); } catch (_) { IS_TOP = true; }
      console.log('[VIPVideo] patch installed, isTop=' + IS_TOP);

      // 主 frame 才有 nodeIntegration，iframe 内需要靠 top frame 转发
      var ELECTRON = null;
      try { if (typeof require === 'function') ELECTRON = require('electron'); } catch (_) {}
      if (!ELECTRON && window.require) { try { ELECTRON = window.require('electron'); } catch (_) {} }
      if (!ELECTRON && window.electron) ELECTRON = window.electron;
      console.log('[VIPVideo] ipcRenderer available=' + !!(ELECTRON && ELECTRON.ipcRenderer));

      // 统一的"切换全屏"入口：优先 IPC；iframe 内退化到 postMessage 由 top 转发
      function vipToggle() {
        if (ELECTRON && ELECTRON.ipcRenderer) {
          window.__VIP_FS__ = !window.__VIP_FS__;
          ELECTRON.ipcRenderer.send('vipv-toggle-fullscreen');
          notifyFsChange();
          console.log('[VIPVideo] toggle via IPC, state=' + window.__VIP_FS__);
          return true;
        }
        if (!IS_TOP) {
          try { window.top.postMessage({ __VIP_FS_TOGGLE__: true }, '*'); console.log('[VIPVideo] toggle via postMessage'); return true; } catch (_) {}
        }
        console.warn('[VIPVideo] no IPC channel, fallback to page API');
        return false;
      }

      // top frame 接收来自子 frame 的转发请求
      if (IS_TOP) {
        try {
          window.addEventListener('message', function(e) {
            if (e && e.data && e.data.__VIP_FS_TOGGLE__) {
              console.log('[VIPVideo] got toggle request from sub frame');
              vipToggle();
            }
          });
        } catch (_) {}
      }

      // 维护一个"我们认为"的全屏状态，配合覆盖 fullscreenElement 让播放器 UI 同步
      window.__VIP_FS__ = false;
      try {
        Object.defineProperty(Document.prototype, 'fullscreenElement', {
          configurable: true,
          get: function() { return window.__VIP_FS__ ? document.documentElement : null; }
        });
        Object.defineProperty(Document.prototype, 'webkitFullscreenElement', {
          configurable: true,
          get: function() { return window.__VIP_FS__ ? document.documentElement : null; }
        });
        Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
          configurable: true,
          get: function() { return true; }
        });
        Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', {
          configurable: true,
          get: function() { return true; }
        });
      } catch (_) {}

      function patchRequest(proto, name) {
        var orig = proto[name];
        if (typeof orig !== 'function') return;
        proto[name] = function(opts) {
          var p;
          try { p = orig.call(this, opts); }
          catch (e) { p = Promise.reject(e); }
          if (p && typeof p.catch === 'function') {
            return p.catch(function() {
              try {
                var doc = (this.ownerDocument) || document;
                var root = doc.fullscreenElement || doc.documentElement;
                if (root && root !== this) return orig.call(root, opts);
              } catch (e2) {}
              return Promise.reject(new Error('requestFullscreen failed'));
            });
          }
          return p;
        };
      }
      try { patchRequest(Element.prototype, 'requestFullscreen'); } catch(_){}
      try { patchRequest(Element.prototype, 'webkitRequestFullscreen'); } catch(_){}

      function patchExit(proto, name) {
        var orig = proto[name];
        if (typeof orig !== 'function') return;
        proto[name] = function() {
          var p;
          try { p = orig.call(this); }
          catch (e) { p = Promise.reject(e); }
          if (p && typeof p.catch === 'function') {
            return p.catch(function() { return Promise.reject(new Error('exitFullscreen failed')); });
          }
          return p;
        };
      }
      try { patchExit(Document.prototype, 'exitFullscreen'); } catch(_){}
      try { patchExit(Document.prototype, 'webkitExitFullscreen'); } catch(_){}

      // 给所有 iframe 补上 allowfullscreen + allow="fullscreen"（含 SPA 后续动态插入）
      function ensureAllowFS(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') {
          if (!node.hasAttribute('allowfullscreen')) node.setAttribute('allowfullscreen', '');
          try {
            var allow = node.getAttribute('allow') || '';
            if (!/\\bfullscreen\\b/.test(allow)) {
              node.setAttribute('allow', (allow ? allow + ' ' : '') + 'fullscreen');
            }
          } catch (_) {}
        }
        if (node.querySelectorAll) {
          node.querySelectorAll('iframe').forEach(ensureAllowFS);
        }
      }
      ensureAllowFS(document);
      try {
        var mo = new MutationObserver(function(muts) {
          for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              if (added[j] && added[j].nodeType === 1) ensureAllowFS(added[j]);
            }
          }
        });
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      } catch (_) {}

      // 兜底：捕获阶段 click 监听器识别"全屏按钮"，直接 IPC 驱动 BrowserWindow 全屏
      function isFullscreenButton(el) {
        if (!el || el.nodeType !== 1) return false;
        try {
          var cls = '';
          if (typeof el.className === 'string') cls = el.className;
          else if (el.className && el.className.baseVal !== undefined) cls = el.className.baseVal;
          if (cls && /\\b(fullscreen|full-screen|full_screen|fullscreen-btn|fullscreen-btn-in|fullscreen-icon|fs-icon)\\b/i.test(cls)) return true;
          // 兜底匹配：class 里包含 fullscreen（即便词边界不严）
          if (cls && /fullscreen/i.test(cls)) return true;
        } catch (_) {}
        try {
          var aria = (el.getAttribute && (el.getAttribute('aria-label') || '')) || '';
          var title = (el.getAttribute && (el.getAttribute('title') || '')) || '';
          var txt = aria + ' ' + title;
          if (/full\\s*screen|全屏|fullscreen/i.test(txt)) return true;
        } catch (_) {}
        try {
          if (el.dataset) {
            for (var k in el.dataset) {
              if (/fullscreen|全屏/i.test(k) || /fullscreen|全屏/i.test(String(el.dataset[k] || ''))) return true;
            }
          }
        } catch (_) {}
        return false;
      }

      function notifyFsChange() {
        try {
          document.dispatchEvent(new Event('fullscreenchange'));
          document.dispatchEvent(new Event('webkitfullscreenchange'));
        } catch (_) {}
      }

      function handleFsEvent(e) {
        var el = e.target;
        while (el && el !== document) {
          if (isFullscreenButton(el)) {
            try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch (_) {}
            try {
              if (vipToggle()) {
                // 已通过 IPC / postMessage 处理，无需再走页面 API
              } else {
                // 退化路径：尝试用页面层 fullscreen API
                try {
                  if (window.__VIP_FS__) {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                  } else {
                    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
                    else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
                  }
                } catch (_) {}
              }
            } catch (err) { console.warn('[VIPVideo] fs ipc failed', err); }
            return false;
          }
          el = el.parentElement;
        }
      }

      // 给任意 document 挂监听（含 iframe 内部的 document）
      var __vipSet = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
      function vipAttachDoc(doc, tag) {
        if (!doc) return;
        if (__vipSet) {
          if (__vipSet.has(doc)) return;
          __vipSet.add(doc);
        } else {
          if (doc.__VIP_FS_ATTACHED__) return;
          doc.__VIP_FS_ATTACHED__ = true;
        }
        try { doc.addEventListener('click', handleFsEvent, true); } catch (_) {}
        try { doc.addEventListener('mousedown', handleFsEvent, true); } catch (_) {}
        console.log('[VIPVideo] attached -> ' + tag);
        // 递归处理该 document 内的 iframe
        try {
          var subs = doc.querySelectorAll('iframe');
          for (var s = 0; s < subs.length; s++) vipHookIframe(subs[s]);
        } catch (_) {}
      }

      function vipHookIframe(fr) {
        if (!fr || fr.__VIP_FS_HOOKED__) return;
        fr.__VIP_FS_HOOKED__ = true;
        try { vipAttachDoc(fr.contentDocument, 'iframe'); } catch (_) {}
        try {
          fr.addEventListener('load', function() {
            try { vipAttachDoc(fr.contentDocument, 'iframe(load)'); } catch (_) {}
          });
        } catch (_) {}
      }

      function vipScanFrames() {
        try {
          var frs = document.querySelectorAll('iframe');
          for (var i = 0; i < frs.length; i++) {
            vipHookIframe(frs[i]);
            try {
              var d = frs[i].contentDocument;
              if (d) {
                var inner = d.querySelectorAll('iframe');
                for (var j = 0; j < inner.length; j++) vipHookIframe(inner[j]);
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      vipAttachDoc(document, (IS_TOP ? 'top' : 'frame'));
      vipScanFrames();
      setInterval(vipScanFrames, 800);

      try {
        var __vipMo = new MutationObserver(function(muts) {
          for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              var n = added[j];
              if (n && n.nodeType === 1) {
                if (n.tagName === 'IFRAME') vipHookIframe(n);
                try {
                  var sub2 = n.querySelectorAll ? n.querySelectorAll('iframe') : [];
                  for (var k = 0; k < sub2.length; k++) vipHookIframe(sub2[k]);
                } catch (_) {}
              }
            }
          }
        });
        __vipMo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      } catch (_) {}
    })();
  `;
  return patch;
}

function injectFullscreenPatch(child) {
  return child.webContents.executeJavaScript(getFullscreenPatch())
    .then(() => { console.log('[vipWindow] fullscreen patch injected -> main frame'); })
    .catch(function(err) {
      console.error('[vipWindow] Failed to inject fullscreen patch:', err);
    });
}

module.exports = { openVipWindow, injectFullscreenPatch, getFullscreenPatch };


