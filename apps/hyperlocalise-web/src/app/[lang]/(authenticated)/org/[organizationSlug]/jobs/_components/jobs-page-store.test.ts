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
// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";

import { JobsPageStore } from "./jobs-page-store";
import { writeJobsViewMode } from "./jobs-view-helpers";

describe("JobsPageStore", () => {
  afterEach(() => window.localStorage.clear());

  it("preserves a Row filter on restore and clears it when switching to Board", () => {
    writeJobsViewMode("row");
    const store = new JobsPageStore(
      "project_website",
      new URLSearchParams("status=failed&search=home"),
    );

    store.restoreViewMode();
    expect(store.viewMode).toBe("row");
    expect(store.statusFilter).toBe("failed");

    store.selectViewMode("kanban");
    expect(store.statusFilter).toBe("all");
    expect(store.showStatusFilter).toBe(false);
    expect(store.state.search).toBe("home");
  });

  it("clears a filtered Board URL on restore and on later navigation", () => {
    writeJobsViewMode("kanban");
    const store = new JobsPageStore("project_website", new URLSearchParams("status=failed"));

    expect(store.showStatusFilter).toBe(true);
    store.restoreViewMode();
    expect(store.statusFilter).toBe("all");

    store.applyUrl(new URLSearchParams("status=running&search=pricing"));
    expect(store.statusFilter).toBe("all");
    expect(store.searchDraft).toBe("pricing");
  });

  it("tracks create-job dialog chrome", () => {
    const store = new JobsPageStore(undefined, new URLSearchParams());
    expect(store.createJobOpen).toBe(false);

    store.setCreateJobOpen(true);
    expect(store.createJobOpen).toBe(true);

    store.setCreateJobOpen(false);
    expect(store.createJobOpen).toBe(false);
  });
});
