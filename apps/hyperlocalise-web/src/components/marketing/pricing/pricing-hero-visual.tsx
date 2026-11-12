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
import { useEffect, useState } from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/primitives/cn";

/**
 * Decorative locales the hero price cycles through. The amount stays in USD and is
 * formatted with `Intl.NumberFormat`, so each frame is how that locale writes the
 * same real price — no invented currency conversions.
 */
const HERO_LOCALES = [
  { locale: "en-US", perMonth: "per month" },
  { locale: "fr-FR", perMonth: "par mois" },
  { locale: "ja-JP", perMonth: "月額" },
  { locale: "de-DE", perMonth: "pro Monat" },
  { locale: "pt-BR", perMonth: "por mês" },
  { locale: "ko-KR", perMonth: "월" },
  { locale: "vi-VN", perMonth: "mỗi tháng" },
  { locale: "es-MX", perMonth: "al mes" },
] as const;

const CYCLE_MS = 2400;
const EASE_OUT_EXPO = [0.19, 1, 0.22, 1] as const;

const GLYPHS = [
  { char: "$", x: 6, y: 14, size: 28, delay: 0 },
  { char: "€", x: 18, y: 72, size: 36, delay: 1.2 },
  { char: "¥", x: 30, y: 30, size: 20, delay: 2.1 },
  { char: "₫", x: 9, y: 46, size: 18, delay: 0.6 },
  { char: "£", x: 84, y: 18, size: 32, delay: 1.8 },
  { char: "₩", x: 92, y: 58, size: 22, delay: 0.3 },
  { char: "R$", x: 74, y: 82, size: 20, delay: 2.6 },
  { char: "₹", x: 62, y: 10, size: 18, delay: 1.5 },
  { char: "円", x: 46, y: 88, size: 24, delay: 0.9 },
  { char: "฿", x: 88, y: 88, size: 16, delay: 2.3 },
  { char: "₺", x: 4, y: 88, size: 20, delay: 1.1 },
  { char: "元", x: 38, y: 6, size: 18, delay: 2.9 },
] as const;

function formatUsd(locale: string, amount: number) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Slowly drifting currency glyphs. Purely decorative. */
export function CurrencyGlyphField({
  className,
  tone = "light",
}: {
  className?: string;
  /** `light` for mesh backgrounds, `primary` for plain page backgrounds. */
  tone?: "light" | "primary";
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {GLYPHS.map((glyph) => (
        <motion.span
          key={glyph.char}
          className={cn(
            "absolute font-heading font-semibold select-none",
            tone === "light" ? "text-white/45" : "text-primary",
          )}
          style={{ left: `${glyph.x}%`, top: `${glyph.y}%`, fontSize: glyph.size }}
          initial={false}
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  y: [0, -14, 0],
                  opacity: tone === "light" ? [0.5, 1, 0.5] : [0.15, 0.55, 0.15],
                }
          }
          transition={{
            duration: 6,
            delay: glyph.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {glyph.char}
        </motion.span>
      ))}
    </div>
  );
}

type PricingHeroVisualProps = {
  planName: string;
  amount: number;
};

export function PricingHeroVisual({ planName, amount }: PricingHeroVisualProps) {
  const shouldReduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % HERO_LOCALES.length);
    }, CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [shouldReduceMotion]);

  const frame = HERO_LOCALES[index];

  return (
    <div
      aria-hidden
      className="relative isolate flex min-h-72 items-center justify-center p-6 sm:min-h-80"
    >
      <CurrencyGlyphField tone="primary" className="-z-10" />

      <div className="w-full max-w-xs rounded-2xl border border-border bg-background p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-20px_rgba(0,0,0,0.2)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">{planName}</span>
          <span className="relative inline-flex h-6 min-w-16 items-center justify-center overflow-hidden rounded-full bg-primary/10 px-2.5 font-mono text-[0.6875rem] font-medium text-primary">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={frame.locale}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
              >
                {frame.locale}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>

        <div className="mt-5 flex h-14 items-baseline gap-2 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={frame.locale}
              className="flex items-baseline gap-2 whitespace-nowrap"
              initial={{ y: 28, opacity: 0, filter: "blur(6px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: -28, opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
            >
              <span className="font-heading text-5xl leading-none font-semibold tracking-tight text-foreground">
                {formatUsd(frame.locale, amount)}
              </span>
              <span className="text-sm text-muted-foreground">{frame.perMonth}</span>
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="mt-5 flex gap-1.5">
          {HERO_LOCALES.map((item, itemIndex) => (
            <span
              key={item.locale}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-500",
                itemIndex === index ? "bg-primary" : "bg-primary/15",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
