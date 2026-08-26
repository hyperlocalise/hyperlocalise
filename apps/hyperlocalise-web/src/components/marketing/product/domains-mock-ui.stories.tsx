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

import { DomainsMockUI } from "./domains-mock-ui";

function DomainsMockShowcase({ variant = "full" }: { variant?: "full" | "embedded" }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <DomainsMockUI variant={variant} />
    </div>
  );
}

const meta = {
  title: "Marketing/Product/DomainsMock",
  component: DomainsMockShowcase,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DomainsMockShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Website audits for localisation, SEO, and AEO" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Localisation audit" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "SEO audit" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "AEO audit" })).toBeInTheDocument();
    await expect(canvas.getByText("Website audit · acme.com")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Request a Demo" })).toBeInTheDocument();
  },
};

export const Embedded: Story = {
  render: () => <DomainsMockShowcase variant="embedded" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Website audit · acme.com")).toBeInTheDocument();
    await expect(canvas.getByText("Open issues")).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Request a Demo" })).not.toBeInTheDocument();
  },
};
