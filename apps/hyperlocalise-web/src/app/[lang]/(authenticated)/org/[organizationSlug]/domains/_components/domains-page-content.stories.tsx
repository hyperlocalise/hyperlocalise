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
import { DomainsPageContent } from "./domains-page-content";
import {
  domainResearchMswHandlers,
  emptyLinkedDomainsMswHandlers,
} from "./domain-research-msw-handlers";

const ORGANIZATION_SLUG = "domains-preview";

const meta = {
  title: "App/Domains/Page",
  component: DomainsPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/org/domains-preview/domains" } },
    msw: { handlers: domainResearchMswHandlers() },
  },
  args: { organizationSlug: ORGANIZATION_SLUG, allowLinkDomains: true },
} satisfies Meta<typeof DomainsPageContent>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("hyperlocalise.com")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: { handlers: emptyLinkedDomainsMswHandlers() },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No linked domains yet")).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Link domain" })).toBeInTheDocument();
  },
};
