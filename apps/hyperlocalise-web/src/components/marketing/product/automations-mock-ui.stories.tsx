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

import { LAVENDER_MESH_GRADIENT_SRC, MeshStage } from "@/components/marketing/hero-frame-mesh-stage";

import { AutomationsMockUI } from "./automations-mock-ui";

function AutomationsMockShowcase() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <MeshStage meshSrc={LAVENDER_MESH_GRADIENT_SRC}>
        <AutomationsMockUI />
      </MeshStage>
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
    await expect(canvas.getByRole("button", { name: /Auto-review/ })).toBeInTheDocument();
    await expect(
      canvas.getByText("Review pull requests and post one sticky comment"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("GitHub pull request opened")).toBeInTheDocument();
    await expect(canvas.getByText("@hyperlocalise review")).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Review localisation before it merges" }),
    ).toBeInTheDocument();
  },
};
