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

  // 多线路选择页（邦宁云播 / getplayer 这类）：
  // 站点把点击事件绑在卡片下方那行「↑ 选择这个视频继续播放」上，
  // 视频本身是跨域 iframe，点它点击不会冒泡到父页面 → 用户点了没反应。
  // 这里给每张卡片顶部加一条明显的按钮条，并把点击转发给原来的 .tip
  function enhanceLinePicker() {
    try {
      var cards = document.querySelectorAll('.lineObj');
      if (!cards.length || !document.querySelector('.lineObj .tip')) return;
      cards.forEach(function (card) {
        if (card.__vipPickerBar) return;
        var tip = card.querySelector('.tip');
        if (!tip) return;
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';

        var bar = document.createElement('div');
        bar.className = 'vip-picker-bar';
        bar.textContent = '▶ 用这条线路播放';
        bar.style.cssText = 'position:absolute;left:0;right:0;top:0;height:26px;z-index:9999;' +
          'background:rgba(0,0,0,0.62);color:#fff;font:13px/26px -apple-system,sans-serif;' +
          'text-align:center;cursor:pointer;pointer-events:auto;user-select:none;';
        bar.addEventListener('click', function (e) {
          e.stopPropagation();
          try { tip.click(); } catch (_) { }
          // 选完就把所有按钮条撤掉，避免挡住播放器
          document.querySelectorAll('.vip-picker-bar').forEach(function (b) { b.remove(); });
        });
        card.appendChild(bar);
        card.__vipPickerBar = true;

        // 卡片空白处（视频以外）也允许选中，转发给站点自己的 .tip
        card.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('.vip-picker-bar')) return;
          try { tip.click(); } catch (_) { }
        });
      });
    } catch (e) {
      // ignore
    }
  }

  // Try early and retry a few times as the site bootstraps
  defineSafeTopPlayer();
  window.addEventListener('DOMContentLoaded', function () { defineSafeTopPlayer(); enhanceLinePicker(); });
  window.addEventListener('load', function () { defineSafeTopPlayer(); enhanceLinePicker(); });
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    defineSafeTopPlayer();
    if (tries <= 20) enhanceLinePicker();
    if (tries > 20) clearInterval(timer);
  }, 500);
})();
