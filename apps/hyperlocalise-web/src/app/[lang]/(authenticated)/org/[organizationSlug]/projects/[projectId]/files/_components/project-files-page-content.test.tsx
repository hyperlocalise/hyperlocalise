// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createProjectFileRecord } from "./project-files.fixture";
import { ProjectFileSelectionActions } from "./project-file-selection-actions";

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

const { routerPushMock, routerReplaceMock, searchParamsMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  searchParamsMock: vi.fn(() => "sourcePath=en-US.json&locale=vi"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/proj_1/files",
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsMock()),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

vi.mock("./project-files-tree-panel", () => ({
  PROJECT_FILES_PAGE_SIZE: 500,
  PROJECT_FILES_MAX_LIMIT: 1000,
  projectFilesQueryKey: () => ["project-files"],
  sortFilesByPath: (files: unknown[]) => files,
  ProjectFilesTreePanel: ({
    onActivateFile,
    onLoadedFilesChange,
    catOpenHint,
    headerActions,
    fileActions,
  }: {
    onActivateFile?: (sourcePath: string) => void;
    onLoadedFilesChange?: (files: (typeof enUsFile)[]) => void;
    catOpenHint?: string | null;
    headerActions?: ReactNode;
    fileActions?: {
      onDownloadFile?: (file: typeof pricingFile) => void;
    };
  }) => {
    useEffect(() => {
      onLoadedFilesChange?.([enUsFile, pricingFile]);
    }, [onLoadedFilesChange]);

    return (
      <div>
        {headerActions}
        {catOpenHint ? <p>{catOpenHint}</p> : null}
        <button type="button" onDoubleClick={() => onActivateFile?.("en-US.json")}>
          en-US.json
        </button>
        <button type="button" onClick={() => fileActions?.onDownloadFile?.(pricingFile)}>
          Download pricing from context menu
        </button>
      </div>
    );
  },
}));

vi.mock("./create-translation-job-dialog", () => ({
  CreateTranslationJobDialog: () => null,
}));

vi.mock("./project-files-branch-filter", () => ({
  ProjectFilesBranchFilter: () => null,
}));

vi.mock("../../_components/project-page-shell", () => ({
  ProjectPageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProjectSectionHeader: ({ section }: { section: string }) => <h2>{section}</h2>,
  ProjectSectionTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  useProjectPageQuery: () => ({
    isLoading: false,
    isError: false,
    data: { sourceLocale: "en", targetLocales: ["vi", "fr-FR"] },
  }),
}));

import { ProjectFilesPageContent, ProjectFilesPageContentView } from "./project-files-page-content";

describe("ProjectFilesPageContent CAT entry UX", () => {
  beforeEach(() => {
    searchParamsMock.mockReturnValue("sourcePath=en-US.json&locale=vi");
    routerPushMock.mockClear();
    routerReplaceMock.mockReset();
    routerReplaceMock.mockImplementation((url: string) => {
      const query = url.includes("?") ? url.split("?")[1] : "";
      searchParamsMock.mockReturnValue(query);
    });
  });

  it("opens CAT when a project file is double-clicked", async () => {
    const user = userEvent.setup();

    render(<ProjectFilesPageContent organizationSlug="acme" projectId="proj_1" />);

    await user.dblClick(screen.getByRole("button", { name: "en-US.json" }));

    expect(routerPushMock).toHaveBeenCalledWith(
      "/org/acme/projects/proj_1/files/cat?sourcePath=en-US.json&locale=vi",
    );
  });

  it("falls back to a native project target locale when no URL locale is selected", async () => {
    const user = userEvent.setup();
    searchParamsMock.mockReturnValue("sourcePath=en-US.json");

    render(<ProjectFilesPageContent organizationSlug="acme" projectId="proj_1" />);

    await user.dblClick(screen.getByRole("button", { name: "en-US.json" }));

    expect(routerPushMock).toHaveBeenCalledWith(
      "/org/acme/projects/proj_1/files/cat?sourcePath=en-US.json&locale=vi",
    );
  });

  it("shows double-click guidance when a file is selected", () => {
    render(<ProjectFilesPageContent organizationSlug="acme" projectId="proj_1" />);

    expect(
      screen.getByText(/Double-click a file or use View strings to open the CAT workspace for vi/i),
    ).toBeInTheDocument();
  });

  it("shows translate with agent and import/download actions for native project files", () => {
    render(<ProjectFilesPageContent organizationSlug="acme" projectId="proj_1" />);

    expect(screen.getByRole("button", { name: "Translate with agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import translations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("opens the header download dialog for the context-menu file after URL selection updates", async () => {
    const user = userEvent.setup();
    const view = render(<ProjectFilesPageContent organizationSlug="acme" projectId="proj_1" />);

    await user.click(screen.getByRole("button", { name: "Download pricing from context menu" }));

    expect(routerReplaceMock).toHaveBeenCalledWith(
      "/org/acme/projects/proj_1/files?sourcePath=marketing%2Fpricing.json&locale=vi",
      { scroll: false },
    );

    view.rerender(<ProjectFilesPageContent organizationSlug="acme" projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Download translations" })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(pricingFile.sourcePath)).toBeChecked();
  });

  it("passes project target locales to default-layout download actions", async () => {
    const user = userEvent.setup();

    render(
      <ProjectFilesPageContentView
        organizationSlug="acme"
        projectId="proj_1"
        files={[enUsFile]}
        isFilesLoading={false}
        isFilesFetching={false}
        selectedSourcePath="en-US.json"
        highlightLocale={null}
        projectTargetLocales={["vi", "fr-FR"]}
        selectedFiles={[]}
        isUploading={false}
        onSelectSourcePath={() => undefined}
        onAddSelectedFiles={() => undefined}
        onRemoveSelectedFile={() => undefined}
        onUploadSelectedFiles={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(screen.getByText("Target locale")).toBeInTheDocument();
    expect(screen.getByText("vi")).toBeInTheDocument();
    expect(
      screen.queryByText("Add target locales in project settings before downloading translations."),
    ).not.toBeInTheDocument();
  });

  it("preserves open download dialog selections across parent re-renders", async () => {
    const user = userEvent.setup();
    const targetLocales = ["vi", "fr-FR"] as const;
    const nativeSourcePaths = [enUsFile.sourcePath, pricingFile.sourcePath] as const;
    const renderActions = (layout: "default" | "compact") => (
      <ProjectFileSelectionActions
        organizationSlug="acme"
        projectId="proj_1"
        file={enUsFile}
        highlightLocale={null}
        projectTargetLocales={targetLocales}
        nativeSourcePaths={nativeSourcePaths}
        layout={layout}
      />
    );

    const { rerender } = render(renderActions("default"));

    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByLabelText(pricingFile.sourcePath));
    await user.click(screen.getByLabelText("fr-FR"));

    rerender(renderActions("compact"));

    expect(screen.getByLabelText(pricingFile.sourcePath)).toBeChecked();
    expect(screen.getByLabelText("fr-FR")).toBeChecked();
  });

  it("shows when a requested native locale will fall back to a project locale", () => {
    searchParamsMock.mockReturnValue("sourcePath=en-US.json&locale=ja-JP");

    render(<ProjectFilesPageContent organizationSlug="acme" projectId="proj_1" />);

    expect(
      screen.getByText(
        "ja-JP is not a target locale for this file. Double-click a file or use View strings to open the CAT workspace for vi.",
      ),
    ).toBeInTheDocument();
  });
});
