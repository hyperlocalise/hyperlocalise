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

import { IRIS_LAUNCH_YOUTUBE_WATCH_URL } from "@/lib/iris/iris-waitlist";

import { appShellStoryUser } from "../app-shell.stories.fixture";
import { UpdateAnnouncer } from "./update-announcer";
import { UPDATE_ANNOUNCEMENTS, getUpdateAnnouncementStorageKey } from "./update-announcements";

const irisAnnouncement = UPDATE_ANNOUNCEMENTS.find(
  (announcement) => announcement.id === "2026-10-iris-launch",
);

const meta = {
  title: "App Shell/Update Announcer",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-end border-b px-6">
        <span className="text-sm text-muted-foreground">Account</span>
      </header>
      <UpdateAnnouncer
        organizationSlug="acme"
        userId={appShellStoryUser.id}
        announcements={
          irisAnnouncement
            ? [
                {
                  ...irisAnnouncement,
                  id: "storybook-iris",
                  startsAt: "2000-01-01T00:00:00Z",
                  endsAt: undefined,
                },
              ]
            : []
        }
      />
    </div>
  ),
  beforeEach: () => {
    window.localStorage.removeItem(
      getUpdateAnnouncementStorageKey(appShellStoryUser.id, "storybook-iris"),
    );
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const IrisLaunchTeaser: Story = {
  play: async ({ canvas }) => {
    const watchLink = await canvas.findByRole("link", { name: "Watch the film" });
    await expect(
      canvas.getByRole("heading", { name: "Iris, the AI localisation engine" }),
    ).toBeInTheDocument();
    await expect(watchLink).toHaveAttribute("href", IRIS_LAUNCH_YOUTUBE_WATCH_URL);
    await expect(watchLink).toHaveAttribute("target", "_blank");
  },
};

export const DismissIrisTeaser: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Not now" }));
    await expect(
      canvas.queryByRole("heading", { name: "Iris, the AI localisation engine" }),
    ).not.toBeInTheDocument();
  },
};
