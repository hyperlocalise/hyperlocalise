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
import type { AiUsage, AiUsageTotals } from "@/lib/reporting/ai-usage";
import type { BudgetRow, CostEstimate, Costs } from "@/lib/reporting/cost-queries";
import type { RateCard } from "@/lib/reporting/rate-cards";
import { resolvePeriod } from "@/lib/reporting/report-period";
import type { AutomatedTime, LoggedTime, StepTime } from "@/lib/reporting/time-queries";
import type { ActivityTotals, FinishedSeriesPoint, WordCounts } from "@/lib/reporting/word-queries";

import type { ReportSettings, TaskReport } from "./reports-queries";

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
  abandoned: 1_200,
  finished: 389_450,
  reviewed: 159_675,
  uncounted: 0,
  finishedByPerson: 72_400,
  finishedUnchanged: 31_900,
  finishedBySource: { memory: 101_200, ai: 198_350, person: 72_400, import: 0, unknown: 0 },
};
const previous: ActivityTotals = {
  source: 43_045,
  arrived: 378_807,
  arrivedDone: 310_620,
  abandoned: 0,
  finished: 330_042,
  reviewed: 145_216,
  uncounted: 0,
  finishedByPerson: 61_300,
  finishedUnchanged: 24_520,
  finishedBySource: { memory: 94_900, ai: 173_842, person: 61_300, import: 0, unknown: 0 },
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
    memory: 3_100 + ((index * 149) % 1_200),
    ai: 6_700 + ((index * 613) % 3_000),
    person: 1_400 + ((index * 271) % 1_900),
    import: 0,
    unknown: 0,
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

const aiTotals = (
  calls: number,
  inputTokens: number,
  outputTokens: number,
  more: Partial<AiUsageTotals> = {},
): AiUsageTotals => ({
  calls,
  inputTokens,
  outputTokens,
  cacheAndReasoningTokens: 0,
  images: 0,
  videos: 0,
  chargeUsd: "0.00000000",
  unrecordedCharges: 0,
  ownKeyCalls: 0,
  ...more,
});

export const reportsAiUsage: AiUsage = {
  period: reportsPeriod,
  groupBy: "area",
  thenBy: "model",
  totals: aiTotals(2_400, 19_800_000, 4_200_000, {
    images: 84,
    videos: 6,
    chargeUsd: "41.25000000",
    unrecordedCharges: 3,
    ownKeyCalls: 260,
  }),
  previous: aiTotals(2_050, 17_100_000, 3_600_000, { images: 70, chargeUsd: "36.10000000" }),
  rows: [
    {
      key: "translation",
      label: null,
      ...aiTotals(2_140, 18_400_000, 3_900_000, {
        chargeUsd: "38.40000000",
        unrecordedCharges: 3,
      }),
      children: [
        {
          key: "openai/gpt-6-luna",
          label: null,
          ...aiTotals(2_140, 18_400_000, 3_900_000, {
            chargeUsd: "38.40000000",
            unrecordedCharges: 3,
          }),
        },
      ],
    },
    {
      key: "assistants_and_chat",
      label: null,
      ...aiTotals(260, 1_400_000, 300_000, { ownKeyCalls: 260 }),
      children: [
        {
          key: "anthropic/claude-haiku-4.5",
          label: null,
          ...aiTotals(260, 1_400_000, 300_000, { ownKeyCalls: 260 }),
        },
      ],
    },
    {
      key: "images_and_video",
      label: null,
      ...aiTotals(0, 0, 0, { images: 84, videos: 6, chargeUsd: "2.85000000" }),
      children: [
        {
          key: "google/imagen-5",
          label: null,
          ...aiTotals(0, 0, 0, { images: 84, videos: 6, chargeUsd: "2.85000000" }),
        },
      ],
    },
  ],
  totalGroups: 3,
  page: 1,
  pageSize: 50,
  series: {
    groups: [
      { key: "translation", label: null, other: false },
      { key: "assistants_and_chat", label: null, other: false },
    ],
    points: Array.from({ length: 28 }, (_, index) => ({
      start: new Date(Date.parse(`${reportsPeriod.from}T00:00:00Z`) + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      calls: [70 + ((index * 13) % 20), 8 + (index % 5)],
      tokens: [650_000 + ((index * 61_300) % 200_000), 45_000 + ((index * 7_100) % 20_000)],
      chargeUsd: [1.2 + ((index * 17) % 30) / 100, 0],
    })),
  },
  automationName: null,
};

export function createReportsWordCounts(overrides: Partial<WordCounts> = {}): WordCounts & {
  period: typeof reportsPeriod;
} {
  return {
    period: reportsPeriod,
    rows: [
      {
        week: null,
        projectId: "project_web",
        projectName: "Web app",
        jobId: null,
        jobTitle: null,
        targetLocale: "de-DE",
        bands: { "100": 4_000, new: 14_420 },
        total: 18_420,
      },
      {
        week: null,
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
        week: null,
        projectId: "project_help",
        projectName: "Help centre",
        jobId: "job_billing",
        jobTitle: "Help centre: billing articles",
        targetLocale: "fr-FR",
        bands: { repetition: 2_000, new: 18_980 },
        total: 20_980,
      },
      {
        week: null,
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
      aiOnTasksUsd: "540.40000000",
      aiOutsideTasksUsd: "72.00000000",
      totalUsd: "4022.40000000",
    },
  ],
  outsideProjects: {
    aiUsd: "18.20000000",
    aiOnTasksUsd: "0.00000000",
    aiOutsideTasksUsd: "18.20000000",
  },
  totals: {
    peopleUsd: "3410.00000000",
    aiUsd: "630.60000000",
    aiOnTasksUsd: "540.40000000",
    aiOutsideTasksUsd: "90.20000000",
    totalUsd: "4040.60000000",
  },
  previousTotalUsd: "3800.00000000",
  unpriced: 0,
  pendingAi: 0,
};

export const reportsCostEstimate: CostEstimate = {
  rateCardName: "Standard 2026",
  pricingOrder: "task's rate card, then the project budget's rate card, then the chosen card",
  rows: [
    {
      targetLocale: "de-DE",
      step: "translation",
      pricing: "rate",
      // The Web app budget's card.
      pricedBy: ["budget"],
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
      // Help centre's task: its budget has no card, and the chosen card has no fr-FR rate.
      targetLocale: "fr-FR",
      step: "translation",
      pricing: "none",
      pricedBy: ["chosen"],
      rateCardName: "Standard 2026",
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
    unavailableUnits: 0,
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
/** The Release task's own report, priced by its own Standard 2026 card on translation. */
export const reportsTaskReport: TaskReport = {
  task: {
    id: "job_release",
    title: "Release 4.2 strings",
    kind: "translation",
    status: "waiting_for_review",
    projectId: "project_web",
    createdAt: "2026-10-14T09:00:00.000Z",
    sourceLocale: "en",
    targetLocales: ["de-DE", "ja-JP"],
  },
  unit: "words",
  step: "translation",
  words: {
    rows: [
      {
        targetLocale: "de-DE",
        step: "translation",
        bands: { "100": 1_200, new: 3_245 },
        total: 4_445,
        finished: 4_100,
      },
      {
        targetLocale: "ja-JP",
        step: "translation",
        bands: { "100": 1_200, new: 3_245 },
        total: 4_445,
        finished: 3_500,
      },
      {
        targetLocale: "de-DE",
        step: "review",
        bands: { new: 4_100 },
        total: 4_100,
        finished: 2_000,
      },
    ],
    totals: {
      translation: { source: 4_445, arrived: 8_890, arrivedDone: 7_600, uncounted: 0 },
      review: { source: 4_100, arrived: 4_100, arrivedDone: 2_000, uncounted: 0 },
    },
  },
  estimate: {
    ...reportsCostEstimate,
    rows: [
      {
        ...reportsCostEstimate.rows[0],
        pricedBy: ["task"],
        bands: { "100": 1_200, new: 3_245 },
        units: 4_445,
        weighted: 3_605,
        costUsd: "432.60000000",
      },
      {
        ...reportsCostEstimate.rows[1],
        targetLocale: "ja-JP",
        pricedBy: ["task"],
        bands: { "100": 1_200, new: 3_245 },
        units: 4_445,
      },
    ],
    totals: {
      ...reportsCostEstimate.totals,
      bands: { "100": 2_400, new: 6_490 },
      units: 8_890,
      weighted: 3_605,
      costUsd: "432.60000000",
      unpricedUnits: 4_445,
      tasks: 1,
      languages: 2,
    },
  },
  stillToCome: { amountUsd: "41.04000000", incomplete: true },
  time: {
    minutes: 450,
    people: 2,
    entries: [
      {
        id: "time_mina",
        person: "Mina Sato",
        step: "translation",
        targetLocale: "ja-JP",
        workDate: "2026-10-20T00:00:00.000Z",
        minutes: 150,
        note: "Checked UI length limits",
        own: true,
        canEdit: true,
      },
      {
        id: "time_lukas",
        person: "Lukas Brandt",
        step: "translation",
        targetLocale: "de-DE",
        workDate: "2026-10-16T00:00:00.000Z",
        minutes: 300,
        note: null,
        own: false,
        canEdit: true,
      },
    ],
  },
  canLogTime: true,
  pricing: [
    {
      step: "translation",
      rateCardName: "Standard 2026",
      pricedAt: "2026-10-14T09:00:00.000Z",
      estimatedMinutes: null,
      overrideUsd: null,
      locked: true,
    },
    {
      step: "review",
      rateCardName: null,
      pricedAt: null,
      estimatedMinutes: 240,
      overrideUsd: null,
      locked: false,
    },
  ],
  canSetPricing: true,
};

/** The task's report as a role that sees no money gets it: no cost, no pricing, own time only. */
function memberTaskReport(): TaskReport {
  return {
    ...reportsTaskReport,
    words: null,
    estimate: null,
    stillToCome: null,
    pricing: null,
    canSetPricing: false,
    time: {
      ...reportsTaskReport.time,
      entries: reportsTaskReport.time.entries
        .filter((entry) => entry.own)
        .map((entry) => ({ ...entry, canEdit: true })),
    },
  };
}

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
    time: {
      time: settings.financial ? reportsLoggedTime : { ...reportsLoggedTime, automated: null },
    },
    costs: { costs: reportsCosts },
    "cost-estimate": { costEstimate: { ...reportsCostEstimate, unit: "words" as const } },
    budgets: { budgets: reportsBudgets },
    "rate-cards": { rateCards: reportsRateCards, canManage: settings.canManage },
    jobs: { jobs: reportsTasks },
    "task-report": { taskReport: settings.financial ? reportsTaskReport : memberTaskReport() },
    // The task's analysis is done; a test sets a pending or failed step itself.
    "task-analysis": { analysis: [] },
    "task-rates": { taskRate: {} },
    "time-entry": { timeEntry: { id: "time_mina" } },
  };
}

export type ReportsEndpoint = keyof ReturnType<typeof reportsResponseBodies>;

export type ReportsApiCall = {
  endpoint: string;
  method: "get" | "put" | "post" | "patch" | "delete";
  args: { query?: Record<string, string>; json?: unknown; param?: Record<string, string> };
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
  "task-rates",
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
      $patch: answer("patch"),
      $delete: answer("delete"),
      $url: () => new URL(`http://localhost/${name}.csv`),
    };
  };
  const reports: Record<string, unknown> = Object.fromEntries(
    ENDPOINTS.map((name) => [name, endpoint(name)]),
  );
  reports.tasks = {
    ":jobId": { report: endpoint("task-report"), analysis: endpoint("task-analysis") },
  };
  reports["time-entries"] = { ...endpoint("time-entries"), ":id": endpoint("time-entry") };
  return { api: { orgs: { ":organizationSlug": { reports } } } };
}
