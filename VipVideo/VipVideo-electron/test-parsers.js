#!/usr/bin/env node
/**
 * 解析线路可用性测试脚本
 *
 * 用法：
 *   node test-parsers.js                        # 测试 vlist.json 中全部线路 × 全部测试视频
 *   node test-parsers.js --only=虾米,冰豆       # 只测名字包含指定关键字的线路
 *   node test-parsers.js --video=爱奇艺,优酷    # 只测名字包含指定关键字的视频
 *   node test-parsers.js --concurrency=6        # 并发数（默认 4）
 *   node test-parsers.js --headless=false       # 有头模式（部分站点反爬时更容易成功）
 *   node test-parsers.js --browser=chromium     # 使用 Playwright 自带 chromium（默认优先系统 Chrome）
 *   node test-parsers.js --shots                # 对每条结果截图到 parser-test-shots/
 *   node test-parsers.js --timeout=25 --wait=20 # 加载超时秒数 / 等待播放秒数
 *   node test-parsers.js --prescreen=false      # 关闭轻量预筛（默认开启，可大幅减少起浏览器次数）
 *   node test-parsers.js --blockimg=false       # 不拦截图片/字体（默认拦截，省内存）
 *   node test-parsers.js --direct               # 直连源站，校验测试视频本身是否可播
 *   node test-parsers.js --pause=300            # 每条用例间隔毫秒，给系统喘息
 *
 * 低占用推荐：node test-parsers.js --concurrency=2 --wait=12 --pause=300
 *
 * 判定标准（与应用点击线路的行为一致：目标地址 = 线路 url + 原始视频地址，不做 encode）：
 *   PASS   页面中出现 <video> 且 currentTime 实际前进（真的在播）
 *   MEDIA  抓到了视频流请求（m3u8/mp4/flv/ts 等）但 video 元素没播起来
 *   FAIL   既没有 video 元素，也没抓到视频流
 *
 * 结果同时写入 parser-test-results.json
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ---------------- 测试视频 ----------------
const VIDEOS = [
  { name: '爱奇艺', url: 'https://www.iqiyi.com/v_19rrjaux6c.html' },
  { name: '腾讯视频', url: 'https://v.qq.com/x/cover/zg7bhyyc1ffeha0/w0024dc6n9f.html' },
  { name: '芒果TV', url: 'https://www.mgtv.com/h/552685' },
  { name: '优酷', url: 'https://v.youku.com/v_show/id_XMjg1MzEyMjk2OA==.html' },
  { name: 'bilibili', url: 'https://www.bilibili.com/bangumi/play/ep291708' },
];

// 视频流特征（用于网络层抓包判定）
const MEDIA_URL_RE = /\.(m3u8|mp4|ts|flv|mkv|m4s|webm|mov)(\?|#|$)/i;
const MEDIA_CT_RE = /(video\/|audio\/|application\/(x-)?mpegurl|application\/vnd\.apple\.mpegurl|x-flv|octet-stream)/i;
const FAIL_TEXT_RE = /(解析失败|不支持该|线路维护|资源不存在|该网站暂不支持|视频已下线|parameter error|url error)/i;

// ---------------- 参数 ----------------
function parseArgs(argv) {
  const args = {
    only: null,
    video: null,
    concurrency: 3,
    headless: true,
    browser: 'chrome', // chrome | chromium
    shots: false,
    timeout: 20,
    wait: 15,
    blockimg: true,   // 拦截图片/字体，节省内存与带宽
    prescreen: true,  // 先用轻量 HTTP 探测筛掉死链，能过的才起浏览器
    direct: false,    // 直连源站播放测试（校验测试视频本身是否有效）
    pause: 0,         // 每条用例之间的额外间隔毫秒
    output: 'parser-test-results.json',
  };
  for (const a of argv) {
    const m = /^--([^=]+)(=(.*))?$/.exec(a);
    if (!m) continue;
    const key = m[1];
    const val = m[3] === undefined ? 'true' : m[3];
    if (key === 'help' || key === 'h') {
      printHelp();
      process.exit(0);
    }
    if (key in args) {
      if (typeof args[key] === 'number') args[key] = Number(val);
      else if (typeof args[key] === 'boolean') args[key] = /^(true|1|yes)$/i.test(val);
      else args[key] = val;
    }
  }
  return args;
}

function printHelp() {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 给任意 Promise 套超时，避免恶意/异常页面把 worker 永久挂住
const TIMEOUT = Symbol('timeout');
function race(p, ms) {
  let t;
  return Promise.race([
    Promise.resolve(p).catch((e) => ({ __err: e })),
    new Promise((r) => { t = setTimeout(() => r(TIMEOUT), ms); }),
  ]).finally(() => clearTimeout(t));
}

// ---------------- 轻量预筛：只发一个 HTTP 请求，不起浏览器 ----------------
function httpProbe(url, timeoutMs) {
  return new Promise((resolve) => {
    const { request } = url.startsWith('https') ? require('https') : require('http');
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    const req = request(url, {
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (body.length < 200000) body += c; });
      res.on('end', () => done({ ok: true, status: res.statusCode, headers: res.headers, body }));
      res.resume();
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => done({ ok: false, err: e.code || e.message }));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

// 预筛结论：是否值得用浏览器深入测试，以及能否直接判死
async function prescreen(api, video, args) {
  const targetUrl = api.url + video.url;
  const ret = { needBrowser: true, failReason: null, info: '' };
  const r = await httpProbe(targetUrl, Math.min(args.timeout, 12) * 1000);

  if (!r.ok) { ret.needBrowser = false; ret.failReason = `预筛网络不可达(${r.err})`; return ret; }
  if (r.status >= 400) { ret.needBrowser = false; ret.failReason = `预筛HTTP ${r.status}`; return ret; }

  const body = r.body || '';
  const bodyLower = body.toLowerCase();
  const hasMediaHint = MEDIA_URL_RE.test(targetUrl) ||
    /\.(m3u8|mp4|flv|ts)(\?|['"&]|$)/i.test(body) ||
    bodyLower.includes('m3u8') || bodyLower.includes('.mp4') ||
    bodyLower.includes('url=') && bodyLower.includes('http');
  const failHit = FAIL_TEXT_RE.exec(body);

  if (!hasMediaHint && failHit) {
    ret.needBrowser = false;
    ret.failReason = `预筛页面无播放资源，且含失败提示: ${failHit[0]}`;
    return ret;
  }
  if (body.trim().length < 200 && !hasMediaHint) {
    ret.needBrowser = false;
    ret.failReason = `预筛响应为空/过短(${body.trim().length}字节)`;
    return ret;
  }
  ret.info = `HTTP ${r.status}, ${body.length}B` + (hasMediaHint ? ', 疑似含资源' : '');
  return ret;
}

// ---------------- 核心：单条用例 ----------------
async function runCase(getBrowser, workerId, api, video, args) {
  const targetUrl = api.url + video.url; // 与 vipWindow.js 中 it.url + base 保持一致
  const result = {
    parser: api.name,
    apiUrl: api.url,
    video: video.name,
    videoUrl: video.url,
    targetUrl,
    status: 'FAIL',
    reason: '',
    mediaUrls: [],
    videoEls: 0,
    readyState: 0,
    currentTime: 0,
    note: '',
    elapsedMs: 0,
  };

  const started = Date.now();
  let browser = await getBrowser(workerId); // 浏览器失联时内部会自动重启
  let context = null;
  let page = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      context = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1280, height: 800 },
        ignoreHTTPSErrors: true,
        bypassCSP: true,
      });
      await context.addInitScript(AUTOPLAY_HOOK);
      if (args.blockimg) {
        // 拦截图片/字体/样式表，显著降低内存与带宽占用（不影响 video 元素播放）
        await context.route('**/*', (route) => {
          const t = route.request().resourceType();
          if (t === 'image' || t === 'font') return route.abort().catch(() => { });
          return route.continue().catch(() => { });
        });
      }
      page = await context.newPage();
      break;
    } catch (e) {
      try { await context?.close(); } catch (_) { }
      if (attempt === 1) throw e;
      browser = await getBrowser(workerId, true);
    }
  }
  let gotoError = null;

  page.on('response', (res) => {
    try {
      const u = res.url();
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      if (MEDIA_URL_RE.test(u) || (ct && MEDIA_CT_RE.test(ct))) {
        if (res.status() < 400 && result.mediaUrls.length < 12) result.mediaUrls.push(u);
      }
    } catch (_) { /* ignore */ }
  });

  page.setDefaultTimeout(Math.min(args.timeout, 12) * 1000);
  const goto = race(page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout * 1000 }), (args.timeout + 3) * 1000);
  const gotoRet = await goto;
  if (gotoRet === TIMEOUT) gotoError = 'goto 超时';
  else if (gotoRet && gotoRet.__err) gotoError = String(gotoRet.__err.message || gotoRet.__err).split('\n')[0];

  // 轮询等待播放器出现并真正开始播放
  const deadline = Date.now() + args.wait * 1000;
  let maxState = { currentTime: 0, readyState: 0, videoEls: 0, playing: false, src: '' };

  const snapshot = async () => {
    const agg = { currentTime: 0, readyState: 0, videoEls: 0, playing: false, src: '', errors: [] };
    for (const frame of page.frames()) {
      let arr = [];
      try {
        arr = await frame.evaluate(() => {
          const out = [];
          document.querySelectorAll('video').forEach((v) => {
            if (v.paused && v.readyState > 0) { try { v.play(); } catch (_) { } }
            out.push({
              src: v.currentSrc || v.src || '',
              readyState: v.readyState,
              currentTime: v.currentTime || 0,
              paused: v.paused,
              muted: v.muted,
              w: v.videoWidth || 0,
              err: v.error ? `${v.error.code}:${v.error.message}` : '',
            });
          });
          return out;
        });
      } catch (_) { continue; }

      for (const v of arr) {
        agg.videoEls += 1;
        if (v.readyState > agg.readyState) agg.readyState = v.readyState;
        if (v.currentTime > agg.currentTime) {
          agg.currentTime = v.currentTime;
          agg.src = v.src;
        }
        if (v.err) agg.errors.push(v.err);
        if (!v.paused && v.readyState >= 2 && v.currentTime > 0) agg.playing = true;
      }
    }
    return agg;
  };

  while (Date.now() < deadline) {
    const snapRet = await race(snapshot(), 8000);
    const snap = (snapRet === TIMEOUT || !snapRet || snapRet.__err) ? null : snapRet;
    if (snap) {
      maxState.videoEls = Math.max(maxState.videoEls, snap.videoEls);
      maxState.readyState = Math.max(maxState.readyState, snap.readyState);
      if (snap.playing && snap.currentTime > 0.3) {
        maxState.playing = true;
        maxState.currentTime = snap.currentTime;
        maxState.src = snap.src;
        break;
      }
      if (snap.currentTime > maxState.currentTime) {
        maxState.currentTime = snap.currentTime;
        maxState.src = snap.src;
      }
    }
    await sleep(1200);
  }

  result.elapsedMs = Date.now() - started;
  result.videoEls = maxState.videoEls;
  result.readyState = maxState.readyState;
  result.currentTime = Number(maxState.currentTime.toFixed(2));

  if (maxState.playing) {
    result.status = 'PASS';
    result.reason = 'video 实际播放（currentTime 前进）';
    result.note = maxState.src;
  } else if (result.mediaUrls.length > 0) {
    result.status = 'MEDIA';
    result.reason = `抓到视频流请求但未见播放（video=${maxState.videoEls}, readyState=${maxState.readyState}）`;
  } else if (maxState.videoEls > 0) {
    result.status = 'MEDIA';
    result.reason = `有 video 元素但未起播（readyState=${maxState.readyState}, currentTime=${maxState.currentTime}）`;
  } else if (gotoError) {
    result.reason = `加载失败: ${gotoError}`;
  } else {
    result.reason = '未发现 video 元素/视频流请求';
    try {
      const txtRet = await race(page.evaluate(() => document.body && document.body.innerText ? document.body.innerText.slice(0, 400) : ''), 5000);
      const txt = (typeof txtRet === 'string' ? txtRet : '').trim();
      const hit = FAIL_TEXT_RE.exec(txt);
      if (hit) result.reason += ` | 页面提示疑似: ${hit[0]}`;
      else if (txt) result.reason += ` | 页面文本: ${txt.replace(/\s+/g, ' ').slice(0, 120)}`;
    } catch (_) { /* ignore */ }
  }

  if (args.shots) {
    try {
      const dir = path.join(__dirname, 'parser-test-shots');
      fs.mkdirSync(dir, { recursive: true });
      const file = `${result.status}-${safe(result.parser)}-${safe(result.video)}.png`;
      await page.screenshot({ path: path.join(dir, file), timeout: 8000 });
    } catch (_) { /* ignore */ }
  }

  await race(page.close(), 5000).catch(() => { });
  await race(context.close(), 5000).catch(() => { });
  return result;
}

