// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";
import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

const {
  useProjectPageQueryMock,
  useAppShellSidebarMock,
  loadJobCatTargetFileMock,
  loadJobCatProviderJobFilesMock,
  loadJobCatJobSourceFilesMock,
  routerReplaceMock,
  repositoriesGetMock,
  ProjectFileCatWorkspaceMock,
} = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  useAppShellSidebarMock: vi.fn(),
  loadJobCatTargetFileMock: vi.fn(),
  loadJobCatProviderJobFilesMock: vi.fn(),
  loadJobCatJobSourceFilesMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  repositoriesGetMock: vi.fn(),
  ProjectFileCatWorkspaceMock: vi.fn(
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
        data-testid="cat-workspace"
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

vi.mock("./load-job-cat-files", () => ({
  loadJobCatTargetFile: (...args: unknown[]) => loadJobCatTargetFileMock(...args),
  loadJobCatProviderJobFiles: (...args: unknown[]) => loadJobCatProviderJobFilesMock(...args),
  loadJobCatJobSourceFiles: (...args: unknown[]) => loadJobCatJobSourceFilesMock(...args),
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

vi.mock("@/components/cat/project-file/project-file-cat-workspace", () => ({
  ProjectFileCatWorkspace: (props: {
    repositoryFullName?: string | null;
    sourcePath: string;
    initialQueueFilter?: string;
  }) => ProjectFileCatWorkspaceMock(props),
}));

import { JobCatPageContent } from "./job-cat-page-content";

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

describe("JobCatPageContent guard ordering", () => {
  it("pre-selects the first openable file when no file reference is present", async () => {
    useProjectPageQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    });
    loadJobCatJobSourceFilesMock.mockResolvedValue([providerFile]);
    routerReplaceMock.mockClear();

    render(
      <CatTestProviders>
        <JobCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId={null}
          targetLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        "/org/acme/projects/proj_1/jobs/job_1/strings?targetLocale=vi&sourcePath=crowdin%2Fhome.json",
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
    loadJobCatJobSourceFilesMock.mockResolvedValue([providerFile]);

    render(
      <CatTestProviders>
        <JobCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId={null}
          targetLocale="vi"
        />
      </CatTestProviders>,
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
    loadJobCatJobSourceFilesMock.mockResolvedValue([nativeFile]);
    routerReplaceMock.mockClear();

    render(
      <CatTestProviders>
        <JobCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId={null}
          targetLocale={null}
        />
      </CatTestProviders>,
    );

    expect(
      await screen.findByText("No target locale is specified for this task."),
    ).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});

describe("JobCatPageContent CAT shell", () => {
  beforeEach(() => {
    mockReadyProjectQuery();
    mockRepositories([
      { fullName: "acme/web", enabled: true, archived: false },
      { fullName: "acme/docs", enabled: true, archived: false },
    ]);
    ProjectFileCatWorkspaceMock.mockClear();
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders provider task CAT with file and repository selectors", async () => {
    loadJobCatTargetFileMock.mockResolvedValue({ status: "found", file: providerFile });
    loadJobCatProviderJobFilesMock.mockResolvedValue([providerFile]);

    render(
      <CatTestProviders>
        <JobCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath="crowdin/home.json"
          targetLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Source file")).toBeInTheDocument();
      expect(screen.getByLabelText("GitHub repository")).toBeInTheDocument();
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute(
        "data-source-path",
        "crowdin/home.json",
      );
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute(
        "data-initial-queue-filter",
        "untranslated",
      );
    });
  });

  it("passes a saved repository preference into provider task CAT", async () => {
    localStorage.setItem("job-cat-repository:acme:proj_1:crowdin/home.json", "acme/docs");
    loadJobCatTargetFileMock.mockResolvedValue({ status: "found", file: providerFile });
    loadJobCatProviderJobFilesMock.mockResolvedValue([providerFile]);

    render(
      <CatTestProviders>
        <JobCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath="crowdin/home.json"
          targetLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-repo", "acme/docs");
    });
  });

  it("renders native task CAT with a repository selector and passes the selection to the workspace", async () => {
    localStorage.setItem("job-cat-repository:acme:proj_1:en-US.json", "acme/web");
    loadJobCatTargetFileMock.mockResolvedValue({ status: "found", file: nativeFile });

    render(
      <CatTestProviders>
        <JobCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId="en-US.json"
          targetLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("GitHub repository")).toBeInTheDocument();
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-repo", "acme/web");
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-source-path", "en-US.json");
    });
    expect(screen.queryByLabelText("Source file")).not.toBeInTheDocument();
  });

  it("prompts for a repository on native task CAT when multiple repos are enabled", async () => {
    loadJobCatTargetFileMock.mockResolvedValue({ status: "found", file: nativeFile });

    render(
      <CatTestProviders>
        <JobCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          jobId="job_1"
          sourcePath={null}
          storedFileId="en-US.json"
          targetLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Select a GitHub repository to look up string context."),
      ).toBeInTheDocument();
    });
  });
});
