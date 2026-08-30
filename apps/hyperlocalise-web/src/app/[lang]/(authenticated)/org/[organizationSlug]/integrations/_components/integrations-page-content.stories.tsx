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

import {
  integrationsConnectedMswHandlers,
  integrationsDisconnectedMswHandlers,
  integrationsLoadingMswHandlers,
} from "./integrations-msw-handlers";
import { integrationsOrganizationSlug } from "./integrations.fixture";
import { IntegrationsPageContent } from "./integrations-page-content";

const meta = {
  title: "App/Integrations/Page",
  component: IntegrationsPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${integrationsOrganizationSlug}/integrations`,
        query: {},
      },
    },
  },
  args: {
    organizationSlug: integrationsOrganizationSlug,
    membershipRole: "admin",
    canManageProviderIntegrations: true,
    errorCode: null,
  },
} satisfies Meta<typeof IntegrationsPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: integrationsConnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Integrations" })).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "All" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Source control" })).toBeInTheDocument();
    await expect(canvas.getByText("Translation Management System")).toBeInTheDocument();
    await expect(canvas.getByText("Content & publishing")).toBeInTheDocument();
    await expect(canvas.getByText("Experimentation")).toBeInTheDocument();
    await expect(canvas.getByText("Projects & files")).toBeInTheDocument();
    await expect(canvas.getByText("Pages")).toBeInTheDocument();
    await expect(canvas.getByText("Hyperlab")).toBeInTheDocument();
    await expect(canvas.getByText("HyperSEO")).toBeInTheDocument();
    await expect(canvas.getAllByText("Included").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Collaboration")).toBeInTheDocument();
    await expect(canvas.getByText("Customer engagement")).toBeInTheDocument();
    await expect(canvas.queryByText("Model provider")).not.toBeInTheDocument();
    await expect(canvas.getByText("GitHub")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin")).toBeInTheDocument();
    await expect(canvas.getByText("Contentful")).toBeInTheDocument();
    await expect(canvas.getByText("Intercom")).toBeInTheDocument();
    await expect(canvas.getByText("Semrush")).toBeInTheDocument();
    await expect(canvas.getByText("Ahrefs")).toBeInTheDocument();
    await expect(canvas.getByText("Slack")).toBeInTheDocument();
    await expect(canvas.getByText("Email")).toBeInTheDocument();
    await expect(canvas.getByText("Jira")).toBeInTheDocument();
    await expect(canvas.getByText("Braze")).toBeInTheDocument();
    await expect(canvas.getByText("Iterable")).toBeInTheDocument();
    await expect(canvas.getByText("Customer.io")).toBeInTheDocument();
    await expect(canvas.getByText("HubSpot")).toBeInTheDocument();
    await expect(canvas.getByText("Mailchimp")).toBeInTheDocument();
    await expect(canvas.getByText("Loops")).toBeInTheDocument();
    await expect(canvas.getByText("SendGrid")).toBeInTheDocument();
    await expect(canvas.queryByText("Open AI")).not.toBeInTheDocument();
  },
};

export const FilteredCategory: Story = {
  parameters: {
    msw: {
      handlers: integrationsConnectedMswHandlers,
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "MCP servers" }));
    await expect(canvas.getByRole("heading", { name: "MCP servers" })).toBeInTheDocument();
    await expect(canvas.getByText("MCP Server")).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Source control" })).not.toBeInTheDocument();
  },
};

export const Disconnected: Story = {
  parameters: {
    msw: {
      handlers: integrationsDisconnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Integrations" })).toBeInTheDocument();
    await expect(canvas.queryByText("Hyperlocalise GO")).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Connect" }).length).toBeGreaterThan(0);
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: integrationsLoadingMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Integrations" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const ReadOnly: Story = {
  args: {
    membershipRole: "developer",
  },
  parameters: {
    msw: {
      handlers: integrationsConnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Integrations" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    await expect(canvas.getAllByText("View only").length).toBeGreaterThan(0);
  },
};

export const WithoutProviderIntegrations: Story = {
  args: {
    canManageProviderIntegrations: false,
    membershipRole: "developer",
  },
  parameters: {
    msw: {
      handlers: integrationsConnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Integrations" })).toBeInTheDocument();
    await expect(canvas.getByText("Source control")).toBeInTheDocument();
    await expect(canvas.getByText("Collaboration")).toBeInTheDocument();
    await expect(canvas.getByText("Customer engagement")).toBeInTheDocument();
    await expect(canvas.queryByText("Translation Management System")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Model provider")).not.toBeInTheDocument();
  },
};

export const OAuthError: Story = {
  args: {
    errorCode: "crowdin_user_oauth_invalid",
  },
  parameters: {
    msw: {
      handlers: integrationsConnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin account link failed")).toBeInTheDocument();
  },
};
