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

import { IssueMarkdownField } from "./issue-markdown-field";

const description = [
  "Review the German headline on the launch page.",
  "",
  "- Keep product names in English",
  "- [ ] Confirm with legal",
].join("\n");

const meta = {
  title: "App/Issues/Issue Markdown Field",
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
