import { Alert02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "./button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert";

const meta = {
  title: "UI/Alert",
  component: Alert,
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <Alert>
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
        <AlertTitle>Provider sync is running</AlertTitle>
        <AlertDescription>
          New source strings will appear after the current sync completes.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
        <AlertTitle>Write-back failed</AlertTitle>
        <AlertDescription>
          Resolve the provider connection before retrying this job.
        </AlertDescription>
      </Alert>
      <Alert>
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
        <AlertTitle>GitHub repository connected</AlertTitle>
        <AlertDescription>
          Automation can open translation pull requests for this project.
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline">
            Configure
          </Button>
        </AlertAction>
      </Alert>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Provider sync is running")).toBeInTheDocument();
  },
};
