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

import { createIntercomAutomationRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";

import { ContentEditorIntercomPushButton } from "./content-editor-intercom-push-button";
import {
  contentEditorIntercomPushStoryArticles,
  createContentEditorIntercomPushMswHandlers,
} from "./content-editor-intercom-push-msw-handlers";

const openArticlePath = contentEditorIntercomPushStoryArticles[0]!.sourcePath;

const meta = {
  title: "CAT/Intercom push",
  component: ContentEditorIntercomPushButton,
  args: {
    organizationSlug: "story",
    projectId: "story",
    canManageAutomations: true,
    sourcePath: openArticlePath,
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
} satisfies Meta<typeof ContentEditorIntercomPushButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenWhenNotEligible: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorIntercomPushMswHandlers({
        eligibleLocaleCount: 0,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Push to Intercom" })).toBeNull();
  },
};

export const SingleAutomationEnabled: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorIntercomPushMswHandlers(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Push to Intercom" })).toBeEnabled();
  },
};

export const HiddenWhilePushInProgress: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorIntercomPushMswHandlers({
        pushRunInProgress: true,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Push to Intercom" })).toBeNull();
  },
};

export const DefaultsToOpenArticle: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorIntercomPushMswHandlers(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Intercom" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Intercom",
    });
    const dialogCanvas = within(dialog);
    await expect(
      dialogCanvas.getByText(
        "Choose which mapped articles to write as Intercom drafts. This does not publish.",
      ),
    ).toBeVisible();
    await expect(dialogCanvas.getByText("Push policy")).toBeVisible();
    await expect(
      dialogCanvas.getByText(
        "Keep Intercom drafts that teammates edited after the last push. Unchanged approved text is skipped.",
      ),
    ).toBeVisible();
    const openArticle = await dialogCanvas.findByRole("checkbox", {
      name: /reset-your-password/i,
    });
    await expect(openArticle).toBeChecked();
    await expect(
      dialogCanvas.getByRole("checkbox", { name: /getting-started/i }),
    ).not.toBeChecked();
    await expect(dialogCanvas.getByRole("checkbox", { name: /billing/i })).not.toBeChecked();
    await expect(dialogCanvas.getByRole("button", { name: "Push 1 article" })).toBeEnabled();
  },
};

export const MultipleAutomationsPicker: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorIntercomPushMswHandlers({
        extraAutomations: [
          {
            ...createIntercomAutomationRecord(),
            id: "77777777-7777-4777-8777-777777777777",
            name: "EU Help Center sync",
            projectId: "story",
          },
        ],
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Intercom" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Intercom",
    });
    await expect(within(dialog).getByLabelText("Automation")).toBeVisible();
    await expect(within(dialog).getByText("Translate Intercom Help Center articles")).toBeVisible();
  },
};

const queuedPushBodies: Array<{ inputSnapshot?: Record<string, unknown> }> = [];

export const ConfirmQueuesSelectedArticles: Story = {
  parameters: {
    msw: {
      handlers: createContentEditorIntercomPushMswHandlers({
        onQueue: (body) => {
          queuedPushBodies.push(body);
        },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    queuedPushBodies.length = 0;
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Push to Intercom" }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Push to Intercom",
    });
    const dialogCanvas = within(dialog);
    await dialogCanvas.findByRole("checkbox", { name: /reset-your-password/i });
    await userEvent.click(dialogCanvas.getByRole("checkbox", { name: /getting-started/i }));
    await userEvent.click(dialogCanvas.getByRole("button", { name: "Push 2 articles" }));
    await waitFor(() => {
      void expect(queuedPushBodies[0]?.inputSnapshot).toEqual({
        operation: "push_approved",
        sourcePaths: [
          "intercom/customer-support/reset-your-password.md",
          "intercom/customer-support/getting-started.md",
        ],
      });
    });
  },
};
