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
import Link from "next/link";
import { FormattedMessage } from "react-intl";

import { heroSectionMessages } from "./hero-section.messages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { env } from "@/lib/env";

const dashboardHref = "/dashboard";

export function HeroSection() {
  const shouldReduceMotion = useReducedMotion();
  const { user, loading } = useAuth();
  const isAuthenticated = Boolean(user);

  const headlineTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.88, ease: [0.19, 1, 0.22, 1] as const };
  const bodyTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.82, ease: [0.19, 1, 0.22, 1] as const };
  const ctaTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.78, ease: [0.19, 1, 0.22, 1] as const };

  return (
    <div id="home" className="pt-16 lg:pt-20">
      <motion.div
        className="max-w-3xl space-y-8"
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
          <TypographyH1 className="text-left">
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
          <TypographyP className="max-w-5xl text-muted-foreground">
            <FormattedMessage
              {...heroSectionMessages.body}
              values={{
                lineBreak: () => <br />,
              }}
            />
          </TypographyP>
        </motion.div>
        <motion.div
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
            <Skeleton className="h-9 w-36 rounded-md" aria-hidden="true" />
          ) : isAuthenticated ? (
            <Button nativeButton={false} render={<Link href={dashboardHref} />}>
              <FormattedMessage {...heroSectionMessages.goToDashboard} />
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={
                <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
              }
            >
              <FormattedMessage {...heroSectionMessages.joinWaitlist} />
            </Button>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
