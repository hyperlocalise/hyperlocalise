/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ProjectFileDetailPanelView } from "./project-file-detail-panel";
import {
  createProjectFileDetail,
  createProjectFileRecord,
  projectFilesFixture,
} from "./project-files.fixture";

const selectedFile = projectFilesFixture[0] ?? createProjectFileRecord();

const meta = {
  title: "App/Project/Files/Detail Panel",
  component: ProjectFileDetailPanelView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    file: selectedFile,
    requestedSourcePath: selectedFile.sourcePath,
    highlightLocale: "fr-FR",
    targetLocales: ["fr-FR", "de-DE"],
    isLoading: false,
    detail: createProjectFileDetail(selectedFile),
  },
} satisfies Meta<typeof ProjectFileDetailPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MetadataOnly: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("marketing/home.json")).toBeInTheDocument();
    await expect(canvas.getByText("fr-FR")).toBeInTheDocument();
    await expect(canvas.queryByText("Source preview")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Content Editor")).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    detail: undefined,
  },
};

export const LoadError: Story = {
  args: {
    error: new Error("The file detail API returned a 500."),
    detail: undefined,
  },
};

export const EmptySelection: Story = {
  args: {
    file: null,
    requestedSourcePath: null,
    detail: undefined,
  },
};

export const IngestPending: Story = {
  args: {
    file: createProjectFileRecord({
      sourcePath: "pages/formatting-test.html",
      filename: "formatting-test.html",
      latestJob: null,
      ingestState: "pending",
    }),
    requestedSourcePath: "pages/formatting-test.html",
    highlightLocale: null,
    detail: createProjectFileDetail(
      createProjectFileRecord({
        sourcePath: "pages/formatting-test.html",
        filename: "formatting-test.html",
        latestJob: null,
        ingestState: "pending",
      }),
      {
        versions: [
          {
            ...createProjectFileDetail().versions[0]!,
            sourcePath: "pages/formatting-test.html",
            filename: "formatting-test.html",
            ingestState: "pending",
            content: { sourceStrings: { truncated: false, entries: [] } },
          },
        ],
        jobsByLocale: [],
      },
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Extracting segments…")).toBeInTheDocument();
  },
};

export const IngestFailed: Story = {
  args: {
    file: createProjectFileRecord({
      sourcePath: "pages/formatting-test.html",
      filename: "formatting-test.html",
      latestJob: null,
      ingestState: "failed",
      ingestError: "sandbox install failed",
    }),
    requestedSourcePath: "pages/formatting-test.html",
    highlightLocale: null,
    detail: createProjectFileDetail(
      createProjectFileRecord({
        sourcePath: "pages/formatting-test.html",
        filename: "formatting-test.html",
        latestJob: null,
        ingestState: "failed",
        ingestError: "sandbox install failed",
      }),
      {
        versions: [
          {
            ...createProjectFileDetail().versions[0]!,
            sourcePath: "pages/formatting-test.html",
            filename: "formatting-test.html",
            ingestState: "failed",
            ingestError: "sandbox install failed",
            content: { sourceStrings: { truncated: false, entries: [] } },
          },
        ],
        jobsByLocale: [],
      },
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Segment extraction failed: sandbox install failed"),
    ).toBeInTheDocument();
  },
};

export const FileNotFound: Story = {
  args: {
    file: null,
    requestedSourcePath: "marketing/missing.json",
    detail: undefined,
  },
};
