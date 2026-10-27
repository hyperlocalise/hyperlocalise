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
import { REPORT_PRESET_DAYS } from "@/lib/reporting/report-period";
import {
  REPORT_STEPS,
  REPORT_UNITS,
  type ReportStep,
  type ReportUnit,
} from "@/lib/reporting/report-units";

/**
 * The Reports page's tab, dates and filters, kept in the URL so a view can be shared and Back
 * returns to it. Values left at their default stay out of the URL.
 */

export const REPORTS_TABS = ["activity", "words", "time", "costs", "estimate", "budgets"] as const;
export type ReportsTab = (typeof REPORTS_TABS)[number];

/** The tabs for roles that cannot see what work costs: only their own time. */
export const MEMBER_TABS: readonly ReportsTab[] = ["time"];

export const REPORTS_RANGES = [...REPORT_PRESET_DAYS.map(String), "custom"] as const;
export type ReportsRange = (typeof REPORTS_RANGES)[number];

export const WORD_COUNT_MODES = ["arrived", "finished"] as const;
export const WORD_COUNT_GROUPINGS = ["project", "task", "week"] as const;
export const AI_USAGE_GROUPINGS = ["origin", "model"] as const;

/** The most tasks an estimate can be made for at once. */
export const MAX_ESTIMATE_TASKS = 50;

export type ReportsUrlState = {
  tab: ReportsTab;
  range: ReportsRange;
  /** Only used with the custom range. */
  from: string | null;
  to: string | null;
  projectId: string | null;
  /** One task, for Activity, Word counts and Time. */
  jobId: string | null;
  /** The tasks a cost estimate is for. */
  jobIds: string[];
  targetLocale: string | null;
  step: ReportStep;
  unit: ReportUnit;
  mode: (typeof WORD_COUNT_MODES)[number];
  groupBy: (typeof WORD_COUNT_GROUPINGS)[number];
  page: number;
  rateCard: string | null;
  aiGroup: (typeof AI_USAGE_GROUPINGS)[number];
};

export const DEFAULT_REPORTS_STATE: ReportsUrlState = {
  tab: "activity",
  range: "28",
  from: null,
  to: null,
  projectId: null,
  jobId: null,
  jobIds: [],
  targetLocale: null,
  step: "translation",
  unit: "words",
  mode: "arrived",
  groupBy: "project",
  page: 1,
  rateCard: null,
  aiGroup: "origin",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function allowed<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: string | null, maxLength = 200): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

export function parseReportsSearchParams(params: URLSearchParams): ReportsUrlState {
  const page = Number(params.get("page"));
  const from = params.get("from");
  const to = params.get("to");
  return {
    tab: allowed(params.get("tab"), REPORTS_TABS, DEFAULT_REPORTS_STATE.tab),
    range: allowed(params.get("range"), REPORTS_RANGES, DEFAULT_REPORTS_STATE.range),
    from: from && DAY.test(from) ? from : null,
    to: to && DAY.test(to) ? to : null,
    projectId: text(params.get("project")),
    jobId: text(params.get("task")),
    jobIds: (params.get("tasks") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 200)
      .slice(0, MAX_ESTIMATE_TASKS),
    targetLocale: text(params.get("language"), 35),
    step: allowed(params.get("step"), REPORT_STEPS, DEFAULT_REPORTS_STATE.step),
    unit: allowed(params.get("unit"), REPORT_UNITS, DEFAULT_REPORTS_STATE.unit),
    mode: allowed(params.get("mode"), WORD_COUNT_MODES, DEFAULT_REPORTS_STATE.mode),
    groupBy: allowed(params.get("group"), WORD_COUNT_GROUPINGS, DEFAULT_REPORTS_STATE.groupBy),
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    rateCard: text(params.get("card"), 100),
    aiGroup: allowed(params.get("ai"), AI_USAGE_GROUPINGS, DEFAULT_REPORTS_STATE.aiGroup),
  };
}

export function buildReportsSearchParams(state: ReportsUrlState): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: string | null, fallback: string | null = null) => {
    if (value !== null && value !== fallback) params.set(key, value);
  };
  put("tab", state.tab, DEFAULT_REPORTS_STATE.tab);
  put("range", state.range, DEFAULT_REPORTS_STATE.range);
  if (state.range === "custom") {
    put("from", state.from);
    put("to", state.to);
  }
  put("project", state.projectId);
  put("task", state.jobId);
  if (state.jobIds.length) params.set("tasks", state.jobIds.join(","));
  put("language", state.targetLocale);
  put("step", state.step, DEFAULT_REPORTS_STATE.step);
  put("unit", state.unit, DEFAULT_REPORTS_STATE.unit);
  put("mode", state.mode, DEFAULT_REPORTS_STATE.mode);
  put("group", state.groupBy, DEFAULT_REPORTS_STATE.groupBy);
  if (state.page !== 1) params.set("page", String(state.page));
  put("card", state.rateCard);
  put("ai", state.aiGroup, DEFAULT_REPORTS_STATE.aiGroup);
  return params;
}

export function buildReportsHref(pathname: string, state: ReportsUrlState): string {
  const query = buildReportsSearchParams(state).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * A change to the state. Changing what is counted or grouped goes back to the first page of
 * the table, since the old page may no longer exist.
 */
export function applyReportsChange(
  state: ReportsUrlState,
  change: Partial<ReportsUrlState>,
): ReportsUrlState {
  const next = { ...state, ...change };
  if (!("page" in change)) next.page = 1;
  if (change.range && change.range !== "custom") {
    next.from = null;
    next.to = null;
  }
  return next;
}
