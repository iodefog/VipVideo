const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.on('get-current-url', (event, vipUrl) => {
    const currentUrl = document.location.href; // 获取当前 WebView 的 URL
    ipcRenderer.send('current-url', currentUrl); // 发送给主进程
  });
});
