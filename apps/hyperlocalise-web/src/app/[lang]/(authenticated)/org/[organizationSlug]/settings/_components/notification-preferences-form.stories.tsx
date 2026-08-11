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
import { expect, fn, userEvent, within } from "storybook/test";

import { NotificationPreferencesForm } from "./notification-preferences-form";

const meta = {
  title: "App/Settings/Notification Preferences",
  component: NotificationPreferencesForm,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl rounded-lg border border-border bg-background p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    onEmailEnabledChange: fn(),
    onEmailFormatChange: fn(),
  },
} satisfies Meta<typeof NotificationPreferencesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmailOff: Story = {
  args: {
    values: {
      emailEnabled: false,
      emailFormat: "digest",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Email notifications")).toBeInTheDocument();
    await expect(canvas.queryByText("Email format")).not.toBeInTheDocument();
  },
};

export const Digest: Story = {
  args: {
    values: {
      emailEnabled: true,
      emailFormat: "digest",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Email format")).toBeInTheDocument();
  },
};

export const Immediate: Story = {
  args: {
    values: {
      emailEnabled: true,
      emailFormat: "immediate",
    },
  },
};

export const Saving: Story = {
  args: {
    values: {
      emailEnabled: true,
      emailFormat: "digest",
    },
    isSaving: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Saving…")).toBeInTheDocument();
    await userEvent.click(canvas.getByLabelText("Email notifications"));
  },
};
