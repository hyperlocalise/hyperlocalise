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
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { ApiResponseError } from "@/lib/api-error";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import type {
  BudgetBody,
  RateCardBody,
  ReportCsvSection,
  ReportQuery,
  TaskRateBody,
  TimeEntryBody,
  TimeEntryUpdateBody,
} from "@/lib/go-svc/go-svc-reports-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import type { ReportStep, ReportUnit } from "@/lib/reporting/report-units";

import { reportsPageMessages as messages } from "./reports-page.messages";
import { presetDates, type ReportsUrlState } from "./reports-url-state";

export type {
  ReportSettings,
  ReportTask,
  TaskAnalysisState,
  TaskReport,
} from "@/lib/go-svc/go-svc-reports-api";

/** Loading for every section of the Reports page, through go-svc's Reports routes. */

/** How often a task's Report tab looks again while its strings are being counted. */
const COUNTING_POLL_MS = 5_000;

type Query = Record<string, string | undefined>;

/** A query without the parameters left unset. */
function compact(query: Query): ReportQuery {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

const optional = (value: string | null) => value ?? undefined;

/**
 * A request's failure as the dialogs read it: go-svc's code and message, or the fallback when
 * go-svc could not be reached. A cancelled request stays cancelled.
 */
async function reportRequest<T>(fallback: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    const code = error instanceof GoSvcClientError ? error.code : null;
    const status = error instanceof GoSvcClientError ? (error.status ?? 0) : 0;
    throw new ApiResponseError(goSvcErrorMessage(error, fallback), { code, status });
  }
}

/** Whether go-svc asked for the request again: Reports is busy, or the report took too long. */
function reportsBusy(error: unknown) {
  return error instanceof ApiResponseError && error.status === 503;
}

/**
 * Reads try again only when Reports is busy, and soon: go-svc runs a few reports at once and
 * answers 503 for the rest, so a section waits a moment rather than showing a failure, but a
 * report that failed for any other reason is not asked for three more times.
 */
const reportRetry = {
  retry: (failureCount: number, error: unknown) => reportsBusy(error) && failureCount < 2,
  retryDelay: (failureCount: number) => 1_000 * (failureCount + 1),
};

/** The UTC days the dates filter covers, inclusive. */
export function reportDates(state: ReportsUrlState, today: string, startedDay: string | null) {
  if (state.range === "custom" && state.from && state.to) {
    return state.from <= state.to
      ? { from: state.from, to: state.to }
      : { from: state.to, to: state.from };
  }
  return presetDates(state.range === "custom" ? "28" : state.range, today, startedDay);
}

export function reportsQueryKey(organizationSlug: string, ...parts: unknown[]) {
  return ["reports", organizationSlug, ...parts];
}

export function useReportSettings(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "settings"),
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.settings(organizationSlug, { signal }),
      ),
  });
}

/** What a section is filtered by: the page's state, with the dates worked out. */
export type SectionInput = {
  organizationSlug: string;
  state: ReportsUrlState;
  today: string;
  /** The day Reports started for the workspace, which "since Reports started" begins on. */
  startedDay: string | null;
};

function scope({ state, today, startedDay }: SectionInput) {
  return {
    ...reportDates(state, today, startedDay),
    projectId: optional(state.projectId),
    targetLocale: optional(state.targetLocale),
    jobId: optional(state.jobId),
  };
}

export function activityQuery(input: SectionInput) {
  return compact({ ...scope(input), step: input.state.step });
}

export function useActivityReport(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = activityQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "activity", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.activity(input.organizationSlug, query, { signal }),
      ),
  });
}

export function stepTimesQuery(input: SectionInput) {
  return compact(scope(input));
}

export function useStepTimes(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = stepTimesQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "step-times", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.stepTimes(input.organizationSlug, query, { signal }),
      ),
  });
}

