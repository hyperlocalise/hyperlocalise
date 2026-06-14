"use client";

import { motion, useReducedMotion } from "motion/react";
import { FormattedMessage } from "react-intl";

import { HeroFrame } from "./hero-frame";
import { heroSectionMessages } from "./hero-section.messages";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { env } from "@/lib/env";

export function HeroSection() {
  const shouldReduceMotion = useReducedMotion();

  const headlineTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.88, ease: [0.19, 1, 0.22, 1] as const };
  const bodyTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.82, ease: [0.19, 1, 0.22, 1] as const };
  const ctaTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.78, ease: [0.19, 1, 0.22, 1] as const };
  const frameTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 1.18, ease: [0.19, 1, 0.22, 1] as const };

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
          <Button
            nativeButton={false}
            render={
              <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
            }
          >
            <FormattedMessage {...heroSectionMessages.joinWaitlist} />
          </Button>
        </motion.div>
      </motion.div>

      <div className="relative mt-12">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-[8%] -top-8 -bottom-10 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(96,116,9,0.18),transparent_58%),radial-gradient(circle_at_bottom_right,rgba(9,108,229,0.12),transparent_46%)] blur-3xl"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 1.48,
            delay: shouldReduceMotion ? 0 : 1.16,
            ease: [0.19, 1, 0.22, 1],
          }}
        />

        <motion.div
          className="relative"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 46, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            ...frameTransition,
            delay: shouldReduceMotion ? 0 : 1.52,
          }}
        >
          <HeroFrame />
        </motion.div>
      </div>
    </div>
  );
}
