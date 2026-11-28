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
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type { LeaveWorkspacePreview } from "@/lib/go-svc/go-svc-client.types";

import { LeaveWorkspaceDialog } from "./leave-workspace-dialog";

const LEAVE_PATH = "*/v1/orgs/:organizationSlug/members/leave";

function createPreview(overrides: Partial<LeaveWorkspacePreview> = {}): LeaveWorkspacePreview {
  return {
    blockedReason: null,
    apiKeys: [],
    automations: [],
    apiKeyTotal: 0,
    automationTotal: 0,
    ...overrides,
  };
}

const previewWithImpact = createPreview({
  apiKeys: [
    { name: "CI sync", keyPrefix: "hl_live_4f2a" },
    { name: "Marketing site exporter", keyPrefix: "hl_live_9c1e" },
  ],
  apiKeyTotal: 2,
  automations: [
    { id: "auto_1", name: "Translate new strings on push" },
    { id: "auto_2", name: "Weekly QA report" },
    { id: "auto_3", name: "Notify reviewers on French jobs" },
  ],
  automationTotal: 57,
});

function leaveHandlers({
  preview,
  previewStatus = 200,
  previewError,
  leaveStatus = 500,
  leaveError = "internal_error",
  previewDelayMs = 0,
}: {
  preview?: LeaveWorkspacePreview;
  previewStatus?: number;
  previewError?: string;
  leaveStatus?: number;
  leaveError?: string;
  previewDelayMs?: number | "infinite";
}) {
  return [
    http.get(LEAVE_PATH, async () => {
      if (previewDelayMs) {
        await delay(previewDelayMs);
      }
      if (previewStatus !== 200) {
        return HttpResponse.json(
          { error: previewError ?? "internal_error" },
          { status: previewStatus },
        );
      }
      return HttpResponse.json(preview ?? createPreview());
    }),
    // Stories never succeed at leaving: a real leave would navigate the Storybook frame away.
    http.post(LEAVE_PATH, () => HttpResponse.json({ error: leaveError }, { status: leaveStatus })),
  ];
}

function OpenDialogStory({
  organizationName,
  isOnlyWorkspace,
}: {
  organizationName: string;
  isOnlyWorkspace: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <LeaveWorkspaceDialog
      open={open}
      organizationSlug="acme"
      organizationName={organizationName}
      isOnlyWorkspace={isOnlyWorkspace}
      onClose={() => setOpen(false)}
    />
  );
}

// Waits out the dialog's open animation and the preview request before asserting.
function eventually(assertion: () => Promise<void> | void) {
  return waitFor(assertion, { timeout: 5_000 });
}

function leaveButton() {
  return within(document.body).getByRole("button", { name: "Leave workspace" });
}

const meta = {
  title: "App/Settings/Leave workspace dialog",
  component: OpenDialogStory,
  parameters: { layout: "centered" },
  args: {
    organizationName: "Acme Localization",
    isOnlyWorkspace: false,
  },
} satisfies Meta<typeof OpenDialogStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NothingAffected: Story = {
  parameters: { msw: { handlers: leaveHandlers({}) } },
  play: async () => {
    await eventually(() => expect(leaveButton()).toBeEnabled());
  },
};

export const KeysAndAutomationsStopWorking: Story = {
  parameters: { msw: { handlers: leaveHandlers({ preview: previewWithImpact }) } },
  play: async () => {
    const body = within(document.body);
    await eventually(() => expect(body.getByText("Marketing site exporter")).toBeVisible());
    await expect(body.getByText("Weekly QA report")).toBeVisible();
  },
};

export const OnlyWorkspace: Story = {
  args: { isOnlyWorkspace: true },
  parameters: { msw: { handlers: leaveHandlers({ preview: previewWithImpact }) } },
};

export const Checking: Story = {
  parameters: { msw: { handlers: leaveHandlers({ previewDelayMs: "infinite" }) } },
  play: async () => {
    const body = within(document.body);
    await eventually(() => expect(body.getByRole("status")).toBeInTheDocument());
    await expect(leaveButton()).toBeDisabled();
  },
};

export const LastAdmin: Story = {
  parameters: {
    msw: { handlers: leaveHandlers({ preview: createPreview({ blockedReason: "last_admin" }) }) },
  },
  play: async () => {
    const body = within(document.body);
    await eventually(() => expect(body.getByRole("alert")).toBeInTheDocument());
    await expect(body.queryByRole("button", { name: "Leave workspace" })).not.toBeInTheDocument();
  },
};

export const RefusedAsLastAdminOnLeave: Story = {
  parameters: {
    msw: {
      handlers: leaveHandlers({ leaveStatus: 409, leaveError: "last_admin_protected" }),
    },
  },
  play: async () => {
    const body = within(document.body);
    await eventually(() => expect(leaveButton()).toBeEnabled());
    await eventually(() => expect(getComputedStyle(leaveButton()).pointerEvents).not.toBe("none"));
    await userEvent.click(leaveButton());
    await eventually(() => expect(body.getByRole("alert")).toBeInTheDocument());
    // The Leave button goes away, so focus moves to Cancel.
    await eventually(() => expect(body.getByRole("button", { name: "Cancel" })).toHaveFocus());
  },
};

export const CheckFailed: Story = {
  parameters: { msw: { handlers: leaveHandlers({ previewStatus: 500 }) } },
  play: async () => {
    const body = within(document.body);
    await eventually(() =>
      expect(body.getByRole("button", { name: "Try again" })).toBeInTheDocument(),
    );
    await expect(leaveButton()).toBeDisabled();
  },
};

export const NoLongerMember: Story = {
  parameters: {
    msw: {
      handlers: leaveHandlers({ previewStatus: 403, previewError: "organization_access_denied" }),
    },
  },
  play: async () => {
    const body = within(document.body);
    await eventually(() => expect(body.getByRole("button", { name: "Continue" })).toBeEnabled());
  },
};

export const LeaveFailed: Story = {
  parameters: { msw: { handlers: leaveHandlers({}) } },
  play: async () => {
    const body = within(document.body);
    await eventually(() => expect(leaveButton()).toBeEnabled());
    await eventually(() => expect(getComputedStyle(leaveButton()).pointerEvents).not.toBe("none"));
    await userEvent.click(leaveButton());
    await eventually(() => expect(body.getByRole("alert")).toBeInTheDocument());
    await eventually(() => expect(leaveButton()).toBeEnabled());
  },
};
