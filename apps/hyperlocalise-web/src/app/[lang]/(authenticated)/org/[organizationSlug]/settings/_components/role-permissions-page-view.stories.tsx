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
import { expect } from "storybook/test";

import { RolePermissionsPageView } from "./role-permissions-page-view";

const meta = {
  title: "App/Members/Role permissions",
  component: RolePermissionsPageView,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/org/acme/members/permissions",
        query: {},
      },
    },
  },
  args: {
    organizationSlug: "acme",
  },
} satisfies Meta<typeof RolePermissionsPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Role permissions" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Members" })).toBeInTheDocument();
    await expect(canvas.getByText("View workspace")).toBeInTheDocument();
    await expect(canvas.getByText("workspace:read")).toBeInTheDocument();
    await expect(canvas.getByText("projects:read")).toBeInTheDocument();
    await expect(canvas.getByText("provider_credentials:write")).toBeInTheDocument();
    await expect(canvas.getByText("billing:write")).toBeInTheDocument();
  },
};
