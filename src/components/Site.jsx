import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { brand } from '../data/cabins';
import { footer } from '../data/footer';
import { store } from '../lib/store';
import { HERO_HANDOFF_AT } from '../hero/heroData';
import { fx } from '../lib/fx';
import { useStore } from '../lib/useStore';
import CalculatorSection from './CalculatorSection';
import StrokeText from './ReactBits/StrokeText';

gsap.registerPlugin(ScrollTrigger);

const ASSEMBLED_AT = 0.985;

// Shared type and color treatment for Hero and assembly StrokeText.
const STROKE_FILL = '#FFFFFF';
const STROKE_OUTLINE = '#555B5E';
const STROKE_WEIGHT = 700;
const STROKE_WIDTH = 0.6;
const HERO_STROKE_SIZE = 38; // 2x the previous 19 px size
const ASSEMBLY_STROKE_SIZE = 17;

/**
 * The hero is a timed intro, not a scroll track: it owns one viewport. Scrolling
 * past it hands the stage to the site act (cabin assembly), exactly as before.
 */
function useActSwitch() {
  useEffect(() => {
    const update = () => {
      const height = Math.max(1, window.innerHeight);
      const rawProgress = window.scrollY / height;
      const progress = Math.min(1, Math.max(0, rawProgress));
      const entrance = Math.min(1, Math.max(0, progress / HERO_HANDOFF_AT));
      const exit = Math.min(1, Math.max(0, (progress - HERO_HANDOFF_AT) / (1 - HERO_HANDOFF_AT)));
      const ease = (value) => value * value * (3 - 2 * value);
      const blurMix = progress <= HERO_HANDOFF_AT ? ease(entrance) : 1 - ease(exit);
      const heroFade = ease(entrance);
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const root = document.documentElement;

      // CSS handles the full-composition blur/veil without rerendering the DOM on every scroll event.
      root.style.setProperty('--hero-fade', heroFade.toFixed(4));
      root.style.setProperty('--transition-blur', `${reducedMotion ? 0 : (12 * blurMix).toFixed(2)}px`);
      root.style.setProperty('--flux-opacity', `${reducedMotion ? 0 : (0.84 * Math.pow(Math.sin(Math.PI * progress), 2)).toFixed(3)}`);
      store.heroTransition = reducedMotion ? 0 : progress;

      const act = window.scrollY > height * HERO_HANDOFF_AT ? 'site' : 'hero';
      // Hysteresis avoids destroying/recreating the temporary WebGL context on tiny edge bounces.
      const transitionActive = !reducedMotion && (store.heroTransitionActive
        ? rawProgress > 0.001 && rawProgress < 1.04
        : rawProgress > 0.002 && rawProgress < 0.998);
      root.classList.toggle('is-hero-transitioning', transitionActive);
      const patch = {};
      if (act !== store.act) patch.act = act;
      if (transitionActive !== store.heroTransitionActive) patch.heroTransitionActive = transitionActive;
      if (Object.keys(patch).length) store.set(patch);
    };
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    motionQuery?.addEventListener?.('change', update);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      motionQuery?.removeEventListener?.('change', update);
    };
  }, []);
}

