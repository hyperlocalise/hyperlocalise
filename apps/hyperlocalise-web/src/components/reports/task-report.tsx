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
"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { buildOrganizationPath, buildProjectPath } from "@/components/app-shell/navigation-config";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  OPEN_TASK_STATUSES,
  REPORT_STEPS,
  type ReportStep,
  type ReportUnit,
} from "@/lib/reporting/report-units";

import { rateText } from "./cost-estimate-tab";
import { EditTimeDialog } from "./edit-time-dialog";
import { LogTimeDialog } from "./log-time-dialog";
import { MatchBandTable, visibleBands, type BandCounts } from "./match-band-table";
import {
  formatCount,
  formatDuration,
  formatShare,
  formatUsd,
  stepLabel,
  unitLabel,
} from "./report-format";
import {
  DownloadCsvButton,
  ReportEmpty,
  ReportSection,
  ReportSectionState,
} from "./report-section";
import { ReportStatCard, ReportStatCards } from "./report-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import {
  reportsQueryKey,
  taskReportDownloadUrl,
  useReportSettings,
  useTaskAnalysis,
  useTaskReport,
  type ReportSettings,
  type TaskAnalysisState,
  type TaskReport as TaskReportData,
} from "./reports-queries";
import { buildReportsHref, DEFAULT_REPORTS_STATE } from "./reports-url-state";
import { SegmentedSwitch } from "./segmented-switch";
import { TaskPricingDialog } from "./task-pricing-dialog";
import { taskReportMessages as messages } from "./task-report.messages";
import { UnitSwitch } from "./word-counts-tab";
import { wordCountsTabMessages as wordMessages } from "./word-counts-tab.messages";

type Intl = ReturnType<typeof useIntl>;
/** The task's words and match bands, shown to the roles that see Reports. */
type TaskWords = NonNullable<TaskReportData["words"]>;
type WordRow = TaskWords["rows"][number];
type StepPricing = NonNullable<TaskReportData["pricing"]>[number];
type TimeEntry = TaskReportData["time"]["entries"][number];

