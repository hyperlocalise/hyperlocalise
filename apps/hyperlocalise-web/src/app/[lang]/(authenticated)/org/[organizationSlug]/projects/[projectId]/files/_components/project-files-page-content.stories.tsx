import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { TypographyP } from "@/components/ui/typography";

import { ProjectSectionTitle } from "../../_components/project-page-shell";
import { ProjectFileSelectionActions } from "./project-file-selection-actions";
import { ProjectFilesPageContentView } from "./project-files-page-content";
import { ProjectFilesTree } from "./project-files-tree";
import {
  createProjectFileRecord,
  projectFilesFixture,
  providerProjectFilesFixture,
  selectedUploadFiles,
} from "./project-files.fixture";

const selectedFile = projectFilesFixture[0] ?? createProjectFileRecord();

function storyFilesTree({
  files,
  selectedSourcePath,
  onSelectSourcePath,
  organizationSlug,
  projectId,
  highlightLocale,
}: {
  files: typeof projectFilesFixture;
  selectedSourcePath: string | null;
  onSelectSourcePath: (sourcePath: string | null) => void;
  organizationSlug: string;
  projectId: string;
  highlightLocale: string | null;
}) {
  return (selectedFileRecord: ReturnType<typeof createProjectFileRecord> | null) => (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-foreground/8 px-4 py-3">
        <div>
          <ProjectSectionTitle>Project files</ProjectSectionTitle>
          <TypographyP className="mt-0.5 text-sm text-foreground/52">
            {files.length} file{files.length === 1 ? "" : "s"}
          </TypographyP>
        </div>
      </header>

      {selectedFileRecord ? (
        <ProjectFileSelectionActions
          organizationSlug={organizationSlug}
          projectId={projectId}
          file={selectedFileRecord}
          highlightLocale={highlightLocale}
        />
      ) : null}

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
      expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
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
    projectId: "crowdin:project_website",
    files: providerProjectFilesFixture,
    resolvedFiles: providerProjectFilesFixture,
    selectedSourcePath: providerProjectFilesFixture[0]?.sourcePath ?? null,
    selectedFiles: [],
    filesTree: storyFilesTree({
      files: providerProjectFilesFixture,
      selectedSourcePath: providerProjectFilesFixture[0]?.sourcePath ?? null,
      onSelectSourcePath: () => undefined,
      organizationSlug: "acme",
      projectId: "crowdin:project_website",
      highlightLocale: "fr-FR",
    }),
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
