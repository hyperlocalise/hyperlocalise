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

import { useIntl } from "react-intl";

import {
  REPORT_UNITS,
  WORD_COUNT_INTERVALS,
  WORD_COUNT_SPLITS,
  type BandTier,
  type ReportUnit,
  type TaskStep,
  type WordTaskStep,
} from "@/lib/reporting/report-units";

import { MatchBandTable, visibleBands } from "./match-band-table";
import {
  chartDayLabel,
  ChartLegend,
  seriesConfig,
  seriesValues,
  spansYears,
  StackedBarChart,
} from "./report-chart";
import { bandLabel, formatCount, formatShare, taskStepLabel, unitLabel } from "./report-format";
import {
  DownloadCsvButton,
  ReportPager,
  ReportSection,
  ReportSectionState,
} from "./report-section";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import {
  reportDownloadUrl,
  useWordCounts,
  useWordSeries,
  wordCountsQuery,
  type SectionInput,
} from "./reports-queries";
import type { ReportsUrlState } from "./reports-url-state";
import { SegmentedSwitch } from "./segmented-switch";
import { wordCountsTabMessages as messages } from "./word-counts-tab.messages";

type WordCountsData = NonNullable<ReturnType<typeof useWordCounts>["data"]>;
type WordCountRow = WordCountsData["rows"][number];
type WordSeriesData = NonNullable<ReturnType<typeof useWordSeries>["data"]>;

const TIER_MESSAGES = {
  exact: messages.tierExact,
  high: messages.tierHigh,
  fuzzy: messages.tierFuzzy,
  low: messages.tierLow,
  new: messages.tierNew,
} as const satisfies Record<BandTier, unknown>;

/** Band tiers in one hue, closest match darkest; new work, with no match, in grey. */
const TIER_COLORS: Record<BandTier, string> = {
  exact: "var(--chart-band-1)",
  high: "var(--chart-band-2)",
  fuzzy: "var(--chart-band-3)",
  low: "var(--chart-band-4)",
  new: "var(--muted-foreground)",
};

/** Each task step keeps its colour whichever steps a chart shows. */
const TASK_STEP_COLORS: Record<WordTaskStep, string> = {
  translate: "var(--chart-1)",
  post_edit: "var(--chart-2)",
  proofread: "var(--chart-3)",
  other: "var(--chart-4)",
  no_task: "var(--chart-5)",
};

const SPLIT_MESSAGES = {
  project: messages.splitProject,
  language: messages.splitLanguage,
  band: messages.splitBand,
  task_step: messages.splitTaskStep,
} as const;

const PER_MESSAGES = {
  day: messages.perDay,
  week: messages.perWeek,
  month: messages.perMonth,
} as const;

type Intl = ReturnType<typeof useIntl>;

function wordTaskStepLabel(intl: Intl, step: WordTaskStep) {
  return step === "no_task"
    ? intl.formatMessage(messages.noTask)
    : taskStepLabel(intl, step as TaskStep);
}

/**
 * The chart's series names and colours: projects and languages by rank, "Other" in grey; band
 * tiers and task steps in colours of their own.
 */
function volumeConfig(intl: Intl, data: WordSeriesData) {
  const fixed = (label: string, color: string) => ({ label, color });
  if (data.split === "band")
    return Object.fromEntries(
      data.groups.map((group, index) => {
        const tier = group.key as BandTier;
        return [`s${index}`, fixed(intl.formatMessage(TIER_MESSAGES[tier]), TIER_COLORS[tier])];
      }),
    );
  if (data.split === "task_step")
    return Object.fromEntries(
      data.groups.map((group, index) => {
        const step = group.key as WordTaskStep;
        return [`s${index}`, fixed(wordTaskStepLabel(intl, step), TASK_STEP_COLORS[step])];
      }),
    );
  return seriesConfig(
    data.groups.map((group) => ({
      label: group.other
        ? intl.formatMessage(messages.otherSeries)
        : (group.name ?? group.key ?? ""),
      other: group.other,
    })),
  );
}

