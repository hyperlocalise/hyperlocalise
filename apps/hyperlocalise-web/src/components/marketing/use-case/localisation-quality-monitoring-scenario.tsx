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
  BookOpenIcon,
  CheckCircleIcon,
  FileTextIcon,
  GlobeIcon,
  LockIcon,
  LockOpenIcon,
  PlayIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = { content: UseCasePageContent };
type Stage = 0 | 1 | 2 | 3;

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const stages = [
  {
    titleKey: "localisationqualityScenarioScanTitle",
    descriptionKey: "localisationqualityScenarioScanDescription",
    sourceKey: "localisationqualityScenarioScanSource",
    statusKey: "localisationqualityScenarioScanStatus",
    Icon: BookOpenIcon,
    image: "/images/mesh/mesh-gradient-1788785908604.jpg",
  },
  {
    titleKey: "localisationqualityScenarioReviewTitle",
    descriptionKey: "localisationqualityScenarioReviewDescription",
    sourceKey: "localisationqualityScenarioReviewSource",
    statusKey: "localisationqualityScenarioReviewStatus",
    Icon: ShieldCheckIcon,
    image: "/images/mesh/mesh-gradient-1784864042890.jpg",
  },
  {
    titleKey: "localisationqualityScenarioMonitorTitle",
    descriptionKey: "localisationqualityScenarioMonitorDescription",
    sourceKey: "localisationqualityScenarioMonitorSource",
    statusKey: "localisationqualityScenarioMonitorStatus",
    Icon: GlobeIcon,
    image: "/images/mesh/mesh-gradient-1784864073608.jpg",
  },
] as const;

function ScanPreview() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <BookOpenIcon className="size-4 text-primary" aria-hidden />
          <span className="flex-1 text-xs font-semibold">
            <Message messageKey="localisationqualityScenarioGlossaryUpdated" />
          </span>
          <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          <Message messageKey="localisationqualityScenarioGlossaryDetail" />
        </p>
      </div>
      <p className="text-[11px] font-semibold text-muted-foreground">
        <Message messageKey="localisationqualityScenarioScannedSources" />
      </p>
      {[
        { key: "localisationqualityWorkflowProduct" as const, count: 24 },
        { key: "localisationqualityWorkflowMarketing" as const, count: 12 },
        { key: "localisationqualityWorkflowHelpCenter" as const, count: 8 },
      ].map((source) => (
        <div
          key={source.key}
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5"
        >
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-xs">
            <Message messageKey={source.key} />
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{source.count}</span>
          <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
        </div>
      ))}
    </div>
  );
}

function ReviewPreview({
  complete,
  fixed,
  onFix,
}: {
  complete: boolean;
  fixed: boolean;
  onFix: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <p className="text-[10px] text-muted-foreground">
            <Message messageKey="localisationqualityWorkflowBaseline" />
          </p>
          <p className="mt-1 text-xl font-semibold">96%</p>
        </div>
        <div
          className={cn(
            "rounded-xl border p-3",
            fixed ? "border-primary/25 bg-primary/5" : "border-amber-500/25 bg-amber-500/5",
          )}
        >
          <p className="text-[10px] text-muted-foreground">
            <Message messageKey="localisationqualityWorkflowCurrent" />
          </p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold",
              fixed ? "text-primary" : "text-amber-700 dark:text-amber-300",
            )}
          >
            {fixed ? "96%" : "78%"}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/45 px-3 py-2 text-xs">
        <span>
          <Message messageKey="localisationqualityWorkflowMinimumScore" />
        </span>
        <strong>90%</strong>
      </div>
      <p className="text-[11px] font-semibold text-muted-foreground">
        <Message messageKey="localisationqualityScenarioFlaggedLocales" />
      </p>
      {[
        { code: "DE", key: "localisationqualityWorkflowGerman" as const },
        { code: "JA", key: "localisationqualityWorkflowJapanese" as const },
      ].map((locale) => (
        <div
          key={locale.code}
          className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-muted font-mono text-[11px] font-semibold">
            {locale.code}
          </span>
          <span className="min-w-0 flex-1 text-xs">
            <Message messageKey={locale.key} />
          </span>
          {fixed ? (
            <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
          ) : (
            <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
          )}
        </div>
      ))}
      <button
        type="button"
        disabled={!complete}
        onClick={onFix}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-xs font-semibold transition-colors enabled:cursor-pointer enabled:hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {fixed ? (
          <ArrowClockwiseIcon className="size-4" aria-hidden />
        ) : (
          <CheckCircleIcon className="size-4" aria-hidden />
        )}
        <Message
          messageKey={
            fixed
              ? "localisationqualityScenarioResetFixes"
              : "localisationqualityScenarioApproveFixes"
          }
        />
      </button>
    </div>
  );
}

