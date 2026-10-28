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

import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  BookOpenIcon,
  CheckCircleIcon,
  FileTextIcon,
  GlobeIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = {
  content: UseCasePageContent;
};

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const steps = [
  {
    titleKey: "helpCenterScenarioArticleUpdated",
    descriptionKey: "helpCenterScenarioArticleUpdatedDescription",
    Icon: FileTextIcon,
  },
  {
    titleKey: "helpCenterScenarioTranslationsReady",
    descriptionKey: "helpCenterScenarioTranslationsReadyDescription",
    Icon: SparkleIcon,
  },
  {
    titleKey: "helpCenterScenarioQualityChecked",
    descriptionKey: "helpCenterScenarioQualityCheckedDescription",
    Icon: ShieldCheckIcon,
  },
  {
    titleKey: "helpCenterScenarioContentSynced",
    descriptionKey: "helpCenterScenarioContentSyncedDescription",
    Icon: ArrowsClockwiseIcon,
  },
] as const;

type StepIndex = 0 | 1 | 2 | 3;

function FloatingStep({
  index,
  active,
  onClick,
  className = "",
}: {
  index: StepIndex;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  const step = steps[index];
  const Icon = step.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "group flex w-full items-center gap-3 rounded-2xl",
        "border bg-background/95 p-3 text-left",
        "shadow-[0_12px_35px_rgba(0,0,0,0.09)] backdrop-blur-xl",
        "transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(0,0,0,0.12)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground/45" : "border-border/50",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          active ? "bg-foreground text-muted" : "bg-muted text-foreground",
        ].join(" ")}
      >
        <Icon className="size-5" weight="regular" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium leading-5 text-foreground sm:text-sm">
          <Message messageKey={step.titleKey} />
        </span>
      </span>

      {active ? (
        <CheckCircleIcon className="size-4 shrink-0 text-foreground" weight="fill" aria-hidden />
      ) : (
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}

export function HelpCenterLocalisationScenario({ content }: Props) {
  const [activeStep, setActiveStep] = useState<StepIndex>(0);

  const currentStep = steps[activeStep];
  const ActiveIcon = currentStep.Icon;

  return (
    <section className="relative mx-auto w-full max-w-[1440px]">
      <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.25fr] lg:gap-16">
        {/* Left: editorial description */}
        <div className="max-w-xl">
          <TypographyP className="mb-5 text-sm" tone="subtle">
            <Message messageKey={content.scenario.labelKey} />
          </TypographyP>

          <TypographyH2
            className="max-w-[560px] text-4xl leading-[1.06] tracking-[-0.05em] sm:text-5xl"
            wrapStyle="balance"
          >
            <Message messageKey={content.scenario.titleKey} />
          </TypographyH2>

          <TypographyP
            className="mt-7 max-w-lg text-sm leading-relaxed sm:text-base sm:leading-8"
            tone="subtle"
          >
            <Message messageKey={content.scenario.narrativeKey} />
          </TypographyP>

          {/* Active step detail */}
          <div
            className="mt-8 flex items-start gap-3 border-t border-border pt-6"
            role="status"
            aria-live="polite"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
              <ActiveIcon className="size-5 text-foreground" aria-hidden />
            </span>

            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                <Message messageKey={currentStep.titleKey} />
              </p>

              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                <Message messageKey={currentStep.descriptionKey} />
              </p>
            </div>
          </div>
        </div>

        {/* Right: mesh highlight and floating workflow cards */}
        <div className="relative mx-auto w-full max-w-[680px] py-12 sm:py-16">
          {/* Tall mesh card: no interface elements inside */}
          <div className="relative mx-auto h-[28rem] w-full md:h-[28rem] md:w-[58%] overflow-hidden rounded-[32px] bg-muted shadow-[0_22px_55px_rgba(0,0,0,0.08)] sm:h-[540px]">
            <div
              className="absolute inset-0 bg-cover bg-center "
              style={{
                backgroundImage: 'url("/images/vimal-s-GBg3jyGS-Ug-unsplash.jpg")',
              }}
              aria-hidden="true"
            />

            {/* Gentle softening without covering the mesh */}
            <div className="absolute inset-0 bg-background/15" aria-hidden="true" />
          </div>

          {/* Floating cards on desktop/tablet */}
          <div className="pointer-events-none absolute inset-0 hidden sm:block">
            <div className="pointer-events-auto absolute left-0 top-[13%] w-[49%]">
              <FloatingStep index={0} active={activeStep === 0} onClick={() => setActiveStep(0)} />
            </div>

            <div className="pointer-events-auto absolute right-0 top-[30%] w-[49%]">
              <FloatingStep index={1} active={activeStep === 1} onClick={() => setActiveStep(1)} />
            </div>

            <div className="pointer-events-auto absolute left-0 bottom-[26%] w-[49%]">
              <FloatingStep index={2} active={activeStep === 2} onClick={() => setActiveStep(2)} />
            </div>

            <div className="pointer-events-auto absolute right-0 bottom-[10%] w-[49%]">
              <FloatingStep index={3} active={activeStep === 3} onClick={() => setActiveStep(3)} />
            </div>
          </div>

          {/* Mobile step cards */}
          <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 sm:hidden">
            {steps.map((step, index) => (
              <FloatingStep
                key={step.titleKey}
                index={index as StepIndex}
                active={activeStep === index}
                onClick={() => setActiveStep(index as StepIndex)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
