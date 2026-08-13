"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

const MARKERS = [
  { location: [48.8566, 2.3522] as [number, number], size: 0.04 }, // Paris
  { location: [51.5074, -0.1278] as [number, number], size: 0.04 }, // London
  { location: [52.52, 13.405] as [number, number], size: 0.04 }, // Berlin
  { location: [35.6762, 139.6503] as [number, number], size: 0.05 }, // Tokyo
  { location: [37.5665, 126.978] as [number, number], size: 0.04 }, // Seoul
  { location: [31.2304, 121.4737] as [number, number], size: 0.05 }, // Shanghai
  { location: [1.3521, 103.8198] as [number, number], size: 0.04 }, // Singapore
  { location: [-33.8688, 151.2093] as [number, number], size: 0.04 }, // Sydney
  { location: [14.0583, 108.2772] as [number, number], size: 0.03 }, // Vietnam
  { location: [40.7128, -74.006] as [number, number], size: 0.05 }, // New York
  { location: [37.7595, -122.4367] as [number, number], size: 0.04 }, // San Francisco
  { location: [23.8859, 45.0792] as [number, number], size: 0.04 }, // Saudi Arabia
  { location: [26.8206, 30.8025] as [number, number], size: 0.03 }, // Egypt
];

export function Globe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDark, setIsDark] = useState(false);

  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrame: number;

    const getSize = () => Math.max(canvas.offsetWidth, 1);

    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio, 2),
      width: getSize() * 2,
      height: getSize() * 2,
      phi: 0,
      theta: 0.3,
      dark: isDark ? 1 : 0,
      diffuse: isDark ? 1.2 : 1.5,
      mapSamples: 16000,
      mapBrightness: isDark ? 1.2 : 6,
      baseColor: isDark ? [0.3, 0.3, 0.3] : [1, 1, 1],
      markerColor: [0.2, 0.4, 1],
      glowColor: isDark ? [0.1, 0.3, 0.8] : [0.6, 0.7, 1],
      markers: MARKERS,
    });

    const animate = () => {
      if (pointerInteracting.current === null) {
        phiRef.current += 0.003;
      }

      const size = getSize();
      globe.update({
        phi: phiRef.current,
        width: size * 2,
        height: size * 2,
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    const onPointerDown = (e: PointerEvent) => {
      pointerInteracting.current = e.clientX;
      pointerInteractionMovement.current = 0;
      canvas.style.cursor = "grabbing";
    };

    const onPointerUp = () => {
      pointerInteracting.current = null;
      canvas.style.cursor = "grab";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current === null) return;
      const delta = e.clientX - pointerInteracting.current;
      pointerInteractionMovement.current = delta;
      phiRef.current += delta * 0.005;
      pointerInteracting.current = e.clientX;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches[0]) {
        pointerInteracting.current = e.touches[0].clientX;
      }
    };

    const onTouchEnd = () => {
      pointerInteracting.current = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pointerInteracting.current === null || !e.touches[0]) return;
      const delta = e.touches[0].clientX - pointerInteracting.current;
      phiRef.current += delta * 0.005;
      pointerInteracting.current = e.touches[0].clientX;
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerout", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("touchstart", onTouchStart);
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchmove", onTouchMove);

    return () => {
      cancelAnimationFrame(animationFrame);
      globe.destroy();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerout", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
