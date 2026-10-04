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
import { WarningIcon, CheckCircleIcon, GitBranchIcon } from "@phosphor-icons/react/ssr";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Badge } from "./badge";

const badgeVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "success",
  "warning",
  "link",
] as const;

const meta = {
  title: "UI/Badge",
  component: Badge,
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Variants</h2>
        <div className="flex flex-wrap items-center gap-3">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">States</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="success">
            <CheckCircleIcon data-icon="inline-start" />
            Synced
          </Badge>
          <Badge variant="outline">
            <GitBranchIcon data-icon="inline-start" />
            main
          </Badge>
          <Badge variant="destructive">
            <WarningIcon data-icon="inline-start" />
            Blocked
          </Badge>
          <Badge variant="warning">
            <WarningIcon data-icon="inline-start" />
            Needs review
          </Badge>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Synced")).toHaveAttribute("data-slot", "badge");
  },
};
