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
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { siGithub } from "simple-icons";

import { Globe } from "@/components/ui/globe";

import { cn } from "@/lib/primitives/cn";

type IntegrationCard = {
  id: string;
  title: string;
  subtitle: string;
  type: "simple-icon" | "image";
  icon?: { path: string };
  src?: string;
  position: string;
  delay: number;
  amplitude: number;
};

const CARDS: IntegrationCard[] = [
  {
    id: "github",
    title: "GitHub",
    subtitle: "Push trigger detected",
    type: "simple-icon",
    icon: siGithub,
    position: "top-[5%] left-[2%]",
    delay: 0,
    amplitude: 4,
  },
  {
    id: "slack",
    title: "Slack",
    subtitle: "Team notified",
    type: "image",
    src: "/images/slack-logo.svg",
    position: "top-[10%] right-[0%]",
    delay: 0.6,
    amplitude: 5,
  },
  {
    id: "contentful",
    title: "Contentful",
    subtitle: "Strings synced",
    type: "image",
    src: "/images/contentful-logo.svg",
    position: "bottom-[5%] left-[4%]",
    delay: 1.2,
    amplitude: 4,
  },
];

function FloatingCard({
  card,
  shouldReduceMotion,
}: {
  card: IntegrationCard;
  shouldReduceMotion: boolean | null;
}) {
  return (
    <motion.div
      className={cn(
        "absolute flex items-center gap-2.5 rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5 shadow-lg backdrop-blur-sm",
        card.position,
      )}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: shouldReduceMotion ? 0 : [-card.amplitude, card.amplitude, -card.amplitude],
      }}
      transition={{
        opacity: { duration: 0.5, delay: card.delay },
        scale: { duration: 0.5, delay: card.delay },
        y: {
          duration: 10 + card.delay,
          repeat: Infinity,
          ease: "easeInOut",
          delay: card.delay,
        },
      }}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 p-1.5">
        {card.type === "simple-icon" && card.icon ? (
          <svg role="img" viewBox="0 0 24 24" className="size-full fill-foreground">
            <path d={card.icon.path} />
          </svg>
        ) : card.src ? (
          <Image
            src={card.src}
            alt={card.title}
            width={20}
            height={20}
            className="size-full object-contain"
          />
        ) : null}
      </div>
    </motion.div>
  );
}

function ConcentricCircles({ shouldReduceMotion }: { shouldReduceMotion: boolean | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {[1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-primary/20 dark:border-primary/30"
          style={{
            width: `${70 + i * 24}%`,
            height: `${70 + i * 24}%`,
          }}
          animate={shouldReduceMotion ? {} : { rotate: i % 2 === 0 ? 360 : -360 }}
          transition={{
            duration: 25 + i * 8,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <div className="absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary/50 dark:bg-primary/70" />
        </motion.div>
      ))}
    </div>
  );
}

export function GlobeHeroVisual() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/5 blur-3xl" />
      <ConcentricCircles shouldReduceMotion={shouldReduceMotion} />
      <div className="relative z-10 h-[300px] w-[300px] sm:h-[420px] sm:w-[420px] lg:h-[520px] lg:w-[520px]">
        <Globe className="absolute inset-0 h-full w-full" />
      </div>
      {CARDS.map((card) => (
        <FloatingCard key={card.id} card={card} shouldReduceMotion={shouldReduceMotion} />
      ))}
    </div>
  );
}
