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
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckIcon } from "lucide-react";
import { GitBranchIcon, PlusSignIcon, SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import Image from "next/image";

import { cn } from "@/lib/primitives/cn";
import { RefreshIcon } from "@hugeicons/core-free-icons";

import { automationEditorMockMessages } from "./automation-editor-mock.messages";

type Step = {
  id: string;
  titleKey: keyof typeof automationEditorMockMessages;
  descriptionKey: keyof typeof automationEditorMockMessages;
  highlightSection: "name" | "trigger" | "instructions" | "tools" | "done";
};

const STEP_DURATION_MS = 2000;

function MockSection({
  title,
  children,
  highlighted,
}: {
  title: ReactNode;
  children: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-lg p-2 transition-all duration-500",
        highlighted && "bg-primary/5 ring-1 ring-primary/20",
      )}
    >
      <h3 className="px-2 text-[0.7rem] font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function MockPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-muted", className)}>
      {children}
    </div>
  );
}

function MockRow({
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
    <div className="flex min-h-11 items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.8rem] font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 text-[0.7rem] leading-4 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2 text-[0.72rem] text-foreground">
      {children}
    </span>
  );
}

function MockEditorPreview({
  highlight,
  isDone,
}: {
  highlight: Step["highlightSection"];
  isDone: boolean;
}) {
  const intl = useIntl();

  return (
    <div className="flex flex-col">
      {/* Header — name */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-all duration-500",
          highlight === "name" && "bg-primary/5",
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-[0.85rem] font-semibold tracking-[-0.02em] text-foreground">
            <FormattedMessage {...automationEditorMockMessages.automationName} />
          </p>
          <p className="mt-0.5 text-[0.68rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Settings
          </p>
        </div>
        <span className="inline-flex size-2 shrink-0 rounded-full bg-primary" aria-hidden />
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <MockSection
          highlighted={highlight === "trigger"}
          title={<FormattedMessage {...automationEditorMockMessages.triggersLabel} />}
        >
          <MockPanel>
            <MockRow
              icon={<HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />}
              title={<FormattedMessage {...automationEditorMockMessages.triggerName} />}
              trailing={
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill>
                    <FormattedMessage {...automationEditorMockMessages.branchName} />
                  </Pill>
                </div>
              }
            />
          </MockPanel>
        </MockSection>

        <MockSection
          highlighted={highlight === "instructions"}
          title={<FormattedMessage {...automationEditorMockMessages.instructionsLabel} />}
        >
          <MockPanel>
            <pre className="max-h-24 overflow-hidden whitespace-pre-wrap px-3 py-3 font-sans text-[0.72rem] leading-5 text-foreground/90">
              <FormattedMessage {...automationEditorMockMessages.instructions} />
            </pre>
          </MockPanel>
        </MockSection>

        <MockSection
          highlighted={highlight === "tools"}
          title={<FormattedMessage {...automationEditorMockMessages.toolsLabel} />}
        >
          <MockPanel>
            <MockRow
              icon={<HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={1.8} className="size-4" />}
              title={<FormattedMessage {...automationEditorMockMessages.githubToolName} />}
              description={
                <FormattedMessage {...automationEditorMockMessages.githubToolDescription} />
              }
            />
            <MockRow
              icon={
                <Image
                  src="/images/slack-logo.svg"
                  alt="Slack"
                  width={16}
                  height={16}
                  className="size-4"
                />
              }
              title={<FormattedMessage {...automationEditorMockMessages.slackToolName} />}
              description={
                <FormattedMessage {...automationEditorMockMessages.slackToolDescription} />
              }
            />
            <div className="flex items-center gap-2 px-3 py-2.5 text-[0.72rem] font-medium text-muted-foreground">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.8} className="size-3.5" />
              <FormattedMessage {...automationEditorMockMessages.addTrigger} />
            </div>
          </MockPanel>
        </MockSection>
      </div>
    </div>
  );
}

