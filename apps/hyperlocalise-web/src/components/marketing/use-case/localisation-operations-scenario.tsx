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
  ChartBarIcon,
  CheckCircleIcon,
  FileTextIcon,
  GitPullRequestIcon,
  LockIcon,
  MegaphoneIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = { content: UseCasePageContent };
type Stage = 0 | 1 | 2 | 3;
type ApprovalKey = "product" | "legal" | "vendor";
type Approvals = Record<ApprovalKey, boolean>;

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const scenarioStages = [
  {
    titleKey: "localisationoperationsScenarioIntakeTitle",
    descriptionKey: "localisationoperationsScenarioIntakeDescription",
    sourceKey: "localisationoperationsScenarioIntakeSource",
    Icon: FileTextIcon,
    image: "/images/mesh/mesh-gradient-1788785908604.jpg",
  },
  {
    titleKey: "localisationoperationsScenarioRouteTitle",
    descriptionKey: "localisationoperationsScenarioRouteDescription",
    sourceKey: "localisationoperationsScenarioRouteSource",
    Icon: SparkleIcon,
    image: "/images/mesh/mesh-gradient-1784864042890.jpg",
  },
  {
    titleKey: "localisationoperationsScenarioDashboardTitle",
    descriptionKey: "localisationoperationsScenarioDashboardDescription",
    sourceKey: "localisationoperationsScenarioDashboardSource",
    Icon: ChartBarIcon,
    image: "/images/mesh/mesh-gradient-1784864073608.jpg",
  },
] as const;

const intakeStreams = [
  {
    id: "product",
    key: "localisationoperationsStreamProduct" as const,
    meta: "PR #128",
    Icon: GitPullRequestIcon,
  },
  {
    id: "marketing",
    key: "localisationoperationsStreamMarketing" as const,
    meta: "01",
    Icon: MegaphoneIcon,
  },
  { id: "help", key: "localisationoperationsStreamHelp" as const, meta: "12", Icon: BookOpenIcon },
  {
    id: "vendor",
    key: "localisationoperationsStreamVendor" as const,
    meta: "01",
    Icon: FileTextIcon,
  },
] as const;

function IntakePreview({ active }: { active: boolean }) {
  return (
    <div className="space-y-2">
      {intakeStreams.map(({ id, key, meta, Icon }) => (
        <div
          key={id}
          className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-xs font-medium">
            <Message messageKey={key} />
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">{meta}</span>
          {active ? (
            <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
          ) : (
            <span className="size-3 rounded-full border border-muted-foreground/40" />
          )}
        </div>
      ))}
      <p className="pt-1 text-[11px] text-muted-foreground">
        <Message messageKey="localisationoperationsScenarioIntakeNote" />
      </p>
    </div>
  );
}

const approvalTasks = [
  {
    id: "product",
    key: "localisationoperationsScenarioProductReview" as const,
    detail: "localisationoperationsScenarioProductReviewDetail" as const,
  },
  {
    id: "legal",
    key: "localisationoperationsScenarioLegalReview" as const,
    detail: "localisationoperationsScenarioLegalReviewDetail" as const,
  },
  {
    id: "vendor",
    key: "localisationoperationsScenarioVendorQa" as const,
    detail: "localisationoperationsScenarioVendorQaDetail" as const,
  },
] as const;

