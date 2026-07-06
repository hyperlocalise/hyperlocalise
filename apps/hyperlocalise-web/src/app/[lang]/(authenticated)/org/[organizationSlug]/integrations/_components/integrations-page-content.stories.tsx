import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  integrationsConnectedMswHandlers,
  integrationsDisconnectedMswHandlers,
  integrationsLoadingMswHandlers,
  integrationsManagedProviderMswHandlers,
} from "./integrations-msw-handlers";
import { integrationsOrganizationSlug } from "./integrations.fixture";
import { IntegrationsPageContent } from "./integrations-page-content";

const meta = {
  title: "App/Integrations/Page",
  component: IntegrationsPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: `/org/${integrationsOrganizationSlug}/integrations`,
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
    await expect(canvas.getByText("Workspace level")).toBeInTheDocument();
    await expect(canvas.getByText("Source control")).toBeInTheDocument();
    await expect(canvas.getByText("Translation Management System")).toBeInTheDocument();
    await expect(canvas.getByText("Content Management System")).toBeInTheDocument();
    await expect(canvas.getByText("Collaboration")).toBeInTheDocument();
    await expect(canvas.getByText("Model provider")).toBeInTheDocument();
    await expect(canvas.getByText("GitHub")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin")).toBeInTheDocument();
    await expect(canvas.getByText("Contentful")).toBeInTheDocument();
    await expect(canvas.getByText("Slack")).toBeInTheDocument();
    await expect(canvas.getByText("Email")).toBeInTheDocument();
    await expect(canvas.getByText("Open AI")).toBeInTheDocument();
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
    await expect(canvas.getByText("Hyperlocalise GO")).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Connect" }).length).toBeGreaterThan(0);
  },
};

export const ManagedProviderOnly: Story = {
  parameters: {
    msw: {
      handlers: integrationsManagedProviderMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Hyperlocalise GO")).toBeInTheDocument();
    await expect(canvas.getByText("Managed by Hyperlocalise")).toBeInTheDocument();
    await expect(canvas.getByText("Configure")).toBeInTheDocument();
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
