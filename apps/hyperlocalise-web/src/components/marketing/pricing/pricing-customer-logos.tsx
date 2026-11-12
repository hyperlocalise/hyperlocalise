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
import type { MessageDescriptor } from "react-intl";
import { useIntl } from "react-intl";

import { heroSectionMessages } from "@/components/marketing/hero-section.messages";
import { cn } from "@/lib/primitives/cn";

import { pricingCustomerLogosMessages as m } from "./pricing-customer-logos.messages";

type CustomerLogo = {
  id: string;
  src: string;
  alt: MessageDescriptor;
  width: number;
  height: number;
  /** Height tuned per mark so the logos read at a similar optical size. */
  className: string;
};

const CUSTOMER_LOGOS: readonly CustomerLogo[] = [
  {
    id: "canva",
    src: "/images/customers/canva-logo.svg",
    alt: m.canvaAlt,
    width: 80,
    height: 30,
    className: "h-7 sm:h-8",
  },
  {
    id: "linktree",
    src: "/images/customers/linktree-logo.svg",
    alt: m.linktreeAlt,
    width: 494,
    height: 100,
    className: "h-5 sm:h-6",
  },
  {
    id: "heidi-health",
    src: "/images/customers/heidi-health-logo.png",
    alt: heroSectionMessages.heidiHealthAlt,
    width: 800,
    height: 332,
    className: "h-9 sm:h-10",
  },
  {
    id: "weex",
    src: "/images/customers/weex-logo.svg",
    alt: heroSectionMessages.weexAlt,
    width: 134,
    height: 28,
    className: "h-5 sm:h-6",
  },
  {
    id: "wall-st-rank",
    src: "/images/customers/wall-st-rank-logo.svg",
    alt: heroSectionMessages.wallStRankAlt,
    width: 3044,
    height: 600,
    className: "h-6 sm:h-7",
  },
  {
    id: "ell-agency",
    src: "/images/customers/ell-agency-logo.png",
    alt: m.ellAgencyAlt,
    width: 400,
    height: 84,
    className: "h-6 sm:h-7",
  },
  {
    id: "crestec",
    src: "/images/customers/crestec-logo.svg",
    alt: m.crestecAlt,
    width: 162,
    height: 42,
    className: "h-6 sm:h-7",
  },
  {
    id: "tourfinder",
    src: "/images/customers/tourfinder-logo.png",
    alt: heroSectionMessages.tourfinderAlt,
    width: 1177,
    height: 294,
    className: "h-6 sm:h-7",
  },
];

/** Seconds for one full loop of the logo track. */
const LOOP_SECONDS = 28;
/**
 * Copies of the logo row in the track. One row is narrower than the container, so the
 * track loops over one copy while the rest keep the visible area filled.
 */
const TRACK_COPIES = 4;

const EDGE_FADE_STYLE = {
  maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
  WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
} as const;

function LogoRow({ hidden = false }: { hidden?: boolean }) {
  const intl = useIntl();

  return (
    <ul
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-14 pe-14 sm:gap-20 sm:pe-20"
    >
      {CUSTOMER_LOGOS.map((logo) => (
        <li key={logo.id} className="flex shrink-0 items-center">
          <Image
            src={logo.src}
            alt={hidden ? "" : intl.formatMessage(logo.alt)}
            width={logo.width}
            height={logo.height}
            unoptimized={logo.src.endsWith(".svg")}
            className={cn(
              "w-auto opacity-45 brightness-0 transition-opacity duration-200 hover:opacity-80 dark:invert",
              logo.className,
            )}
          />
        </li>
      ))}
    </ul>
  );
}

export function PricingCustomerLogos() {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="pricing-customers-heading"
      className="flex flex-col items-center gap-8"
    >
      <p id="pricing-customers-heading" className="text-sm text-muted-foreground">
        {intl.formatMessage(m.heading)}
      </p>

      {shouldReduceMotion ? (
        <div className="flex w-full justify-center overflow-hidden">
          <LogoRow />
        </div>
      ) : (
        <div className="w-full overflow-hidden" style={EDGE_FADE_STYLE}>
          <motion.div
            className="flex w-max"
            animate={{ x: ["0%", `-${100 / TRACK_COPIES}%`] }}
            transition={{ duration: LOOP_SECONDS, ease: "linear", repeat: Infinity }}
          >
            {Array.from({ length: TRACK_COPIES }, (_, copy) => (
              <LogoRow key={copy} hidden={copy > 0} />
            ))}
          </motion.div>
        </div>
      )}
    </section>
  );
}
