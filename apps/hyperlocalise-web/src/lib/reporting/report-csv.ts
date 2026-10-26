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
import type { AiUsage, AiUsageGroup } from "./ai-usage";
import type { AiUsageDimension } from "./ai-usage-origins";
import type { BudgetRow, CostEstimate, Costs } from "./cost-queries";
import { SUMMARY_SOURCES, type ReportStep } from "./report-units";
import type { AutomatedTime, LoggedTime, StepTime } from "./time-queries";
import { csvCell, MATCH_BUCKETS } from "./word-analysis";
import type { BandCounts, FinishedSeriesPoint, TaskWordRow, WordCounts } from "./word-queries";

/** CSV downloads of the Reports page's tables. Headers are the JSON field names. */

type Cell = string | number | boolean | null | undefined;

function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** The match bands that have any units, in their usual order. */
function bandsIn(totals: BandCounts) {
  return MATCH_BUCKETS.filter((bucket) => (totals[bucket] ?? 0) > 0);
}

/** The Activity report: finished units per day or week, by where the text came from. */
export function activityCsv(activity: { series: FinishedSeriesPoint[] }): string {
  return toCsv(
    ["start", ...SUMMARY_SOURCES],
    activity.series.map((point) => [point.start, ...SUMMARY_SOURCES.map((name) => point[name])]),
  );
}

export function wordCountsCsv(counts: WordCounts, groupBy: "project" | "task" | "week"): string {
  const bands = bandsIn(counts.bandTotals);
  return toCsv(
    [
      ...(groupBy === "week" ? ["week"] : []),
      "projectName",
      ...(groupBy === "task" ? ["jobTitle", "jobId"] : []),
      "targetLocale",
      ...bands,
      "total",
    ],
    counts.rows.map((row) => [
      ...(groupBy === "week" ? [row.week] : []),
      row.projectName,
      ...(groupBy === "task" ? [row.jobTitle, row.jobId] : []),
      row.targetLocale,
      ...bands.map((bucket) => row.bands[bucket] ?? 0),
      row.total,
    ]),
  );
}

export function loggedTimeCsv(time: LoggedTime): string {
  return toCsv(
    ["jobTitle", "jobId", "step", "targetLocale", "minutes", "people"],
    time.rows.map((row) => [
      row.jobTitle,
      row.jobId,
      row.step,
      row.targetLocale,
      row.minutes,
      row.people,
    ]),
  );
}

export function stepTimesCsv(logged: StepTime[], automated: AutomatedTime): string {
  return toCsv(
    ["kind", "name", "minutes", "people", "runs"],
    [
      ...logged.map((row) => ["logged", row.step, row.minutes, row.people, null]),
      [
        "task_runs",
        "translation",
        Math.round(automated.taskRuns.milliseconds / 60_000),
        null,
        automated.taskRuns.runs,
      ],
      ...automated.workflowSteps.map((row) => [
        "workflow_step",
        row.nodeType,
        Math.round(row.milliseconds / 60_000),
        null,
        row.runs,
      ]),
    ],
  );
}

/** The CSV columns of a detail: its value, and the name of a project, task or automation. */
const AI_DIMENSION_COLUMNS: Record<AiUsageDimension, string[]> = {
  area: ["area"],
  feature: ["feature"],
  model: ["model"],
  provider: ["provider"],
  channel: ["channel"],
  key: ["keyType"],
  project: ["projectId", "projectName"],
  task: ["jobId", "jobTitle"],
  automation: ["automationId", "automationName"],
};

/** The AI usage table: a line per group, or per group of the second detail when there is one. */
export function aiUsageCsv(usage: AiUsage): string {
  const measures = [
    "calls",
    "inputTokens",
    "outputTokens",
    "images",
    "videos",
    "chargeUsd",
    "unrecordedCharges",
    "ownKeyCalls",
  ] as const;
  const detail = (dimension: AiUsageDimension, group: AiUsageGroup) =>
    AI_DIMENSION_COLUMNS[dimension].length === 2 ? [group.key, group.label] : [group.key];
  const thenBy = usage.thenBy;
  return toCsv(
    [
      ...AI_DIMENSION_COLUMNS[usage.groupBy],
      ...(thenBy ? AI_DIMENSION_COLUMNS[thenBy] : []),
      ...measures,
    ],
    usage.rows.flatMap((row) =>
      thenBy
        ? row.children.map((child) => [
            ...detail(usage.groupBy, row),
            ...detail(thenBy, child),
            ...measures.map((key) => child[key]),
          ])
        : [[...detail(usage.groupBy, row), ...measures.map((key) => row[key])]],
    ),
  );
}

