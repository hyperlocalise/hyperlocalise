/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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

    const treeContainer = canvasElement.querySelector("file-tree-container");
    const searchInput = treeContainer?.shadowRoot?.querySelector("[data-file-tree-search-input]");
    if (!(searchInput instanceof HTMLInputElement)) {
      throw new Error("Expected built-in file tree search input");
    }
    await expect(searchInput.getAttribute("aria-label")).toBe("Search files");

    await userEvent.type(searchInput, "pricing");

    await waitFor(() => {
      const pricingRow = treeContainer?.shadowRoot?.querySelector(
        '[data-item-path="marketing/pricing.json"]',
      );
      const homeRow = treeContainer?.shadowRoot?.querySelector(
        '[data-item-path="marketing/home.json"]',
      );
      void expect(pricingRow).toBeTruthy();
      void expect(homeRow).toBeFalsy();
    });
  },
};
