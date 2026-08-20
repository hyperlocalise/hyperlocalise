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
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Clock01Icon, GitBranchIcon, SparklesIcon, Upload01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";

import { automationsMockMessages } from "./automations-mock-ui.messages";

import Image from "next/image";

type StepStatus = "pending" | "running" | "done" | "warning";

type Step = {
  label: string;
  status: StepStatus;
};

type UseCase = {
  id: string;
  title: string;
  description: string;
  triggerIcon: React.ReactNode;
  triggerLabel: string;
  tools: string[];
  steps: Omit<Step, "status">[];
};

const STEP_INTERVAL_MS = 900;
const SCENE_HOLD_MS = 2500;

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") {
    return (
      <span className="inline-block size-3.5 animate-spin rounded-full border border-primary/40 border-t-primary" />
    );
  }
  if (status === "warning") {
    return <span className="text-[11px] leading-none text-amber-700">⚠</span>;
  }
  if (status === "done") {
    return <span className="text-[11px] leading-none text-emerald-400">✓</span>;
  }
  return <span className="size-3.5 rounded-full border border-border/40" />;
}

function TerminalPanel({ useCase, visibleSteps }: { useCase: UseCase; visibleSteps: Step[] }) {
  const progress = visibleSteps.length / useCase.steps.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <Image
          src="/images/logo.png"
          alt="Hyperlocalise"
          width={14}
          height={14}
          className="size-3.5"
        />
        <span className="text-xs font-semibold text-foreground">
          <FormattedMessage {...automationsMockMessages.botLabel} />
        </span>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border/30 px-4 py-2.5 text-xs text-muted-foreground">
        {useCase.triggerIcon}
        <span>{useCase.triggerLabel}</span>
      </div>

      <div className="flex min-h-[10rem] flex-1 flex-col gap-2 px-4 py-4 font-mono">
        <AnimatePresence mode="popLayout">
          {visibleSteps.map((step, i) => (
            <motion.div
              key={`${useCase.id}-${i}`}
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
          {useCase.tools.map((tool) => (
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

function UseCaseSelector({
  useCases,
  active,
  onSelect,
}: {
  useCases: UseCase[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between px-6 py-5">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          <FormattedMessage {...automationsMockMessages.eyebrow} />
        </p>
        <h3 className="mb-6 font-heading text-xl font-semibold leading-snug tracking-normal text-foreground sm:text-2xl">
          <FormattedMessage {...automationsMockMessages.headline} />
        </h3>
        <div className="flex flex-col gap-2">
          {useCases.map((uc) => (
            <button
              key={uc.id}
              onClick={() => onSelect(uc.id)}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-sm border px-4 py-3.5 text-left transition-all duration-200",
                uc.id === active
                  ? "border-primary/30 bg-primary/6"
                  : "border-transparent hover:border-border/60 hover:bg-muted/30",
              )}
            >
              <div
                className={cn(
                  "mt-1 w-0.5 self-stretch rounded-full transition-all duration-200",
                  uc.id === active ? "bg-primary" : "bg-transparent",
                )}
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-semibold leading-snug transition-colors",
                    uc.id === active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {uc.title}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xs leading-relaxed transition-colors",
                    uc.id === active ? "text-muted-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {uc.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center">
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
          className="cursor-pointer rounded-sm"
        >
          <FormattedMessage {...automationsMockMessages.requestDemo} />
        </Button>
      </div>
    </div>
  );
}

export function AutomationsMockUI() {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();

  const useCases: UseCase[] = [
    {
      id: "auto-translation",
      title: intl.formatMessage(automationsMockMessages.useCaseAutoTranslationTitle),
      description: intl.formatMessage(automationsMockMessages.useCaseAutoTranslationDescription),
      triggerIcon: <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(automationsMockMessages.triggerSourceUpload),
      tools: [
        intl.formatMessage(automationsMockMessages.toolCreateJob),
        intl.formatMessage(automationsMockMessages.toolTranslateWithAgent),
      ],
      steps: [
        { label: intl.formatMessage(automationsMockMessages.step1Auto1) },
        { label: intl.formatMessage(automationsMockMessages.step1Auto2) },
        { label: intl.formatMessage(automationsMockMessages.step1Auto3) },
        { label: intl.formatMessage(automationsMockMessages.step1Auto4) },
        { label: intl.formatMessage(automationsMockMessages.step1Auto5) },
      ],
    },
    {
      id: "review-with-agent",
      title: intl.formatMessage(automationsMockMessages.useCaseReviewWithAgentTitle),
      description: intl.formatMessage(automationsMockMessages.useCaseReviewWithAgentDescription),
      triggerIcon: <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(automationsMockMessages.triggerGithubMain),
      tools: [
        intl.formatMessage(automationsMockMessages.toolGitHub),
        intl.formatMessage(automationsMockMessages.toolValidation),
        intl.formatMessage(automationsMockMessages.toolSlack),
      ],
      steps: [
        { label: intl.formatMessage(automationsMockMessages.step2Review1) },
        { label: intl.formatMessage(automationsMockMessages.step2Review2) },
        { label: intl.formatMessage(automationsMockMessages.step2Review3) },
        { label: intl.formatMessage(automationsMockMessages.step2Review4) },
      ],
    },
    {
      id: "localisation-audit",
      title: intl.formatMessage(automationsMockMessages.useCaseLocalisationAuditTitle),
      description: intl.formatMessage(automationsMockMessages.useCaseLocalisationAuditDescription),
      triggerIcon: <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(automationsMockMessages.triggerGithubRelease),
      tools: [
        intl.formatMessage(automationsMockMessages.toolGitHub),
        intl.formatMessage(automationsMockMessages.toolValidation),
        intl.formatMessage(automationsMockMessages.toolSlack),
      ],
      steps: [
        { label: intl.formatMessage(automationsMockMessages.step3Audit1) },
        { label: intl.formatMessage(automationsMockMessages.step3Audit2) },
        { label: intl.formatMessage(automationsMockMessages.step3Audit3) },
        { label: intl.formatMessage(automationsMockMessages.step3Audit4) },
        { label: intl.formatMessage(automationsMockMessages.step3Audit5) },
        { label: intl.formatMessage(automationsMockMessages.step3Audit6) },
      ],
    },
  ];

  const warningSteps = new Set([
    intl.formatMessage(automationsMockMessages.step2Review4),
    intl.formatMessage(automationsMockMessages.step3Audit3),
  ]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleStepCount, setVisibleStepCount] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  const activeUseCase = useCases[activeIndex]!;

  const visibleSteps: Step[] = activeUseCase.steps.slice(0, visibleStepCount).map((step, i) => {
    const isLast = i === visibleStepCount - 1;
    const isWarning = warningSteps.has(step.label);
    return {
      ...step,
      status:
        isLast && visibleStepCount < activeUseCase.steps.length
          ? "running"
          : isWarning
            ? "warning"
            : "done",
    } satisfies Step;
  });

  useEffect(() => {
    if (isPaused || shouldReduceMotion) return;

    const totalSteps = activeUseCase.steps.length;

    if (visibleStepCount < totalSteps) {
      const t = setTimeout(() => setVisibleStepCount((n) => n + 1), STEP_INTERVAL_MS);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setActiveIndex((i) => (i + 1) % useCases.length);
      setVisibleStepCount(1);
    }, SCENE_HOLD_MS);

    return () => clearTimeout(t);
  }, [
    visibleStepCount,
    activeIndex,
    isPaused,
    activeUseCase.steps.length,
    useCases.length,
    shouldReduceMotion,
  ]);

  function handleSelect(id: string) {
    const idx = useCases.findIndex((uc) => uc.id === id);
    if (idx === -1) return;
    setIsPaused(true);
    setActiveIndex(idx);
    setVisibleStepCount(1);
    setTimeout(() => setIsPaused(false), 500);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-gray-alpha-100">
      <div className="grid min-h-[22rem] md:grid-cols-[1fr_1.4fr]">
        <div className="border-b border-border/60 md:border-b-0 md:border-r">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeUseCase.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="h-full"
            >
              <TerminalPanel useCase={activeUseCase} visibleSteps={visibleSteps} />
            </motion.div>
          </AnimatePresence>
        </div>
        <UseCaseSelector useCases={useCases} active={activeUseCase.id} onSelect={handleSelect} />
      </div>
    </div>
  );
}
