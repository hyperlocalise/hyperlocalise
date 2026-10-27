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
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { REPORT_UNITS, type ReportUnit } from "@/lib/reporting/report-units";

import { MatchBandTable, visibleBands } from "./match-band-table";
import { formatCount, unitLabel } from "./report-format";
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
  wordCountsQuery,
  type SectionInput,
} from "./reports-queries";
import type { ReportsUrlState } from "./reports-url-state";
import { SegmentedSwitch } from "./segmented-switch";
import { wordCountsTabMessages as messages } from "./word-counts-tab.messages";

type Intl = ReturnType<typeof useIntl>;
type WordCountsData = NonNullable<ReturnType<typeof useWordCounts>["data"]>;
type WordCountRow = WordCountsData["rows"][number];

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function weekLabel(intl: Intl, monday: string) {
  return intl.formatMessage(messages.weekOf, {
    date: intl.formatDate(`${monday}T00:00:00Z`, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
  });
}

/** Units per week, one stack per project: the largest five on their own, the rest as Other. */
function VolumeChart({
  data,
}: {
  data: WordCountsData & { series: NonNullable<WordCountsData["series"]> };
}) {
  const intl = useIntl();
  const { groups, points } = data.series;
  const config = Object.fromEntries(
    groups.map((group, index) => [
      `s${index}`,
      {
        label: group.other
          ? intl.formatMessage(messages.otherProjects)
          : (group.projectName ?? group.projectId ?? ""),
        color: group.other
          ? "var(--muted-foreground)"
          : SERIES_COLORS[index % SERIES_COLORS.length],
      },
    ]),
  ) satisfies ChartConfig;
  const keys = groups.map((_, index) => `s${index}`);
  const rows = points.map((point) => ({
    label: weekLabel(intl, point.start),
    ...Object.fromEntries(point.units.map((value, index) => [`s${index}`, value])),
  }));
  const total = points.reduce(
    (sum, point) => sum + point.units.reduce((part, value) => part + value, 0),
    0,
  );
  const unitName = unitLabel(intl, data.unit);
  const day = (value: string) =>
    intl.formatDate(`${value}T00:00:00Z`, { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <ReportSection
      title={intl.formatMessage(messages.chartTitle)}
      description={intl.formatMessage(
        data.mode === "arrived" ? messages.chartArrivedDetail : messages.chartFinishedDetail,
        { unit: unitName },
      )}
      actions={
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {keys.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ background: config[key]!.color }}
              />
              {config[key]!.label}
            </span>
          ))}
        </div>
      }
    >
      <ChartContainer
        config={config}
        className="aspect-auto h-56 w-full"
        role="img"
        aria-label={intl.formatMessage(messages.chartSummary, {
          unit: unitName,
          from: day(data.period.from),
          to: day(data.period.to),
          total: formatCount(intl, total),
        })}
      >
        <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis hide />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                formatValue={(value) => formatCount(intl, value)}
              />
            }
          />
          {keys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="volume"
              fill={`var(--color-${key})`}
              radius={index === keys.length - 1 ? [4, 4, 0, 0] : undefined}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
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
            ]}
            onChange={(groupBy) => onChange({ groupBy })}
          />
        </div>
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
              {byWeek && data.series && data.series.groups.length > 0 ? (
                <VolumeChart data={{ ...data, series: data.series }} />
              ) : null}
              <MatchBandTable
                label={intl.formatMessage(messages.tableLabel)}
                rows={data.rows}
                rowKey={(row) =>
                  `${row.week ?? ""}:${row.jobId ?? ""}:${row.projectId}:${row.targetLocale}`
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
                  byTask
                    ? {
                        key: "task",
                        header: intl.formatMessage(messages.taskColumn),
                        cell: taskName,
                      }
                    : {
                        key: "project",
                        header: intl.formatMessage(messages.projectColumn),
                        cell: (row) => row.projectName ?? row.projectId,
                      },
                  {
                    key: "language",
                    header: intl.formatMessage(messages.languageColumn),
                    cell: (row) => row.targetLocale,
                    muted: true,
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
