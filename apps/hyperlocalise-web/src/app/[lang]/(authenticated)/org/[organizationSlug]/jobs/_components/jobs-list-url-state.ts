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

import { JOB_STATUS_FILTERS } from "../../_components/workspace-filter-params";

export const JOBS_LIST_STATUS_FILTERS = ["all", ...JOB_STATUS_FILTERS] as const;

export type JobsListStatusFilter = (typeof JOBS_LIST_STATUS_FILTERS)[number];

export type JobsListUrlState = {
  search: string;
  status: JobsListStatusFilter;
};

export type JobsListFilterChip =
  | { key: "search"; value: string }
  | { key: "status"; value: Exclude<JobsListStatusFilter, "all"> };

const DEFAULT_STATE: JobsListUrlState = {
  search: "",
  status: "all",
};

function isJobsListStatusFilter(value: string | null): value is JobsListStatusFilter {
  return value != null && (JOBS_LIST_STATUS_FILTERS as readonly string[]).includes(value);
}

export function parseJobsListSearchParams(searchParams: URLSearchParams): JobsListUrlState {
  const status = searchParams.get("status");
  return {
    search: searchParams.get("search")?.trim() ?? "",
    status: isJobsListStatusFilter(status) ? status : "all",
  };
}

export function buildJobsListSearchParams(
  state: JobsListUrlState,
  current?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(current?.toString());
  const search = state.search.trim();
  if (search) {
    params.set("search", search);
  } else {
    params.delete("search");
  }
  if (state.status !== "all") {
    params.set("status", state.status);
  } else {
    params.delete("status");
  }
  return params;
}

export function buildJobsListHref(
  pathname: string,
  state: JobsListUrlState,
  current?: URLSearchParams,
) {
  const query = buildJobsListSearchParams(state, current).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function clearJobsListFilters(state: JobsListUrlState): JobsListUrlState {
  return {
    ...state,
    search: "",
    status: "all",
  };
}

export function getActiveJobsFilterChips(state: JobsListUrlState): JobsListFilterChip[] {
  const chips: JobsListFilterChip[] = [];
  if (state.search.trim()) {
    chips.push({ key: "search", value: state.search.trim() });
  }
  if (state.status !== "all") {
    chips.push({ key: "status", value: state.status });
  }
  return chips;
}

export function defaultJobsListUrlState(): JobsListUrlState {
  return { ...DEFAULT_STATE };
}
