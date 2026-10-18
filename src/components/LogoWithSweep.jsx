import { useEffect, useRef, useState } from 'react';

const ease = (value) => value * value * (3 - 2 * value);
const LETTERS_OFFSET_MS = 650;
const PATH_GAP_MS = 180;

function createContourTrack(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return null;

  const segments = paths
    .filter((points) => Array.isArray(points) && points.length > 2)
    .map((points) => ({
      points,
      duration: Math.max(650, Math.min(1700, points.length * 6.2)),
    }));
  if (!segments.length) return null;

  const period = segments.reduce((total, segment) => total + segment.duration + PATH_GAP_MS, 0);
  return { segments, period };
}

function runnerAt(track, elapsed, offset = 0) {
  if (!track) return null;

  let time = ((elapsed + offset) % track.period + track.period) % track.period;
  for (const segment of track.segments) {
    if (time < segment.duration) {
      const rawProgress = time / segment.duration;
      const fadeIn = ease(Math.min(1, rawProgress / 0.14));
      const fadeOut = ease(Math.min(1, (1 - rawProgress) / 0.14));
      return {
        points: segment.points,
        progress: ease(rawProgress),
        opacity: Math.min(fadeIn, fadeOut),
      };
    }
    time -= segment.duration;
    if (time < PATH_GAP_MS) return null;
    time -= PATH_GAP_MS;
  }
  return null;
}

function pointAt(points, progress, width, height) {
  const wrapped = ((progress % 1) + 1) % 1;
  const position = wrapped * points.length;
  const index = Math.floor(position);
  const blend = position - index;
  const current = points[index];
  const next = points[(index + 1) % points.length];
  return {
    x: (current[0] + (next[0] - current[0]) * blend) * width,
    y: (current[1] + (next[1] - current[1]) * blend) * height,
  };
}

function drawRunner(context, runner, width, height) {
  if (!runner || runner.opacity <= 0) return;

  const { points, progress, opacity } = runner;
  const trailFraction = Math.min(0.18, Math.max(0.08, 28 / points.length));
  const sampleCount = Math.max(12, Math.min(32, Math.ceil(points.length * trailFraction)));
  const tail = pointAt(points, progress - trailFraction, width, height);
  const head = pointAt(points, progress, width, height);
  const radius = Math.max(5, width * 0.034);

  context.save();
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = opacity;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = Math.max(2, width * 0.014);
  context.shadowColor = 'rgba(255, 204, 52, 0.92)';
  context.shadowBlur = Math.max(4, width * 0.03);

  const trail = context.createLinearGradient(tail.x, tail.y, head.x, head.y);
  trail.addColorStop(0, 'rgba(255, 188, 35, 0)');
  trail.addColorStop(0.42, 'rgba(255, 207, 58, 0.2)');
  trail.addColorStop(0.82, 'rgba(255, 224, 113, 0.72)');
  trail.addColorStop(1, 'rgba(255, 255, 255, 1)');

  context.beginPath();
  for (let step = 0; step <= sampleCount; step += 1) {
    const sample = pointAt(points, progress - trailFraction + trailFraction * (step / sampleCount), width, height);
    if (step === 0) context.moveTo(sample.x, sample.y);
    else context.lineTo(sample.x, sample.y);
  }
  context.strokeStyle = trail;
  context.stroke();

  context.shadowBlur = 0;
  const headGlow = context.createRadialGradient(head.x, head.y, 0, head.x, head.y, radius);
  headGlow.addColorStop(0, 'rgba(255, 255, 255, 1)');
  headGlow.addColorStop(0.24, 'rgba(255, 232, 139, 0.95)');
  headGlow.addColorStop(0.68, 'rgba(255, 195, 43, 0.42)');
  headGlow.addColorStop(1, 'rgba(255, 195, 43, 0)');
  context.fillStyle = headGlow;
  context.fillRect(head.x - radius, head.y - radius, radius * 2, radius * 2);
  context.restore();
}

/** A moving golden runner follows sampled logo contours, clipped to the image's real alpha. */
export default function LogoWithSweep({
  src,
  alt,
  wrapperClassName,
  imageClassName,
  width,
  height,
  contourPaths,
  active = true,
}) {
  const wrapperRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const shouldAnimate = Boolean(active && isInView);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(Boolean(entry?.isIntersecting));
    }, { rootMargin: '120px' });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!shouldAnimate || !image || !canvas || !context) return undefined;

    let frame = 0;
    let running = false;
    let disposed = false;
    let startAt = 0;
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const symbolTrack = createContourTrack(contourPaths?.symbol);
    const lettersTrack = createContourTrack(contourPaths?.letters);
    const clear = () => context.clearRect(0, 0, canvas.width, canvas.height);

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvasWidth = Math.max(1, Math.round((rect?.width || image.clientWidth || 1) * dpr));
      const canvasHeight = Math.max(1, Math.round((rect?.height || image.clientHeight || 1) * dpr));
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }
    };

    const draw = (now) => {
      if (!running) return;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      clear();

      if (canvasWidth > 0 && canvasHeight > 0) {
        const elapsed = now - startAt;
        context.save();
        context.globalCompositeOperation = 'source-over';
        drawRunner(context, runnerAt(symbolTrack, elapsed), canvasWidth, canvasHeight);
        drawRunner(context, runnerAt(lettersTrack, elapsed, LETTERS_OFFSET_MS), canvasWidth, canvasHeight);
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
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
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resizeCanvas)
      : null;

    if (image.complete && image.naturalWidth) start();
    else image.addEventListener('load', onImageLoad, { once: true });
    if (canvas.parentElement) resizeObserver?.observe(canvas.parentElement);
    window.addEventListener('resize', resizeCanvas, { passive: true });
    motionQuery?.addEventListener?.('change', onMotionChange);

    return () => {
      disposed = true;
      stop();
      image.removeEventListener('load', onImageLoad);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      motionQuery?.removeEventListener?.('change', onMotionChange);
    };
  }, [shouldAnimate, src, contourPaths]);

  return (
    <div ref={wrapperRef} className={wrapperClassName}>
      <img ref={imageRef} className={imageClassName} src={src} alt={alt} width={width} height={height} decoding="async" />
      <canvas ref={canvasRef} className="logo-sheen-canvas" aria-hidden="true" />
    </div>
  );
}
