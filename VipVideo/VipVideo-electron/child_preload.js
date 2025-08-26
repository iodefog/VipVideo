const { contextBridge } = require('electron');
console.log('[child_preload] loaded');

// 等到文档加载后，从父窗口同步 vlist.json 内容并注入 VIP 按钮
function ensureVipInjected() {
  try {
    // 从 opener 或顶层取 vlist 数据；若取不到则本地读取
    let vlist = null;
    try {
      if (window.opener && window.opener.vlistData) {
        vlist = window.opener.vlistData;
      } else if (window.top && window.top.vlistData) {
        vlist = window.top.vlistData;
      }
    } catch (e) { console.warn('[child_preload] opener/top vlist error', e); }
    try {
      if (!vlist) {
        // 回退：直接读取本地 vlist.json（与主进程同目录）
        const path = require('path');
        const fs = require('fs');
        const p = path.join(__dirname, 'vlist.json');
        if (fs.existsSync(p)) {
          vlist = JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
      }
    } catch (e) { console.warn('[child_preload] read local vlist error', e); }

    // 如果主页面通过 preload 暴露了注入器，则调用
    if (window.__VIP_INJECTOR__ && typeof window.__VIP_INJECTOR__.inject === 'function') {
      console.log('[child_preload] using __VIP_INJECTOR__');
      window.__VIP_INJECTOR__.inject(vlist);
    } else if (vlist) {
      console.log('[child_preload] fallback inject');
      // 简单回退：直接构建一个按钮和列表（与预加载相同样式）
      const style = document.createElement('style');
      style.textContent = `
        #vip-drag-btn { position: fixed; top: 70px; right: 30px; z-index: 2000; width: 44px; height: 44px; border-radius: 22px; background: #ff4d4f; color: #fff; border: none; cursor: move; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px; user-select: none; }
        #vip-drag-btn:hover { background: #f5222d; }
        #vip-popover { position: fixed; top: 120px; right: 30px; z-index: 2000; width: 160px; max-height: 360px; overflow: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.2); padding: 8px 0; display: none; }
        .vip-item { padding: 6px 10px; cursor: pointer; font-size: 10px; width: 150px; color: #333; white-space: normal; word-wrap: break-word; overflow: visible; border-bottom: 1px solid #eee; }
        .vip-item:hover { background: #f5f5f5; }
      `;
      document.head.appendChild(style);

      // 若按钮已存在则不重复添加
      if (!document.getElementById('vip-drag-btn')) {
        const btn = document.createElement('button');
        btn.id = 'vip-drag-btn';
        btn.textContent = 'VIP';
        document.body.appendChild(btn);
      }

      if (!document.getElementById('vip-popover')) {
        const pop = document.createElement('div');
        pop.id = 'vip-popover';
        document.body.appendChild(pop);
      }

      const prefixes = vlist.list.map(i => i.url).filter(Boolean);
      const isParser = (u) => prefixes.some(p => typeof p === 'string' && u.startsWith(p));
      const extract = (u) => {
        try {
          const parsed = new URL(u);
          for (const v of parsed.searchParams.values()) {
            const dec = decodeURIComponent(v || '');
            if (dec.startsWith('http://') || dec.startsWith('https://')) return dec;
          }
          const first = [...parsed.searchParams.values()][0];
          return first ? decodeURIComponent(first) : u;
        } catch { return u; }
      };

      function render() {
        const frag = document.createDocumentFragment();
        vlist.list.forEach((it, idx) => {
          const el = document.createElement('div');
          el.className = 'vip-item';
          el.textContent = it.name || `解析${idx+1}`;
          el.addEventListener('click', () => {
            const now = location.href || '';
            const base = isParser(now) ? extract(now) : now;
            const target = (it.url || '') ? ('' + it.url + base) : base;
            location.href = target;
            const popEl = document.getElementById('vip-popover');
            if (popEl) popEl.style.display = 'none';
          });
          frag.appendChild(el);
        });
        const popEl = document.getElementById('vip-popover');
        if (popEl) {
          popEl.innerHTML = '';
          popEl.appendChild(frag);
        }
      }

      render();

      const btnEl = document.getElementById('vip-drag-btn');
      const popEl = document.getElementById('vip-popover');
      if (btnEl && popEl) {
        btnEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const curr = (typeof getComputedStyle === 'function') ? getComputedStyle(popEl).display : popEl.style.display;
          popEl.style.display = curr === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
          if (popEl.style.display === 'block' && e.target !== popEl && e.target !== btnEl && !popEl.contains(e.target)) {
            popEl.style.display = 'none';
          }
        });
      }
    }
  } catch (_) {}
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('[child_preload] DOMContentLoaded');
  ensureVipInjected();
});

window.addEventListener('load', () => {
  console.log('[child_preload] load');
  // 某些站点在 load 后重绘 DOM，保证注入一次
  if (!document.getElementById('vip-drag-btn')) {
    ensureVipInjected();
  }
});

// DOM 大幅变动时若按钮被移除，尝试再注入
const mo = new MutationObserver(() => {
  if (!document.getElementById('vip-drag-btn')) {
    ensureVipInjected();
  }
});
try { mo.observe(document.documentElement || document.body, { childList: true, subtree: true }); } catch (_) {}

contextBridge.exposeInMainWorld('vipChildReady', true);


