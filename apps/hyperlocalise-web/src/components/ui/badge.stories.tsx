import { Alert02Icon, CheckmarkCircle02Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Badge } from "./badge";

const badgeVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
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
          <Badge>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} data-icon="inline-start" />
            Synced
          </Badge>
          <Badge variant="outline">
            <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} data-icon="inline-start" />
            main
          </Badge>
          <Badge variant="destructive">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} data-icon="inline-start" />
            Blocked
          </Badge>
          <Badge variant="warning">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} data-icon="inline-start" />
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
