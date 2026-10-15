import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import Site from './components/Site';
import SplashCursor from './components/SplashCursor';
import { getCabin, brand } from './data/cabins';
import { useStore } from './lib/useStore';

// Scene (three.js + R3F) is code-split so the DOM shell paints before the WebGL bundle.
const CabinScene = lazy(() => import('./components/CabinScene'));

export default function App() {
  const cabin = getCabin('pro-v6');
  const [modelReady, setModelReady] = useState(false);
  const onModelReady = useCallback(() => setModelReady(true), []);
  // QA flag: /?nogl skips the heavy cabin GLB (hero-only runs on weak GPUs).
  const skipModel = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nogl');
  // The fluid splash belongs to the main section only, never the hero.
  const act = useStore((s) => s.act);

  return (
    <>
      <div className="stage" aria-hidden="true">
        <Suspense fallback={null}>
          <CabinScene cabin={cabin} onModelReady={onModelReady} skipModel={skipModel} />
        </Suspense>
        {/* Fluid splash of the original component: touch on mobile, pointer on desktop only. Yellow. */}
        {act === 'site' && <SplashCursor RAINBOW_MODE={false} COLOR="#FFD400" />}
      </div>
      <Site cabin={cabin} heroReady={modelReady} />
      <Loader done={modelReady} brand={brand.name} />
    </>
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
        <img className="loader-poster" src="/brand/logo.webp" alt="" width="512" height="512" decoding="async" />
        <video
          className={`loader-video${videoFailed ? ' is-failed' : ''}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label={brand}
          onError={() => setVideoFailed(true)}
        >
          <source src="/brand/loading.mp4" type="video/mp4" />
          <source src="/brand/loading.webm" type="video/webm" />
        </video>
      </div>
      <div className="loader-bar">
        <span style={{ transform: `scaleX(${Math.max(0.02, progress / 100)})` }} />
      </div>
    </div>
  );
}
