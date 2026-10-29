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
import type { AiUsageDimension } from "@/lib/reporting/ai-usage-origins";
import type {
  RateBasis,
  ReportStep,
  ReportUnit,
  TaskAnalysisStatus,
  TaskRunStage,
  TaskStep,
  WordCountInterval,
  WordCountSplit,
  WordTaskStep,
} from "@/lib/reporting/report-units";
import type { MatchBucket } from "@/lib/reporting/word-analysis";

import type { GoSvcDownload, GoSvcRequestOptions } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

/*
 * The Reports page's routes in go-svc, `/v1/orgs/{slug}/reports/...`. The answers below are what
 * the Go routes write, field for field; the query fields are the page's, as strings.
 */

/** A query as the page builds it: every value already a string, unset ones left out. */
export type ReportQuery = Record<string, string>;

export type ReportPeriod = {
  from: string;
  to: string;
  days: number;
  previousFrom: string;
  previousTo: string;
  interval: "day" | "week";
  hasEarlierData: boolean;
};

export type ReportSummaryFreshness = { pendingDays: number; oldestMarkedAt: string | null };

export type ReportProject = {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[];
};

/** The page's settings: what the viewer may see and do, and the dates Reports can cover. */
export type ReportSettings = {
  rateCardNames: string[];
  /** Whether the viewer sees money: admins and localization managers do. */
  financial: boolean;
  canManage: boolean;
  projects: ReportProject[];
  startedAt: string | null;
  startedDay: string | null;
  today: string;
  canLogTime: boolean;
  summary: ReportSummaryFreshness;
};

export type ReportTask = {
  id: string;
  title: string;
  projectId: string | null;
  status: string;
  createdAt: string;
};

export type ReportSourceCounts = {
  import: number;
  memory: number;
  ai: number;
  person: number;
  unknown: number;
};

export type ActivityTotals = {
  source: number;
  arrived: number;
  arrivedDone: number;
  abandoned: number;
  finished: number;
  reviewed: number;
  uncounted: number;
  finishedByPerson: number;
  finishedUnchanged: number;
  finishedBySource: ReportSourceCounts;
};

export type ActivityReport = {
  series: ({ start: string } & ReportSourceCounts)[];
  byLanguage: { targetLocale: string; units: number }[];
  current: ActivityTotals;
  previous: ActivityTotals;
  period: ReportPeriod;
  unit: ReportUnit;
  step: ReportStep;
};

export type AutomatedTime = {
  workflowSteps: { nodeType: string; milliseconds: number; runs: number }[];
  taskRuns: {
    milliseconds: number;
    runs: number;
    stages: { stage: TaskRunStage; milliseconds: number }[];
  };
};

export type StepTimesReport = {
  period: ReportPeriod;
  logged: { taskStep: TaskStep; minutes: number; people: number }[];
  automated: AutomatedTime;
};

export type AiUsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheAndReasoningTokens: number;
  images: number;
  videos: number;
  chargeUsd: string;
  unrecordedCharges: number;
  ownKeyCalls: number;
};

export type AiUsageGroup = AiUsageTotals & {
  key: string | null;
  label: string | null;
  other?: boolean;
};

export type AiUsageReport = {
  period: ReportPeriod;
  groupBy: AiUsageDimension;
  thenBy: AiUsageDimension | null;
  totals: AiUsageTotals;
  previous: AiUsageTotals;
  rows: (AiUsageGroup & { children: AiUsageGroup[] })[];
  totalGroups: number;
  page: number;
  pageSize: number;
  series: {
    groups: { key: string | null; label: string | null; other: boolean }[];
    points: { start: string; calls: number[]; tokens: number[]; chargeUsd: number[] }[];
  };
  automationName: string | null;
};

export type BandCounts = Partial<Record<MatchBucket, number>>;

export type WordCountRow = {
  week: string | null;
  projectId: string | null;
  projectName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  taskStep: WordTaskStep | null;
  targetLocale: string;
  bands: BandCounts;
  total: number;
};

export type WordCountsReport = {
  rows: WordCountRow[];
  bandTotals: BandCounts;
  total: number;
  uncounted: number;
  groupCount: number;
  page: number;
  pageSize: number;
  period: ReportPeriod;
  unit: ReportUnit;
  step: ReportStep;
  mode: "arrived" | "finished";
  groupBy: "project" | "week" | "task" | "language" | "task_step";
};

