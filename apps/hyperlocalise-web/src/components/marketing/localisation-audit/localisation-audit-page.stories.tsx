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
import { localisationAuditDomainSlug } from "./localisation-audit.fixture";

const meta = {
  title: "Marketing/LocalisationAudit/Landing",
  component: LocalisationAuditPage,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    locale: "en",
    leaderboard: [
      {
        rank: 1,
        domainKey: "acme.example",
        domainSlug: localisationAuditDomainSlug,
        score: 86,
        completedAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    ],
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
    await expect(canvas.getByRole("heading", { name: "What we notice" })).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "How other sites score" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("hreflang")).not.toBeInTheDocument();
    await expect(canvas.queryByText(/SSRF/)).not.toBeInTheDocument();
  },
};
