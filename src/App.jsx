import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import Site from './components/Site';
import SplashCursor from './components/SplashCursor';
import FluxLines from './components/ReactBits/FluxLines';
import { getCabin, brand } from './data/cabins';
import { useStore } from './lib/useStore';
import { store } from './lib/store';

// Scene (three.js + R3F) is code-split so the DOM shell paints before the WebGL bundle.
const CabinScene = lazy(() => import('./components/CabinScene'));
const HERO_START_DELAY_MS = 1250; // loader fades for 1.1 s and unmounts at 1.2 s

export default function App() {
  const cabin = getCabin('pro-v6');
  const [modelReady, setModelReady] = useState(false);
  const { progress: loadProgress } = useProgress();
  const sceneReady = modelReady && loadProgress >= 100;
  const onModelReady = useCallback(() => setModelReady(true), []);

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

  return (
    <>
      <div className="stage" aria-hidden="true">
        <Suspense fallback={null}>
          <CabinScene cabin={cabin} onModelReady={onModelReady} skipModel={skipModel} />
        </Suspense>
        {/* Fluid splash of the original component: touch on mobile, pointer on desktop only. Yellow. */}
        {act === 'site' && !transitionActive && <SplashCursor RAINBOW_MODE={false} COLOR="#FFD400" />}
      </div>
      <FluxTransition />
      <Site cabin={cabin} heroReady={sceneReady} />
      <Loader done={sceneReady} brand={brand.name} />
    </>
  );
}

/** Scroll-linked ReactBits Flux Lines scrim; its WebGL context exists only during the handoff. */
function FluxTransition() {
  const active = useStore((s) => s.heroTransitionActive);
  if (!active) return null;
  return (
    <div className="flux-transition" aria-hidden="true">
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
    </div>
  );
}

/**
 * Loading screen: only the brand video on black, with a white glitch bar along the bottom edge.
 * It fades out once the 3D model is ready and the video has finished.
 */
function Loader({ done, brand }) {
  const { progress } = useProgress();
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