/** Back to the empty start: the completed state is cleared and the page goes to the top. */
function resetSequence() {
  fx.autoScroll = false;
  store.seqDone = false;
  store.set({ progress: 0, assembled: false });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function fadeThenReset() {
  store.resetting = true;
  const veil = store.veil;
  veil?.classList.add('is-on');
  setTimeout(() => {
    resetSequence();
    requestAnimationFrame(() => {
      veil?.classList.remove('is-on');
      store.resetting = false;
    });
  }, 700);
}

/**
 * The sequence spacer is the scroll track for the cinematic assembly. Progress comes straight from the
 * scroll position. The track ends exactly where the assembly completes (laser included), so no extra
 * scrolling is needed before the model can be turned. Once complete, the model stays assembled;
 * scrolling back up fades the scene out and returns to the empty start.
 */
function useSequenceProgress(ref) {
  useEffect(() => {
    let lastY = window.scrollY;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const y = window.scrollY;
      const range = el.offsetHeight - window.innerHeight;
      const raw = range > 0 ? (y - el.offsetTop) / range : 0;
      const sf = Math.min(1, Math.max(0, raw)); // 0..1 across the track
      const going = y - lastY;
      lastY = y;
      if (store.resetting) return;
      const seq = store.sequence;
      const share = seq?.share ?? 1;
      const f = sf * share; // fraction of the full assembly track
      const p = seq ? seq.map.toProgress(f) : f;
      if (store.seqDone && going < -2 && raw < 1) {
        fadeThenReset();
        return;
      }
      if (sf >= 0.999 || (seq ? p >= seq.completeAt - 0.003 : p >= ASSEMBLED_AT)) store.seqDone = true;
      store.set({ progress: store.seqDone ? 1 : p, assembled: !!store.seqDone });
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref]);
}

const AUTO_IDLE_MS = 3000;
const AUTO_RUN_MS = 120000;
const USER_EVENTS = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'];

/**
 * Resume the idle glide only after the visitor has manually entered the assembly track.
 * The intro/hero viewport is deliberately outside this trigger and can never auto-scroll.
 */
function useAutoScroll(ref) {
  useEffect(() => {
    let hasScrolledAssembly = false;
    let userInputPending = false;
    let running = false;
    let lastActivity = performance.now();
    let velocity = 0;
    let lastNow = 0;
    let raf = 0;
    let speedMul = 1;
    let speedTarget = 1;
    let nextSpeedAt = 0;

    const getTrack = () => {
      const el = ref.current;
      if (!el || !store.sequence) return null;
      const top = el.offsetTop;
      const range = Math.max(0, el.offsetHeight - window.innerHeight);
      return { top, end: top + range, range };
    };
    const insideAssembly = (track = getTrack(), y = window.scrollY) =>
      Boolean(track && track.range > 0 && y >= track.top && y < track.end - 1 && !store.assembled);
    const stop = () => {
      running = false;
      fx.autoScroll = false;
      velocity = 0;
    };

    const onUserInput = () => {
      stop();
      lastActivity = performance.now();
      if (insideAssembly()) hasScrolledAssembly = true;
      userInputPending = true;
      requestAnimationFrame(() => {
        if (!userInputPending) return;
        const track = getTrack();
        if (insideAssembly(track)) {
          hasScrolledAssembly = true;
          lastActivity = performance.now();
        }
        userInputPending = false;
      });
    };

    const onScroll = () => {
      const track = getTrack();
      if (!track) return;
      const y = window.scrollY;
      if (y < track.top) {
        hasScrolledAssembly = false;
        userInputPending = false;
        stop();
        return;
      }
      if (userInputPending && insideAssembly(track, y)) {
        hasScrolledAssembly = true;
        lastActivity = performance.now();
      }
      if (y >= track.end - 1 || store.assembled) stop();
    };

    USER_EVENTS.forEach((event) => window.addEventListener(event, onUserInput, { passive: true }));
    window.addEventListener('scroll', onScroll, { passive: true });

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0;
      lastNow = now;
      const track = getTrack();
      if (!track) {
        stop();
        return;
      }
      const y = window.scrollY;
      if (!insideAssembly(track, y) || store.assembled) {
        if (y < track.top) hasScrolledAssembly = false;
        stop();
        return;
      }

      if (!running && hasScrolledAssembly && now - lastActivity >= AUTO_IDLE_MS) running = true;
      if (running && now >= nextSpeedAt) {
        speedTarget = 1.5 + Math.random() * 1.5;
        nextSpeedAt = now + 900 + Math.random() * 1600;
      }
      fx.autoScroll = running;
      speedMul += (speedTarget - speedMul) * (1 - Math.exp(-dt * 2));
      const target = running ? (track.range / AUTO_RUN_MS) * 1000 * speedMul : 0;
      velocity += (target - velocity) * (1 - Math.exp(-dt * 1.5));
      if (Math.abs(velocity) < 0.5) {
        velocity = 0;
        return;
      }
      window.scrollTo({ top: window.scrollY + velocity * dt, behavior: 'instant' });
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      USER_EVENTS.forEach((event) => window.removeEventListener(event, onUserInput));
      window.removeEventListener('scroll', onScroll);
      fx.autoScroll = false;
    };
  }, [ref]);
}

