import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { getCabin, brand } from './data/cabins';
import { useStore } from './lib/useStore';
import { store } from './lib/store';
import { lazyWithRetry } from './lib/lazyWithRetry';

// Keep code splitting, but recover once if a first-visit chunk request is stale or interrupted.
const CabinScene = lazyWithRetry(() => import('./components/CabinScene'), 'CabinScene');
const Site = lazyWithRetry(() => import('./components/Site'), 'Site');
const SplashCursor = lazy(() => import('./components/SplashCursor'));
const HERO_START_DELAY_MS = 1250; // the loader fades for 1.1 s and unmounts at 1.2 s

export default function App() {
  const cabin = getCabin('pro-v6');
  const [mountScene, setMountScene] = useState(false);
  const [heroFrameReady, setHeroFrameReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const onHeroFrameReady = useCallback(() => setHeroFrameReady(true), []);
  const onLoadProgress = useCallback((value) => setLoadProgress(value), []);

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

  // Reveal the procedural hero after its first real WebGL frame; the large cabin GLB continues
  // loading in parallel and does not extend the initial loading cover.
  useEffect(() => {
    if (heroFrameReady) setSceneReady(true);
  }, [heroFrameReady]);

  // Start the cinematic only after its loading cover has had time to fade away.
  useEffect(() => {
    if (!sceneReady) {
      store.heroStarted = false;
      return undefined;
    }
    store.heroStarted = false;
    const timer = window.setTimeout(() => store.set({ heroStarted: true }), HERO_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [sceneReady]);
  // QA flag: /?nogl skips the heavy cabin GLB (hero-only runs on weak GPUs).
  const skipModel = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nogl');
  // The fluid splash belongs to the main section only, never the hero-to-studio handoff.
  const act = useStore((s) => s.act);
  const transitionActive = useStore((s) => s.heroTransitionActive);
  const [allowSplash, setAllowSplash] = useState(() =>
    typeof window !== 'undefined' && !window.matchMedia('(max-width: 768px), (pointer: coarse)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    const update = () => setAllowSplash(!query.matches);
    update();
    if (query.addEventListener) query.addEventListener('change', update);
    else query.addListener?.(update);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', update);
      else query.removeListener?.(update);
    };
  }, []);

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
        {/* A second fluid WebGL simulation competes with the main Canvas on touch devices;
            keep the decorative splash for desktop pointers only. */}
        {act === 'site' && !transitionActive && allowSplash && (
          <Suspense fallback={null}>
            <SplashCursor RAINBOW_MODE={false} COLOR="#FFD400" />
          </Suspense>
        )}
      </div>
      {mountScene && (
        <Suspense fallback={null}>
          <Site cabin={cabin} heroReady={sceneReady} />
        </Suspense>
      )}
      <Loader done={sceneReady} brand={brand.name} progress={loadProgress} />
    </>
  );
}

/**
 * Loading screen: only the brand video on black, with a white glitch bar along the bottom edge.
 * It stays up until the first procedural hero frame has actually been drawn; GLBs load in parallel.
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
