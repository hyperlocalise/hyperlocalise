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
import { expect, userEvent, waitFor, within } from "storybook/test";

import { createVisualEditorFixture, visualEditorFixture } from "./cat-visual-editor.fixture";
import { CatVisualEditorWorkspace } from "./cat-visual-editor-workspace";

const meta = {
  title: "CAT/Visual Editor",
  component: CatVisualEditorWorkspace,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-svh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CatVisualEditorWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

async function selectFileInTree(canvasElement: HTMLElement, sourcePath: string) {
  await waitFor(() => {
    void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
  });

  const treeContainer = canvasElement.querySelector("file-tree-container");
  const fileRow = treeContainer?.shadowRoot?.querySelector(`[data-item-path="${sourcePath}"]`);
  if (!fileRow) {
    throw new Error(`Expected file tree row for ${sourcePath}`);
  }
  await userEvent.click(fileRow);
}

export const Default: Story = {
  args: {
    initialState: visualEditorFixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Files")).toBeInTheDocument();
    await expect(canvas.getByText("Translation Intelligence")).toBeInTheDocument();
    await expect(canvas.getByText("Hero headline")).toBeInTheDocument();
    await expect(canvas.getByText("The platform for modern teams")).toBeInTheDocument();
    await expect(canvas.getAllByText("Die Plattform für moderne Teams").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    await expect(canvas.getByText("Highlight translatable")).toBeInTheDocument();
    await expect(canvas.queryByText("Text node H1")).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-slot="visual-editor-inline-edit"]')).toBeNull();

    await waitFor(() => {
      void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
    });
  },
};

export const SelectNavNode: Story = {
  args: {
    initialState: visualEditorFixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByText("Preise"));
    await expect(canvas.getByText("Primary navigation")).toBeInTheDocument();
    await expect(canvas.getByText("nav.pricing")).toBeInTheDocument();
  },
};

export const SelectFileUpdatesContent: Story = {
  args: {
    initialState: visualEditorFixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await selectFileInTree(canvasElement, "pages/pricing.json");

    await expect(canvas.getByDisplayValue("https://acme.com/de/pricing/")).toBeInTheDocument();
    await expect(canvas.getByText("Pricing headline")).toBeInTheDocument();
    await expect(canvas.getByText("Simple pricing for every team")).toBeInTheDocument();
    await expect(canvas.queryByText("Hero headline")).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-preview-kind="pricing"]')).toBeTruthy();
  },
};

export const EditInPanel: Story = {
  args: {
    initialState: createVisualEditorFixture(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const targetBox = canvas.getByRole("textbox", { name: "Target translation" });

    await userEvent.click(targetBox);
    await userEvent.keyboard("{Control>}a{/Control}Die Plattform für starke Teams");

    await waitFor(() => {
      const preview = canvasElement.querySelector('[data-slot="visual-editor-preview"]');
      void expect(preview?.textContent).toContain("Die Plattform für starke Teams");
    });
  },
};

export const EscapeInCommentKeepsSelection: Story = {
  args: {
    initialState: visualEditorFixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const commentInput = canvas.getByPlaceholderText("Add a comment...");

    await userEvent.click(commentInput);
    await userEvent.type(commentInput, "Keep this draft");
    await userEvent.keyboard("{Escape}");

    await expect(canvas.getByText("Hero headline")).toBeInTheDocument();
    await expect(commentInput).toHaveValue("Keep this draft");
  },
};

export const EmptySelection: Story = {
  args: {
    initialState: createVisualEditorFixture({
      pagesBySourcePath: {
        ...visualEditorFixture.pagesBySourcePath,
        "pages/home.json": {
          ...visualEditorFixture.pagesBySourcePath["pages/home.json"]!,
          defaultSelectedSegmentId: "",
        },
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Click a string in the preview to edit it here."),
    ).toBeInTheDocument();
  },
};

export const ApproveAdvancesToNextOpen: Story = {
  args: {
    initialState: visualEditorFixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: /Approve/i }));
    await expect(canvas.getByText("Hero supporting copy")).toBeInTheDocument();
  },
};

export const MobilePreview: Story = {
  args: {
    initialState: visualEditorFixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Mobile preview" }));
    await expect(canvas.getByRole("button", { name: "Mobile preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};
