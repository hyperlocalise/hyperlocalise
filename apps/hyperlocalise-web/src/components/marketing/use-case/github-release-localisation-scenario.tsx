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
  GitBranchIcon,
  GitPullRequestIcon,
  LockIcon,
  LockOpenIcon,
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

type Stage = 0 | 1 | 2 | 3;
type ReviewerLocale = "de" | "ja";

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const stages = [
  {
    titleKey: "githubReleaseScenarioPrTitle",
    descriptionKey: "githubReleaseScenarioPrDescription",
    sourceKey: "githubReleaseScenarioPrSource",
    statusKey: "githubReleaseScenarioPrStatus",
    Icon: GitPullRequestIcon,
    image: "/images/mesh/mesh-gradient-1788785908604.jpg",
  },
  {
    titleKey: "githubReleaseScenarioDraftTitle",
    descriptionKey: "githubReleaseScenarioDraftDescription",
    sourceKey: "githubReleaseScenarioDraftSource",
    statusKey: "githubReleaseScenarioDraftStatus",
    Icon: SparkleIcon,
    image: "/images/mesh/mesh-gradient-1784864042890.jpg",
  },
  {
    titleKey: "githubReleaseScenarioGateTitle",
    descriptionKey: "githubReleaseScenarioGateDescription",
    sourceKey: "githubReleaseScenarioGateSource",
    statusKey: "githubReleaseScenarioGateStatus",
    Icon: ShieldCheckIcon,
    image: "/images/mesh/mesh-gradient-1784864073608.jpg",
  },
] as const;

