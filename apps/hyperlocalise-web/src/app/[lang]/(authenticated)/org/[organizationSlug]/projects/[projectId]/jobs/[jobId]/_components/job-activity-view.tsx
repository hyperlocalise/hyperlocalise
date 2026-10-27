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
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  ProhibitIcon,
  RobotIcon,
  UserCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TypographyH4 } from "@/components/ui/typography";
import type { JobEventRecord } from "@/lib/job-events/job-events-contract";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { cn } from "@/lib/primitives/cn";

import type {
  JobActivityAction,
  JobActivityItem,
  JobActivityLocale,
  JobActivityRun,
  JobActivityRunStage,
} from "./build-job-activity";
import { jobActivityViewMessages as messages } from "./job-activity-view.messages";

export type JobActivityViewProps = {
  /** `null` while the first load is in flight. */
  items: JobActivityItem[] | null;
  createdAt: string;
  createdByName: string | null;
  resolveActorName: (userId: string | null) => string | null;
  buildJobHref: (jobId: string) => string | null;
  loadFailed: boolean;
  now: number;
};

function relativeTime(
  date: string,
  now: number,
): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  if (Math.abs(seconds) < 60) return { value: seconds, unit: "second" };
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return { value: minutes, unit: "minute" };
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return { value: hours, unit: "hour" };
  return { value: Math.round(hours / 24), unit: "day" };
}

function formatRelative(intl: IntlShape, date: string, now: number) {
  const { value, unit } = relativeTime(date, now);
  return intl.formatRelativeTime(value, unit, { numeric: "auto" });
}

function RelativeTime({ date, now }: { date: string; now: number }) {
  const intl = useIntl();
  return (
    <time
      dateTime={date}
      title={intl.formatDate(date, { dateStyle: "medium", timeStyle: "short" })}
    >
      {formatRelative(intl, date, now)}
    </time>
  );
}

function TimelineRow({
  icon,
  children,
  date,
  now,
}: {
  icon: ReactNode;
  children: ReactNode;
  date: string;
  now: number;
}) {
  return (
    <li className="relative flex items-center gap-3 text-sm text-muted-foreground">
      <span className="flex size-5 shrink-0 items-center justify-center bg-background">{icon}</span>
      <span className="min-w-0">
        {children}
        <span aria-hidden> · </span>
        <RelativeTime date={date} now={now} />
      </span>
    </li>
  );
}

function ActionRow({
  action,
  name,
  now,
}: {
  action: JobActivityAction;
  name: string;
  now: number;
}) {
  const strong = <span className="font-medium text-foreground">{name}</span>;
  let icon: ReactNode;
  let message: ReactNode;
  switch (action.type) {
    case "job_cancelled":
      icon = <ProhibitIcon className="size-4" />;
      message = <FormattedMessage {...messages.jobCancelled} values={{ name: strong }} />;
      break;
    case "job_retried":
      icon = <ArrowClockwiseIcon className="size-4" />;
      message = <FormattedMessage {...messages.jobRetried} values={{ name: strong }} />;
      break;
    case "job_marked_failed":
      icon = <WarningCircleIcon className="size-4" />;
      message = <FormattedMessage {...messages.jobMarkedFailed} values={{ name: strong }} />;
      break;
    default:
      assertNever(action.type);
  }
  return (
    <TimelineRow icon={icon} date={action.createdAt} now={now}>
      {message}
    </TimelineRow>
  );
}

const STAGE_BADGE_VARIANT = {
  preparing: "secondary",
  translating: "secondary",
  succeeded: "success",
  failed: "destructive",
  stopped: "outline",
} as const satisfies Record<JobActivityRunStage, string>;

const STAGE_LABEL = {
  preparing: messages.stagePreparing,
  translating: messages.stageTranslating,
  succeeded: messages.stageSucceeded,
  failed: messages.stageFailed,
  stopped: messages.stageStopped,
} as const satisfies Record<JobActivityRunStage, unknown>;

function isRunActive(stage: JobActivityRunStage) {
  return stage === "preparing" || stage === "translating";
}

function RunSummary({ run }: { run: JobActivityRun }) {
  const total = run.locales.length;
  const done = run.locales.filter((locale) => locale.status === "completed").length;
  switch (run.stage) {
    case "preparing":
      return run.stringCount == null ? (
        <FormattedMessage {...messages.summaryPreparing} />
      ) : (
        <FormattedMessage {...messages.summaryExtracted} values={{ strings: run.stringCount }} />
      );
    case "translating":
      return <FormattedMessage {...messages.summaryTranslating} values={{ done, total }} />;
    case "succeeded":
      return <FormattedMessage {...messages.summarySucceeded} values={{ done, total }} />;
    case "failed":
      return <FormattedMessage {...messages.summaryFailed} />;
    case "stopped":
      return <FormattedMessage {...messages.summaryStopped} />;
    default:
      return assertNever(run.stage);
  }
}