export function costsCsv(costs: Costs): string {
  return toCsv(
    [
      "projectName",
      "projectId",
      "peopleUsd",
      "aiOnTasksUsd",
      "aiOutsideTasksUsd",
      "aiUsd",
      "expensesUsd",
      "totalUsd",
    ],
    [
      ...costs.rows.map((row) => [
        row.projectName,
        row.projectId,
        row.peopleUsd,
        row.aiOnTasksUsd,
        row.aiOutsideTasksUsd,
        row.aiUsd,
        row.expensesUsd,
        row.totalUsd,
      ]),
      // AI charged outside any project: a row with no project.
      ...(costs.outsideProjects
        ? [
            [
              null,
              null,
              null,
              costs.outsideProjects.aiOnTasksUsd,
              costs.outsideProjects.aiOutsideTasksUsd,
              costs.outsideProjects.aiUsd,
              null,
              costs.outsideProjects.aiUsd,
            ],
          ]
        : []),
    ],
  );
}

export function costEstimateCsv(estimate: CostEstimate): string {
  const bands = bandsIn(estimate.totals.bands);
  return toCsv(
    [
      "targetLocale",
      "step",
      "pricing",
      "pricedBy",
      "rateCardName",
      "basis",
      "rate",
      ...bands,
      "units",
      "weighted",
      "costUsd",
      "jobTitle",
      "jobId",
    ],
    [
      ...estimate.rows.map((row) => [
        row.targetLocale,
        row.step,
        row.pricing,
        row.pricedBy.join(" "),
        row.rateCardName,
        row.basis,
        row.rate,
        ...bands.map((bucket) => row.bands[bucket] ?? 0),
        row.units,
        row.weighted === null ? null : Math.round(row.weighted * 100) / 100,
        row.costUsd,
        null,
        null,
      ]),
      ...estimate.fixedFees.map((fee) => [
        null,
        fee.step,
        "fixed",
        null,
        null,
        null,
        null,
        ...bands.map(() => null),
        null,
        null,
        fee.amountUsd,
        fee.jobTitle,
        fee.jobId,
      ]),
    ],
  );
}

export function budgetsCsv(budgets: BudgetRow[]): string {
  return toCsv(
    [
      "projectName",
      "projectId",
      "budgetUsd",
      "spentUsd",
      "stillToComeUsd",
      "forecastUsd",
      "remainingUsd",
      "status",
      "incomplete",
    ],
    budgets.map((row) => [
      row.projectName,
      row.projectId,
      row.budgetUsd,
      row.spentUsd,
      row.stillToComeUsd,
      row.forecastUsd,
      row.remainingUsd,
      row.status,
      row.incomplete,
    ]),
  );
}

/**
 * A task's words by language for one step, as its Report tab shows them, with the weighted units,
 * cost and pricing when the estimate is given (the roles that see money). A fixed fee belongs to
 * the whole step, so it is a row of its own with no language.
 */
export function taskWordsCsv(
  words: { rows: TaskWordRow[] },
  estimate: CostEstimate | null,
  step: ReportStep,
): string {
  const rows = words.rows.filter((row) => row.step === step);
  const totals: BandCounts = {};
  for (const row of rows)
    for (const [bucket, units] of Object.entries(row.bands))
      totals[bucket as keyof BandCounts] = (totals[bucket as keyof BandCounts] ?? 0) + units;
  const bands = bandsIn(totals);
  const priced = (targetLocale: string) =>
    estimate?.rows.filter((row) => row.targetLocale === targetLocale && row.step === step) ?? [];
  const money = (targetLocale: string) => {
    const lines = priced(targetLocale);
    const weighted = lines.reduce<number | null>(
      (sum, line) => (line.weighted === null ? sum : (sum ?? 0) + line.weighted),
      null,
    );
    const cost = lines.reduce<number | null>(
      (sum, line) => (line.costUsd === null ? sum : (sum ?? 0) + Number(line.costUsd)),
      null,
    );
    // Empty for a language the estimate has no line for.
    const pricing =
      lines.length === 0
        ? null
        : lines.some((line) => line.pricing === "fixed")
          ? "fixed"
          : lines.every((line) => line.pricing === "none")
            ? "none"
            : "rate";
    return [
      weighted === null ? null : Math.round(weighted * 100) / 100,
      cost === null ? null : cost.toFixed(2),
      pricing,
    ];
  };
  const fees = estimate?.fixedFees.filter((fee) => fee.step === step) ?? [];
  return toCsv(
    [
      "targetLocale",
      ...bands,
      "total",
      "finished",
      ...(estimate ? ["weighted", "costUsd", "pricing"] : []),
    ],
    [
      ...rows.map((row) => [
        row.targetLocale,
        ...bands.map((bucket) => row.bands[bucket] ?? 0),
        row.total,
        row.finished,
        ...(estimate ? money(row.targetLocale) : []),
      ]),
      ...fees.map((fee) => [
        null,
        ...bands.map(() => null),
        null,
        null,
        null,
        Number(fee.amountUsd).toFixed(2),
        "fixed",
      ]),
    ],
  );
}
