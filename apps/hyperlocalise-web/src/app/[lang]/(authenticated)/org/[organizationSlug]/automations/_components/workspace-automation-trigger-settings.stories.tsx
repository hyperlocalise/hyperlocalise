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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import {
  automationEditorContentfulConnectionsFixture,
  automationEditorRepositoriesFixture,
  createEmptyAutomationFormFixture,
  createGithubAutomationFormFixture,
  createManualAutomationFormFixture,
  createScheduledAutomationFormFixture,
} from "./automation-editor.fixture";
import { TriggerSettings } from "./workspace-automation-trigger-settings";

function TriggerSettingsStory({
  automationId,
  contentfulConnected = true,
  contentfulConnections,
  disabled,
  errors = {},
  form: initialForm,
  githubConnected = true,
}: {
  automationId?: string;
  contentfulConnected?: boolean;
  contentfulConnections?: typeof automationEditorContentfulConnectionsFixture;
  disabled?: boolean;
  errors?: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  githubConnected?: boolean;
}) {
  const [form, setForm] = useState(initialForm);

  return (
    <div className="max-w-3xl p-6">
      <TriggerSettings
        automationId={automationId}
        contentfulConnected={contentfulConnected}
        contentfulConnections={contentfulConnections}
        disabled={disabled}
        errors={errors}
        form={form}
        githubConnected={githubConnected}
        onChange={setForm}
        organizationSlug="acme"
        repositories={automationEditorRepositoriesFixture}
      />
      <pre data-testid="form-state" className="mt-6 text-xs text-muted-foreground">
        {JSON.stringify(
          {
            triggerMode: form.triggerMode,
            githubEvents: form.githubEvents,
            pushBranches: form.pushBranches,
            githubInstallationRepositoryId: form.githubInstallationRepositoryId,
            scheduledCadence: form.scheduledCadence,
            scheduledDayOfWeek: form.scheduledDayOfWeek,
            scheduledHourUtc: form.scheduledHourUtc,
            scheduledTimezone: form.scheduledTimezone,
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

const meta = {
  title: "App/Automations/Trigger settings",
  component: TriggerSettingsStory,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    form: createEmptyAutomationFormFixture(),
  },
} satisfies Meta<typeof TriggerSettingsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const githubPullRequestForm = (): WorkspaceAutomationFormState => ({
  ...createGithubAutomationFormFixture(),
  githubEvents: ["pull_request"],
  githubInstallationRepositoryId: automationEditorRepositoriesFixture[0]!.id,
});

export const Manual: Story = {
  args: { form: createManualAutomationFormFixture() },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Manually triggered" })).toBeInTheDocument();
  },
};

export const Scheduled: Story = {
  args: { form: createScheduledAutomationFormFixture() },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "On a schedule" })).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Schedule cadence" })).toHaveTextContent(
      "week",
    );
    await expect(canvas.getByRole("combobox", { name: "Schedule weekday" })).toHaveTextContent(
      "Monday",
    );
    await expect(canvas.getByRole("combobox", { name: "Schedule hour" })).toHaveTextContent(
      "09:00",
    );
  },
};

export const ScheduledHourly: Story = {
  args: {
    form: { ...createScheduledAutomationFormFixture(), scheduledCadence: "hourly" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("combobox", { name: "Schedule hour" })).not.toBeInTheDocument();
  },
};

export const GithubPush: Story = {
  args: {
    form: {
      ...createGithubAutomationFormFixture(),
      githubInstallationRepositoryId: automationEditorRepositoriesFixture[0]!.id,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "A push is made" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Branch patterns" })).toHaveTextContent("main");
    await expect(canvas.getByRole("combobox", { name: "Repository" })).toHaveTextContent(
      "acme/website",
    );
  },
};

export const GithubPullRequest: Story = {
  args: { form: githubPullRequestForm() },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "A pull request is made" }),
    ).toBeInTheDocument();
  },
};

export const GithubPushOrPullRequest: Story = {
  args: { form: { ...githubPullRequestForm(), githubEvents: ["push", "pull_request"] } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "A push or pull request is made" }),
    ).toBeInTheDocument();
  },
};

export const GithubDisconnected: Story = {
  args: { form: createManualAutomationFormFixture(), githubConnected: false },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Manually triggered" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "GitHub" }));
    const item = await body.findByRole("menuitem", { name: /A push is made/ });
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(item).toHaveTextContent("Connect first");
  },
};

export const Contentful: Story = {
  args: {
    form: {
      ...createEmptyAutomationFormFixture(),
      triggerMode: "contentful",
      contentfulContentTypeIds: ["article", "landingPage"],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "A Contentful entry is published" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("of type")).toBeInTheDocument();
    await expect(canvas.getByText("landingPage")).toBeInTheDocument();
  },
};

