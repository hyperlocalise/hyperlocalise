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

import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { addDays } from "@/lib/reporting/report-period";
import type { ReportStep, ReportUnit } from "@/lib/reporting/report-units";

import { reportsPageMessages as messages } from "./reports-page.messages";
import type { ReportsUrlState } from "./reports-url-state";

/** Loading for every section of the Reports page, through the typed API client. */

const reportsApi = () => apiClient.api.orgs[":organizationSlug"].reports;

type Query = Record<string, string | undefined>;

/** A query without the parameters left unset. */
function compact(query: Query): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

const optional = (value: string | null) => value ?? undefined;

/** The UTC days the dates filter covers, inclusive. */
export function reportDates(state: ReportsUrlState, today: string) {
  if (state.range === "custom" && state.from && state.to) {
    return state.from <= state.to
      ? { from: state.from, to: state.to }
      : { from: state.to, to: state.from };
  }
  const days = state.range === "custom" ? 28 : Number(state.range);
  return { from: addDays(today, -(days - 1)), to: today };
}

export function reportsQueryKey(organizationSlug: string, ...parts: unknown[]) {
  return ["reports", organizationSlug, ...parts];
}

export function useReportSettings(organizationSlug: string) {
  const intl = useIntl();
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "settings"),
    queryFn: async ({ signal }) => {
      const response = await reportsApi().settings.$get(
        { param: { organizationSlug } },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).settings;
    },
  });
}

export type ReportSettings = NonNullable<ReturnType<typeof useReportSettings>["data"]>;

/** What a section is filtered by: the page's state, with the dates worked out. */
export type SectionInput = {
  organizationSlug: string;
  state: ReportsUrlState;
  today: string;
};

function scope({ state, today }: SectionInput) {
  return {
    ...reportDates(state, today),
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
  const query = activityQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "activity", query),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await reportsApi().activity.$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).activity;
    },
  });
}

export function stepTimesQuery(input: SectionInput) {
  return compact(scope(input));
}

export function useStepTimes(input: SectionInput) {
  const intl = useIntl();
  const query = stepTimesQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "step-times", query),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await reportsApi()["step-times"].$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).stepTimes;
    },
  });
}

export function aiUsageQuery(input: SectionInput) {
  const { from, to, projectId } = scope(input);
  return compact({ from, to, projectId, groupBy: input.state.aiGroup });
}

export function useAiUsage(input: SectionInput) {
  const intl = useIntl();
  // Both groupings come in one response, so switching between them reads nothing again.
  const { groupBy: _groupBy, ...query } = aiUsageQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "ai-usage", query),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await reportsApi()["ai-usage"].$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).aiUsage;
    },
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

export function useWordCounts(input: SectionInput) {
  const intl = useIntl();
  const query = wordCountsQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "words", query),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await reportsApi().words.$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).wordCounts;
    },
  });
}

export function loggedTimeQuery(input: SectionInput) {
  return compact({ ...scope(input), page: String(input.state.page) });
}

export function useLoggedTime(input: SectionInput) {
  const intl = useIntl();
  const query = loggedTimeQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "time", query),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await reportsApi().time.$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).time;
    },
  });
}

export function costsQuery(input: SectionInput) {
  const { from, to, projectId, targetLocale } = scope(input);
  return compact({ from, to, projectId, targetLocale });
}

export function useCosts(input: SectionInput) {
  const intl = useIntl();
  const query = costsQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "costs", query),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await reportsApi().costs.$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).costs;
    },
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
  const query = costEstimateQuery(input);
  return useQuery({
    queryKey: reportsQueryKey(input.organizationSlug, "cost-estimate", query),
    placeholderData: keepPreviousData,
    // An estimate is for chosen tasks.
    enabled: input.state.jobIds.length > 0,
    queryFn: async ({ signal }) => {
      const response = await reportsApi()["cost-estimate"].$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).costEstimate;
    },
  });
}

export function budgetsQuery(projectId: string | null) {
  return compact({ projectId: optional(projectId) });
}

export function useBudgets(organizationSlug: string, projectId: string | null) {
  const intl = useIntl();
  const query = budgetsQuery(projectId);
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "budgets", query),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await reportsApi().budgets.$get(
        { param: { organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).budgets;
    },
  });
}

export function useRateCards(organizationSlug: string, enabled = true) {
  const intl = useIntl();
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "rate-cards"),
    enabled,
    queryFn: async ({ signal }) => {
      const response = await reportsApi()["rate-cards"].$get(
        { param: { organizationSlug } },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return response.json();
    },
  });
}

/** What a task's Report tab shows: the unit, the step, and the card that prices last. */
export type TaskReportView = { unit: ReportUnit; step: ReportStep; rateCard: string | null };

export function taskReportQuery(view: TaskReportView) {
  return compact({ unit: view.unit, step: view.step, rateCard: optional(view.rateCard) });
}