function StatusPill({
  passed,
  passedKey,
  waitingKey,
}: {
  passed: boolean;
  passedKey: UseCaseMessageKey;
  waitingKey: UseCaseMessageKey;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        passed
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-border/70 bg-muted/60 text-muted-foreground"
      }`}
    >
      {passed ? (
        <CheckCircleIcon className="size-3.5" weight="fill" aria-hidden />
      ) : (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      )}
      <Message messageKey={passed ? passedKey : waitingKey} />
    </span>
  );
}

function PullRequestPreview() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GitBranchIcon className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          <Message messageKey="githubReleaseScenarioPrBranch" />
        </span>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">
          #128
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/60 bg-muted/35 p-3">
          <p className="text-2xl font-semibold tracking-tight text-foreground">14</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            <Message messageKey="githubReleaseScenarioRenamed" />
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/35 p-3">
          <p className="text-2xl font-semibold tracking-tight text-foreground">6</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            <Message messageKey="githubReleaseScenarioAdded" />
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-background p-3">
        <div className="flex items-center gap-2">
          <FileTextIcon className="size-4 text-primary" aria-hidden />
          <span className="text-xs font-medium text-foreground">
            <Message messageKey="githubReleaseScenarioCommentTitle" />
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          <Message messageKey="githubReleaseScenarioCommentDescription" />
        </p>
      </div>
    </div>
  );
}

function DraftAndReviewPreview({ approvals }: { approvals: Record<ReviewerLocale, boolean> }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2.5">
        <BookOpenIcon className="size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            <Message messageKey="githubReleaseScenarioGlossaryTitle" />
          </p>
          <p className="text-[11px] text-muted-foreground">
            <Message messageKey="githubReleaseScenarioGlossaryDescription" />
          </p>
        </div>
        <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          <Message messageKey="githubReleaseScenarioReviewTasks" />
        </span>
        <span className="text-[11px] text-muted-foreground">Lokalise</span>
      </div>

      {[
        { code: "DE", locale: "de" as const, key: "githubReleaseScenarioGerman" as const },
        { code: "JA", locale: "ja" as const, key: "githubReleaseScenarioJapanese" as const },
      ].map((reviewer) => (
        <div
          key={reviewer.locale}
          className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-[11px] font-semibold text-foreground">
            {reviewer.code}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            <Message messageKey={reviewer.key} />
          </span>
          {approvals[reviewer.locale] ? (
            <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
          ) : (
            <span
              className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40"
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ReleaseGatePreview({
  approvals,
  canApprove,
  onToggle,
}: {
  approvals: Record<ReviewerLocale, boolean>;
  canApprove: boolean;
  onToggle: (locale: ReviewerLocale) => void;
}) {
  const passed = approvals.de && approvals.ja;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/35 p-3">
        <div className="flex items-center gap-2">
          {passed ? (
            <LockOpenIcon className="size-4 text-primary" aria-hidden />
          ) : (
            <LockIcon className="size-4 text-foreground" aria-hidden />
          )}
          <span className="text-xs font-medium text-foreground">
            <Message messageKey="githubReleaseScenarioMergeGate" />
          </span>
        </div>
        <StatusPill
          passed={passed}
          passedKey="githubReleaseScenarioGatePassed"
          waitingKey="githubReleaseScenarioGateBlocked"
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg px-1">
        <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
        <span className="text-xs text-muted-foreground">
          <Message messageKey="githubReleaseScenarioCiCheck" />
        </span>
      </div>

      <p className="text-[11px] font-medium text-muted-foreground">
        <Message messageKey="githubReleaseScenarioApprovalsHint" />
      </p>

      {[
        { code: "DE", locale: "de" as const, key: "githubReleaseScenarioGerman" as const },
        { code: "JA", locale: "ja" as const, key: "githubReleaseScenarioJapanese" as const },
      ].map((reviewer) => (
        <button
          key={reviewer.locale}
          type="button"
          aria-pressed={approvals[reviewer.locale]}
          disabled={!canApprove}
          onClick={() => onToggle(reviewer.locale)}
          className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-left transition-colors enabled:cursor-pointer enabled:hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-65"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-[11px] font-semibold text-foreground">
            {reviewer.code}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            <Message messageKey={reviewer.key} />
          </span>
          {approvals[reviewer.locale] ? (
            <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
          ) : (
            <span
              className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40"
              aria-hidden
            />
          )}
        </button>
      ))}
    </div>
  );
}

export function GithubReleaseLocalisationScenario({ content }: Props) {
  const [stage, setStage] = useState<Stage>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [approvals, setApprovals] = useState<Record<ReviewerLocale, boolean>>({
    de: false,
    ja: false,
  });

  const gatePassed = approvals.de && approvals.ja;

  useEffect(() => {
    if (!isRunning) return;

    const timers = [
      window.setTimeout(() => setStage(1), 250),
      window.setTimeout(() => setStage(2), 1650),
      window.setTimeout(() => setStage(3), 3050),
      window.setTimeout(() => {
        setIsRunning(false);
        setIsComplete(true);
      }, 4450),
    ];

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [isRunning]);

  function runSimulation() {
    if (isRunning) return;
    setApprovals({ de: false, ja: false });
    setStage(0);
    setIsComplete(false);
    setIsRunning(true);
  }

  function toggleApproval(locale: ReviewerLocale) {
    if (!isComplete) return;
    setApprovals((previous) => ({ ...previous, [locale]: !previous[locale] }));
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
            const isActive = isRunning && stage === index + 1;
            const isDone = stage > index + 1 || (isComplete && (index < 2 || gatePassed));

            return (
              <article
                key={item.titleKey}
                className="relative flex min-h-[470px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-5 sm:min-h-[500px]"
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-55"
                  style={{ backgroundImage: `url("${item.image}")` }}
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-background/45 to-background/85"
                  aria-hidden="true"
                />

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium tracking-[0.12em] text-foreground/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`flex size-9 items-center justify-center rounded-xl border border-border/50 bg-background/80 transition-transform duration-300 ${isActive ? "scale-110" : ""}`}
                  >
                    {isDone ? (
                      <CheckCircleIcon className="size-5 text-primary" weight="fill" aria-hidden />
                    ) : (
                      <Icon className="size-5 text-foreground" aria-hidden />
                    )}
                  </span>
                </div>

                <div className="relative z-10 my-auto py-8">
                  <div
                    className={`rounded-2xl border border-border/50 bg-background/95 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.10)] backdrop-blur-xl transition-all duration-500 ${
                      isActive ? "translate-y-0 opacity-100" : "translate-y-1 opacity-95"
                    }`}
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
                      {isDone ? (
                        <CheckCircleIcon
                          className="size-5 shrink-0 text-primary"
                          weight="fill"
                          aria-hidden
                        />
                      ) : isActive ? (
                        <span
                          className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>

                    <div className="mt-4 border-t border-border/60 pt-4">
                      {index === 0 ? (
                        <PullRequestPreview />
                      ) : index === 1 ? (
                        <DraftAndReviewPreview approvals={approvals} />
                      ) : (
                        <ReleaseGatePreview
                          approvals={approvals}
                          canApprove={isComplete}
                          onToggle={toggleApproval}
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
            {isComplete && gatePassed ? (
              <>
                <CheckCircleIcon className="size-4 text-primary" weight="fill" aria-hidden />
                <Message messageKey="githubReleaseScenarioComplete" />
              </>
            ) : isComplete ? (
              <>
                <LockIcon className="size-4 text-foreground" aria-hidden />
                <Message messageKey="githubReleaseScenarioBlocked" />
              </>
            ) : isRunning ? (
              <>
                <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                <Message messageKey="githubReleaseScenarioRunning" />
              </>
            ) : (
              <Message messageKey="githubReleaseScenarioReady" />
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
            <Message
              messageKey={
                isRunning
                  ? "githubReleaseScenarioRunningButton"
                  : isComplete
                    ? "githubReleaseScenarioRerunButton"
                    : "githubReleaseScenarioRunButton"
              }
            />
          </button>
        </div>
      </div>
    </section>
  );
}
