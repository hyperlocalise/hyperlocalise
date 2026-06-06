import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable";

const meta = {
  title: "UI/Resizable",
  component: ResizablePanelGroup,
} satisfies Meta<typeof ResizablePanelGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <ResizablePanelGroup className="h-64 max-w-2xl rounded-2xl border" orientation="horizontal">
      <ResizablePanel defaultSize={35}>
        <div className="flex h-full items-center justify-center p-4">Source strings</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={65}>
        <div className="flex h-full items-center justify-center bg-muted/50 p-4">
          Translation editor
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Source strings")).toBeInTheDocument();
  },
};
