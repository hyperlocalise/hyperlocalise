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
import { expect, userEvent, waitFor, within } from "storybook/test";

import { createBrazeAutomationRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";

import { ContentEditorBrazePushButton } from "./content-editor-braze-push-button";
import {
  contentEditorBrazePushStoryItems,
  createContentEditorBrazePushMswHandlers,
} from "./content-editor-braze-push-msw-handlers";

const openItemPath = contentEditorBrazePushStoryItems[0]!.sourcePath;

const meta = {
  title: "CAT/Braze push",
  component: ContentEditorBrazePushButton,
  args: {
    organizationSlug: "story",
    projectId: "story",
    canManageAutomations: true,
    sourcePath: openItemPath,
  },
  parameters: {
    layout: "centered",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/org/story/projects/story/files/content-editor",
      },
    },
  },
} satisfies Meta<typeof ContentEditorBrazePushButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenWhenNotEligible: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorBrazePushMswHandlers({
        eligibleLocaleCount: 0,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Push to Braze" })).toBeNull();
  },
};

export const SingleAutomationEnabled: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorBrazePushMswHandlers(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Push to Braze" })).toBeEnabled();
  },
};

export const HiddenWhilePushInProgress: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorBrazePushMswHandlers({
        pushRunInProgress: true,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Push to Braze" })).toBeNull();
  },
};

export const DefaultsToOpenTemplate: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorBrazePushMswHandlers(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Braze" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Braze",
    });
    const dialogCanvas = within(dialog);
    await expect(
      dialogCanvas.getByText(
        "Choose which mapped templates to write as locale-suffixed Braze copies. This does not change the source or publish.",
      ),
    ).toBeVisible();
    await expect(dialogCanvas.getByText("Push policy")).toBeVisible();
    await expect(
      dialogCanvas.getByText("Overwrite Braze copies when the remote copy is newer."),
    ).toBeVisible();
    const openTemplate = await dialogCanvas.findByRole("checkbox", {
      name: /welcome-email/i,
    });
    await expect(openTemplate).toBeChecked();
    await expect(dialogCanvas.getByRole("checkbox", { name: /password-reset/i })).not.toBeChecked();
    await expect(dialogCanvas.getByRole("checkbox", { name: /hero-promo/i })).not.toBeChecked();
    await expect(dialogCanvas.getByRole("button", { name: "Push 1 template" })).toBeEnabled();
  },
};

export const MultipleAutomationsPicker: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorBrazePushMswHandlers({
        extraAutomations: [
          {
            ...createBrazeAutomationRecord(),
            id: "99999999-9999-4999-8999-999999999999",
            name: "EU Braze templates",
            projectId: "story",
          },
        ],
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Braze" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Braze",
    });
    await expect(within(dialog).getByLabelText("Automation")).toBeVisible();
    await expect(within(dialog).getByText("Translate Braze email templates")).toBeVisible();
  },
};

const queuedPushBodies: Array<{ inputSnapshot?: Record<string, unknown> }> = [];

export const ConfirmQueuesSelectedTemplates: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorBrazePushMswHandlers({
        onQueue: (body) => {
          queuedPushBodies.push(body);
        },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    queuedPushBodies.length = 0;
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Braze" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Braze",
    });
    const dialogCanvas = within(dialog);
    await dialogCanvas.findByRole("checkbox", { name: /welcome-email/i });
    await userEvent.click(dialogCanvas.getByRole("checkbox", { name: /password-reset/i }));
    await userEvent.click(dialogCanvas.getByRole("button", { name: "Push 2 templates" }));
    await waitFor(() => {
      void expect(queuedPushBodies[0]?.inputSnapshot).toEqual({
        operation: "push_approved",
        sourcePaths: ["braze/templates/welcome-email.html", "braze/templates/password-reset.html"],
      });
    });
  },
};
