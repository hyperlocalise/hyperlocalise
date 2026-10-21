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
import { AI_ORIGINS, type AiChannel, type AiOrigin } from "@/lib/reporting/ai-usage-origins";
import { describeChange, shareOf } from "@/lib/reporting/report-period";
import { VISUAL_NODE_DESCRIPTIONS } from "@/lib/visual-workflows/catalog/node-descriptions";

import { activityTabMessages as messages } from "./activity-tab.messages";
import {
  formatChange,
  formatCompact,
  formatCount,
  formatDuration,
  formatShare,
  stepLabel,
} from "./report-format";
import {
  ReportSection,
  ReportSectionState,
  DownloadCsvButton,
  ReportEmpty,
} from "./report-section";
import { ReportStatCard, ReportStatCards, ReportStatCardsSkeleton } from "./report-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import {
  aiUsageQuery,
  reportDownloadUrl,
  stepTimesQuery,
  useActivityReport,
  useAiUsage,
  useStepTimes,
  type SectionInput,
} from "./reports-queries";
import type { ReportsUrlState } from "./reports-url-state";
import { SegmentedSwitch } from "./segmented-switch";

type Intl = ReturnType<typeof useIntl>;
type ActivityData = NonNullable<ReturnType<typeof useActivityReport>["data"]>;

export function ActivityTab({
  input,
  onChange,
}: {
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const activity = useActivityReport(input);
  return (
    <div className="flex flex-col gap-6">
      {activity.isPending && !activity.data ? (
        <ReportStatCardsSkeleton count={5} />
      ) : (
        <ReportSectionState query={activity}>
          {(data) => <ActivityCards data={data} />}
        </ReportSectionState>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ReportSectionState query={activity} skeletonHeight={280}>
          {(data) => <FinishedWordsChart data={data} />}
        </ReportSectionState>
        <ReportSectionState query={activity} skeletonHeight={280}>
          {(data) => <FinishedByLanguage data={data} />}
        </ReportSectionState>
      </div>
      <StepTimesSection input={input} />
      <AiUsageSection input={input} onChange={onChange} />
    </div>
  );
}

function ActivityCards({ data }: { data: ActivityData }) {
  const intl = useIntl();
  const { current, previous, period } = data;
  const change = (now: number | null, before: number | null, share = false) =>
    formatChange(
      intl,
      describeChange({
        current: now,
        previous: before,
        hasEarlierData: period.hasEarlierData,
        share,
      }),
      period.days,
    );
  const progress = shareOf(current.arrivedDone, current.arrived);
  const approved = shareOf(current.reviewed, current.finished);
  return (
    <div className="flex flex-col gap-2">
      <ReportStatCards>
        <ReportStatCard
          label={intl.formatMessage(messages.sourceWords)}
          value={formatCount(intl, current.source)}
          change={change(current.source, previous.source)}
          detail={intl.formatMessage(messages.sourceWordsDetail)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.wordsToTranslate)}
          value={formatCount(intl, current.arrived)}
          change={change(current.arrived, previous.arrived)}
          detail={intl.formatMessage(messages.wordsToTranslateDetail)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.wordsFinished)}
          value={formatCount(intl, current.finished)}
          change={change(current.finished, previous.finished)}
          detail={intl.formatMessage(messages.wordsFinishedDetail)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.progress)}
          value={formatShare(intl, progress)}
          change={change(progress, shareOf(previous.arrivedDone, previous.arrived), true)}
          detail={intl.formatMessage(messages.progressDetail)}
        />
        <ReportStatCard
          label={intl.formatMessage(messages.approved)}
          value={formatShare(intl, approved)}
          change={change(approved, shareOf(previous.reviewed, previous.finished), true)}
          detail={intl.formatMessage(messages.approvedDetail)}
        />
      </ReportStatCards>
      {current.uncounted > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {intl.formatMessage(pageMessages.notCounted, { count: current.uncounted })}
        </p>
      ) : null}
    </div>
  );
}

