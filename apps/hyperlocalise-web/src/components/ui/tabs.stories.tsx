import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  component: Tabs,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceViews: Story = {
  render: () => (
    <Tabs defaultValue="projects" className="max-w-lg">
      <TabsList>
        <TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="jobs">Jobs</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
      </TabsList>
      <TabsContent value="projects">Track localization programs by release.</TabsContent>
      <TabsContent value="jobs">Monitor translation jobs and QA status.</TabsContent>
      <TabsContent value="files">Browse workspace files and locale assets.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /jobs/i }));
    await expect(canvas.getByText(/monitor translation jobs/i)).toBeVisible();
    await expect(canvas.getByRole("tab", { name: /jobs/i })).toHaveAttribute("aria-selected", "true");
  },
};

export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Summary metrics for the workspace.</TabsContent>
      <TabsContent value="quality">QA findings and review throughput.</TabsContent>
    </Tabs>
  ),
};
