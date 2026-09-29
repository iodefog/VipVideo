'use strict';

// VIP 浮层 UI 脚本生成器：子窗口、preload 回退共用同一份实现（含测速入口）
function buildScript(vlistArray, canShowVip) {

  // 兼容传入数组或 { list: [...] }，避免传错类型导致列表为空
  const list = Array.isArray(vlistArray)
    ? vlistArray
    : (vlistArray && Array.isArray(vlistArray.list) ? vlistArray.list : []);

  // 1. CSS样式添加
  const css = `
    #back-button { position: fixed; top: 70px; left: 30px; z-index: 2147483647; width: 44px; height: 44px; border-radius: 22px; background: #1890ff; color: #fff; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: block; text-align: center; line-height: 44px; font-size: 18px; font-weight: bold; user-select: none; }
    #back-button:hover { background: #40a9ff; }
    #vip-drag-btn { position: fixed; top: 70px; right: 30px; z-index: 2147483647; width: 44px; height: 44px; border-radius: 22px; background: #ff4d4f; color: #fff; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 16px; user-select: none; }
    #vip-drag-btn:hover { background: #f5222d; }
    #vip-popover { position: fixed; top: 120px; right: 30px; z-index: 2147483647; width: 160px; max-height: 360px; overflow: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.2); padding: 8px 0; display: none; }
    .vip-item { padding: 6px 10px; cursor: pointer; font-size: 12px; width: 150px; color: #333; white-space: normal; word-wrap: break-word; overflow: visible; border-bottom: 1px solid #eee; }
    .vip-item:hover { background: #f5f5f5; }
    .vip-speed-btn { margin: 2px 6px 6px; padding: 6px 10px; text-align: center; font-size: 12px; color: #fff; background: #1890ff; border-radius: 6px; cursor: pointer; }
    .vip-speed-btn:hover { background: #40a9ff; }
    .vip-speed-btn.running { background: #fa541c; }
    .vip-speed-btn-row { display: flex; gap: 6px; margin: 2px 6px 6px; }
    .vip-speed-btn-row .vip-speed-btn { flex: 1; margin: 0; }
    .vip-history-btn { padding: 6px 8px; text-align: center; font-size: 14px; line-height: 1.2; color: #fff; background: #722ed1; border-radius: 6px; cursor: pointer; }
    .vip-history-btn:hover { background: #9254de; }
    .vip-ext-btn { padding: 6px 8px; text-align: center; font-size: 14px; line-height: 1.2; color: #fff; background: #13c2c2; border-radius: 6px; cursor: pointer; }
    .vip-ext-btn:hover { background: #36cfc9; }
    .sp-history-bar { margin-bottom: 8px; padding: 6px 8px; background: #f9f0ff; border: 1px solid #efdbff; border-radius: 6px; color: #531dab; line-height: 1.6; }
    .sp-link { color: #1890ff; cursor: pointer; text-decoration: underline; }
    #vip-speed-panel { position: fixed; top: 40px; right: 40px; z-index: 2147483647; width: 620px; max-height: 72vh; background: #ffffff; color: #333; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.28); display: none; flex-direction: column; font-size: 12px; overflow: hidden; }
    #vip-speed-panel-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #eee; }
    #vip-speed-panel-status { flex: 1; color: #666; }
    #vip-speed-panel-body { flex: 1; overflow: auto; padding: 8px 10px; }
    #vip-speed-panel table { width: 100%; border-collapse: collapse; }
    #vip-speed-panel th, #vip-speed-panel td { padding: 5px 6px; border-bottom: 1px solid #f0f0f0; text-align: center; white-space: nowrap; }
    #vip-speed-panel tr.vip-speed-row { cursor: pointer; }
    #vip-speed-panel tr.vip-speed-row:hover { background: #f5f5f5; }
    #vip-speed-panel .sp-name { text-align: left; max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
    #vip-speed-panel .sp-score { font-weight: 600; }
    #vip-speed-panel .sp-pending { color: #c8c8c8; }
    #vip-speed-panel .sp-legend { margin-top: 8px; color: #888; line-height: 1.6; }
    .vip-score { color: #1890ff; font-weight: 600; }
    #vip-speed-mini { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; display: none; align-items: center; gap: 6px; padding: 7px 14px; background: #1890ff; color: #fff; border-radius: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.25); font-size: 12px; cursor: pointer; }
    #vip-speed-mini:hover { background: #40a9ff; }
    #vip-speed-mini .sp-mini-dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: spmini 1s infinite ease-in-out; }
    @keyframes spmini { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
  `;
  const injected = `(() => {
    try {
      window.__VIP_UI_FULL__ = true;
      const list = ${JSON.stringify(list)};
      const canShowVip = ${JSON.stringify(canShowVip)};
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

      if (canShowVip) {
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

        // ---- 后台测速：不跳转当前页面，结果表格可直接点击切换线路 ----
        var bridge = window.__VIP_SPEED__ || null;
        var spPanel = null, spStatus = null, spBody = null, spRunning = false, spBound = false;
        var spMini = null, spMiniText = null, spMiniLabel = '', spHasResult = false;

        function spEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
        function spIsOrigin(n) { return /^原地址/.test(String(n || '')); }
        function spDisplayName(n) { return spIsOrigin(n) ? '原地址' : String(n || ''); }
        function spIcon(st) {
          if (st === 'PASS') return '<span style="color:#52c41a;font-weight:600">✅</span>';
          if (st === 'MEDIA') return '⚠️';
          if (st === 'FAKE') return '<span style="color:#ff4d4f;font-weight:600" title="试看/假视频，不算通过">🚫</span>';
          return '<span style="color:#bfbfbf">❌</span>';
        }

        function spEnsurePanel() {
          if (spPanel) return;
          spPanel = document.createElement('div');
          spPanel.id = 'vip-speed-panel';
          spPanel.innerHTML = '<div id="vip-speed-panel-head"><span>线路测速</span><span id="vip-speed-panel-status">准备就绪</span><button id="vip-speed-panel-stop">停止</button><button id="vip-speed-panel-close">×</button></div><div id="vip-speed-panel-body"></div>';
          document.body.appendChild(spPanel);
          spStatus = spPanel.querySelector('#vip-speed-panel-status');
          spBody = spPanel.querySelector('#vip-speed-panel-body');
          spPanel.querySelector('#vip-speed-panel-close').addEventListener('click', function () { spPanel.style.display = 'none'; spSyncMini(); });
          spPanel.querySelector('#vip-speed-panel-stop').addEventListener('click', function () { if (bridge) bridge.cancel(); });

          // 面板关掉后右下角保留回到测速的入口
          if (!document.getElementById('vip-speed-mini')) {
            spMini = document.createElement('div');
            spMini.id = 'vip-speed-mini';
            spMini.innerHTML = '<span class="sp-mini-dot"></span><span id="vip-speed-mini-text">后台测速中…</span>';
            document.body.appendChild(spMini);
            spMiniText = spMini.querySelector('#vip-speed-mini-text');
            spMini.addEventListener('click', function () { spEnsurePanel(); spPanel.style.display = 'flex'; spSyncMini(); });
          }
        }

        // 面板被关掉时右下角保留入口：跑的过程中显示进度，跑完显示「查看结果」
        function spSyncMini() {
          if (!spMini) return;
          var hidden = spPanel && spPanel.style.display === 'none';
          var shown = hidden && (spRunning || spHasResult);
          spMini.style.display = shown ? 'flex' : 'none';
          if (!shown || !spMiniText) return;
          spMiniText.textContent = spRunning ? (spMiniLabel || '后台测速中…（点击查看进度）') : '测速完成（查看结果）';
        }

        function spApplyRow(row) {
          var it = null;
          for (var k = 0; k < list.length; k++) { if (list[k] && list[k].url === row.url) { it = list[k]; break; } }
          it = it || { name: row.name, url: row.url };
          if (it && it.url) {
            location.href = '' + it.url + (window.__VIP_ORIGINAL__ || location.href || '');
          }
          if (spPanel) spPanel.style.display = 'none';
          spSyncMini();
          pop.style.display = 'none';
        }

        var spVideos = [], spRows = {}, spRenderTimer = null, spLabels = [], spItems = [];

        function spRowGet(name, url) {
          var r = spRows[name];
          if (!r) { r = { name: name, url: url || '', detail: {}, reasons: {} }; spRows[name] = r; }
          else if (!r.url && url) r.url = url;
          return r;
        }
        function spScore(r) {
          var s = 0;
          for (var k in r.detail) { if (r.detail[k] === 'PASS') s += 1; else if (r.detail[k] === 'MEDIA') s += 0.5; }
          return s;
        }
        function spTested(r) { var n = 0; for (var k in r.detail) n++; return n; }
        function spSorted() {
          var arr = [];
          for (var k in spRows) arr.push(spRows[k]);
          arr.sort(function (a, b) { return spScore(b) - spScore(a); });
          return arr;
        }
        function spCollect(it) {
          if (!it || !it.parser) return;
          if (it.video && spVideos.indexOf(it.video) === -1) spVideos.push(it.video);
          var r = spRowGet(it.parser, it.apiUrl || it.url || '');
          if (it.video) {
            r.detail[it.video] = it.status || 'FAIL';
            if (it.reason) r.reasons[it.video] = it.reason;
          }
        }
        function spSchedule() {
          if (spRenderTimer) return;
          spRenderTimer = setTimeout(function () { spRenderTimer = null; spRenderTable(); spRefreshLabels(); }, 400);
        }

        // 实时渲染同一张表格（未测站点显示 · ，得分按已测项累加）
        function spRenderTable() {
          if (!spBody) return;
          var rows = spSorted();
          if (!rows.length) { spBody.innerHTML = '<div class="sp-legend">等待第一批结果…</div>'; return; }
          var head = '<thead><tr><th class="sp-name">线路（点击行可直接应用）</th>' +
            spVideos.map(function (v) { return '<th>' + spEsc(v) + '</th>'; }).join('') + '<th>得分</th></tr></thead>';
          var body = rows.map(function (row) {
            var cells = spVideos.map(function (v) {
              var st = row.detail[v];
              if (!st) return '<td class="sp-pending">·</td>';
              return '<td title="' + spEsc(row.name + ' / ' + v + ' → ' + (row.reasons[v] || '')) + '">' + spIcon(st) + '</td>';
            }).join('');
            var score = spTested(row) ? spScore(row) : '·';
            return '<tr class="vip-speed-row" data-name="' + spEsc(row.name) + '"><td class="sp-name" title="' + spEsc(row.url) + '">' +
              spEsc(row.name) + '</td>' + cells + '<td class="sp-score">' + score + '</td></tr>';
          }).join('');
          spBody.innerHTML = '<table>' + head + '<tbody>' + body + '</tbody></table>' +
            '<div class="sp-legend">' + (spRunning ? '实时更新中…' : '测速完成') + '　✅ 正片可播放(1分)　⚠️ 有流未起播(0.5分)　🚫 试看/假视频(0分)　❌ 无效(0分)　· 待测　满分 ' + spVideos.length + ' 分<br>正片不足 10 分钟或页面含「试看/预告片」字样即判试看片，不给分。<br>结果仅供参考，部分线路存在登录/防盗链或临时限流。</div>';
          Array.prototype.forEach.call(spBody.querySelectorAll('tr.vip-speed-row'), function (tr) {
            tr.addEventListener('click', function () {
              var row = spRows[tr.getAttribute('data-name')];
              if (row) spApplyRow(row);
            });
          });
        }

        // VIP 列表项后面实时补上得分，如「默认A--4分」
        function spRefreshLabels() {
          spLabels.forEach(function (o) {
            var r = spRows[o.name];
            o.el.innerHTML = spEsc(o.base) + (r && spTested(r) ? '<span class="vip-score">--' + spScore(r) + '分</span>' : '');
          });
          spSortItems();
        }

        // 有分数的按分数倒序在前，没测过的保持原始顺序排在后
        // 测速过程中不重排，避免鼠标下方的行来回跳动
        function spSortItems(boxEl) {
          var box = boxEl || document.getElementById('vip-item-box');
          if (!box || !spItems.length || spRunning) return;
          var originIndex = {};
          list.forEach(function (it, i) { originIndex[(it && it.name) || ''] = i; });
          var order = spItems.slice().sort(function (a, b) {
            // 「原地址-（提示：…）」简化后垫底，不再永远排第一
            var oa = spIsOrigin(a.name) ? 1 : 0, ob = spIsOrigin(b.name) ? 1 : 0;
            if (oa !== ob) return oa - ob;
            var ra = spRows[a.name], rb = spRows[b.name];
            var sa = (ra && spTested(ra)) ? spScore(ra) : null;
            var sb = (rb && spTested(rb)) ? spScore(rb) : null;
            if (sa === null && sb === null) return (originIndex[a.name] || 0) - (originIndex[b.name] || 0);
            if (sa === null) return 1;
            if (sb === null) return -1;
            return sb - sa;
          });
          order.forEach(function (o) { box.appendChild(o.el); });
        }

        // ---------------- 本地缓存的上次测速结果（📚 查看） ----------------
        var spCachedAt = 0;

        function spPad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

        function spCacheTime(ts) {
          if (!ts) return '未知时间';
          var d = new Date(ts), diff = Date.now() - ts, ago = '刚刚';
          if (diff >= 86400000) ago = Math.floor(diff / 86400000) + ' 天前';
          else if (diff >= 3600000) ago = Math.floor(diff / 3600000) + ' 小时前';
          else if (diff >= 60000) ago = Math.floor(diff / 60000) + ' 分钟前';
          return d.getFullYear() + '-' + spPad2(d.getMonth() + 1) + '-' + spPad2(d.getDate()) + ' ' + spPad2(d.getHours()) + ':' + spPad2(d.getMinutes()) + '（' + ago + '）';
        }

        function spApplyHistory(h) {
          if (!h || !h.rows || !h.rows.length) return false;
          spEnsurePanel();
          spVideos = []; spRows = {};
          (h.videos || []).forEach(function (v) { if (spVideos.indexOf(v) === -1) spVideos.push(v); });
          // 已删除的线路不再显示，避免缓存里残留脏数据
          var known = {};
          list.forEach(function (it) { if (it && it.name) known[it.name] = 1; });
          h.rows.filter(function (r) { return !Object.keys(known).length || known[r.name]; }).forEach(function (r) {
            var row = spRowGet(r.name, r.url || '');
            row.detail = Object.assign({}, r.detail || {});
            row.reasons = Object.assign({}, r.reasons || {});
          });
          spCachedAt = h.updatedAt || 0;
          spRefreshLabels();
          return true;
        }

        function spShowHistory() {
          spEnsurePanel();
          if (!bridge || typeof bridge.history !== 'function') {
            if (spStatus) spStatus.textContent = '当前窗口暂不支持读取缓存';
            spBody.innerHTML = '<div class="sp-legend">无法读取本地缓存（缺少桥接）。</div>';
            spPanel.style.display = 'flex';
            return;
          }
          bridge.history().then(function (h) {
            if (!spApplyHistory(h)) {
              spBody.innerHTML = '<div class="sp-legend">还没有缓存的测速结果，先点「测速排序」跑一轮即可。</div>';
              if (spStatus) spStatus.textContent = '无历史结果';
              spPanel.style.display = 'flex';
              return;
            }
            spRenderTable();
            spBody.insertAdjacentHTML('afterbegin', '<div class="sp-history-bar">本地缓存的上次测速结果：<b>' + spEsc(spCacheTime(spCachedAt)) + '</b>　<span class="sp-link" id="sp-history-rerun">重新测速</span>　<span class="sp-link" id="sp-history-clear">清除缓存</span></div>');
            var rt = document.getElementById('sp-history-rerun');
            var ct = document.getElementById('sp-history-clear');
            if (rt) rt.addEventListener('click', function () { if (!spRunning) spToggle(); });
            if (ct) ct.addEventListener('click', function () {
              if (bridge && bridge.clearHistory) bridge.clearHistory();
              spVideos = []; spRows = {}; spCachedAt = 0; spRefreshLabels();
              spBody.innerHTML = '<div class="sp-legend">本地缓存已清除</div>';
              if (spStatus) spStatus.textContent = '缓存已清除';
            });
            if (spStatus) spStatus.textContent = '历史结果（' + spCacheTime(spCachedAt) + '）';
            spPanel.style.display = 'flex';
            spSyncMini();
          }).catch(function () {
            if (spStatus) spStatus.textContent = '读取缓存失败';
          });
        }

        function spUpdateLabel() {
          var b = document.getElementById('vip-speed-btn-inside');
          if (b) { b.textContent = spRunning ? '查看进度' : '测速排序'; b.className = 'vip-speed-btn'; }
        }

        function spBind() {
          if (!bridge || spBound) return;
          spBound = true;
          bridge.on('speed:progress', function (p) {
            if (spStatus) spStatus.textContent = '测速中 ' + p.done + '/' + p.total + '　' + p.current.parser + ' - ' + p.current.video + ' ' + p.current.status;
            spMiniLabel = '测速中 ' + p.done + '/' + p.total + '（点击查看）';
            spSyncMini();
            try { spCollect(p.current); spSchedule(); } catch (e) { }
          });
          bridge.on('speed:done', function (payload) {
            spRunning = false; spHasResult = true; spUpdateLabel();
            if (spStatus) spStatus.textContent = ((payload && payload.cancelled) ? '已停止' : '测速完成') + '，用时 ' + Math.round(((payload && payload.elapsedMs) || 0) / 1000) + 's';
            ((payload && payload.summary) || []).forEach(function (row) {
              var r = spRowGet(row.name, row.url);
              Object.keys(row.detail || {}).forEach(function (v) {
                if (spVideos.indexOf(v) === -1) spVideos.push(v);
                if (!r.detail[v]) r.detail[v] = row.detail[v];
              });
            });
            if (spRenderTimer) { clearTimeout(spRenderTimer); spRenderTimer = null; }
            spRenderTable();
            spRefreshLabels();
            spSyncMini();
          });
          bridge.on('speed:busy', function () { if (spStatus) spStatus.textContent = '已有一轮测速在跑'; });
        }

        function spToggle() {
          spEnsurePanel(); spBind();
          if (!bridge) { if (spStatus) spStatus.textContent = '当前窗口不支持测速'; spPanel.style.display = 'flex'; return; }
          if (spRunning) {
            // 正在跑时只负责打开/收起面板，停止请在面板内点「停止」
            if (spPanel.style.display === 'flex') { spPanel.style.display = 'none'; spSyncMini(); }
            else { spPanel.style.display = 'flex'; spSyncMini(); }
            return;
          }
          spRunning = true; spHasResult = false; spUpdateLabel();
          spVideos = []; spRows = {};
          spBody.innerHTML = '<div class="sp-legend">正在后台测速（隐藏窗口），当前页面不受影响…</div>';
          spPanel.style.display = 'flex';
          spSyncMini();
          bridge.start({ concurrency: 2, timeout: 18, wait: 10 });
        }

        function render() {
          const frag = document.createDocumentFragment();
          const btnRow = document.createElement('div');
          btnRow.className = 'vip-speed-btn-row';
          const spBtn = document.createElement('div');
          spBtn.className = 'vip-speed-btn';
          spBtn.id = 'vip-speed-btn-inside';
          spBtn.textContent = '测速排序';
          spBtn.addEventListener('click', function (e) { e.stopPropagation(); spToggle(); });
          btnRow.appendChild(spBtn);
          const histBtn = document.createElement('div');
          histBtn.className = 'vip-history-btn';
          histBtn.id = 'vip-history-btn-inside';
          histBtn.textContent = '📚';
          histBtn.title = '查看上次测速结果（本地缓存）';
          histBtn.addEventListener('click', function (e) { e.stopPropagation(); spShowHistory(); });
          btnRow.appendChild(histBtn);
          const extBtn = document.createElement('div');
          extBtn.className = 'vip-ext-btn';
          extBtn.id = 'vip-ext-btn-inside';
          extBtn.textContent = '🌐';
          extBtn.title = '用系统浏览器打开当前页面';
          extBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var u = location.href || '';
            if (!u) return;
            if (bridge && typeof bridge.openExternal === 'function') bridge.openExternal(u);
          });
          btnRow.appendChild(extBtn);
          frag.appendChild(btnRow);
          const spDivider = document.createElement('div');
          spDivider.className = 'vip-item';
          spDivider.style.cssText = 'padding:0;margin:6px 0;height:1px;background:#eee;cursor:default;';
          frag.appendChild(spDivider);
          spLabels.length = 0;
          spItems.length = 0;
          const spItemBox = document.createElement('div');
          spItemBox.id = 'vip-item-box';
          list.forEach((it, idx) => {
            const el = document.createElement('div');
            el.className = 'vip-item';
            const baseName = (it && it.name) ? spDisplayName(it.name) : ('解析' + (idx + 1));
            el.title = (it && it.name) ? it.name : '';
            el.innerHTML = spEsc(baseName);
            if (it && it.name) {
              spLabels.push({ el: el, name: it.name, base: baseName });
              spItems.push({ el: el, name: it.name });
            }
            el.addEventListener('click', function() {
              var now = location.href || '';
              // 优先使用保留的原始 URL，确保多次解析仍基于原始内容地址
              var baseCandidate = window.__VIP_ORIGINAL__ || now;
              var base = isParser(baseCandidate) ? extract(baseCandidate) : baseCandidate;
              var target = (it && it.url) ? ('' + it.url + base) : base;
              location.href = target;
              pop.style.display = 'none';
            });
            spItemBox.appendChild(el);
          });
          frag.appendChild(spItemBox);
          spSortItems(spItemBox);
          if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'vip-item';
            empty.style.color = '#999';
            empty.textContent = '暂无线路数据';
            frag.appendChild(empty);
          }
          pop.innerHTML = '';
          pop.appendChild(frag);
        }

        render();

        // 启动时静默读回本地缓存的上次结果，列表直接带分（不弹面板）
        try {
          if (bridge && typeof bridge.history === 'function') {
            bridge.history().then(function (h) { spApplyHistory(h); }).catch(function () { });
          }
        } catch (e) { }

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          var curr = (typeof getComputedStyle === 'function') ? getComputedStyle(pop).display : pop.style.display;
          pop.style.display = (curr === 'none') ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
          if (pop instanceof Node && btn instanceof Node && pop.style.display === 'block' && e.target !== pop && e.target !== btn && !pop.contains(e.target)) {
            pop.style.display = 'none';
          }
        });
      }
    } catch (e) { console.warn('VIP inject failed:', e); }
  })();`;
  return injected;
}

module.exports = { buildScript };
