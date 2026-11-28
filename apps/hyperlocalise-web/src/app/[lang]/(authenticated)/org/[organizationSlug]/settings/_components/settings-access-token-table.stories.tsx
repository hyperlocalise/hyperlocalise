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
import { expect, fn, userEvent, within } from "storybook/test";

import type { AccessTokenSummary } from "./access-token-lifecycle";
import { SettingsAccessTokenTable } from "./settings-access-token-table";

function createToken(overrides: Partial<AccessTokenSummary> = {}): AccessTokenSummary {
  return {
    id: "key_001",
    name: "CI sync",
    keyPrefix: "hl_live_4f2a",
    permissions: ["files:read", "files:write", "jobs:read"],
    lastUsedAt: "2026-11-20T09:15:00.000Z",
    revokedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    owner: null,
    ...overrides,
  };
}

const tokens: AccessTokenSummary[] = [
  createToken(),
  createToken({
    id: "key_002",
    name: "Translation memory exporter for the marketing site rebuild",
    keyPrefix: "hl_live_9c1e",
    permissions: [
      "files:read",
      "files:write",
      "jobs:read",
      "jobs:write",
      "memories:read",
      "memories:write",
      "reports:read",
    ],
    lastUsedAt: null,
  }),
  createToken({
    id: "key_003",
    name: "Old staging key",
    keyPrefix: "hl_live_77b0",
    permissions: ["jobs:read"],
    revokedAt: "2026-10-02T00:00:00.000Z",
  }),
];

const meta = {
  title: "App/Settings/Access token table",
  component: SettingsAccessTokenTable,
  parameters: { layout: "padded" },
  args: {
    tokens,
    canRevoke: true,
    neverUsedLabel: "Never used",
    revokedLabel: "Revoked",
    revokeLabel: "Revoke",
    onRevoke: fn(),
    revokePending: false,
  },
} satisfies Meta<typeof SettingsAccessTokenTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // Revoked keys have no Revoke action.
    const revokeButtons = canvas.getAllByRole("button", { name: "Revoke" });
    await expect(revokeButtons).toHaveLength(2);
    await expect(canvas.getByText("Never used")).toBeVisible();
    await userEvent.click(revokeButtons[0]);
    await expect(args.onRevoke).toHaveBeenCalledWith(tokens[0]);
  },
};

export const ReadOnly: Story = {
  args: { canRevoke: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  },
};

export const RevokePending: Story = {
  args: { revokePending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const button of canvas.getAllByRole("button", { name: "Revoke" })) {
      await expect(button).toBeDisabled();
    }
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
