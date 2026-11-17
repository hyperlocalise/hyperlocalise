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
import { CheckIcon, SparkleIcon, WarningIcon, XIcon } from "@phosphor-icons/react/ssr";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import {
  LOCALISATION_AUDIT_CRITERION_PASS_SCORE,
  LOCALISATION_AUDIT_CRITERION_WATCH_SCORE,
} from "@/lib/localisation-audit/criteria";
import {
  describeLocalisationAuditScoringModel,
  LOCALISATION_AUDIT_COVERAGE_STEPS,
} from "@/lib/localisation-audit/score-composition";
import { cn } from "@/lib/primitives/cn";

import type { LocalisationAuditPageCopy } from "./localisation-audit-page-content";
import { auditToneBadgeClass } from "./localisation-audit-tone";

const PERCENT = 100;

export function LocalisationAuditThresholdLegend({
  copy,
  className,
}: {
  copy: LocalisationAuditPageCopy;
  className?: string;
}) {
  const items = [
    {
      key: "pass",
      icon: <CheckIcon className="size-3.5" weight="bold" />,
      tone: "safe",
      label: copy.thresholdPassLabel,
      range: `${LOCALISATION_AUDIT_CRITERION_PASS_SCORE}–${PERCENT}`,
      body: copy.thresholdPassBody,
    },
    {
      key: "watch",
      icon: <WarningIcon className="size-3.5" weight="bold" />,
      tone: "watch",
      label: copy.thresholdWatchLabel,
      range: `${LOCALISATION_AUDIT_CRITERION_WATCH_SCORE}–${LOCALISATION_AUDIT_CRITERION_PASS_SCORE - 1}`,
      body: copy.thresholdWatchBody,
    },
    {
      key: "fix",
      icon: <XIcon className="size-3.5" weight="bold" />,
      tone: "risk",
      label: copy.thresholdFixLabel,
      range: copy.thresholdBelow({ value: LOCALISATION_AUDIT_CRITERION_WATCH_SCORE }),
      body: copy.thresholdFixBody,
    },
    {
      key: "ai",
      icon: <SparkleIcon className="size-3.5" />,
      tone: "neutral",
      label: copy.thresholdAiLabel,
      range: copy.thresholdNotScored,
      body: copy.thresholdAiBody,
    },
  ] as const;

  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex gap-3 rounded-xl border border-border p-4">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border",
              auditToneBadgeClass(item.tone),
            )}
            aria-hidden
          >
            {item.icon}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-foreground tabular-nums">{item.range}</span>
            </p>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LocalisationAuditScoringExplainer({ copy }: { copy: LocalisationAuditPageCopy }) {
  const model = describeLocalisationAuditScoringModel();
  const steps = [
    { title: copy.scoringStepMeasureTitle, body: copy.scoringStepMeasureBody },
    {
      title: copy.scoringStepWeightTitle,
      body: copy.scoringStepWeightBody({ max: model.maxWeight }),
    },
    { title: copy.scoringStepCoverageTitle, body: copy.scoringStepCoverageBody },
  ];
  const lastStep = LOCALISATION_AUDIT_COVERAGE_STEPS.length - 1;

  return (
    <section
      id="how-scoring-works"
      className="scroll-mt-24 border-t border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-10"
    >
      <TypographyH2 className="pb-0">{copy.scoringHeading}</TypographyH2>
      <TypographyP className="mt-4 max-w-2xl" size="large" tone="subtle">
        {copy.scoringSubcopy}
      </TypographyP>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {model.dimensions.map((dimension, index) => {
          const notice = copy.notices[index]!;
          const percent = Math.round(dimension.weightShare * PERCENT);
          return (
            <li
              key={dimension.dimension}
              className="flex flex-col rounded-2xl border border-border p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{notice.title}</p>
                <p className="text-xs text-muted-foreground">
                  {copy.scoringDimensionChecks({ checks: dimension.checks })}
                </p>
              </div>
              <p className="mt-2 flex-1 text-pretty text-sm text-muted-foreground">{notice.body}</p>
              <div className="mt-5">
                <p className="font-serif text-3xl tracking-tight tabular-nums">{percent}%</p>
                <p className="text-xs text-muted-foreground">
                  {copy.scoringDimensionShare({ percent })}
                </p>
                <span
                  className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full bg-foreground"
                    style={{ width: `${percent}%` }}
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <ol className="mt-12 grid gap-8 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{step.title}</p>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">{step.body}</p>
              {index === steps.length - 1 ? (
                <ul className="mt-4 space-y-1.5">
                  {LOCALISATION_AUDIT_COVERAGE_STEPS.map((coverage, stepIndex) => (
                    <li
                      key={coverage.localeCount}
                      className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {stepIndex === lastStep
                          ? copy.scoringCoverageLocalesPlus({ count: coverage.localeCount })
                          : copy.scoringCoverageLocales({ count: coverage.localeCount })}
                      </span>
                      <span
                        className="block h-1.5 overflow-hidden rounded-full bg-muted"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-foreground/70"
                          style={{ width: `${coverage.factor * PERCENT}%` }}
                        />
                      </span>
                      <span className="text-end font-medium tabular-nums">
                        ×{coverage.factor.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-12 text-sm font-medium">{copy.thresholdsHeading}</p>
      <LocalisationAuditThresholdLegend copy={copy} className="mt-4" />
    </section>
  );
}
