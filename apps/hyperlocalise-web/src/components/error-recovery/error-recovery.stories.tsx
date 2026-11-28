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

import { ErrorRecovery } from "./error-recovery";

const meta = {
  title: "App/Recovery/Error",
  component: ErrorRecovery,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
  args: {
    title: "Something went wrong",
    description:
      "We couldn't load this page. Try again, or head back to your dashboard. Your work is saved.",
    tryAgainLabel: "Try again",
    dashboardLabel: "Go to dashboard",
    supportLabel: "Contact support",
    dashboardHref: "/dashboard",
    retry: fn(),
    fullPage: false,
  },
} satisfies Meta<typeof ErrorRecovery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InPage: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.retry).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("button", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    await expect(canvas.getByRole("button", { name: "Contact support" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:/),
    );
  },
};

export const FullPage: Story = {
  args: { fullPage: true },
};

export const LongCopy: Story = {
  args: {
    title: "We hit an unexpected problem while loading your workspace settings",
    description:
      "The service that stores workspace settings didn't respond in time. Nothing you changed was lost. Try again in a moment, and if this keeps happening, contact support with the time it happened so we can trace it.",
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
