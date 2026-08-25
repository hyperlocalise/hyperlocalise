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
import { expect, fn, userEvent } from "storybook/test";

import {
  createKnowledgeEditorViewFixture,
  japanMarketPlaybookMemoryFixture,
} from "./knowledge.fixture";
import { KnowledgePageView } from "./knowledge-page-view";

const meta = {
  title: "App/Knowledge/Page",
  component: KnowledgePageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    mode: "upload",
    onStartMarkdownText: fn(),
    onAddSources: fn(),
    onFilesSelected: fn(),
  },
} satisfies Meta<typeof KnowledgePageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "Guideline" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Upload guideline" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add Google Drive" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Markdown/Text" })).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Add existing knowledge" }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Blank table" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Markdown/Text" }));
    await expect(args.onStartMarkdownText).toHaveBeenCalled();
  },
};

export const ProjectGuideline: Story = {
  args: {
    mode: "editor",
    scope: "project",
    editor: createKnowledgeEditorViewFixture({
      scope: "project",
      hasChanges: true,
      canSave: true,
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Project")).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Guideline" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Project guidance" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  },
};

export const WithMemory: Story = {
  args: {
    mode: "editor",
    editor: createKnowledgeEditorViewFixture({
      hasChanges: true,
      canSave: true,
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Guideline" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Global guidance" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add sources" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "History" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    await expect(canvas.getByText("Unsaved changes")).toBeInTheDocument();
    await expect(canvas.queryByText("Retrieval preview")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();

    await expect(
      await canvas.findByRole("heading", { name: "Japanese voice" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText(/です・ます調/)).toBeInTheDocument();
    await expect(await canvas.findByText(/ワークスペース/)).toBeInTheDocument();
  },
};

export const JapanMarketPlaybook: Story = {
  args: {
    mode: "editor",
    editor: createKnowledgeEditorViewFixture({
      savedKnowledgeMemory: japanMarketPlaybookMemoryFixture,
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Global guidance" })).toBeInTheDocument();
    await expect(canvas.getByText("Version 4")).toBeInTheDocument();
    await expect(canvas.getByText("All changes saved")).toBeInTheDocument();

    await expect(
      await canvas.findByRole("heading", { name: "Japan market playbook" }),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByRole("heading", { name: "Japan launch calendar" }),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByRole("heading", { name: "Japan support expectations" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText(/銀行振込/)).toBeInTheDocument();
    await expect(await canvas.findByText(/ゴールデンウィーク/)).toBeInTheDocument();
  },
};

export const SaveDialog: Story = {
  args: {
    mode: "editor",
    editor: createKnowledgeEditorViewFixture({
      hasChanges: true,
      canSave: true,
    }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(canvas.getByRole("dialog")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save version" })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    mode: "loading",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Guideline" })).toBeInTheDocument();
    await expect(canvas.getByRole("status")).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Upload guideline" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Global guidance" }),
    ).not.toBeInTheDocument();
  },
};

export const ReadOnly: Story = {
  args: {
    mode: "editor",
    editor: createKnowledgeEditorViewFixture({
      canUpdateKnowledgeMemory: false,
      canSave: false,
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Global guidance" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add sources" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "History" })).toBeInTheDocument();
  },
};