function LocaleStatusIcon({
  locale,
  runActive,
}: {
  locale: JobActivityLocale;
  runActive: boolean;
}) {
  const intl = useIntl();
  switch (locale.status) {
    case "pending":
      return (
        <CircleDashedIcon
          aria-label={intl.formatMessage(messages.localeStatusPending)}
          className="size-4 text-muted-foreground"
        />
      );
    case "translating":
    case "retrying":
      return runActive ? (
        <Spinner
          aria-label={intl.formatMessage(
            locale.status === "retrying"
              ? messages.localeStatusRetrying
              : messages.localeStatusTranslating,
          )}
          className="text-muted-foreground"
        />
      ) : (
        <CircleDashedIcon
          aria-label={intl.formatMessage(messages.localeStatusPending)}
          className="size-4 text-muted-foreground"
        />
      );
    case "completed":
      return (
        <CheckCircleIcon
          weight="fill"
          aria-label={intl.formatMessage(messages.localeStatusCompleted)}
          className="size-4 text-success"
        />
      );
    case "failed":
      return (
        <XCircleIcon
          weight="fill"
          aria-label={intl.formatMessage(messages.localeStatusFailed)}
          className="size-4 text-destructive"
        />
      );
    default:
      return assertNever(locale.status);
  }
}

function LocaleRow({ locale, runActive }: { locale: JobActivityLocale; runActive: boolean }) {
  const hasCounts = locale.totalCount != null && locale.totalCount > 0;
  const percent = hasCounts
    ? Math.min(100, Math.round(((locale.translatedCount ?? 0) / locale.totalCount!) * 100))
    : locale.status === "completed"
      ? 100
      : 0;

  return (
    <li className="grid grid-cols-[1rem_4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <LocaleStatusIcon locale={locale} runActive={runActive} />
      <span className="truncate font-medium">{locale.locale}</span>
      <Progress
        value={percent}
        aria-label={locale.locale}
        className={cn(
          "[&_[data-slot=progress-track]]:h-1.5",
          locale.status === "completed" && "[&_[data-slot=progress-indicator]]:bg-success",
          locale.status === "failed" && "[&_[data-slot=progress-indicator]]:bg-destructive",
        )}
      />
      <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
        {locale.status === "retrying" && runActive ? (
          <FormattedMessage {...messages.localeStatusRetrying} />
        ) : null}
        {hasCounts ? (
          <FormattedMessage
            {...messages.localeProgress}
            values={{
              translated: locale.translatedCount ?? 0,
              total: locale.totalCount,
            }}
          />
        ) : null}
        {locale.reusedCount ? (
          <span className="hidden sm:inline">
            <FormattedMessage {...messages.localeReused} values={{ count: locale.reusedCount }} />
          </span>
        ) : null}
      </span>
    </li>
  );
}

function stepMessage(step: JobEventRecord): ReactNode | null {
  const locale = step.locale ?? "";
  switch (step.type) {
    case "job_started":
      return (
        <FormattedMessage
          {...messages.stepStarted}
          values={{ count: step.payload.targetLocales.length }}
        />
      );
    case "context_ready":
      return (
        <FormattedMessage
          {...messages.stepContextReady}
          values={{ count: step.payload.glossaryTermCount }}
        />
      );
    case "strings_extracted":
      return (
        <FormattedMessage
          {...messages.stepStringsExtracted}
          values={{ count: step.payload.stringCount }}
        />
      );
    case "translations_reused":
      return (
        <FormattedMessage
          {...messages.stepTranslationsReused}
          values={{ count: step.payload.reusedCount, locale }}
        />
      );
    case "locale_retrying":
      return <FormattedMessage {...messages.stepLocaleRetrying} values={{ locale }} />;
    case "locale_completed":
      return <FormattedMessage {...messages.stepLocaleCompleted} values={{ locale }} />;
    case "locale_failed":
      return <FormattedMessage {...messages.stepLocaleFailed} values={{ locale }} />;
    case "job_succeeded":
      return <FormattedMessage {...messages.stepSucceeded} />;
    case "job_failed":
      return <FormattedMessage {...messages.stepFailed} />;
    // Progress ticks are shown by the locale bars, not as steps.
    case "locale_progress":
    case "job_cancelled":
    case "job_retried":
    case "job_marked_failed":
      return null;
    default:
      return assertNever(step);
  }
}

