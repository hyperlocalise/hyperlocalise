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
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import { heroSectionMessages } from "./hero-section.messages";
import { REQUEST_DEMO_URL } from "./request-demo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

const dashboardHref = "/dashboard";
const HERO_IMAGE_SRC = "/images/nasa-Q1p7bh3SHj8-unsplash.jpg";

const TRUSTED_BY_LOGOS = [
  {
    id: "heidi-health",
    href: "https://www.heidihealth.com",
    src: "/images/customers/heidi-health-logo.png",
    alt: heroSectionMessages.heidiHealthAlt,
    width: 800,
    height: 332,
    className: "h-7 sm:h-8",
  },
  {
    id: "tourfinder",
    href: "https://tourfinder.vn",
    src: "/images/customers/tourfinder-logo.png",
    alt: heroSectionMessages.tourfinderAlt,
    width: 1177,
    height: 294,
    className: "h-6 sm:h-7",
  },
  {
    id: "tourmatic",
    href: "https://tourmatic.io",
    src: "/images/customers/tourmatic-logo.svg",
    alt: heroSectionMessages.tourmaticAlt,
    width: 315,
    height: 58,
    className: "h-6 sm:h-7",
  },
] as const;

export function HeroSection() {
  const shouldReduceMotion = useReducedMotion();
  const { user, loading } = useAuth();
  const isAuthenticated = Boolean(user);
  const intl = useIntl();

  const headlineTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.88, ease: [0.19, 1, 0.22, 1] as const };
  const bodyTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.82, ease: [0.19, 1, 0.22, 1] as const };
  const ctaTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.78, ease: [0.19, 1, 0.22, 1] as const };
  const trustedTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.7, ease: [0.19, 1, 0.22, 1] as const };

  return (
    <section
      id="home"
      className="relative left-1/2 -mt-16 w-screen min-h-[100svh] -translate-x-1/2 overflow-hidden"
    >
      <Image
        src={HERO_IMAGE_SRC}
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_35%]"
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/80"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-5xl flex-col px-5 pb-10 pt-28 sm:px-8 sm:pb-12 lg:px-10">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <motion.div
            className="space-y-8"
            initial={shouldReduceMotion ? false : "hidden"}
            animate="visible"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 26 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={headlineTransition}
            >
              <TypographyH1 className="text-balance text-white">
                <FormattedMessage {...heroSectionMessages.headline} />
              </TypographyH1>
            </motion.div>
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 22 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{
                ...bodyTransition,
                delay: shouldReduceMotion ? 0 : 0.56,
              }}
            >
              <TypographyP className="mx-auto max-w-2xl pb-0 text-base text-white/80 sm:text-lg">
                <FormattedMessage
                  {...heroSectionMessages.body}
                  values={{
                    desktopOnly: (chunks) => <span className="hidden sm:inline">{chunks}</span>,
                    lineBreak: () => <br />,
                  }}
                />
              </TypographyP>
            </motion.div>
            <motion.div
              className="flex justify-center"
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{
                ...ctaTransition,
                delay: shouldReduceMotion ? 0 : 1.11,
              }}
            >
              {loading ? (
                <Skeleton className="h-10 w-36 rounded-md bg-white/20" aria-hidden="true" />
              ) : isAuthenticated ? (
                <Button
                  size="lg"
                  className="bg-white text-neutral-950 hover:bg-white/90"
                  nativeButton={false}
                  render={<Link href={dashboardHref} />}
                >
                  <FormattedMessage {...heroSectionMessages.goToDashboard} />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="bg-white text-neutral-950 hover:bg-white/90"
                  nativeButton={false}
                  render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
                >
                  <FormattedMessage {...heroSectionMessages.joinWaitlist} />
                </Button>
              )}
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          className="mt-10 flex flex-col items-center gap-5 sm:mt-12"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            ...trustedTransition,
            delay: shouldReduceMotion ? 0 : 1.35,
          }}
        >
          <p className="text-[0.7rem] font-medium tracking-[0.18em] text-white/55 uppercase">
            <FormattedMessage {...heroSectionMessages.trustedBy} />
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {TRUSTED_BY_LOGOS.map((logo) => (
              <li key={logo.id}>
                <a
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center rounded-lg px-4 py-3 transition-colors duration-500 ease-out hover:bg-white focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <Image
                    src={logo.src}
                    alt={intl.formatMessage(logo.alt)}
                    width={logo.width}
                    height={logo.height}
                    unoptimized={logo.src.endsWith(".svg")}
                    className={cn(
                      "w-auto opacity-70 brightness-0 invert transition-[filter,opacity] duration-500 ease-out motion-reduce:transition-none group-hover:opacity-100 group-hover:brightness-100 group-hover:invert-0 group-focus-visible:opacity-100 group-focus-visible:brightness-100 group-focus-visible:invert-0",
                      logo.className,
                    )}
                  />
                </a>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