export type WordSeriesReport = {
  split: WordCountSplit;
  per: WordCountInterval;
  groups: { key: string | null; name: string | null; other: boolean }[];
  points: { start: string; units: number[] }[];
  period: ReportPeriod;
  unit: ReportUnit;
  step: ReportStep;
  mode: "arrived" | "finished";
};

export type LoggedTimeRow = {
  jobId: string;
  jobTitle: string | null;
  projectId: string;
  taskStep: TaskStep;
  step: ReportStep;
  targetLocale: string;
  minutes: number;
  people: number;
};

export type TimeReport = {
  period: ReportPeriod;
  logged: {
    rows: LoggedTimeRow[];
    rowCount: number;
    page: number;
    pageSize: number;
    totals: { minutes: number; people: number; tasks: number };
    previousMinutes: number;
  };
  /** Null for members who see only their own time. */
  automated: AutomatedTime | null;
};

export type CostRow = {
  projectId: string;
  projectName: string;
  peopleUsd: string;
  aiUsd: string | null;
  aiOnTasksUsd: string | null;
  aiOutsideTasksUsd: string | null;
  totalUsd: string;
};

export type CostsReport = {
  rows: CostRow[];
  outsideProjects: { aiUsd: string; aiOnTasksUsd: string; aiOutsideTasksUsd: string } | null;
  totals: Omit<CostRow, "projectId" | "projectName">;
  previousTotalUsd: string;
  unpriced: number;
  pendingAi: number;
  period: ReportPeriod;
};

/** How a language and step is priced: by a rate line, a task's fixed fee, or not at all. */
export type Pricing = "rate" | "fixed" | "none";
export type PricedBy = "task" | "budget" | "chosen";

export type CostEstimateRow = {
  targetLocale: string;
  step: ReportStep;
  pricing: Pricing;
  pricedBy: PricedBy[];
  rateCardName: string | null;
  rateId: string | null;
  basis: RateBasis | null;
  rate: string | null;
  percentages: BandCounts | null;
  bands: BandCounts;
  units: number;
  weighted: number | null;
  costUsd: string | null;
  unestimated: boolean;
  uncounted: number;
};

export type CostEstimateTotals = {
  bands: BandCounts;
  units: number;
  weighted: number | null;
  weightedBasis: RateBasis | null;
  costUsd: string;
  unpricedUnits: number;
  uncounted: number;
  unavailableUnits: number;
  memorySavings: number | null;
  tasks: number;
  languages: number;
  incomplete: boolean;
};

export type CostEstimate = {
  rateCardName: string | null;
  pricingOrder: string;
  rows: CostEstimateRow[];
  fixedFees: { jobId: string; amountUsd: string; step: ReportStep; jobTitle: string }[];
  fixedFeesLeftOut: number;
  totals: CostEstimateTotals;
};

export type CostEstimateReport = CostEstimate & { unit: ReportUnit };

export type BudgetStatus = "on_track" | "over_80" | "forecast_over" | "over_budget";

export type BudgetRow = {
  projectId: string;
  projectName: string;
  budgetUsd: string;
  rateCardName: string | null;
  spentUsd: string;
  stillToComeUsd: string;
  forecastUsd: string;
  remainingUsd: string;
  status: BudgetStatus;
  incomplete: boolean;
  unpriced: number;
  pendingAi: number;
};

export type RateLine = {
  id: string;
  sourceLocale: string;
  targetLocale: string;
  step: ReportStep;
  basis: RateBasis;
  rate: string;
  percentages: BandCounts;
};

export type RateCard = { name: string; defaultBasis: RateBasis; lines: RateLine[] };

export type RateCardsReport = { rateCards: RateCard[]; canManage: boolean };

export type RateCardBody = {
  name: string;
  defaultBasis?: RateBasis;
  lines: (Omit<RateLine, "id" | "percentages"> & { percentages?: BandCounts })[];
  /** Save as a new card; the name must not be taken. */
  create?: boolean;
};

export type TaskReportTask = {
  id: string;
  title: string;
  kind: "translation" | "research" | "review" | "proofread" | "sync" | "asset_management";
  status: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  projectId: string | null;
  createdAt: string;
  sourceLocale: string | null;
  targetLocales: string[];
};

export type TaskWordRow = {
  targetLocale: string;
  step: ReportStep;
  bands: BandCounts;
  total: number;
  finished: number;
};