const ICON_PATHS = {
  pin: <><path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  phone: <path d="M6.5 3.5h3l1.5 4.2-2.1 1.4a10.5 10.5 0 0 0 5.1 5.1l1.4-2.1 4.2 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />,
  mobile: <><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.9" /></>,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

function FooterItem({ row }) {
  if (!row.value) return null;
  const content = (
    <>
      <span className="sfooter-ico"><Icon name={row.icon} /></span>
      <span className="sfooter-text" dir="auto">{row.value}</span>
    </>
  );
  return row.href ? (
    <a className="sfooter-item" href={row.href} aria-label={row.label} title={row.label}>{content}</a>
  ) : (
    <span className="sfooter-item" aria-label={row.label} title={row.label}>{content}</span>
  );
}

/** Draw a single glint stripe into a tiny canvas, then clip it with the logo's real alpha. */
function HeroLogo({ active }) {
  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!active || !image || !canvas || !context) return undefined;

    let frame = 0;
    let running = false;
    let disposed = false;
    let startAt = 0;
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const ease = (value) => value * value * (3 - 2 * value);
    const clear = () => context.clearRect(0, 0, canvas.width, canvas.height);

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round((rect?.width || image.clientWidth || 1) * dpr));
      const height = Math.max(1, Math.round((rect?.height || image.clientHeight || 1) * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const draw = (now) => {
      if (!running) return;
      const width = canvas.width;
      const height = canvas.height;
      clear();

      const cyclePhase = ((now - startAt) % 6400) / 6400;
      const sweepStart = 0.18;
      const sweepEnd = 0.57;
      if (cyclePhase >= sweepStart && cyclePhase <= sweepEnd && width > 0 && height > 0) {
        const rawProgress = (cyclePhase - sweepStart) / (sweepEnd - sweepStart);
        const progress = ease(rawProgress);
        const opacity = rawProgress < 0.12
          ? 0.72 * ease(rawProgress / 0.12)
          : rawProgress > 0.86
            ? 0.72 * (1 - ease((rawProgress - 0.86) / 0.14))
            : 0.72;
        const halfBand = Math.max(3, width * 0.08);
        const centerX = -halfBand + progress * (width + halfBand * 2);
        const diagonal = height * 0.2;
        const light = context.createLinearGradient(
          centerX - diagonal - halfBand, 0,
          centerX + diagonal + halfBand, height,
        );
        light.addColorStop(0, 'rgba(255,255,255,0)');
        light.addColorStop(0.39, 'rgba(255,255,255,0)');
        light.addColorStop(0.46, 'rgba(255,242,200,0.12)');
        light.addColorStop(0.5, 'rgba(255,255,255,0.86)');
        light.addColorStop(0.54, 'rgba(255,220,136,0.32)');
        light.addColorStop(0.63, 'rgba(255,255,255,0)');
        light.addColorStop(1, 'rgba(255,255,255,0)');

        context.save();
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = opacity;
        context.fillStyle = light;
        context.fillRect(0, 0, width, height);
        // Destination-in retains the sheen only where the source logo has nonzero alpha.
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(image, 0, 0, width, height);
        context.restore();
      }

      frame = requestAnimationFrame(draw);
    };

    const start = () => {
      if (disposed || running || motionQuery?.matches || !image.complete || !image.naturalWidth) return;
      resizeCanvas();
      clear();
      startAt = performance.now();
      running = true;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clear();
    };
    const onMotionChange = () => {
      if (motionQuery?.matches) stop();
      else start();
    };
    const onImageLoad = () => start();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resizeCanvas)
      : null;

    if (image.complete && image.naturalWidth) start();
    else image.addEventListener('load', onImageLoad, { once: true });
    if (canvas.parentElement) observer?.observe(canvas.parentElement);
    window.addEventListener('resize', resizeCanvas, { passive: true });
    motionQuery?.addEventListener?.('change', onMotionChange);

    return () => {
      disposed = true;
      stop();
      image.removeEventListener('load', onImageLoad);
      observer?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      motionQuery?.removeEventListener?.('change', onMotionChange);
    };
  }, [active]);

  return (
    <div className="hero-logo">
      <img ref={imageRef} className="hero-logo-img" src="/brand/logo-fa.webp" alt="CAMAC Elevator" width="1000" height="888" decoding="async" />
      <canvas ref={canvasRef} className="hero-logo-sheen" aria-hidden="true" />
    </div>
  );
}

