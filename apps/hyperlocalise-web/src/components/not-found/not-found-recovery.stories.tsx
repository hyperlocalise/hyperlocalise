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

import { NotFoundRecovery } from "./not-found-recovery";

const meta = {
  title: "App/Recovery/Not found",
  component: NotFoundRecovery,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
  args: {
    statusCode: "404",
    title: "We couldn't find that page",
    description: "The link may be broken, or the page may have moved or been deleted.",
    homeLabel: "Go home",
    dashboardLabel: "Go to dashboard",
    supportLabel: "Contact support",
    homeHref: "/",
    dashboardHref: "/dashboard",
  },
} satisfies Meta<typeof NotFoundRecovery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { level: 1, name: "We couldn't find that page" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Go home" })).toHaveAttribute("href", "/");
    await expect(canvas.getByRole("button", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
