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

import { GuidelineMockUI } from "./guideline-mock-ui";

function GuidelineMockShowcase({ variant = "full" }: { variant?: "full" | "embedded" }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <GuidelineMockUI variant={variant} />
    </div>
  );
}

const meta = {
  title: "Marketing/Product/GuidelineMock",
  component: GuidelineMockShowcase,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof GuidelineMockShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Guidance that powers global growth in every market" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Market knowledge" })).toBeInTheDocument();
    await expect(canvas.getByText("Market: Germany")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Request a Demo" })).toBeInTheDocument();
    await expect(canvas.getByText("Do")).toBeInTheDocument();
    await expect(canvas.getByText("Don't")).toBeInTheDocument();
    await expect(
      canvas.getByText("Lead with formal Sie and detailed security proof points"),
    ).toBeInTheDocument();
  },
};

export const Embedded: Story = {
  render: () => <GuidelineMockShowcase variant="embedded" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Market knowledge")).toBeInTheDocument();
    await expect(canvas.getByText("Market: Germany")).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Request a Demo" })).not.toBeInTheDocument();
  },
};
