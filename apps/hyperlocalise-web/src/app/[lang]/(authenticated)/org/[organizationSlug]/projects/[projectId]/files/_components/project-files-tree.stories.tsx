import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor } from "storybook/test";

import { ProjectFilesTree } from "./project-files-tree";
import { projectFilesFixture } from "./project-files.fixture";

const meta = {
  title: "App/Project/Files/Tree",
  component: ProjectFilesTree,
  parameters: {
    layout: "padded",
  },
  args: {
    files: projectFilesFixture,
    selectedSourcePath: projectFilesFixture[0]?.sourcePath ?? null,
    onSelectFile: fn(),
  },
} satisfies Meta<typeof ProjectFilesTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
    });
  },
};

export const SelectFile: Story = {
  play: async ({ canvasElement, args }) => {
    await waitFor(() => {
      void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
    });

    const treeContainer = canvasElement.querySelector("file-tree-container");
    const pricingRow = treeContainer?.shadowRoot?.querySelector(
      '[data-item-path="marketing/pricing.json"]',
    );
    if (!pricingRow) {
      throw new Error("Expected pricing.json row in file tree");
    }

    await userEvent.click(pricingRow);
    await expect(args.onSelectFile).toHaveBeenCalledWith("marketing/pricing.json");
  },
};
