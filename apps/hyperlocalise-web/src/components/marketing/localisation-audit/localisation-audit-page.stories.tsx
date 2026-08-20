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

import { LocalisationAuditPage } from "./localisation-audit-page";
import { localisationAuditLeaderboardEntries } from "./localisation-audit.fixture";

const meta = {
  title: "Marketing/LocalisationAudit/Landing",
  component: LocalisationAuditPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/en/localisation-audit",
      },
    },
  },
  args: {
    locale: "en",
    leaderboard: localisationAuditLeaderboardEntries(),
  },
} satisfies Meta<typeof LocalisationAuditPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "See how your brand travels." }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "See my score" })).toBeInTheDocument();
    const crawlNote = canvas.getByRole("complementary", { name: "Site owner note" });
    await expect(crawlNote).toBeInTheDocument();
    await expect(crawlNote.closest("section")?.textContent).toContain("What we notice");
    await expect(
      canvas.getByText("HyperlocaliseAuditBot/1.0 (+https://hyperlocalise.com)"),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "What we notice" })).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "How other sites score" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Site")).toBeInTheDocument();
    await expect(canvas.getByText("Score")).toBeInTheDocument();
    await expect(canvas.getByRole("meter", { name: "Score 91 out of 100" })).toBeInTheDocument();
    await expect(canvas.getByRole("meter", { name: "Score 72 out of 100" })).toBeInTheDocument();
    await expect(canvas.getByRole("meter", { name: "Score 52 out of 100" })).toBeInTheDocument();
    await expect(canvas.getByText("Northstar")).toBeInTheDocument();
    await expect(canvas.getByText("bramble.example")).toBeInTheDocument();
    await expect(canvas.queryByText("hreflang")).not.toBeInTheDocument();
    await expect(canvas.queryByText(/SSRF/)).not.toBeInTheDocument();
  },
};
