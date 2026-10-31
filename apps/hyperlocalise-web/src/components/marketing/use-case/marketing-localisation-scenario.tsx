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
  ArrowClockwiseIcon,
  CheckCircleIcon,
  FileTextIcon,
  MegaphoneIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
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

type Stage = 0 | 1 | 2 | 3;

const stages = [
  {
    titleKey: "marketingScenarioBriefTitle",
    descriptionKey: "marketingScenarioBriefDescription",
    sourceKey: "marketingScenarioBriefSource",
    statusKey: "marketingScenarioBriefStatus",
    Icon: FileTextIcon,
    image: "/images/mesh/mesh-gradient-1788785908604.jpg",
  },
  {
    titleKey: "marketingScenarioDraftTitle",
    descriptionKey: "marketingScenarioDraftDescription",
    sourceKey: "marketingScenarioDraftSource",
    statusKey: "marketingScenarioDraftStatus",
    Icon: SparkleIcon,
    image: "/images/mesh/mesh-gradient-1784864042890.jpg",
  },
  {
    titleKey: "marketingScenarioPublishTitle",
    descriptionKey: "marketingScenarioPublishDescription",
    sourceKey: "marketingScenarioPublishSource",
    statusKey: "marketingScenarioPublishStatus",
    Icon: MegaphoneIcon,
    image: "/images/mesh/mesh-gradient-1784864073608.jpg",
  },
] as const;

export function MarketingLocalisationScenario({ content }: Props) {
  const [stage, setStage] = useState<Stage>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isRunning) return;

    const timers = [
      window.setTimeout(() => setStage(1), 250),
      window.setTimeout(() => setStage(2), 1750),
      window.setTimeout(() => setStage(3), 3250),
      window.setTimeout(() => {
        setIsRunning(false);
        setIsComplete(true);
      }, 4750),
    ];

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [isRunning]);

  function runSimulation() {
    if (isRunning) return;

    setStage(0);
    setIsComplete(false);
    setIsRunning(true);
  }

  return (
    <section className="w-full">
      {/* Section heading */}
      <div className="grid items-end gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-lg">
          <TypographyP className="mb-5 text-sm" tone="subtle">
            <Message messageKey={content.scenario.labelKey} />
          </TypographyP>

          <TypographyH2
            className="text-4xl leading-[1.05] tracking-[-0.05em] sm:text-5xl"
            wrapStyle="balance"
          >
            <Message messageKey={content.scenario.titleKey} />
          </TypographyH2>
        </div>

        <div className="max-w-xl lg:ml-auto lg:pb-2">
          <TypographyP className="text-sm leading-relaxed sm:text-md" tone="subtle">
            <Message messageKey={content.scenario.narrativeKey} />
          </TypographyP>
        </div>
      </div>

      {/* Interactive simulation */}
      <div className="mt-12">
        <div className="grid gap-4 md:grid-cols-3">
          {stages.map((item, index) => {
            const Icon = item.Icon;
            const isActive = stage === index + 1;
            const isDone = stage > index + 1;

            return (
              <article
                key={item.titleKey}
                className="relative flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-5 sm:min-h-[400px]"
              >
                {/* Mesh background */}
                <div
                  className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45"
                  style={{ backgroundImage: `url("${item.image}")` }}
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/30 via-background/50 to-background/85"
                  aria-hidden="true"
                />

                {/* Card label */}
                <div className="relative z-10 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium tracking-[0.12em] text-foreground/70">
                    {`0${index + 1}`}
                  </span>

                  <span
                    className={`flex size-9 items-center justify-center rounded-xl border border-border/50 bg-background/80 transition-transform duration-300 ${
                      isActive ? "scale-110" : ""
                    }`}
                  >
                    {isDone ? (
                      <CheckCircleIcon className="size-5 text-primary" weight="fill" aria-hidden />
                    ) : (
                      <Icon className="size-5 text-foreground" weight="regular" aria-hidden />
                    )}
                  </span>
                </div>

                {/* Main visual card */}
                <div className="relative z-10 my-auto py-10">
                  <div
                    className={`rounded-2xl border border-border/50 bg-background/95 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.10)] backdrop-blur-xl transition-all duration-500 ${
                      isActive ? "translate-y-0 opacity-100" : "translate-y-1 opacity-90"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Icon className="size-5 text-primary" weight="regular" aria-hidden />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          <Message messageKey={item.sourceKey} />
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          <Message messageKey={item.statusKey} />
                        </p>
                      </div>

                      {isDone ? (
                        <CheckCircleIcon
                          className="size-5 shrink-0 text-primary"
                          weight="fill"
                          aria-hidden
                        />
                      ) : isActive ? (
                        <span
                          className="size-2 shrink-0 animate-pulse rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>

                    <div className="mt-4 border-t border-border/60 pt-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        <Message messageKey={item.descriptionKey} />
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom card title */}
                <div className="relative z-10">
                  <p className="text-lg font-medium leading-snug tracking-[-0.025em] text-foreground">
                    <Message messageKey={item.titleKey} />
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        {/* Simulation controls */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {isComplete ? (
              <>
                <ShieldCheckIcon className="size-4 text-primary" aria-hidden />
                <Message messageKey="marketingScenarioComplete" />
              </>
            ) : isRunning ? (
              <>
                <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                <Message messageKey="marketingScenarioRunning" />
              </>
            ) : (
              <Message messageKey="marketingScenarioReady" />
            )}
          </div>

          <button
            type="button"
            onClick={runSimulation}
            disabled={isRunning}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isComplete ? (
              <ArrowClockwiseIcon className="size-4" aria-hidden />
            ) : (
              <PlayIcon className="size-4" weight="fill" aria-hidden />
            )}

            {isRunning ? (
              <Message messageKey="marketingScenarioRunningButton" />
            ) : isComplete ? (
              <Message messageKey="marketingScenarioRerunButton" />
            ) : (
              <Message messageKey="marketingScenarioRunButton" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
