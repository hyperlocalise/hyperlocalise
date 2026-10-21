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
import type { AiUsage } from "@/lib/reporting/ai-usage";
import type { BudgetRow, CostEstimate, Costs } from "@/lib/reporting/cost-queries";
import type { RateCard } from "@/lib/reporting/rate-cards";
import { resolvePeriod } from "@/lib/reporting/report-period";
import type { AutomatedTime, LoggedTime, StepTime } from "@/lib/reporting/time-queries";
import type { ActivityTotals, FinishedSeriesPoint, WordCounts } from "@/lib/reporting/word-queries";

import type { ReportSettings } from "./reports-queries";

/** Sample Reports data for component tests, Storybook and its MSW handlers. */

export const reportsOrganizationSlug = "acme";
export const reportsToday = "2026-10-21";

export const reportsPeriod = resolvePeriod({ today: reportsToday, startedDay: "2026-03-03" });

function defaultReportsSettings(): ReportSettings {
  return {
    projects: [
      { id: "project_web", name: "Web app", sourceLocale: "en", targetLocales: ["de-DE", "ja-JP"] },
      { id: "project_help", name: "Help centre", sourceLocale: "en", targetLocales: ["fr-FR"] },
    ],
    startedAt: "2026-03-03T09:00:00.000Z",
    startedDay: "2026-03-03",
    today: reportsToday,
    canLogTime: true,
    summary: { pendingDays: 0, oldestMarkedAt: null },
    rates: [],
    budgets: [],
    rateCardNames: ["Standard 2026", "Agency B"],
    financial: true,
    canManage: true,
  };
}

export function createReportsSettings(overrides: Partial<ReportSettings> = {}): ReportSettings {
  // Settings differ by role; a test sets the fields of the role it needs.
  return { ...defaultReportsSettings(), ...overrides } as ReportSettings;
}

const current: ActivityTotals = {
  source: 48_210,
  arrived: 412_900,
  arrivedDone: 355_094,
  finished: 389_450,
  reviewed: 159_675,
  uncounted: 0,
};
const previous: ActivityTotals = {
  source: 43_045,
  arrived: 378_807,
  arrivedDone: 310_620,
  finished: 330_042,
  reviewed: 145_216,
  uncounted: 0,
};

export const reportsActivity = {
  period: reportsPeriod,
  unit: "words" as const,
  step: "translation" as const,
  current,
  previous,
  series: Array.from({ length: 28 }, (_, index): FinishedSeriesPoint => ({
    start: new Date(Date.parse(`${reportsPeriod.from}T00:00:00Z`) + index * 86_400_000)
      .toISOString()
      .slice(0, 10),
    people: 1_400 + ((index * 271) % 1_900),
    automatic: 9_800 + ((index * 613) % 4_200),
  })),
  byLanguage: [
    { targetLocale: "de-DE", units: 98_420 },
    { targetLocale: "ja-JP", units: 48_150 },
    { targetLocale: "fr-FR", units: 39_270 },
  ],
};

export const reportsStepTimes: {
  period: typeof reportsPeriod;
  logged: StepTime[];
  automated: AutomatedTime;
} = {
  period: reportsPeriod,
  logged: [
    { step: "translation", minutes: 2_490, people: 5 },
    { step: "review", minutes: 1_380, people: 3 },
  ],
  automated: {
    workflowSteps: [{ nodeType: "action.http", milliseconds: 1_260_000, runs: 980 }],
    taskRuns: { milliseconds: 22_320_000, runs: 212 },
  },
};

export const reportsAiUsage: { period: typeof reportsPeriod } & AiUsage = {
  period: reportsPeriod,
  byOrigin: [
    {
      origin: "translation",
      calls: 2_140,
      inputTokens: 18_400_000,
      outputTokens: 3_900_000,
      images: 0,
      videos: 0,
      models: ["gpt-6-luna"],
      channels: ["api", "app"],
    },
    {
      origin: "images_and_video",
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      images: 84,
      videos: 6,
      models: [],
      channels: ["app"],
    },
  ],
  byModel: [
    {
      model: "gpt-6-luna",
      calls: 2_140,
      inputTokens: 18_400_000,
      outputTokens: 3_900_000,
      images: 0,
      videos: 0,
      origins: ["translation"],
    },
  ],
  totals: { calls: 2_140, inputTokens: 18_400_000, outputTokens: 3_900_000, images: 84, videos: 6 },
};

