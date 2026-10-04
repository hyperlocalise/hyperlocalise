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
// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { IntlProvider } from "react-intl";

import { UpdateAnnouncer } from "./update-announcer";
import {
  getNextUpdateAnnouncementScheduleAt,
  getUpdateAnnouncementStorageKey,
  selectUpdateAnnouncement,
  type UpdateAnnouncement,
} from "./update-announcements";

const testUserId = "user_test";

const announcement: UpdateAnnouncement = {
  id: "test-announcement",
  title: { id: "test.title", defaultMessage: "Something new" },
  description: { id: "test.description", defaultMessage: "It does a thing." },
  imageSrc: "/images/test.jpg",
  buildHref: (organizationSlug) => `/org/${organizationSlug}/qa`,
  startsAt: "2000-01-01T00:00:00Z",
};

function renderAnnouncer(announcements: UpdateAnnouncement[] = [announcement]) {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <UpdateAnnouncer organizationSlug="acme" userId={testUserId} announcements={announcements} />
    </IntlProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("UpdateAnnouncer", () => {
  it("links to the announced feature", async () => {
    renderAnnouncer();

    expect(await screen.findByRole("heading", { name: "Something new" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try it now" }).getAttribute("href")).toBe(
      "/org/acme/qa",
    );
  });

  it("stays hidden after it is dismissed", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAnnouncer();

    await user.click(await screen.findByRole("button", { name: "Not now" }));

    expect(screen.queryByRole("heading", { name: "Something new" })).toBeNull();
    expect(
      window.localStorage.getItem(getUpdateAnnouncementStorageKey(testUserId, announcement.id)),
    ).not.toBeNull();

    unmount();
    renderAnnouncer();
    expect(screen.queryByRole("heading", { name: "Something new" })).toBeNull();
  });

  it("does not render an announcement outside its window", () => {
    renderAnnouncer([{ ...announcement, startsAt: "2999-01-01T00:00:00Z" }]);

    expect(screen.queryByRole("heading", { name: "Something new" })).toBeNull();
  });

  it("shows the next active announcement after the first is dismissed", async () => {
    const user = userEvent.setup();
    const first = {
      ...announcement,
      id: "first",
      title: { ...announcement.title, defaultMessage: "First" },
    };
    const second = {
      ...announcement,
      id: "second",
      title: { ...announcement.title, defaultMessage: "Second" },
    };

    renderAnnouncer([first, second]);
    await user.click(await screen.findByRole("button", { name: "Not now" }));

    expect(await screen.findByRole("heading", { name: "Second" })).toBeTruthy();
  });

  it("refreshes when an announcement window opens", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-03T23:59:00Z"));

      renderAnnouncer([
        {
          ...announcement,
          startsAt: "2026-10-04T00:00:00Z",
        },
      ]);

      expect(screen.queryByRole("heading", { name: "Something new" })).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });

      expect(screen.getByRole("heading", { name: "Something new" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

beforeEach(() => {
  vi.useRealTimers();
});

describe("selectUpdateAnnouncement", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  const notDismissed = () => false;

  it("respects the start and end times", () => {
    const scheduled = { ...announcement, startsAt: "2026-10-01T00:00:00Z" };

    expect(
      selectUpdateAnnouncement([{ ...scheduled, endsAt: "2026-11-01T00:00:00Z" }], {
        now,
        isDismissed: notDismissed,
      }),
    ).not.toBeNull();
    expect(
      selectUpdateAnnouncement([{ ...scheduled, startsAt: "2026-10-16T00:00:00Z" }], {
        now,
        isDismissed: notDismissed,
      }),
    ).toBeNull();
    expect(
      selectUpdateAnnouncement([{ ...scheduled, endsAt: "2026-10-15T00:00:00Z" }], {
        now,
        isDismissed: notDismissed,
      }),
    ).toBeNull();
  });

  it("falls through to the next active announcement when the first is dismissed", () => {
    const next = { ...announcement, id: "next" };

    expect(
      selectUpdateAnnouncement([announcement, next], {
        now,
        isDismissed: (id) => id === announcement.id,
      })?.id,
    ).toBe("next");
  });
});

describe("getNextUpdateAnnouncementScheduleAt", () => {
  it("returns the nearest future start or end boundary", () => {
    const scheduled = {
      ...announcement,
      startsAt: "2026-10-01T00:00:00Z",
      endsAt: "2026-11-01T00:00:00Z",
    };
    const now = new Date("2026-10-15T00:00:00Z");

    expect(getNextUpdateAnnouncementScheduleAt([scheduled], now)?.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(
      getNextUpdateAnnouncementScheduleAt(
        [{ ...scheduled, startsAt: "2026-10-20T00:00:00Z" }],
        now,
      )?.toISOString(),
    ).toBe("2026-10-20T00:00:00.000Z");
  });
});
