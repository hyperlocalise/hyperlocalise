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
import { describe, expect, it } from "vite-plus/test";

import type { AiUsage, AiUsageGroup } from "./ai-usage";
import type { CostEstimate, CostEstimateRow } from "./cost-queries";
import { resolvePeriod } from "./report-period";
import { aiUsageCsv, loggedTimeCsv, stepTimesCsv, taskWordsCsv } from "./report-csv";
import type { AutomatedTime, LoggedTime, StepTime } from "./time-queries";

const row = (targetLocale: string, overrides: Partial<CostEstimateRow>): CostEstimateRow => ({
  targetLocale,
  step: "review",
  pricing: "rate",
  pricedBy: ["task"],
  rateCardName: "Standard",
  rateId: "rate_1",
  basis: "word",
  rate: "0.10000000",
  percentages: {},
  bands: { new: 10 },
  units: 10,
  weighted: 10,
  costUsd: "1.00000000",
  unestimated: false,
  uncounted: 0,
  ...overrides,
});

describe("time CSVs", () => {
  const automated: AutomatedTime = {
    workflowSteps: [{ nodeType: "action.http", milliseconds: 90_000, runs: 3 }],
    taskRuns: {
      milliseconds: 600_000,
      runs: 2,
      stages: [
        { stage: "preparing", milliseconds: 60_000 },
        { stage: "reusing_memory", milliseconds: 0 },
        { stage: "translating", milliseconds: 480_000 },
        { stage: "finishing", milliseconds: 60_000 },
        { stage: "other", milliseconds: 0 },
      ],
    },
  };

  it("writes logged time with the task's step and the step it is costed as", () => {
    const time: LoggedTime = {
      rows: [
        {
          jobId: "job_1",
          jobTitle: "Release",
          projectId: "project_1",
          taskStep: "post_edit",
          step: "review",
          targetLocale: "fr-FR",
          minutes: 90,
          people: 2,
        },
      ],
      rowCount: 1,
      page: 1,
      pageSize: 50,
      totals: { minutes: 90, people: 2, tasks: 1 },
      previousMinutes: 0,
    };
    expect(loggedTimeCsv(time).split("\r\n")).toEqual([
      '"jobTitle","jobId","taskStep","step","targetLocale","minutes","people"',
      '"Release","job_1","post_edit","review","fr-FR","90","2"',
    ]);
  });

  it("writes time per step: logged by task step, task runs with every stage, workflow steps", () => {
    const logged: StepTime[] = [{ taskStep: "translate", minutes: 30, people: 1 }];
    expect(stepTimesCsv(logged, automated).split("\r\n")).toEqual([
      '"kind","name","minutes","people","runs"',
      '"logged","translate","30","1",""',
      '"task_runs","translation","10","","2"',
      '"task_run_stage","preparing","1","","2"',
      '"task_run_stage","reusing_memory","0","","2"',
      '"task_run_stage","translating","8","","2"',
      '"task_run_stage","finishing","1","","2"',
      '"task_run_stage","other","0","","2"',
      '"workflow_step","action.http","2","","3"',
    ]);
    // No task runs, no rows for them.
    const none = { ...automated, taskRuns: { ...automated.taskRuns, runs: 0, milliseconds: 0 } };
    expect(stepTimesCsv([], none).split("\r\n")).toEqual([
      '"kind","name","minutes","people","runs"',
      '"workflow_step","action.http","2","","3"',
    ]);
  });
});

describe("task words CSV", () => {
  it("lists the step's languages with their pricing, and a fixed fee as a row of its own", () => {
    const words = {
      rows: [
        {
          targetLocale: "de-DE",
          step: "review" as const,
          bands: { new: 10 },
          total: 10,
          finished: 4,
        },
        {
          targetLocale: "fr-FR",
          step: "review" as const,
          bands: { new: 6 },
          total: 6,
          finished: 6,
        },
        {
          targetLocale: "de-DE",
          step: "translation" as const,
          bands: { new: 99 },
          total: 99,
          finished: 0,
        },
      ],
    };
    const estimate = {
      rows: [
        row("de-DE", { pricing: "fixed", rateCardName: null, weighted: null, costUsd: null }),
        row("fr-FR", { pricing: "none", weighted: null, costUsd: null }),
      ],
      fixedFees: [
        { jobId: "job_1", jobTitle: "Release", step: "review", amountUsd: "250.00000000" },
      ],
    } as unknown as CostEstimate;
    expect(taskWordsCsv(words, estimate, "review").split("\r\n")).toEqual([
      '"targetLocale","new","total","finished","weighted","costUsd","pricing"',
      '"de-DE","10","10","4","","","fixed"',
      '"fr-FR","6","6","6","","","none"',
      '"","","","","","250.00","fixed"',
    ]);
    // Without money, no weighted units, cost or pricing.
    expect(taskWordsCsv(words, null, "translation").split("\r\n")).toEqual([
      '"targetLocale","new","total","finished"',
      '"de-DE","99","99","0"',
    ]);
  });
});

describe("AI usage CSV", () => {
  const group = (key: string | null, label: string | null, calls: number): AiUsageGroup => ({
    key,
    label,
    calls,
    inputTokens: calls * 10,
    outputTokens: calls,
    cacheAndReasoningTokens: 0,
    images: 0,
    videos: 0,
    chargeUsd: "0.50000000",
    unrecordedCharges: 0,
    ownKeyCalls: 0,
  });
  const usage = (thenBy: AiUsage["thenBy"]): AiUsage => ({
    period: resolvePeriod({ today: "2026-10-27", startedDay: null }),
    groupBy: "task",
    thenBy,
    totals: group(null, null, 3),
    previous: group(null, null, 0),
    rows: [
      {
        ...group("job_1", "Homepage", 3),
        children: thenBy ? [group("openai/gpt-6", null, 2), group(null, null, 1)] : [],
      },
    ],
    totalGroups: 1,
    page: 1,
    pageSize: 50,
    series: { groups: [], points: [] },
    automationName: null,
  });

  it("writes a line per group, or per group of the second detail", () => {
    expect(aiUsageCsv(usage(null)).split("\r\n")).toEqual([
      '"jobId","jobTitle","calls","inputTokens","outputTokens","cacheAndReasoningTokens","images","videos","chargeUsd","unrecordedCharges","ownKeyCalls"',
      '"job_1","Homepage","3","30","3","0","0","0","0.50000000","0","0"',
    ]);
    expect(aiUsageCsv(usage("model")).split("\r\n").slice(1)).toEqual([
      '"job_1","Homepage","openai/gpt-6","2","20","2","0","0","0","0.50000000","0","0"',
      '"job_1","Homepage","","1","10","1","0","0","0","0.50000000","0","0"',
    ]);
  });
});
