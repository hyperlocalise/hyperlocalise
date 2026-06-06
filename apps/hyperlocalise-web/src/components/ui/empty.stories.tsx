import { FileSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "./button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

const meta = {
  title: "UI/Empty",
  component: Empty,
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-5xl gap-4 p-6 md:grid-cols-2">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={FileSearchIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No source files yet</EmptyTitle>
          <EmptyDescription>
            Connect a provider or upload files to start reviewing strings.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button>Upload file</Button>
        </EmptyContent>
      </Empty>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="default">
            <HugeiconsIcon icon={FileSearchIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No jobs match these filters</EmptyTitle>
          <EmptyDescription>Clear the filters to see all translation jobs.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No source files yet")).toHaveAttribute(
      "data-slot",
      "empty-title",
    );
  },
};
