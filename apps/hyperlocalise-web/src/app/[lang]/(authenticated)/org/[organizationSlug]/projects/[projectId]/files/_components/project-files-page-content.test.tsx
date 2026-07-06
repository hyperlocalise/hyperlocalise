// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createProjectFileRecord } from "./project-files.fixture";

const enUsFile = createProjectFileRecord({
  sourcePath: "en-US.json",
  storedFileId: "file_en_us",
  filename: "en-US.json",
});

const { routerPushMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/proj_1/files",
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("sourcePath=en-US.json&locale=vi"),
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
  }: {
    onActivateFile?: (sourcePath: string) => void;
    onLoadedFilesChange?: (files: (typeof enUsFile)[]) => void;
    catOpenHint?: string | null;
    headerActions?: ReactNode;
  }) => {
    useEffect(() => {
      onLoadedFilesChange?.([enUsFile]);
    }, [onLoadedFilesChange]);

    return (
      <div>
        {headerActions}
        {catOpenHint ? <p>{catOpenHint}</p> : null}
        <button type="button" onDoubleClick={() => onActivateFile?.("en-US.json")}>
          en-US.json
        </button>
      </div>
    );
  },
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
    data: { sourceLocale: "en" },
  }),
}));

import { ProjectFilesPageContent } from "./project-files-page-content";

describe("ProjectFilesPageContent CAT entry UX", () => {
  it("opens CAT when a project file is double-clicked", async () => {
    const user = userEvent.setup();
    routerPushMock.mockClear();

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
});
