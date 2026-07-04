// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";

const { useProjectPageQueryMock, useAppShellSidebarMock } = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  useAppShellSidebarMock: vi.fn(),
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
  fetchProjectFiles: vi.fn(),
  findCachedProjectFiles: vi.fn(() => undefined),
  projectFilesQueryKey: () => ["project-files"],
}));

import { ProjectFileCatPageContent } from "./project-file-cat-page-content";

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
    expect(screen.queryByText("This project does not have a source locale.")).not.toBeInTheDocument();
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
    expect(screen.queryByText("This project does not have a source locale.")).not.toBeInTheDocument();
  });
});
