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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  markDone: vi.fn(),
  replace: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: { job: { get: mocks.getJob, assignableOwners: vi.fn(async () => ({ members: [] })) } },
    loading: false,
  }),
}));
vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": { jobs: { ":jobId": { "mark-done": { $post: mocks.markDone } } } },
      },
    },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));
vi.mock("sonner", () => ({
  toast: { info: mocks.toastInfo, success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/app-shell/store/use-app-shell-breadcrumb", () => ({
  useAppShellBreadcrumbAppend: () => undefined,
}));
vi.mock("@/components/reports/task-report", () => ({ TaskReport: () => <div>Report</div> }));

import { NativeJobDetailContent } from "./native-job-detail-content";

const task = {
  id: "job_1",
  projectId: "project_1",
  kind: "proofread",
  type: "file",
  externalProviderKind: null,
  status: "waiting_for_review",
  ownerUserId: "user_1",
  ownerType: "user",
  inputPayload: {
    sourceFileId: "file_1",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
    metadata: { title: "Proofread: guide.json", workflowTaskStep: "proofread" },
  },
  createdAt: "2026-11-16T00:00:00.000Z",
  updatedAt: "2026-11-16T00:00:00.000Z",
};

function renderPage(props: Partial<ComponentProps<typeof NativeJobDetailContent>>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <NativeJobDetailContent
          jobId="job_1"
          organizationSlug="acme"
          projectId="project_1"
          currentUserId="user_1"
          {...props}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the task page for someone here through a task they own", () => {
  const taskOwner = { taskOwnerOnly: true, canMarkOwnTaskDone: true };

  it("offers Mark done and the editor, and none of the controls that go through the team", async () => {
    mocks.getJob.mockResolvedValue({ job: task });

    renderPage(taskOwner);

    expect(await screen.findByRole("button", { name: "Mark done" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Editor" })).toBeTruthy();
    for (const name of ["Cancel job", "Mark as failed"]) {
      expect(screen.queryByRole("button", { name }), name).toBeNull();
    }
    // The way back is My jobs, not the project's job list.
    const hrefs = Array.from(document.querySelectorAll("a[href]"), (link) =>
      link.getAttribute("href"),
    );
    expect(hrefs).toContain("/org/acme/my-jobs");
    expect(hrefs).not.toContain("/org/acme/projects/project_1/jobs");
  });

  it("shows the same task with the team's controls to someone on the team", async () => {
    mocks.getJob.mockResolvedValue({ job: task });

    renderPage({ canEditJobFields: true });

    expect(await screen.findByRole("button", { name: "Cancel job" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark done" })).toBeTruthy();
  });

  it("does not offer Mark done to a task owner whose role cannot finish a task", async () => {
    mocks.getJob.mockResolvedValue({ job: task });

    renderPage({ taskOwnerOnly: true, canMarkOwnTaskDone: false });

    expect(await screen.findByRole("link", { name: "Open Editor" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark done" })).toBeNull();
  });

  it("goes to My jobs once the task is marked done", async () => {
    mocks.getJob.mockResolvedValue({ job: task });
    mocks.markDone.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job: { ...task, status: "succeeded" } }),
    });

    renderPage(taskOwner);
    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));
    const confirm = (await screen.findAllByRole("button", { name: "Mark done" })).at(-1)!;
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/org/acme/my-jobs"));
    expect(mocks.markDone).toHaveBeenCalledTimes(1);
  });

  it("says the task has ended and goes to My jobs when it is no longer theirs", async () => {
    mocks.getJob.mockRejectedValue(
      new GoSvcClientError({ code: "job_not_found", message: "Job not found", status: 404 }),
    );

    renderPage(taskOwner);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/org/acme/my-jobs"));
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "This task is finished or was given to someone else.",
    );
  });
});
