import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Alert, AlertDescription, AlertTitle } from "./alert";

const meta = {
  component: Alert,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Translation memory updated</AlertTitle>
      <AlertDescription>
        New matches from the latest sync are available for review jobs.
      </AlertDescription>
    </Alert>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(/translation memory updated/i);
  },
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertTitle>Sync failed</AlertTitle>
      <AlertDescription>Reconnect the provider credential and retry the sync.</AlertDescription>
    </Alert>
  ),
};
