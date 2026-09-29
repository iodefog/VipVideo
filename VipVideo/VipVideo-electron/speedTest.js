/**
 * 解析线路后台测速引擎（主进程）
 *
 * 设计要点：
 * 1. 不打断用户当前浏览：所有测试在隐藏 BrowserWindow 中进行，主线程现有页面毫不变动
 * 2. 低资源占用：默认并发 2 个窗口，每条用例硬性超时后立刻销毁窗口
 * 3. 判定与应用行为一致：目标地址 = 线路 url + 原始视频 url（不做 encode）
 * 4. 判定等级：PASS（真的播起来了）/ MEDIA（有流但未起播）/ FAIL（无解）
 */

const { BrowserWindow, session } = require('electron');

// 默认测试样本：覆盖主流 VIP 平台
const DEFAULT_SAMPLES = [
  { name: '爱奇艺', url: 'https://www.iqiyi.com/v_19rrjaux6c.html' },
  { name: '腾讯视频', url: 'https://v.qq.com/x/cover/zg7bhyyc1ffeha0/w0024dc6n9f.html' },
  { name: '芒果TV', url: 'https://www.mgtv.com/h/552685' },
  { name: '优酷', url: 'https://v.youku.com/v_show/id_XMjg1MzEyMjk2OA==.html' },
  { name: 'bilibili', url: 'https://www.bilibili.com/bangumi/play/ep291708' },
];

