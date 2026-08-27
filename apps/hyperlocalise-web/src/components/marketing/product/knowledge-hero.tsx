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
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowRight01Icon,
  BrainCircuitIcon,
  Database01Icon,
  LanguageCircleIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";

import { productPageMessages, type ProductMessageKey } from "./product-page-content.messages";
import { knowledgeMockMessages } from "./knowledge-mock-ui.messages";
import { KnowledgeWaveGlobe } from "./knowledge-wave-globe";

const EASE = [0.22, 1, 0.36, 1] as const;

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.85, ease: EASE } },
};

const staticVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

function RevealGroup({
  children,
  className,
  delay = 0,
  stagger = 0.12,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { delayChildren: delay, staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} variants={reduced ? staticVariants : itemVariants}>
      {children}
    </motion.div>
  );
}

function HeroSignal({
  icon,
  title,
  description,
}: {
  icon: typeof BrainCircuitIcon;
  title: React.ReactNode;
  description: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={reduced ? staticVariants : itemVariants}
      className="flex items-center gap-3 rounded-lg border border-primary/30 bg-background/75 px-3 py-2 backdrop-blur-md"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/8 text-primary">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-3.5" />
      </span>
      <div className="min-w-0 text-left">
        <p className="text-[11px] font-medium text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
}

export function KnowledgeHero({
  headlineKey,
  subcopyKey,
}: {
  headlineKey: ProductMessageKey;
  subcopyKey: ProductMessageKey;
}) {
  return (
    <section className="relative isolate mx-auto w-full max-w-6xl overflow-hidden bg-background">
      <KnowledgeWaveGlobe />

      <div className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-5 py-5 text-center sm:px-10 sm:py-10">
        <RevealGroup className="flex max-w-4xl flex-col items-center" delay={0.08} stagger={0.13}>
          <Reveal>
            <h1 className="max-w-4xl font-heading text-[clamp(3rem,7vw,4.75rem)] font-semibold leading-[0.94] tracking-[-0.035em] text-balance">
              <FormattedMessage {...productPageMessages[headlineKey]} />
            </h1>
          </Reveal>

          <Reveal>
            <p className="mt-7 max-w-2xl text-base leading-7 text-muted-foreground text-balance sm:text-lg sm:leading-8">
              <FormattedMessage {...productPageMessages[subcopyKey]} />
            </p>
          </Reveal>

          <Reveal className="mt-8">
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
            >
              <FormattedMessage {...knowledgeMockMessages.requestDemo} />
              <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" className="size-4" />
            </Button>
          </Reveal>

          <Reveal className="mt-14 w-full max-w-3xl">
            <div className="grid gap-2 sm:grid-cols-3">
              <HeroSignal
                icon={Database01Icon}
                title={<FormattedMessage {...knowledgeMockMessages.captureTitle} />}
                description={<FormattedMessage {...knowledgeMockMessages.captureDesc} />}
              />
              <HeroSignal
                icon={LanguageCircleIcon}
                title={<FormattedMessage {...knowledgeMockMessages.understandTitle} />}
                description={<FormattedMessage {...knowledgeMockMessages.understandDesc} />}
              />
              <HeroSignal
                icon={SparklesIcon}
                title={<FormattedMessage {...knowledgeMockMessages.recallTitle} />}
                description={<FormattedMessage {...knowledgeMockMessages.recallDesc} />}
              />
            </div>
          </Reveal>
        </RevealGroup>

        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent"
        />
      </div>
    </section>
  );
}
