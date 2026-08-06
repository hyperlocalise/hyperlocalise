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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import {
  issueSheetOrganizationSlug,
  issueSheetProjectId,
} from "../../projects/[projectId]/issue-sheet/_components/issue-sheet.fixture";
import { issueSheetMswHandlers } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-msw-handlers";
import { IssueWatchControl } from "./issue-watch-control";

const issueId = "issue_001";

function StoryProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const meta = {
  title: "App/Issue Detail/Watch Control",
  component: IssueWatchControl,
  decorators: [
    (Story) => (
      <StoryProviders>
        <div className="w-56 rounded-lg border border-border bg-muted/20 p-3">
          <Story />
        </div>
      </StoryProviders>
    ),
  ],
  parameters: {
    layout: "centered",
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  args: {
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
    issueId,
    disabled: false,
  },
} satisfies Meta<typeof IssueWatchControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Watching: Story = {
  args: {
    isWatching: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Watching" })).toBeInTheDocument();
  },
};

export const NotWatching: Story = {
  args: {
    isWatching: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Watch" })).toBeInTheDocument();
  },
};

export const ToggleWatch: Story = {
  args: {
    isWatching: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Watching" });
    await userEvent.click(button);
    await expect(canvas.getByRole("button", { name: "Watch" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Watch" }));
    await expect(canvas.getByRole("button", { name: "Watching" })).toBeInTheDocument();
  },
};

export const Disabled: Story = {
  args: {
    isWatching: false,
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Watch" })).toBeDisabled();
  },
};
