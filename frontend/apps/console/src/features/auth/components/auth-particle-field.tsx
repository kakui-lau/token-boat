import { useEffect, useRef } from "react";

type Particle = {
  phase: number;
  radius: number;
  velocityX: number;
  velocityY: number;
  x: number;
  y: number;
};

export function AuthParticleField({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!context) return;

    let animationFrame = 0;
    let accentColor = "";
    let height = 0;
    let lastFrame = performance.now();
    let lineColor = "";
    let particleColor = "";
    let particles: Particle[] = [];
    let reducedMotion = false;
    let width = 0;

    const motionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const draw = (timestamp: number) => {
      if (!context || width === 0 || height === 0) return;

      const delta = Math.min((timestamp - lastFrame) / 16.67, 2);
      lastFrame = timestamp;

      context.clearRect(0, 0, width, height);

      if (!paused && !reducedMotion && !document.hidden) {
        for (const particle of particles) {
          particle.x += particle.velocityX * delta;
          particle.y += particle.velocityY * delta;

          if (particle.x < -0.03) particle.x = 1.03;
          if (particle.x > 1.03) particle.x = -0.03;
          if (particle.y < -0.03) particle.y = 1.03;
          if (particle.y > 1.03) particle.y = -0.03;
        }
      }

      const maxConnectionDistance = Math.min(132, Math.max(92, width * 0.13));
      context.lineWidth = 0.7;
      context.strokeStyle = lineColor;

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (!particle) continue;
        const particleX = particle.x * width;
        const particleY = particle.y * height;

        for (let targetIndex = index + 1; targetIndex < particles.length; targetIndex += 1) {
          const target = particles[targetIndex];
          if (!target) continue;
          const targetX = target.x * width;
          const targetY = target.y * height;
          const distance = Math.hypot(targetX - particleX, targetY - particleY);
          if (distance > maxConnectionDistance) continue;

          context.globalAlpha = (1 - distance / maxConnectionDistance) * 0.6;
          context.beginPath();
          context.moveTo(particleX, particleY);
          context.lineTo(targetX, targetY);
          context.stroke();
        }
      }

      context.fillStyle = accentColor;
      for (let routeIndex = 0; routeIndex < 3; routeIndex += 1) {
        const progress = (timestamp * 0.00014 + routeIndex * 0.34) % 1;
        const routeY = 0.34 + routeIndex * 0.16;

        for (let trailIndex = 11; trailIndex >= 0; trailIndex -= 1) {
          const trailProgress = Math.max(0, progress - trailIndex * 0.012);
          const routeX = width * (0.08 + trailProgress * 0.82);
          const waveY =
            height * (routeY + Math.sin(trailProgress * Math.PI * 2 + routeIndex * 1.7) * 0.035);

          context.globalAlpha = (1 - trailIndex / 12) * 0.78;
          context.beginPath();
          context.arc(routeX, waveY, trailIndex === 0 ? 2.8 : 1.35, 0, Math.PI * 2);
          context.fill();
        }
      }

      context.fillStyle = particleColor;
      for (const particle of particles) {
        const shimmer = reducedMotion
          ? 1
          : 0.78 + Math.sin(timestamp * 0.0007 + particle.phase) * 0.22;
        context.globalAlpha = shimmer;
        context.beginPath();
        context.arc(particle.x * width, particle.y * height, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;

      if (!paused && !reducedMotion && !document.hidden) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const styles = window.getComputedStyle(canvas);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      accentColor = styles.getPropertyValue("--auth-particle-accent").trim();
      particleColor = styles.getPropertyValue("--auth-particle-color").trim();
      lineColor = styles.getPropertyValue("--auth-particle-line").trim();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const particleCount = Math.min(76, Math.max(38, Math.round((width * height) / 12_500)));
      if (particles.length !== particleCount) {
        particles = Array.from({ length: particleCount }, (_, index) => ({
          phase: index * 0.91,
          radius: index % 9 === 0 ? 1.75 : index % 4 === 0 ? 1.25 : 0.8,
          velocityX: (((index * 17) % 11) - 5) * 0.000018,
          velocityY: (((index * 29) % 13) - 6) * 0.000015,
          x: ((index * 47) % 101) / 100,
          y: ((index * 61 + 17) % 103) / 102,
        }));
      }

      window.cancelAnimationFrame(animationFrame);
      lastFrame = performance.now();
      draw(lastFrame);
    };

    const restart = () => {
      reducedMotion = motionQuery?.matches ?? false;
      window.cancelAnimationFrame(animationFrame);
      lastFrame = performance.now();
      draw(lastFrame);
    };

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener("resize", resize);
    motionQuery?.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    resize();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", resize);
      motionQuery?.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [paused]);

  return <canvas aria-hidden="true" className="auth-particle-field" ref={canvasRef} />;
}
