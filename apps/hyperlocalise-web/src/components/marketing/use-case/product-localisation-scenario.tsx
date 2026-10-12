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

import * as React from "react";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  GitPullRequestIcon,
  NotePencilIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = {
  content: UseCasePageContent;
};

type StepStatus = "idle" | "running" | "done";

type FlowStep = {
  id: string;
  icon: React.ElementType;
  titleKey: UseCaseMessageKey;
  subtitleKey: UseCaseMessageKey;
  typeKey: UseCaseMessageKey;
  detailKey: UseCaseMessageKey;
};

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const FLOW_STEPS: FlowStep[] = [
  {
    id: "trigger",
    icon: GitPullRequestIcon,
    titleKey: "productLocalisationScenarioFlowStepTriggerTitle",
    subtitleKey: "productLocalisationScenarioFlowStepTriggerSubtitle",
    typeKey: "productLocalisationScenarioFlowStepTypeTrigger",
    detailKey: "productLocalisationScenarioFlowStepTriggerDetail",
  },
  {
    id: "context",
    icon: NotePencilIcon,
    titleKey: "productLocalisationScenarioFlowStepContextTitle",
    subtitleKey: "productLocalisationScenarioFlowStepContextSubtitle",
    typeKey: "productLocalisationScenarioFlowStepTypeAction",
    detailKey: "productLocalisationScenarioFlowStepContextDetail",
  },
  {
    id: "draft",
    icon: TranslateIcon,
    titleKey: "productLocalisationScenarioFlowStepDraftTitle",
    subtitleKey: "productLocalisationScenarioFlowStepDraftSubtitle",
    typeKey: "productLocalisationScenarioFlowStepTypeAction",
    detailKey: "productLocalisationScenarioFlowStepDraftDetail",
  },
  {
    id: "review",
    icon: SparkleIcon,
    titleKey: "productLocalisationScenarioFlowStepReviewTitle",
    subtitleKey: "productLocalisationScenarioFlowStepReviewSubtitle",
    typeKey: "productLocalisationScenarioFlowStepTypeReview",
    detailKey: "productLocalisationScenarioFlowStepReviewDetail",
  },
  {
    id: "release",
    icon: ShieldCheckIcon,
    titleKey: "productLocalisationScenarioFlowStepReleaseTitle",
    subtitleKey: "productLocalisationScenarioFlowStepReleaseSubtitle",
    typeKey: "productLocalisationScenarioFlowStepTypeAction",
    detailKey: "productLocalisationScenarioFlowStepReleaseDetail",
  },
];

/*
 * Balanced desktop layout:
 *
 *  01 ─────────→ 02 ─────────→ 03
 *                                │
 *                                ↓
 *                 05 ←───────── 04
 *
 * Cards use the same column centres as the SVG connectors.
 */
const nodePlacement = [
  "left-[16.666%] top-[25%]",
  "left-[50%] top-[25%]",
  "left-[83.333%] top-[25%]",
  "left-[83.333%] top-[75%]",
  "left-[50%] top-[75%]",
] as const;

function StepStatusPill({ status }: { status: StepStatus }) {
  if (status === "running") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[0.65rem] font-medium text-primary">
        <CircleNotchIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />

        <Message messageKey="productLocalisationScenarioFlowStatusRunning" />
      </span>
    );
  }

  if (status === "done") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[0.65rem] font-medium text-primary">
        <CheckCircleIcon className="size-3" weight="fill" aria-hidden />

        <Message messageKey="productLocalisationScenarioFlowStatusDone" />
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[0.65rem] font-medium text-muted-foreground">
      <Message messageKey="productLocalisationScenarioFlowStatusPending" />
    </span>
  );
}