export function createReportsWordCounts(overrides: Partial<WordCounts> = {}): WordCounts & {
  period: typeof reportsPeriod;
} {
  return {
    period: reportsPeriod,
    rows: [
      {
        projectId: "project_web",
        projectName: "Web app",
        jobId: null,
        jobTitle: null,
        targetLocale: "de-DE",
        bands: { "100": 4_000, new: 14_420 },
        total: 18_420,
      },
      {
        projectId: "project_help",
        projectName: "Help centre",
        jobId: null,
        jobTitle: null,
        targetLocale: "fr-FR",
        bands: { repetition: 2_000, new: 37_870 },
        total: 39_870,
      },
    ],
    bandTotals: { repetition: 2_000, "100": 4_000, new: 52_290 },
    total: 58_290,
    uncounted: 0,
    groupCount: 2,
    page: 1,
    pageSize: 2,
    ...overrides,
  };
}

/** Word counts grouped by task, one row per task and language. */
export function createReportsTaskWordCounts() {
  return createReportsWordCounts({
    rows: [
      {
        projectId: "project_help",
        projectName: "Help centre",
        jobId: "job_billing",
        jobTitle: "Help centre: billing articles",
        targetLocale: "fr-FR",
        bands: { repetition: 2_000, new: 18_980 },
        total: 20_980,
      },
      {
        projectId: "project_web",
        projectName: "Web app",
        jobId: null,
        jobTitle: null,
        targetLocale: "de-DE",
        bands: { new: 1_200 },
        total: 1_200,
      },
    ],
    bandTotals: { repetition: 2_000, new: 20_180 },
    total: 22_180,
    groupCount: 2,
    pageSize: 50,
  });
}

export const reportsLoggedTime: {
  period: typeof reportsPeriod;
  logged: LoggedTime;
  automated: AutomatedTime;
} = {
  period: reportsPeriod,
  logged: {
    rows: [
      {
        jobId: "job_release",
        jobTitle: "Release 4.2 strings",
        projectId: "project_web",
        step: "translation",
        targetLocale: "ja-JP",
        minutes: 555,
        people: 1,
      },
    ],
    rowCount: 1,
    page: 1,
    pageSize: 50,
    totals: { minutes: 3_870, people: 7, tasks: 18 },
    previousMinutes: 4_200,
  },
  automated: reportsStepTimes.automated,
};

export const reportsCosts: { period: typeof reportsPeriod } & Costs = {
  period: reportsPeriod,
  rows: [
    {
      projectId: "project_web",
      projectName: "Web app",
      peopleUsd: "3410.00000000",
      aiUsd: "612.40000000",
      expensesUsd: "0.00000000",
      totalUsd: "4022.40000000",
    },
  ],
  totals: {
    peopleUsd: "3410.00000000",
    aiUsd: "612.40000000",
    expensesUsd: "0.00000000",
    totalUsd: "4022.40000000",
  },
  previousTotalUsd: "3800.00000000",
  unpriced: 0,
  pendingAi: 0,
};

export const reportsCostEstimate: CostEstimate = {
  rateCardName: "Standard 2026",
  pricingOrder: "task rate, then the project budget's rate card, then the chosen card",
  rows: [
    {
      targetLocale: "de-DE",
      step: "translation",
      pricing: "rate",
      rateCardName: "Standard 2026",
      rateId: "rate_de",
      basis: "word",
      rate: "0.12000000",
      percentages: { "100": 30 },
      bands: { "100": 4_000, new: 10_120 },
      units: 14_120,
      weighted: 11_320,
      costUsd: "1358.40000000",
      unestimated: false,
      uncounted: 0,
    },
    {
      targetLocale: "ko-KR",
      step: "translation",
      pricing: "none",
      rateCardName: null,
      rateId: null,
      basis: null,
      rate: null,
      percentages: null,
      bands: { new: 8_270 },
      units: 8_270,
      weighted: null,
      costUsd: null,
      unestimated: false,
      uncounted: 0,
    },
  ],
  fixedFees: [],
  fixedFeesLeftOut: 0,
  totals: {
    bands: { "100": 4_000, new: 18_390 },
    units: 22_390,
    weighted: 11_320,
    weightedBasis: "word",
    costUsd: "1358.40000000",
    unpricedUnits: 8_270,
    uncounted: 0,
    memorySavings: 0.2,
    tasks: 3,
    languages: 2,
    incomplete: true,
  },
};

