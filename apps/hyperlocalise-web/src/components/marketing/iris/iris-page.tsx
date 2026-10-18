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
import { XIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { FormattedMessage } from "react-intl";

import { irisPageMessages } from "./iris-page.messages";
import { IrisVideoBackground } from "./iris-video-background";
import { IrisWaitlistCta } from "./iris-waitlist-cta";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { cn } from "@/lib/primitives/cn";

const easeOutExpo = [0.19, 1, 0.22, 1] as const;

const pillClassName =
  "inline-flex items-center rounded-full border border-white/18 bg-white/10 text-[oklch(0.97_0.012_95)] shadow-[0_10px_40px_oklch(0.12_0.03_260/0.28)] backdrop-blur-xl";

export function IrisPage() {
  const locale = useAppLocale();
  const shouldReduceMotion = useReducedMotion();
  const homeHref = rewriteAppLocalePath("/", locale);
  const reveal = shouldReduceMotion ? { duration: 0 } : { duration: 0.9, ease: easeOutExpo };

  return (
    <div className="relative isolate min-h-svh overflow-hidden bg-[oklch(0.14_0.02_260)] text-[oklch(0.97_0.012_95)]">
      <IrisVideoBackground />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.14_0.02_260/0.08)_0%,oklch(0.12_0.025_260/0.42)_58%,oklch(0.1_0.03_260/0.78)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.1_0.03_260/0.46)_0%,transparent_22%,transparent_68%,oklch(0.1_0.03_260/0.62)_100%)]"
      />

      <div className="relative z-10 flex min-h-svh flex-col justify-between px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -12 }}
          transition={reveal}
        >
          <div className={cn(pillClassName, "h-11 gap-1 pl-5 pr-1.5")}>
            <span className="font-[family-name:var(--font-iris-display)] text-[1.05rem] leading-none tracking-tight italic">
              <FormattedMessage {...irisPageMessages.wordmark} />
            </span>
            <Link
              className="inline-flex size-8 items-center justify-center rounded-full text-[oklch(0.97_0.012_95)] transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              href={homeHref}
            >
              <span className="sr-only">
                <FormattedMessage {...irisPageMessages.closeHome} />
              </span>
              <XIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </motion.header>

        <main className="mx-auto flex w-full max-w-4xl flex-col items-center px-2 text-center">
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 text-[0.72rem] font-medium tracking-[0.18em] text-[oklch(0.94_0.012_95/0.62)] uppercase"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            transition={reveal}
          >
            <FormattedMessage {...irisPageMessages.eyebrow} />
          </motion.p>
          <motion.h1
            animate={{ opacity: 1, y: 0 }}
            className="font-[family-name:var(--font-iris-display)] text-[clamp(2.4rem,7.2vw,5.6rem)] leading-[0.94] font-normal tracking-[-0.03em] text-balance italic"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 22 }}
            transition={{ ...reveal, delay: shouldReduceMotion ? 0 : 0.08 }}
          >
            <span className="block">
              <FormattedMessage {...irisPageMessages.headlineLead} />
            </span>
            <span className="block">
              <FormattedMessage {...irisPageMessages.headlinePayoff} />
            </span>
          </motion.h1>
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 max-w-[38rem] text-[0.98rem] leading-relaxed text-[oklch(0.94_0.012_95/0.78)] text-pretty sm:mt-7 sm:text-[1.05rem]"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
            transition={{ ...reveal, delay: shouldReduceMotion ? 0 : 0.16 }}
          >
            <FormattedMessage {...irisPageMessages.subcopy} />
          </motion.p>
        </main>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row sm:items-end"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          transition={{ ...reveal, delay: shouldReduceMotion ? 0 : 0.22 }}
        >
          <p className="max-w-sm text-center text-sm leading-relaxed text-[oklch(0.94_0.012_95/0.72)] sm:text-left">
            <FormattedMessage {...irisPageMessages.footerLine} />
          </p>
          <IrisWaitlistCta
            className={cn(
              pillClassName,
              "h-12 px-6 text-sm font-medium tracking-wide text-[oklch(0.16_0.03_260)] bg-[oklch(0.97_0.01_95)] border-transparent hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            )}
          />
        </motion.div>
      </div>
    </div>
  );
}