export function aiUsageQuery(input: SectionInput) {
  const { state } = input;
  const { from, to, projectId, jobId } = scope(input);
  const { automation, ...filters } = state.aiFilters;
  return compact({
    from,
    to,
    projectId,
    jobId,
    automationId: automation,
    ...filters,
    groupBy: state.aiGroup,
    thenBy: optional(state.aiThen),
    // The chart's measure is also what the largest groups are by.
    rankBy: state.aiMeasure,
    page: String(state.page),
  });
}

export function useAiUsage(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = aiUsageQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "ai-usage", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.aiUsage(input.organizationSlug, query, { signal }),
      ),
  });
}

export function wordCountsQuery(input: SectionInput) {
  const { state } = input;
  return compact({
    ...scope(input),
    unit: state.unit,
    step: state.step,
    mode: state.mode,
    groupBy: state.groupBy,
    page: String(state.page),
  });
}

export function wordSeriesQuery(input: SectionInput) {
  const { state } = input;
  return compact({
    ...scope(input),
    unit: state.unit,
    step: state.step,
    mode: state.mode,
    split: state.split,
    per: optional(state.per),
  });
}

/** Word counts' volume chart, read apart from the table so changing the chart leaves it be. */
export function useWordSeries(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = wordSeriesQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "word-series", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.wordSeries(input.organizationSlug, query, { signal }),
      ),
  });
}

export function useWordCounts(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = wordCountsQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "words", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.words(input.organizationSlug, query, { signal }),
      ),
  });
}

export function loggedTimeQuery(input: SectionInput) {
  return compact({ ...scope(input), page: String(input.state.page) });
}

export function useLoggedTime(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = loggedTimeQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "time", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.time(input.organizationSlug, query, { signal }),
      ),
  });
}

export function costsQuery(input: SectionInput) {
  const { from, to, projectId, targetLocale } = scope(input);
  return compact({ from, to, projectId, targetLocale });
}

export function useCosts(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = costsQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "costs", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.costs(input.organizationSlug, query, { signal }),
      ),
  });
}

export function costEstimateQuery(input: SectionInput) {
  const { state } = input;
  return compact({
    projectId: optional(state.projectId),
    targetLocale: optional(state.targetLocale),
    jobIds: state.jobIds.join(","),
    unit: state.unit,
    rateCard: optional(state.rateCard),
  });
}

export function useCostEstimate(input: SectionInput) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = costEstimateQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "cost-estimate", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    // An estimate is for chosen tasks, or for the whole of one project.
    enabled: input.state.jobIds.length > 0 || Boolean(input.state.projectId),
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.costEstimate(input.organizationSlug, query, { signal }),
      ),
  });
}

export function budgetsQuery(projectId: string | null) {
  return compact({ projectId: optional(projectId) });
}

export function useBudgets(organizationSlug: string, projectId: string | null) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = budgetsQuery(projectId);
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "budgets", query),
    placeholderData: keepPreviousData,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.budgets(organizationSlug, query, { signal }),
      ),
  });
}

export function useRateCards(organizationSlug: string, enabled = true) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "rate-cards"),
    enabled,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.rateCards(organizationSlug, { signal }),
      ),
  });
}

/** What a task's Report tab shows: the unit, the step, and the card that prices last. */
export type TaskReportView = { unit: ReportUnit; step: ReportStep; rateCard: string | null };

export function taskReportQuery(view: TaskReportView) {
  return compact({ unit: view.unit, step: view.step, rateCard: optional(view.rateCard) });
}

/** How often a task's Report tab reads again while recorded strings are not yet in the summary. */
const RECORDED_POLL_MS = 30_000;

/** One task's words, money, time and pricing, for its Report tab. */
export function useTaskReport(
  organizationSlug: string,
  jobId: string,
  view: TaskReportView,
  enabled = true,
  /** Whether to read the report again in a while, given what it last answered. */
  recheck?: (report: { words: { rows: { step: string }[] } | null }) => boolean,
) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = taskReportQuery(view);
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "task-report", jobId, query),
    placeholderData: keepPreviousData,
    enabled,
    ...reportRetry,
    // The argument is typed here, since inferring it would make the data's type depend on itself.
    refetchInterval: (current: {
      state: { data?: { words: { rows: { step: string }[] } | null } };
    }) => (current.state.data && recheck?.(current.state.data) ? RECORDED_POLL_MS : false),
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.taskReport(organizationSlug, jobId, query, { signal }),
      ),
  });
}

