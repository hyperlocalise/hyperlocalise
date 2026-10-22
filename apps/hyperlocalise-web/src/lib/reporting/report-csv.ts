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
import type { AiUsage } from "./ai-usage";
import type { BudgetRow, CostEstimate, Costs } from "./cost-queries";
import type { ReportStep } from "./report-units";
import type { AutomatedTime, LoggedTime, StepTime } from "./time-queries";
import { csvCell, MATCH_BUCKETS } from "./word-analysis";
import type { BandCounts, TaskWordRow, WordCounts } from "./word-queries";

/** CSV downloads of the Reports page's tables. Headers are the JSON field names. */

type Cell = string | number | boolean | null | undefined;

function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** The match bands that have any units, in their usual order. */
function bandsIn(totals: BandCounts) {
  return MATCH_BUCKETS.filter((bucket) => (totals[bucket] ?? 0) > 0);
}

export function wordCountsCsv(counts: WordCounts, groupBy: "project" | "task"): string {
  const bands = bandsIn(counts.bandTotals);
  return toCsv(
    [
      "projectName",
      ...(groupBy === "task" ? ["jobTitle", "jobId"] : []),
      "targetLocale",
      ...bands,
      "total",
    ],
    counts.rows.map((row) => [
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

export function aiUsageCsv(usage: AiUsage, groupBy: "origin" | "model"): string {
  const counts = ["calls", "inputTokens", "outputTokens", "images", "videos"] as const;
  return groupBy === "origin"
    ? toCsv(
        ["origin", ...counts, "models", "channels"],
        usage.byOrigin.map((row) => [
          row.origin,
          ...counts.map((key) => row[key]),
          row.models.join("; "),
          row.channels.join("; "),
        ]),
      )
    : toCsv(
        ["model", ...counts, "origins"],
        usage.byModel.map((row) => [
          row.model,
          ...counts.map((key) => row[key]),
          row.origins.join("; "),
        ]),
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
    const pricing = lines.some((line) => line.pricing === "fixed")
      ? "fixed"
      : lines.length && lines.every((line) => line.pricing === "none")
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
