"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

export function KnowledgeWaveGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: -9999, y: -9999, targetX: -9999, targetY: -9999, active: false });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const probe = (cls: string) => {
      const el = Object.assign(document.createElement("span"), { className: cls });
      Object.assign(el.style, {
        position: "absolute",
        visibility: "hidden",
        pointerEvents: "none",
      });
      container.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    };
    const primary = probe("text-primary");
    const muted = probe("text-muted-foreground");

    let W = 0,
      H = 0;
    const resize = () => {
      const r = container.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onMove = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) {
        pointerRef.current.active = false;
        return;
      }
      pointerRef.current.targetX = e.clientX - r.left;
      pointerRef.current.targetY = e.clientY - r.top;
      pointerRef.current.active = true;
    };
    const onBlur = () => {
      pointerRef.current.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", onBlur);

    const noise3 = (x: number, y: number, z: number, t: number) =>
      Math.sin(x * 1.4 + t) * Math.cos(y * 1.1 - t * 0.7) +
      Math.sin((x + z) * 0.8 + t * 0.6) * 0.7 +
      Math.cos(y * 0.5 - z * 0.9 + t * 0.4) * 0.5;

    const CHARS = " .·:+*#%@";
    const LAT_STEPS = 36;
    const LON_STEPS = 72;

    const draw = (time: number) => {
      ctx.clearRect(0, 0, W, H);

      const s = time / 1000;
      const R = Math.min(W, H) * 0.42;
      const cx = W / 2;
      const cy = H / 2;

      const rotY = s * 0.18;
      const rotX = Math.sin(s * 0.07) * 0.25;

      const cell = Math.max(8, Math.min(W, H) * 0.022);
      ctx.font = `500 ${cell}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      const p = pointerRef.current;
      if (p.active) {
        p.x += (p.targetX - p.x) * 0.18;
        p.y += (p.targetY - p.y) * 0.18;
      } else {
        p.x += (-9999 - p.x) * 0.04;
        p.y += (-9999 - p.y) * 0.04;
      }

      const points: { sx: number; sy: number; depth: number; ch: string; strong: boolean }[] = [];

      for (let lat = 0; lat <= LAT_STEPS; lat++) {
        const phi = (Math.PI * lat) / LAT_STEPS;

        for (let lon = 0; lon <= LON_STEPS; lon++) {
          const theta = (2 * Math.PI * lon) / LON_STEPS;

          let x0 = Math.sin(phi) * Math.cos(theta);
          let y0 = Math.cos(phi);
          let z0 = Math.sin(phi) * Math.sin(theta);

          const cosX = Math.cos(rotX),
            sinX = Math.sin(rotX);
          const y1 = y0 * cosX - z0 * sinX;
          const z1 = y0 * sinX + z0 * cosX;
          y0 = y1;
          z0 = z1;

          const cosY = Math.cos(rotY),
            sinY = Math.sin(rotY);
          const x2 = x0 * cosY + z0 * sinY;
          const z2 = -x0 * sinY + z0 * cosY;
          x0 = x2;
          z0 = z2;

          if (z0 < -0.1) continue;

          let sx = cx + x0 * R;
          let sy = cy - y0 * R;

          let mouseInfluence = 0;
          let waveBoost = 0;

          if (p.active) {
            const dx = sx - p.x;
            const dy = sy - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = 230;

            if (dist < radius) {
              const falloff = Math.pow(1 - dist / radius, 2);
              mouseInfluence = falloff;

              if (dist > 0.001) {
                const force = falloff * 42;
                sx += (dx / dist) * force;
                sy += (dy / dist) * force;
              }

              const swirl = falloff * 22;
              sx += Math.sin(s * 4 + dist * 0.05) * swirl;
              sy += Math.cos(s * 4 + dist * 0.05) * swirl;

              waveBoost +=
                Math.sin(dist * 0.11 - s * 7) * falloff * 4.5 +
                Math.sin(dist * 0.055 - s * 3.5) * falloff * 2.2 +
                Math.cos(dist * 0.035 - s * 2) * falloff * 1.5 +
                Math.sin(dx * 0.025 + s * 3) * falloff * 1.2 +
                Math.cos(dy * 0.025 - s * 2) * falloff * 1.2;
            }
          }

          const w = noise3(x0 * 3, y0 * 3, z0 * 3, s * 0.4) + waveBoost * 0.18;
          const normalized = Math.max(0, Math.min(1, (w + 1.5) / 2.8));
          const ch = CHARS[Math.floor(normalized * (CHARS.length - 1))];
          if (ch === " ") continue;

          const depth = (z0 + 0.1) / 1.1;
          const strong = normalized > 0.5;
          const mouseBrightness = mouseInfluence * 0.35;

          points.push({ sx, sy, depth, ch, strong, mouseBrightness } as (typeof points)[0] & {
            mouseBrightness: number;
          });
        }
      }

      points.sort((a, b) => a.depth - b.depth);

      for (const pt of points) {
        const { sx, sy, depth, ch, strong } = pt;
        const mb = (pt as (typeof points)[0] & { mouseBrightness: number }).mouseBrightness;
        ctx.fillStyle = strong ? primary : muted;
        ctx.globalAlpha = Math.min(0.25, 0.08 + depth * (strong ? 0.55 : 0.28) + mb);
        ctx.fillText(ch, sx, sy);
      }

      ctx.globalAlpha = 1;
    };

    if (reducedMotion) {
      draw(4000);
    } else {
      const loop = (t: number) => {
        draw(t);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onBlur);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
