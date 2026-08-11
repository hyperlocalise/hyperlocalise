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

export const Default: Story = {
  args: {
    initialState: visualEditorFixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Files")).toBeInTheDocument();
    await expect(canvas.getByText("Translation Intelligence")).toBeInTheDocument();
    await expect(canvas.getByText("Text node H1")).toBeInTheDocument();
    await expect(canvas.getByText("The platform for modern teams")).toBeInTheDocument();
    await expect(canvas.getAllByText("Die Plattform für moderne Teams").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    await expect(canvas.getByText("Highlight translatable")).toBeInTheDocument();

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
    await expect(canvas.getByText("Text node A")).toBeInTheDocument();
    await expect(canvas.getByText("nav.pricing")).toBeInTheDocument();
  },
};

export const EditInlineHero: Story = {
  args: {
    initialState: createVisualEditorFixture(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const inlineInput = canvasElement.querySelector(
      '[data-slot="visual-editor-inline-edit"] input',
    );
    if (!(inlineInput instanceof HTMLInputElement)) {
      throw new Error("Expected inline edit input for the selected hero title");
    }

    await userEvent.clear(inlineInput);
    await userEvent.type(inlineInput, "Die Plattform für starke Teams");
    await expect(canvas.getByDisplayValue("Die Plattform für starke Teams")).toBeInTheDocument();
  },
};

export const EmptySelection: Story = {
  args: {
    initialState: createVisualEditorFixture({ selectedSegmentId: "" }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Select a highlighted string in the preview to edit it."),
    ).toBeInTheDocument();
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