const safe = (s) => String(s).replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 40);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

// 播放器自动接管：静音 + 自动播放，避免 headless 下的 autoplay 限制
const AUTOPLAY_HOOK = () => {
  try {
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      try { this.muted = true; } catch (_) { }
      return orig.apply(this, arguments);
    };
  } catch (_) { }
};

// ---------------- 主流程 ----------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vlist = JSON.parse(fs.readFileSync(path.join(__dirname, 'vlist.json'), 'utf8'));

  let apis = args.direct
    ? [{ name: '直连源站', url: '' }]
    : (vlist.list || []).filter((i) => i && i.url);
  let videos = VIDEOS;

  if (args.only) {
    const keys = args.only.split(',').map((s) => s.trim()).filter(Boolean);
    apis = apis.filter((a) => keys.some((k) => String(a.name).includes(k) || a.url.includes(k)));
  }
  if (args.video) {
    const keys = args.video.split(',').map((s) => s.trim()).filter(Boolean);
    videos = videos.filter((v) => keys.some((k) => v.name.includes(k)));
  }
  if (!apis.length || !videos.length) {
    console.error('没有匹配到线路或视频，请检查 --only / --video 参数');
    process.exit(1);
  }

  const useChrome = args.browser === 'chrome';
  console.log(`待测线路 ${apis.length} 条 × 视频 ${videos.length} 个 = ${apis.length * videos.length} 用例；并发 ${args.concurrency}；浏览器 ${useChrome ? '系统 Chrome' : 'Playwright chromium'}；headless=${args.headless}`);
  console.log('-'.repeat(96));

  let launchOpts = {
    headless: args.headless,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--enable-features=NetworkServiceInProcess',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=Translate,BackForwardCache,AcceptCHFrame,SitePerProcess',
      '--disable-dev-shm-usage',
      '--renderer-process-limit=4',
      '--js-flags=--max-old-space-size=256',
      '--no-first-run',
    ],
  };
  if (useChrome) {
    try {
      launchOpts.channel = 'chrome';
      await chromium.launch(launchOpts).then((b) => b.close());
    } catch (e) {
      console.warn(`[warn] 无法使用系统 Chrome（${e.message.split('\n')[0]}），回退到自带 chromium`);
      launchOpts = { ...launchOpts, channel: undefined };
    }
  }
  // 每个 worker 独占一个浏览器实例，失联后自动重启，避免整体跑挂
  const browsers = new Map();
  async function getBrowser(workerId, force = false) {
    let b = browsers.get(workerId);
    if (force || !b || !b.isConnected()) {
      try { await (b && b.close()); } catch (_) { }
      b = await chromium.launch(launchOpts);
      browsers.set(workerId, b);
    }
    return b;
  }

  const allJobs = [];
  for (const api of apis) for (const v of videos) allJobs.push({ api, v });

  const results = [];
  let done = 0;
  let total = allJobs.length;
  const emit = (r) => {
    results.push(r);
    done += 1;
    const tag = r.status === 'PASS' ? '✅' : r.status === 'MEDIA' ? '⚠️ ' : '❌';
    console.log(`[${done}/${total}] ${tag} ${r.status.padEnd(5)} ${pad(r.parser, 12)} ${pad(r.video, 10)} ${r.reason}`);
  };

  // 轻量预筛：HTTP 探测，明显不可用的直接判 FAIL，不再起浏览器
  let jobs = allJobs;
  if (args.prescreen) {
    console.log(`预筛中：${allJobs.length} 条用例（轻量 HTTP 探测，不启动浏览器）...`);
    const probeQueue = [...allJobs];
    const probeOut = [];
    const probeWorkers = Array.from({ length: 8 }, async () => {
      while (probeQueue.length) {
        const j = probeQueue.shift();
        if (!j) break;
        let p;
        try { p = await prescreen(j.api, j.v, args); } catch (e) { p = { needBrowser: true, failReason: null, info: '' }; }
        probeOut.push({ j, p });
      }
    });
    await Promise.all(probeWorkers);
    jobs = probeOut.filter((x) => x.p.needBrowser).map((x) => x.j);
    for (const { j, p } of probeOut) {
      if (p.needBrowser) continue;
      emit({
        parser: j.api.name, apiUrl: j.api.url, video: j.v.name, videoUrl: j.v.url,
        targetUrl: j.api.url + j.v.url, status: 'FAIL', reason: p.failReason,
        mediaUrls: [], videoEls: 0, readyState: 0, currentTime: 0, note: '', elapsedMs: 0,
      });
    }
    console.log(`预筛完成：${allJobs.length - jobs.length} 条判定不可用，剩余 ${jobs.length} 条进入浏览器实测`);
    console.log('-'.repeat(96));
  }

  async function worker(id, queue) {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;
      let r;
      try {
        // 单条用例硬性预算，超时则判定超时并重启该 worker 的浏览器
        const budget = (args.timeout + args.wait + 20) * 1000;
        r = await Promise.race([runCase(getBrowser, id, job.api, job.v, args), sleep(budget)]);
      } catch (e) {
        r = {
          parser: job.api.name, apiUrl: job.api.url, video: job.v.name, videoUrl: job.v.url,
          targetUrl: job.api.url + job.v.url, status: 'FAIL', reason: '异常: ' + e.message.split('\n')[0],
          mediaUrls: [], videoEls: 0, readyState: 0, currentTime: 0, note: '', elapsedMs: 0,
        };
      }
      if (!r) {
        r = {
          parser: job.api.name, apiUrl: job.api.url, video: job.v.name, videoUrl: job.v.url,
          targetUrl: job.api.url + job.v.url, status: 'FAIL', reason: '用例整体超时（已熔断）',
          mediaUrls: [], videoEls: 0, readyState: 0, currentTime: 0, note: '', elapsedMs: 0,
        };
        await getBrowser(id, true).catch(() => { });
      }
      emit(r);
      if (args.pause > 0) await sleep(args.pause);
    }
  }

  const queue = [...jobs];
  const nWorkers = Math.max(1, Math.min(args.concurrency, queue.length));
  await Promise.all(Array.from({ length: nWorkers }, (_, i) => worker(i, queue)));
  for (const b of browsers.values()) await b.close().catch(() => { });

  report(results, apis, videos, args);
}

