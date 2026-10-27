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

import { buildPlanUsageHref } from "@/lib/billing/plan-usage";
import { AI_USAGE_DIMENSIONS, type AiUsageDimension } from "@/lib/reporting/ai-usage-origins";
import { describeChange } from "@/lib/reporting/report-period";

import { aiGroupLabel, dimensionLabel } from "./ai-usage-labels";
import { aiUsageTabMessages as messages } from "./ai-usage-tab.messages";
import {
  formatChange,
  formatCompact,
  formatCount,
  formatRateAmount,
  formatUsd,
} from "./report-format";
import {
  chartDayLabel,
  ChartLegend,
  seriesConfig,
  seriesValues,
  spansYears,
  StackedBarChart,
} from "./report-chart";
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
 * How a group relates to the tab's filters: no filter can stand for it ("No task", "Other"),
 * it is already the filter (the chosen project, task or model), or the change that narrows to
 * it. Only a change makes a row a button; rows under a group narrow within it, so they narrow
 * only when the group can stand as a filter.
 */
function narrowing(
  state: ReportsUrlState,
  dimension: AiUsageDimension,
  group: { key: string | null; other?: boolean },
): { kind: "none" } | { kind: "applied" } | { kind: "narrow"; change: Partial<ReportsUrlState> } {
  const { key } = group;
  if (key === null || group.other) return { kind: "none" };
  const current =
    dimension === "project"
      ? state.projectId
      : dimension === "task"
        ? state.jobId
        : state.aiFilters[dimension];
  if (current === key) return { kind: "applied" };
  // A task chosen in the filter bar is in the project clicked, so it stays; an estimate's tasks
  // may not be.
  if (dimension === "project") return { kind: "narrow", change: { projectId: key, jobIds: [] } };
  if (dimension === "task") return { kind: "narrow", change: { jobId: key } };
  return { kind: "narrow", change: { aiFilters: { ...state.aiFilters, [dimension]: key } } };
}

/**
 * A period's credit can be compared only when billing recorded nearly all of it; a few charges
 * are always on their way, but a period mostly from before billing recorded them is not a base.
 */
const UNRECORDED_SHARE_FOR_COMPARISON = 0.05;

/** AI credit as money, with an amount above zero but below a cent never shown as $0.00. */
function formatCredit(intl: ReturnType<typeof useIntl>, usd: string) {
  const amount = Math.abs(Number(usd));
  return amount > 0 && amount < 0.01
    ? intl.formatMessage(messages.belowOneCent, { amount: formatUsd(intl, "0.01") })
    : formatUsd(intl, usd);
}

/** Whether billing recorded no credit for any of a group's runs on our AI. */
function creditState(totals: Totals) {
  const items = totals.calls + totals.images + totals.videos;
  const charged = items - totals.ownKeyCalls;
  if (items === 0) return "none" as const;
  if (charged === 0) return "own_key" as const;
  if (totals.unrecordedCharges >= charged) return "not_recorded" as const;
  return "recorded" as const;
}

/** AI credit used as the page shows it: never $0 for a gap, nor for a fraction of a cent. */
function chargeLabel(intl: ReturnType<typeof useIntl>, totals: Totals) {
  switch (creditState(totals)) {
    case "none":
      return { text: "—", muted: false };
    case "own_key":
      return { text: intl.formatMessage(messages.ownKeyCharge), muted: true };
    case "not_recorded":
      return { text: intl.formatMessage(messages.notRecorded), muted: true };
    default:
      return { text: formatCredit(intl, totals.chargeUsd), muted: false };
  }
}

/** A period's credit for a comparison, or null when billing did not record nearly all of it. */
function comparableCredit(totals: Totals) {
  const state = creditState(totals);
  if (state === "own_key" || state === "not_recorded") return null;
  const charged = totals.calls + totals.images + totals.videos - totals.ownKeyCalls;
  if (charged > 0 && totals.unrecordedCharges / charged > UNRECORDED_SHARE_FOR_COMPARISON)
    return null;
  return Number(totals.chargeUsd);
}

