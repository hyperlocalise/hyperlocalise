/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { toast } from "sonner";
import { expect } from "storybook/test";

import { Button } from "./button";
import { Toaster } from "./sonner";

const meta = {
  title: "UI/Sonner",
  component: Toaster,
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 p-6">
      <Button onClick={() => toast.success("Provider sync complete")}>Show toast</Button>
      <Button variant="outline" onClick={() => toast.info("186 strings ready for review")}>
        Info
      </Button>
      <Button variant="outline" onClick={() => toast.warning("Glossary entries need review")}>
        Warning
      </Button>
      <Button variant="destructive" onClick={() => toast.error("Write-back failed")}>
        Error
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Show toast")).toBeInTheDocument();
  },
};
