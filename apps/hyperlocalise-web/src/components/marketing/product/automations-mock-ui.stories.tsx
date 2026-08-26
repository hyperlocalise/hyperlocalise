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

import { AutomationsMockUI } from "./automations-mock-ui";

function AutomationsMockShowcase() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <AutomationsMockUI />
    </div>
  );
}

const meta = {
  title: "Marketing/Product/AutomationsMock",
  component: AutomationsMockShowcase,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof AutomationsMockShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /GTM content publishing/ }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Localisation review/ })).toBeInTheDocument();
    await expect(
      canvas.getByText("Review pull requests on GitHub and post one sticky comment"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Use Hyperlocalise Agent")).toBeInTheDocument();
    await expect(canvas.getByText("GitHub pull request opened")).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Automate GTM, review, and research workflows" }),
    ).toBeInTheDocument();
  },
};

export const Embedded: Story = {
  render: () => (
    <div className="mx-auto max-w-6xl p-6">
      <AutomationsMockUI variant="embedded" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Use Hyperlocalise Agent")).toBeInTheDocument();
    await expect(canvas.getByText("GTM brief approved · Q2 launch")).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Request a Demo" })).not.toBeInTheDocument();
  },
};
