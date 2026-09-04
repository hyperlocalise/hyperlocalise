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
import { expect, userEvent } from "storybook/test";

import {
  APP_SHELL_STORY_ORGANIZATION_SLUG,
  APP_SHELL_STORY_PROJECT_ID,
  AppShellSidebarStoryFrame,
} from "./app-shell.stories.fixture";

const meta = {
  title: "App Shell/Sidebar",
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${APP_SHELL_STORY_ORGANIZATION_SLUG}/dashboard`,
      },
    },
  },
  render: () => <AppShellSidebarStoryFrame />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const GlobalNavigation: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Inbox" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Automations" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Projects" })).toBeInTheDocument();
  },
};

export const InboxActive: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${APP_SHELL_STORY_ORGANIZATION_SLUG}/inbox`,
      },
    },
  },
  play: async ({ canvas }) => {
    const inboxLink = canvas.getByRole("link", { name: "Inbox" });
    await expect(inboxLink.querySelector("[data-active]")).toBeTruthy();
  },
};

export const ProjectNavigation: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${APP_SHELL_STORY_ORGANIZATION_SLUG}/projects/${APP_SHELL_STORY_PROJECT_ID}/files`,
      },
    },
  },
  render: () => <AppShellSidebarStoryFrame variant="project" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Website localization")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "All projects" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Files" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Overview" })).toBeInTheDocument();
  },
};

export const Collapsed: Story = {
  render: () => <AppShellSidebarStoryFrame collapsed />,
  play: async () => {
    const sidebar = document.querySelector('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(sidebar).toHaveAttribute("data-collapsible", "icon");
  },
};

export const ToggleCollapse: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Collapse Sidebar" });
    await userEvent.click(trigger);

    const sidebar = document.querySelector('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");

    await userEvent.click(canvas.getByRole("button", { name: "Expand Sidebar" }));
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  },
};
