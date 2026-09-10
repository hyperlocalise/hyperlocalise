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
import { DomainsPageContent } from "./domains-page-content";
const meta = {
  title: "App/Domains/Page",
  component: DomainsPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/org/domains-preview/domains" } },
  },
  args: { organizationSlug: "domains-preview" },
} satisfies Meta<typeof DomainsPageContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
