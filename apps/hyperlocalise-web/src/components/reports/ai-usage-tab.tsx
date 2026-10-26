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

import { XIcon } from "@phosphor-icons/react";
import { Fragment } from "react";
import Link from "next/link";
import { useIntl } from "react-intl";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { buildPlanUsageHref } from "@/lib/billing/plan-usage";
import { AI_USAGE_DIMENSIONS, type AiUsageDimension } from "@/lib/reporting/ai-usage-origins";
import { describeChange } from "@/lib/reporting/report-period";

import { activityTabMessages } from "./activity-tab.messages";
import { aiGroupLabel, dimensionLabel } from "./ai-usage-labels";
import { aiUsageTabMessages as messages } from "./ai-usage-tab.messages";
import { formatChange, formatCompact, formatCount, formatUsd } from "./report-format";
import {
  DownloadCsvButton,
  ReportEmpty,
  ReportPager,
  ReportSection,
  ReportSectionState,
} from "./report-section";
import { ReportStatCard, ReportStatCards, ReportStatCardsSkeleton } from "./report-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { ReportSelect } from "./reports-filter-bar";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import { aiUsageQuery, reportDownloadUrl, useAiUsage, type SectionInput } from "./reports-queries";
import { AI_USAGE_MEASURES, type ReportsUrlState } from "./reports-url-state";
import { SegmentedSwitch } from "./segmented-switch";

type Intl = ReturnType<typeof useIntl>;
type AiUsageData = NonNullable<ReturnType<typeof useAiUsage>["data"]>;
type Totals = AiUsageData["totals"];
type Measure = (typeof AI_USAGE_MEASURES)[number];

const NONE = "__none__";

/**
 * The change that narrows the tab to one group of a detail, or null when no filter can: a
 * group of calls without the detail, "Other", or a project when one is already chosen.
 */
function narrowTo(
  state: ReportsUrlState,
  dimension: AiUsageDimension,
  group: { key: string | null; other?: boolean },
): Partial<ReportsUrlState> | null {
  const { key } = group;
  if (key === null || group.other) return null;
  if (dimension === "project") return state.projectId ? null : { projectId: key };
  if (dimension === "task") return { jobId: key };
  return { aiFilters: { ...state.aiFilters, [dimension]: key } };
}

/** Billing's charge as the page shows it: never $0 for a gap, nor for a fraction of a cent. */
function chargeLabel(intl: ReturnType<typeof useIntl>, totals: Totals) {
  const items = totals.calls + totals.images + totals.videos;
  const charged = items - totals.ownKeyCalls;
  if (items === 0) return { text: "—", muted: false };
  if (charged === 0) return { text: intl.formatMessage(messages.ownKeyCharge), muted: true };
  if (totals.unrecordedCharges >= charged)
    return { text: intl.formatMessage(messages.notRecorded), muted: true };
  const amount = Number(totals.chargeUsd);
  return {
    text:
      amount > 0 && amount < 0.01
        ? intl.formatMessage(messages.belowOneCent, { amount: formatUsd(intl, "0.01") })
        : formatUsd(intl, totals.chargeUsd),
    muted: false,
  };
}