function GateAndMonitorPreview({
  fixed,
  scanned,
  canScan,
  onScan,
}: {
  fixed: boolean;
  scanned: boolean;
  canScan: boolean;
  onScan: () => void;
}) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-xl border p-3",
          fixed ? "border-primary/25 bg-primary/5" : "border-amber-500/25 bg-amber-500/5",
        )}
      >
        <div className="flex items-center gap-2">
          {fixed ? (
            <LockOpenIcon className="size-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <LockIcon className="size-4 shrink-0 text-amber-600" aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-xs font-semibold">
            <Message
              messageKey={
                fixed
                  ? "localisationqualityScenarioSyncAllowed"
                  : "localisationqualityScenarioSyncBlocked"
              }
            />
          </span>
          {fixed ? (
            <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <Message
            messageKey={
              fixed
                ? "localisationqualityScenarioSyncApprovedNote"
                : "localisationqualityScenarioSyncBlockedNote"
            }
          />
        </p>
      </div>
      <div className="rounded-xl border border-border/60 bg-background p-3">
        <div className="flex items-center gap-2">
          <GlobeIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1 text-xs font-semibold">
            <Message messageKey="localisationqualityScenarioMonitoringWindow" />
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {(
            [
              "localisationqualityWorkflowDayOne",
              "localisationqualityWorkflowDaySeven",
              "localisationqualityWorkflowDayFourteen",
            ] as const
          ).map((key, index) => (
            <div
              key={key}
              className={cn(
                "rounded-lg border px-1.5 py-2 text-center text-[10px] font-medium",
                scanned && index === 2
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-border/60 bg-muted/25",
              )}
            >
              <Message messageKey={key} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <Message
            messageKey={
              scanned
                ? "localisationqualityScenarioDriftFound"
                : fixed
                  ? "localisationqualityScenarioMonitorLive"
                  : "localisationqualityScenarioMonitorWaiting"
            }
          />
        </p>
      </div>
      <button
        type="button"
        disabled={!canScan}
        onClick={onScan}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-xs font-semibold transition-colors enabled:cursor-pointer enabled:hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ArrowClockwiseIcon className="size-4" aria-hidden />
        <Message
          messageKey={
            scanned
              ? "localisationqualityScenarioResetMonitoring"
              : "localisationqualityScenarioScanDayFourteen"
          }
        />
      </button>
    </div>
  );
}

export function LocalisationQualityMonitoringScenario({ content }: Props) {
  const [stage, setStage] = useState<Stage>(0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timers = [
      window.setTimeout(() => setStage(1), 250),
      window.setTimeout(() => setStage(2), 1550),
      window.setTimeout(() => setStage(3), 2850),
      window.setTimeout(() => {
        setRunning(false);
        setComplete(true);
      }, 4050),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [running]);

  function runSimulation() {
    if (running) return;
    setStage(0);
    setFixed(false);
    setScanned(false);
    setComplete(false);
    setRunning(true);
  }

  function toggleFixes() {
    if (!complete) return;
    setFixed((value) => !value);
    setScanned(false);
  }

  function toggleScan() {
    if (!complete || !fixed) return;
    setScanned((value) => !value);
  }

  return (
    <section className="w-full">
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

      <div className="mt-12">
        <div className="grid gap-4 md:grid-cols-3">
          {stages.map((item, index) => {
            const Icon = item.Icon;
            const active = running && stage === index + 1;
            const done = stage > index + 1 || (complete && (index < 2 || fixed));

            return (
              <article
                key={item.titleKey}
                className="relative flex min-h-[470px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-5 sm:min-h-[520px]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-55"
                  style={{ backgroundImage: `url("${item.image}")` }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-background/45 to-background/85"
                />

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium tracking-[0.12em] text-foreground/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl border border-border/50 bg-background/80 transition-transform duration-300",
                      active && "scale-110",
                    )}
                  >
                    {done ? (
                      <CheckCircleIcon className="size-5 text-primary" weight="fill" aria-hidden />
                    ) : (
                      <Icon className="size-5 text-foreground" aria-hidden />
                    )}
                  </span>
                </div>

                <div className="relative z-10 my-auto py-8">
                  <div
                    className={cn(
                      "rounded-2xl border border-border/50 bg-background/95 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.10)] backdrop-blur-xl transition-all duration-500",
                      active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-95",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Icon className="size-5 text-primary" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          <Message messageKey={item.sourceKey} />
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Message messageKey={item.statusKey} />
                        </p>
                      </div>
                      {done ? (
                        <CheckCircleIcon
                          className="size-5 shrink-0 text-primary"
                          weight="fill"
                          aria-hidden
                        />
                      ) : active ? (
                        <span
                          className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-primary"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <div className="mt-4 border-t border-border/60 pt-4">
                      {index === 0 ? (
                        <ScanPreview />
                      ) : index === 1 ? (
                        <ReviewPreview complete={complete} fixed={fixed} onFix={toggleFixes} />
                      ) : (
                        <GateAndMonitorPreview
                          fixed={fixed}
                          scanned={scanned}
                          canScan={complete && fixed}
                          onScan={toggleScan}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="relative z-10">
                  <p className="text-lg font-medium leading-snug tracking-[-0.025em] text-foreground">
                    <Message messageKey={item.titleKey} />
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/75">
                    <Message messageKey={item.descriptionKey} />
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {scanned ? (
              <>
                <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
                <Message messageKey="localisationqualityScenarioDriftStatus" />
              </>
            ) : complete && fixed ? (
              <>
                <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
                <Message messageKey="localisationqualityScenarioReleased" />
              </>
            ) : complete ? (
              <>
                <LockIcon className="size-4" aria-hidden />
                <Message messageKey="localisationqualityScenarioBlocked" />
              </>
            ) : running ? (
              <>
                <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
                <Message messageKey="localisationqualityScenarioRunning" />
              </>
            ) : (
              <Message messageKey="localisationqualityScenarioReady" />
            )}
          </div>
          <button
            type="button"
            onClick={runSimulation}
            disabled={running}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {complete ? (
              <ArrowClockwiseIcon className="size-4" aria-hidden />
            ) : (
              <PlayIcon className="size-4" weight="fill" aria-hidden />
            )}
            <Message
              messageKey={
                running
                  ? "localisationqualityScenarioRunningButton"
                  : complete
                    ? "localisationqualityScenarioRerunButton"
                    : "localisationqualityScenarioRunButton"
              }
            />
          </button>
        </div>
      </div>
    </section>
  );
}
