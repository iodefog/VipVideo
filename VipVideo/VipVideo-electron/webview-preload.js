(function () {
  function defineSafeTopPlayer() {
    try {
      var t = window.top;
      if (!t) return;
      if (!t.player) t.player = {};
      if (typeof t.player.addTo !== 'function') {
        t.player.addTo = function () { return false; };
      }
    } catch (e) {
      // cross-origin or not available yet
    }
  }

  // 页面启动阶段做少量重试，避免旧播放器脚本初始化顺序不同。
  defineSafeTopPlayer();
  window.addEventListener('DOMContentLoaded', defineSafeTopPlayer);
  window.addEventListener('load', defineSafeTopPlayer);
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    defineSafeTopPlayer();
    if (tries > 6) clearInterval(timer);
  }, 500);
})();

