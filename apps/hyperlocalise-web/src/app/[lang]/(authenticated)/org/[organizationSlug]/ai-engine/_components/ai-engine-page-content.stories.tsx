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
  integrationsMultiProviderMswHandlers,
} from "../../integrations/_components/integrations-msw-handlers";
import { integrationsOrganizationSlug } from "../../integrations/_components/integrations.fixture";
import { AiEnginePageContent } from "./ai-engine-page-content";

const meta = {
  title: "App/AI Engine/Page",
  component: AiEnginePageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: `/org/${integrationsOrganizationSlug}/ai-engine`,
      },
    },
  },
  args: {
    organizationSlug: integrationsOrganizationSlug,
    canManageAiEngine: true,
  },
} satisfies Meta<typeof AiEnginePageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: integrationsConnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "AI Engine" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Provider" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Hyperlocalise Agent" })).toBeInTheDocument();
    await expect(canvas.getByText("Workspace default")).toBeInTheDocument();
    await expect(canvas.getByText("Ask")).toBeInTheDocument();
    await expect(canvas.getByText("Translation")).toBeInTheDocument();
    await expect(canvas.getByText("Coding")).toBeInTheDocument();
    await expect(canvas.getAllByText("Workspace default").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Open AI")).toBeInTheDocument();
    await expect(canvas.getByText("Included models")).toBeInTheDocument();
    await expect(canvas.getByText("Always available")).toBeInTheDocument();
    await expect(canvas.getByText("Connected")).toBeInTheDocument();
    await expect(canvas.getAllByText("Manage provider").length).toBeGreaterThan(0);
  },
};

export const Disconnected: Story = {
  parameters: {
    msw: {
      handlers: integrationsDisconnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "AI Engine" })).toBeInTheDocument();
    await expect(canvas.getByText("Included models")).toBeInTheDocument();
    await expect(canvas.getByText("Managed by Hyperlocalise")).toBeInTheDocument();
    await expect(canvas.getByText("Always available")).toBeInTheDocument();
    await expect(canvas.getByText("Included")).toBeInTheDocument();
    await expect(canvas.getByText("gpt-5.6-luna")).toBeInTheDocument();
    await expect(canvas.queryByText("Connected")).not.toBeInTheDocument();
    await expect(canvas.getAllByText("Configure").length).toBe(3);
  },
};

export const MultipleProvidersConnected: Story = {
  parameters: {
    msw: {
      handlers: integrationsMultiProviderMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Connected").length).toBe(2);
    await expect(canvas.getByText("Always available")).toBeInTheDocument();
    await expect(canvas.getByText("Configure")).toBeInTheDocument();
    await expect(canvas.getAllByText("Manage provider").length).toBeGreaterThan(0);
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: integrationsLoadingMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "AI Engine" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const NoAccess: Story = {
  args: {
    canManageAiEngine: false,
  },
  parameters: {
    msw: {
      handlers: integrationsConnectedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "AI Engine" })).toBeInTheDocument();
    await expect(
      canvas.getByText("You do not have permission to manage AI providers in this workspace."),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("Open AI")).not.toBeInTheDocument();
  },
};
