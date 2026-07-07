// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";

import { createProjectFileRecord } from "./project-files.fixture";

const {
  useProjectPageQueryMock,
  useAppShellSidebarMock,
  fetchProjectFilesMock,
  repositoriesGetMock,
  ProjectFileCatWorkspaceMock,
} = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  useAppShellSidebarMock: vi.fn(),
  fetchProjectFilesMock: vi.fn(),
  repositoriesGetMock: vi.fn(),
  ProjectFileCatWorkspaceMock: vi.fn(
    ({
      repositoryFullName,
      sourcePath,
      targetLocale,
      targetLocales,
    }: {
      repositoryFullName?: string | null;
      sourcePath: string;
      targetLocale: string;
      targetLocales?: string[];
    }) => (
      <div
        data-testid="cat-workspace"
        data-repo={repositoryFullName ?? ""}
        data-source-path={sourcePath}
        data-target-locale={targetLocale}
        data-target-locales={(targetLocales ?? []).join(",")}
      />
    ),
  ),
}));

vi.mock("../../_components/project-page-shell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../_components/project-page-shell")>();
  return {
    ...actual,
    useProjectPageQuery: (...args: unknown[]) => useProjectPageQueryMock(...args),
  };
});

vi.mock("@/components/app-shell/store/use-app-shell-sidebar", () => ({
  useAppShellSidebar: (...args: unknown[]) => useAppShellSidebarMock(...args),
}));

vi.mock("./project-files-tree-panel", () => ({
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFilesMock(...args),
  findCachedProjectFiles: vi.fn(() => undefined),
  projectFilesQueryKey: () => ["project-files"],
  sortFilesByPath: (files: unknown[]) => files,
  PROJECT_FILES_MAX_LIMIT: 1000,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
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
    targetLocale: string;
    targetLocales?: string[];
  }) => ProjectFileCatWorkspaceMock(props),
}));

import { ProjectFileCatPageContent } from "./project-file-cat-page-content";

const enUsFile = createProjectFileRecord({
  sourcePath: "en-US.json",
  storedFileId: "file_en_us",
  filename: "en-US.json",
});

const pricingFile = createProjectFileRecord({
  sourcePath: "marketing/pricing.json",
  storedFileId: "file_pricing",
  filename: "pricing.json",
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
    data: { sourceLocale: "en", targetLocales: ["vi", "fr-FR"] },
    error: null,
  });
}

describe("ProjectFileCatPageContent guard ordering", () => {
  it("shows the select-a-file prompt when no source path is selected", () => {
    useProjectPageQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    });

    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath={null}
          highlightLocale={null}
        />
      </CatTestProviders>,
    );

    expect(
      screen.getByText(
        "Choose a source file from the project files list to open it in the CAT workspace.",
      ),
    ).toBeInTheDocument();
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

    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath={null}
          highlightLocale="vi"
        />
      </CatTestProviders>,
    );

    expect(useProjectPageQueryMock).toHaveBeenCalledWith("acme", "proj_1", { enabled: false });
    expect(
      screen.queryByText("This project does not have a source locale."),
    ).not.toBeInTheDocument();
  });
});

describe("ProjectFileCatPageContent CAT shell", () => {
  beforeEach(() => {
    mockReadyProjectQuery();
    fetchProjectFilesMock.mockResolvedValue([enUsFile, pricingFile]);
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

  it("renders source file and GitHub repository selectors in the CAT header", async () => {
    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath="en-US.json"
          highlightLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Source file")).toBeInTheDocument();
      expect(screen.getByLabelText("GitHub repository")).toBeInTheDocument();
    });
  });

  it("passes a saved repository preference into the CAT workspace", async () => {
    localStorage.setItem("job-cat-repository:acme:proj_1:en-US.json", "acme/docs");

    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath="en-US.json"
          highlightLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-repo", "acme/docs");
    });
  });

  it("opens native CAT with the first project target locale when the URL has no locale", async () => {
    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath="en-US.json"
          highlightLocale={null}
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-target-locale", "vi");
    });
    expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-target-locales", "vi,fr-FR");
  });

  it("shows a warning when a requested native locale falls back", async () => {
    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath="en-US.json"
          highlightLocale="ja-JP"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-target-locale", "vi");
    });
    expect(
      screen.getByText("ja-JP is not a target locale for this file. Showing vi instead."),
    ).toBeInTheDocument();
  });

  it("prompts for a repository when multiple GitHub repos are enabled and none is selected", async () => {
    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath="en-US.json"
          highlightLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Select a GitHub repository to look up string context."),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-repo", "");
  });

  it("auto-selects the only enabled repository and passes it to the workspace", async () => {
    mockRepositories([{ fullName: "acme/web", enabled: true, archived: false }]);

    render(
      <CatTestProviders>
        <ProjectFileCatPageContent
          organizationSlug="acme"
          projectId="proj_1"
          sourcePath="en-US.json"
          highlightLocale="vi"
        />
      </CatTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cat-workspace")).toHaveAttribute("data-repo", "acme/web");
    });
    expect(
      screen.queryByText("Select a GitHub repository to look up string context."),
    ).not.toBeInTheDocument();
  });
});
