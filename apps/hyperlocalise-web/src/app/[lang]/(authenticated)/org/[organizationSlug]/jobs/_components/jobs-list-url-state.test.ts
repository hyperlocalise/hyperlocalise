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

import {
  buildJobsListHref,
  clearJobsListFilters,
  getActiveJobsFilterChips,
  parseJobsListSearchParams,
} from "./jobs-list-url-state";

describe("jobs-list-url-state", () => {
  it("parses and builds list filter search params", () => {
    const state = parseJobsListSearchParams(
      new URLSearchParams({
        status: "running",
        search: "homepage",
      }),
    );

    expect(state.status).toBe("running");
    expect(state.search).toBe("homepage");
    expect(buildJobsListHref("/org/acme/jobs", state)).toBe(
      "/org/acme/jobs?search=homepage&status=running",
    );
  });

  it("ignores unknown status values", () => {
    expect(parseJobsListSearchParams(new URLSearchParams({ status: "nope" })).status).toBe("all");
  });

  it("clears search and status without dropping the path", () => {
    const cleared = clearJobsListFilters({
      search: "checkout",
      status: "failed",
    });

    expect(cleared).toEqual({ search: "", status: "all" });
    expect(buildJobsListHref("/org/acme/jobs", cleared)).toBe("/org/acme/jobs");
  });

  it("builds chips for active search and status filters", () => {
    expect(
      getActiveJobsFilterChips({
        search: "review",
        status: "waiting_for_review",
      }),
    ).toEqual([
      { key: "search", value: "review" },
      { key: "status", value: "waiting_for_review" },
    ]);
  });
});
