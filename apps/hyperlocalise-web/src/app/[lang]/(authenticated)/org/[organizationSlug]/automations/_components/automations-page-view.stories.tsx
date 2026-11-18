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
import { expect, within } from "storybook/test";

import { automationsFixture, createVisualWorkflowSummary } from "./automations.fixture";
import { AutomationsPageView } from "./automations-page-view";

const fixedNow = Date.UTC(2026, 5, 7, 12, 0, 0);

const meta = {
  title: "App/Automations/Page",
  component: AutomationsPageView,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/org/acme/automations",
        query: {},
      },
    },
  },
  args: {
    organizationSlug: "acme",
    automations: automationsFixture,
    visualWorkflows: [createVisualWorkflowSummary()],
    workflowsAvailable: true,
    isLoading: false,
    now: fixedNow,
    autoReview: {
      enabled: true,
      additionalPrompt: "Focus on ICU message syntax.",
      githubInstallationRepositoryIds: ["repo-1"],
      repositories: [
        {
          id: "repo-1",
          fullName: "acme/app",
          enabled: true,
          archived: false,
        },
      ],
    },
    onSaveAutoReview: async () => {},
  },
} satisfies Meta<typeof AutomationsPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "GitHub Auto-review" })).toBeInTheDocument();
    await expect(canvas.getByText("On · 1 repository")).toBeInTheDocument();
    await expect(canvas.getByText("Validate localisation on push")).toBeInTheDocument();
    await expect(canvas.getByText("Release localisation check")).toBeInTheDocument();
    await expect(canvas.getByText("Manual → 2 steps")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /New automation/ })).toHaveAttribute(
      "href",
      "/org/acme/automations/create",
    );

    await userEvent.click(canvas.getByRole("button", { name: "Configure" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("button", { name: "Save" })).toBeInTheDocument();
    await expect(body.getByText("acme/app")).toBeInTheDocument();
    await expect(body.getByLabelText("Enable Auto-review")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    automations: [],
    isLoading: true,
  },
  play: async ({ canvas }) => {
    const loadingRegion = canvas.getByLabelText("Loading automations");
    await expect(loadingRegion.children).toHaveLength(5);
  },
};

export const Empty: Story = {
  args: {
    automations: [],
    visualWorkflows: [],
    isLoading: false,
    assistant: { aiFeaturesStatus: "allowed", pending: false, onSubmitPrompt: () => {} },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Put your localisation work on autopilot" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("textbox", { name: "Describe the automation" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Browse templates" })).toHaveAttribute(
      "href",
      "/org/acme/automations/create",
    );
  },
};

export const LoadError: Story = {
  args: {
    automations: [],
    error: new Error("The automations API returned a 500."),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Automations failed to load.")).toBeInTheDocument();
  },
};

export const FilterByStatus: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Paused 1" }));
    await expect(canvas.getByText("Manual release checklist")).toBeInTheDocument();
    await expect(canvas.queryByText("Weekly translation sync")).not.toBeInTheDocument();
  },
};

export const ProjectScoped: Story = {
  args: {
    projectId: "project-1",
    automations: automationsFixture.filter((automation) => automation.projectId === "project-1"),
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/org/acme/projects/project-1/automations",
        query: {},
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Project")).toBeInTheDocument();
    await expect(canvas.queryByText("GitHub Auto-review")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Release localisation check")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /Validate localisation on push/i }),
    ).toHaveAttribute(
      "href",
      "/org/acme/projects/project-1/automations/11111111-1111-4111-8111-111111111111",
    );
    await expect(canvas.getByRole("link", { name: /New automation/i })).toHaveAttribute(
      "href",
      "/org/acme/projects/project-1/automations/create",
    );
  },
};
