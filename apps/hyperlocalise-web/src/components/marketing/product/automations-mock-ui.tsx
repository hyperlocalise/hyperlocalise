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
import { Clock01Icon, GitPullRequestIcon, Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { LAVENDER_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { automationsMockMessages } from "./automations-mock-ui.messages";
import {
  MarketingMockShell,
  type MarketingMockMeshPosition,
  type MarketingMockVariant,
} from "./marketing-mock-shell";
import { MarketingMockUseCaseSelector } from "./marketing-mock-use-case-selector";

type StepStatus = "pending" | "running" | "done" | "warning";

type Step = {
  label: string;
  status: StepStatus;
};

export const AUTOMATIONS_MOCK_AUTO_REVIEW_ID = "auto-review";

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
  cta,
}: {
  useCases: UseCase[];
  active: string;
  onSelect: (id: string) => void;
  cta: ReactNode;
}) {
  return (
    <MarketingMockUseCaseSelector
      eyebrow={automationsMockMessages.eyebrow}
      headline={automationsMockMessages.headline}
      useCases={useCases}
      activeId={active}
      onSelect={onSelect}
      cta={cta}
    />
  );
}

export function AutomationsMockUI({
  priority = false,
  pauseAutoplay = false,
  renderCta,
  variant = "full",
  aside,
  meshPosition = "left",
}: {
  priority?: boolean;
  pauseAutoplay?: boolean;
  renderCta?: (useCaseId: string) => ReactNode;
  variant?: MarketingMockVariant;
  aside?: ReactNode;
  meshPosition?: MarketingMockMeshPosition;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();

  const useCases: UseCase[] = [
    {
      id: "gtm-publishing",
      title: intl.formatMessage(automationsMockMessages.useCaseGtmPublishingTitle),
      description: intl.formatMessage(automationsMockMessages.useCaseGtmPublishingDescription),
      triggerIcon: <HugeiconsIcon icon={Rocket01Icon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(automationsMockMessages.triggerGtmBriefApproved),
      tools: [
        intl.formatMessage(automationsMockMessages.toolCms),
        intl.formatMessage(automationsMockMessages.toolTranslate),
        intl.formatMessage(automationsMockMessages.toolSlack),
      ],
      steps: [
        { label: intl.formatMessage(automationsMockMessages.stepGtm1) },
        { label: intl.formatMessage(automationsMockMessages.stepGtm2) },
        { label: intl.formatMessage(automationsMockMessages.stepGtm3) },
        { label: intl.formatMessage(automationsMockMessages.stepGtm4) },
      ],
    },
    {
      id: AUTOMATIONS_MOCK_AUTO_REVIEW_ID,
      title: intl.formatMessage(automationsMockMessages.useCaseAutoReviewTitle),
      description: intl.formatMessage(automationsMockMessages.useCaseAutoReviewDescription),
      triggerIcon: <HugeiconsIcon icon={GitPullRequestIcon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(automationsMockMessages.triggerGithubPullRequest),
      tools: [
        intl.formatMessage(automationsMockMessages.toolGitHub),
        intl.formatMessage(automationsMockMessages.toolMentionReview),
      ],
      steps: [
        { label: intl.formatMessage(automationsMockMessages.stepAutoReview1) },
        { label: intl.formatMessage(automationsMockMessages.stepAutoReview2) },
        { label: intl.formatMessage(automationsMockMessages.stepAutoReview3) },
        { label: intl.formatMessage(automationsMockMessages.stepAutoReview4) },
      ],
    },
    {
      id: "keyword-research",
      title: intl.formatMessage(automationsMockMessages.useCaseKeywordResearchTitle),
      description: intl.formatMessage(automationsMockMessages.useCaseKeywordResearchDescription),
      triggerIcon: <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(automationsMockMessages.triggerKeywordResearchSchedule),
      tools: [
        intl.formatMessage(automationsMockMessages.toolSearch),
        intl.formatMessage(automationsMockMessages.toolExport),
        intl.formatMessage(automationsMockMessages.toolSlack),
      ],
      steps: [
        { label: intl.formatMessage(automationsMockMessages.stepKeyword1) },
        { label: intl.formatMessage(automationsMockMessages.stepKeyword2) },
        { label: intl.formatMessage(automationsMockMessages.stepKeyword3) },
        { label: intl.formatMessage(automationsMockMessages.stepKeyword4) },
      ],
    },
  ];

  const highlightSteps = new Set([intl.formatMessage(automationsMockMessages.stepKeyword3)]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleStepCount, setVisibleStepCount] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  const activeUseCase = useCases[activeIndex]!;

  const visibleSteps: Step[] = activeUseCase.steps.slice(0, visibleStepCount).map((step, i) => {
    const isLast = i === visibleStepCount - 1;
    const isHighlight = highlightSteps.has(step.label);
    return {
      ...step,
      status:
        isLast && visibleStepCount < activeUseCase.steps.length
          ? "running"
          : isHighlight
            ? "warning"
            : "done",
    } satisfies Step;
  });

  useEffect(() => {
    if (isPaused || pauseAutoplay || shouldReduceMotion) return;

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
    pauseAutoplay,
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
    <MarketingMockShell
      visual={
        <AnimatePresence mode="wait">
          <motion.div
            key={activeUseCase.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm"
          >
            <TerminalPanel useCase={activeUseCase} visibleSteps={visibleSteps} />
          </motion.div>
        </AnimatePresence>
      }
      sidebar={
        variant === "full" ? (
          <UseCaseSelector
            useCases={useCases}
            active={activeUseCase.id}
            onSelect={handleSelect}
            cta={
              renderCta ? (
                renderCta(activeUseCase.id)
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  nativeButton={false}
                  render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
                  className="cursor-pointer rounded-sm"
                >
                  <FormattedMessage {...automationsMockMessages.requestDemo} />
                </Button>
              )
            }
          />
        ) : undefined
      }
      aside={aside}
      meshSrc={LAVENDER_MESH_GRADIENT_SRC}
      priority={priority}
      variant={variant}
      meshPosition={meshPosition}
    />
  );
}
