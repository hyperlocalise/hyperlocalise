import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "./button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

const meta = {
  title: "UI/Collapsible",
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Collapsible className="max-w-md rounded-2xl border p-4" defaultOpen>
      <CollapsibleTrigger render={<Button variant="outline" />}>
        Toggle project details
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 text-sm text-muted-foreground">
        Includes glossary sync, reviewer assignment, and repository write-back settings.
      </CollapsibleContent>
    </Collapsible>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Toggle project details")).toBeInTheDocument();
  },
};
