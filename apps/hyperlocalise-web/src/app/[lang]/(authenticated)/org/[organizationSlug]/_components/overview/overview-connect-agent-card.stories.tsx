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

import { OverviewConnectAgentCard } from "./overview-connect-agent-card";

const mcpUrl = "https://www.hyperlocalise.com/mcp/sse";

const meta = {
  title: "App/Overview/ConnectAgent",
  component: OverviewConnectAgentCard,
  args: {
    mcpUrl,
  },
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof OverviewConnectAgentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Connect your agent" })).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Install command for Claude" })).toHaveValue(
      `claude mcp add -t http hyperlocalise ${mcpUrl}`,
    );
  },
};

export const Codex: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Codex" }));
    await expect(canvas.getByRole("textbox", { name: "Install command for Codex" })).toHaveValue(
      `codex mcp add hyperlocalise --url ${mcpUrl}`,
    );
  },
};

export const Cursor: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Cursor" }));
    await expect(canvas.getByLabelText("Install command for Cursor")).toHaveTextContent(mcpUrl);
  },
};
