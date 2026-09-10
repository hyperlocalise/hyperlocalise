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

import { HyperlabMockUI } from "./hyperlab-mock-ui";

function HyperlabMockShowcase({ variant = "full" }: { variant?: "full" | "embedded" }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <HyperlabMockUI variant={variant} />
    </div>
  );
}

const meta = {
  title: "Marketing/Product/HyperlabMock",
  component: HyperlabMockShowcase,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HyperlabMockShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", {
        name: "Market experiments and market features in one workspace",
      }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Market features" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Market experiments" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "One market first" })).toBeInTheDocument();
    await expect(canvas.getByText("Japan checkout button")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Request a Demo" })).toBeInTheDocument();
  },
};

export const Embedded: Story = {
  render: () => <HyperlabMockShowcase variant="embedded" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Japan checkout button")).toBeInTheDocument();
    await expect(canvas.getByText("Homepage theme")).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Request a Demo" })).not.toBeInTheDocument();
  },
};
