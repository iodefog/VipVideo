const { BrowserWindow } = require('electron');
const path = require('path');

function injectVipUI(child, vlistArray) {
  const list = Array.isArray(vlistArray) ? vlistArray : [];
  const css = `
        #vip-drag-btn { position: fixed; top: 70px; right: 30px; z-index: 2147483647; width: 44px; height: 44px; border-radius: 22px; background: #ff4d4f; color: #fff; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px; user-select: none; }
        #vip-drag-btn:hover { background: #f5222d; }
        #vip-popover { position: fixed; top: 120px; right: 30px; z-index: 2147483647; width: 160px; max-height: 360px; overflow: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.2); padding: 8px 0; display: none; }
        .vip-item { padding: 6px 10px; cursor: pointer; font-size: 12px; width: 150px; color: #333; white-space: normal; word-wrap: break-word; overflow: visible; border-bottom: 1px solid #eee; }
        .vip-item:hover { background: #f5f5f5; }
  `;
  const injected = `(() => {
    try {
      if (document.getElementById('vip-drag-btn')) return;
      const list = ${JSON.stringify(list)};
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      (document.head || document.documentElement).appendChild(style);

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
  child.webContents.executeJavaScript(injected, true).catch(() => {});
}

function openVipWindow(url, vlistArray, size = { width: 1200, height: 800 }) {
  const child = new BrowserWindow({
    width: size.width,
    height: size.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'child_preload.js')
    }
  });
  child.loadURL(url);
  child.webContents.on('did-finish-load', () => {
    injectVipUI(child, vlistArray);
  });
  return child;
}

module.exports = { openVipWindow };


