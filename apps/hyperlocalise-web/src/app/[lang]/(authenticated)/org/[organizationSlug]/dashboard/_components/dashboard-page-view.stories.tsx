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
import { expect } from "storybook/test";

import { dashboardOverviewEmptyFixture, dashboardOverviewFixture } from "./dashboard.fixture";
import { DashboardPageView } from "./dashboard-page-view";
import { SlackConnectInviteBannerView } from "./slack-connect-invite-banner";

const organizationSlug = "acme";

const meta = {
  title: "App/Dashboard/Page",
  component: DashboardPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug,
    overview: dashboardOverviewFixture,
    automationsEnabled: true,
    isLoading: false,
    isError: false,
    onNewRequest: () => undefined,
  },
} satisfies Meta<typeof DashboardPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SlackConnectCreate: Story = {
  args: {
    slackConnectCard: (
      <SlackConnectInviteBannerView
        invited={false}
        onDismiss={() => undefined}
        onRequest={() => undefined}
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Request Slack channel")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Request invite" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  },
};

export const SlackConnectInviteReadOnly: Story = {
  args: {
    slackConnectCard: (
      <SlackConnectInviteBannerView
        invited
        canManage={false}
        onDismiss={() => undefined}
        onRequest={() => undefined}
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("We've invited your team to a shared Slack channel"),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Request invite" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  },
};

export const SlackConnectInvite: Story = {
  args: {
    slackConnectCard: (
      <SlackConnectInviteBannerView
        invited
        onDismiss={() => undefined}
        onRequest={() => undefined}
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("We've invited your team to a shared Slack channel"),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Request invite" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  },
};

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Connect your agent" })).toBeInTheDocument();
    await expect(canvas.getByText("2 P1 on Board")).toBeInTheDocument();
    await expect(canvas.getByText("Activity")).toBeInTheDocument();
    await expect(canvas.getByText("Projects")).toBeInTheDocument();
    await expect(canvas.getByText("Board")).toBeInTheDocument();
    await expect(canvas.getByText("View automations")).toBeInTheDocument();
    await expect(canvas.getByText("WEB-1")).toBeInTheDocument();
    await expect(canvas.getByText("Missing CTA on checkout")).toBeInTheDocument();
    await expect(canvas.queryByText("My jobs")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Integrations")).not.toBeInTheDocument();
  },
};

export const AutomationsDisabled: Story = {
  args: {
    automationsEnabled: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Board")).toBeInTheDocument();
    await expect(canvas.queryByText("View automations")).not.toBeInTheDocument();
    await expect(canvas.queryByText("1 paused")).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    overview: dashboardOverviewEmptyFixture,
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    overview: dashboardOverviewEmptyFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No recent activity yet.")).toBeInTheDocument();
    await expect(
      canvas.getByText("No projects yet. Create a project to get started."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("No open issues.")).toBeInTheDocument();
    await expect(canvas.getByText("No automation runs yet.")).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: {
    overview: dashboardOverviewEmptyFixture,
    isError: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByText("Workspace overview could not be loaded.").length,
    ).toBeGreaterThan(0);
  },
};
