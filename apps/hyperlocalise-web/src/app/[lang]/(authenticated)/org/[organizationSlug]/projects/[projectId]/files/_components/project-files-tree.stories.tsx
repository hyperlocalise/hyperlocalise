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

export const SearchFiles: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
    });

    const searchInput = canvasElement.querySelector('input[aria-label="Search files"]');
    if (!(searchInput instanceof HTMLInputElement)) {
      throw new Error("Expected search input above file tree");
    }

    await userEvent.type(searchInput, "pricing");

    await waitFor(() => {
      const treeContainer = canvasElement.querySelector("file-tree-container");
      const pricingRow = treeContainer?.shadowRoot?.querySelector(
        '[data-item-path="marketing/pricing.json"]',
      );
      const homepageRow = treeContainer?.shadowRoot?.querySelector(
        '[data-item-path="marketing/homepage.json"]',
      );
      void expect(pricingRow).toBeTruthy();
      void expect(homepageRow).toBeFalsy();
    });
  },
};
