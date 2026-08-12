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
import { expect, userEvent } from "storybook/test";

import { markdownEditorImageMswHandlers } from "@/components/markdown-editor/markdown-editor-msw-handlers";

import { IssueMarkdownField } from "./issue-markdown-field";

const description = [
  "Review the German headline on the launch page.",
  "",
  "- Keep product names in English",
  "- [ ] Confirm with legal",
].join("\n");

const descriptionWithImage = [
  "Review the German headline on the launch page.",
  "",
  "![Launch banner](https://placehold.co/640x360/png?text=Launch+banner)",
  "",
  "- Keep product names in English",
  "- [ ] Confirm with legal",
].join("\n");

const meta = {
  title: "App/Issues/Markdown Field",
  component: IssueMarkdownField,
  render: (args) => (
    <div className="max-w-2xl p-6">
      <IssueMarkdownField {...args} />
    </div>
  ),
} satisfies Meta<typeof IssueMarkdownField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreviewWithMarkdown: Story = {
  args: {
    value: description,
    onChange: () => {},
    onCommit: () => {},
    ariaLabel: "Description",
    emptyMessage: "No description",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Description")).toBeInTheDocument();
  },
};

export const PreviewWithImage: Story = {
  args: {
    value: descriptionWithImage,
    onChange: () => {},
    onCommit: () => {},
    ariaLabel: "Description",
    emptyMessage: "No description",
    imageUpload: { organizationSlug: "acme", projectId: "proj_demo" },
  },
  parameters: {
    msw: {
      handlers: markdownEditorImageMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Description")).toBeInTheDocument();
    await expect(await canvas.findByRole("img", { name: "Launch banner" })).toBeInTheDocument();
  },
};

export const Editing: Story = {
  args: {
    value: description,
    onChange: () => {},
    onCommit: () => {},
    ariaLabel: "Description",
    emptyMessage: "No description",
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Description"));
    await expect(canvas.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
  },
};

export const EditingWithImageUpload: Story = {
  args: {
    value: descriptionWithImage,
    onChange: () => {},
    onCommit: () => {},
    ariaLabel: "Description",
    emptyMessage: "No description",
    imageUpload: { organizationSlug: "acme", projectId: "proj_demo" },
  },
  parameters: {
    msw: {
      handlers: markdownEditorImageMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Description"));
    await expect(canvas.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
    await expect(await canvas.findByRole("img", { name: "Launch banner" })).toBeInTheDocument();
  },
};
