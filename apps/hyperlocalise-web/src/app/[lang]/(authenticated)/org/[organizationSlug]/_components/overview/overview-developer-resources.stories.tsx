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

import { OverviewDeveloperResources } from "./overview-developer-resources";

const meta = {
  title: "App/Overview/DeveloperResources",
  component: OverviewDeveloperResources,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof OverviewDeveloperResources>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Developer resources" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Documentation/ })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /MCP server/ })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Public API/ })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /Integrations/ })).toBeInTheDocument();
  },
};