function RoutingPreview({
  enabled,
  approvals,
  onToggle,
}: {
  enabled: boolean;
  approvals: Approvals;
  onToggle: (key: ApprovalKey) => void;
}) {
  return (
    <div className="space-y-2">
      {approvalTasks.map((task) => (
        <button
          key={task.id}
          type="button"
          disabled={!enabled}
          aria-pressed={approvals[task.id]}
          onClick={() => onToggle(task.id)}
          className={cn(
            "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
            approvals[task.id]
              ? "border-primary/30 bg-primary/5"
              : "border-border/60 bg-background",
            enabled && !approvals[task.id] ? "hover:border-primary/30 hover:bg-muted/35" : "",
          )}
        >
          <span className="mt-0.5 shrink-0">
            {approvals[task.id] ? (
              <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
            ) : (
              <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">
              <Message messageKey={task.key} />
            </span>
            <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
              <Message messageKey={task.detail} />
            </span>
          </span>
        </button>
      ))}
      <div className="flex items-center gap-2 rounded-lg bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">
        <BookOpenIcon className="size-4 text-primary" aria-hidden />
        <Message messageKey="localisationoperationsScenarioHelpAutoRoute" />
      </div>
      <p className="text-[10px] text-muted-foreground">
        <Message
          messageKey={
            enabled
              ? "localisationoperationsScenarioReviewHint"
              : "localisationoperationsScenarioReviewLocked"
          }
        />
      </p>
    </div>
  );
}

function DashboardPreview({ started, approvals }: { started: boolean; approvals: Approvals }) {
  const approvedCount =
    Number(approvals.product) + Number(approvals.legal) + Number(approvals.vendor);
  const backlog = started ? 3 - approvedCount : 3;
  const coverage = started ? 18 + approvedCount * 2 : 18;
  const blocked = backlog;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border/60 bg-background p-2.5">
          <p className="text-[10px] leading-4 text-muted-foreground">
            <Message messageKey="localisationoperationsScenarioMetricCoverage" />
          </p>
          <p className="mt-2 font-mono text-lg font-semibold">{coverage}/24</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background p-2.5">
          <p className="text-[10px] leading-4 text-muted-foreground">
            <Message messageKey="localisationoperationsScenarioMetricBacklog" />
          </p>
          <p className="mt-2 font-mono text-lg font-semibold">{backlog}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background p-2.5">
          <p className="text-[10px] leading-4 text-muted-foreground">
            <Message messageKey="localisationoperationsScenarioMetricBlocked" />
          </p>
          <p
            className={cn(
              "mt-2 font-mono text-lg font-semibold",
              blocked ? "text-amber-700 dark:text-amber-300" : "text-primary",
            )}
          >
            {blocked}
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-border/60 bg-background p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span>
            <Message messageKey="localisationoperationsScenarioMetricLocaleHealth" />
          </span>
          <strong className="font-mono">{Math.round((coverage / 24) * 100)}%</strong>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(coverage / 24) * 100}%` }}
          />
        </div>
      </div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-3 text-xs",
          blocked ? "border-amber-500/30 bg-amber-500/5" : "border-primary/30 bg-primary/5",
        )}
      >
        {blocked ? (
          <LockIcon className="size-4 shrink-0 text-amber-600" aria-hidden />
        ) : (
          <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
        )}
        <span>
          <Message
            messageKey={
              blocked
                ? "localisationoperationsScenarioDashboardBlocked"
                : "localisationoperationsScenarioDashboardClear"
            }
          />
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        <Message messageKey="localisationoperationsScenarioDemoData" />
      </p>
    </div>
  );
}

function StageCard({
  index,
  active,
  done,
  sourceKey,
  titleKey,
  descriptionKey,
  Icon,
  image,
  children,
}: {
  index: number;
  active: boolean;
  done: boolean;
  sourceKey: UseCaseMessageKey;
  titleKey: UseCaseMessageKey;
  descriptionKey: UseCaseMessageKey;
  Icon: typeof FileTextIcon;
  image: string;
  children: ReactNode;
}) {
  return (
    <article className="relative flex min-h-[440px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-5 sm:min-h-[475px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-55"
        style={{ backgroundImage: `url("${image}")` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-background/35 to-background/85"
      />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-medium text-foreground/70">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl border border-border/50 bg-background/80 transition-transform duration-300",
            active ? "scale-110" : "",
          )}
        >
          {done ? (
            <CheckCircleIcon className="size-5 text-primary" weight="fill" aria-hidden />
          ) : (
            <Icon className="size-5 text-foreground" aria-hidden />
          )}
        </span>
      </div>
      <div className="relative z-10 my-auto py-7">
        <div
          className={cn(
            "rounded-2xl border border-border/55 bg-background/95 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.10)] backdrop-blur-xl transition-all duration-500",
            active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-95",
          )}
        >
          <div className="mb-3 flex items-center gap-2.5 border-b border-border/60 pb-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-4 text-primary" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-xs font-semibold">
              <Message messageKey={sourceKey} />
            </span>
            {done ? (
              <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
            ) : active ? (
              <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
            ) : null}
          </div>
          {children}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-lg font-medium leading-snug tracking-[-0.025em] text-foreground">
          <Message messageKey={titleKey} />
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground/70">
          <Message messageKey={descriptionKey} />
        </p>
      </div>
    </article>
  );
}

export function LocalisationOperationsScenario({ content }: Props) {
  const [stage, setStage] = useState<Stage>(0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [approvals, setApprovals] = useState<Approvals>({
    product: false,
    legal: false,
    vendor: false,
  });

  useEffect(() => {
    if (!running) return;
    const timers = [
      window.setTimeout(() => setStage(1), 250),
      window.setTimeout(() => setStage(2), 1500),
      window.setTimeout(() => setStage(3), 2750),
      window.setTimeout(() => {
        setRunning(false);
        setComplete(true);
      }, 4000),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [running]);

  function runSimulation() {
    if (running) return;
    setStage(0);
    setComplete(false);
    setApprovals({ product: false, legal: false, vendor: false });
    setRunning(true);
  }

  function toggleApproval(key: ApprovalKey) {
    if (!complete) return;
    setApprovals((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  const allApproved = approvals.product && approvals.legal && approvals.vendor;

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
          {scenarioStages.map((item, index) => (
            <StageCard
              key={item.titleKey}
              index={index}
              active={stage === index + 1}
              done={stage > index + 1 || (index === 2 && complete && allApproved)}
              sourceKey={item.sourceKey}
              titleKey={item.titleKey}
              descriptionKey={item.descriptionKey}
              Icon={item.Icon}
              image={item.image}
            >
              {index === 0 ? (
                <IntakePreview active={stage >= 1} />
              ) : index === 1 ? (
                <RoutingPreview
                  enabled={complete}
                  approvals={approvals}
                  onToggle={toggleApproval}
                />
              ) : (
                <DashboardPreview started={stage >= 3} approvals={approvals} />
              )}
            </StageCard>
          ))}
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {complete && allApproved ? (
              <>
                <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
                <Message messageKey="localisationoperationsScenarioComplete" />
              </>
            ) : complete ? (
              <>
                <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
                <Message messageKey="localisationoperationsScenarioAwaitingApprovals" />
              </>
            ) : running ? (
              <>
                <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
                <Message messageKey="localisationoperationsScenarioRunning" />
              </>
            ) : (
              <Message messageKey="localisationoperationsScenarioReady" />
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
                  ? "localisationoperationsScenarioRunningButton"
                  : complete
                    ? "localisationoperationsScenarioRerunButton"
                    : "localisationoperationsScenarioRunButton"
              }
            />
          </button>
        </div>
      </div>
    </section>
  );
}
