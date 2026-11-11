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
import { useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";
import { imageGenerationLoadingCardMessages as messages } from "./image-generation-loading-card.messages";

const DOT_SPACING = 11;
const DOT_MIN_RADIUS = 0.55;
const DOT_MAX_RADIUS = 2.3;
const DOT_MIN_ALPHA = 0.12;
/** Glow spread as a fraction of the card's mean side length. */
const GLOW_SIGMA_RATIO = 0.13;
const DEFAULT_ASPECT_RATIO = 4 / 3;
const DEFAULT_EXPECTED_DURATION_MS = 20_000;
/** Simulated progress approaches this ceiling and never claims completion. */
const SIMULATED_PROGRESS_CEILING = 95;
const PROGRESS_TICK_MS = 200;

type Glow = {
  centerX: number;
  centerY: number;
  amplitudeX: number;
  amplitudeY: number;
  frequencyX: number;
  frequencyY: number;
  phase: number;
};

const GLOWS: readonly Glow[] = [
  {
    centerX: 0.38,
    centerY: 0.36,
    amplitudeX: 0.3,
    amplitudeY: 0.24,
    frequencyX: 0.00031,
    frequencyY: 0.00023,
    phase: 0,
  },
  {
    centerX: 0.62,
    centerY: 0.64,
    amplitudeX: 0.3,
    amplitudeY: 0.26,
    frequencyX: 0.00024,
    frequencyY: 0.00035,
    phase: Math.PI,
  },
];

function simulatedProgress(elapsedMs: number, expectedDurationMs: number) {
  const timeConstant = Math.max(expectedDurationMs, 1) / 2.5;
  return SIMULATED_PROGRESS_CEILING * (1 - Math.exp(-elapsedMs / timeConstant));
}

function drawDotField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  color: string,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = color;

  const sigma = GLOW_SIGMA_RATIO * ((width + height) / 2);
  const twoSigmaSquared = 2 * sigma * sigma;
  const glowPoints = GLOWS.map((glow) => ({
    x: (glow.centerX + glow.amplitudeX * Math.sin(timeMs * glow.frequencyX + glow.phase)) * width,
    y: (glow.centerY + glow.amplitudeY * Math.cos(timeMs * glow.frequencyY + glow.phase)) * height,
  }));

  const columns = Math.ceil(width / DOT_SPACING);
  const rows = Math.ceil(height / DOT_SPACING);
  const offsetX = (width - (columns - 1) * DOT_SPACING) / 2;
  const offsetY = (height - (rows - 1) * DOT_SPACING) / 2;

  for (let row = 0; row < rows; row++) {
    const y = offsetY + row * DOT_SPACING;
    for (let column = 0; column < columns; column++) {
      const x = offsetX + column * DOT_SPACING;
      let intensity = 0;
      for (const point of glowPoints) {
        const dx = x - point.x;
        const dy = y - point.y;
        intensity += Math.exp(-(dx * dx + dy * dy) / twoSigmaSquared);
      }
      intensity = Math.min(1, intensity);
      context.globalAlpha = DOT_MIN_ALPHA + (1 - DOT_MIN_ALPHA) * intensity * intensity;
      context.beginPath();
      context.arc(
        x,
        y,
        DOT_MIN_RADIUS + (DOT_MAX_RADIUS - DOT_MIN_RADIUS) * intensity,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

export type ImageGenerationLoadingCardProps = {
  /** Expected output width in pixels; also sets the card's aspect ratio. */
  width?: number | null;
  /** Expected output height in pixels; also sets the card's aspect ratio. */
  height?: number | null;
  /** Controlled progress from 0 to 100. When omitted, progress is simulated. */
  progress?: number;
  /** Epoch milliseconds when generation began, so remounts keep simulated progress. */
  startedAt?: number;
  /** Typical generation time used to pace simulated progress. */
  expectedDurationMs?: number;
  /** CSS length capping the card height; width shrinks to keep the aspect ratio. */
  maxHeight?: string;
  className?: string;
};

export function ImageGenerationLoadingCard({
  width,
  height,
  progress,
  startedAt,
  expectedDurationMs = DEFAULT_EXPECTED_DURATION_MS,
  maxHeight,
  className,
}: ImageGenerationLoadingCardProps) {
  const intl = useIntl();
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [startTime] = useState(() => startedAt ?? Date.now());
  const [simulated, setSimulated] = useState(() =>
    Math.floor(simulatedProgress(Date.now() - startTime, expectedDurationMs)),
  );

  useEffect(() => {
    if (progress !== undefined) return;
    const interval = window.setInterval(() => {
      setSimulated(Math.floor(simulatedProgress(Date.now() - startTime, expectedDurationMs)));
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(interval);
  }, [progress, startTime, expectedDurationMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let cssWidth = 0;
    let cssHeight = 0;
    let color = getComputedStyle(canvas).color;

    const render = (timeMs: number) => {
      if (cssWidth > 0 && cssHeight > 0) {
        drawDotField(context, cssWidth, cssHeight, timeMs, color);
      }
    };
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const bounds = canvas.getBoundingClientRect();
      cssWidth = bounds.width;
      cssHeight = bounds.height;
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      color = getComputedStyle(canvas).color;
      if (reduceMotion) render(0);
    };
    const loop = (timeMs: number) => {
      render(timeMs);
      frame = window.requestAnimationFrame(loop);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      color = getComputedStyle(canvas).color;
      if (reduceMotion) render(0);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    resize();
    if (!reduceMotion) frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [reduceMotion]);

  const value = Math.round(Math.min(100, Math.max(0, progress ?? simulated)));
  const percentLabel = intl.formatNumber(value / 100, { style: "percent" });
  const hasDimensions = Boolean(width && height);
  const aspectRatio = hasDimensions ? width! / height! : DEFAULT_ASPECT_RATIO;

  return (
    <div
      role="progressbar"
      aria-label={intl.formatMessage(messages.label)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={percentLabel}
      className={cn(
        "relative mx-auto w-full overflow-hidden rounded-xl border border-border/60 bg-muted text-foreground",
        className,
      )}
      style={{
        aspectRatio,
        ...(maxHeight ? { maxWidth: `calc(${maxHeight} * ${aspectRatio})` } : {}),
      }}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      {hasDimensions ? (
        <span className="absolute top-3 right-3 rounded-full bg-background/85 px-2.5 py-1 font-mono text-xs text-muted-foreground tabular-nums shadow-sm backdrop-blur-sm">
          {intl.formatMessage(messages.dimensions, {
            width: intl.formatNumber(width!, { useGrouping: false }),
            height: intl.formatNumber(height!, { useGrouping: false }),
          })}
        </span>
      ) : null}
      <span className="absolute bottom-3 left-3 rounded-full bg-background/85 px-2.5 py-1 font-mono text-xs text-muted-foreground tabular-nums shadow-sm backdrop-blur-sm">
        {percentLabel}
      </span>
    </div>
  );
}
