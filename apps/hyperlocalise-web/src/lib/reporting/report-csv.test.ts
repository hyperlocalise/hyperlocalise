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

import type { CostEstimate, CostEstimateRow } from "./cost-queries";
import { taskWordsCsv } from "./report-csv";

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