/**
 * The state of a task's analysis per step, looked at again every few seconds while a step is
 * pending, so the Report tab can say its strings are being counted and read them once they are.
 */
export function useTaskAnalysis(organizationSlug: string, jobId: string, enabled = true) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "task-analysis", jobId),
    enabled,
    ...reportRetry,
    // The argument is typed here, since inferring it would make the data's type depend on itself.
    refetchInterval: (current: { state: { data?: { status: string }[] } }) =>
      current.state.data?.some((step) => step.status === "pending") ? COUNTING_POLL_MS : false,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.taskAnalysis(organizationSlug, jobId, { signal }),
      ),
  });
}

/** Tasks with Reports data, for the task pickers: by search text, or the chosen ids. */
export function useReportTasks(input: {
  organizationSlug: string;
  projectId: string | null;
  search?: string;
  ids?: string[];
  enabled?: boolean;
}) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const query = compact({
    projectId: optional(input.projectId),
    q: input.search ? input.search : undefined,
    ids: input.ids?.length ? input.ids.join(",") : undefined,
    limit: "50",
  });
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "jobs", query),
    placeholderData: keepPreviousData,
    enabled: input.enabled ?? true,
    ...reportRetry,
    queryFn: ({ signal }) =>
      reportRequest(intl.formatMessage(messages.loadFailed), () =>
        client.reports.tasks(input.organizationSlug, query, { signal }),
      ),
  });
}

/**
 * Downloads as CSV, with the same filters as on screen. go-svc takes a signed-in request only,
 * so a download is fetched and then saved, rather than linked to.
 */
export function useReportCsv(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const fallback = () => intl.formatMessage(messages.downloadFailed);
  return {
    section: (section: ReportCsvSection, query: ReportQuery) =>
      reportRequest(fallback(), () => client.reports.csv(organizationSlug, section, query)),
    taskReport: (jobId: string, view: TaskReportView) =>
      reportRequest(fallback(), () =>
        client.reports.taskReportCsv(organizationSlug, jobId, taskReportQuery(view)),
      ),
  };
}

/** Saving anything on the page reads every section again. */
function useInvalidateReports(organizationSlug: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: reportsQueryKey(organizationSlug) });
}

export function useSaveRateCard(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: (body: RateCardBody) =>
      reportRequest(intl.formatMessage(messages.saveFailed), () =>
        client.reports.saveRateCard(organizationSlug, body),
      ),
    onSuccess: invalidate,
  });
}

export function useLogTime(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: (body: TimeEntryBody) =>
      reportRequest(intl.formatMessage(messages.saveFailed), () =>
        client.reports.logTime(organizationSlug, body),
      ),
    onSuccess: invalidate,
  });
}

export function useSetBudget(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: (body: BudgetBody) =>
      reportRequest(intl.formatMessage(messages.saveFailed), () =>
        client.reports.setBudget(organizationSlug, body),
      ),
    onSuccess: invalidate,
  });
}

/** Saves a task's own pricing for one step: its rate card, time estimate and fixed fee. */
export function useSetTaskPricing(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: (body: TaskRateBody) =>
      reportRequest(intl.formatMessage(messages.saveFailed), () =>
        client.reports.setTaskPricing(organizationSlug, body),
      ),
    onSuccess: invalidate,
  });
}

export function useEditTime(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: ({ id, ...body }: TimeEntryUpdateBody & { id: string }) =>
      reportRequest(intl.formatMessage(messages.saveFailed), () =>
        client.reports.editTime(organizationSlug, id, body),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteTime(organizationSlug: string) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: (id: string) =>
      reportRequest(intl.formatMessage(messages.saveFailed), () =>
        client.reports.deleteTime(organizationSlug, id),
      ),
    onSuccess: invalidate,
  });
}
