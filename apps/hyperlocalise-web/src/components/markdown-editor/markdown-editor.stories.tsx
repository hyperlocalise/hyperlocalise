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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { MarkdownEditor, MarkdownPreview } from "./markdown-editor";
import { markdownEditorImageMswHandlers } from "./markdown-editor-msw-handlers";

const sampleMarkdown = [
  "## Launch notes",
  "",
  "Keep product names in English.",
  "",
  "- Confirm tone with legal",
  "- [ ] Ready for review",
].join("\n");

const markdownWithImage = [
  "## Campaign banner",
  "",
  "Draft hero for the German launch page:",
  "",
  "![Launch banner](https://placehold.co/640x360/png?text=Launch+banner)",
  "",
  "Keep the product name in English.",
].join("\n");

const markdownWithProxyImage = [
  "## Uploaded asset",
  "",
  "![Story upload](/api/orgs/acme/files/file_story_demo)",
  "",
  "Paste or drop another image, or use `/image`.",
].join("\n");

function MarkdownEditorHost({
  initialValue,
  chrome = "default",
  compact = false,
  imageUpload = null,
  onChange = fn(),
}: {
  initialValue: string;
  chrome?: "default" | "minimal";
  compact?: boolean;
  imageUpload?: { organizationSlug: string; projectId?: string | null } | null;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <MarkdownEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      chrome={chrome}
      compact={compact}
      imageUpload={imageUpload}
      ariaLabel="Markdown editor"
      placeholder="Write, or type / for blocks…"
    />
  );
}

const meta = {
  title: "Components/Markdown Editor",
  component: MarkdownEditor,
  render: (args) => (
    <div className="max-w-2xl p-6">
      <MarkdownEditorHost
        initialValue={typeof args.value === "string" ? args.value : sampleMarkdown}
        chrome={args.chrome}
        compact={args.compact}
        imageUpload={args.imageUpload}
      />
    </div>
  ),
  args: {
    value: sampleMarkdown,
    onChange: fn(),
    chrome: "default",
    compact: false,
    imageUpload: null,
  },
} satisfies Meta<typeof MarkdownEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Launch notes" })).toBeInTheDocument();
  },
};

export const WithImage: Story = {
  args: {
    value: markdownWithImage,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
    await expect(await canvas.findByRole("img", { name: "Launch banner" })).toBeInTheDocument();
  },
};

export const WithImageUpload: Story = {
  args: {
    value: markdownWithProxyImage,
    imageUpload: { organizationSlug: "acme", projectId: "proj_demo" },
  },
  parameters: {
    msw: {
      handlers: markdownEditorImageMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Insert image" })).toBeInTheDocument();
    await expect(await canvas.findByRole("img", { name: "Story upload" })).toBeInTheDocument();
  },
};

export const MinimalChrome: Story = {
  args: {
    value: markdownWithImage,
    chrome: "minimal",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Insert image" })).not.toBeInTheDocument();
    await expect(await canvas.findByRole("img", { name: "Launch banner" })).toBeInTheDocument();
  },
};

export const Preview: Story = {
  render: () => (
    <div className="max-w-2xl space-y-4 p-6">
      <MarkdownPreview value={markdownWithImage} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("img", { name: "Launch banner" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Campaign banner" })).toBeInTheDocument();
  },
};

export const SlashImageCommand: Story = {
  args: {
    value: "",
    imageUpload: null,
  },
  play: async ({ canvas }) => {
    const editor = canvas.getByRole("textbox", { name: "Markdown editor" });
    await userEvent.click(editor);
    await userEvent.keyboard("/");
    await expect(await canvas.findByText("Image")).toBeInTheDocument();
  },
};