function pad(s, n) {
  const str = String(s);
  const width = [...str].reduce((w, ch) => w + (/[\u4e00-\u9fa5]/.test(ch) ? 2 : 1), 0);
  return str + ' '.repeat(Math.max(0, n - width));
}

function report(results, apis, videos, args) {
  console.log('\n' + '='.repeat(96));
  console.log('汇总矩阵（PASS=可播放，MEDIA=有流未起播，FAIL=无效）');
  const head = pad('线路', 16) + videos.map((v) => pad(v.name, 12)).join('') + pad('得分', 6) + 'API';
  console.log(head);
  console.log('-'.repeat(96));

  const scoreOf = (r) => (r.status === 'PASS' ? 1 : r.status === 'MEDIA' ? 0.5 : 0);
  const rows = apis.map((api) => {
    const rs = videos.map((v) => results.find((r) => r.parser === api.name && r.video === v.name));
    const score = rs.reduce((s, r) => s + (r ? scoreOf(r) : 0), 0);
    return { api, rs, score };
  }).sort((a, b) => b.score - a.score);

  for (const { api, rs, score } of rows) {
    const cells = rs.map((r) => pad(r ? (r.status === 'PASS' ? '✅PASS' : r.status === 'MEDIA' ? '⚠️MEDIA' : '❌FAIL') : '-', 12)).join('');
    console.log(pad(api.name || '(未命名)', 16) + cells + pad(String(score), 6) + api.url);
  }

  const passRows = rows.filter((r) => r.score > 0);
  console.log('\n推荐保留（按得分排序）:');
  for (const { api, score } of passRows) console.log(`  ${pad(String(score), 5)} ${pad(api.name, 14)} ${api.url}`);
  if (!passRows.length) console.log('  无可用线路');

  const outPath = path.join(__dirname, args.output);
  fs.writeFileSync(outPath, JSON.stringify({ time: new Date().toISOString(), videos, results }, null, 2));
  console.log(`\n详细结果已写入: ${outPath}`);
}

main().catch((e) => {
  console.error('运行失败:', e);
  process.exit(1);
});
