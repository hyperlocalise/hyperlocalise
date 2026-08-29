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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

const {
  useProjectPageQueryMock,
  useAppShellSidebarMock,
  loadJobContentEditorTargetFileMock,
  loadJobContentEditorProviderJobFilesMock,
  loadJobContentEditorJobSourceFilesMock,
  loadJobContentEditorSelectableTargetLocalesMock,
  routerReplaceMock,
  repositoriesGetMock,
  ProjectFileContentEditorWorkspaceMock,
} = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  useAppShellSidebarMock: vi.fn(),
  loadJobContentEditorTargetFileMock: vi.fn(),
  loadJobContentEditorProviderJobFilesMock: vi.fn(),
  loadJobContentEditorJobSourceFilesMock: vi.fn(),
  loadJobContentEditorSelectableTargetLocalesMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  repositoriesGetMock: vi.fn(),
  ProjectFileContentEditorWorkspaceMock: vi.fn(
    ({
      repositoryFullName,
      sourcePath,
      initialQueueFilter,
    }: {
      repositoryFullName?: string | null;
      sourcePath: string;
      initialQueueFilter?: string;
    }) => (
      <div
        data-testid="content-editor-workspace"
        data-repo={repositoryFullName ?? ""}
        data-source-path={sourcePath}
        data-initial-queue-filter={initialQueueFilter ?? ""}
      />
    ),
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplaceMock,
  }),
}));

vi.mock("../../../../_components/project-page-shell", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../_components/project-page-shell")>();
  return {
    ...actual,
    useProjectPageQuery: (...args: unknown[]) => useProjectPageQueryMock(...args),
  };
});

vi.mock("@/components/app-shell/store/use-app-shell-sidebar", () => ({
  useAppShellSidebar: (...args: unknown[]) => useAppShellSidebarMock(...args),
}));

vi.mock("./load-job-content-editor-files", () => ({
  loadJobContentEditorTargetFile: (...args: unknown[]) =>
    loadJobContentEditorTargetFileMock(...args),
  loadJobContentEditorProviderJobFiles: (...args: unknown[]) =>
    loadJobContentEditorProviderJobFilesMock(...args),
  loadJobContentEditorJobSourceFiles: (...args: unknown[]) =>
    loadJobContentEditorJobSourceFilesMock(...args),
  loadJobContentEditorSelectableTargetLocales: (...args: unknown[]) =>
    loadJobContentEditorSelectableTargetLocalesMock(...args),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "github-installation": {
            repositories: {
              $get: (...args: unknown[]) => repositoriesGetMock(...args),
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/components/content-editor/project-file/project-file-content-editor-workspace", () => ({
  ProjectFileContentEditorWorkspace: (props: {
    repositoryFullName?: string | null;
    sourcePath: string;
    initialQueueFilter?: string;
  }) => ProjectFileContentEditorWorkspaceMock(props),
}));

import { JobContentEditorPageContent } from "./job-content-editor-page-content";

const nativeFile = createProjectFileRecord({
  sourcePath: "en-US.json",
  storedFileId: "en-US.json",
  filename: "en-US.json",
});

const providerFile = createProjectFileRecord({
  origin: "provider",
  sourcePath: "crowdin/home.json",
  storedFileId: null,
  provider: {
    kind: "crowdin",
    resourceType: "file",
    externalProjectId: "project_website",
    externalResourceId: "file_home_json",
    externalUrl: null,
    syncState: "synced",
    sourceLocale: "en",
    targetLocales: ["vi", "de-DE"],
    localeReadiness: {},
    revision: "1",
    format: "json",
    lastSyncedAt: new Date().toISOString(),
  },
});

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    clear: () => {
      store.clear();
    },
  };
}

function mockRepositories(
  repositories: Array<{ fullName: string; enabled: boolean; archived: boolean }>,
) {
  repositoriesGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({ repositories }),
  });
}

function mockReadyProjectQuery() {
  useProjectPageQueryMock.mockReturnValue({
    isLoading: false,
    isError: false,
    isSuccess: true,
    data: { sourceLocale: "en" },
    error: null,
  });
}

