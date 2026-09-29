const { contextBridge } = require('electron');
console.log('[child_preload] loaded');

// 暴露后台测速能力给注入脚本使用（结果通过 IPC 回推到本窗口）
try {
  if (!window.__VIP_SPEED__) {
    const { ipcRenderer } = require('electron');
    window.__VIP_SPEED__ = {
      start: (opts) => ipcRenderer.send('speed:start', opts || {}),
      cancel: () => ipcRenderer.send('speed:cancel'),
      history: () => (typeof ipcRenderer.invoke === 'function' ? ipcRenderer.invoke('speed:history:get') : Promise.resolve(null)),
      clearHistory: () => ipcRenderer.send('speed:history:clear'),
      openExternal: (url) => ipcRenderer.send('open-external', url),
      on: (channel, cb) => ipcRenderer.on(channel, (_e, payload) => { try { cb(payload); } catch (err) { } }),
    };
  }
} catch (e) {
  console.warn('[child_preload] expose __VIP_SPEED__ failed', e);
}

// 等到文档加载后，从父窗口同步 vlist.json 内容并注入 VIP 按钮
let fallbackScheduled = false;

function ensureVipInjected() {
  try {
    // 完整 UI（含测速入口）已由 vipWindow.js 注入，不再重复构建
    if (window.__VIP_UI_FULL__) return;

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
      return;
    }

    if (!vlist || !Array.isArray(vlist.list) || !vlist.list.length) return;

    // 稍等 vipWindow.js 的完整注入；若它没成功，再用同一份 vipUI 脚本兜底
    if (fallbackScheduled) return;
    fallbackScheduled = true;
    setTimeout(() => {
      if (window.__VIP_UI_FULL__) return;
      try {
        const { buildScript } = require('./vipUI');
        // eslint-disable-next-line no-eval
        eval(buildScript(vlist, true));
        console.log('[child_preload] fallback inject via vipUI');
      } catch (e) { console.warn('[child_preload] fallback inject failed', e); }
    }, 800);
  } catch (_) { }
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
try { mo.observe(document.documentElement || document.body, { childList: true, subtree: true }); } catch (_) { }

contextBridge.exposeInMainWorld('vipChildReady', true);
