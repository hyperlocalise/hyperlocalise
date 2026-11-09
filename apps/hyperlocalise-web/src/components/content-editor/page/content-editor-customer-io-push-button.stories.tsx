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

import { createCustomerIoAutomationRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";

import { ContentEditorCustomerIoPushButton } from "./content-editor-customer-io-push-button";
import {
  contentEditorCustomerIoPushStoryItems,
  createContentEditorCustomerIoPushMswHandlers,
} from "./content-editor-customer-io-push-msw-handlers";

const openItemPath = contentEditorCustomerIoPushStoryItems[0]!.sourcePath;

const meta = {
  title: "CAT/Customer.io push",
  component: ContentEditorCustomerIoPushButton,
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
} satisfies Meta<typeof ContentEditorCustomerIoPushButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenWhenFileIsNotCustomerIo: Story = {
  args: {
    sourcePath: "locales/en.json",
  },
  parameters: {
    msw: {
      handlers: createContentEditorCustomerIoPushMswHandlers(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Push to Customer.io" })).toBeNull();
  },
};

export const SingleAutomationEnabled: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorCustomerIoPushMswHandlers(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Push to Customer.io" })).toBeEnabled();
  },
};

export const DisabledWhilePushInProgress: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorCustomerIoPushMswHandlers({
        pushRunInProgress: true,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Push to Customer.io" })).toBeDisabled();
  },
};

export const DefaultsToOpenMessage: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorCustomerIoPushMswHandlers(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Customer.io" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Customer.io",
    });
    const dialogCanvas = within(dialog);
    await expect(
      dialogCanvas.getByText(
        "Choose which mapped messages to update with approved translations. This only writes content — it never sends.",
      ),
    ).toBeVisible();
    await expect(dialogCanvas.getByText("Push policy")).toBeVisible();
    await expect(
      dialogCanvas.getByText("Overwrite Customer.io locales when the remote locale is newer."),
    ).toBeVisible();
    const openMessage = await dialogCanvas.findByRole("checkbox", {
      name: /welcome broadcast/i,
    });
    await expect(openMessage).toBeChecked();
    await expect(dialogCanvas.getByRole("checkbox", { name: /upgrade nudge/i })).not.toBeChecked();
    await expect(dialogCanvas.getByRole("checkbox", { name: /day one push/i })).not.toBeChecked();
    await expect(dialogCanvas.getByRole("button", { name: "Push 1 message" })).toBeEnabled();
  },
};

export const MultipleAutomationsPicker: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorCustomerIoPushMswHandlers({
        extraAutomations: [
          {
            ...createCustomerIoAutomationRecord(),
            id: "99999999-9999-4999-8999-999999999999",
            name: "EU Customer.io messages",
            projectId: "story",
          },
        ],
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Customer.io" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Customer.io",
    });
    await expect(within(dialog).getByLabelText("Automation")).toBeVisible();
    await expect(within(dialog).getByText("Translate Customer.io campaigns")).toBeVisible();
  },
};

const queuedPushBodies: Array<{ inputSnapshot?: Record<string, unknown> }> = [];

export const ConfirmQueuesSelectedMessages: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorCustomerIoPushMswHandlers({
        onQueue: (body) => {
          queuedPushBodies.push(body);
        },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    queuedPushBodies.length = 0;
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Customer.io" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Customer.io",
    });
    const dialogCanvas = within(dialog);
    await dialogCanvas.findByRole("checkbox", { name: /welcome broadcast/i });
    await userEvent.click(dialogCanvas.getByRole("checkbox", { name: /upgrade nudge/i }));
    await userEvent.click(dialogCanvas.getByRole("button", { name: "Push 2 messages" }));
    await waitFor(() => {
      void expect(queuedPushBodies[0]?.inputSnapshot).toEqual({
        operation: "push_approved",
        sourcePaths: [
          "customer-io/broadcasts/1/actions/a1.json",
          "customer-io/broadcasts/1/actions/a2.json",
        ],
      });
    });
  },
};
