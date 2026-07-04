import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";

import { TypographyP } from "@/components/ui/typography";

import { ProjectSectionTitle } from "../../_components/project-page-shell";
import { ProjectFileSelectionActions } from "./project-file-selection-actions";
import { ProjectFilesBranchFilterView } from "./project-files-branch-filter-view";
import { ProjectFilesPageContentView } from "./project-files-page-content";
import { ProjectFilesTree } from "./project-files-tree";
import {
  createProjectFileRecord,
  projectFilesFixture,
  providerProjectBranchesFixture,
  providerProjectFilesFixture,
  selectedUploadFiles,
} from "./project-files.fixture";

const providerProjectId = "ext:crowdin:project_website";
const selectedFile = projectFilesFixture[0] ?? createProjectFileRecord();
const selectedProviderFile = providerProjectFilesFixture[0] ?? createProjectFileRecord();

function storyFilesTree({
  files,
  selectedSourcePath,
  onSelectSourcePath,
  organizationSlug,
  projectId,
  highlightLocale,
  showBranchFilter = false,
  selectedBranch = null,
  onSelectBranch,
}: {
  files: typeof projectFilesFixture;
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
  organizationSlug: string;
  projectId: string;
  highlightLocale: string | null;
  showBranchFilter?: boolean;
  selectedBranch?: string | null;
  onSelectBranch?: (branch: string | null) => void;
}) {
  return (selectedFileRecord: ReturnType<typeof createProjectFileRecord> | null) => (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <ProjectSectionTitle>Project files</ProjectSectionTitle>
          <TypographyP className="mt-0.5 text-sm text-muted-foreground">
            {files.length} file{files.length === 1 ? "" : "s"}
          </TypographyP>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {showBranchFilter ? (
            <ProjectFilesBranchFilterView
              branches={providerProjectBranchesFixture}
              selectedBranch={selectedBranch}
              onSelectedBranchChange={onSelectBranch ?? (() => undefined)}
            />
          ) : null}
          {selectedFileRecord ? (
            <ProjectFileSelectionActions
              organizationSlug={organizationSlug}
              projectId={projectId}
              file={selectedFileRecord}
              highlightLocale={highlightLocale}
              layout="compact"
            />
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 p-2">
        <ProjectFilesTree
          files={files}
          selectedSourcePath={selectedSourcePath}
          onSelectFile={(sourcePath) => onSelectSourcePath(sourcePath)}
        />
      </div>
    </>
  );
}

const meta = {
  title: "App/Project/Files/Page",
  component: ProjectFilesPageContentView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    files: projectFilesFixture,
    resolvedFiles: projectFilesFixture,
    isFilesLoading: false,
    isFilesFetching: false,
    selectedSourcePath: selectedFile.sourcePath,
    highlightLocale: "fr-FR",
    selectedFiles: [],
    isUploading: false,
    onSelectSourcePath: () => undefined,
    onAddSelectedFiles: () => undefined,
    onRemoveSelectedFile: () => undefined,
    onUploadSelectedFiles: () => undefined,
    filesTree: storyFilesTree({
      files: projectFilesFixture,
      selectedSourcePath: selectedFile.sourcePath,
      onSelectSourcePath: () => undefined,
      organizationSlug: "acme",
      projectId: "project_website",
      highlightLocale: "fr-FR",
    }),
  },
} satisfies Meta<typeof ProjectFilesPageContentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RepositoryFiles: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Files" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Project files" })).toBeInTheDocument();
    await expect(canvas.getByText("3 files")).toBeInTheDocument();
    await expect(canvas.getAllByText("marketing/home.json").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("link", { name: "View strings" })).toBeInTheDocument();
    await waitFor(() => {
      void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
    });
  },
};

export const ReadyToUpload: Story = {
  args: {
    selectedFiles: selectedUploadFiles,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ready to upload")).toBeInTheDocument();
    await expect(canvas.getByText("marketing/new-checkout.json")).toBeInTheDocument();
  },
};

export const Uploading: Story = {
  args: {
    selectedFiles: selectedUploadFiles,
    isUploading: true,
  },
};

export const ProviderFiles: Story = {
  args: {
    projectId: providerProjectId,
    isProviderProject: true,
    files: providerProjectFilesFixture,
    resolvedFiles: providerProjectFilesFixture,
    selectedSourcePath: selectedProviderFile.sourcePath,
    selectedFiles: [],
    filesTree: storyFilesTree({
      files: providerProjectFilesFixture,
      selectedSourcePath: selectedProviderFile.sourcePath,
      onSelectSourcePath: () => undefined,
      organizationSlug: "acme",
      projectId: providerProjectId,
      highlightLocale: "fr-FR",
      showBranchFilter: true,
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Branch")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "View strings" })).toBeInTheDocument();
  },
};

export const ProviderFilesBranchSelected: Story = {
  render: (args) => {
    const [selectedBranch, setSelectedBranch] = useState<string | null>("main");

    return (
      <ProjectFilesPageContentView
        {...args}
        selectedBranch={selectedBranch}
        filesTree={storyFilesTree({
          files: providerProjectFilesFixture,
          selectedSourcePath: selectedProviderFile.sourcePath,
          onSelectSourcePath: () => undefined,
          organizationSlug: "acme",
          projectId: providerProjectId,
          highlightLocale: "fr-FR",
          showBranchFilter: true,
          selectedBranch,
          onSelectBranch: setSelectedBranch,
        })}
      />
    );
  },
  args: {
    organizationSlug: "acme",
    projectId: providerProjectId,
    isProviderProject: true,
    files: providerProjectFilesFixture,
    resolvedFiles: providerProjectFilesFixture,
    selectedSourcePath: selectedProviderFile.sourcePath,
    highlightLocale: "fr-FR",
    selectedBranch: "main",
    selectedFiles: [],
    isUploading: false,
    isFilesLoading: false,
    isFilesFetching: false,
    onSelectSourcePath: () => undefined,
    onAddSelectedFiles: () => undefined,
    onRemoveSelectedFile: () => undefined,
    onUploadSelectedFiles: () => undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Branch")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox")).toHaveTextContent("Main (main)");
  },
};

export const LoadingFiles: Story = {
  args: {
    files: [],
    isFilesLoading: true,
    selectedSourcePath: null,
    filesTree: undefined,
  },
};

export const EmptyRepository: Story = {
  args: {
    files: [],
    selectedSourcePath: null,
    filesTree: storyFilesTree({
      files: [],
      selectedSourcePath: null,
      onSelectSourcePath: () => undefined,
      organizationSlug: "acme",
      projectId: "project_website",
      highlightLocale: null,
    }),
  },
};

export const LoadError: Story = {
  args: {
    files: [],
    filesError: new Error("The files API returned a 500."),
    selectedSourcePath: null,
    filesTree: undefined,
  },
};
