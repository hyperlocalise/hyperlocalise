/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { WarningIcon, InfoIcon } from "@phosphor-icons/react/ssr";
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
        <InfoIcon />
        <AlertTitle>Provider sync is running</AlertTitle>
        <AlertDescription>
          New source strings will appear after the current sync completes.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <WarningIcon />
        <AlertTitle>Write-back failed</AlertTitle>
        <AlertDescription>
          Resolve the provider connection before retrying this job.
        </AlertDescription>
      </Alert>
      <Alert>
        <InfoIcon />
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
