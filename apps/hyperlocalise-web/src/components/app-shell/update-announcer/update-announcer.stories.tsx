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
import {
  GUIDELINE_LAUNCH_YOUTUBE_ID,
  GUIDELINE_LAUNCH_YOUTUBE_WATCH_URL,
  UPDATE_ANNOUNCEMENTS,
  getUpdateAnnouncementStorageKey,
  type UpdateAnnouncement,
} from "./update-announcements";

const guidelinesAnnouncement = UPDATE_ANNOUNCEMENTS.find(
  (announcement) => announcement.id === "2026-11-guidelines-launch",
);

const irisAnnouncement = UPDATE_ANNOUNCEMENTS.find(
  (announcement) => announcement.id === "2026-10-iris-launch",
);

function storyAnnouncements(
  announcement: UpdateAnnouncement | undefined,
  storyId: string,
): UpdateAnnouncement[] {
  if (!announcement) {
    return [];
  }

  return [
    {
      ...announcement,
      id: storyId,
      startsAt: "2000-01-01T00:00:00Z",
      endsAt: undefined,
    },
  ];
}

function AnnouncerFrame({
  storyId,
  announcement,
}: {
  storyId: string;
  announcement: UpdateAnnouncement | undefined;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-end border-b px-6">
        <span className="text-sm text-muted-foreground">Account</span>
      </header>
      <UpdateAnnouncer
        organizationSlug="acme"
        userId={appShellStoryUser.id}
        announcements={storyAnnouncements(announcement, storyId)}
      />
    </div>
  );
}

const meta = {
  title: "App Shell/Update Announcer",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <AnnouncerFrame storyId="storybook-guidelines" announcement={guidelinesAnnouncement} />
  ),
  beforeEach: () => {
    window.localStorage.removeItem(
      getUpdateAnnouncementStorageKey(appShellStoryUser.id, "storybook-guidelines"),
    );
    window.localStorage.removeItem(
      getUpdateAnnouncementStorageKey(appShellStoryUser.id, "storybook-iris"),
    );
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const GuidelinesLaunchTeaser: Story = {
  play: async ({ canvas }) => {
    const watchLink = await canvas.findByRole("link", { name: "Watch the film" });
    await expect(
      canvas.getByRole("heading", { name: "Guidelines: your style guide, finally read" }),
    ).toBeInTheDocument();
    await expect(watchLink).toHaveAttribute("href", GUIDELINE_LAUNCH_YOUTUBE_WATCH_URL);
    await expect(watchLink).toHaveAttribute("target", "_blank");
    const film = await canvas.findByTitle("Guidelines film playing in the announcement card");
    await expect(film.getAttribute("src")).toContain(`embed/${GUIDELINE_LAUNCH_YOUTUBE_ID}`);
    await expect(film.getAttribute("src")).toContain("autoplay=1");
  },
};

export const DismissGuidelinesTeaser: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Not now" }));
    await expect(
      canvas.queryByRole("heading", { name: "Guidelines: your style guide, finally read" }),
    ).not.toBeInTheDocument();
  },
};

export const IrisLaunchTeaser: Story = {
  render: () => <AnnouncerFrame storyId="storybook-iris" announcement={irisAnnouncement} />,
  play: async ({ canvas }) => {
    const watchLink = await canvas.findByRole("link", { name: "Watch the film" });
    await expect(
      canvas.getByRole("heading", { name: "Iris, the AI localisation engine" }),
    ).toBeInTheDocument();
    await expect(watchLink).toHaveAttribute("href", IRIS_LAUNCH_YOUTUBE_WATCH_URL);
    await expect(watchLink).toHaveAttribute("target", "_blank");
  },
};
