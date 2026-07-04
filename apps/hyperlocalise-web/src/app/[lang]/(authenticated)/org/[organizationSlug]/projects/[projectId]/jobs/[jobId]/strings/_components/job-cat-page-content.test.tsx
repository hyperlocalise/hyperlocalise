// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";

const { useProjectPageQueryMock, useAppShellSidebarMock } = vi.hoisted(() => ({
  useProjectPageQueryMock: vi.fn(),
  useAppShellSidebarMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
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

vi.mock("./job-cat-source-file-picker", () => ({
  JobCatSourceFilePicker: () => <div>Choose a source file to open in the CAT workspace.</div>,
}));

vi.mock("./load-job-cat-files", () => ({
  loadJobCatTargetFile: vi.fn(),
  loadJobCatProviderJobFiles: vi.fn(),
}));

import { JobCatPageContent } from "./job-cat-page-content";

describe("JobCatPageContent guard ordering", () => {
  it("shows the source file picker when no file reference is present", () => {
    useProjectPageQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    });

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
      screen.getByText("Choose a source file to open in the CAT workspace."),
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
});