export const reportsBudgets: BudgetRow[] = [
  {
    projectId: "project_web",
    projectName: "Web app",
    budgetUsd: "20000.00000000",
    rateCardName: "Standard 2026",
    spentUsd: "12480.00000000",
    stillToComeUsd: "3260.00000000",
    forecastUsd: "15740.00000000",
    remainingUsd: "7520.00000000",
    status: "on_track",
    incomplete: false,
    unpriced: 0,
    pendingAi: 0,
  },
  {
    projectId: "project_help",
    projectName: "Help centre",
    budgetUsd: "5000.00000000",
    rateCardName: null,
    spentUsd: "4880.00000000",
    stillToComeUsd: "900.00000000",
    forecastUsd: "5780.00000000",
    remainingUsd: "120.00000000",
    status: "forecast_over",
    incomplete: true,
    unpriced: 0,
    pendingAi: 0,
  },
];

export const reportsRateCards: RateCard[] = [
  {
    name: "Standard 2026",
    defaultBasis: "word",
    lines: [
      {
        id: "rate_de",
        sourceLocale: "en",
        targetLocale: "de-DE",
        step: "translation",
        basis: "word",
        rate: "0.12000000",
        percentages: { "100": 30, repetition: 20 },
      },
      {
        id: "rate_review",
        sourceLocale: "en",
        targetLocale: "de-DE",
        step: "review",
        basis: "hour",
        rate: "45.00000000",
        percentages: {},
      },
    ],
  },
  { name: "Agency B", defaultBasis: "character", lines: [] },
];

export const reportsTasks = [
  {
    id: "job_release",
    title: "Release 4.2 strings",
    projectId: "project_web",
    status: "running",
    createdAt: "2026-10-14T09:00:00.000Z",
  },
  {
    id: "job_billing",
    title: "Help centre: billing articles",
    projectId: "project_help",
    status: "queued",
    createdAt: "2026-10-09T09:00:00.000Z",
  },
];

/** The JSON body each Reports endpoint answers with, keyed by endpoint. */
export function reportsResponseBodies(settings = createReportsSettings()) {
  return {
    settings: { settings },
    activity: { activity: reportsActivity },
    "step-times": { stepTimes: reportsStepTimes },
    "ai-usage": { aiUsage: reportsAiUsage },
    words: {
      wordCounts: {
        unit: "words",
        step: "translation",
        mode: "arrived",
        groupBy: "project",
        ...createReportsWordCounts(),
      },
    },
    time: { time: reportsLoggedTime },
    costs: { costs: reportsCosts },
    "cost-estimate": { costEstimate: { ...reportsCostEstimate, unit: "words" as const } },
    budgets: { budgets: reportsBudgets },
    "rate-cards": { rateCards: reportsRateCards, canManage: settings.canManage },
    jobs: { jobs: reportsTasks },
  };
}

export type ReportsEndpoint = keyof ReturnType<typeof reportsResponseBodies>;

export type ReportsApiCall = {
  endpoint: string;
  method: "get" | "put" | "post";
  args: { query?: Record<string, string>; json?: unknown };
};

/** What a stand-in API client answers with, and the calls it received. */
export type ReportsApiState = {
  calls: ReportsApiCall[];
  bodies: Record<string, unknown>;
  /** A status per endpoint, for failures; 200 otherwise. */
  statuses?: Record<string, number>;
};

const ENDPOINTS = [
  "settings",
  "activity",
  "step-times",
  "ai-usage",
  "words",
  "time",
  "costs",
  "cost-estimate",
  "budgets",
  "rate-cards",
  "jobs",
  "time-entries",
  "expenses",
] as const;

/** A stand-in for the typed API client's Reports routes, for component tests. */
export function reportsApiClient(state: ReportsApiState) {
  const endpoint = (name: string) => {
    const answer = (method: ReportsApiCall["method"]) => async (args: ReportsApiCall["args"]) => {
      state.calls.push({ endpoint: name, method, args });
      return new Response(JSON.stringify(state.bodies[name] ?? {}), {
        status: state.statuses?.[name] ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    return {
      $get: answer("get"),
      $put: answer("put"),
      $post: answer("post"),
      $url: () => new URL(`http://localhost/${name}.csv`),
    };
  };
  return {
    api: {
      orgs: {
        ":organizationSlug": {
          reports: Object.fromEntries(ENDPOINTS.map((name) => [name, endpoint(name)])),
        },
      },
    },
  };
}
