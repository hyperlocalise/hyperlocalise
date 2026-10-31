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
  ChartBarIcon,
  CheckCircleIcon,
  FileTextIcon,
  GitPullRequestIcon,
  GlobeIcon,
  LockIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  SparkleIcon,
  UsersIcon,
  WarningCircleIcon,
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
    <div className="relative isolate flex h-[320px] items-center justify-center overflow-hidden rounded-[1.5rem] bg-muted/35 p-4">
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
    <div className="rounded-2xl border border-border/60 bg-background/95 p-4 shadow-[0_18px_42px_rgba(35,40,58,0.12)] backdrop-blur-xl">
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
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-xs font-semibold text-foreground">
        <Message messageKey={titleKey} />
      </span>
      {right}
    </div>
  );
}

function Status({
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
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-primary/25 bg-primary/10 text-primary",
      )}
    >
      <Message messageKey={messageKey} />
    </span>
  );
}

const streams = [
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

function IntakePreview() {
  const [selected, setSelected] = useState<(typeof streams)[number]["id"]>("product");
  return (
    <MeshStage index={0}>
      <div className="relative">
        <Panel>
          <PanelHeading
            icon={<GlobeIcon className="size-4" aria-hidden />}
            titleKey="localisationoperationsWorkflowIntakeTitle"
            right={<Status messageKey="localisationoperationsWorkflowFourStreams" />}
          />
          <div className="space-y-2">
            {streams.map(({ id, key, meta, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={selected === id}
                onClick={() => setSelected(id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected === id
                    ? "border-primary/35 bg-primary/5"
                    : "border-border/60 bg-background hover:bg-muted/45",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 text-xs font-medium">
                  <Message messageKey={key} />
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{meta}</span>
                <CheckCircleIcon
                  className="size-4 shrink-0 text-primary"
                  weight="fill"
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </Panel>
        <div className="absolute -bottom-3 right-2 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-[10px] font-medium shadow-lg">
          <Message messageKey="localisationoperationsWorkflowIntakeHint" />
        </div>
      </div>
    </MeshStage>
  );
}

const contextItems = [
  {
    id: "product",
    tab: "localisationoperationsContextProduct" as const,
    title: "localisationoperationsContextProductTitle" as const,
    detail: "localisationoperationsContextProductDetail" as const,
  },
  {
    id: "campaign",
    tab: "localisationoperationsContextCampaign" as const,
    title: "localisationoperationsContextCampaignTitle" as const,
    detail: "localisationoperationsContextCampaignDetail" as const,
  },
  {
    id: "vendor",
    tab: "localisationoperationsContextVendor" as const,
    title: "localisationoperationsContextVendorTitle" as const,
    detail: "localisationoperationsContextVendorDetail" as const,
  },
] as const;

function ContextPreview() {
  const [selected, setSelected] = useState<(typeof contextItems)[number]["id"]>("product");
  const current = contextItems.find((item) => item.id === selected) ?? contextItems[0];
  return (
    <MeshStage index={1}>
      <Panel>
        <PanelHeading
          icon={<BookOpenIcon className="size-4" aria-hidden />}
          titleKey="localisationoperationsWorkflowContextTitle"
          right={<Status messageKey="localisationoperationsWorkflowContextReady" />}
        />
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
          {contextItems.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
              className={cn(
                "rounded-md px-1 py-2 text-[10px] font-medium",
                selected === item.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <Message messageKey={item.tab} />
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-border/60 bg-background p-3">
          <p className="text-xs font-semibold">
            <Message messageKey={current.title} />
          </p>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            <Message messageKey={current.detail} />
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-primary">
          <CheckCircleIcon className="size-4" weight="fill" aria-hidden />
          <Message messageKey="localisationoperationsWorkflowGlossaryAttached" />
        </div>
      </Panel>
    </MeshStage>
  );
}

const routes = [
  {
    key: "localisationoperationsStreamProduct" as const,
    route: "localisationoperationsRouteAgent" as const,
    Icon: SparkleIcon,
  },
  {
    key: "localisationoperationsStreamMarketing" as const,
    route: "localisationoperationsRouteLegal" as const,
    Icon: ShieldCheckIcon,
  },
  {
    key: "localisationoperationsStreamHelp" as const,
    route: "localisationoperationsRouteCms" as const,
    Icon: BookOpenIcon,
  },
  {
    key: "localisationoperationsStreamVendor" as const,
    route: "localisationoperationsRouteTms" as const,
    Icon: GlobeIcon,
  },
] as const;

function RoutingPreview() {
  const [expanded, setExpanded] = useState(0);
  return (
    <MeshStage index={2}>
      <Panel>
        <PanelHeading
          icon={<SparkleIcon className="size-4" aria-hidden />}
          titleKey="localisationoperationsWorkflowRoutingTitle"
          right={<Status messageKey="localisationoperationsWorkflowAssigned" />}
        />
        <div className="space-y-2">
          {routes.map(({ key, route, Icon }, index) => (
            <button
              key={key}
              type="button"
              aria-pressed={expanded === index}
              onClick={() => setExpanded(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2.5 text-left transition-colors",
                expanded === index
                  ? "border-primary/35 bg-primary/5"
                  : "border-border/60 hover:bg-muted/50",
              )}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-[11px] font-medium">
                <Message messageKey={key} />
              </span>
              <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="max-w-[45%] text-right text-[10px] font-medium text-primary">
                <Message messageKey={route} />
              </span>
            </button>
          ))}
        </div>
      </Panel>
    </MeshStage>
  );
}

const approvals = [
  {
    id: "product",
    key: "localisationoperationsReviewHuman" as const,
    note: "localisationoperationsReviewProductNote" as const,
  },
  {
    id: "marketing",
    key: "localisationoperationsReviewLegal" as const,
    note: "localisationoperationsReviewMarketingNote" as const,
  },
  {
    id: "vendor",
    key: "localisationoperationsReviewVendor" as const,
    note: "localisationoperationsReviewVendorNote" as const,
  },
] as const;

function ReviewPreview() {
  const [selected, setSelected] = useState<(typeof approvals)[number]["id"]>("marketing");
  const current = approvals.find((item) => item.id === selected) ?? approvals[1];
  return (
    <MeshStage index={3}>
      <Panel>
        <PanelHeading
          icon={<UsersIcon className="size-4" aria-hidden />}
          titleKey="localisationoperationsWorkflowReviewTitle"
          right={<Status messageKey="localisationoperationsWorkflowReviewPending" warning />}
        />
        <div className="space-y-2">
          {approvals.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left",
                selected === item.id
                  ? "border-primary/35 bg-primary/5"
                  : "border-border/60 hover:bg-muted/40",
              )}
            >
              <span className="size-2 shrink-0 rounded-full bg-amber-500" />
              <span className="min-w-0 flex-1 text-xs">
                <Message messageKey={item.key} />
              </span>
              <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
            </button>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-muted/50 p-2 text-[11px] leading-5 text-muted-foreground">
          <Message messageKey={current.note} />
        </p>
      </Panel>
    </MeshStage>
  );
}

function SyncPreview() {
  const [passed, setPassed] = useState(false);
  return (
    <MeshStage index={4}>
      <Panel>
        <PanelHeading
          icon={<LockIcon className="size-4" aria-hidden />}
          titleKey="localisationoperationsWorkflowSyncTitle"
          right={
            <Status
              messageKey={
                passed
                  ? "localisationoperationsWorkflowSyncAllowed"
                  : "localisationoperationsWorkflowSyncBlocked"
              }
              warning={!passed}
            />
          }
        />
        <div
          className={cn(
            "rounded-xl border p-3",
            passed ? "border-primary/25 bg-primary/5" : "border-amber-500/25 bg-amber-500/5",
          )}
        >
          <div className="flex items-center gap-2">
            {passed ? (
              <CheckCircleIcon className="size-5 text-primary" weight="fill" aria-hidden />
            ) : (
              <WarningCircleIcon className="size-5 text-amber-600" aria-hidden />
            )}
            <p className="text-xs font-semibold">
              <Message
                messageKey={
                  passed
                    ? "localisationoperationsWorkflowGatePassed"
                    : "localisationoperationsWorkflowGateFailed"
                }
              />
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              <Message messageKey="localisationoperationsWorkflowThreshold" />
            </span>
            <span className="font-mono font-semibold">{passed ? "97%" : "84%"} / 90%</span>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            <Message
              messageKey={
                passed
                  ? "localisationoperationsWorkflowSyncReadyNote"
                  : "localisationoperationsWorkflowSyncBlockedNote"
              }
            />
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPassed((value) => !value)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-[11px] font-medium hover:bg-muted/40"
        >
          <ArrowClockwiseIcon className="size-4" aria-hidden />
          <Message
            messageKey={
              passed
                ? "localisationoperationsWorkflowResetGate"
                : "localisationoperationsWorkflowPreviewPass"
            }
          />
        </button>
      </Panel>
    </MeshStage>
  );
}

function ReportPreview() {
  const [mode, setMode] = useState<"coverage" | "backlog">("coverage");
  return (
    <MeshStage index={5}>
      <Panel>
        <PanelHeading
          icon={<ChartBarIcon className="size-4" aria-hidden />}
          titleKey="localisationoperationsWorkflowReportTitle"
          right={<Status messageKey="localisationoperationsWorkflowLiveView" />}
        />
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
          {(["coverage", "backlog"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={cn(
                "rounded-md px-2 py-1.5 text-[11px] font-medium",
                mode === item ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              <Message
                messageKey={
                  item === "coverage"
                    ? "localisationoperationsWorkflowCoverage"
                    : "localisationoperationsWorkflowBacklog"
                }
              />
            </button>
          ))}
        </div>
        {mode === "coverage" ? (
          <div className="mt-3 space-y-3 rounded-xl border border-border/60 p-3">
            {(
              [
                ["FR", "w-[92%]", "92%"],
                ["DE", "w-[76%]", "76%"],
                ["JA", "w-[64%]", "64%"],
              ] as const
            ).map(([locale, width, percent]) => (
              <div key={locale}>
                <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
                  <span>{locale}</span>
                  <span>{percent}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full bg-primary", width)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-2 rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <Message messageKey="localisationoperationsWorkflowPendingReviews" />
              <strong>7</strong>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Message messageKey="localisationoperationsWorkflowBlockedReleases" />
              <strong className="text-amber-700 dark:text-amber-300">2</strong>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Message messageKey="localisationoperationsWorkflowActiveStreams" />
              <strong>4</strong>
            </div>
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">
          <Message messageKey="localisationoperationsWorkflowDemoData" />
        </p>
      </Panel>
    </MeshStage>
  );
}

const previews = [
  <IntakePreview key="intake" />,
  <ContextPreview key="context" />,
  <RoutingPreview key="routing" />,
  <ReviewPreview key="review" />,
  <SyncPreview key="sync" />,
  <ReportPreview key="report" />,
];

export function LocalisationOperationsWorkflowSection({ content }: Props) {
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
