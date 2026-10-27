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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { JobDetailTaskView } from "./job-detail-task-view";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderView(renderReportSection?: () => ReactNode) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <JobDetailTaskView
        isLoading={false}
        jobId="job_release"
        organizationSlug="acme"
        projectId="project_web"
        properties={[]}
        renderExtraMain={() => <p>Overview content</p>}
        renderReportSection={renderReportSection}
      />
    </IntlProvider>,
  );
}

describe("Job detail task view", () => {
  it("adds a Report tab that renders the report only while it is open", async () => {
    const report = vi.fn(() => <p>Task report content</p>);
    renderView(report);
    expect(screen.getByText("Overview content")).toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("tab", { name: "Report" }));
    expect(await screen.findByText("Task report content")).toBeInTheDocument();
  });

  it("shows no tabs when a task has nothing but its overview", () => {
    renderView();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("Overview content")).toBeInTheDocument();
  });
});
