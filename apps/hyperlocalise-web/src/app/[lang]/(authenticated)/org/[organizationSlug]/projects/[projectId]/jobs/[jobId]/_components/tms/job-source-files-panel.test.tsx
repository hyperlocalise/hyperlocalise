// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

const { routerPushMock, lastTreePropsRef } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  lastTreePropsRef: { current: null as { onActivateFile?: (sourcePath: string) => void } | null },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

vi.mock("../../../../files/_components/project-files-tree", () => ({
  ProjectFilesTree: (props: {
    files: Array<{ sourcePath: string }>;
    onSelectFile: (sourcePath: string) => void;
    onActivateFile?: (sourcePath: string) => void;
  }) => {
    lastTreePropsRef.current = props;

    return (
      <div>
        {props.files.map((file) => (
          <button
            key={file.sourcePath}
            type="button"
            onClick={() => props.onSelectFile(file.sourcePath)}
            onDoubleClick={() => props.onActivateFile?.(file.sourcePath)}
          >
            {file.sourcePath}
          </button>
        ))}
      </div>
    );
  },
}));

import { JobSourceFilesPanel } from "./job-source-files-panel";

const nativeFile = createProjectFileRecord({
  sourcePath: "en-US.json",
  storedFileId: "en-US.json",
  filename: "en-US.json",
});

describe("JobSourceFilesPanel CAT entry UX", () => {
  it("shows View strings when files are selected from the task detail panel", () => {
    render(
      <JobSourceFilesPanel
        organizationSlug="acme"
        projectId="proj_1"
        encodedJobId="job_1"
        files={[nativeFile]}
        highlightLocale="vi"
        openInCatOnSelect={false}
      />,
    );

    expect(screen.getByRole("link", { name: "View strings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View strings" })).toHaveAttribute(
      "href",
      "/org/acme/projects/proj_1/jobs/job_1/strings?targetLocale=vi&storedFileId=en-US.json",
    );
    expect(
      screen.getByText(/Double-click a file or use View strings to open the CAT workspace/i),
    ).toBeInTheDocument();
  });

  it("opens CAT when a file is double-clicked from the task detail panel", async () => {
    const user = userEvent.setup();
    routerPushMock.mockClear();

    render(
      <JobSourceFilesPanel
        organizationSlug="acme"
        projectId="proj_1"
        encodedJobId="job_1"
        files={[nativeFile]}
        highlightLocale="vi"
        openInCatOnSelect={false}
      />,
    );

    await user.dblClick(screen.getByRole("button", { name: "en-US.json" }));

    expect(routerPushMock).toHaveBeenCalledWith(
      "/org/acme/projects/proj_1/jobs/job_1/strings?targetLocale=vi&storedFileId=en-US.json",
    );
  });

  it("opens CAT immediately when openInCatOnSelect is enabled", async () => {
    const user = userEvent.setup();
    routerPushMock.mockClear();

    render(
      <JobSourceFilesPanel
        organizationSlug="acme"
        projectId="proj_1"
        encodedJobId="job_1"
        files={[nativeFile]}
        highlightLocale="vi"
        openInCatOnSelect
      />,
    );

    await user.click(screen.getByRole("button", { name: "en-US.json" }));

    expect(routerPushMock).toHaveBeenCalledWith(
      "/org/acme/projects/proj_1/jobs/job_1/strings?targetLocale=vi&storedFileId=en-US.json",
    );
    expect(screen.queryByRole("link", { name: "View strings" })).not.toBeInTheDocument();
  });

  it("does not wire onActivateFile when openInCatOnSelect is enabled", () => {
    render(
      <JobSourceFilesPanel
        organizationSlug="acme"
        projectId="proj_1"
        encodedJobId="job_1"
        files={[nativeFile]}
        highlightLocale="vi"
        openInCatOnSelect
      />,
    );

    expect(lastTreePropsRef.current?.onActivateFile).toBeUndefined();
  });

  it("wires onActivateFile when openInCatOnSelect is disabled", () => {
    render(
      <JobSourceFilesPanel
        organizationSlug="acme"
        projectId="proj_1"
        encodedJobId="job_1"
        files={[nativeFile]}
        highlightLocale="vi"
        openInCatOnSelect={false}
      />,
    );

    expect(lastTreePropsRef.current?.onActivateFile).toBeTypeOf("function");
  });
});
