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

  // Try early and retry a few times as the site bootstraps
  defineSafeTopPlayer();
  window.addEventListener('DOMContentLoaded', defineSafeTopPlayer);
  window.addEventListener('load', defineSafeTopPlayer);
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    defineSafeTopPlayer();
    if (tries > 20) clearInterval(timer);
  }, 500);
})();