function ProcessNode({
  step,
  index,
  status,
  selected,
  onSelect,
}: {
  step: FlowStep;
  index: number;
  status: StepStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = step.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      aria-pressed={selected}
      className={[
        "group absolute z-10 w-[19%] min-w-0 -translate-x-1/2 -translate-y-1/2",
        "cursor-pointer text-left",
        "focus-visible:rounded-xl focus-visible:outline-2",
        "focus-visible:outline-offset-4 focus-visible:outline-ring",
        nodePlacement[index],
      ].join(" ")}
    >
      <div
        className={[
          "min-h-[7.5rem] rounded-xl border bg-card p-3 shadow-sm",
          "transition-[border-color,box-shadow,background-color] duration-200",
          selected ? "border-primary shadow-md" : "border-border group-hover:border-primary/40",
          status === "running" ? "ring-2 ring-primary/20" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span
            className={[
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            <Icon className="size-4" aria-hidden />
          </span>

          <StepStatusPill status={status} />
        </div>

        <div className="mt-3 space-y-1">
          <p className="text-[0.78rem] font-semibold leading-[1.25] text-foreground">
            <Message messageKey={step.titleKey} />
          </p>

          <p className="text-[0.62rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <Message messageKey={step.typeKey} />
          </p>

          <p className="line-clamp-2 text-[0.68rem] leading-[1.4] text-muted-foreground">
            <Message messageKey={step.subtitleKey} />
          </p>
        </div>
      </div>
    </button>
  );
}

const connectorPaths = [
  "M 166.66 115 H 500",
  "M 500 115 H 833.33",
  "M 833.33 115 H 887 Q 912 115 912 140 V 320 Q 912 345 887 345 H 833.33",
  "M 833.33 345 H 500",
] as const;

function FlowConnectors({
  completedCount,
  runningIndex,
}: {
  completedCount: number;
  runningIndex: number | null;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 460"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <g
        fill="none"
        strokeWidth="2"
        strokeDasharray="6 8"
        strokeLinecap="round"
        className="stroke-border"
      >
        {connectorPaths.map((path, index) => (
          <path key={index} d={path} />
        ))}
      </g>

      <g
        fill="none"
        strokeWidth="2.5"
        strokeDasharray="6 8"
        strokeLinecap="round"
        className="stroke-primary"
      >
        {connectorPaths.map((path, index) => {
          const active =
            completedCount > index + 1 || (runningIndex !== null && runningIndex > index);

          return active ? <path key={index} d={path} /> : null;
        })}
      </g>
    </svg>
  );
}

function MobileProcessNode({
  step,
  status,
  selected,
  onSelect,
}: {
  step: FlowStep;
  status: StepStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = step.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "relative z-10 flex w-full cursor-pointer items-center gap-3",
        "rounded-xl border bg-card p-3 text-left shadow-sm",
        "transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected ? "border-primary" : "border-border hover:border-primary/40",
      ].join(" ")}
    >
      <span
        className={[
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold leading-snug text-foreground">
          <Message messageKey={step.titleKey} />
        </span>

        <span className="mt-1 block text-[0.68rem] leading-relaxed text-muted-foreground">
          <Message messageKey={step.subtitleKey} />
        </span>
      </span>

      <StepStatusPill status={status} />
    </button>
  );
}

function ProcessCanvas({
  selectedIndex,
  runningIndex,
  completedCount,
  onSelect,
}: {
  selectedIndex: number;
  runningIndex: number | null;
  completedCount: number;
  onSelect: (index: number) => void;
}) {
  const getStatus = (index: number): StepStatus => {
    if (runningIndex === index) return "running";
    if (index < completedCount) return "done";
    return "idle";
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3 sm:p-4">
      {/* Desktop flow canvas */}
      <div className="relative hidden h-[28rem] overflow-hidden rounded-2xl bg-background lg:block">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 text-border"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 0.8px, transparent 0.8px)",
            backgroundSize: "20px 20px",
            opacity: 0.38,
          }}
        />

        <FlowConnectors completedCount={completedCount} runningIndex={runningIndex} />

        {FLOW_STEPS.map((step, index) => (
          <ProcessNode
            key={step.id}
            index={index}
            step={step}
            status={getStatus(index)}
            selected={selectedIndex === index}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>

      {/* Mobile and tablet layout */}
      <div className="relative space-y-3 lg:hidden">
        <div aria-hidden="true" className="absolute bottom-6 left-7 top-6 w-px bg-border" />

        {FLOW_STEPS.map((step, index) => (
          <MobileProcessNode
            key={step.id}
            step={step}
            status={getStatus(index)}
            selected={selectedIndex === index}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </div>
  );
}

export function ProductLocalisationScenario({ content }: Props) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [runningIndex, setRunningIndex] = React.useState<number | null>(null);
  const [completedCount, setCompletedCount] = React.useState(0);

  const isRunning = runningIndex !== null;

  const selectedStep = FLOW_STEPS[selectedIndex];

  const runSimulation = React.useCallback(() => {
    setSelectedIndex(0);
    setCompletedCount(0);
    setRunningIndex(0);
  }, []);

  React.useEffect(() => {
    if (runningIndex === null) return;

    const timer = window.setTimeout(() => {
      const completed = runningIndex + 1;

      setCompletedCount(completed);
      setSelectedIndex(runningIndex);

      if (runningIndex === FLOW_STEPS.length - 1) {
        setRunningIndex(null);
        return;
      }

      setRunningIndex(runningIndex + 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [runningIndex]);

  if (!selectedStep) return null;

  return (
    <section>
      {/* Existing example workflow heading */}
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.35fr] lg:gap-14">
        <div>
          <TypographyP className="text-[0.95rem]" tone="subtle">
            <Message messageKey={content.scenario.labelKey} />
          </TypographyP>

          <TypographyH2
            className="mt-6 max-w-xl text-3xl leading-[1.08] tracking-[-0.04em] sm:text-4xl"
            wrapStyle="balance"
          >
            <Message messageKey={content.scenario.titleKey} />
          </TypographyH2>
        </div>
      </div>

      {/* Workflow simulation */}
      <div className="mt-12 overflow-hidden rounded-[2rem] border border-border bg-background shadow-sm">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              <Message messageKey="productLocalisationScenarioFlowHeaderTitle" />
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              <Message messageKey="productLocalisationScenarioFlowHeaderSubtitle" />
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                isRunning
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground",
              ].join(" ")}
            >
              <span
                className={[
                  "size-2 rounded-full",
                  isRunning ? "bg-primary" : "bg-muted-foreground/40",
                ].join(" ")}
              />

              <Message
                messageKey={
                  isRunning
                    ? "productLocalisationScenarioFlowStatusRunning"
                    : "productLocalisationScenarioFlowStatusReady"
                }
              />
            </span>

            <button
              type="button"
              onClick={runSimulation}
              disabled={isRunning}
              className={[
                "inline-flex cursor-pointer items-center gap-2 rounded-xl",
                "bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                "transition-opacity hover:opacity-90",
                "disabled:cursor-not-allowed disabled:opacity-60",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              ].join(" ")}
            >
              <PlayIcon className="size-4" aria-hidden />
              <Message messageKey="productLocalisationScenarioFlowRun" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="p-3 sm:p-4">
          <ProcessCanvas
            selectedIndex={selectedIndex}
            runningIndex={runningIndex}
            completedCount={completedCount}
            onSelect={setSelectedIndex}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 text-center sm:px-6">
          <p className="text-sm text-muted-foreground">
            <Message messageKey="productLocalisationScenarioFlowFooterHint" />
          </p>
        </div>
      </div>
    </section>
  );
}