const tokenTotal = (totals: Totals) =>
  totals.inputTokens + totals.outputTokens + totals.cacheAndReasoningTokens;

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
        <ReportStatCardsSkeleton count={5} />
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
  const change = (
    now: number | null,
    before: number | null,
    formatValue?: (value: number) => string,
  ) =>
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
          detail={intl.formatMessage(messages.callsDetail)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.tokens)}
          value={formatCompact(intl, tokenTotal(totals))}
          change={change(tokenTotal(totals), tokenTotal(previous), (value) =>
            formatCompact(intl, value),
          )}
          detail={intl.formatMessage(messages.tokensDetail, {
            input: formatCompact(intl, totals.inputTokens),
            output: formatCompact(intl, totals.outputTokens),
            other: formatCompact(intl, totals.cacheAndReasoningTokens),
          })}
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
          change={change(comparableCredit(totals), comparableCredit(previous), (amount) =>
            formatRateAmount(intl, amount.toFixed(8)),
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

const MEASURE_FIELDS = { tokens: "tokens", calls: "calls", charge: "chargeUsd" } as const;

function formatMeasure(intl: Intl, measure: Measure, value: number) {
  if (measure === "charge") return formatCredit(intl, value.toFixed(8));
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
  const { points } = data.series;
  const field = MEASURE_FIELDS[measure];
  // A group with nothing on this measure, such as images on Tokens, has no bar to show.
  const shown = data.series.groups.flatMap((group, index) =>
    points.some((point) => point[field][index]! > 0) ? [{ group, index }] : [],
  );
  const config = seriesConfig(
    shown.map(({ group }) => ({
      label: group.other
        ? intl.formatMessage(messages.otherGroup)
        : aiGroupLabel(intl, data.groupBy, group),
      other: group.other,
    })),
  );
  const withYear = spansYears(data.period);
  const rows = points.map((point) => ({
    label: chartDayLabel(intl, point.start, { weekly, withYear }),
    ...seriesValues(shown.map(({ index }) => point[field][index]!)),
  }));
  const total = points.reduce(
    (sum, point) => sum + point[field].reduce((part, value) => part + value, 0),
    0,
  );
  return (
    <ReportSection
      title={intl.formatMessage(weekly ? messages.chartPerWeek : messages.chartPerDay)}
      description={intl.formatMessage(messages.chartDetail, {
        dimension: dimensionLabel(intl, data.groupBy),
      })}
      actions={
        <>
          <ChartLegend config={config} />
          <SegmentedSwitch<Measure>
            label={intl.formatMessage(messages.chartMeasure)}
            value={measure}
            options={AI_USAGE_MEASURES.map((value) => ({
              value,
              label: intl.formatMessage(messages[`measure_${value}`]),
            }))}
            // The measure is also what the largest groups are by, so the table starts again.
            onChange={(aiMeasure) => onChange({ aiMeasure })}
          />
        </>
      }
    >
      <StackedBarChart
        config={config}
        rows={rows}
        summary={intl.formatMessage(messages.chartSummary, {
          measure: intl.formatMessage(messages[`measure_${measure}`]),
          from: chartDayLabel(intl, data.period.from, { withYear }),
          to: chartDayLabel(intl, data.period.to, { withYear }),
          total: formatMeasure(intl, measure, total),
        })}
        formatValue={(value) => formatMeasure(intl, measure, value)}
        allowDecimals={measure === "charge"}
      />
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
              <TableCell className={numeric}>
                {formatCompact(intl, totals.cacheAndReasoningTokens)}
              </TableCell>
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
          /** A row's name: a button when it narrows, naming its group for screen readers. */
          const name = (
            text: string,
            change: Partial<ReportsUrlState> | null,
            muted: boolean,
            group?: string,
          ) => {
            if (!change)
              return (
                <>
                  {group ? (
                    <span className="sr-only">
                      {intl.formatMessage(messages.underGroup, { group })}
                    </span>
                  ) : null}
                  <span className={muted ? "text-muted-foreground" : undefined}>{text}</span>
                </>
              );
            return (
              <button
                type="button"
                className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label={
                  group
                    ? intl.formatMessage(messages.narrowToUnder, { name: text, group })
                    : intl.formatMessage(messages.narrowTo, { name: text })
                }
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
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.cacheAndReasoningColumn)}
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
                    const parent = narrowing(state, data.groupBy, row);
                    // The scope its rows narrow within: the group's filter, or none needed.
                    const scope =
                      parent.kind === "narrow"
                        ? parent.change
                        : parent.kind === "applied"
                          ? {}
                          : null;
                    return (
                      <Fragment key={row.key ?? NONE}>
                        <TableRow className={thenBy ? "bg-muted/30 font-medium" : undefined}>
                          <TableCell>
                            {/* Narrowing to a group shows it by the second detail chosen now. */}
                            {name(
                              rowName,
                              parent.kind === "narrow"
                                ? {
                                    ...parent.change,
                                    ...(state.aiThen
                                      ? { aiGroup: state.aiThen, aiThen: null }
                                      : {}),
                                  }
                                : null,
                              row.key === null,
                            )}
                          </TableCell>
                          {cells(row)}
                        </TableRow>
                        {thenBy
                          ? row.children.map((child) => {
                              const own = scope
                                ? narrowing(
                                    { ...state, ...scope } as ReportsUrlState,
                                    thenBy,
                                    child,
                                  )
                                : null;
                              return (
                                <TableRow key={child.other ? "__other__" : (child.key ?? NONE)}>
                                  <TableCell className="pl-8">
                                    {name(
                                      child.other
                                        ? intl.formatMessage(messages.otherGroup)
                                        : aiGroupLabel(intl, thenBy, child),
                                      own?.kind === "narrow"
                                        ? { ...scope, ...own.change, aiGroup: thenBy, aiThen: null }
                                        : null,
                                      child.key === null,
                                      rowName,
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
