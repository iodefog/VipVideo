'use strict';

// 线路测速结果本地缓存：保存在 userData/speed-history.json，启动即可读回上次结果
const fs = require('fs');
const path = require('path');

let cacheFile = null;

function getPath(app) {
  if (!cacheFile) cacheFile = path.join(app.getPath('userData'), 'speed-history.json');
  return cacheFile;
}

function read(app) {
  try {
    const p = getPath(app);
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!data || !Array.isArray(data.rows) || !data.rows.length) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// payload 为 speedTest 的 done 回调入参：{ summary, elapsedMs, ... }
function save(app, payload) {
  try {
    const summary = Array.isArray(payload && payload.summary) ? payload.summary : [];
    if (!summary.length) return null;
    const videos = [];
    const rows = summary.map((r) => {
      const detail = r.detail || {};
      Object.keys(detail).forEach((v) => { if (videos.indexOf(v) === -1) videos.push(v); });
      return {
        name: r.name,
        url: r.url || '',
        score: r.score,
        detail: detail,
        reasons: r.reasons || {}
      };
    });
    const data = {
      updatedAt: Date.now(),
      elapsedMs: (payload && payload.elapsedMs) || 0,
      videos: videos,
      rows: rows
    };
    fs.writeFileSync(getPath(app), JSON.stringify(data, null, 2), 'utf-8');
    return data;
  } catch (e) {
    console.error('[speedHistory] save failed:', e);
    return null;
  }
}

function clear(app) {
  try {
    fs.writeFileSync(getPath(app), JSON.stringify({ updatedAt: 0, videos: [], rows: [] }), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { read, save, clear };
