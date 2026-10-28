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

import { addDays, resolvePeriod } from "@/lib/reporting/report-period";
import {
  BAND_TIER_OF,
  REPORT_UNITS,
  WORD_COUNT_INTERVALS,
  WORD_COUNT_SPLITS,
  type BandTier,
  type ReportUnit,
  type TaskStep,
  type WordCountInterval,
  type WordTaskStep,
} from "@/lib/reporting/report-units";
import { MATCH_BUCKETS } from "@/lib/reporting/word-analysis";

import { MatchBandTable, visibleBands } from "./match-band-table";
import {
  chartDayLabel,
  ChartLegend,
  seriesConfig,
  seriesValues,
  spansYears,
  StackedBarChart,
} from "./report-chart";
import {
  bandLabel,
  formatCount,
  formatShare,
  joinSentences,
  taskStepLabel,
  unitLabel,
} from "./report-format";
import {
  DownloadCsvButton,
  ReportPager,
  ReportSection,
  ReportSectionState,
} from "./report-section";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import {
  reportDates,
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

/** Band tiers in one hue, the strongest match most prominent; new work, with no match, in grey. */
const TIER_COLORS: Record<BandTier, string> = {
  exact: "var(--chart-band-1)",
  high: "var(--chart-band-2)",
  fuzzy: "var(--chart-band-3)",
  low: "var(--chart-band-4)",
  new: "var(--chart-band-new)",
};

/**
 * Each task step keeps its colour whichever steps a chart shows, so any of them can be
 * neighbours. Four series colours that are apart in every pair, and the grey of "Other" for the
 * other step; teal was left out, too close to green.
 */
const TASK_STEP_COLORS: Record<WordTaskStep, string> = {
  translate: "var(--chart-1)",
  post_edit: "var(--chart-5)",
  proofread: "var(--chart-2)",
  other: "var(--muted-foreground)",
  no_task: "var(--chart-4)",
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
  if (data.split === "project" || data.split === "language")
    return seriesConfig(
      data.groups.map((group) => ({
        label: group.other
          ? intl.formatMessage(messages.otherSeries)
          : (group.name ?? group.key ?? ""),
        other: group.other,
      })),
    );
  return Object.fromEntries(
    data.groups.map((group, index) => {
      if (data.split === "band") {
        const tier = group.key as BandTier;
        const entry = { label: intl.formatMessage(TIER_MESSAGES[tier]), color: TIER_COLORS[tier] };
        return [`s${index}`, entry];
      }
      const step = group.key as WordTaskStep;
      return [`s${index}`, { label: wordTaskStepLabel(intl, step), color: TASK_STEP_COLORS[step] }];
    }),
  );
}

/** The last day a bar starting on `start` covers. */
function barEnd(start: string, per: WordCountInterval) {
  if (per === "day") return start;
  if (per === "week") return addDays(start, 6);
  const [year, month] = start.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * What the chart counts, whether some series are folded into Other or a string counts in each
 * of its tasks, how its bars run, and whether a bar at either end covers only part of its week
 * or month.
 */
function chartDetail(intl: Intl, data: WordSeriesData) {
  const first = data.points[0];
  const last = data.points.at(-1);
  const partial =
    first !== undefined &&
    last !== undefined &&
    (first.start < data.period.from || barEnd(last.start, data.per) > data.period.to);
  const other = data.groups.some((group) => group.other);
  return joinSentences([
    intl.formatMessage(data.mode === "arrived" ? messages.chartArrived : messages.chartFinished, {
      unit: unitLabel(intl, data.unit),
    }),
    // Said only when some are folded into Other.
    data.split === "project" && other ? intl.formatMessage(messages.chartRankedProjects) : null,
    data.split === "language" && other ? intl.formatMessage(messages.chartRankedLanguages) : null,
    data.split === "task_step" && data.mode === "arrived"
      ? intl.formatMessage(messages.chartPerTask)
      : null,
    intl.formatMessage(
      { day: messages.chartDays, week: messages.chartWeeks, month: messages.chartMonths }[data.per],
    ),
    partial ? intl.formatMessage(messages.chartPartial) : null,
  ]);
}

/** Bars no wider than this, so a few months do not fill the chart. */
const MAX_BAR_WIDTH = 48;

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
  // Nothing in the period under any split: the table says so on its own.
  if (data && data.groups.length === 0) return null;
  const config = data ? volumeConfig(intl, data) : {};
  // The chosen bar length, else the period's own, worked out as the server does, so the switch
  // shows the new choice while the chart for it loads.
  const per =
    input.state.per ??
    resolvePeriod({
      ...reportDates(input.state, input.today, input.startedDay),
      today: input.today,
      startedDay: input.startedDay,
    }).interval;
  return (
    <ReportSection
      title={intl.formatMessage(messages.chartTitle)}
      description={data ? chartDetail(intl, data) : undefined}
      actions={
        <>
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
            value={per}
            options={WORD_COUNT_INTERVALS.map((option) => ({
              value: option,
              label: intl.formatMessage(PER_MESSAGES[option]),
            }))}
            onChange={(option) => onChange({ per: option })}
          />
          <ChartLegend config={config} />
        </>
      }
    >
      <ReportSectionState query={series} skeletonHeight={224}>
        {(shown) => {
          // A first week or month can start in the year before the period does.
          const withYear = spansYears({
            from: shown.points[0]?.start ?? shown.period.from,
            to: shown.period.to,
          });
          const label = (start: string) =>
            chartDayLabel(intl, start, {
              weekly: shown.per === "week",
              monthly: shown.per === "month",
              withYear,
            });
          const totals = shown.groups.map((_, index) =>
            shown.points.reduce((sum, point) => sum + (point.units[index] ?? 0), 0),
          );
          return (
            <StackedBarChart
              config={config}
              rows={shown.points.map((point) => ({
                label: label(point.start),
                ...seriesValues(point.units),
              }))}
              summary={intl.formatMessage(messages.chartSummary, {
                unit: unitLabel(intl, shown.unit),
                from: chartDayLabel(intl, shown.period.from, { withYear }),
                to: chartDayLabel(intl, shown.period.to, { withYear }),
                total: formatCount(
                  intl,
                  totals.reduce((sum, value) => sum + value, 0),
                ),
                parts: intl.formatList(
                  Object.values(config).map((entry, index) =>
                    intl.formatMessage(messages.chartSummaryPart, {
                      name: entry.label,
                      count: formatCount(intl, totals[index] ?? 0),
                    }),
                  ),
                ),
              })}
              formatValue={(value) => formatCount(intl, value)}
              maxBarSize={MAX_BAR_WIDTH}
            />
          );
        }}
      </ReportSectionState>
    </ReportSection>
  );
}

/** The narrowest a band's bar is drawn, in percent, so a band with a little still shows. */
const MIN_BAND_PERCENT = 0.5;

/**
 * Each match band's units and share of the table's total, each bar in the colour of its tier,
 * as the chart split by match band draws it.
 */
function BandSummary({ data }: { data: WordCountsData }) {
  const intl = useIntl();
  const bands = MATCH_BUCKETS.filter((bucket) => (data.bandTotals[bucket] ?? 0) > 0);
  if (bands.length === 0) return null;
  return (
    <ReportSection
      title={intl.formatMessage(messages.bandsTitle)}
      description={intl.formatMessage(messages.bandsDetail, { unit: unitLabel(intl, data.unit) })}
    >
      {/* One grid, so every bar starts and ends at the same place and the figures fit. */}
      <ul className="grid grid-cols-[7rem_1fr_auto] gap-x-3 gap-y-2">
        {bands.map((bucket) => {
          const count = data.bandTotals[bucket] ?? 0;
          const share = count / data.total;
          const name = bandLabel(intl, bucket);
          return (
            <li key={bucket} className="col-span-3 grid grid-cols-subgrid items-center text-[13px]">
              <span className="sr-only">
                {intl.formatMessage(messages.bandShare, {
                  band: name,
                  count: formatCount(intl, count),
                  share: formatShare(intl, share),
                })}
              </span>
              <span className="truncate text-muted-foreground" aria-hidden>
                {name}
              </span>
              {/* No track behind the bar: the lightest tiers and New would fade into it. */}
              <span aria-hidden>
                <span
                  className="block h-2 rounded-full"
                  style={{
                    width: `${Math.max(share * 100, MIN_BAND_PERCENT)}%`,
                    background: TIER_COLORS[BAND_TIER_OF[bucket]],
                  }}
                />
              </span>
              <span className="text-right tabular-nums" aria-hidden>
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
      </div>
      <VolumeChart input={input} onChange={onChange} />
      {counts.data ? <BandSummary data={counts.data} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <DownloadCsvButton
          href={reportDownloadUrl(input.organizationSlug, "words", wordCountsQuery(input))}
        />
      </div>
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
                {joinSentences([
                  intl.formatMessage(
                    data.mode === "arrived" ? messages.arrivedNote : messages.finishedNote,
                    { unit: unitName },
                  ),
                  data.mode === "arrived" && (byTask || byTaskStep)
                    ? intl.formatMessage(messages.perTaskNote)
                    : null,
                  data.unit === "characters" || data.unit === "characters_with_spaces"
                    ? intl.formatMessage(messages.charactersNote)
                    : null,
                ])}
              </p>
              <MatchBandTable
                label={intl.formatMessage(messages.tableLabel)}
                rows={data.rows}
                rowKey={(row) =>
                  [row.week, row.jobId, row.projectId, row.taskStep, row.targetLocale].join(":")
                }
                bands={visibleBands(data.bandTotals, data.rows)}
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
