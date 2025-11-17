const { BrowserWindow } = require('electron');
const path = require('path');

function injectVipUI(child, vlistArray) {
  const list = Array.isArray(vlistArray) ? vlistArray : [];
  // 主要修改内容
  
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
        if (pop.style.display === 'block' && e.target !== pop && e.target !== btn && !pop.contains(e.target)) {
          pop.style.display = 'none';
        }
      });
    } catch (e) { console.warn('VIP inject failed:', e); }
  })();`;
  // 执行注入脚本到渲染进程
  child.webContents.executeJavaScript(injected).catch(err => {
    console.error('Failed to inject VIP UI:', err);
  });
  return child;
}

function openVipWindow(url, vlistArray, size = { width: 1200, height: 800 }) {
    const child = new BrowserWindow({
      width: size.width,
      height: size.height,
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
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'
      },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'
  });
   // 自动允许媒体键系统权限请求
  child.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || '';
    console.log(`[vipWindow] 权限请求: ${permission} 来自: ${requestingUrl}`);
    // 允许媒体相关权限
    if (permission === 'mediaKeySystem' || permission === 'autoplay' || permission === 'media') {
      return callback(true);
    }
    callback(false);
  });
  child.loadURL(url);
  child.webContents.on('did-finish-load', () => {
    injectVipUI(child, vlistArray);
  });
  return child;
}

module.exports = { openVipWindow };


