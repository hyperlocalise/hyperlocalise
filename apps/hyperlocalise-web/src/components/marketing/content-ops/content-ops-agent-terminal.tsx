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
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { FormattedMessage } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

export type ContentOpsStepStatus = "pending" | "running" | "done" | "warning";

export type ContentOpsTerminalStep = {
  label: string;
  status: ContentOpsStepStatus;
};

export type ContentOpsTerminalScene = {
  id: string;
  triggerIcon: ReactNode;
  triggerLabel: string;
  tools: string[];
  steps: string[];
  highlightSteps?: ReadonlySet<string>;
};

const STEP_INTERVAL_MS = 900;

function StepIcon({ status }: { status: ContentOpsStepStatus }) {
  if (status === "running") {
    return (
      <span className="inline-block size-3.5 animate-spin rounded-full border border-primary/40 border-t-primary" />
    );
  }
  if (status === "warning") {
    return <span className="text-[11px] leading-none text-amber-700">⚠</span>;
  }
  if (status === "done") {
    return <span className="text-[11px] leading-none text-emerald-500">✓</span>;
  }
  return <span className="size-3.5 rounded-full border border-border/40" />;
}

export function ContentOpsAgentTerminal({
  scene,
  pauseAutoplay = false,
  onStepIndexChange,
}: {
  scene: ContentOpsTerminalScene;
  pauseAutoplay?: boolean;
  onStepIndexChange?: (stepIndex: number) => void;
}) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [visibleStepCount, setVisibleStepCount] = useState(1);

  useEffect(() => {
    setVisibleStepCount(1);
  }, [scene.id]);

  useEffect(() => {
    onStepIndexChange?.(Math.max(0, visibleStepCount - 1));
  }, [onStepIndexChange, visibleStepCount]);

  useEffect(() => {
    if (pauseAutoplay || shouldReduceMotion) {
      if (shouldReduceMotion) {
        setVisibleStepCount(scene.steps.length);
      }
      return;
    }

    if (visibleStepCount < scene.steps.length) {
      const timer = setTimeout(() => setVisibleStepCount((count) => count + 1), STEP_INTERVAL_MS);
      return () => clearTimeout(timer);
    }
  }, [pauseAutoplay, scene.steps.length, shouldReduceMotion, visibleStepCount]);

  const visibleSteps: ContentOpsTerminalStep[] = scene.steps
    .slice(0, visibleStepCount)
    .map((label, index) => {
      const isLast = index === visibleStepCount - 1;
      const isHighlight = scene.highlightSteps?.has(label) ?? false;
      return {
        label,
        status:
          isLast && visibleStepCount < scene.steps.length
            ? "running"
            : isHighlight
              ? "warning"
              : "done",
      };
    });

  const progress = visibleSteps.length / scene.steps.length;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <Image
          src="/images/logo.png"
          alt="Hyperlocalise"
          width={14}
          height={14}
          className="size-3.5"
        />
        <span className="text-xs font-semibold text-foreground">
          <FormattedMessage {...contentOpsMockStageMessages.botLabel} />
        </span>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border/30 px-4 py-2.5 text-xs text-muted-foreground">
        {scene.triggerIcon}
        <span>{scene.triggerLabel}</span>
      </div>

      <div className="flex min-h-[10rem] flex-col gap-2 px-4 py-4 font-mono">
        <AnimatePresence mode="popLayout">
          {visibleSteps.map((step, index) => (
            <motion.div
              key={`${scene.id}-${index}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2.5"
            >
              <StepIcon status={step.status} />
              <span
                className={cn(
                  "text-xs leading-relaxed",
                  step.status === "done" && "text-foreground/80",
                  step.status === "running" && "text-muted-foreground",
                  step.status === "warning" && "text-amber-700",
                  step.status === "pending" && "text-muted-foreground/40",
                )}
              >
                {step.label}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-border/30 px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {scene.tools.map((tool) => (
            <span
              key={tool}
              className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {tool}
            </span>
          ))}
        </div>
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-border/40">
          <motion.div
            className="h-full rounded-full bg-primary/60"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
}