export type TaskWordTotals = {
  source: number;
  arrived: number;
  arrivedDone: number;
  uncounted: number;
};

export type TaskTimeEntry = {
  own: boolean;
  canEdit: boolean;
  id: string;
  person: string | null;
  step: string;
  targetLocale: string;
  workDate: string;
  minutes: number;
  note: string | null;
};

export type TaskPricingStep = {
  step: ReportStep;
  rateCardName: string | null;
  pricedAt: string | null;
  estimatedMinutes: number | null;
  overrideUsd: string | null;
  locked: boolean;
};

/** One task's words, money, time and pricing, for its Report tab. */
export type TaskReport = {
  task: TaskReportTask;
  unit: ReportUnit;
  step: ReportStep;
  words: { rows: TaskWordRow[]; totals: Record<ReportStep, TaskWordTotals> } | null;
  estimate: CostEstimate | null;
  stillToCome: { amountUsd: string; incomplete: boolean } | null;
  time: { minutes: number; people: number; entries: TaskTimeEntry[] };
  canLogTime: boolean;
  pricing: TaskPricingStep[] | null;
  canSetPricing: boolean;
};

export type TaskAnalysisState = {
  step: ReportStep;
  status: TaskAnalysisStatus;
  incomplete: boolean;
  strings: number | null;
  error: string | null;
  updatedAt: string;
};

export type BudgetBody = { projectId: string; budget: string; rateCardName?: string | null };

export type SavedBudget = {
  id: string;
  createdAt: string;
  organizationId: string;
  projectId: string | null;
  budget: string;
  rateCardName: string | null;
};

export type TaskRateBody = {
  jobId: string;
  step: ReportStep;
  rateCardName?: string | null;
  estimatedMinutes?: number | null;
  overrideUsd?: string | null;
};

export type SavedTaskRate = {
  id: string;
  createdAt: string;
  organizationId: string;
  jobId: string | null;
  step: ReportStep;
  rateCardName: string | null;
  pricedAt: string | null;
  rateId: string | null;
  estimatedMinutes: number | null;
  overrideUsd: string | null;
};

export type TimeEntryBody = {
  jobId: string;
  step: ReportStep;
  targetLocale: string;
  workDate: string;
  minutes: number;
  note?: string;
};

export type TimeEntryUpdateBody = Pick<TimeEntryBody, "workDate" | "minutes" | "note">;

/** The sections that download as CSV, with the same filters as on screen. */
export type ReportCsvSection =
  | "words"
  | "time"
  | "step-times"
  | "ai-usage"
  | "costs"
  | "cost-estimate"
  | "budgets";

export type ReportKind = "activity" | "words" | "time" | "ai" | "costs";

/** What the MCP `get_report` tool sends to the internal route, as a trusted server caller. */
export type InternalReportBody = {
  organizationId: string;
  userId: string;
  query: Record<string, string | number | boolean | undefined>;
};

export type InternalReport = {
  kind: ReportKind;
  summary: ReportSummaryFreshness;
  stillUpdating: boolean;
} & Record<string, unknown>;

export class GoSvcReportsApi {
  constructor(private readonly request: GoSvcRequest) {}

