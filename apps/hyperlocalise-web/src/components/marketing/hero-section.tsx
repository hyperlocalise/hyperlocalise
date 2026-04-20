"use client";

import { motion, useReducedMotion } from "motion/react";

import { HeroFrame } from "./hero-frame";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

export function HeroSection() {
  const shouldReduceMotion = useReducedMotion();

  const copyTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.52, ease: [0.19, 1, 0.22, 1] as const };
  const frameTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.74, ease: [0.19, 1, 0.22, 1] as const };

  return (
    <div id="home" className="pt-16 lg:pt-20">
      <motion.div
        className="max-w-3xl space-y-8"
        initial={shouldReduceMotion ? false : "hidden"}
        animate="visible"
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 14 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={copyTransition}
        >
          <TypographyH1 className="text-left">
            The localization system to launch globally in days
          </TypographyH1>
        </motion.div>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 14 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{
            ...copyTransition,
            delay: shouldReduceMotion ? 0 : 0.22,
          }}
        >
          <TypographyP className="max-w-5xl text-muted-foreground">
            Purpose-built for localization in the AI era. With human in the loop.
          </TypographyP>
        </motion.div>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 14 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{
            ...copyTransition,
            delay: shouldReduceMotion ? 0 : 0.3,
          }}
        >
          <Button
            className="rounded-full px-5"
            nativeButton={false}
            render={<a href="#waitlist" />}
          >
            Join waitlist
          </Button>
        </motion.div>
      </motion.div>

      <div className="relative mt-12">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-[8%] -top-8 -bottom-10 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(96,116,9,0.18),transparent_58%),radial-gradient(circle_at_bottom_right,rgba(9,108,229,0.12),transparent_46%)] blur-3xl"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 1,
            delay: shouldReduceMotion ? 0 : 0.52,
            ease: [0.19, 1, 0.22, 1],
          }}
        />

        <motion.div
          className="relative"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 28, scale: 0.975 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            ...frameTransition,
            delay: shouldReduceMotion ? 0 : 0.4,
          }}
        >
          <HeroFrame />
        </motion.div>
      </div>
    </div>
  );
}