/** What the chart counts, whether some series are folded into Other, and how its bars run. */
function chartDetail(intl: Intl, data: WordSeriesData) {
  const ranked = data.split === "project" || data.split === "language";
  return [
    intl.formatMessage(data.mode === "arrived" ? messages.chartArrived : messages.chartFinished, {
      unit: unitLabel(intl, data.unit),
    }),
    ranked ? intl.formatMessage(messages.chartRanked) : null,
    intl.formatMessage(
      { day: messages.chartDays, week: messages.chartWeeks, month: messages.chartMonths }[data.per],
    ),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Units each day, week or month, split as chosen, with its own switches for both. */
function VolumeChart({
  input,
  onChange,
}: {
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const series = useWordSeries(input);
  const data = series.data;
  const config = data ? volumeConfig(intl, data) : {};
  return (
    <ReportSection
      title={intl.formatMessage(messages.chartTitle)}
      description={data ? chartDetail(intl, data) : undefined}
      actions={
        <>
          <ChartLegend config={config} />
          <SegmentedSwitch
            label={intl.formatMessage(messages.splitBy)}
            value={input.state.split}
            options={WORD_COUNT_SPLITS.map((split) => ({
              value: split,
              label: intl.formatMessage(SPLIT_MESSAGES[split]),
            }))}
            onChange={(split) => onChange({ split })}
          />
          <SegmentedSwitch
            label={intl.formatMessage(messages.barLength)}
            value={data?.per ?? input.state.per ?? "day"}
            options={WORD_COUNT_INTERVALS.map((per) => ({
              value: per,
              label: intl.formatMessage(PER_MESSAGES[per]),
            }))}
            onChange={(per) => onChange({ per })}
          />
        </>
      }
    >
      <ReportSectionState
        query={series}
        isEmpty={(shown) => shown.groups.length === 0}
        skeletonHeight={224}
      >
        {(shown) => {
          const withYear = spansYears(shown.period);
          const label = (start: string) =>
            chartDayLabel(intl, start, {
              weekly: shown.per === "week",
              monthly: shown.per === "month",
              withYear,
            });
          const total = shown.points.reduce(
            (sum, point) => sum + point.units.reduce((part, value) => part + value, 0),
            0,
          );
          const unitName = unitLabel(intl, shown.unit);
          return (
            <StackedBarChart
              config={volumeConfig(intl, shown)}
              rows={shown.points.map((point) => ({
                label: label(point.start),
                ...seriesValues(point.units),
              }))}
              summary={intl.formatMessage(messages.chartSummary, {
                unit: unitName,
                from: chartDayLabel(intl, shown.period.from, { withYear }),
                to: chartDayLabel(intl, shown.period.to, { withYear }),
                total: formatCount(intl, total),
              })}
              formatValue={(value) => formatCount(intl, value)}
            />
          );
        }}
      </ReportSectionState>
    </ReportSection>
  );
}

/** Each match band's units and share across the whole table, as bars in one colour. */
function BandSummary({ data }: { data: WordCountsData }) {
  const intl = useIntl();
  const bands = visibleBands(data.bandTotals).filter(
    (bucket) => (data.bandTotals[bucket] ?? 0) > 0,
  );
  if (data.total <= 0 || bands.length === 0) return null;
  return (
    <ReportSection
      title={intl.formatMessage(messages.bandsTitle)}
      description={intl.formatMessage(messages.bandsDetail, { unit: unitLabel(intl, data.unit) })}
    >
      <ul className="flex flex-col gap-2">
        {bands.map((bucket) => {
          const count = data.bandTotals[bucket] ?? 0;
          const share = count / data.total;
          const name = bandLabel(intl, bucket);
          return (
            <li
              key={bucket}
              className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-[13px]"
              aria-label={intl.formatMessage(messages.bandShare, {
                band: name,
                count: formatCount(intl, count),
                share: formatShare(intl, share),
              })}
            >
              <span className="truncate text-muted-foreground" aria-hidden>
                {name}
              </span>
              <span className="h-2 rounded-full bg-muted" aria-hidden>
                <span
                  className="block h-2 rounded-full"
                  style={{ width: `${Math.max(share * 100, 0.5)}%`, background: "var(--chart-1)" }}
                />
              </span>
              <span className="tabular-nums" aria-hidden>
                {formatCount(intl, count)} · {formatShare(intl, share)}
              </span>
            </li>
          );
        })}
      </ul>
    </ReportSection>
  );
}

export function UnitSwitch({
  value,
  onChange,
}: {
  value: ReportUnit;
  onChange: (unit: ReportUnit) => void;
}) {
  const intl = useIntl();
  return (
    <SegmentedSwitch
      label={intl.formatMessage(pageMessages.unitLabel)}
      value={value}
      options={REPORT_UNITS.map((unit) => ({ value: unit, label: unitLabel(intl, unit) }))}
      onChange={onChange}
    />
  );
}

export function WordCountsTab({
  input,
  onChange,
}: {
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const counts = useWordCounts(input);
  const { state } = input;
  const taskName = (row: WordCountRow) =>
    row.jobId === null
      ? intl.formatMessage(messages.noTask)
      : (row.jobTitle ?? intl.formatMessage(messages.deletedTask));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <SegmentedSwitch
            label={intl.formatMessage(messages.whichWords)}
            value={state.mode}
            options={[
              { value: "arrived", label: intl.formatMessage(messages.arrived) },
              { value: "finished", label: intl.formatMessage(messages.finished) },
            ]}
            onChange={(mode) => onChange({ mode })}
          />
          <UnitSwitch value={state.unit} onChange={(unit) => onChange({ unit })} />
          <SegmentedSwitch
            label={intl.formatMessage(messages.groupBy)}
            value={state.groupBy}
            options={[
              { value: "project", label: intl.formatMessage(messages.byProject) },
              { value: "task", label: intl.formatMessage(messages.byTask) },
              { value: "week", label: intl.formatMessage(messages.byWeek) },
              { value: "language", label: intl.formatMessage(messages.byLanguage) },
              { value: "task_step", label: intl.formatMessage(messages.byTaskStep) },
            ]}
            onChange={(groupBy) => onChange({ groupBy })}
          />
        </div>
        <DownloadCsvButton
          href={reportDownloadUrl(input.organizationSlug, "words", wordCountsQuery(input))}
        />
      </div>
      <VolumeChart input={input} onChange={onChange} />
      <ReportSectionState
        query={counts}
        isEmpty={(data) => data.rows.length === 0}
        skeletonHeight={320}
      >
        {(data) => {
          // Labels follow the counts on screen, which stay while the next ones load.
          const byTask = data.groupBy === "task";
          const byWeek = data.groupBy === "week";
          const byLanguage = data.groupBy === "language";
          const byTaskStep = data.groupBy === "task_step";
          const unitName = unitLabel(intl, data.unit);
          const weekOf = (week: string) =>
            intl.formatMessage(messages.weekOf, {
              date: intl.formatDate(`${week}T00:00:00Z`, {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }),
            });
          return (
            <>
              <p className="text-[13px] text-muted-foreground">
                {intl.formatMessage(
                  data.mode === "arrived" ? messages.arrivedNote : messages.finishedNote,
                  { unit: unitName },
                )}{" "}
                {data.unit === "characters" || data.unit === "characters_with_spaces"
                  ? intl.formatMessage(messages.charactersNote)
                  : null}
              </p>
              <BandSummary data={data} />
              <MatchBandTable
                label={intl.formatMessage(messages.tableLabel)}
                rows={data.rows}
                rowKey={(row) =>
                  [row.week, row.jobId, row.projectId, row.taskStep, row.targetLocale].join(":")
                }
                bands={visibleBands(data.bandTotals)}
                leading={[
                  ...(byWeek
                    ? [
                        {
                          key: "week",
                          header: intl.formatMessage(messages.weekColumn),
                          cell: (row: WordCountRow) => (row.week ? weekOf(row.week) : "—"),
                        },
                      ]
                    : []),
                  ...(byTask
                    ? [
                        {
                          key: "task",
                          header: intl.formatMessage(messages.taskColumn),
                          cell: taskName,
                        },
                      ]
                    : byTaskStep
                      ? [
                          {
                            key: "taskStep",
                            header: intl.formatMessage(messages.taskStepColumn),
                            cell: (row: WordCountRow) =>
                              row.taskStep ? wordTaskStepLabel(intl, row.taskStep) : "—",
                          },
                        ]
                      : byLanguage
                        ? []
                        : [
                            {
                              key: "project",
                              header: intl.formatMessage(messages.projectColumn),
                              cell: (row: WordCountRow) => row.projectName ?? row.projectId,
                            },
                          ]),
                  {
                    key: "language",
                    header: intl.formatMessage(messages.languageColumn),
                    cell: (row) => row.targetLocale,
                    // The row's own name when grouped by language.
                    muted: !byLanguage,
                  },
                ]}
                trailing={[
                  {
                    key: "total",
                    header: intl.formatMessage(messages.totalColumn),
                    cell: (row) => formatCount(intl, row.total),
                    numeric: true,
                  },
                ]}
                totals={{ bands: data.bandTotals, trailing: [formatCount(intl, data.total)] }}
              />
              {data.uncounted > 0 && data.unit !== "strings" ? (
                <p className="text-[13px] text-muted-foreground">
                  {intl.formatMessage(pageMessages.notCounted, { count: data.uncounted })}
                </p>
              ) : null}
              {byTask ? (
                <ReportPager
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.groupCount}
                  onPage={(page) => onChange({ page })}
                />
              ) : null}
            </>
          );
        }}
      </ReportSectionState>
    </div>
  );
}
