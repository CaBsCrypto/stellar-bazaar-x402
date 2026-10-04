/** Run this function only through the browser's documented read-only DOM evaluator. */
export function readUsdcZoomMetrics() {
  const viewport = window.visualViewport;
  const active = document.activeElement;
  return {
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    outerWidth: window.outerWidth, outerHeight: window.outerHeight,
    devicePixelRatio: window.devicePixelRatio,
    visualViewport: viewport ? {width: viewport.width, height: viewport.height, scale: viewport.scale} : null,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    activeElementTag: active?.tagName ?? null,
  };
}

/** Relative DPR/viewport evidence cannot by itself prove that the baseline was 100%. */
export function assessUsdcPageZoom(before, after, {baseline100Verified = false} = {}) {
  const positive = value => Number.isFinite(value) && value > 0;
  const valid = ['innerWidth','innerHeight','devicePixelRatio'].every(key => positive(before?.[key]) && positive(after?.[key]));
  if (!valid) return {consistentWithDoublePageZoom:false, native200Verified:false, reason:'METRICS_MISSING'};
  const dprRatio = after.devicePixelRatio / before.devicePixelRatio;
  const widthRatio = after.innerWidth / before.innerWidth;
  const heightRatio = after.innerHeight / before.innerHeight;
  const nativeWidthRatio = after.innerWidth * after.devicePixelRatio / (before.innerWidth * before.devicePixelRatio);
  const nativeHeightRatio = after.innerHeight * after.devicePixelRatio / (before.innerHeight * before.devicePixelRatio);
  const near = (value, expected) => Math.abs(value - expected) <= expected * .025;
  const noPinch = near(before.visualViewport?.scale ?? NaN, 1) && near(after.visualViewport?.scale ?? NaN, 1);
  const consistentWithDoublePageZoom = near(dprRatio, 2) && near(widthRatio, .5) && near(heightRatio, .5) && near(nativeWidthRatio, 1) && near(nativeHeightRatio, 1) && noPinch;
  return {dprRatio,widthRatio,heightRatio,nativeWidthRatio,nativeHeightRatio,noPinch,consistentWithDoublePageZoom,
    native200Verified: baseline100Verified === true && consistentWithDoublePageZoom,
    reason: !consistentWithDoublePageZoom ? 'NATIVE_PAGE_ZOOM_NOT_OBSERVED' : baseline100Verified !== true ? 'BASELINE_100_UNCONFIRMED' : 'NATIVE_200_OBSERVED',
  };
}

/** Observation only: timing entries do not expose request headers or response UUIDs. */
export function readUsdcPerformanceLoads(authorizedOrigin) {
  if (window.location.origin !== authorizedOrigin) throw Error('AUTHORIZED_PREVIEW_REQUIRED');
  const resourceEntries = performance.getEntriesByType('resource');
  const entries = [...performance.getEntriesByType('navigation'), ...resourceEntries];
  const rows = entries.slice(0, 250).map((entry, index) => {
    let sameOrigin = false, path = '[path-redacted]', kind = entry.entryType === 'navigation' ? 'html' : 'other';
    try {
      const target = new URL(entry.name, authorizedOrigin);
      sameOrigin = target.origin === authorizedOrigin;
      if (sameOrigin) {
        if (target.pathname.startsWith('/api/')) kind = 'api';
        if (/^\/_next\/static\/[A-Za-z0-9/_.-]+$/.test(target.pathname)) {kind = 'static'; path = target.pathname;}
        else if (/^\/api\/(operations|activity|market\/(services|orders)(\/[a-f0-9-]{36})?)$/.test(target.pathname)) path = target.pathname;
        else if (['/history','/resources','/providers','/agent-chat','/'].includes(target.pathname)) path = target.pathname;
      }
    } catch { /* Never emit the original URL or its parse error. */ }
    const number = value => Number.isFinite(value) && value >= 0 ? value : null;
    return {
      index, entryType: entry.entryType, kind, path, sameOrigin,
      initiatorType: String(entry.initiatorType ?? '').slice(0, 24),
      startTimeMs: number(entry.startTime), responseEndMs: number(entry.responseEnd), durationMs: number(entry.duration),
      transferSize: number(entry.transferSize), encodedBodySize: number(entry.encodedBodySize), decodedBodySize: number(entry.decodedBodySize),
      responseStatus: entry.responseStatus > 0 ? number(entry.responseStatus) : null,
      observedRedirectCount: entry.entryType === 'navigation' ? number(entry.redirectCount) : null,
    };
  });
  return {
    timeOriginMs: performance.timeOrigin, observedAtMs: performance.now(), rows,
    totalEntryCount: entries.length, resourceEntryCount: resourceEntries.length,
    outputTruncated: entries.length > 250, resourceBufferMayBeFull: resourceEntries.length >= 250,
    completeNetworkCapture: false, responseRequestIdsAvailable: false, requestBytesAvailable: false,
    limitations: ['CROSS_ORIGIN_TIMING_MAY_BE_HIDDEN','CACHE_OR_UNOBSERVABLE_TRANSFER_CAN_BE_ZERO','RESOURCE_BUFFER_CAN_DROP_OR_CLEAR_ENTRIES','REDIRECT_COUNT_CAN_OMIT_CROSS_ORIGIN_HOPS','SERVER_UUIDS_REQUIRE_SEPARATE_SERVER_METADATA'],
  };
}
