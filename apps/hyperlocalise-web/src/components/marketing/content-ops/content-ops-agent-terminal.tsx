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
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { FormattedMessage } from "react-intl";

import { automationEditorIllustrationMessages } from "@/components/marketing/automation-editor-illustration.messages";
import { cn } from "@/lib/primitives/cn";

import { CONTENT_OPS_MOCK_INNER_CLASSNAME } from "./content-ops-mock-stage.constants";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

export type ContentOpsStepStatus = "pending" | "running" | "done" | "warning";

export type ContentOpsTerminalStep = {
  label: string;
  status: ContentOpsStepStatus;
};

export type ContentOpsAgentTool = {
  icon: ReactNode;
  label: string;
  description: string;
};

export type ContentOpsTerminalScene = {
  id: string;
  automationName: string;
  triggerIcon: ReactNode;
  triggerLabel: string;
  instructions: string;
  tools: ContentOpsAgentTool[];
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

function SetupSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[0.68rem] font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function SetupPanel({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/50">{children}</div>
  );
}

function SetupRow({
  icon,
  title,
  description,
  trailing,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-start gap-2.5 border-b border-border/80 px-2.5 py-2 last:border-b-0">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.75rem] font-medium leading-snug text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 text-[0.68rem] leading-4 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
    </div>
  );
}

function AgentSetupPanel({ scene }: { scene: ContentOpsTerminalScene }) {
  return (
    <div className="flex min-h-0 flex-col border-b border-border/50 lg:border-b-0 lg:border-r">
      <header className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em] text-foreground">
            {scene.automationName}
          </p>
          <p className="mt-0.5 text-[0.65rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            <FormattedMessage {...automationEditorIllustrationMessages.settingsTab} />
          </p>
        </div>
        <span className="inline-flex size-2 shrink-0 rounded-full bg-primary" aria-hidden />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <SetupSection
          title={<FormattedMessage {...automationEditorIllustrationMessages.triggersSection} />}
        >
          <SetupPanel>
            <SetupRow icon={scene.triggerIcon} title={scene.triggerLabel} />
          </SetupPanel>
        </SetupSection>

        <SetupSection
          title={<FormattedMessage {...automationEditorIllustrationMessages.instructionsSection} />}
        >
          <SetupPanel>
            <pre className="max-h-24 overflow-hidden whitespace-pre-wrap px-2.5 py-2.5 font-sans text-[0.68rem] leading-[1.35rem] text-foreground/90">
              {scene.instructions}
            </pre>
          </SetupPanel>
        </SetupSection>

        <SetupSection
          title={<FormattedMessage {...automationEditorIllustrationMessages.toolsSection} />}
        >
          <SetupPanel>
            {scene.tools.map((tool) => (
              <SetupRow
                key={tool.label}
                icon={tool.icon}
                title={tool.label}
                description={tool.description}
              />
            ))}
            <div className="flex items-center gap-1.5 px-2.5 py-2 text-[0.68rem] font-medium text-muted-foreground">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.8} className="size-3.5" />
              <FormattedMessage {...automationEditorIllustrationMessages.addTool} />
            </div>
          </SetupPanel>
        </SetupSection>
      </div>
    </div>
  );
}

function AgentRunPanel({
  scene,
  visibleSteps,
  progress,
}: {
  scene: ContentOpsTerminalScene;
  visibleSteps: ContentOpsTerminalStep[];
  progress: number;
}) {
  return (
    <div className="flex min-h-0 min-h-[14rem] flex-col lg:min-h-0">
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
        <span className="ms-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <FormattedMessage {...contentOpsMockStageMessages.agentRunLabel} />
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4 font-mono">
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
                  "text-sm leading-relaxed",
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
    <div className={CONTENT_OPS_MOCK_INNER_CLASSNAME}>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <AgentSetupPanel scene={scene} />
        <AgentRunPanel scene={scene} visibleSteps={visibleSteps} progress={progress} />
      </div>
    </div>
  );
}
