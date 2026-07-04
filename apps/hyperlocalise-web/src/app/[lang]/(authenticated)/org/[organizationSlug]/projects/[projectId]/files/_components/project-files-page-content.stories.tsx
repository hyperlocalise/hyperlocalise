import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ProjectFilesPageContentView } from "./project-files-page-content";
import {
  createProjectFileRecord,
  projectFilesFixture,
  providerProjectFilesFixture,
  selectedUploadFiles,
} from "./project-files.fixture";

const selectedFile = projectFilesFixture[0] ?? createProjectFileRecord();

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
  },
} satisfies Meta<typeof ProjectFilesPageContentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RepositoryFiles: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Files" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Project files" })).toBeInTheDocument();
    await expect(canvas.getByText("marketing/home.json")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "View strings" })).toBeInTheDocument();
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
  },
};

export const LoadingFiles: Story = {
  args: {
    files: [],
    isFilesLoading: true,
    selectedSourcePath: null,
  },
};

export const EmptyRepository: Story = {
  args: {
    files: [],
    selectedSourcePath: null,
  },
};

export const LoadError: Story = {
  args: {
    files: [],
    filesError: new Error("The files API returned a 500."),
    selectedSourcePath: null,
  },
};