export default function Site({ cabin, heroReady = false }) {
  const sequenceRef = useRef(null);
  const [showTop, setShowTop] = useState(false);
  const sequence = useStore((s) => s.sequence);
  const act = useStore((s) => s.act);
  const brandOn = useStore((s) => s.act === 'hero' && s.heroDone);
  const cueOn = useStore((s) => s.act === 'hero' && s.heroDone);
  const veilRef = useRef(null);
  useEffect(() => {
    store.veil = veilRef.current;
    // The hero never auto-scrolls; only the assembly hook opts in after manual entry.
    fx.autoScroll = false;
    return () => {
      fx.autoScroll = false;
    };
  }, []);
  // Flux Lines now masks the scroll-linked hero <-> studio handoff; reserve the veil pulse for resets.
  const prevAct = useRef(act);
  useEffect(() => {
    if (prevAct.current === act) return;
    const previous = prevAct.current;
    prevAct.current = act;
    if (previous === 'hero' || act === 'hero') return;
    const veil = store.veil;
    veil?.classList.add('is-on');
    const id = setTimeout(() => veil?.classList.remove('is-on'), 650);
    return () => clearTimeout(id);
  }, [act]);
  // the track is as long as needed to reach the completed model (scroll speed stays the same)
  useEffect(() => {
    const el = sequenceRef.current;
    if (!el || !sequence) return;
    el.style.height = `${(sequence.share ?? 1) * 1900}vh`;
    ScrollTrigger.refresh();
  }, [sequence]);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400 && store.assembled);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useActSwitch();
  useSequenceProgress(sequenceRef);
  useAutoScroll(sequenceRef);

  const progress = useStore((s) => s.progress);
  const assembled = useStore((s) => s.assembled);
  // the back-to-top button follows completion right away, not only on the next scroll
  useEffect(() => {
    setShowTop(window.scrollY > 400 && assembled);
  }, [assembled]);
  const started = useStore((s) => s.progress > 0.02);
  const firstAssemblyEnd = cabin?.assembly?.[0]?.range?.[1] ?? 0.2;
  const showAssemblyStroke = Boolean(
    started && sequence?.firstLandingAt != null && progress >= sequence.firstLandingAt,
  );
  const assemblyStrokeVisible = showAssemblyStroke && progress < firstAssemblyEnd && act === 'site';
  const heroStrokeStarted = useStore((s) => s.heroStrokeStarted);
  const heroStrokeVisible = heroReady && heroStrokeStarted && act === 'hero';

    return (
      <div className="site">
        {/* One-viewport stage for the timed hero intro (plays before the assembly). */}
        <div className="hero-track" aria-hidden="true" />

        {/* The assembly caption appears with the first piece as one centered line in the upper corner. */}
        {showAssemblyStroke && (
          <div
            className={`camac-stroke-message camac-assembly-message ${assemblyStrokeVisible ? 'is-visible' : ''}`}
            dir="rtl"
            role="img"
            aria-label="مهندسی قطعه به قطعه همراه با کاماک"
            aria-hidden={!assemblyStrokeVisible}
          >
            <div className="camac-stroke-line" aria-hidden="true">
              <StrokeText
                text="مهندسی قطعه به قطعه همراه با کاماک"
                strokeColor={STROKE_OUTLINE}
                fillColor={STROKE_FILL}
                strokeWidth={STROKE_WIDTH}
                drawDuration={1.1}
                fillDelay={0.08}
                stagger={0.02}
                ease="power2.out"
                trigger="mount"
                fillMode="fade"
                fontSize={ASSEMBLY_STROKE_SIZE}
                fontWeight={STROKE_WEIGHT}
                letterSpacing={0}
                style={{ fontFamily: "'VIP Hala', 'Noto Kufi Arabic', system-ui, sans-serif", direction: 'rtl', unicodeBidi: 'plaintext' }}
              />
            </div>
          </div>
        )}

        {/* Brand identity, the three-line Hero headline aligned directly under its tagline, then the address. */}
        <div className="hero-brand" dir="ltr">
          <div className={`hero-brand-lockup ${brandOn ? 'is-on' : ''}`} aria-hidden={!brandOn}>
            <HeroLogo active={brandOn} />
            <div className="hero-tag" dir="rtl">شروع از ۱۳۹۳</div>
          </div>
          {heroReady && heroStrokeStarted && (
            <div
              className={`camac-stroke-message camac-hero-message ${heroStrokeVisible ? 'is-visible' : ''}`}
              dir="rtl"
              role="img"
              aria-label="آسانسوری که معماری را حرکت میدهد"
              aria-hidden={!heroStrokeVisible}
            >
              <div className="camac-stroke-line" aria-hidden="true">
                <StrokeText
                  text="آسانسوری"
                  strokeColor={STROKE_OUTLINE}
                  fillColor={STROKE_FILL}
                  strokeWidth={STROKE_WIDTH}
                  drawDuration={1.05}
                  fillDelay={0.08}
                  stagger={0.02}
                  ease="power2.out"
                  trigger="mount"
                  fillMode="fade"
                  fontSize={HERO_STROKE_SIZE}
                  fontWeight={STROKE_WEIGHT}
                  letterSpacing={0}
                  style={{ fontFamily: "'VIP Hala', 'Noto Kufi Arabic', system-ui, sans-serif", direction: 'rtl', unicodeBidi: 'plaintext' }}
                />
              </div>
              <div className="camac-stroke-line" aria-hidden="true">
                <StrokeText
                  text="که معماری را"
                  strokeColor={STROKE_OUTLINE}
                  fillColor={STROKE_FILL}
                  strokeWidth={STROKE_WIDTH}
                  drawDuration={1.05}
                  fillDelay={0.08}
                  stagger={0.02}
                  ease="power2.out"
                  trigger="mount"
                  fillMode="fade"
                  fontSize={HERO_STROKE_SIZE}
                  fontWeight={STROKE_WEIGHT}
                  letterSpacing={0}
                  style={{ fontFamily: "'VIP Hala', 'Noto Kufi Arabic', system-ui, sans-serif", direction: 'rtl', unicodeBidi: 'plaintext' }}
                />
              </div>
              <div className="camac-stroke-line" aria-hidden="true">
                <StrokeText
                  text="حرکت میدهد"
                  strokeColor={STROKE_OUTLINE}
                  fillColor={STROKE_FILL}
                  strokeWidth={STROKE_WIDTH}
                  drawDuration={1.05}
                  fillDelay={0.08}
                  stagger={0.02}
                  ease="power2.out"
                  trigger="mount"
                  fillMode="fade"
                  fontSize={HERO_STROKE_SIZE}
                  fontWeight={STROKE_WEIGHT}
                  letterSpacing={0}
                  style={{ fontFamily: "'VIP Hala', 'Noto Kufi Arabic', system-ui, sans-serif", direction: 'rtl', unicodeBidi: 'plaintext' }}
                />
              </div>
            </div>
          )}
          <div className={`hero-address ${brandOn ? 'is-on' : ''}`} dir="rtl" aria-hidden={!brandOn}>
            قم، خیابان معلم شرقی، مجتمع عمرانیه، طبقه اول اداری، واحد ۱۱۹
          </div>
        </div>

        {/* Scroll cue of the final hero frame. */}
        <div className={`hero-cue ${cueOn ? 'is-on' : ''}`} dir="ltr" aria-hidden={!cueOn}>
          <span className="c" />
          <span className="l" />
          <span className="t" dir="rtl">اسکرول کنید</span>
          <span className="l" />
          <span className="c" />
        </div>

        {/* Progress bar: appears once the sequence starts. */}
        <div className={`chapter ${started && !assembled ? 'is-on' : ''}`} aria-hidden="true">
          <div className="chapter-bar">
            <span style={{ transform: `scaleX(${Math.min(1, progress)})` }} />
          </div>
        </div>

        {/* Scroll track for the cinematic assembly. Keep all calculator UI outside this scroll-driven 3D region. */}
        <div ref={sequenceRef} className="sequence" aria-hidden="true" />

        {/* Workbook-faithful engineering tools live after the completed 3D sequence, before contact. */}
        <CalculatorSection />

      {/* Fades the scene out when the visitor scrolls back up after completion. */}
      <div ref={veilRef} className="fade-veil" aria-hidden="true" />

      {/* Back to the top of the page. The finished cabin stays assembled. */}
      <button
        type="button"
        className={`to-top ${showTop ? 'is-on' : ''}`}
        onClick={resetSequence}
        aria-label="بازگشت به بالا"
        title="بازگشت به بالا"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
        </svg>
      </button>

      <footer id="contact" className="sfooter interactive">
        <div className="sfooter-inner">
          <img className="sfooter-logo" src="/brand/logo-en.webp" alt={brand.name} width="1000" height="759" decoding="async" />

          <ul className="sfooter-contact">
            {footer.contact.map((row) => (
              <li key={row.label} className={row.wide ? 'is-wide' : undefined}>
                <FooterItem row={row} />
              </li>
            ))}
          </ul>

          {footer.socials.length > 0 && (
            <ul className="sfooter-social">
              {footer.socials.map((s) => (
                <li key={s.label}>
                  <a className="sfooter-item" href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}>
                    <span className="sfooter-ico"><Icon name={s.icon} /></span>
                    <span className="sfooter-text" dir="auto">{s.value}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sfooter-bottom">
          <span>© {new Date().getFullYear()} {brand.name}</span>
        </div>
      </footer>
    </div>
  );
}
