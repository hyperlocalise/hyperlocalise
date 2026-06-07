import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ProjectFileDetailPanelView } from "./project-file-detail-panel";
import { ProjectFilesPageContentView } from "./project-files-page-content";
import {
  createProjectFileDetail,
  createProjectFileRecord,
  projectFilesFixture,
  providerProjectFilesFixture,
  selectedUploadFiles,
} from "./project-files.fixture";

const selectedFile = projectFilesFixture[0] ?? createProjectFileRecord();
const selectedDetail = createProjectFileDetail(selectedFile);

const meta = {
  title: "App/Project/Files/Page",
  component: ProjectFilesPageContentView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    canFindInRepo: true,
    files: projectFilesFixture,
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
    renderDetailPanel: (props) => (
      <ProjectFileDetailPanelView
        {...props}
        isLoading={false}
        detail={props.file?.sourcePath === selectedDetail.sourcePath ? selectedDetail : undefined}
        renderSourceStringsPreview={({ sourceStrings }) => (
          <div className="rounded-md border border-foreground/8 bg-background p-3 text-xs text-foreground/72">
            {sourceStrings.entries.length} parsed strings ready for repository lookup.
          </div>
        )}
      />
    ),
  },
} satisfies Meta<typeof ProjectFilesPageContentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RepositoryFiles: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Files" })).toBeInTheDocument();
    await expect(canvas.getByText("Project files")).toBeInTheDocument();
    await expect(canvas.getByText("marketing/home.json")).toBeInTheDocument();
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
    selectedSourcePath: providerProjectFilesFixture[0]?.sourcePath ?? null,
    selectedFiles: [],
    renderDetailPanel: (props) => (
      <ProjectFileDetailPanelView
        {...props}
        isLoading={false}
        detail={props.file ? createProjectFileDetail(props.file) : undefined}
        renderSourceStringsPreview={({ sourceStrings }) => (
          <div className="rounded-md border border-foreground/8 bg-background p-3 text-xs text-foreground/72">
            {sourceStrings.entries.length} provider strings loaded.
          </div>
        )}
      />
    ),
  },
};

export const LoadingFiles: Story = {
  args: {
    files: [],
    isFilesLoading: true,
    selectedSourcePath: null,
    renderDetailPanel: (props) => (
      <ProjectFileDetailPanelView {...props} isLoading={false} detail={undefined} />
    ),
  },
};

export const EmptyRepository: Story = {
  args: {
    files: [],
    selectedSourcePath: null,
    renderDetailPanel: (props) => (
      <ProjectFileDetailPanelView {...props} isLoading={false} detail={undefined} />
    ),
  },
};

export const LoadError: Story = {
  args: {
    files: [],
    filesError: new Error("The files API returned a 500."),
    selectedSourcePath: null,
    renderDetailPanel: (props) => (
      <ProjectFileDetailPanelView {...props} isLoading={false} detail={undefined} />
    ),
  },
};
