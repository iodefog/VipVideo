'use strict';

const { performance } = require('perf_hooks');

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin === 'null') {
      return `${parsed.protocol}//[redacted]${parsed.pathname}`;
    }
    const queryHint = parsed.searchParams.size > 0 ? `?[${parsed.searchParams.size} params]` : '';
    const pathname = parsed.pathname.length > 140
      ? `${parsed.pathname.slice(0, 137)}...`
      : parsed.pathname;
    return `${parsed.origin}${pathname}${queryHint}`;
  } catch (_) {
    return String(rawUrl || '').slice(0, 180);
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${round(bytes / 1024)} KB`;
  return `${round(bytes / (1024 ** 2))} MB`;
}

class NavigationPerformanceLogger {
  constructor(webContents, emitToRenderer) {
    this.webContents = webContents;
    this.emitToRenderer = emitToRenderer;
    this.sequence = 0;
    this.active = null;
    this.summaryTimer = null;
    this.debuggerAttached = false;
    this.handleDebuggerMessage = this.handleDebuggerMessage.bind(this);
    this.installElectronEventLogging();
  }

  log(stage, details = {}, trace = this.active) {
    const id = trace ? trace.id : '-';
    const elapsedMs = trace ? round(performance.now() - trace.startedAt) : null;
    const elapsedLabel = elapsedMs === null ? '' : ` +${elapsedMs}ms`;
    const line = `[PERF][NAV ${id}]${elapsedLabel} ${stage}`;
    console.log(line, details);
    if (typeof this.emitToRenderer === 'function') {
      this.emitToRenderer({ line, stage, elapsedMs, navigationId: id, details });
    }
  }

  async attachDebugger() {
    if (process.env.VIPVIDEO_PERF_LOG === '0') {
      this.log('CDP_DISABLED', { reason: 'VIPVIDEO_PERF_LOG=0' }, null);
      return;
    }
    if (this.debuggerAttached && this.webContents.debugger.isAttached()) return true;
    try {
      if (!this.webContents.debugger.isAttached()) {
        this.webContents.debugger.attach('1.3');
      }
      this.debuggerAttached = true;
      this.webContents.debugger.on('message', this.handleDebuggerMessage);
      this.log('CDP_ATTACHED', {}, null);
      const enablePromise = Promise.all([
        this.webContents.debugger.sendCommand('Network.enable'),
        this.webContents.debugger.sendCommand('Page.enable'),
        this.webContents.debugger.sendCommand('Performance.enable')
      ]);
      const enabledBeforeNavigation = await Promise.race([
        enablePromise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 100))
      ]);
      if (enabledBeforeNavigation) {
        this.log('CDP_READY', { network: true, page: true, performance: true }, null);
      } else {
        this.log('CDP_READY_PENDING', { navigationBlocked: false }, null);
        enablePromise.then(() => {
          this.log('CDP_READY', { network: true, page: true, performance: true }, null);
        }).catch((error) => {
          this.log('CDP_ENABLE_FAILED', { message: error.message }, null);
        });
      }
      return true;
    } catch (error) {
      this.debuggerAttached = false;
      this.log('CDP_ATTACH_FAILED', { message: error.message }, null);
    }
  }

  async setLifecycleState(state) {
    try {
      await this.attachDebugger();
      if (!this.debuggerAttached || !this.webContents.debugger.isAttached()) return false;
      await this.webContents.debugger.sendCommand('Page.setWebLifecycleState', { state });
      this.log('LIFECYCLE_STATE', { state }, null);
      return true;
    } catch (error) {
      this.log('LIFECYCLE_STATE_FAILED', { state, message: error.message }, null);
      return false;
    }
  }

  start(meta = {}) {
    if (this.active && !this.active.completed) {
      this.finish('superseded').catch(() => {});
    }
    clearTimeout(this.summaryTimer);
    this.summaryTimer = null;

    const now = performance.now();
    this.active = {
      id: meta.requestId || `auto-${++this.sequence}`,
      source: meta.source || 'page',
      requestedUrl: meta.url || '',
      currentUrl: meta.url || '',
      startedAt: now,
      rendererSentAt: Number(meta.rendererSentAt) || null,
      requests: new Map(),
      completedRequests: [],
      failedRequests: [],
      responseStatuses: {},
      redirects: 0,
      completed: false,
      loadEventSeen: false,
      performanceBaseline: null
    };
    const traceId = this.active.id;
    this.active.hardFinishTimer = setTimeout(() => {
      if (this.active && this.active.id === traceId && !this.active.completed) {
        this.finish('15s-timebox').catch(() => {});
      }
    }, 15000);

    const ipcDeliveryMs = this.active.rendererSentAt
      ? Math.max(0, Date.now() - this.active.rendererSentAt)
      : null;
    this.log('REQUEST_RECEIVED', {
      source: this.active.source,
      url: safeUrl(this.active.requestedUrl),
      ipcDeliveryMs
    });
    const startedTraceId = this.active.id;
    this.capturePerformanceMetrics().then((metrics) => {
      if (this.active && this.active.id === startedTraceId) {
        this.active.performanceBaseline = metrics;
      }
    }).catch(() => {});
    return this.active.id;
  }

  ensureForPageNavigation(url) {
    if (!this.active || this.active.completed) {
      this.start({ url, source: 'page-navigation' });
    }
    if (this.active) this.active.currentUrl = url || this.active.currentUrl;
    return this.active;
  }

  installElectronEventLogging() {
    const contents = this.webContents;

    contents.on('did-start-navigation', (details, legacyUrl, _isInPlace, legacyIsMainFrame) => {
      const url = details && details.url ? details.url : legacyUrl;
      const isMainFrame = details && typeof details.isMainFrame === 'boolean'
        ? details.isMainFrame
        : legacyIsMainFrame;
      if (!isMainFrame) return;
      this.ensureForPageNavigation(url);
      this.log('NAVIGATION_STARTED', { url: safeUrl(url) });
    });

    contents.on('did-start-loading', () => {
      if (this.active && !this.active.completed) this.log('LOADING_STARTED');
    });

    contents.on('did-redirect-navigation', (details, legacyUrl, _isInPlace, legacyIsMainFrame) => {
      const url = details && details.url ? details.url : legacyUrl;
      const isMainFrame = details && typeof details.isMainFrame === 'boolean'
        ? details.isMainFrame
        : legacyIsMainFrame;
      if (!isMainFrame || !this.active) return;
      this.active.redirects += 1;
      this.active.currentUrl = url;
      this.log('REDIRECT', { count: this.active.redirects, url: safeUrl(url) });
    });

    contents.on('did-navigate', (_event, url, httpResponseCode, httpStatusText) => {
      this.ensureForPageNavigation(url);
      this.log('MAIN_DOCUMENT_COMMITTED', {
        url: safeUrl(url),
        status: httpResponseCode,
        statusText: httpStatusText
      });
    });

    contents.on('dom-ready', () => {
      if (this.active && !this.active.completed) this.log('DOM_READY');
    });

    contents.on('did-frame-finish-load', (_event, isMainFrame) => {
      if (isMainFrame && this.active && !this.active.completed) this.log('MAIN_FRAME_FINISHED');
    });

    contents.on('did-finish-load', () => {
      if (this.active && !this.active.completed) this.log('LOAD_EVENT_FINISHED');
    });

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (errorCode === -3 && (!this.active || this.active.completed)) {
        this.log('NAVIGATION_ABORTED_AFTER_READY', {
          errorCode,
          errorDescription,
          url: safeUrl(validatedURL)
        }, null);
        return;
      }
      this.ensureForPageNavigation(validatedURL);
      this.log(errorCode === -3 ? 'NAVIGATION_ABORTED' : 'MAIN_DOCUMENT_FAILED', {
        errorCode,
        errorDescription,
        url: safeUrl(validatedURL)
      });
      if (errorCode !== -3) this.scheduleFinish('failed');
    });

    contents.on('did-stop-loading', () => {
      if (!this.active || this.active.completed) return;
      this.log('LOADING_STOPPED');
      this.scheduleFinish('stopped');
    });
  }

  handleDebuggerMessage(_event, method, params) {
    const trace = this.active;
    if (!trace || trace.completed) return;

    if (method === 'Network.requestWillBeSent') {
      const existing = trace.requests.get(params.requestId);
      if (params.redirectResponse && existing) {
        existing.redirected = true;
        existing.status = params.redirectResponse.status;
      }
      trace.requests.set(params.requestId, {
        id: params.requestId,
        url: params.request && params.request.url,
        method: params.request && params.request.method,
        type: params.type || 'Other',
        startedAt: params.timestamp,
        responseAt: null,
        finishedAt: null,
        status: null,
        protocol: null,
        mimeType: null,
        fromDiskCache: false,
        fromServiceWorker: false,
        encodedDataLength: 0,
        timing: null
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const request = trace.requests.get(params.requestId);
      if (!request) return;
      const response = params.response || {};
      request.responseAt = params.timestamp;
      request.status = response.status;
      request.protocol = response.protocol;
      request.mimeType = response.mimeType;
      request.fromDiskCache = Boolean(response.fromDiskCache);
      request.fromServiceWorker = Boolean(response.fromServiceWorker);
      request.timing = response.timing || null;
      const statusGroup = `${Math.floor((Number(response.status) || 0) / 100)}xx`;
      trace.responseStatuses[statusGroup] = (trace.responseStatuses[statusGroup] || 0) + 1;
      return;
    }

    if (method === 'Network.loadingFinished') {
      const request = trace.requests.get(params.requestId);
      if (!request) return;
      request.finishedAt = params.timestamp;
      request.encodedDataLength = Number(params.encodedDataLength) || 0;
      request.durationMs = round((request.finishedAt - request.startedAt) * 1000);
      request.ttfbMs = request.responseAt
        ? round(Math.min(
          Math.max(0, (request.responseAt - request.startedAt) * 1000),
          Math.max(0, request.durationMs)
        ))
        : null;
      trace.completedRequests.push(request);
      if (trace.loadEventSeen) this.scheduleFinish('network-idle');
      return;
    }

    if (method === 'Network.loadingFailed') {
      const request = trace.requests.get(params.requestId) || {};
      trace.failedRequests.push({
        url: request.url || '',
        type: request.type || params.type || 'Other',
        errorText: params.errorText,
        canceled: Boolean(params.canceled)
      });
      return;
    }

    if (method === 'Page.domContentEventFired') {
      this.log('CDP_DOM_CONTENT_LOADED');
      return;
    }

    if (method === 'Page.loadEventFired') {
      trace.loadEventSeen = true;
      this.log('CDP_LOAD_EVENT');
    }
  }

  async capturePerformanceMetrics() {
    if (!this.debuggerAttached || !this.webContents.debugger.isAttached()) return null;
    const result = await this.webContents.debugger.sendCommand('Performance.getMetrics');
    return Object.fromEntries((result.metrics || []).map((metric) => [metric.name, metric.value]));
  }

  async captureNavigationTiming() {
    try {
      return await this.webContents.executeJavaScript(`(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        if (!nav) return null;
        return {
          type: nav.type,
          redirectCount: nav.redirectCount,
          dnsMs: Math.max(0, nav.domainLookupEnd - nav.domainLookupStart),
          connectMs: Math.max(0, nav.connectEnd - nav.connectStart),
          tlsMs: nav.secureConnectionStart > 0 ? Math.max(0, nav.connectEnd - nav.secureConnectionStart) : 0,
          requestToFirstByteMs: Math.max(0, nav.responseStart - nav.requestStart),
          responseDownloadMs: Math.max(0, nav.responseEnd - nav.responseStart),
          domInteractiveMs: nav.domInteractive,
          domContentLoadedMs: nav.domContentLoadedEventEnd,
          loadEventMs: nav.loadEventEnd,
          transferSize: nav.transferSize,
          encodedBodySize: nav.encodedBodySize,
          decodedBodySize: nav.decodedBodySize
        };
      })()`, false);
    } catch (error) {
      return { error: error.message };
    }
  }

  scheduleFinish(reason) {
    clearTimeout(this.summaryTimer);
    const traceId = this.active && this.active.id;
    this.summaryTimer = setTimeout(() => {
      if (this.active && this.active.id === traceId) this.finish(reason).catch(() => {});
    }, 1500);
  }

  cancel(reason) {
    const trace = this.active;
    if (!trace || trace.completed) return;
    trace.completed = true;
    trace.endedAt = performance.now();
    clearTimeout(trace.hardFinishTimer);
    clearTimeout(this.summaryTimer);
    this.summaryTimer = null;
    this.log('TRACE_ENDED_EARLY', {
      reason,
      elapsedMs: round(performance.now() - trace.startedAt),
      completedRequests: trace.completedRequests.length,
      failedRequests: trace.failedRequests.length
    }, trace);
  }

  async finish(reason) {
    const trace = this.active;
    if (!trace || trace.completed) return;
    trace.completed = true;
    trace.endedAt = performance.now();
    clearTimeout(trace.hardFinishTimer);
    clearTimeout(this.summaryTimer);
    this.summaryTimer = null;

    const [finalMetrics, navigationTiming] = await Promise.all([
      this.capturePerformanceMetrics().catch(() => null),
      this.captureNavigationTiming()
    ]);

    const requests = trace.completedRequests;
    const transferredBytes = requests.reduce((sum, item) => sum + item.encodedDataLength, 0);
    const cacheHits = requests.filter((item) => item.fromDiskCache || item.fromServiceWorker).length;
    const byType = {};
    for (const request of requests) {
      byType[request.type] = (byType[request.type] || 0) + 1;
    }

    const slowest = requests
      .filter((item) => Number.isFinite(item.durationMs))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10)
      .map((item) => ({
        durationMs: item.durationMs,
        ttfbMs: item.ttfbMs,
        status: item.status,
        type: item.type,
        size: formatBytes(item.encodedDataLength),
        cache: item.fromDiskCache ? 'disk' : (item.fromServiceWorker ? 'service-worker' : 'network'),
        url: safeUrl(item.url)
      }));

    const baseline = trace.performanceBaseline || {};
    const metricDelta = (name) => {
      if (!finalMetrics || !Number.isFinite(finalMetrics[name])) return null;
      return round(Math.max(0, finalMetrics[name] - (Number(baseline[name]) || 0)) * 1000);
    };

    let finalUrl = trace.currentUrl || trace.requestedUrl;
    try {
      if (this.webContents && !this.webContents.isDestroyed()) finalUrl = this.webContents.getURL();
    } catch (_) { }

    this.log('SUMMARY', {
      reason,
      finalUrl: safeUrl(finalUrl),
      totalElapsedMs: round((trace.endedAt || performance.now()) - trace.startedAt),
      redirects: trace.redirects,
      requests: requests.length,
      failedRequests: trace.failedRequests.length,
      cacheHits,
      transferred: formatBytes(transferredBytes),
      responseStatuses: trace.responseStatuses,
      resourceTypes: byType,
      rendererWorkMs: {
        task: metricDelta('TaskDuration'),
        script: metricDelta('ScriptDuration'),
        layout: metricDelta('LayoutDuration'),
        styleRecalc: metricDelta('RecalcStyleDuration')
      },
      pageNavigationTiming: navigationTiming,
      slowestResources: slowest,
      failedResourceSamples: trace.failedRequests.slice(0, 5).map((item) => ({
        type: item.type,
        canceled: item.canceled,
        error: item.errorText,
        url: safeUrl(item.url)
      }))
    }, trace);
  }

  destroy() {
    clearTimeout(this.summaryTimer);
    if (this.active) clearTimeout(this.active.hardFinishTimer);
    if (this.debuggerAttached && this.webContents && !this.webContents.isDestroyed()) {
      try {
        this.webContents.debugger.off('message', this.handleDebuggerMessage);
        if (this.webContents.debugger.isAttached()) this.webContents.debugger.detach();
      } catch (_) {}
    }
  }
}

module.exports = { NavigationPerformanceLogger, safeUrl };