  settings(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ settings: ReportSettings }>(orgPath(organizationSlug, "reports", "settings"), options)
      .then((answer) => answer.settings);
  }

  /** Tasks with Reports data, for the task pickers: by search text, or the chosen ids. */
  tasks(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ jobs: ReportTask[] }>(orgPath(organizationSlug, "reports", "jobs"), {
        query,
        ...options,
      })
      .then((answer) => answer.jobs);
  }

  activity(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ activity: ActivityReport }>(orgPath(organizationSlug, "reports", "activity"), {
        query,
        ...options,
      })
      .then((answer) => answer.activity);
  }

  stepTimes(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ stepTimes: StepTimesReport }>(orgPath(organizationSlug, "reports", "step-times"), {
        query,
        ...options,
      })
      .then((answer) => answer.stepTimes);
  }

  aiUsage(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ aiUsage: AiUsageReport }>(orgPath(organizationSlug, "reports", "ai-usage"), {
        query,
        ...options,
      })
      .then((answer) => answer.aiUsage);
  }

  words(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ wordCounts: WordCountsReport }>(orgPath(organizationSlug, "reports", "words"), {
        query,
        ...options,
      })
      .then((answer) => answer.wordCounts);
  }

  wordSeries(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ wordSeries: WordSeriesReport }>(
        orgPath(organizationSlug, "reports", "words", "series"),
        { query, ...options },
      )
      .then((answer) => answer.wordSeries);
  }

  time(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ time: TimeReport }>(orgPath(organizationSlug, "reports", "time"), {
        query,
        ...options,
      })
      .then((answer) => answer.time);
  }

  costs(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ costs: CostsReport }>(orgPath(organizationSlug, "reports", "costs"), {
        query,
        ...options,
      })
      .then((answer) => answer.costs);
  }

  costEstimate(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ costEstimate: CostEstimateReport }>(
        orgPath(organizationSlug, "reports", "cost-estimate"),
        { query, ...options },
      )
      .then((answer) => answer.costEstimate);
  }

  budgets(organizationSlug: string, query: ReportQuery, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ budgets: BudgetRow[] }>(orgPath(organizationSlug, "reports", "budgets"), {
        query,
        ...options,
      })
      .then((answer) => answer.budgets);
  }

  rateCards(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<RateCardsReport>(
      orgPath(organizationSlug, "reports", "rate-cards"),
      options,
    );
  }

  taskReport(
    organizationSlug: string,
    jobId: string,
    query: ReportQuery,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request
      .json<{ taskReport: TaskReport }>(
        orgPath(organizationSlug, "reports", "tasks", jobId, "report"),
        { query, ...options },
      )
      .then((answer) => answer.taskReport);
  }

  taskAnalysis(organizationSlug: string, jobId: string, options: GoSvcRequestOptions = {}) {
    return this.request
      .json<{ analysis: TaskAnalysisState[] }>(
        orgPath(organizationSlug, "reports", "tasks", jobId, "analysis"),
        options,
      )
      .then((answer) => answer.analysis);
  }

  /** A section as CSV, with the same filters as on screen; the filename comes with it. */
  csv(
    organizationSlug: string,
    section: ReportCsvSection,
    query: ReportQuery,
  ): Promise<GoSvcDownload> {
    return this.request.download(orgPath(organizationSlug, "reports", section), {
      query: { ...query, format: "csv" },
    });
  }

  /** A task's words for one step as CSV. */
  taskReportCsv(
    organizationSlug: string,
    jobId: string,
    query: ReportQuery,
  ): Promise<GoSvcDownload> {
    return this.request.download(orgPath(organizationSlug, "reports", "tasks", jobId, "report"), {
      query: { ...query, format: "csv" },
    });
  }

  saveRateCard(organizationSlug: string, body: RateCardBody) {
    return this.request
      .json<{ rateCard: RateCard }>(orgPath(organizationSlug, "reports", "rate-cards"), {
        method: "PUT",
        body,
      })
      .then((answer) => answer.rateCard);
  }

  setBudget(organizationSlug: string, body: BudgetBody) {
    return this.request.json<{ budget: SavedBudget }>(
      orgPath(organizationSlug, "reports", "budgets"),
      { method: "PUT", body },
    );
  }

  /** Saves a task's own pricing for one step: its rate card, time estimate and fixed fee. */
  setTaskPricing(organizationSlug: string, body: TaskRateBody) {
    return this.request
      .json<{ taskRate: SavedTaskRate }>(orgPath(organizationSlug, "reports", "task-rates"), {
        method: "PUT",
        body,
      })
      .then((answer) => answer.taskRate);
  }

  logTime(organizationSlug: string, body: TimeEntryBody) {
    return this.request.json<{ timeEntry: { id: string } }>(
      orgPath(organizationSlug, "reports", "time-entries"),
      { method: "POST", body },
    );
  }

  editTime(organizationSlug: string, id: string, body: TimeEntryUpdateBody) {
    return this.request.json<{ timeEntry: { id: string } }>(
      orgPath(organizationSlug, "reports", "time-entries", id),
      { method: "PATCH", body },
    );
  }

  deleteTime(organizationSlug: string, id: string) {
    return this.request.empty(orgPath(organizationSlug, "reports", "time-entries", id), {
      method: "DELETE",
    });
  }

  /**
   * One of the page's reports for the member the caller names, with that member's own access:
   * the MCP `get_report` tool's read. Service authentication only.
   */
  internal(kind: ReportKind, body: InternalReportBody, options: GoSvcRequestOptions = {}) {
    return this.request.json<InternalReport>(`/internal/reports/${encodeURIComponent(kind)}`, {
      method: "POST",
      body,
      ...options,
    });
  }
}
