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
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { scoreTone } from "@/lib/localisation-audit/score-tone";
import { cn } from "@/lib/primitives/cn";

import { auditToneFillClass, auditToneStrokeClass } from "./localisation-audit-tone";

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

/** Score band edges, matching `interpretScore`. */
export const SCORE_BANDS = [
  { from: 0, to: 25, tone: "risk" },
  { from: 25, to: 50, tone: "risk" },
  { from: 50, to: 75, tone: "watch" },
  { from: 75, to: 90, tone: "safe" },
  { from: 90, to: 100, tone: "safe" },
] as const;

function clampScore(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

/** Counts from 0 to `value` once the element scrolls into view. */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1.1,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: REVEAL_EASE,
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [duration, inView, reduceMotion, value]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display.toFixed(decimals)}
    </span>
  );
}

/** Animated live counter that eases from the previous value to the next one. */
export function TweenNumber({ value, className }: { value: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (reduceMotion || from === value) {
      setDisplay(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [reduceMotion, value]);

  return <span className={cn("tabular-nums", className)}>{display}</span>;
}

export function ScoreRing({
  score,
  label,
  className,
}: {
  score: number | null;
  label: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const tone = scoreTone(score);
  const offset = RING_CIRCUMFERENCE * (1 - clampScore(score ?? 0) / 100);

  return (
    <div
      className={cn("relative size-40 shrink-0 sm:size-44", className)}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        {score == null ? null : (
          <motion.circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            className={auditToneStrokeClass(tone)}
            initial={{ strokeDashoffset: reduceMotion ? offset : RING_CIRCUMFERENCE }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: reduceMotion ? 0 : 1.2, ease: REVEAL_EASE }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="font-sans text-5xl font-semibold tracking-tight sm:text-6xl">
          {score == null ? "—" : <AnimatedNumber value={score} duration={1.2} />}
        </span>
        <span className="text-sm text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

/** Horizontal score bands with a marker at the current score. */
export function ScoreBandScale({
  score,
  label,
  className,
}: {
  score: number | null;
  label: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className={cn("w-full", className)} role="group" aria-label={label}>
      <div className="relative">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {SCORE_BANDS.map((band) => (
            <span
              key={band.from}
              className={cn("h-full opacity-80", auditToneFillClass(band.tone))}
              style={{ width: `${band.to - band.from}%` }}
            />
          ))}
        </div>
        {score == null ? null : (
          <motion.span
            aria-hidden
            className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-sm"
            initial={{ left: reduceMotion ? `${clampScore(score)}%` : "0%" }}
            animate={{ left: `${clampScore(score)}%` }}
            transition={{ duration: reduceMotion ? 0 : 1.2, ease: REVEAL_EASE }}
          />
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-xs text-muted-foreground tabular-nums" aria-hidden>
        {[0, 25, 50, 75, 90, 100].map((tick) => (
          <span
            key={tick}
            className={cn(
              "absolute",
              tick === 0 ? "start-0" : tick === 100 ? "end-0" : "-translate-x-1/2",
            )}
            style={tick === 0 || tick === 100 ? undefined : { left: `${tick}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A bar that grows to `value` percent when it scrolls into view. */
export function MeterBar({
  value,
  tone,
  delay = 0,
  className,
  barClassName,
}: {
  value: number;
  tone?: Parameters<typeof auditToneFillClass>[0];
  delay?: number;
  className?: string;
  barClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();
  const target = clampScore(value) / 100;

  return (
    <span
      ref={ref}
      className={cn("relative block h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <motion.span
        className={cn(
          "absolute inset-y-0 start-0 w-full origin-left rounded-full rtl:origin-right",
          tone ? auditToneFillClass(tone) : null,
          barClassName,
        )}
        initial={{ scaleX: reduceMotion ? target : 0 }}
        animate={{ scaleX: inView || reduceMotion ? target : 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.9,
          delay: reduceMotion ? 0 : delay,
          ease: REVEAL_EASE,
        }}
      />
    </span>
  );
}