function formatChartDay(intl: Intl, day: string, weekly: boolean) {
  const date = intl.formatDate(`${day}T00:00:00Z`, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return weekly ? intl.formatMessage(messages.weekOf, { date }) : date;
}

function FinishedWordsChart({ data }: { data: ActivityData }) {
  const intl = useIntl();
  const weekly = data.period.interval === "week";
  const config = {
    people: { label: intl.formatMessage(messages.people), color: "var(--chart-1)" },
    automatic: { label: intl.formatMessage(messages.automatic), color: "var(--chart-4)" },
  } satisfies ChartConfig;
  const rows = data.series.map((point) => ({
    ...point,
    label: formatChartDay(intl, point.start, weekly),
  }));
  const people = data.series.reduce((sum, point) => sum + point.people, 0);
  const automatic = data.series.reduce((sum, point) => sum + point.automatic, 0);
  const title = intl.formatMessage(weekly ? messages.finishedPerWeek : messages.finishedPerDay);
  return (
    <ReportSection
      title={title}
      description={intl.formatMessage(messages.finishedChartDetail, {
        step: stepLabel(intl, data.step),
      })}
      actions={
        <div className="flex gap-3 text-xs text-muted-foreground">
          {(["people", "automatic"] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ background: config[key].color }}
              />
              {config[key].label}
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
          people: formatCount(intl, people),
          automatic: formatCount(intl, automatic),
          from: formatChartDay(intl, data.period.from, false),
          to: formatChartDay(intl, data.period.to, false),
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
          <YAxis hide allowDecimals={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Bar
            dataKey="automatic"
            stackId="finished"
            fill="var(--color-automatic)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="people"
            stackId="finished"
            fill="var(--color-people)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </ReportSection>
  );
}

function FinishedByLanguage({ data }: { data: ActivityData }) {
  const intl = useIntl();
  const largest = data.byLanguage[0]?.units ?? 0;
  return (
    <ReportSection
      title={intl.formatMessage(messages.finishedByLanguage)}
      description={intl.formatMessage(messages.finishedByLanguageDetail, {
        step: stepLabel(intl, data.step),
      })}
    >
      {data.byLanguage.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {intl.formatMessage(pageMessages.noData)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {data.byLanguage.map((row) => (
            <li
              key={row.targetLocale}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-[13px]"
            >
              <span className="text-muted-foreground">{row.targetLocale}</span>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-[var(--chart-1)]"
                  style={{ width: `${largest ? Math.max(2, (row.units / largest) * 100) : 0}%` }}
                />
              </span>
              <span className="tabular-nums">{formatCount(intl, row.units)}</span>
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  );
}

function workflowStepName(nodeType: string) {
  return (
    (VISUAL_NODE_DESCRIPTIONS as Record<string, { title: string } | undefined>)[nodeType]?.title ??
    nodeType
  );
}

/** A task or language is chosen, which some sections cannot follow. */
function narrowedBeyondProject(input: SectionInput) {
  return Boolean(input.state.jobId || input.state.targetLocale);
}

function StepTimesSection({ input }: { input: SectionInput }) {
  const intl = useIntl();
  const stepTimes = useStepTimes(input);
  return (
    <ReportSection
      title={intl.formatMessage(messages.stepTimes)}
      description={
        narrowedBeyondProject(input)
          ? `${intl.formatMessage(messages.stepTimesDetail)}. ${intl.formatMessage(messages.automatedFiltersNote)}`
          : intl.formatMessage(messages.stepTimesDetail)
      }
      actions={
        <DownloadCsvButton
          href={reportDownloadUrl(input.organizationSlug, "step-times", stepTimesQuery(input))}
        />
      }
    >
      <ReportSectionState
        query={stepTimes}
        isEmpty={(data) =>
          data.logged.length === 0 &&
          data.automated.taskRuns.runs === 0 &&
          data.automated.workflowSteps.length === 0
        }
      >
        {(data) => (
          <Table aria-label={intl.formatMessage(messages.stepTimes)}>
            <TableHeader>
              <TableRow>
                <TableHead>{intl.formatMessage(messages.stepColumn)}</TableHead>
                <TableHead className="text-right">
                  {intl.formatMessage(messages.timeColumn)}
                </TableHead>
                <TableHead className="text-right">
                  {intl.formatMessage(messages.whoColumn)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.logged.map((row) => (
                <TableRow key={row.step}>
                  <TableCell>
                    {intl.formatMessage(messages.loggedStep, { step: stepLabel(intl, row.step) })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(intl, row.minutes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {intl.formatMessage(messages.peopleCount, { count: row.people })}
                  </TableCell>
                </TableRow>
              ))}
              {data.automated.taskRuns.runs > 0 ? (
                <TableRow>
                  <TableCell>{intl.formatMessage(messages.taskRuns)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(intl, data.automated.taskRuns.milliseconds / 60_000)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {intl.formatMessage(messages.runsCount, {
                      count: data.automated.taskRuns.runs,
                    })}
                  </TableCell>
                </TableRow>
              ) : null}
              {data.automated.workflowSteps.map((row) => (
                <TableRow key={row.nodeType}>
                  <TableCell>
                    {intl.formatMessage(messages.workflowStep, {
                      step: workflowStepName(row.nodeType),
                    })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(intl, row.milliseconds / 60_000)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {intl.formatMessage(messages.runsCount, { count: row.runs })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ReportSectionState>
    </ReportSection>
  );
}

const ORIGIN_MESSAGES = Object.fromEntries(
  AI_ORIGINS.map((origin) => [origin, messages[`origin_${origin}`]]),
) as Record<AiOrigin, (typeof messages)["origin_other"]>;

function originLabel(intl: Intl, origin: AiOrigin) {
  return intl.formatMessage(ORIGIN_MESSAGES[origin]);
}

function channelLabel(intl: Intl, channel: AiChannel) {
  return intl.formatMessage(messages[`channel_${channel}`]);
}

function AiUsageSection({
  input,
  onChange,
}: {
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const usage = useAiUsage(input);
  const byModel = input.state.aiGroup === "model";
  const numeric = "text-right tabular-nums";
  return (
    <ReportSection
      title={intl.formatMessage(messages.aiUsage)}
      description={
        narrowedBeyondProject(input)
          ? `${intl.formatMessage(messages.aiUsageDetail)} ${intl.formatMessage(messages.aiUsageFiltersNote)}`
          : intl.formatMessage(messages.aiUsageDetail)
      }
      actions={
        <>
          <SegmentedSwitch
            label={intl.formatMessage(messages.groupAiUsage)}
            value={input.state.aiGroup}
            options={[
              { value: "origin", label: intl.formatMessage(messages.byOrigin) },
              { value: "model", label: intl.formatMessage(messages.byModel) },
            ]}
            onChange={(aiGroup) => onChange({ aiGroup, page: input.state.page })}
          />
          <DownloadCsvButton
            href={reportDownloadUrl(input.organizationSlug, "ai-usage", aiUsageQuery(input))}
          />
        </>
      }
    >
      <ReportSectionState query={usage}>
        {(data) =>
          data.byOrigin.length === 0 ? (
            <ReportEmpty description={intl.formatMessage(messages.noAiUsage)} />
          ) : (
            <Table aria-label={intl.formatMessage(messages.aiUsage)}>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {intl.formatMessage(byModel ? messages.modelColumn : messages.originColumn)}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage(messages.callsColumn)}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage(messages.inputColumn)}
                  </TableHead>
                  <TableHead className="text-right">
                    {intl.formatMessage(messages.outputColumn)}
                  </TableHead>
                  {byModel ? (
                    <TableHead>{intl.formatMessage(messages.originsColumn)}</TableHead>
                  ) : (
                    <>
                      <TableHead>{intl.formatMessage(messages.modelsColumn)}</TableHead>
                      <TableHead>{intl.formatMessage(messages.channelsColumn)}</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {byModel
                  ? data.byModel.map((row) => (
                      <TableRow key={row.model}>
                        <TableCell>{row.model}</TableCell>
                        <TableCell className={numeric}>{formatCount(intl, row.calls)}</TableCell>
                        <TableCell className={numeric}>
                          {formatCompact(intl, row.inputTokens)}
                        </TableCell>
                        <TableCell className={numeric}>
                          {formatCompact(intl, row.outputTokens)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.origins.map((origin) => originLabel(intl, origin)).join(", ")}
                        </TableCell>
                      </TableRow>
                    ))
                  : data.byOrigin.map((row) => (
                      <TableRow key={row.origin}>
                        <TableCell>{originLabel(intl, row.origin)}</TableCell>
                        <TableCell className={numeric}>
                          {row.images + row.videos > 0 && row.calls === 0
                            ? intl.formatMessage(messages.mediaCalls, {
                                images: intl.formatMessage(messages.imagesCount, {
                                  count: row.images,
                                }),
                                videos: intl.formatMessage(messages.videosCount, {
                                  count: row.videos,
                                }),
                              })
                            : formatCount(intl, row.calls)}
                        </TableCell>
                        <TableCell className={numeric}>
                          {row.inputTokens ? formatCompact(intl, row.inputTokens) : "—"}
                        </TableCell>
                        <TableCell className={numeric}>
                          {row.outputTokens ? formatCompact(intl, row.outputTokens) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.models.join(", ")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.channels.map((channel) => channelLabel(intl, channel)).join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>{intl.formatMessage(pageMessages.total)}</TableCell>
                  <TableCell className={numeric}>{formatCount(intl, data.totals.calls)}</TableCell>
                  <TableCell className={numeric}>
                    {formatCompact(intl, data.totals.inputTokens)}
                  </TableCell>
                  <TableCell className={numeric}>
                    {formatCompact(intl, data.totals.outputTokens)}
                  </TableCell>
                  <TableCell colSpan={byModel ? 1 : 2} />
                </TableRow>
              </TableBody>
            </Table>
          )
        }
      </ReportSectionState>
    </ReportSection>
  );
}
