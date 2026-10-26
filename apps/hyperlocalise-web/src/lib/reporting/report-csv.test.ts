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
import { aiUsageCsv, taskWordsCsv } from "./report-csv";

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
