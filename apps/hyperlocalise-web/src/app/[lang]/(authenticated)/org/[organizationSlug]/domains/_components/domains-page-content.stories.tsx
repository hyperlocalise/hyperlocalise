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
import { http, HttpResponse } from "msw";
import { DomainsPageContent } from "./domains-page-content";
import { DomainResearchPreviewProvider } from "./domain-research-preview";

const ORGANIZATION_SLUG = "domains-preview";

const meta = {
  title: "App/Domains/Page",
  component: DomainsPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/org/domains-preview/domains" } },
  },
  args: { organizationSlug: ORGANIZATION_SLUG },
} satisfies Meta<typeof DomainsPageContent>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  decorators: [
    (Story) => (
      <DomainResearchPreviewProvider organizationSlug={ORGANIZATION_SLUG}>
        <Story />
      </DomainResearchPreviewProvider>
    ),
  ],
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/orgs/:organizationSlug/linked-domains", () =>
          HttpResponse.json({ linkedDomains: [] }),
        ),
      ],
    },
  },
};