describe("JobContentEditorPageContent guard ordering", () => {
  it("pre-selects the default job file when All Files is disabled", async () => {
    useProjectPageQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    });
    loadJobContentEditorJobSourceFilesMock.mockResolvedValue([providerFile]);
    routerReplaceMock.mockClear();

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId={null}
          targetLocale="vi"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        "/org/acme/projects/proj_1/jobs/job_1/strings?targetLocale=vi&sourcePath=crowdin%2Fhome.json&queueFilter=untranslated",
      );
    });
    expect(
      screen.queryByText("This project does not have a source locale."),
    ).not.toBeInTheDocument();
  });

  it("pre-selects all job files when All Files is enabled", async () => {
    useProjectPageQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    });
    loadJobContentEditorJobSourceFilesMock.mockResolvedValue([providerFile]);
    routerReplaceMock.mockClear();

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId={null}
          targetLocale="vi"
          contentEditorAllFilesEnabled
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        "/org/acme/projects/proj_1/jobs/job_1/strings?targetLocale=vi&sourcePath=*&sourcePaths=crowdin%2Fhome.json&queueFilter=untranslated",
      );
    });
    expect(
      screen.queryByText("This project does not have a source locale."),
    ).not.toBeInTheDocument();
  });

  it("does not treat a disabled project query as a missing source locale", () => {
    useProjectPageQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    });
    loadJobContentEditorJobSourceFilesMock.mockResolvedValue([providerFile]);

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId={null}
          targetLocale="vi"
        />
      </ContentEditorTestProviders>,
    );

    expect(useProjectPageQueryMock).toHaveBeenCalledWith("acme", "proj_1", { enabled: false });
    expect(
      screen.queryByText("This project does not have a source locale."),
    ).not.toBeInTheDocument();
  });

  it("shows a target-locale message when native files exist without a target locale", async () => {
    useProjectPageQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    });
    loadJobContentEditorJobSourceFilesMock.mockResolvedValue([nativeFile]);
    routerReplaceMock.mockClear();

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId={null}
          targetLocale={null}
        />
      </ContentEditorTestProviders>,
    );

    expect(
      await screen.findByText("No target locale is specified for this task."),
    ).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});

describe("JobContentEditorPageContent CAT shell", () => {
  beforeEach(() => {
    mockReadyProjectQuery();
    mockRepositories([
      { fullName: "acme/web", enabled: true, archived: false },
      { fullName: "acme/docs", enabled: true, archived: false },
    ]);
    loadJobContentEditorSelectableTargetLocalesMock.mockResolvedValue(["vi", "de-DE"]);
    ProjectFileContentEditorWorkspaceMock.mockClear();
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders provider task CAT with file and locale selectors", async () => {
    const user = userEvent.setup();
    loadJobContentEditorTargetFileMock.mockResolvedValue({ status: "found", file: providerFile });
    loadJobContentEditorProviderJobFilesMock.mockResolvedValue([providerFile]);

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath="crowdin/home.json"
          targetLocale="vi"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Source file")).toHaveTextContent("home.json");
      expect(screen.getByLabelText("Target locale")).toBeInTheDocument();
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-source-path",
        "crowdin/home.json",
      );
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-initial-queue-filter",
        "untranslated",
      );
    });
    expect(screen.queryByLabelText("GitHub repository")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Source file"));
    expect(await screen.findByLabelText("GitHub repository")).toBeInTheDocument();
  });

  it("opens with needs_review queue filter when provided", async () => {
    loadJobContentEditorTargetFileMock.mockResolvedValue({ status: "found", file: providerFile });
    loadJobContentEditorProviderJobFilesMock.mockResolvedValue([providerFile]);

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath="crowdin/home.json"
          targetLocale="vi"
          initialQueueFilter="needs_review"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-initial-queue-filter",
        "needs_review",
      );
    });
  });

  it("passes a saved repository preference into provider task CAT", async () => {
    localStorage.setItem(
      "job-content-editor-repository:acme:proj_1:crowdin/home.json",
      "acme/docs",
    );
    loadJobContentEditorTargetFileMock.mockResolvedValue({ status: "found", file: providerFile });
    loadJobContentEditorProviderJobFilesMock.mockResolvedValue([providerFile]);

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath="crowdin/home.json"
          targetLocale="vi"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-repo",
        "acme/docs",
      );
    });
  });

  it("renders native task CAT with a source file picker and passes the repository to the workspace", async () => {
    localStorage.setItem("job-content-editor-repository:acme:proj_1:en-US.json", "acme/web");
    loadJobContentEditorTargetFileMock.mockResolvedValue({ status: "found", file: nativeFile });

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId="en-US.json"
          targetLocale="vi"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Source file")).toHaveTextContent("en-US.json");
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-repo",
        "acme/web",
      );
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-source-path",
        "en-US.json",
      );
    });
    expect(screen.queryByLabelText("GitHub repository")).not.toBeInTheDocument();
  });

  it("prompts for a repository on native task CAT when multiple repos are enabled", async () => {
    loadJobContentEditorTargetFileMock.mockResolvedValue({ status: "found", file: nativeFile });

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId="en-US.json"
          targetLocale="vi"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Choose a GitHub repository in the source file picker to look up string context.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows the saved GitHub repository when viewing All Files", async () => {
    localStorage.setItem("job-content-editor-repository:acme:proj_1:*", "acme/docs");
    loadJobContentEditorJobSourceFilesMock.mockResolvedValue([providerFile]);
    loadJobContentEditorProviderJobFilesMock.mockResolvedValue([providerFile]);
    loadJobContentEditorSelectableTargetLocalesMock.mockResolvedValue(["vi", "de-DE"]);

    render(
      <ContentEditorTestProviders>
        <JobContentEditorPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath="*"
          storedFileId={null}
          targetLocale="vi"
          contentEditorAllFilesEnabled
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-repo",
        "acme/docs",
      );
      expect(screen.getByTestId("content-editor-workspace")).toHaveAttribute(
        "data-source-path",
        "*",
      );
    });
    expect(screen.getByLabelText("Source file")).toHaveTextContent("All Files");
    expect(screen.queryByLabelText("GitHub repository")).not.toBeInTheDocument();
  });
});
