import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { getCabin, brand } from './data/cabins';
import { useStore } from './lib/useStore';
import { store } from './lib/store';

// WebGL scene and secondary visual effects are split so their code can load on demand.
const CabinScene = lazy(() => import('./components/CabinScene'));
const Site = lazy(() => import('./components/Site'));
const SplashCursor = lazy(() => import('./components/SplashCursor'));
const FluxLines = lazy(() => import('./components/ReactBits/FluxLines'));
const HERO_START_DELAY_MS = 1250; // loader fades for 1.1 s and unmounts at 1.2 s

export default function App() {
  const cabin = getCabin('pro-v6');
  const [mountScene, setMountScene] = useState(false);
  const [heroModelReady, setHeroModelReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const onHeroReady = useCallback(() => setHeroModelReady(true), []);
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

  // Latch the first completed load. The studio assets are intentionally deferred until handoff,
  // so their later progress updates must not bring the intro loader back.
  useEffect(() => {
    if (heroModelReady && loadProgress >= 100) setSceneReady(true);
  }, [heroModelReady, loadProgress]);

  // Wait for the scene assets to finish too, then begin a fresh take after the loader exits.
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
  // The fluid splash belongs to the main section only, never the hero or Flux handoff.
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
              onHeroReady={onHeroReady}
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
      <FluxTransition />
      {mountScene && (
        <Suspense fallback={null}>
          <Site cabin={cabin} heroReady={sceneReady} />
        </Suspense>
      )}
      <Loader done={sceneReady} brand={brand.name} progress={loadProgress} />
    </>
  );
}

/** Scroll-linked ReactBits Flux Lines scrim; its WebGL context exists only during the handoff. */
function FluxTransition() {
  const active = useStore((s) => s.heroTransitionActive);
  if (!active) return null;
  return (
    <div className="flux-transition" aria-hidden="true">
      <Suspense fallback={null}>
        <FluxLines
          colors={['#f2b632', '#625743', '#ead9b5']}
          speed={0.34}
          scale={1.35}
          turbulence={0.55}
          fluidity={0.12}
          rimWidth={0.15}
          sharpness={2.4}
          shimmer={0.8}
          glow={1.55}
          lineWidth={0.45}
          flowDirection="up"
          mouseInteraction={false}
          clickSwirl={false}
          intro={false}
          lightMode
          transparent
          dpr={1}
        />
      </Suspense>
    </div>
  );
}

/**
 * Loading screen: only the brand video on black, with a white glitch bar along the bottom edge.
 * It fades out once the 3D model is ready and the video has finished.
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
