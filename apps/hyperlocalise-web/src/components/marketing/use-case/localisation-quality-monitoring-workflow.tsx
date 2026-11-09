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
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  FileTextIcon,
  GlobeIcon,
  LockIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = { content: UseCasePageContent };

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const meshSources = [
  "/images/mesh/mesh-gradient-1784864073608.jpg",
  "/images/mesh/mesh-gradient-1788785908604.jpg",
  "/images/mesh/mesh-gradient-1784864042890.jpg",
  "/images/mesh/mesh-gradient-1784864145512.jpg",
] as const;

function MeshStage({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="relative isolate flex h-[310px] items-center justify-center overflow-hidden rounded-[1.5rem] bg-muted/35 p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${meshSources[index % meshSources.length]}")` }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-background/10" />
      <div className="relative z-10 w-full max-w-[320px]">{children}</div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/95 p-4 shadow-[0_18px_42px_rgba(35,40,58,0.12)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function PanelHeading({
  icon,
  titleKey,
  right,
}: {
  icon: ReactNode;
  titleKey: UseCaseMessageKey;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-xs font-semibold text-foreground">
        <Message messageKey={titleKey} />
      </span>
      {right}
    </div>
  );
}

function StatusPill({
  messageKey,
  warning = false,
}: {
  messageKey: UseCaseMessageKey;
  warning?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[10px] font-medium",
        warning
          ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-primary/25 bg-primary/10 text-primary",
      )}
    >
      <Message messageKey={messageKey} />
    </span>
  );
}

const sources = [
  { id: "product", key: "localisationqualityWorkflowProduct" as const, count: 24 },
  { id: "marketing", key: "localisationqualityWorkflowMarketing" as const, count: 12 },
  { id: "support", key: "localisationqualityWorkflowHelpCenter" as const, count: 8 },
] as const;

function ContentSyncPreview() {
  const [selected, setSelected] = useState<(typeof sources)[number]["id"]>("product");
  return (
    <MeshStage index={0}>
      <div className="relative">
        <Panel>
          <PanelHeading
            icon={<GlobeIcon className="size-4" aria-hidden />}
            titleKey="localisationqualityWorkflowSourcesTitle"
            right={<StatusPill messageKey="localisationqualityWorkflowConnected" />}
          />
          <div className="space-y-2">
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                aria-pressed={selected === source.id}
                onClick={() => setSelected(source.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected === source.id
                    ? "border-primary/35 bg-primary/5"
                    : "border-border/60 bg-background hover:bg-muted/50",
                )}
              >
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 text-xs font-medium">
                  <Message messageKey={source.key} />
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{source.count}</span>
                <CheckCircleIcon
                  className="size-4 shrink-0 text-primary"
                  weight="fill"
                  aria-hidden
                />
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            <Message messageKey="localisationqualityWorkflowSourceHint" />
          </p>
        </Panel>
        <div className="absolute -bottom-3 right-2 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[10px] font-medium shadow-lg">
          <Message messageKey="localisationqualityWorkflowThreeSources" />
        </div>
      </div>
    </MeshStage>
  );
}

function QualityAnalysisPreview() {
  const [showCoverage, setShowCoverage] = useState(false);
  return (
    <MeshStage index={1}>
      <Panel>
        <PanelHeading
          icon={<MagnifyingGlassIcon className="size-4" aria-hidden />}
          titleKey="localisationqualityWorkflowAnalysisTitle"
          right={<StatusPill messageKey="localisationqualityWorkflowIssuesFound" warning />}
        />
        <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
          {([false, true] as const).map((isCoverage) => (
            <button
              key={String(isCoverage)}
              type="button"
              aria-pressed={showCoverage === isCoverage}
              onClick={() => setShowCoverage(isCoverage)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                showCoverage === isCoverage
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <Message
                messageKey={
                  isCoverage
                    ? "localisationqualityWorkflowCoverageTab"
                    : "localisationqualityWorkflowTermsTab"
                }
              />
            </button>
          ))}
        </div>
        {showCoverage ? (
          <div className="mt-3 space-y-3 rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>
                <Message messageKey="localisationqualityWorkflowCoverageLabel" />
              </span>
              <strong>82%</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[82%] rounded-full bg-primary" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              <Message messageKey="localisationqualityWorkflowCoverageNote" />
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              <Message messageKey="localisationqualityWorkflowTermMismatch" />
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-md bg-background px-2 py-1 line-through text-muted-foreground">
                <Message messageKey="localisationqualityWorkflowOldName" />
              </span>
              <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />
              <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">
                <Message messageKey="localisationqualityWorkflowNewName" />
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <Message messageKey="localisationqualityWorkflowTermNote" />
            </p>
          </div>
        )}
      </Panel>
    </MeshStage>
  );
}

function RegressionPreview() {
  const [showDifference, setShowDifference] = useState(false);
  return (
    <MeshStage index={2}>
      <Panel>
        <PanelHeading
          icon={<ShieldCheckIcon className="size-4" aria-hidden />}
          titleKey="localisationqualityWorkflowRegressionTitle"
          right={<StatusPill messageKey="localisationqualityWorkflowBelowThreshold" warning />}
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <p className="text-[10px] text-muted-foreground">
              <Message messageKey="localisationqualityWorkflowBaseline" />
            </p>
            <p className="mt-1 text-2xl font-semibold">96%</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[10px] text-muted-foreground">
              <Message messageKey="localisationqualityWorkflowCurrent" />
            </p>
            <p className="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-300">78%</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <Message messageKey="localisationqualityWorkflowMinimumScore" />
          <strong className="text-foreground">90%</strong>
        </div>
        {showDifference ? (
          <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-foreground">
            <Message messageKey="localisationqualityWorkflowRegressionDifference" />
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setShowDifference((value) => !value)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-[11px] font-medium hover:bg-muted/40"
        >
          <BookOpenIcon className="size-3.5" aria-hidden />
          <Message
            messageKey={
              showDifference
                ? "localisationqualityWorkflowHideComparison"
                : "localisationqualityWorkflowCompareBaseline"
            }
          />
        </button>
      </Panel>
    </MeshStage>
  );
}

const reviewers = [
  { locale: "DE", key: "localisationqualityWorkflowGerman" as const },
  { locale: "JA", key: "localisationqualityWorkflowJapanese" as const },
  { locale: "FR", key: "localisationqualityWorkflowFrench" as const },
];

function ReviewPreview() {
  const [selected, setSelected] = useState("DE");
  return (
    <MeshStage index={3}>
      <Panel>
        <PanelHeading
          icon={<UsersIcon className="size-4" aria-hidden />}
          titleKey="localisationqualityWorkflowReviewTitle"
          right={<StatusPill messageKey="localisationqualityWorkflowReviewRequired" warning />}
        />
        <div className="space-y-2">
          {reviewers.map((reviewer) => (
            <button
              key={reviewer.locale}
              type="button"
              aria-pressed={selected === reviewer.locale}
              onClick={() => setSelected(reviewer.locale)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                selected === reviewer.locale
                  ? "border-primary/35 bg-primary/5"
                  : "border-border/60 bg-background hover:bg-muted/40",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-[11px] font-semibold">
                {reviewer.locale}
              </span>
              <span className="min-w-0 flex-1 text-xs">
                <Message messageKey={reviewer.key} />
              </span>
              {reviewer.locale === "FR" ? (
                <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
              ) : (
                <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
              )}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          <Message messageKey="localisationqualityWorkflowReviewerNote" />
        </p>
      </Panel>
    </MeshStage>
  );
}

function GatePreview() {
  const [resolved, setResolved] = useState(false);
  return (
    <MeshStage index={4}>
      <Panel>
        <PanelHeading
          icon={<LockIcon className="size-4" aria-hidden />}
          titleKey="localisationqualityWorkflowGateTitle"
          right={
            <StatusPill
              messageKey={
                resolved
                  ? "localisationqualityWorkflowGateAllowed"
                  : "localisationqualityWorkflowGateBlocked"
              }
              warning={!resolved}
            />
          }
        />
        <div
          className={cn(
            "rounded-xl border p-3",
            resolved ? "border-primary/25 bg-primary/5" : "border-amber-500/25 bg-amber-500/5",
          )}
        >
          <div className="flex items-center gap-2">
            {resolved ? (
              <CheckCircleIcon className="size-5 text-primary" weight="fill" aria-hidden />
            ) : (
              <WarningCircleIcon className="size-5 text-amber-600" aria-hidden />
            )}
            <p className="text-xs font-semibold">
              <Message
                messageKey={
                  resolved
                    ? "localisationqualityWorkflowPassedQuality"
                    : "localisationqualityWorkflowFailedQuality"
                }
              />
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              <Message messageKey="localisationqualityWorkflowMinimumScore" />
            </span>
            <span className="font-semibold">{resolved ? "96%" : "78%"} / 90%</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            <Message
              messageKey={
                resolved
                  ? "localisationqualityWorkflowReadyToSync"
                  : "localisationqualityWorkflowSyncStopped"
              }
            />
          </p>
        </div>
        <button
          type="button"
          onClick={() => setResolved((value) => !value)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-[11px] font-medium hover:bg-muted/40"
        >
          <ArrowClockwiseIcon className="size-3.5" aria-hidden />
          <Message
            messageKey={
              resolved
                ? "localisationqualityWorkflowResetExample"
                : "localisationqualityWorkflowPreviewResolved"
            }
          />
        </button>
      </Panel>
    </MeshStage>
  );
}

function MonitorPreview() {
  const [day, setDay] = useState<1 | 7 | 14>(1);
  return (
    <MeshStage index={5}>
      <Panel>
        <PanelHeading
          icon={<GlobeIcon className="size-4" aria-hidden />}
          titleKey="localisationqualityWorkflowMonitorTitle"
          right={
            <StatusPill
              messageKey={
                day === 14
                  ? "localisationqualityWorkflowDriftAlert"
                  : "localisationqualityWorkflowWatching"
              }
              warning={day === 14}
            />
          }
        />
        <p className="mb-3 text-[11px] text-muted-foreground">
          <Message messageKey="localisationqualityWorkflowMonitorNote" />
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([1, 7, 14] as const).map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={day === item}
              onClick={() => setDay(item)}
              className={cn(
                "rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors",
                day === item
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/60 hover:bg-muted/40",
              )}
            >
              <Message
                messageKey={
                  item === 1
                    ? "localisationqualityWorkflowDayOne"
                    : item === 7
                      ? "localisationqualityWorkflowDaySeven"
                      : "localisationqualityWorkflowDayFourteen"
                }
              />
            </button>
          ))}
        </div>
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-xl border px-3 py-3",
            day === 14 ? "border-amber-500/25 bg-amber-500/5" : "border-border/60 bg-muted/25",
          )}
        >
          {day === 14 ? (
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          ) : (
            <CheckCircleIcon
              className="mt-0.5 size-4 shrink-0 text-primary"
              weight="fill"
              aria-hidden
            />
          )}
          <p className="text-xs leading-5">
            <Message
              messageKey={
                day === 14
                  ? "localisationqualityWorkflowMonitorAlertDetail"
                  : "localisationqualityWorkflowMonitorClear"
              }
            />
          </p>
        </div>
      </Panel>
    </MeshStage>
  );
}

const previews = [
  <ContentSyncPreview key="sync" />,
  <QualityAnalysisPreview key="analysis" />,
  <RegressionPreview key="regression" />,
  <ReviewPreview key="review" />,
  <GatePreview key="gate" />,
  <MonitorPreview key="monitor" />,
];

export function LocalisationQualityMonitoringWorkflowSection({ content }: Props) {
  return (
    <section className="mx-auto w-full max-w-[1280px]">
      <div className="max-w-3xl">
        <TypographyP className="text-sm font-medium" tone="subtle">
          <Message messageKey={content.workflow.labelKey} />
        </TypographyP>
        <TypographyH2 className="mt-4 max-w-[760px] text-4xl leading-[1.08] tracking-[-0.05em] sm:text-5xl">
          <Message messageKey={content.workflow.titleKey} />
        </TypographyH2>
        <TypographyP className="mt-5 max-w-[650px] text-base leading-8" tone="subtle">
          <Message messageKey={content.workflow.descriptionKey} />
        </TypographyP>
      </div>

      <div className="mt-12 grid gap-x-5 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
        {content.workflow.steps.map((step, index) => (
          <article key={step.labelKey} className="min-w-0">
            {previews[index]}
            <div className="mt-5 px-1">
              <TypographyH3 className="text-[1.7rem] leading-tight tracking-[-0.04em]">
                <Message messageKey={step.labelKey} />
              </TypographyH3>
              {step.descriptionKey ? (
                <TypographyP className="mt-2 text-sm leading-6" tone="subtle">
                  <Message messageKey={step.descriptionKey} />
                </TypographyP>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
