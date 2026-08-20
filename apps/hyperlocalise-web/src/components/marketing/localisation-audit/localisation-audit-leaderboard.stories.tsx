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

import { LocalisationAuditLeaderboard } from "./localisation-audit-leaderboard";
import { localisationAuditLeaderboardEntries } from "./localisation-audit.fixture";

const meta = {
  title: "Marketing/LocalisationAudit/Leaderboard",
  component: LocalisationAuditLeaderboard,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    locale: "en",
    entries: localisationAuditLeaderboardEntries(),
  },
} satisfies Meta<typeof LocalisationAuditLeaderboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "How other sites score" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("meter", { name: "Score 91 out of 100" })).toHaveAttribute(
      "aria-valuenow",
      "91",
    );
    await expect(canvas.getByRole("meter", { name: "Score 72 out of 100" })).toBeInTheDocument();
    await expect(canvas.getByRole("meter", { name: "Score 52 out of 100" })).toBeInTheDocument();
    await expect(canvas.getByText("Northstar")).toBeInTheDocument();
    await expect(canvas.getByText("bramble.example")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    entries: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No public scores yet. Be the first.")).toBeInTheDocument();
    await expect(canvas.queryByRole("meter")).not.toBeInTheDocument();
  },
};
