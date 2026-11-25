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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ getJob: vi.fn() }));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({ client: { job: { get: mocks.getJob } }, loading: false }),
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

import { JobComesAfterField } from "./job-comes-after-field";

function renderForTaskOwner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <JobComesAfterField
          organizationSlug="acme"
          projectId="project_1"
          afterJobId="job_post_edit"
          waiting
          linkOnlyWhenReadable
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("JobComesAfterField for someone here through a task", () => {
  it("does not link to an earlier task the person cannot open", async () => {
    mocks.getJob.mockRejectedValue(new Error("not found"));

    renderForTaskOwner();

    await waitFor(() => expect(mocks.getJob).toHaveBeenCalled());
    expect(await screen.findByText("Earlier task")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("This task opens when that one is marked done or cancelled."),
    ).toBeTruthy();
  });

  it("links to an earlier task that is also theirs", async () => {
    mocks.getJob.mockResolvedValue({
      job: {
        id: "job_post_edit",
        projectId: "project_1",
        kind: "proofread",
        status: "waiting_for_review",
        inputPayload: { metadata: { title: "Post-edit: guide.docx" } },
        updatedAt: "2026-11-16T00:00:00.000Z",
      },
    });

    renderForTaskOwner();

    const link = await screen.findByRole("link", { name: "Post-edit: guide.docx" });
    expect(link.getAttribute("href")).toBe("/org/acme/projects/project_1/jobs/job_post_edit");
  });
});
