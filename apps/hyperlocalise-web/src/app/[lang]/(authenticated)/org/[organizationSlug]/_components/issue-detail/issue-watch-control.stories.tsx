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
        <div className="w-full max-w-xl rounded-lg border border-border bg-background p-4">
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

export const Subscribed: Story = {
  args: {
    isWatching: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
  },
};

export const NotSubscribed: Story = {
  args: {
    isWatching: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
  },
};

export const ToggleSubscription: Story = {
  args: {
    isWatching: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "Unsubscribe" });
    await userEvent.click(button);
    await expect(canvas.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Subscribe" }));
    await expect(canvas.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
  },
};

export const Disabled: Story = {
  args: {
    isWatching: false,
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Subscribe" })).toBeDisabled();
  },
};