function RunSteps({ run, now }: { run: JobActivityRun; now: number }) {
  const steps = run.steps.flatMap((step) => {
    const message = stepMessage(step);
    return message ? [{ step, message }] : [];
  });
  if (steps.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="group/steps flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <CaretRightIcon className="size-3 transition-transform group-data-[panel-open]/steps:rotate-90" />
        <span className="group-data-[panel-open]/steps:hidden">
          <FormattedMessage {...messages.showSteps} values={{ count: steps.length }} />
        </span>
        <span className="hidden group-data-[panel-open]/steps:inline">
          <FormattedMessage {...messages.hideSteps} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 space-y-1.5 border-s ps-3 text-xs text-muted-foreground">
          {steps.map(({ step, message }) => (
            <li key={step.id} className="flex justify-between gap-3">
              <span className="min-w-0">{message}</span>
              <span className="shrink-0">
                <RelativeTime date={step.createdAt} now={now} />
              </span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RunCard({
  run,
  buildJobHref,
  now,
}: {
  run: JobActivityRun;
  buildJobHref: (jobId: string) => string | null;
  now: number;
}) {
  const intl = useIntl();
  const runActive = isRunActive(run.stage);
  const followUpHref = run.followUpJobId ? buildJobHref(run.followUpJobId) : null;

  return (
    <li className="relative flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center bg-background pt-3">
        <RobotIcon className="size-4 text-muted-foreground" />
      </span>
      <section
        aria-label={intl.formatMessage(messages.agentName)}
        className="min-w-0 flex-1 space-y-3 rounded-lg border bg-card p-3"
      >
        <header className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            <FormattedMessage
              {...messages.runStarted}
              values={{
                agent: (
                  <span className="font-medium text-foreground">
                    {intl.formatMessage(messages.agentName)}
                  </span>
                ),
                time: formatRelative(intl, run.startedAt, now),
              }}
            />
          </p>
          <Badge variant={STAGE_BADGE_VARIANT[run.stage]}>
            {runActive ? <Spinner aria-hidden className="size-3" /> : null}
            <FormattedMessage {...STAGE_LABEL[run.stage]} />
          </Badge>
        </header>

        <p className="text-sm text-muted-foreground">
          <RunSummary run={run} />
        </p>

        {run.locales.length > 0 ? (
          <ul className="space-y-2">
            {run.locales.map((locale) => (
              <LocaleRow key={locale.locale} locale={locale} runActive={runActive} />
            ))}
          </ul>
        ) : null}

        {followUpHref ? (
          <p className="text-sm">
            <Link href={followUpHref} className="underline underline-offset-4">
              <FormattedMessage {...messages.followUpLink} />
            </Link>
          </p>
        ) : null}

        <RunSteps run={run} now={now} />
      </section>
    </li>
  );
}

export function JobActivityView({
  items,
  createdAt,
  createdByName,
  resolveActorName,
  buildJobHref,
  loadFailed,
  now,
}: JobActivityViewProps) {
  const intl = useIntl();
  const fallbackName = intl.formatMessage(messages.someone);

  return (
    <section className="space-y-4">
      <TypographyH4>
        <FormattedMessage {...messages.heading} />
      </TypographyH4>

      <ol className="relative space-y-4 before:absolute before:inset-y-2 before:start-2.5 before:w-px before:bg-border">
        <TimelineRow icon={<UserCircleIcon className="size-4" />} date={createdAt} now={now}>
          {createdByName ? (
            <FormattedMessage
              {...messages.jobCreatedBy}
              values={{
                name: <span className="font-medium text-foreground">{createdByName}</span>,
              }}
            />
          ) : (
            <FormattedMessage {...messages.jobCreated} />
          )}
        </TimelineRow>

        {items === null && !loadFailed ? (
          <li className="ms-8">
            <Skeleton className="h-28 w-full rounded-lg" />
          </li>
        ) : null}

        {items?.map((item) =>
          item.kind === "run" ? (
            <RunCard key={item.id} run={item} buildJobHref={buildJobHref} now={now} />
          ) : (
            <ActionRow
              key={item.id}
              action={item}
              name={resolveActorName(item.actorUserId) ?? fallbackName}
              now={now}
            />
          ),
        )}
      </ol>

      {loadFailed ? (
        <p role="status" className="text-sm text-destructive">
          <FormattedMessage {...messages.loadFailed} />
        </p>
      ) : null}
    </section>
  );
}