/** One task's words, money, time and pricing, for its Report tab. */
export function useTaskReport(
  organizationSlug: string,
  jobId: string,
  view: TaskReportView,
  enabled = true,
) {
  const intl = useIntl();
  const query = taskReportQuery(view);
  return useQuery({
    queryKey: reportsQueryKey(organizationSlug, "task-report", jobId, query),
    placeholderData: keepPreviousData,
    enabled,
    queryFn: async ({ signal }) => {
      const response = await reportsApi().tasks[":jobId"].report.$get(
        { param: { organizationSlug, jobId }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).taskReport;
    },
  });
}

export type TaskReport = NonNullable<ReturnType<typeof useTaskReport>["data"]>;

/** A link that downloads a task's words for one step as CSV. */
export function taskReportDownloadUrl(
  organizationSlug: string,
  jobId: string,
  view: TaskReportView,
) {
  return reportsApi()
    .tasks[":jobId"].report.$url({
      param: { organizationSlug, jobId },
      query: { ...taskReportQuery(view), format: "csv" },
    })
    .toString();
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
    queryFn: async ({ signal }) => {
      const response = await reportsApi().jobs.$get(
        { param: { organizationSlug: input.organizationSlug }, query },
        { init: { signal } },
      );
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      return (await response.json()).jobs;
    },
  });
}

export type ReportTask = NonNullable<ReturnType<typeof useReportTasks>["data"]>[number];

/** A link that downloads a section as CSV, with the same filters as on screen. */
export function reportDownloadUrl(
  organizationSlug: string,
  section: "words" | "time" | "step-times" | "ai-usage" | "costs" | "cost-estimate" | "budgets",
  query: Record<string, string>,
) {
  const api = reportsApi();
  const input = { param: { organizationSlug }, query: { ...query, format: "csv" } };
  switch (section) {
    case "words":
      return api.words.$url(input).toString();
    case "time":
      return api.time.$url(input).toString();
    case "step-times":
      return api["step-times"].$url(input).toString();
    case "ai-usage":
      return api["ai-usage"].$url(input).toString();
    case "costs":
      return api.costs.$url(input).toString();
    case "cost-estimate":
      return api["cost-estimate"].$url(input).toString();
    case "budgets":
      return api.budgets.$url(input).toString();
  }
}

/** Saving anything on the page reads every section again. */
function useInvalidateReports(organizationSlug: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: reportsQueryKey(organizationSlug) });
}

type RateCardBody = Parameters<ReturnType<typeof reportsApi>["rate-cards"]["$put"]>[0]["json"];

export function useSaveRateCard(organizationSlug: string) {
  const intl = useIntl();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: async (json: RateCardBody) => {
      const response = await reportsApi()["rate-cards"].$put({
        param: { organizationSlug },
        json,
      });
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      return (await response.json()).rateCard;
    },
    onSuccess: invalidate,
  });
}

type TimeEntryBody = Parameters<ReturnType<typeof reportsApi>["time-entries"]["$post"]>[0]["json"];

export function useLogTime(organizationSlug: string) {
  const intl = useIntl();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: async (json: TimeEntryBody) => {
      const response = await reportsApi()["time-entries"].$post({
        param: { organizationSlug },
        json,
      });
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      return response.json();
    },
    onSuccess: invalidate,
  });
}

type ExpenseBody = Parameters<ReturnType<typeof reportsApi>["expenses"]["$post"]>[0]["json"];

export function useAddExpense(organizationSlug: string) {
  const intl = useIntl();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: async (json: ExpenseBody) => {
      const response = await reportsApi().expenses.$post({ param: { organizationSlug }, json });
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      return response.json();
    },
    onSuccess: invalidate,
  });
}

type BudgetBody = Parameters<ReturnType<typeof reportsApi>["budgets"]["$put"]>[0]["json"];

export function useSetBudget(organizationSlug: string) {
  const intl = useIntl();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: async (json: BudgetBody) => {
      const response = await reportsApi().budgets.$put({ param: { organizationSlug }, json });
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      return response.json();
    },
    onSuccess: invalidate,
  });
}

type TaskPricingBody = Parameters<ReturnType<typeof reportsApi>["task-rates"]["$put"]>[0]["json"];

/** Saves a task's own pricing for one step: its rate card, time estimate and fixed fee. */
export function useSetTaskPricing(organizationSlug: string) {
  const intl = useIntl();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: async (json: TaskPricingBody) => {
      const response = await reportsApi()["task-rates"].$put({ param: { organizationSlug }, json });
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      return (await response.json()).taskRate;
    },
    onSuccess: invalidate,
  });
}

type TimeUpdateBody = Parameters<
  ReturnType<typeof reportsApi>["time-entries"][":id"]["$patch"]
>[0]["json"];

export function useEditTime(organizationSlug: string) {
  const intl = useIntl();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: async ({ id, ...json }: TimeUpdateBody & { id: string }) => {
      const response = await reportsApi()["time-entries"][":id"].$patch({
        param: { organizationSlug, id },
        json,
      });
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      return response.json();
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTime(organizationSlug: string) {
  const intl = useIntl();
  const invalidate = useInvalidateReports(organizationSlug);
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await reportsApi()["time-entries"][":id"].$delete({
        param: { organizationSlug, id },
      });
      if (!response.ok)
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
    },
    onSuccess: invalidate,
  });
}
