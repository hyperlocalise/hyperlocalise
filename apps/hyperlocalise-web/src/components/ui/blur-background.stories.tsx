import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { BlurBackground } from "./blur-background";

const meta = {
  title: "UI/Blur Background",
  component: BlurBackground,
} satisfies Meta<typeof BlurBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <BlurBackground className="flex min-h-64 max-w-2xl items-center justify-center rounded-3xl p-8">
      <div className="rounded-2xl bg-background/80 p-6 text-center shadow-xl backdrop-blur">
        <h3 className="font-semibold">Launch localization workflow</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Color, blur, and vignette variants are available through props.
        </p>
      </div>
    </BlurBackground>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Launch localization workflow")).toBeInTheDocument();
  },
};
