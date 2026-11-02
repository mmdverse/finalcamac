import { lazy } from 'react';

// A stale or temporarily unavailable code-split chunk can fail before React can mount it.
// Retry once with fresh HTML, guarded per chunk so a persistent failure cannot reload forever.
export function lazyWithRetry(importer, chunkName) {
  const key = `camac:chunk-retry:${chunkName}`;
  return lazy(() => importer().then((module) => {
    try { window.sessionStorage.removeItem(key); } catch { /* storage is optional */ }
    return module;
  }).catch((error) => {
    let retry = false;
    try {
      if (window.sessionStorage.getItem(key) !== '1') {
        window.sessionStorage.setItem(key, '1');
        retry = true;
      }
    } catch { /* do not reload without a persistent loop guard */ }
    if (!retry) throw error;
    console.warn(`[CAMAC] ${chunkName} failed to load; refreshing once.`, error);
    window.location.reload();
    return new Promise(() => {});
  }));
}
