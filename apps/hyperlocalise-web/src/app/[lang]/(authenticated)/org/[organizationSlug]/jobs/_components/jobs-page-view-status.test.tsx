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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { JobsPageView, type JobsStatusFilter } from "./jobs-page-view";
import { writeJobsViewMode } from "./jobs-view-helpers";

function renderProjectJobs(
  statusFilter: JobsStatusFilter,
  onStatusFilterChange: (status: JobsStatusFilter) => void,
) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <JobsPageView
        organizationSlug="acme"
        projectId="project_website"
        isNativeLoading={false}
        nativeJobs={[]}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
      />
    </IntlProvider>,
  );
}

describe("project jobs board status", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("clears the URL status when switching from Row to Board and keeps the control visible until it clears", async () => {
    writeJobsViewMode("row");
    const onStatusFilterChange = vi.fn();
    const view = renderProjectJobs("failed", onStatusFilterChange);

    expect(screen.getByRole("button", { name: "Filter (1)" })).toBeInTheDocument();
    expect(onStatusFilterChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(onStatusFilterChange).toHaveBeenCalledWith("all");
    expect(screen.getByRole("button", { name: /Filter/ })).toBeInTheDocument();

    view.rerender(
      <IntlProvider locale="en" messages={{}}>
        <JobsPageView
          organizationSlug="acme"
          projectId="project_website"
          isNativeLoading={false}
          nativeJobs={[]}
          statusFilter="all"
          onStatusFilterChange={onStatusFilterChange}
        />
      </IntlProvider>,
    );
    expect(screen.queryByRole("button", { name: "Filter" })).toBeNull();
  });

  it("clears a filtered URL when the saved view is Board", async () => {
    writeJobsViewMode("kanban");
    const onStatusFilterChange = vi.fn();
    renderProjectJobs("failed", onStatusFilterChange);

    await waitFor(() => expect(onStatusFilterChange).toHaveBeenCalledWith("all"));
    expect(screen.getByRole("button", { name: /Filter/ })).toBeInTheDocument();
  });
});
