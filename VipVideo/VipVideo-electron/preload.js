const { ipcRenderer } = require('electron');
console.log('[preload] loaded');

window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] DOMContentLoaded');
});

// 将需要注入子窗口的脚本导出给 child_preload 使用
window.__VIP_INJECTOR__ = {
  inject: (vlist) => {
    try {
      console.log('[preload] inject called, list size:', Array.isArray(vlist?.list) ? vlist.list.length : 'n/a');
      const list = Array.isArray(vlist?.list) ? vlist.list : [];

      const style = document.createElement('style');
      style.textContent = `
        #vip-drag-btn { position: fixed; top: 70px; right: 30px; z-index: 2000; width: 44px; height: 44px; border-radius: 22px; background: #ff4d4f; color: #fff; border: none; cursor: move; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px; user-select: none; }
        #vip-drag-btn:hover { background: #f5222d; }
        #vip-popover { position: fixed; top: 120px; right: 30px; z-index: 2000; width: 160px; max-height: 360px; overflow: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.2); padding: 8px 0; display: none; }
        .vip-item { padding: 6px 10px; cursor: pointer; font-size: 10px; width: 150px; color: #333; white-space: normal; word-wrap: break-word; overflow: visible; border-bottom: 1px solid #eee; }
        .vip-item:hover { background: #f5f5f5; }
      `;
      document.head.appendChild(style);

      const btn = document.createElement('button');
      btn.id = 'vip-drag-btn';
      btn.textContent = 'VIP';
      document.body.appendChild(btn);
      console.log('[preload] VIP button appended');

      const pop = document.createElement('div');
      pop.id = 'vip-popover';
      document.body.appendChild(pop);

      const prefixes = list.map(i => i.url).filter(Boolean);
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
        list.forEach((it, idx) => {
          const el = document.createElement('div');
          el.className = 'vip-item';
          el.textContent = it.name || `解析${idx+1}`;
          el.addEventListener('click', () => {
            const now = location.href || '';
            const base = isParser(now) ? extract(now) : now;
            const target = (it.url || '') ? `${it.url}${encodeURIComponent(base)}` : base;
            location.href = target;
            pop.style.display = 'none';
          });
          frag.appendChild(el);
        });
        pop.innerHTML = '';
        pop.appendChild(frag);
      }

      render();
      console.log('[preload] VIP list rendered');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', (e) => {
        if (pop.style.display === 'block' && e.target !== pop && e.target !== btn && !pop.contains(e.target)) {
          pop.style.display = 'none';
        }
      });

      // 简易拖拽（无长按）
      let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
      btn.addEventListener('mousedown', (e) => {
        dragging = true; sx = e.clientX; sy = e.clientY;
        const r = btn.getBoundingClientRect(); sl = r.left; st = r.top; e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return; const dx = e.clientX - sx; const dy = e.clientY - sy;
        const nl = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, sl + dx));
        const nt = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, st + dy));
        btn.style.left = `${nl}px`; btn.style.top = `${nt}px`; btn.style.right = 'auto';
      });
      window.addEventListener('mouseup', () => { dragging = false; });
    } catch (e) { /* ignore */ }
  }
};