/** A day, written as a UTC date: Reports keeps days in UTC. */
function utcDay(intl: Intl, value: string) {
  return intl.formatDate(value, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Where "Open in Reports" goes: the task's estimate for the roles that see money, otherwise its
 * word counts, on its project's Reports page (the workspace's for a task outside any project).
 */
function reportsHref(
  organizationSlug: string,
  task: TaskReportData["task"],
  settings: ReportSettings,
) {
  const path = task.projectId
    ? buildProjectPath(organizationSlug, task.projectId, "reports")
    : buildOrganizationPath(organizationSlug, "reports");
  if (settings.financial)
    return buildReportsHref(path, { ...DEFAULT_REPORTS_STATE, tab: "estimate", jobIds: [task.id] });
  // Other roles see only their own time there; it is dated, so it covers the task's whole life,
  // from when Reports could see it.
  const created = task.createdAt.slice(0, 10);
  const from = settings.startedDay && settings.startedDay > created ? settings.startedDay : created;
  return buildReportsHref(path, {
    ...DEFAULT_REPORTS_STATE,
    tab: "time",
    jobId: task.id,
    range: "custom",
    from,
    to: settings.today,
  });
}

/** A task's own report, on its Report tab: its whole life, whatever the dates. */
export function TaskReport({
  organizationSlug,
  jobId,
  defaultStep = "translation",
}: {
  organizationSlug: string;
  jobId: string;
  /** The step the task is for: review on a proofread task, so the tab opens on its own work. */
  defaultStep?: ReportStep;
}) {
  const intl = useIntl();
  const settings = useReportSettings(organizationSlug);
  const [unit, setUnit] = useState<ReportUnit>("words");
  const [step, setStep] = useState<ReportStep>(defaultStep);
  // Only the task's own card or its project budget's prices the task: a language neither has a
  // line for shows "No rate", never a guess from another card.
  const rateCard = null;
  // Whether the task's strings for the step are still being counted, or could not be. Looked at
  // again every few seconds while pending; when the count ends, the report is read again. Only
  // the roles that see the task's words see this.
  const analysis = useTaskAnalysis(organizationSlug, jobId, Boolean(settings.data?.financial));
  const state = analysis.data?.find((row) => row.step === step);
  const report = useTaskReport(
    organizationSlug,
    jobId,
    { unit, step, rateCard },
    Boolean(settings.data),
    // Counted, but not yet in the summary (a scheduled run held the project): read again in a
    // while, since the state will not change again to say when the strings have arrived.
    (last) =>
      state?.status === "done" &&
      last.words !== null &&
      analysisOutcome(last.words, step, state) === "counting",
  );
  const queryClient = useQueryClient();
  const status = state?.status;
  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current === "pending" && status !== undefined && status !== "pending")
      void queryClient.invalidateQueries({
        queryKey: reportsQueryKey(organizationSlug, "task-report", jobId),
      });
    previousStatus.current = status;
  }, [status, queryClient, organizationSlug, jobId]);
  // Until settings load the report waits, which TanStack Query counts as pending too.
  const loading = !settings.isError && (settings.isPending || report.isPending);
  const query = {
    data:
      settings.data && report.data ? { settings: settings.data, report: report.data } : undefined,
    isPending: loading,
    isError: settings.isError || report.isError,
    refetch: () => (settings.isError ? settings.refetch() : report.refetch()),
  };
  return (
    <ReportSectionState query={query} skeletonHeight={420}>
      {({ settings: loaded, report: data }) => (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{intl.formatMessage(messages.intro)}</p>
            {/* A link, not a button: it goes to another page. */}
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={reportsHref(organizationSlug, data.task, loaded)}
            >
              {intl.formatMessage(messages.openInReports)}
              <ArrowSquareOutIcon aria-hidden />
            </Link>
          </div>
          {/* Words, match bands and money are for the roles that see Reports; others see their time. */}
          {data.words ? (
            <>
              {/* Nothing to add up while the step's strings are being counted. */}
              {analysisOutcome(data.words, step, state) === "counting" ? null : (
                <TaskCards data={data} words={data.words} step={step} />
              )}
              <ReportSection
                title={intl.formatMessage(messages.matchAnalysis)}
                description={intl.formatMessage(messages.matchAnalysisDetail)}
                actions={
                  <>
                    <SegmentedSwitch
                      label={intl.formatMessage(messages.stepSwitch)}
                      value={step}
                      options={REPORT_STEPS.map((value) => ({
                        value,
                        label: stepLabel(intl, value),
                      }))}
                      onChange={setStep}
                    />
                    <UnitSwitch value={unit} onChange={setUnit} />
                    <DownloadCsvButton
                      href={taskReportDownloadUrl(organizationSlug, jobId, {
                        unit,
                        step,
                        rateCard,
                      })}
                    />
                  </>
                }
              >
                <MatchAnalysis data={data} words={data.words} step={step} state={state} />
              </ReportSection>
            </>
          ) : null}
          <TimeSection organizationSlug={organizationSlug} settings={loaded} data={data} />
          {data.pricing ? (
            <PricingSection
              organizationSlug={organizationSlug}
              jobId={jobId}
              pricing={data.pricing}
              canEdit={data.canSetPricing}
              ended={!OPEN_TASK_STATUSES.has(data.task.status)}
              rateCardNames={loaded.rateCardNames}
            />
          ) : null}
        </div>
      )}
    </ReportSectionState>
  );
}

