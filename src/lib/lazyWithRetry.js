import { lazy } from 'react';

/**
 * Retry a transient code-split chunk failure once by reloading the document.
 * This handles stale HTML/chunk references after a deploy without an infinite reload loop.
 */
export function lazyWithRetry(importer, chunkName) {
  const retryKey = `camac:chunk-retry:${chunkName}`;

  return lazy(() => importer().then((module) => {
    try {
      window.sessionStorage.removeItem(retryKey);
    } catch {
      // Storage can be unavailable in strict/private browsing modes; loading still succeeds.
    }
    return module;
  }).catch((error) => {
    let shouldRetry = false;

    try {
      const storage = window.sessionStorage;
      shouldRetry = storage.getItem(retryKey) !== '1';
      if (shouldRetry) storage.setItem(retryKey, '1');
      else storage.removeItem(retryKey);
    } catch {
      // Without a persistent one-shot guard, do not reload automatically.
    }

    if (!shouldRetry) throw error;

    console.warn(`[CAMAC] ${chunkName} chunk failed to load; retrying once with a fresh document.`, error);
    window.location.reload();
    // Keep Suspense pending until the browser completes the reload.
    return new Promise(() => {});
  }));
}
