const { ipcRenderer } = require('electron');
console.log('[preload] loaded');

window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] DOMContentLoaded');
});

// 将需要注入子窗口的脚本导出给 child_preload 使用（与 vipWindow 共用同一份实现）
window.__VIP_INJECTOR__ = {
  inject: (vlist) => {
    try {
      if (window.__VIP_UI_FULL__) return;
      const list = Array.isArray(vlist && vlist.list) ? vlist.list : [];
      console.log('[preload] inject called, list size:', list.length);
      const { buildScript } = require('./vipUI');
      // eslint-disable-next-line no-eval
      eval(buildScript(list, true));
    } catch (e) {
      console.warn('[preload] inject failed', e);
    }
  }
};