export const ContentfulTypesChangedOnConnection: Story = {
  args: {
    contentfulConnections: [
      { ...automationEditorContentfulConnectionsFixture[0]!, contentTypeIds: ["article", "faq"] },
    ],
    form: {
      ...createEmptyAutomationFormFixture(),
      triggerMode: "contentful",
      contentfulConnectionId: automationEditorContentfulConnectionsFixture[0]!.id,
      contentfulContentTypeIds: ["article", "landingPage"],
    },
  },
  play: async ({ canvas, userEvent }) => {
    // Only the type both lists share still starts a run.
    await expect(canvas.getByText("article")).toBeInTheDocument();
    await expect(
      canvas.getByText("The Contentful connection no longer sends landingPage."),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Remove from this automation" }));
    await expect(canvas.queryByText(/no longer sends/)).not.toBeInTheDocument();
    await expect(canvas.queryByText("faq")).not.toBeInTheDocument();
  },
};

export const ContentfulConnectionGone: Story = {
  args: {
    contentfulConnections: automationEditorContentfulConnectionsFixture,
    form: {
      ...createEmptyAutomationFormFixture(),
      triggerMode: "contentful",
      contentfulConnectionId: "contentful_conn_deleted",
      contentfulContentTypeIds: ["article"],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/disabled or no longer exists/)).toBeInTheDocument();
  },
};

export const ContentfulNoStartingType: Story = {
  args: {
    contentfulConnections: [
      { ...automationEditorContentfulConnectionsFixture[0]!, contentTypeIds: ["faq"] },
    ],
    form: {
      ...createEmptyAutomationFormFixture(),
      triggerMode: "contentful",
      contentfulConnectionId: automationEditorContentfulConnectionsFixture[0]!.id,
      contentfulContentTypeIds: ["landingPage"],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/so no run will start/)).toBeInTheDocument();
  },
};

export const ContentfulAnyContentType: Story = {
  args: { form: { ...createEmptyAutomationFormFixture(), triggerMode: "contentful" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("of any content type")).toBeInTheDocument();
  },
};

export const ContentfulDisconnected: Story = {
  args: {
    form: { ...createEmptyAutomationFormFixture(), triggerMode: "contentful" },
    contentfulConnected: false,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Connect Contentful in Integrations before this trigger can run."),
    ).toBeInTheDocument();
  },
};

export const SourceUpload: Story = {
  args: { form: { ...createEmptyAutomationFormFixture(), triggerMode: "source_upload" } },
};

export const WebChatUnsaved: Story = {
  args: { form: { ...createEmptyAutomationFormFixture(), triggerMode: "web_chat" } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Save this automation to get a public chat URL."),
    ).toBeInTheDocument();
  },
};

export const WebChatSaved: Story = {
  args: {
    form: { ...createEmptyAutomationFormFixture(), triggerMode: "web_chat" },
    automationId: "11111111-1111-4111-8111-111111111111",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Open chat" })).toBeInTheDocument();
  },
};

export const WithErrors: Story = {
  args: {
    form: { ...createGithubAutomationFormFixture(), pushBranches: [] },
    errors: {
      pushBranches: "Add at least one branch pattern.",
      githubRepository: "Choose a repository.",
    },
  },
};

export const Disabled: Story = {
  args: { form: createScheduledAutomationFormFixture(), disabled: true },
};

export const SwitchingPushToPullRequestKeepsFields: Story = {
  args: {
    form: {
      ...createGithubAutomationFormFixture(),
      pushBranches: ["main", "release/*"],
      githubInstallationRepositoryId: automationEditorRepositoriesFixture[1]!.id,
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "A push is made" }));
    // Simulated pointer moves close a hover submenu, so walk into it with the keyboard.
    await userEvent.hover(await body.findByRole("menuitem", { name: "GitHub" }));
    await userEvent.keyboard("{ArrowRight}");
    await body.findByRole("menuitem", { name: "A pull request is made" });
    await userEvent.keyboard("{ArrowDown}{Enter}");

    await expect(
      await canvas.findByRole("button", { name: "A pull request is made" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Branch patterns" })).toHaveTextContent(
      "main, release/*",
    );
    await expect(canvas.getByRole("combobox", { name: "Repository" })).toHaveTextContent(
      "acme/mobile",
    );
  },
};

export const ReselectingCurrentTriggerKeepsFields: Story = {
  args: {
    form: {
      ...createScheduledAutomationFormFixture(),
      scheduledCadence: "weekly",
      scheduledDayOfWeek: 4,
      scheduledHourUtc: 17,
      scheduledTimezone: "Australia/Sydney",
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const before = canvas.getByTestId("form-state").textContent;

    await userEvent.click(canvas.getByRole("button", { name: "On a schedule" }));
    const item = await body.findByRole("menuitem", { name: "On a schedule" });
    await expect(item).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(item);

    await expect(canvas.getByTestId("form-state")).toHaveTextContent(before!.replace(/\s+/g, " "));
    await expect(canvas.getByRole("combobox", { name: "Schedule weekday" })).toHaveTextContent(
      "Thursday",
    );
  },
};
