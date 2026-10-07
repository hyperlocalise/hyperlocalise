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
import { expect, userEvent, within } from "storybook/test";

import { createIntercomAutomationRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";

import { ContentEditorIntercomPushButton } from "./content-editor-intercom-push-button";
import { createContentEditorIntercomPushMswHandlers } from "./content-editor-intercom-push-msw-handlers";

const meta = {
  title: "CAT/Intercom push",
  component: ContentEditorIntercomPushButton,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ContentEditorIntercomPushButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenWhenNotEligible: Story = {
  args: {
    organizationSlug: "story",
    projectId: "story",
    canManageAutomations: true,
  },
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
  args: {
    organizationSlug: "story",
    projectId: "story",
    canManageAutomations: true,
  },
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
  args: {
    organizationSlug: "story",
    projectId: "story",
    canManageAutomations: true,
  },
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

export const MultipleAutomationsMenu: Story = {
  args: {
    organizationSlug: "story",
    projectId: "story",
    canManageAutomations: true,
  },
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
    await expect(
      canvas.getByRole("menuitem", { name: /Translate Intercom Help Center articles/ }),
    ).toBeVisible();
    await expect(canvas.getByRole("menuitem", { name: /EU Help Center sync/ })).toBeVisible();
  },
};