function VerticalStepper({
  steps,
  current,
  onSelect,
  onReplay,
}: {
  steps: Step[];
  current: number;
  onSelect: (i: number) => void;
  onReplay: () => void;
}) {
  const intl = useIntl();
  const isLastStep = current === steps.length - 1;

  return (
    <div className="flex h-full flex-col">
      {/* Steps */}
      <div className="flex flex-1 flex-col">
        {steps.map((step, i) => {
          const isDone = i < current;
          const isActive = i === current;

          return (
            <div key={step.id} className="flex gap-3 sm:gap-4">
              {/* Circle + line */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className={cn(
                    "flex size-7 cursor-pointer items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-300 sm:size-8",
                    isDone && "border-foreground bg-foreground text-background",
                    isActive && "border-foreground bg-foreground text-background",
                    !isDone && !isActive && "border-border bg-transparent text-muted-foreground",
                  )}
                >
                  {isDone ? <CheckIcon className="size-3" /> : i + 1}
                </button>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "my-1 w-px flex-1 transition-colors duration-500",
                      i < current ? "bg-foreground" : "bg-border",
                    )}
                    style={{ minHeight: "1.5rem" }}
                  />
                )}
              </div>

              {/* Title + description */}
              <div className={cn("min-w-0 pb-4", i === steps.length - 1 && "pb-0")}>
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold leading-snug transition-colors duration-300",
                    isActive || isDone ? "text-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {intl.formatMessage(automationEditorMockMessages[step.titleKey])}
                </p>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {intl.formatMessage(automationEditorMockMessages[step.descriptionKey])}
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider + Replay — only shown on last step */}
      {isLastStep && (
        <div className="mt-4">
          <div className="border-t border-border/60" />
          <button
            type="button"
            onClick={onReplay}
            className="mt-3 flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.72rem] text-muted-foreground transition-colors hover:bg-muted/40"
          >
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="size-3.5" />
            {intl.formatMessage(automationEditorMockMessages.replay)}
          </button>
        </div>
      )}
    </div>
  );
}

export function AutomationEditorMock() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const steps: Step[] = [
    {
      id: "name",
      titleKey: "stepNameTitle",
      descriptionKey: "stepNameDescription",
      highlightSection: "name",
    },
    {
      id: "trigger",
      titleKey: "stepTriggerTitle",
      descriptionKey: "stepTriggerDescription",
      highlightSection: "trigger",
    },
    {
      id: "instructions",
      titleKey: "stepInstructionsTitle",
      descriptionKey: "stepInstructionsDescription",
      highlightSection: "instructions",
    },
    {
      id: "tools",
      titleKey: "stepToolsTitle",
      descriptionKey: "stepToolsDescription",
      highlightSection: "tools",
    },
    {
      id: "done",
      titleKey: "stepDoneTitle",
      descriptionKey: "stepDoneDescription",
      highlightSection: "done",
    },
  ];

  const isDone = currentStep === steps.length - 1;

  function handleReplay() {
    setCurrentStep(0);
    setIsPaused(false);
  }

  useEffect(() => {
    if (isPaused || isDone) return;
    const t = setTimeout(() => setCurrentStep((s) => s + 1), STEP_DURATION_MS);
    return () => clearTimeout(t);
  }, [currentStep, isPaused, isDone]);

  function handleSelect(i: number) {
    setCurrentStep(i);
    setIsPaused(true);
  }

  return (
    <div className="space-y-10">
      <div className="max-w-xl">
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          <FormattedMessage {...automationEditorMockMessages.sectionEyebrow} />
        </p>
        <h3 className="mt-5 font-heading text-3xl font-semibold leading-tight tracking-normal text-balance sm:text-4xl">
          <FormattedMessage {...automationEditorMockMessages.sectionHeadline} />
        </h3>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          <FormattedMessage {...automationEditorMockMessages.sectionDescription} />
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-gray-alpha-100">
        <div className="grid md:grid-cols-[1.4fr_1fr]">
          <div className="border-b border-border/60 md:border-b-0 md:border-r">
            <MockEditorPreview
              highlight={steps[currentStep]!.highlightSection}

              isDone={isDone}
            />
            <div className="border-t border-border/60 px-4 py-3">
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-border/40">
                <motion.div
                  className="h-full rounded-full bg-foreground/60"
                  animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>

          <div className="p-6">
            <VerticalStepper
              steps={steps}
              current={currentStep}
              onSelect={handleSelect}
              onReplay={handleReplay}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
