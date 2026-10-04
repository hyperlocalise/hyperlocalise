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

import {
  APP_SHELL_STORY_ORGANIZATION_SLUG,
  APP_SHELL_STORY_PROJECT_ID,
  AppShellHeaderActionDemo,
  AppShellHeaderStoryFrame,
  appShellStoryUser,
} from "./app-shell.stories.fixture";
import { UpdateAnnouncer } from "./update-announcer/update-announcer";
import {
  UPDATE_ANNOUNCEMENTS,
  getUpdateAnnouncementStorageKey,
} from "./update-announcer/update-announcements";

const meta = {
  title: "App Shell/Header",
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${APP_SHELL_STORY_ORGANIZATION_SLUG}/dashboard`,
      },
    },
  },
  render: () => <AppShellHeaderStoryFrame />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DashboardBreadcrumb: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("navigation", { name: "breadcrumb" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Account/i })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  },
};

export const ProjectBreadcrumb: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${APP_SHELL_STORY_ORGANIZATION_SLUG}/projects/${APP_SHELL_STORY_PROJECT_ID}/settings`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Settings")).toBeInTheDocument();
    await expect(canvas.getByText(APP_SHELL_STORY_PROJECT_ID)).toBeInTheDocument();
  },
};

export const WithHeaderAction: Story = {
  render: () => (
    <AppShellHeaderStoryFrame>
      <AppShellHeaderActionDemo />
    </AppShellHeaderStoryFrame>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  },
};

export const LanguageDialog: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Open account menu/i }));
    const body = within(document.body);
    await userEvent.click(await body.findByRole("menuitem", { name: /Language/ }));
    await expect(await body.findByRole("dialog")).toBeInTheDocument();
    await userEvent.type(body.getByRole("searchbox", { name: "Filter languages" }), "deu");
    await expect(body.getByRole("button", { name: /Deutschland/ })).toBeInTheDocument();
    await expect(body.queryByRole("button", { name: /France/ })).not.toBeInTheDocument();
  },
};

export const WithUpdateAnnouncement: Story = {
  render: () => (
    <>
      <AppShellHeaderStoryFrame />
      <UpdateAnnouncer
        organizationSlug={APP_SHELL_STORY_ORGANIZATION_SLUG}
        userId={appShellStoryUser.id}
        announcements={[
          {
            ...UPDATE_ANNOUNCEMENTS[0]!,
            id: "storybook-preview",
            startsAt: "2000-01-01T00:00:00Z",
            endsAt: undefined,
          },
        ]}
      />
    </>
  ),
  beforeEach: () => {
    window.localStorage.removeItem(
      getUpdateAnnouncementStorageKey(appShellStoryUser.id, "storybook-preview"),
    );
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Try it now" })).toBeInTheDocument();
  },
};

export const WithTmsConnect: Story = {
  render: () => <AppShellHeaderStoryFrame showTmsConnect />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Connect Crowdin/i })).toBeInTheDocument();
  },
};

export const AccountMenu: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Account/i }));

    const menu = within(document.body);
    await expect(menu.getByText(appShellStoryUser.email)).toBeInTheDocument();
    await expect(menu.getByRole("menuitem", { name: "Members" })).toBeInTheDocument();
    await expect(menu.getByRole("menuitem", { name: "Billing" })).toBeInTheDocument();
    await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    await expect(menu.getByRole("menuitemradio", { name: "System" })).toBeInTheDocument();
    await expect(menu.getByRole("menuitem", { name: /Language/ })).toBeInTheDocument();
  },
};

export const SwitchWorkspaceMenu: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Account/i }));

    const menu = within(document.body);
    await userEvent.click(menu.getByRole("menuitem", { name: "Switch workspace" }));

    await expect(menu.getByText("Workspaces")).toBeInTheDocument();
    await expect(menu.getByRole("menuitem", { name: "Acme Localization" })).toBeInTheDocument();
    await expect(menu.getByRole("menuitem", { name: "Beta Workspace" })).toBeInTheDocument();
    await expect(menu.getByRole("menuitem", { name: "View all workspaces" })).toBeInTheDocument();
  },
};

export const MemberMenu: Story = {
  render: () => <AppShellHeaderStoryFrame showAdminLinks={false} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Account/i }));

    const menu = within(document.body);
    await expect(menu.getByRole("menuitem", { name: "Account" })).toBeInTheDocument();
    await expect(menu.queryByRole("menuitem", { name: "Members" })).not.toBeInTheDocument();
    await expect(menu.queryByRole("menuitem", { name: "Billing" })).not.toBeInTheDocument();
  },
};
