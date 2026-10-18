import { useEffect, useRef, useState } from 'react';

/** A restrained light sweep, composited only through the source image's real alpha. */
export default function LogoWithSweep({
  src,
  alt,
  wrapperClassName,
  imageClassName,
  width,
  height,
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
    const ease = (value) => value * value * (3 - 2 * value);
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

      const phase = ((now - startAt) % 6400) / 6400;
      const sweepStart = 0.18;
      const sweepEnd = 0.57;
      if (phase >= sweepStart && phase <= sweepEnd && canvasWidth > 0 && canvasHeight > 0) {
        const rawProgress = (phase - sweepStart) / (sweepEnd - sweepStart);
        const progress = ease(rawProgress);
        const opacity = rawProgress < 0.12
          ? 0.72 * ease(rawProgress / 0.12)
          : rawProgress > 0.86
            ? 0.72 * (1 - ease((rawProgress - 0.86) / 0.14))
            : 0.72;
        const halfBand = Math.max(3, canvasWidth * 0.08);
        const centerX = -halfBand + progress * (canvasWidth + halfBand * 2);
        const diagonal = canvasHeight * 0.2;
        const light = context.createLinearGradient(
          centerX - diagonal - halfBand, 0,
          centerX + diagonal + halfBand, canvasHeight,
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
        context.fillRect(0, 0, canvasWidth, canvasHeight);
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
  }, [shouldAnimate, src]);

  return (
    <div ref={wrapperRef} className={wrapperClassName}>
      <img ref={imageRef} className={imageClassName} src={src} alt={alt} width={width} height={height} decoding="async" />
      <canvas ref={canvasRef} className="logo-sheen-canvas" aria-hidden="true" />
    </div>
  );
}
