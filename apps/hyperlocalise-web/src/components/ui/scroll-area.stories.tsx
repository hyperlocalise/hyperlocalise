import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ScrollArea } from "./scroll-area";

const meta = {
  title: "UI/Scroll Area",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <ScrollArea className="h-48 max-w-sm rounded-2xl border p-4">
      <div className="flex flex-col gap-3">
        {Array.from({ length: 12 }, (_, index) => (
          <p key={index} className="text-sm">
            Translation segment {index + 1}: Preserve placeholders and product names.
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Translation segment 1: Preserve placeholders and product names."),
    ).toBeInTheDocument();
  },
};
