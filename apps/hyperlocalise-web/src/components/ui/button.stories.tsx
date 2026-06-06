import { ArrowRight01Icon, GitPullRequestIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "./button";

const buttonVariants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const buttonSizes = ["xs", "sm", "default", "lg", "icon-xs", "icon-sm", "icon", "icon-lg"] as const;

const meta = {
  title: "UI/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-5xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Variants</h2>
        <div className="flex flex-wrap items-center gap-3">
          {buttonVariants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Sizes</h2>
        <div className="flex flex-wrap items-center gap-3">
          {buttonSizes.map((size) => (
            <Button
              key={size}
              aria-label={size.startsWith("icon") ? `${size} button` : undefined}
              size={size}
            >
              {size.startsWith("icon") ? (
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              ) : (
                size
              )}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">States</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
            Leading icon
          </Button>
          <Button variant="outline">
            Trailing icon
            <HugeiconsIcon icon={GitPullRequestIcon} strokeWidth={2} data-icon="inline-end" />
          </Button>
          <Button disabled>Disabled</Button>
          <Button aria-label="Open project" size="icon" variant="ghost">
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "default" })).toBeInTheDocument();
  },
};