const MEDIA_URL_RE = /\.(m3u8|mp4|ts|flv|mkv|m4s|webm|mov)(\?|#|$)/i;
const TEST_PARTITION = 'persist:speedtest';

// 每条用例在页面里执行的探针：收集 video 元素状态并尝试静音自动播放
const PROBE_JS = `(() => { try {
  const out = [];
  document.querySelectorAll('video').forEach(v => {
    try { v.muted = true; if (v.paused && v.readyState > 0) { const p = v.play(); if (p && p.catch) p.catch(()=>{}); } } catch (e) {}
    out.push({ src: v.currentSrc || v.src || '', rs: v.readyState, ct: v.currentTime || 0, paused: v.paused, w: v.videoWidth || 0,
      dur: (isFinite(v.duration) ? v.duration : 0), err: v.error ? v.error.code : 0 });
  });
  return out;
} catch (e) { return []; } })()`;

// 页面文本探针：识别「试看 / 预告 / 假视频」等字样
const PAGE_TEXT_JS = `(() => { try {
  const t = (document.body && document.body.innerText ? document.body.innerText.slice(0, 3000) : '');
  return (t || document.title || '').replace(/\\s+/g, ' ');
} catch (e) { return ''; } })()`;

// 试看/预告/假视频特征：正片时长远短于样本正常时长（这些样本都是长视频）
const MIN_REAL_DURATION_SEC = 600; // 10 分钟：3 分钟试看片、5 分钟片花都会被拦下
const FAKE_TEXT_RE = /试看|试播|预告片|片花|抢先看|预览版|精彩预告|开通会员观看完整|会员完整版|免费观看.{0,6}分钟/;

// 部分线路（如 im1907 / m1907）会先弹「是否播放此视频？」确认页，
// 不点一下就不会加载播放器，自动化测速必须替用户点这个按钮
const AUTOSTART_JS = `(() => { try {
  const clicked = [];
  const RE = /播放|确定|确认|继续|开始|立即|进入|GO|Play|OK/i;
  const cands = document.querySelectorAll('a,button,input,span,div,li,p');
  for (const el of cands) {
    if (clicked.length >= 3) break;
    const t = ((el.innerText || el.value || el.textContent || '') + '').trim();
    if (!t || t.length > 24) continue;
    if (!RE.test(t)) continue;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (r && r.width === 0 && r.height === 0) continue;
    try { el.click(); clicked.push(t.slice(0, 16)); } catch (e) { }
  }
  return clicked;
} catch (e) { return []; } })()`;

function detectFake(snapshot, text) {
  const d = snapshot.duration || 0;
  if (d > 0 && d < MIN_REAL_DURATION_SEC) {
    return `疑似试看/假视频（时长仅 ${Math.round(d)} 秒）`;
  }
  if (text && FAKE_TEXT_RE.test(text)) {
    const hit = (text.match(FAKE_TEXT_RE) || [''])[0];
    return `疑似试看/假视频（页面含「${hit}」）`;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIMEOUT = Symbol('timeout');
function race(p, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(p).catch((e) => ({ __err: e })),
    new Promise((r) => { timer = setTimeout(() => r(TIMEOUT), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// 记录当前正在跑的用例，用于网络请求归属判断
const activeCases = new Map();
let requestHooked = false;
function hookRequests() {
  if (requestHooked) return;
  requestHooked = true;
  try {
    session.fromPartition(TEST_PARTITION).webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
      const rec = activeCases.get(details.webContentsId);
      if (rec && details.statusCode < 400 && MEDIA_URL_RE.test(details.url)) {
        if (rec.mediaUrls.length < 8) rec.mediaUrls.push(details.url);
      }
    });
  } catch (_) { /* ignore */ }
}

function createTestWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      plugins: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
      partition: TEST_PARTITION,
    },
  });
  try {
    win.webContents.setBackgroundThrottling(false);
    win.webContents.setAudioMuted(true);
  } catch (_) { /* ignore */ }
  return win;
}

function framesOf(win) {
  let frames = [];
  try {
    frames = win.webContents.mainFrame ? win.webContents.mainFrame.framesInSubtree || [] : [];
    if (!frames.length) frames = [win.webContents.mainFrame];
  } catch (_) { frames = []; }
  return frames.filter(Boolean);
}

// 替用户点掉「是否播放此视频？」这类确认链接
async function autoStart(win) {
  for (const frame of framesOf(win)) {
    try { await race(frame.executeJavaScript(AUTOSTART_JS), 3000); } catch (_) { }
  }
}

async function probeOnce(win, budgetMs = 6000) {
  const agg = { videoEls: 0, readyState: 0, currentTime: 0, playing: false, src: '', duration: 0 };
  const frames = framesOf(win);

  for (const frame of frames) {
    if (!frame || frame === null) continue;
    let arr = null;
    try {
      arr = await race(frame.executeJavaScript(PROBE_JS), budgetMs);
    } catch (_) { continue; }
    if (arr === TIMEOUT || !Array.isArray(arr)) continue;
    for (const v of arr) {
      agg.videoEls += 1;
      if (v.rs > agg.readyState) agg.readyState = v.rs;
      if (v.ct > agg.currentTime) { agg.currentTime = v.ct; agg.src = v.src; }
      if (!v.paused && v.rs >= 2 && v.ct > 0) agg.playing = true;
      // 取最长的一个 video 作为正片时长参考（广告/片头通常更短）
      if (v.dur && v.dur < 86400 && v.dur > agg.duration) agg.duration = v.dur;
    }
  }
  return agg;
}

/**
 * 单条用例：线路 × 视频
 */
async function runCase(api, video, opts) {
  const started = Date.now();
  const result = {
    parser: api.name || '(未命名)',
    apiUrl: api.url,
    video: video.name,
    videoUrl: video.url,
    targetUrl: api.url + video.url,
    status: 'FAIL',
    reason: '',
    mediaUrls: [],
    elapsedMs: 0,
  };

  const win = await race(Promise.resolve(createTestWindow()), 10000);
  if (win === TIMEOUT || !win || win.__err) {
    result.reason = '无法创建测试窗口';
    return result;
  }
  const wcId = win.webContents.id;
  activeCases.set(wcId, result);

  let gotoError = null;
  try {
    const loader = (win.webContents && typeof win.webContents.loadURL === 'function')
      ? win.webContents.loadURL.bind(win.webContents)
      : win.loadURL.bind(win);
    const gotoRet = await race(loader(result.targetUrl), opts.gotoTimeout + 2000);
    if (gotoRet === TIMEOUT) gotoError = '加载超时';
    else if (gotoRet && gotoRet.__err) gotoError = String(gotoRet.__err.message || gotoRet.__err).split('\n')[0];
  } catch (e) {
    gotoError = String(e.message || e).split('\n')[0];
  }

  const deadline = Date.now() + opts.wait;
  const snapshot = { videoEls: 0, readyState: 0, currentTime: 0, playing: false, src: '', duration: 0 };
  let autoStartTries = 0;
  try {
    // 先点一次确认页，很多线路点了才会加载播放器
    await autoStart(win);
    while (Date.now() < deadline) {
      const agg = await probeOnce(win);
      if (agg.videoEls > snapshot.videoEls) snapshot.videoEls = agg.videoEls;
      if (agg.readyState > snapshot.readyState) snapshot.readyState = agg.readyState;
      if (agg.currentTime > snapshot.currentTime) { snapshot.currentTime = agg.currentTime; snapshot.src = agg.src; }
      if (agg.duration > snapshot.duration) snapshot.duration = agg.duration;
      if (agg.playing && agg.currentTime > 0.3) { snapshot.playing = true; break; }
      // 一直没 video 元素，很可能是确认页挡着，再点几次
      if (agg.videoEls === 0 && autoStartTries < 3) { autoStartTries += 1; await autoStart(win); }
      await sleep(1000);
    }
  } catch (_) { /* ignore */ }

  result.elapsedMs = Date.now() - started;

  // 页面文本只在最终判定前取一次，用于识别试看/预告字样
  let pageText = '';
  try {
    const pt = await race(win.webContents.executeJavaScript(PAGE_TEXT_JS), 4000);
    if (typeof pt === 'string') pageText = pt;
  } catch (_) { }

  if (snapshot.playing) {
    const fake = detectFake(snapshot, pageText);
    if (fake) {
      // 能播，但只是试看片/假视频，不能算通过
      result.status = 'FAKE';
      result.reason = fake;
    } else {
      result.status = 'PASS';
      result.reason = `video 实际播放（时长 ${Math.round(snapshot.duration || 0)} 秒）`;
    }
  } else if (result.mediaUrls.length > 0) {
    result.status = 'MEDIA';
    result.reason = `有视频流请求未起播（video=${snapshot.videoEls}）`;
  } else if (snapshot.videoEls > 0) {
    result.status = 'MEDIA';
    result.reason = `有 video 元素未起播（readyState=${snapshot.readyState}）`;
  } else if (gotoError) {
    result.reason = `加载失败: ${gotoError}`;
  } else {
    result.reason = '未发现视频资源';
  }

  activeCases.delete(wcId);
  try { const closed = await race(win.destroy(), 3000); if (closed === TIMEOUT && !win.isDestroyed()) win.destroy(); } catch (_) { }
  return result;
}

let currentTester = null;

/**
 * 启动一轮测速
 * @param {object} opts { list, videos, concurrency, timeout, wait, onProgress, onDone }
 */
async function startSpeedTest(opts = {}) {
  if (currentTester && currentTester.running) return currentTester;

  hookRequests();
  const list = (opts.list || []).filter((i) => i && i.url);
  const videos = (opts.videos && opts.videos.length) ? opts.videos : DEFAULT_SAMPLES;
  const o = {
    concurrency: Math.max(1, Math.min(opts.concurrency || 2, 6)),
    gotoTimeout: (opts.timeout || 20) * 1000,
    wait: (opts.wait || 12) * 1000,
  };

  const jobs = [];
  for (const api of list) for (const v of videos) jobs.push({ api, v });

  const tester = {
    running: true,
    cancelled: false,
    total: jobs.length,
    done: 0,
    startedAt: Date.now(),
    results: [],
    cancel() { tester.cancelled = true; },
  };
  currentTester = tester;

  (async () => {
    let idx = 0;
    const worker = async () => {
      while (true) {
        if (tester.cancelled) break;
        const job = jobs[idx++];
        if (!job) break;
        let r;
        try {
          const budget = o.gotoTimeout + o.wait + 15000;
          r = await Promise.race([runCase(job.api, job.v, o), sleep(budget)]);
        } catch (e) {
          r = {
            parser: job.api.name, apiUrl: job.api.url, video: job.v.name, videoUrl: job.v.url,
            targetUrl: job.api.url + job.v.url, status: 'FAIL', reason: '异常: ' + String(e.message || e).split('\n')[0],
            mediaUrls: [], elapsedMs: 0,
          };
        }
        if (!r) {
          r = {
            parser: job.api.name, apiUrl: job.api.url, video: job.v.name, videoUrl: job.v.url,
            targetUrl: job.api.url + job.v.url, status: 'FAIL', reason: '用例超时（已熔断）',
            mediaUrls: [], elapsedMs: 0,
          };
        }
        tester.results.push(r);
        tester.done += 1;
        try { opts.onProgress && opts.onProgress({ done: tester.done, total: tester.total, current: r, cancelled: tester.cancelled }); } catch (_) { }
      }
    };

    await Promise.all(Array.from({ length: Math.min(o.concurrency, Math.max(1, jobs.length)) }, () => worker()));

    const summary = buildSummary(list, videos, tester.results);
    tester.running = false;
    currentTester = null;
    try { opts.onDone && opts.onDone({ summary, results: tester.results, elapsedMs: Date.now() - tester.startedAt, cancelled: tester.cancelled }); } catch (_) { }
  })();

  return tester;
}

function buildSummary(list, videos, results) {
  // FAKE（试看/假视频）与无效同分：能播但看不了正片，不算数
  const scoreOf = (s) => (s === 'PASS' ? 1 : s === 'MEDIA' ? 0.5 : 0);
  return list.map((api) => {
    const detail = {};
    const reasons = {};
    let score = 0;
    for (const v of videos) {
      const r = results.find((x) => x.parser === (api.name || '(未命名)') && x.video === v.name);
      detail[v.name] = r ? r.status : 'FAIL';
      if (r && r.reason) reasons[v.name] = r.reason;
      score += scoreOf(detail[v.name]);
    }
    return { name: api.name || '(未命名)', url: api.url, score, detail, reasons };
  }).sort((a, b) => b.score - a.score);
}

function isRunning() {
  return !!(currentTester && currentTester.running);
}

function cancelSpeedTest() {
  if (currentTester) currentTester.cancel();
  return !!currentTester;
}

module.exports = { startSpeedTest, cancelSpeedTest, isRunning, isSpeedTestRunning: isRunning, buildSummary, detectFake, DEFAULT_SAMPLES };
