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
import { DomainMetricCard } from "./domain-metric-card";
import { getDomainMetricHistory } from "@/lib/domains/research-metric-history";
const history = getDomainMetricHistory("hyperlocalise-com")!;
const meta = {
  title: "App/Domains/Metric Card",
  component: DomainMetricCard,
  args: { label: "Traffic", value: "84k", history: history.traffic },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DomainMetricCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Rising: Story = {};
export const Falling: Story = {
  args: { label: "Keywords", value: "12.4k", history: history.keywords },
};
export const Unchanged: Story = {
  args: { label: "Tracked keywords", value: "48", history: history.tracked },
};
export const MissingHistory: Story = { args: { history: undefined } };
export const ZeroBaseline: Story = {
  args: {
    value: "6",
    history: history.traffic.map((point, index) => ({ ...point, value: index })),
  },
};