function TaskCards({
  data,
  words,
  step,
}: {
  data: TaskReportData;
  words: TaskWords;
  step: ReportStep;
}) {
  const intl = useIntl();
  const totals = words.totals[step];
  const languages = new Set(
    words.rows.filter((row) => row.step === step).map((row) => row.targetLocale),
  ).size;
  // The task's approved share is a snapshot of its own strings sent for review.
  const review = words.totals.review;
  const estimate = data.estimate;
  // Nothing could be priced: every unit has no rate, or the only priced lines are hourly with no
  // time estimate, so the cost is not $0 but unknown.
  const nothingPriced =
    estimate !== null &&
    estimate.totals.units > 0 &&
    Number(estimate.totals.costUsd) === 0 &&
    (estimate.totals.unpricedUnits === estimate.totals.units ||
      estimate.rows.every((row) => row.pricing === "none" || row.unestimated));
  // The task's cost by step, when it has work at both: "$12.86 translation · No rate review".
  const stepCosts = estimate
    ? REPORT_STEPS.flatMap((costStep) => {
        const lines = estimate.rows.filter((row) => row.step === costStep);
        const fees = estimate.fixedFees.filter((fee) => fee.step === costStep);
        if (lines.length === 0 && fees.length === 0) return [];
        const priced = lines.some((row) => row.pricing !== "none") || fees.length > 0;
        const cost =
          lines.reduce((sum, row) => sum + Number(row.costUsd ?? 0), 0) +
          fees.reduce((sum, fee) => sum + Number(fee.amountUsd), 0);
        return [
          intl.formatMessage(messages.stepCost, {
            step: stepLabel(intl, costStep),
            amount: priced ? formatUsd(intl, cost.toFixed(8)) : intl.formatMessage(messages.noRate),
          }),
        ];
      })
    : [];
  return (
    <ReportStatCards>
      <ReportStatCard
        label={intl.formatMessage(
          step === "review" ? messages.unitsToReview : messages.unitsToTranslate,
          { unit: unitLabel(intl, data.unit) },
        )}
        value={formatCount(intl, totals.arrived)}
        detail={intl.formatMessage(messages.unitsDetail, {
          source: formatCount(intl, totals.source),
          languages: intl.formatMessage(messages.languagesCount, { count: languages }),
        })}
      />
      <ReportStatCard
        label={intl.formatMessage(messages.finished)}
        value={formatCount(intl, totals.arrivedDone)}
        detail={intl.formatMessage(messages.finishedDetail, { step: stepLabel(intl, step) })}
      />
      <ReportStatCard
        label={intl.formatMessage(messages.progress)}
        value={formatShare(intl, totals.arrived > 0 ? totals.arrivedDone / totals.arrived : null)}
        detail={intl.formatMessage(messages.progressDetail)}
      />
      <ReportStatCard
        label={intl.formatMessage(messages.approved)}
        value={formatShare(intl, review.arrived > 0 ? review.arrivedDone / review.arrived : null)}
        detail={intl.formatMessage(messages.approvedDetail)}
      />
      {estimate ? (
        <ReportStatCard
          label={intl.formatMessage(messages.estimatedCost)}
          value={
            nothingPriced
              ? intl.formatMessage(messages.notPriced)
              : formatUsd(intl, estimate.totals.costUsd)
          }
          detail={[
            ...(stepCosts.length > 1 ? [intl.formatList(stepCosts, { type: "unit" })] : []),
            estimate.totals.incomplete || data.stillToCome?.incomplete
              ? intl.formatMessage(messages.incomplete)
              : data.stillToCome && !nothingPriced
                ? intl.formatMessage(messages.stillToCome, {
                    amount: formatUsd(intl, data.stillToCome.amountUsd),
                  })
                : null,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        />
      ) : null}
    </ReportStatCards>
  );
}

type AnalysisRow = WordRow & {
  weighted: number | null;
  costUsd: string | null;
  fixed: boolean;
  /** The rate that priced the row, as the estimate shows it: "$0.04 / word", "No rate", "Fixed fee". */
  rate: string | null;
  /** An hourly line with no time estimate on the task, so the row's cost is missing. */
  unestimated: boolean;
};

/**
 * What a step with no rows in the report means: its strings are being counted (the analysis is
 * pending, or done and recorded but not yet in the summary), the count failed, or there is
 * nothing. "shown" when the step has rows.
 */
function analysisOutcome(
  words: { rows: { step: string }[] },
  step: ReportStep,
  state: TaskAnalysisState | undefined,
): "shown" | "counting" | "failed" | "nothing" {
  if (words.rows.some((row) => row.step === step)) return "shown";
  if (!state) return "nothing";
  if (state.status === "pending") return "counting";
  if (state.status === "failed") return "failed";
  return (state.strings ?? 0) > 0 ? "counting" : "nothing";
}

/** The step's rows by language, with the estimate's rate, weighted units and cost beside them. */
function analysisRows(
  intl: Intl,
  data: TaskReportData,
  words: TaskWords,
  step: ReportStep,
): AnalysisRow[] {
  return words.rows
    .filter((row) => row.step === step)
    .map((row) => {
      const priced = data.estimate?.rows.filter(
        (line) => line.targetLocale === row.targetLocale && line.step === step,
      );
      const weighted = priced?.reduce<number | null>(
        (sum, line) => (line.weighted === null ? sum : (sum ?? 0) + line.weighted),
        null,
      );
      const cost = priced?.reduce<number | null>(
        (sum, line) => (line.costUsd === null ? sum : (sum ?? 0) + Number(line.costUsd)),
        null,
      );
      return {
        ...row,
        weighted: weighted ?? null,
        costUsd: cost === null || cost === undefined ? null : cost.toFixed(8),
        // Its step has a fixed fee for the whole task, listed below the table.
        fixed: Boolean(priced?.some((line) => line.pricing === "fixed")),
        rate: priced?.[0] ? rateText(intl, priced[0]) : null,
        unestimated: Boolean(priced?.some((line) => line.unestimated)),
      };
    });
}

function MatchAnalysis({
  data,
  words,
  step,
  state,
}: {
  data: TaskReportData;
  words: TaskWords;
  step: ReportStep;
  state: TaskAnalysisState | undefined;
}) {
  const intl = useIntl();
  const rows = analysisRows(intl, data, words, step);
  if (rows.length === 0) {
    const outcome = analysisOutcome(words, step, state);
    return (
      <ReportEmpty
        description={intl.formatMessage(
          outcome === "counting"
            ? messages.counting
            : outcome === "failed"
              ? messages.countingFailed
              : messages.noWords,
        )}
      />
    );
  }
  const bandTotals: BandCounts = {};
  for (const row of rows)
    for (const [bucket, units] of Object.entries(row.bands))
      bandTotals[bucket as keyof BandCounts] =
        (bandTotals[bucket as keyof BandCounts] ?? 0) + units;
  const money = data.estimate !== null;
  const sum = (pick: (row: AnalysisRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const uncounted = words.totals[step].uncounted;
  const fees = data.estimate?.fixedFees.filter((fee) => fee.step === step) ?? [];
  // The step's own totals: the estimate's cover the whole task.
  const weightedTotal = rows.some((row) => row.weighted !== null)
    ? sum((row) => row.weighted ?? 0)
    : null;
  const costTotal =
    rows.some((row) => row.costUsd !== null) || fees.length > 0
      ? sum((row) => Number(row.costUsd ?? 0)) +
        fees.reduce((total, fee) => total + Number(fee.amountUsd), 0)
      : null;
  const notes = [
    ...fees.map((fee) =>
      intl.formatMessage(messages.fixedFeeNote, { amount: formatUsd(intl, fee.amountUsd) }),
    ),
    ...(rows.some((row) => row.unestimated) ? [intl.formatMessage(messages.noEstimateNote)] : []),
    ...(data.unit === "characters" || data.unit === "characters_with_spaces"
      ? [intl.formatMessage(wordMessages.charactersNote)]
      : []),
    ...(uncounted > 0 && data.unit !== "strings"
      ? [intl.formatMessage(pageMessages.notCounted, { count: uncounted })]
      : []),
    ...(state?.incomplete ? [intl.formatMessage(messages.bandsMissing)] : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <MatchBandTable
        label={intl.formatMessage(messages.tableLabel)}
        rows={rows}
        rowKey={(row) => `${row.targetLocale}:${row.step}`}
        bands={visibleBands(bandTotals)}
        leading={[
          {
            key: "language",
            header: intl.formatMessage(messages.languageColumn),
            cell: (row) => row.targetLocale,
          },
        ]}
        trailing={[
          {
            key: "total",
            header: intl.formatMessage(messages.totalColumn),
            cell: (row) => formatCount(intl, row.total),
            numeric: true,
          },
          {
            key: "finished",
            header: intl.formatMessage(messages.finishedColumn),
            cell: (row) => formatCount(intl, row.finished),
            numeric: true,
          },
          ...(money
            ? [
                {
                  key: "rate",
                  header: intl.formatMessage(messages.rateColumn),
                  cell: (row: AnalysisRow) => row.rate ?? intl.formatMessage(messages.noRate),
                  numeric: true,
                  muted: true,
                },
                {
                  key: "weighted",
                  header: intl.formatMessage(messages.weightedColumn),
                  cell: (row: AnalysisRow) =>
                    row.weighted === null ? "—" : formatCount(intl, row.weighted),
                  numeric: true,
                },
                {
                  key: "cost",
                  header: intl.formatMessage(messages.costColumn),
                  cell: (row: AnalysisRow) =>
                    row.fixed && row.costUsd === null
                      ? intl.formatMessage(messages.fixedFeeCell)
                      : formatUsd(intl, row.costUsd),
                  numeric: true,
                },
              ]
            : []),
        ]}
        totals={{
          bands: bandTotals,
          trailing: [
            formatCount(
              intl,
              sum((row) => row.total),
            ),
            formatCount(
              intl,
              sum((row) => row.finished),
            ),
            ...(money
              ? [
                  null,
                  weightedTotal === null ? "—" : formatCount(intl, weightedTotal),
                  costTotal === null
                    ? intl.formatMessage(messages.notPriced)
                    : formatUsd(intl, costTotal.toFixed(8)),
                ]
              : []),
          ],
        }}
      />
      {notes.length ? <p className="text-[13px] text-muted-foreground">{notes.join(" ")}</p> : null}
    </div>
  );
}

function TimeSection({
  organizationSlug,
  settings,
  data,
}: {
  organizationSlug: string;
  settings: ReportSettings;
  data: TaskReportData;
}) {
  const intl = useIntl();
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const { time } = data;
  return (
    <ReportSection
      title={intl.formatMessage(messages.timeLogged)}
      description={intl.formatMessage(messages.timeSummary, {
        duration: formatDuration(intl, time.minutes),
        people: intl.formatMessage(messages.peopleCount, { count: time.people }),
      })}
      actions={
        data.canLogTime ? (
          <Button onClick={() => setLogging(true)}>{intl.formatMessage(messages.logTime)}</Button>
        ) : null
      }
    >
      {time.entries.length === 0 ? (
        <ReportEmpty description={intl.formatMessage(messages.noTime)} />
      ) : (
        <Table aria-label={intl.formatMessage(messages.timeLabel)}>
          <TableHeader>
            <TableRow>
              <TableHead>{intl.formatMessage(messages.dayColumn)}</TableHead>
              <TableHead>{intl.formatMessage(messages.personColumn)}</TableHead>
              <TableHead>{intl.formatMessage(messages.stepColumn)}</TableHead>
              <TableHead>{intl.formatMessage(messages.languageColumn)}</TableHead>
              <TableHead className="text-right">
                {intl.formatMessage(messages.timeColumn)}
              </TableHead>
              <TableHead>{intl.formatMessage(messages.noteColumn)}</TableHead>
              <TableHead>
                <span className="sr-only">{intl.formatMessage(messages.actionsColumn)}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {time.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{utcDay(intl, entry.workDate)}</TableCell>
                <TableCell>{entry.person ?? "—"}</TableCell>
                <TableCell>{stepLabel(intl, entry.step as ReportStep)}</TableCell>
                <TableCell className="text-muted-foreground">{entry.targetLocale}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(intl, entry.minutes)}
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {entry.note}
                </TableCell>
                <TableCell className="text-right">
                  {entry.canEdit ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={intl.formatMessage(messages.editTimeLabel, {
                        day: utcDay(intl, entry.workDate),
                      })}
                      onClick={() => setEditing(entry)}
                    >
                      {intl.formatMessage(messages.edit)}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {/* Roles that cannot see what work costs see only their own entries. */}
      {!settings.financial && time.minutes > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {intl.formatMessage(messages.ownTimeOnly)}
        </p>
      ) : null}
      {logging ? (
        <LogTimeDialog
          organizationSlug={organizationSlug}
          settings={settings}
          projectId={data.task.projectId}
          jobId={data.task.id}
          languages={data.task.targetLocales}
          step={data.task.kind === "proofread" ? "review" : "translation"}
          onClose={() => setLogging(false)}
        />
      ) : null}
      {editing ? (
        <EditTimeDialog
          organizationSlug={organizationSlug}
          entry={editing}
          today={settings.today}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ReportSection>
  );
}

function PricingSection({
  organizationSlug,
  jobId,
  pricing,
  canEdit,
  ended,
  rateCardNames,
}: {
  organizationSlug: string;
  jobId: string;
  pricing: StepPricing[];
  canEdit: boolean;
  /** The task has ended, so nothing about its pricing can change. */
  ended: boolean;
  rateCardNames: string[];
}) {
  const intl = useIntl();
  const [editing, setEditing] = useState<StepPricing | null>(null);
  const none = intl.formatMessage(messages.none);
  return (
    <ReportSection
      title={intl.formatMessage(messages.pricing)}
      description={intl.formatMessage(messages.pricingDetail)}
    >
      <Table aria-label={intl.formatMessage(messages.pricingLabel)}>
        <TableHeader>
          <TableRow>
            <TableHead>{intl.formatMessage(messages.stepColumn)}</TableHead>
            <TableHead>{intl.formatMessage(messages.rateCardColumn)}</TableHead>
            <TableHead className="text-right">
              {intl.formatMessage(messages.estimateColumn)}
            </TableHead>
            <TableHead className="text-right">{intl.formatMessage(messages.feeColumn)}</TableHead>
            <TableHead>
              <span className="sr-only">{intl.formatMessage(messages.actionsColumn)}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricing.map((row) => (
            <TableRow key={row.step}>
              <TableCell>{stepLabel(intl, row.step)}</TableCell>
              <TableCell>
                {row.rateCardName && row.pricedAt
                  ? intl.formatMessage(messages.pricedCard, {
                      card: row.rateCardName,
                      date: utcDay(intl, row.pricedAt),
                    })
                  : none}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.estimatedMinutes === null ? none : formatDuration(intl, row.estimatedMinutes)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.overrideUsd === null ? none : formatUsd(intl, row.overrideUsd)}
              </TableCell>
              <TableCell className="text-right">
                {row.locked ? (
                  <span className="text-[13px] text-muted-foreground">
                    {intl.formatMessage(ended ? messages.ended : messages.locked)}
                  </span>
                ) : canEdit ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={intl.formatMessage(messages.setPricingLabel, {
                      step: stepLabel(intl, row.step),
                    })}
                    onClick={() => setEditing(row)}
                  >
                    {intl.formatMessage(messages.setPricing)}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing ? (
        <TaskPricingDialog
          organizationSlug={organizationSlug}
          jobId={jobId}
          pricing={editing}
          rateCardNames={rateCardNames}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ReportSection>
  );
}
