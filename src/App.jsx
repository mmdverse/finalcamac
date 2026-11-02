import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { getCabin, brand } from './data/cabins';
import { store } from './lib/store';
import { lazyWithRetry } from './lib/lazyWithRetry';

// A failed code-split request gets one guarded retry with a fresh document.
const CabinScene = lazyWithRetry(() => import('./components/CabinScene'), 'CabinScene');
const Site = lazyWithRetry(() => import('./components/Site'), 'Site');
const HERO_START_DELAY_MS = 1250; // the loader fades for 1.1 s and unmounts at 1.2 s

export default function App() {
  const cabin = getCabin('pro-v6');
  const [mountScene, setMountScene] = useState(false);
  const [heroFrameReady, setHeroFrameReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const heroFrameReadyRef = useRef(false);
  const onHeroFrameReady = useCallback(() => {
    if (heroFrameReadyRef.current) return;
    heroFrameReadyRef.current = true;
    setHeroFrameReady(true);
  }, []);
  const onLoadProgress = useCallback((value) => {
    // Do not keep rerendering the React tree while large GLBs finish in the background.
    if (!heroFrameReadyRef.current) setLoadProgress(value);
  }, []);

  // Paint the DOM shell/loader once before starting the optional WebGL bundle.
  useEffect(() => {
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => setMountScene(true), 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // Start the cinematic after the Hero world has rendered a frame. Its models load in
  // parallel; full-resolution studio assets do not block the initial reveal.
  useEffect(() => {
    if (!heroFrameReady) {
      store.heroStarted = false;
      return undefined;
    }
    store.heroStarted = false;
    const timer = window.setTimeout(() => store.set({ heroStarted: true }), HERO_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [heroFrameReady]);
  // QA flag: /?nogl skips the heavy cabin GLB (hero-only runs on weak GPUs).
  const skipModel = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nogl');
  return (
    <>
      <div className="stage" aria-hidden="true">
        {mountScene && (
          <Suspense fallback={null}>
            <CabinScene
              cabin={cabin}
              onSceneReady={onHeroFrameReady}
              onLoadProgress={onLoadProgress}
              skipModel={skipModel}
            />
          </Suspense>
        )}
      </div>
      {mountScene && (
        <Suspense fallback={null}>
          <Site cabin={cabin} heroReady={heroFrameReady} />
        </Suspense>
      )}
      <Loader done={heroFrameReady} brand={brand.name} progress={loadProgress} />
    </>
  );
}

/**
 * Loading screen: only the brand video on black, with a white glitch bar along the bottom edge.
 * It fades after a Hero frame has been rendered, while 3D assets continue loading.
 */
function Loader({ done, brand, progress }) {
  const [unmounted, setUnmounted] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const hidden = done; // the real load decides when the screen goes, not the video length

  useEffect(() => {
    if (!hidden) return undefined;
    const t = setTimeout(() => setUnmounted(true), 1200);
    return () => clearTimeout(t);
  }, [hidden]);

  if (unmounted) return null;

  return (
    <div className={`loader ${hidden ? 'is-hidden' : ''}`} role="status" aria-live="polite">
      <div className="loader-media">
        <img className="loader-poster" src="/brand/loading-poster.webp" alt="" width="852" height="480" decoding="async" />
        <video
          className={`loader-video${videoFailed ? ' is-failed' : ''}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/brand/loading-poster.webp"
          aria-label={brand}
          onError={() => setVideoFailed(true)}
        >
          <source src="/brand/loading.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="loader-bar">
        <span style={{ transform: `scaleX(${Math.max(0.02, progress / 100)})` }} />
      </div>
    </div>
  );
}