export function AiUsageTab({
  input,
  onChange,
}: {
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const usage = useAiUsage(input);
  return (
    <div className="flex flex-col gap-6">
      <AiFilterChips
        state={input.state}
        automationName={usage.data?.automationName ?? null}
        loading={usage.isFetching}
        onChange={onChange}
      />
      {usage.isPending && !usage.data ? (
        <ReportStatCardsSkeleton count={6} />
      ) : (
        <ReportSectionState query={usage}>
          {(data) => <AiUsageCards data={data} organizationSlug={input.organizationSlug} />}
        </ReportSectionState>
      )}
      <ReportSectionState query={usage} skeletonHeight={280}>
        {(data) => <AiUsageChart data={data} input={input} onChange={onChange} />}
      </ReportSectionState>
      <AiUsageTable input={input} usage={usage} onChange={onChange} />
    </div>
  );
}

/** The details chosen from a row, which the filter bar has no field for, each removable. */
function AiFilterChips({
  state,
  automationName,
  loading,
  onChange,
}: {
  state: ReportsUrlState;
  automationName: string | null;
  /** The automation's name comes with the usage, so a new choice has none until it loads. */
  loading: boolean;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const chosen = (["feature", "model", "provider", "automation"] as const).flatMap((dimension) => {
    const key = state.aiFilters[dimension];
    return key ? [{ dimension, key }] : [];
  });
  if (chosen.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {chosen.map(({ dimension, key }) => {
        const label = dimensionLabel(intl, dimension);
        const { [dimension]: _dropped, ...rest } = state.aiFilters;
        return (
          <li
            key={dimension}
            className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-[13px]"
          >
            {intl.formatMessage(messages.narrowedTo, {
              dimension: label,
              value:
                dimension === "automation" && !automationName && loading
                  ? "…"
                  : aiGroupLabel(intl, dimension, {
                      key,
                      label: dimension === "automation" ? automationName : null,
                    }),
            })}
            <button
              type="button"
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={intl.formatMessage(messages.removeFilter, { dimension: label })}
              onClick={() => onChange({ aiFilters: rest })}
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AiUsageCards({ data, organizationSlug }: { data: AiUsageData; organizationSlug: string }) {
  const intl = useIntl();
  const { totals, previous, period } = data;
  const change = (now: number, before: number, formatValue?: (value: number) => string) =>
    formatChange(
      intl,
      describeChange({ current: now, previous: before, hasEarlierData: period.hasEarlierData }),
      period.days,
      formatValue,
    );
  return (
    <div className="flex flex-col gap-2">
      <ReportStatCards>
        <ReportStatCard
          label={intl.formatMessage(messages.calls)}
          value={formatCount(intl, totals.calls)}
          change={change(totals.calls, previous.calls)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.inputTokens)}
          value={formatCompact(intl, totals.inputTokens)}
          change={change(totals.inputTokens, previous.inputTokens, (value) =>
            formatCompact(intl, value),
          )}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.outputTokens)}
          value={formatCompact(intl, totals.outputTokens)}
          change={change(totals.outputTokens, previous.outputTokens, (value) =>
            formatCompact(intl, value),
          )}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.images)}
          value={formatCount(intl, totals.images)}
          change={change(totals.images, previous.images)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.videos)}
          value={formatCount(intl, totals.videos)}
          change={change(totals.videos, previous.videos)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.charge)}
          value={chargeLabel(intl, totals).text}
          change={change(Number(totals.chargeUsd), Number(previous.chargeUsd), (amount) =>
            formatUsd(intl, amount.toFixed(8)),
          )}
          detail={intl.formatMessage(messages.chargeDetail)}
        />
      </ReportStatCards>
      <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
        {totals.unrecordedCharges > 0 ? (
          <p>{intl.formatMessage(messages.unrecordedNote, { count: totals.unrecordedCharges })}</p>
        ) : null}
        {totals.ownKeyCalls > 0 ? (
          <p>{intl.formatMessage(messages.ownKeyNote, { count: totals.ownKeyCalls })}</p>
        ) : null}
        <p>
          <Link
            className="underline underline-offset-4"
            href={buildPlanUsageHref(organizationSlug)}
          >
            {intl.formatMessage(messages.planCreditLink)}
          </Link>
        </p>
      </div>
    </div>
  );
}

function formatChartDay(intl: Intl, day: string, weekly: boolean) {
  const date = intl.formatDate(`${day}T00:00:00Z`, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return weekly ? intl.formatMessage(activityTabMessages.weekOf, { date }) : date;
}

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const MEASURE_FIELDS = { tokens: "tokens", calls: "calls", charge: "chargeUsd" } as const;

function formatMeasure(intl: Intl, measure: Measure, value: number) {
  if (measure === "charge") return formatUsd(intl, value.toFixed(8));
  return measure === "tokens" ? formatCompact(intl, value) : formatCount(intl, value);
}

function AiUsageChart({
  data,
  input,
  onChange,
}: {
  data: AiUsageData;
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const measure = input.state.aiMeasure;
  const weekly = data.period.interval === "week";
  const { groups, points } = data.series;
  const field = MEASURE_FIELDS[measure];
  const config = Object.fromEntries(
    groups.map((group, index) => [
      `s${index}`,
      {
        label: group.other
          ? intl.formatMessage(messages.otherGroup)
          : aiGroupLabel(intl, data.groupBy, group),
        color: group.other
          ? "var(--muted-foreground)"
          : SERIES_COLORS[index % SERIES_COLORS.length],
      },
    ]),
  ) satisfies ChartConfig;
  const rows = points.map((point) => ({
    label: formatChartDay(intl, point.start, weekly),
    ...Object.fromEntries(point[field].map((value, index) => [`s${index}`, value])),
  }));
  const total = points.reduce(
    (sum, point) => sum + point[field].reduce((part, value) => part + value, 0),
    0,
  );
  const keys = groups.map((_, index) => `s${index}`);
  return (
    <ReportSection
      title={intl.formatMessage(weekly ? messages.chartPerWeek : messages.chartPerDay)}
      description={intl.formatMessage(messages.chartDetail, {
        dimension: dimensionLabel(intl, data.groupBy),
      })}
      actions={
        <>
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
          <SegmentedSwitch<Measure>
            label={intl.formatMessage(messages.chartMeasure)}
            value={measure}
            options={AI_USAGE_MEASURES.map((value) => ({
              value,
              label: intl.formatMessage(messages[`measure_${value}`]),
            }))}
            onChange={(aiMeasure) => onChange({ aiMeasure, page: input.state.page })}
          />
        </>
      }
    >
      <ChartContainer
        config={config}
        className="aspect-auto h-56 w-full"
        role="img"
        aria-label={intl.formatMessage(messages.chartSummary, {
          measure: intl.formatMessage(messages[`measure_${measure}`]),
          from: formatChartDay(intl, data.period.from, false),
          to: formatChartDay(intl, data.period.to, false),
          total: formatMeasure(intl, measure, total),
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
          <YAxis hide allowDecimals={measure === "charge"} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          {keys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="usage"
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

/** Billing's charge for a group, with how many of its calls have none recorded. */
function ChargeCell({ totals }: { totals: Totals }) {
  const intl = useIntl();
  const { text, muted } = chargeLabel(intl, totals);
  if (muted) return <span className="text-muted-foreground">{text}</span>;
  return (
    <span className="inline-flex flex-col items-end">
      {text}
      {totals.unrecordedCharges > 0 ? (
        <span className="text-xs text-muted-foreground">
          {intl.formatMessage(messages.someNotRecorded, { count: totals.unrecordedCharges })}
        </span>
      ) : null}
    </span>
  );
}

function AiUsageTable({
  input,
  usage,
  onChange,
}: {
  input: SectionInput;
  usage: ReturnType<typeof useAiUsage>;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const { state } = input;
  const numeric = "text-right tabular-nums";
  const options = AI_USAGE_DIMENSIONS.map((dimension) => ({
    value: dimension,
    label: dimensionLabel(intl, dimension),
  }));
  return (
    <ReportSection
      title={intl.formatMessage(messages.tableTitle)}
      description={intl.formatMessage(messages.tableDetail)}
      actions={
        <>
          <ReportSelect
            label={intl.formatMessage(messages.groupBy)}
            className="w-40"
            value={state.aiGroup}
            options={options}
            onChange={(value) => {
              const aiGroup = value as AiUsageDimension;
              onChange({ aiGroup, aiThen: state.aiThen === aiGroup ? null : state.aiThen });
            }}
          />
          <ReportSelect
            label={intl.formatMessage(messages.thenBy)}
            className="w-40"
            value={state.aiThen ?? NONE}
            options={[
              { value: NONE, label: intl.formatMessage(messages.thenByNone) },
              ...options.filter((option) => option.value !== state.aiGroup),
            ]}
            onChange={(value) =>
              onChange({ aiThen: value === NONE ? null : (value as AiUsageDimension) })
            }
          />
          <DownloadCsvButton
            href={reportDownloadUrl(input.organizationSlug, "ai-usage", aiUsageQuery(input))}
          />
        </>
      }
    >
      <ReportSectionState query={usage}>
        {(data) => {
          if (data.totals.calls + data.totals.images + data.totals.videos === 0)
            return <ReportEmpty description={intl.formatMessage(messages.noAiUsage)} />;
          const media = data.totals.images + data.totals.videos > 0;
          const thenBy = data.thenBy;
          const cells = (totals: Totals) => (
            <>
              <TableCell className={numeric}>{formatCount(intl, totals.calls)}</TableCell>
              <TableCell className={numeric}>{formatCompact(intl, totals.inputTokens)}</TableCell>
              <TableCell className={numeric}>{formatCompact(intl, totals.outputTokens)}</TableCell>
              {media ? (
                <>
                  <TableCell className={numeric}>{formatCount(intl, totals.images)}</TableCell>
                  <TableCell className={numeric}>{formatCount(intl, totals.videos)}</TableCell>
                </>
              ) : null}
              <TableCell className={numeric}>
                <ChargeCell totals={totals} />
              </TableCell>
            </>
          );
          const name = (text: string, change: Partial<ReportsUrlState> | null, muted = false) => {
            if (!change)
              return <span className={muted ? "text-muted-foreground" : undefined}>{text}</span>;
            return (
              <button
                type="button"
                className="text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                aria-label={intl.formatMessage(messages.narrowTo, { name: text })}
                onClick={() => onChange(change)}
              >
                {text}
              </button>
            );
          };
          return (
            <>
              <Table aria-label={intl.formatMessage(messages.tableTitle)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dimensionLabel(intl, data.groupBy)}</TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.callsColumn)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.inputColumn)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.outputColumn)}
                    </TableHead>
                    {media ? (
                      <>
                        <TableHead className="text-right">
                          {intl.formatMessage(messages.imagesColumn)}
                        </TableHead>
                        <TableHead className="text-right">
                          {intl.formatMessage(messages.videosColumn)}
                        </TableHead>
                      </>
                    ) : null}
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.chargeColumn)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => {
                    const rowName = aiGroupLabel(intl, data.groupBy, row);
                    const parent = narrowTo(state, data.groupBy, row);
                    return (
                      <Fragment key={row.key ?? NONE}>
                        <TableRow className={thenBy ? "bg-muted/30 font-medium" : undefined}>
                          <TableCell>
                            {/* Narrowing to a group shows it by the second detail chosen now. */}
                            {name(
                              rowName,
                              parent && {
                                ...parent,
                                ...(state.aiThen ? { aiGroup: state.aiThen, aiThen: null } : {}),
                              },
                              row.key === null,
                            )}
                          </TableCell>
                          {cells(row)}
                        </TableRow>
                        {thenBy
                          ? row.children.map((child) => {
                              // Under a group no filter can stand for, a row cannot narrow either.
                              const own = parent
                                ? narrowTo(
                                    { ...state, ...parent } as ReportsUrlState,
                                    thenBy,
                                    child,
                                  )
                                : null;
                              return (
                                <TableRow key={child.other ? "__other__" : (child.key ?? NONE)}>
                                  <TableCell className="pl-8">
                                    <span className="sr-only">{`${rowName}: `}</span>
                                    {name(
                                      child.other
                                        ? intl.formatMessage(messages.otherGroup)
                                        : aiGroupLabel(intl, thenBy, child),
                                      own && { ...parent, ...own, aiGroup: thenBy, aiThen: null },
                                      child.key === null,
                                    )}
                                  </TableCell>
                                  {cells(child)}
                                </TableRow>
                              );
                            })
                          : null}
                      </Fragment>
                    );
                  })}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>{intl.formatMessage(pageMessages.total)}</TableCell>
                    {cells(data.totals)}
                  </TableRow>
                </TableBody>
              </Table>
              <ReportPager
                page={data.page}
                pageSize={data.pageSize}
                total={data.totalGroups}
                onPage={(page) => onChange({ page })}
              />
            </>
          );
        }}
      </ReportSectionState>
    </ReportSection>
  );
}
