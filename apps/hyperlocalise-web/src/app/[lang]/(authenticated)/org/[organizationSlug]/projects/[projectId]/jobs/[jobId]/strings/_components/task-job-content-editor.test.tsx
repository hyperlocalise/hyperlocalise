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
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  workspace: vi.fn(),
  root: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({ client: { job: { get: mocks.getJob } }, loading: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/app-shell/store/use-app-shell-sidebar", () => ({
  useAppShellSidebar: () => undefined,
}));
vi.mock("@/components/content-editor/page/content-editor-page-root", () => ({
  ContentEditorPageRoot: (props: { children: ReactNode }) => {
    mocks.root(props);
    return <div>{props.children}</div>;
  },
}));
vi.mock("@/components/content-editor/project-file/project-file-content-editor-workspace", () => ({
  ProjectFileContentEditorWorkspace: (props: unknown) => {
    mocks.workspace(props);
    return <div>editor</div>;
  },
}));
vi.mock("../../../../_components/project-page-shell", () => ({
  ProjectPageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { TaskJobContentEditor } from "./task-job-content-editor";

const task = {
  id: "job_1",
  projectId: "project_1",
  kind: "proofread",
  type: "file",
  status: "waiting_for_review",
  externalProviderKind: null,
  // A task made through the API carries no file path of its own.
  inputPayload: {
    sourceFileId: "file_1",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR", "ja-JP"],
  },
  taskFile: { sourcePath: "locales/app.json", branch: "main" },
  createdAt: "2026-11-16T00:00:00.000Z",
  updatedAt: "2026-11-16T00:00:00.000Z",
};

function renderEditor(targetLocale: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <TaskJobContentEditor
          organizationSlug="acme"
          projectId="project_1"
          jobId="job_1"
          targetLocale={targetLocale}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the editor for someone here through a task", () => {
  it("opens the task's own file, held to the task, with only the task's languages", async () => {
    mocks.getJob.mockResolvedValue({ job: task });

    renderEditor("ja-JP");

    await waitFor(() => expect(mocks.workspace).toHaveBeenCalled());
    expect(mocks.workspace.mock.lastCall?.[0]).toMatchObject({
      sourcePath: "locales/app.json",
      branch: null,
      sourceLocale: "en-US",
      targetLocale: "ja-JP",
      taskScoped: true,
    });
    expect(mocks.root.mock.lastCall?.[0]).toMatchObject({
      backHref: "/org/acme/projects/project_1/jobs/job_1",
      chrome: {
        selectedSourcePath: "locales/app.json",
        targetLocales: ["fr-FR", "ja-JP"],
        canUseAllFiles: false,
        showFileSidebar: false,
        activitySourcePath: "",
      },
    });
  });

  it("does not take a language the task does not have from the address", async () => {
    mocks.getJob.mockResolvedValue({ job: task });

    renderEditor("de-DE");

    await waitFor(() => expect(mocks.workspace).toHaveBeenCalled());
    expect(mocks.workspace.mock.lastCall?.[0]).toMatchObject({ targetLocale: "fr-FR" });
  });

  it("names the branch of a task on a branch file", async () => {
    mocks.getJob.mockResolvedValue({
      job: { ...task, taskFile: { sourcePath: "locales/app.json", branch: "release" } },
    });

    renderEditor(null);

    await waitFor(() => expect(mocks.workspace).toHaveBeenCalled());
    expect(mocks.workspace.mock.lastCall?.[0]).toMatchObject({ branch: "release" });
  });

  it("opens nothing for a job with no file of its own, or one in another project", async () => {
    mocks.getJob.mockResolvedValue({ job: { ...task, taskFile: null } });
    renderEditor(null);
    expect(await screen.findByText("No source file is linked to this task.")).toBeTruthy();
    cleanup();

    mocks.getJob.mockResolvedValue({ job: { ...task, projectId: "project_other" } });
    renderEditor(null);
    expect(await screen.findByText("No source file is linked to this task.")).toBeTruthy();
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
});
